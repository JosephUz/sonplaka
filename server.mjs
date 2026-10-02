import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { createRooms } from './server/rooms.mjs';

/**
 * Tek süreç, tek port: statik dosyalar (oyun) + WebSocket (odalar, lobi, otoriter maç simülasyonu; bkz. server/rooms.mjs).
 * Cloudflare Tunnel bu sunucuyu sonplaka-sunucu.josephuz.com adında açar; oyun dosyaları Cloudflare'deki statik siteden
 * (sonplaka.josephuz.com, wrangler.jsonc) gelir ve tarayıcı bu adrese bağlanır. Yerelde sayfa da buradan açılır.
 * Proje klasöründeki oyun dosyaları, src/ ve three.js paketi dışında hiçbir dosyaya erişim yok.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(root, 'node_modules', 'three', 'build');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};
/** manifest.webmanifest ve icon.svg: ana ekrana eklenince oyun tam ekran açılır (bkz. index.html). */
const rootFiles = ['index.html', 'style.css', 'game.js', 'manifest.webmanifest', 'icon.svg'];
/** Oyun dosyaları önbelleğe alınmaz: tek bir sürüm vardır ve güncelleme anında geçmelidir. */
const noStore = 'no-store, no-cache, must-revalidate, max-age=0';
/** Sürüm damgası: en yeni oyun dosyasının değişme zamanı; /health ile hangi yapının ayakta olduğu görülür. */
async function buildStamp() {
  let newest = 0;
  const walk = async dir => {
    let list = []; try { list = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) await walk(full);
      else if (/\.(js|mjs|css|html)$/.test(d.name)) { try { newest = Math.max(newest, (await stat(full)).mtimeMs); } catch { /* yok */ } }
    }
  };
  for (const f of [...rootFiles, 'server.mjs']) { try { newest = Math.max(newest, (await stat(path.join(root, f))).mtimeMs); } catch { /* yok */ } }
  await walk(path.join(root, 'src'));
  return new Date(newest).toISOString();
}
let stamp = 'bilinmiyor';

function resolveFile(pathname) {
  if (pathname === '/') pathname = '/index.html';
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return null;
  if (rel.startsWith('vendor' + path.sep) || rel.startsWith('vendor/')) {
    const file = path.join(vendorDir, path.basename(rel));
    return file.startsWith(vendorDir) ? file : null;
  }
  const top = rel.split(/[\\/]/)[0];
  if (top === rel && !rootFiles.includes(rel)) return null;
  if (top !== rel && top !== 'src') return null;
  return path.join(root, rel);
}

const port = Number(process.env.PORT || 5187);
const host = process.env.HOST || '127.0.0.1';
const address = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
/**
 * Çevrim içi sayısı: çok oyunculu açık sekmeler WebSocket bağlantısıyla sayılır (rooms.mjs). Çok oyunculusu kapalı
 * sekmeler (Android uygulaması) `POST /presence?id=<sekme>` ile PRESENCE.beat saniyede bir haber verir, kapanırken
 * `bye=1` gönderir. Son PRESENCE.ttl saniyede haber veren sekmeler /health → online alanında sayılır (josephuz.com
 * bu sayıyı gösterir). Kimlik rastgele sekme kimliğidir; başka bilgi tutulmaz. Android uygulaması oyunu kendi içinden
 * (https://localhost) açtığı için /presence her kökene açıktır (CORS); yanıt gövdesizdir, başka uç açılmaz.
 */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const PRESENCE = { ttl: 45, max: 5000 };
const presence = new Map();
const onlineCount = () => {
  const cutoff = Date.now() - PRESENCE.ttl * 1000;
  for (const [id, at] of presence) if (at < cutoff) presence.delete(id);
  return presence.size;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, address);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': noStore });
    res.end(JSON.stringify({ oyun: 'Son Plaka', ...rooms.stats(), surum: stamp })); return;
  }
  if (url.pathname === '/presence' && req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (url.pathname === '/presence' && req.method === 'POST') {
    const id = url.searchParams.get('id') || '';
    if (/^[a-z0-9]{8,32}$/.test(id)) {
      if (url.searchParams.has('bye')) presence.delete(id);
      else if (presence.has(id) || presence.size < PRESENCE.max) presence.set(id, Date.now());
    }
    req.resume();
    res.writeHead(204, { 'Cache-Control': noStore, ...CORS }); res.end(); return;
  }
  const file = resolveFile(url.pathname);
  const type = file && types[path.extname(file).toLowerCase()];
  if (!file || !type || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': noStore });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(file.startsWith(vendorDir) ? 500 : 404);
    res.end(file.startsWith(vendorDir) ? 'three.js bulunamadi. Once npm install calistirin.' : 'Not found');
  }
});

const rooms = createRooms({ log: (...a) => console.log(new Date().toLocaleTimeString('tr-TR'), ...a), presence: onlineCount });
/**
 * WebSocket yalnız bilinen sayfalardan: aynı adres (yerelde, aynı ağda), *.josephuz.com (Cloudflare'deki statik site) ve
 * localhost. Origin'siz istemciler (testler, araçlar) kabul edilir.
 */
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { const u = new URL(origin); return u.host === req.headers.host || u.hostname === 'josephuz.com' || u.hostname.endsWith('.josephuz.com') || u.hostname === 'localhost'; } catch { return false; }
}
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024, verifyClient: ({ req }) => allowedOrigin(req) });
wss.on('connection', ws => rooms.attach(ws));

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `${port} portu kullanimda. Baska port icin PORT ortam degiskenini ayarlayin.` : error);
  process.exit(1);
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(sig + ': kapaniyor.'); rooms.close(); wss.close(); server.close(); process.exit(0); });
buildStamp().then(s => { stamp = s; });
server.listen(port, host, () => {
  console.log(`Son Plaka: ${address} (dinlenen: ${host}:${port})\nDurdurmak icin Ctrl+C.`);
  if (process.argv.includes('--open')) {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${address}'`], { windowsHide: true, stdio: 'ignore' });
    child.on('error', console.error);
  }
});
