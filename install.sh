#!/usr/bin/env bash
# Rüya Aile sunucu kurulumu — tek komutla
set -e
echo "==== Rüya Aile sunucu kurulumu basliyor ===="

# Node ve git (yoksa kur)
if ! command -v node >/dev/null 2>&1; then
  echo "Node kuruluyor..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v git >/dev/null 2>&1 || apt-get install -y git

HEDEF=/opt/ruya-sunucu
if [ -d "$HEDEF/.git" ]; then
  echo "Guncelleniyor..."
  git -C "$HEDEF" pull --ff-only
else
  rm -rf "$HEDEF"
  git clone https://github.com/beykozelektronik-bot/ruya-sunucu "$HEDEF"
fi

cd "$HEDEF"
echo "Kutuphaneler kuruluyor..."
npm install --omit=dev --no-audit --no-fund

# systemd servisi (acilista otomatik baslar, cokerse yeniden baslar)
cat > /etc/systemd/system/ruya-sunucu.service <<SERVICE
[Unit]
Description=Ruya Aile Sunucu
After=network.target

[Service]
ExecStart=/usr/bin/node ${HEDEF}/server.js
WorkingDirectory=${HEDEF}
Environment=PORT=8080
EnvironmentFile=-/etc/ruya-sunucu.env
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable ruya-sunucu >/dev/null 2>&1 || true
systemctl restart ruya-sunucu

# guvenlik duvari acik ise 8080'i ac
if command -v ufw >/dev/null 2>&1; then ufw allow 8080/tcp >/dev/null 2>&1 || true; fi

sleep 2
IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "SUNUCU-IP")
echo
echo "========================================"
echo "   KURULUM TAMAM — sunucu calisiyor"
echo "   Test icin tarayicida ac:"
echo "   http://${IP}:8080/saglik"
echo "========================================"
systemctl --no-pager status ruya-sunucu 2>/dev/null | head -4 || true
