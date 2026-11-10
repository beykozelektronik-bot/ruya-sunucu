# Rüya Aile sunucusu

Rüya Aile uygulamasının backend'i: e-posta ile üyelik/giriş, iki telefonu
eşleştirme ve aralarında anlık bildirim (WebSocket).

## Kurulum (Ubuntu)
```
curl -fsSL https://raw.githubusercontent.com/beykozelektronik-bot/ruya-sunucu/main/install.sh | bash
```
Kurulumdan sonra `http://SUNUCU-IP:8080/saglik` adresi "çalışıyor" döndürür.

## Şifre sıfırlama e-postası (Gmail)
```
bash /opt/ruya-sunucu/mail-ayarla.sh
```
Gmail adresi ve Gmail "Uygulama şifresi" sorar, kaydeder, sunucuyu yeniden başlatır ve deneme e-postası gönderir.

## Uç noktalar
- `GET  /saglik` — sağlık kontrolü
- `POST /kayit`  `{email, sifre, ad, rol}` → `{token}`
- `POST /giris`  `{email, sifre}` → `{token}`
- `POST /eslestir` `{token, hedefEmail}` → eşleştirir
- `GET  /durum?token=...` → eşleşmeler
- `POST /olay` `{token, tur, mesaj}` → eşleşen telefonlara anlık iletir
- `WS   /ws?token=...` — anlık bağlantı
