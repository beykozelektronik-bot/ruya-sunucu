#!/usr/bin/env bash
# Rüya Aile — şifre sıfırlama e-postası ayarı
# Gmail ya da kendi alan adınızdaki e-posta (örn. info@siteniz.com.tr) ile çalışır.
# Kullanım (sunucuda): bash /opt/ruya-sunucu/mail-ayarla.sh
set -e
AYAR=/etc/ruya-sunucu.env
SERVIS=/etc/systemd/system/ruya-sunucu.service

echo "==== Rüya Aile e-posta ayarı ===="
while true; do
  read -rp "Gönderen e-posta adresi: " ADRES < /dev/tty
  # bosluk ve gorunmez/bozuk karakterleri temizle (Turkce klavye kazalari)
  ADRES=$(printf '%s' "$ADRES" | LC_ALL=C tr -cd 'A-Za-z0-9@._+-')
  if echo "$ADRES" | grep -Eq '^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
    echo "Adres: $ADRES"; break
  fi
  echo "Bu adres geçersiz görünüyor, tekrar yazın."
done
ALAN=${ADRES##*@}

if [ "$ALAN" = "gmail.com" ]; then
  HOST=smtp.gmail.com; PORT=465
  echo "Gmail: normal şifre ÇALIŞMAZ, 16 harflik 'Uygulama şifresi' gerekir:"
  echo "https://myaccount.google.com/apppasswords"
else
  echo
  echo "Kendi alan adınızdaki e-posta. Bu e-postanın NORMAL şifresi kullanılır."
  echo "Giden posta (SMTP) sunucusu genelde mail.$ALAN olur (hosting panelinizde yazar)."
  read -rp "Giden posta sunucusu [mail.$ALAN]: " HOST < /dev/tty
  HOST=${HOST:-mail.$ALAN}
  read -rp "Port [465]: " PORT < /dev/tty
  PORT=${PORT:-465}
fi
read -rsp "Şifre (yazarken görünmez): " SIFRE < /dev/tty; echo
[ "$ALAN" = "gmail.com" ] && SIFRE=$(echo "$SIFRE" | tr -d ' ')

cat > "$AYAR" <<AYARLAR
SMTP_HOST=$HOST
SMTP_PORT=$PORT
SMTP_USER=$ADRES
SMTP_PASS='$SIFRE'
SMTP_FROM="Rüya Aile <$ADRES>"
AYARLAR
chmod 600 "$AYAR"

if [ -f "$SERVIS" ] && ! grep -q "EnvironmentFile" "$SERVIS"; then
  sed -i 's|^Environment=PORT=8080|Environment=PORT=8080\nEnvironmentFile=-/etc/ruya-sunucu.env|' "$SERVIS"
fi
systemctl daemon-reload
systemctl restart ruya-sunucu
sleep 2

echo
echo "Deneme e-postası gönderiliyor ($ADRES adresine, $HOST:$PORT üzerinden)..."
cd /opt/ruya-sunucu
if set -a && . "$AYAR" && set +a && node -e '
const n=require("nodemailer"); const p=Number(process.env.SMTP_PORT||465);
n.createTransport({host:process.env.SMTP_HOST,port:p,secure:p===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},tls:{rejectUnauthorized:false}})
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
