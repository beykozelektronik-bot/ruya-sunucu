# Rüya Aile sunucusu

Rüya Aile uygulamasının backend'i: e-posta ile üyelik/giriş, iki telefonu
eşleştirme ve aralarında anlık bildirim (WebSocket).

## Kurulum (Ubuntu)
```
curl -fsSL https://raw.githubusercontent.com/beykozelektronik-bot/ruya-sunucu/main/install.sh | bash
```
Kurulumdan sonra `http://SUNUCU-IP:8080/saglik` adresi "çalışıyor" döndürür.

## Uç noktalar
- `GET  /saglik` — sağlık kontrolü
- `POST /kayit`  `{email, sifre, ad, rol}` → `{token}`
- `POST /giris`  `{email, sifre}` → `{token}`
- `POST /eslestir` `{token, hedefEmail}` → eşleştirir
- `GET  /durum?token=...` → eşleşmeler
- `POST /olay` `{token, tur, mesaj}` → eşleşen telefonlara anlık iletir
- `WS   /ws?token=...` — anlık bağlantı
