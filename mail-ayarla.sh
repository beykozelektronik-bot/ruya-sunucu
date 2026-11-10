#!/usr/bin/env bash
# Rüya Aile — şifre sıfırlama e-postası ayarı (Gmail)
# Kullanım (sunucuda): bash /opt/ruya-sunucu/mail-ayarla.sh
set -e
AYAR=/etc/ruya-sunucu.env
SERVIS=/etc/systemd/system/ruya-sunucu.service

echo "==== Rüya Aile e-posta ayarı ===="
echo "Gmail adresi ve Gmail 'Uygulama şifresi' gerekir (normal Gmail şifresi ÇALIŞMAZ)."
echo "Uygulama şifresi: https://myaccount.google.com/apppasswords"
echo
read -rp "Gmail adresi: " GMAIL < /dev/tty
read -rsp "Uygulama şifresi (16 harf, yazarken görünmez): " SIFRE < /dev/tty; echo
SIFRE=$(echo "$SIFRE" | tr -d ' ')

cat > "$AYAR" <<AYARLAR
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=$GMAIL
SMTP_PASS=$SIFRE
SMTP_FROM="Rüya Aile <$GMAIL>"
AYARLAR
chmod 600 "$AYAR"

# servis dosyasi eskiyse ayar dosyasini okumasini sagla
if [ -f "$SERVIS" ] && ! grep -q "EnvironmentFile" "$SERVIS"; then
  sed -i 's|^Environment=PORT=8080|Environment=PORT=8080\nEnvironmentFile=-/etc/ruya-sunucu.env|' "$SERVIS"
fi
systemctl daemon-reload
systemctl restart ruya-sunucu
sleep 2

echo
echo "Deneme e-postası gönderiliyor ($GMAIL adresine)..."
cd /opt/ruya-sunucu
if set -a && . "$AYAR" && set +a && node -e '
const n=require("nodemailer");
n.createTransport({host:process.env.SMTP_HOST,port:465,secure:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}})
 .sendMail({from:process.env.SMTP_FROM,to:process.env.SMTP_USER,subject:"Rüya Aile e-posta testi",text:"E-posta ayarı çalışıyor."})
 .then(()=>{console.log("OK");process.exit(0)}).catch(e=>{console.error("HATA: "+e.message);process.exit(1)})'; then
  echo "========================================"
  echo "  TAMAM — e-posta çalışıyor. Gelen kutunuza bakın."
  echo "========================================"
else
  echo "========================================"
  echo "  E-posta gönderilemedi. Yukarıdaki HATA satırını Claude'a gönderin."
  echo "========================================"
fi
