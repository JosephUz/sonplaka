// STANDART üst araç çubuğu ve duraklatma (Esc) menüsü — bütün JosephUz oyunlarında aynı olmalı:
//   çubuk: `← josephuz.com` · `Ses: açık/kapalı` · `Müzik: açık/kapalı` · `Kontroller F1` (oyuna özgü düğmeler sonra)
//   menü:  `DEVAM ET →` · `Kontroller F1` · `Ses: …` · `Müzik: …` (+ ses sürgüsü) · `Yeniden başlat` · `Ana menü` · `josephuz.com'a dön`
// Sıranın ve yazıların HTML'de doğru olduğunu tests/muzik.test.mjs denetler; buradaki ölçü **yerleşim**: dar yatay
// telefonda (667x375), geniş yatay telefonda (844x390) ve dikeyde (390x844) çubuk tek satırda kalıyor, ekrandan
// taşmıyor ve oyun adının üstüne binmiyor mu; maçta hangi simgeler kalıyor; duraklatma menüsünün son düğmesi
// kaydırmadan görünüyor mu. Ekran görüntüleri artifacts/standart-cubuk-*.png.
//
// Kendi kendine yeter: GAME_URL verilmezse oyun sunucusunu boş bir portta kendisi açar, Playwright'ı bu depoda ve
// komşu depolarda arar, bitince sunucuyu kapatır.
//   node tests/standart-cubuk.mjs
//   GAME_URL=http://localhost:5187 PLAYWRIGHT_MODULE=file:///C:/.../playwright/index.mjs node tests/standart-cubuk.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Dar yatay telefon (iPhone SE / 8, yatay): üst çubuğun en sıkıştığı ölçü. Çubuk burada yer bulursa her yerde bulur. */
const DAR = { width: 667, height: 375 };
const GENIS = { width: 844, height: 390 };
const DIKEY = { width: 390, height: 844 };

/** İşletim sisteminin verdiği boş bir port: sabit port başka bir sunucuda açık olabilir. */
const bosPort = () => new Promise((çöz, hata) => {
  const s = createServer();
  s.on('error', hata);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => çöz(port)); });
});

/** Playwright'ın indirdiği tarayıcıların durabileceği klasörler (Git Bash altında LOCALAPPDATA tanımsız gelebiliyor). */
function tarayiciKlasorleri() {
  const adaylar = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) adaylar.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  for (const e of [process.env.LOCALAPPDATA, process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local'),
    process.env.HOME && path.join(process.env.HOME, 'AppData', 'Local')].filter(Boolean)) adaylar.push(path.join(e, 'ms-playwright'));
  if (process.env.HOME) adaylar.push(path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright'), path.join(process.env.HOME, '.cache', 'ms-playwright'));
  return adaylar;
}

/** Bu Playwright kurulumunun istediği Chromium yapısı inmiş mi (inmemişse test açılışta düşer)? */
function tarayicisiVar(kurulum) {
  try {
    const liste = JSON.parse(readFileSync(path.join(kurulum, '..', 'playwright-core', 'browsers.json'), 'utf8'));
    const chromium = liste.browsers.find(b => b.name === 'chromium');
    return Boolean(chromium) && tarayiciKlasorleri().some(k => existsSync(path.join(k, `chromium-${chromium.revision}`)));
  } catch { return false; }
}

const kurulumDene = klasor => {
  const kurulum = path.join(klasor, 'node_modules', 'playwright'), giris = path.join(kurulum, 'index.mjs');
  return existsSync(giris) && tarayicisiVar(kurulum) ? pathToFileURL(giris).href : null;
};

/**
 * Kullanılacak Playwright modülünün adresi. Bu depodan sonra üst klasörlere ve oradaki kardeş depolara bakılır: dal
 * çalışma kopyaları `C:/ju/_duzeltme/JOS-xxx` altında durduğu için bir değil iki kademe yukarı çıkmak gerekir.
 */
async function playwrightBul() {
  if (process.env.PLAYWRIGHT_MODULE) return process.env.PLAYWRIGHT_MODULE;
  const burada = kurulumDene(root);
  if (burada) return burada;
  let klasor = root;
  for (let kademe = 0; kademe < 3; kademe++) {
    const ust = path.dirname(klasor);
    if (ust === klasor) break;
    klasor = ust;
    const ustte = kurulumDene(klasor);
    if (ustte) return ustte;
    let komsular = [];
    try { komsular = readdirSync(klasor, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { continue; }
    for (const ad of komsular) {
      const bulundu = kurulumDene(path.join(klasor, ad));
      if (bulundu) return bulundu;
    }
  }
  return null;
}

/** Sunucu ayağa kalkana kadar bekler. */
async function sunucuyuBekle(adres, sure = 20000) {
  const bitis = Date.now() + sure;
  while (Date.now() < bitis) {
    try { if ((await fetch(adres + '/health')).ok) return true; } catch { /* henüz açılmadı */ }
    await new Promise(b => setTimeout(b, 150));
  }
  return false;
}

const playwrightYolu = await playwrightBul();
if (!playwrightYolu) {
  console.error('Playwright bulunamadı (bu depoda ve komşu depolarda tarayıcısı inmiş kurulum yok).');
  console.error('Çözüm: PLAYWRIGHT_MODULE ortam değişkenine kurulu bir playwright/index.mjs file:// adresini ver,');
  console.error('ya da `npm i -D playwright && npx playwright install chromium` çalıştır.');
  process.exit(1);
}
const { chromium } = await import(playwrightYolu);

let sunucu = null, url = process.env.GAME_URL?.replace(/\/$/, '');
if (!url) {
  const port = await bosPort();
  url = `http://127.0.0.1:${port}`;
  sunucu = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  if (!await sunucuyuBekle(url)) { sunucu.kill(); console.error(`Oyun sunucusu ${url} adresinde açılmadı.`); process.exit(1); }
}

await mkdir('artifacts', { recursive: true });
// Donanım GL yoksa SWIFTSHADER=1 ile yazılım çizimi; sahne bu testte ölçülmüyor, yalnız arayüz kutuları sayılıyor.
const gl = process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', ...gl] });

/** İki kutu kesişiyor mu (üst üste binme). */
const binisiyor = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** Sayfadan bir elemanın kutusu ve görünürlüğü. */
const OLC = `sec => { const n = document.querySelector(sec); if (!n) return null;
  const r = n.getBoundingClientRect(), s = getComputedStyle(n);
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
    gorunur: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 }; }`;
/** Çubuktaki görünür düğmelerin kimlikleri, soldan sağa. */
const CUBUK_SIRA = `() => [...document.querySelectorAll('.header-actions > *')]
  .filter(n => getComputedStyle(n).display !== 'none' && !n.hidden && n.getBoundingClientRect().width > 0)
  .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(n => n.id)`;
/** Çubuk kaç satıra yayıldı (standart çubuk tek satır olmalı)? */
const CUBUK_SATIR = `() => new Set([...document.querySelectorAll('.header-actions > *')]
  .filter(n => n.getBoundingClientRect().width > 0).map(n => Math.round(n.getBoundingClientRect().top))).size`;

const olcum = [];
try {
  // 1) Giriş ekranı, üç ekran ölçüsü: standart dörtlü başta, tek satır, ekranın içinde, logoya binmiyor.
  for (const [ad, ekran] of [['dar', DAR], ['genis', GENIS], ['dikey', DIKEY]]) {
    const context = await browser.newContext({ viewport: ekran, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage(), hatalar = [];
    page.on('pageerror', e => hatalar.push(e.message));
    page.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
    await page.goto(url + '/?test=1');
    await page.waitForFunction(() => !!window.__sonPlaka);
    await page.waitForTimeout(600);
    // Dikey tutuşta oyun "Telefonu yan çevir" perdesini gösterir; çubuk arkasında durur, ölçülebilsin diye perde
    // yalnız bu testte gizlenir (oyun kuralları değişmez).
    if (ad === 'dikey') await page.addStyleTag({ content: '#sp-rotate{display:none!important}' });
    const olc = sec => page.evaluate(`(${OLC})(${JSON.stringify(sec)})`);
    const cubuk = await olc('.header-actions'), logo = await olc('.logo');
    const sira = await page.evaluate(`(${CUBUK_SIRA})()`), satir = await page.evaluate(`(${CUBUK_SATIR})()`);
    await page.screenshot({ path: `artifacts/standart-cubuk-${ad}-giris.png` });
    const satirOlcum = { ekran: `${ekran.width}x${ekran.height}`, ad, cubuk, logo, sira, satir, hatalar };
    olcum.push(satirOlcum);
    console.log(JSON.stringify(satirOlcum));

    assert.deepEqual(sira.slice(0, 4), ['sp-site', 'sp-sound', 'sp-muzik', 'sp-help-open'],
      `${ad}: standart dörtlü bu sırayla başta olmalı (okunan: ${sira.join(', ')})`);
    assert.ok(cubuk.left >= 0 && cubuk.right <= ekran.width, `${ad}: üst çubuk ekrandan taşıyor (${cubuk.left}..${cubuk.right})`);
    assert.ok(cubuk.top >= 0 && cubuk.bottom <= ekran.height, `${ad}: üst çubuk ekranın dışında (${cubuk.top}..${cubuk.bottom})`);
    assert.equal(satir, 1, `${ad}: standart araç çubuğu tek satırda kalmalı (düğmeler alt satıra kaydı)`);
    assert.ok(!binisiyor(cubuk, logo), `${ad}: üst çubuk oyun adının üstüne biniyor`);
    assert.deepEqual(hatalar, [], `${ad}: tarayıcı hataları: ` + hatalar.join(' | '));
    await context.close();
  }

  // 2) Dar yatay telefonda maç ve duraklatma menüsü.
  const context = await browser.newContext({ viewport: DAR, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage(), hatalar = [];
  page.on('pageerror', e => hatalar.push(e.message));
  page.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
  await page.goto(url + '/?test=1');
  await page.waitForFunction(() => !!window.__sonPlaka);
  await page.waitForTimeout(600);
  const olc = sec => page.evaluate(`(${OLC})(${JSON.stringify(sec)})`);

  await page.tap('#sp-start');
  await page.waitForFunction(() => window.__sonPlaka.state().started, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const macCubuk = await olc('.header-actions'), tabela = await olc('#sp-scoreboard');
  const macSira = await page.evaluate(`(${CUBUK_SIRA})()`);
  await page.screenshot({ path: 'artifacts/standart-cubuk-dar-mac.png' });
  console.log(JSON.stringify({ macCubuk, tabela, macSira }));
  assert.ok(tabela.gorunur, 'maçta skor tabelası görünmeli');
  // Maçta `← josephuz.com` gizlenir (src/ui.js hud); müzik düğmesi de telefonda çekilir, çünkü beşinci simge
  // tabelanın üstüne binerdi — müzik o sırada ☰ → duraklatma menüsünden açılıp kapatılır.
  assert.deepEqual(macSira, ['sp-sound', 'sp-help-open', 'sp-pause-open', 'sp-cam'],
    'maçta üst çubukta yalnız bu dört simge olmalı: beşincisi tabelanın üstüne biner');
  assert.ok(!binisiyor(macCubuk, tabela), 'maçta üst çubuk skor tabelasının üstüne biniyor');

  // 3) Standart duraklatma menüsü dar yatay telefonda bütünüyle görünmeli: en alttaki "josephuz.com'a dön"
  //    kaydırmadan okunsun (menü bu görevde Kontroller, Müzik ve ses sürgüsüyle uzadı).
  await page.tap('#sp-pause-open');
  await page.waitForTimeout(500);
  const molaKart = await olc('#sp-pause .card'), molaSon = await olc('#sp-pause a.btn');
  const molaDugmeler = await page.evaluate(() => [...document.querySelectorAll('#sp-pause .card > button, #sp-pause .card > label, #sp-pause .card > a')]
    .filter(n => getComputedStyle(n).display !== 'none' && !n.hidden).map(n => n.id || n.textContent.trim()));
  await page.screenshot({ path: 'artifacts/standart-cubuk-dar-duraklatma.png' });
  console.log(JSON.stringify({ molaKart, molaSon, molaDugmeler }));
  assert.deepEqual(molaDugmeler, ['sp-resume', 'sp-pause-help', 'sp-pause-sound', 'sp-pause-muzik', 'sp-muzik-row', 'sp-restart', 'sp-menu', "josephuz.com'a dön"],
    'duraklatma menüsünün sırası standart olmalı');
  assert.ok(molaSon.bottom <= DAR.height, `duraklatma menüsünün son düğmesi ekrandan taşıyor (${molaSon.bottom} > ${DAR.height})`);
  assert.ok(molaKart.bottom <= DAR.height, 'duraklatma kartı ekrandan taşıyor');
  assert.deepEqual(hatalar, [], 'tarayıcı hataları: ' + hatalar.join(' | '));
  await context.close();

  console.log('Standart üst araç çubuğu (← josephuz.com · Ses · Müzik · Kontroller F1) üç ekran ölçüsünde de tek satır, taşma yok.');
  console.log('Standart duraklatma menüsü dar yatay telefonda bütünüyle görünüyor. Görüntüler: artifacts/standart-cubuk-*.png');
} finally {
  await browser.close();
  sunucu?.kill();
}
