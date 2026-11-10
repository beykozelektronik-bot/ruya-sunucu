// Rüya Aile sunucusu — 1. aşama
// E-posta ile üyelik/giriş, telefonları eşleştirme, aralarında anlık bildirim (WebSocket).
// Ek kütüphane gömülü değil; sadece express + ws kullanır (ikisi de saf JS).

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });

// ---- basit dosya tabanlı saklama ----
function oku(ad, varsayilan) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, ad), 'utf8')); }
  catch { return varsayilan; }
}
function yaz(ad, veri) {
  fs.writeFileSync(path.join(DATA, ad), JSON.stringify(veri, null, 2));
}

let kullanicilar = oku('kullanicilar.json', {});  // email -> {email, ad, rol, salt, hash}
let eslesmeler  = oku('eslesmeler.json', {});     // email -> [email, ...]
let ayarlar     = oku('ayarlar.json', {});        // yasli email -> {kisiler, ilaclar, hareketsizlik, dusmeHassasiyet}
// Token'lar diske yazilir ki sunucu yeniden baslayinca kullanici tekrar giris yapmasin
const tokenlar  = new Map(Object.entries(oku('tokenlar.json', {}))); // token -> email
const soketler  = new Map();                      // email -> ws
function tokenKaydet() { yaz('tokenlar.json', Object.fromEntries(tokenlar)); }

const norm = e => String(e || '').trim().toLowerCase();
const sifreHash = (sifre, salt) => crypto.scryptSync(sifre, salt, 32).toString('hex');
const yeniToken = () => crypto.randomBytes(24).toString('hex');

function emailBul(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '')
    || (req.body && req.body.token) || (req.query && req.query.token);
  return tokenlar.get(t);
}

const app = express();
app.use(express.json({ limit: '3mb' }));  // kamera karesi (base64) icin

// ---- Kamera: yasli en son kareyi yukler, aile ceker ----
const kameralar = new Map();  // email -> { resim(base64), zaman }

// Yasli kare yukler
app.post('/kamera', (req, res) => {
  const email = emailBul(req);
  if (!email) return res.status(401).json({ hata: 'Giriş gerekli' });
  const resim = String(req.body.resim || '');
  if (!resim) return res.status(400).json({ hata: 'Boş kare' });
  kameralar.set(email, { resim, zaman: Date.now() });
  res.json({ ok: true });
});

// Aile en son kareyi ceker (hedef = yaslinin e-postasi)
app.get('/kamera', (req, res) => {
  const email = emailBul(req);
  if (!email) return res.status(401).json({ hata: 'Giriş gerekli' });
  const hedef = norm(req.query.hedef);
  const esli = (eslesmeler[email] || []).includes(hedef);
  if (!esli) return res.status(403).json({ hata: 'Bu kişiyle eşleşmemişsin' });
  const k = kameralar.get(hedef);
  if (!k) return res.json({ ok: true, resim: null });
  res.json({ ok: true, resim: k.resim, zaman: k.zaman });
});

// Sağlık kontrolü — tarayıcıdan açınca çalıştığını görürsün
app.get('/saglik', (req, res) => {
  res.json({
    ok: true,
    mesaj: 'Rüya Aile sunucusu çalışıyor',
    surum: 4,
    kullanici: Object.keys(kullanicilar).length,
    zaman: new Date().toISOString()
  });
});

// Üyelik
app.post('/kayit', (req, res) => {
  const email = norm(req.body.email);
  const sifre = String(req.body.sifre || '');
  const ad = String(req.body.ad || '').trim();
  const rol = ['yasli', 'aile'].includes(req.body.rol) ? req.body.rol : 'aile';
  if (!email || sifre.length < 4) return res.status(400).json({ hata: 'E-posta ve en az 4 haneli şifre gerekli' });
  if (kullanicilar[email]) return res.status(409).json({ hata: 'Bu e-posta zaten kayıtlı' });
  const salt = crypto.randomBytes(16).toString('hex');
  kullanicilar[email] = { email, ad, rol, salt, hash: sifreHash(sifre, salt), kayit: Date.now() };
  yaz('kullanicilar.json', kullanicilar);
  const token = yeniToken(); tokenlar.set(token, email); tokenKaydet();
  res.json({ token, email, ad, rol });
});

// Giriş
app.post('/giris', (req, res) => {
  const email = norm(req.body.email);
  const sifre = String(req.body.sifre || '');
  const u = kullanicilar[email];
  if (!u || u.hash !== sifreHash(sifre, u.salt)) return res.status(401).json({ hata: 'E-posta veya şifre yanlış' });
  const token = yeniToken(); tokenlar.set(token, email); tokenKaydet();
  res.json({ token, email: u.email, ad: u.ad, rol: u.rol });
});

// ---- Şifre sıfırlama (e-postaya kod) ----
const sifreKodlari = new Map();  // email -> { kod, sonGecerli }

// SMTP ayarliysa mail gonderir (ayar: bash /opt/ruya-sunucu/mail-ayarla.sh)
async function mailGonder(email, kod) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return false;
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({
      host: SMTP_HOST, port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false }  // hosting e-posta sunucularinda sertifika adi farkli olabiliyor
    });
    await t.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: email,
      subject: 'Rüya Aile şifre sıfırlama kodu',
      text: `Şifre sıfırlama kodunuz: ${kod}\n\nBu kod 15 dakika geçerlidir. İsteği siz yapmadıysanız bu e-postayı yok sayın.`
    });
    return true;
  } catch (e) { console.error('mail hatasi', e.message); return false; }
}

app.post('/sifre-kod', async (req, res) => {
  const email = norm(req.body.email);
  if (!kullanicilar[email]) return res.status(404).json({ hata: 'Bu e-postayla kayıtlı kullanıcı yok' });
  const kod = String(Math.floor(100000 + Math.random() * 900000));
  sifreKodlari.set(email, { kod, sonGecerli: Date.now() + 15 * 60 * 1000 });
  const gonderildi = await mailGonder(email, kod);
  if (gonderildi) return res.json({ ok: true, gonderildi: true });
  // GUVENLIK: kod asla uygulamaya geri donmez (yoksa e-postayi bilen herkes sifreyi degistirebilirdi)
  sifreKodlari.delete(email);
  res.status(503).json({ hata: 'Şu an e-posta gönderilemiyor. Lütfen daha sonra tekrar deneyin ya da bize WhatsApp\'tan ulaşın.' });
});

app.post('/sifre-sifirla', (req, res) => {
  const email = norm(req.body.email);
  const kod = String(req.body.kod || '').trim();
  const yeni = String(req.body.yeniSifre || '');
  const kayit = sifreKodlari.get(email);
  const u = kullanicilar[email];
  if (!u || !kayit) return res.status(400).json({ hata: 'Önce kod isteyin' });
  if (Date.now() > kayit.sonGecerli) { sifreKodlari.delete(email); return res.status(400).json({ hata: 'Kodun süresi doldu' }); }
  if (kayit.kod !== kod) return res.status(400).json({ hata: 'Kod yanlış' });
  if (yeni.length < 4) return res.status(400).json({ hata: 'Şifre en az 4 hane olmalı' });
  const salt = crypto.randomBytes(16).toString('hex');
  u.salt = salt; u.hash = sifreHash(yeni, salt);
  yaz('kullanicilar.json', kullanicilar);
  sifreKodlari.delete(email);
  const token = yeniToken(); tokenlar.set(token, email); tokenKaydet();
  res.json({ token, email: u.email, ad: u.ad, rol: u.rol });
});

// Eşleştir — karşı tarafın e-postasını girerek bağlan
app.post('/eslestir', (req, res) => {
  const email = emailBul(req);
  if (!email) return res.status(401).json({ hata: 'Giriş gerekli' });
  const hedef = norm(req.body.hedefEmail);
  if (!hedef || !kullanicilar[hedef]) return res.status(404).json({ hata: 'Bu e-postayla kayıtlı kullanıcı yok' });
  if (hedef === email) return res.status(400).json({ hata: 'Kendinle eşleşemezsin' });
  eslesmeler[email] = Array.from(new Set([...(eslesmeler[email] || []), hedef]));
  eslesmeler[hedef] = Array.from(new Set([...(eslesmeler[hedef] || []), email]));
  yaz('eslesmeler.json', eslesmeler);
  res.json({ ok: true, eslesmeler: eslesmeler[email] });
});

// Eşleşmeyi kaldır (iki taraftan da)
app.post('/eslesme-sil', (req, res) => {
  const email = emailBul(req);
  if (!email) return res.status(401).json({ hata: 'Giriş gerekli' });
  const hedef = norm(req.body.hedefEmail);
  eslesmeler[email] = (eslesmeler[email] || []).filter(e => e !== hedef);
  eslesmeler[hedef] = (eslesmeler[hedef] || []).filter(e => e !== email);
  yaz('eslesmeler.json', eslesmeler);
  res.json({ ok: true, eslesmeler: eslesmeler[email] });
});

// Durum — kiminle eşleşmiş
app.get('/durum', (req, res) => {
  const email = emailBul(req);
  if (!email) return res.status(401).json({ hata: 'Giriş gerekli' });
  const u = kullanicilar[email];
  const liste = eslesmeler[email] || [];
  const kisiler = liste.map(e => ({ email: e, ad: (kullanicilar[e] || {}).ad || e, cevrimici: soketler.has(e) }));
  res.json({ email, ad: u.ad, rol: u.rol, eslesmeler: liste, kisiler, cevrimici: [...soketler.keys()] });
});

// Olay gönder — eşleşmiş telefonlara anlık iletir (düşme, test, konum vb.)
app.post('/olay', (req, res) => {
  const email = emailBul(req);
  if (!email) return res.status(401).json({ hata: 'Giriş gerekli' });
  const olay = {
    kimden: email,
    gonderenAd: (kullanicilar[email] || {}).ad || email,
    tur: String(req.body.tur || 'bilgi'),
    mesaj: String(req.body.mesaj || ''),
    ekstra: req.body.ekstra || null,
    zaman: Date.now()
  };
  const hedefler = eslesmeler[email] || [];
  // Aileden gelen ayarlar sunucuda da saklanir: yasli o an cevrimdisiysa baglaninca alir
  if (olay.tur === 'ayar' && olay.ekstra && typeof olay.ekstra === 'object') {
    for (const h of hedefler) ayarlar[h] = { ...(ayarlar[h] || {}), ...olay.ekstra };
    yaz('ayarlar.json', ayarlar);
  }
  let iletilen = 0;
  for (const h of hedefler) {
    const s = soketler.get(h);
    if (s && s.readyState === 1) { s.send(JSON.stringify(olay)); iletilen++; }
  }
  res.json({ ok: true, iletilen, hedefSayisi: hedefler.length });
});

// ---- WebSocket: anlık bağlantı ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ---- Bağlantı kopması: yaşlının telefonu internetten düşerse aileye haber ----
const KOPMA_BEKLE_MS = Number(process.env.KOPMA_BEKLE_MS || 45 * 1000);     // kisa kopmalarda (asansor vb.) alarm verme
const kopmaZamanlayici = new Map();   // email -> timeout
const kopukBildirildi = new Set();    // aileye "koptu" denmis yaslilar

function aileyeGonder(email, tur, mesaj) {
  const olay = { kimden: email, gonderenAd: (kullanicilar[email] || {}).ad || email,
                 tur, mesaj, ekstra: null, zaman: Date.now() };
  for (const h of (eslesmeler[email] || [])) {
    const s = soketler.get(h);
    if (s && s.readyState === 1) { try { s.send(JSON.stringify(olay)); } catch { } }
  }
}
const wsRol = new Map();             // email -> uygulamanin bildirdigi rol
const yasliMi = email => (wsRol.get(email) || (kullanicilar[email] || {}).rol) === 'yasli';

wss.on('connection', (ws, req) => {
  let email;
  try { email = tokenlar.get(new URL(req.url, 'http://x').searchParams.get('token')); } catch { }
  if (!email) { try { ws.close(); } catch { } return; }
  try { const r = new URL(req.url, 'http://x').searchParams.get('rol'); if (r) wsRol.set(email, r); } catch { }
  const eski = soketler.get(email);
  soketler.set(email, ws);
  if (eski && eski !== ws) { try { eski.terminate(); } catch { } }
  ws.canli = true;
  ws.on('pong', () => { ws.canli = true; });
  ws.send(JSON.stringify({ tur: 'bagli', mesaj: 'Sunucuya bağlandın', zaman: Date.now() }));
  if (ayarlar[email]) ws.send(JSON.stringify({ tur: 'ayar', mesaj: '', ekstra: ayarlar[email], zaman: Date.now() }));

  // geri geldi: bekleyen alarmi iptal et; aileye "koptu" denmisse "geri geldi" de
  clearTimeout(kopmaZamanlayici.get(email)); kopmaZamanlayici.delete(email);
  if (kopukBildirildi.delete(email)) {
    const ad = (kullanicilar[email] || {}).ad || email;
    aileyeGonder(email, 'baglantiGeldi', `${ad} telefonunun internet bağlantısı geri geldi.`);
  }

  ws.on('close', () => {
    if (soketler.get(email) !== ws) return;   // yeni baglanti zaten var
    soketler.delete(email);
    if (!yasliMi(email)) return;
    clearTimeout(kopmaZamanlayici.get(email));
    kopmaZamanlayici.set(email, setTimeout(() => {
      kopmaZamanlayici.delete(email);
      if (soketler.has(email)) return;
      kopukBildirildi.add(email);
      const ad = (kullanicilar[email] || {}).ad || email;
      aileyeGonder(email, 'sinyal',
        `${ad} telefonunun internet bağlantısı koptu (Wi-Fi/mobil veri kapalı, çekmiyor ya da telefon kapandı). Lütfen kontrol edin.`);
    }, KOPMA_BEKLE_MS));
  });
  ws.on('error', () => { });
});

// Bağlantıları canlı tut: 15 sn'de bir ping; cevap vermeyeni kopmuş say
// (Wi-Fi kapaninca telefon "kapattim" diyemez, bunu ancak boyle anlariz)
setInterval(() => {
  for (const s of wss.clients) {
    if (s.canli === false) { try { s.terminate(); } catch { } continue; }
    s.canli = false;
    try { s.ping(); } catch { }
  }
}, 15000);

server.listen(PORT, () => console.log('Rüya Aile sunucusu çalışıyor, port ' + PORT));
