// "İbo" gösteri sahnesinin (?gosteri=ibo) tarayıcı dumanı testi: sayfa tarafı doğru mu?
// Denetlenenler: menü ve arayüz gizlenir, kamera birinci şahsa alınır ama oyuncunun tercihi (sp.cam) bozulmaz,
// sunucuya hiç bağlanılmaz ve "sekme açık" sinyali gitmez, müzik hiç kurulmaz, altyazı kutusu her cümlenin
// saniyesinde doğru metinle açılır, "TEKRAR" rozeti yalnız tekrar bölümünde durur, sahne hatasız sonuna varır ve
// `window.__gosteri` çekim betiğinin okuduğu ölçümleri verir. Normal oyunun (?gosteri yok) bu öğelerden
// etkilenmediği de denetlenir.
// Sahne, çekimdeki gibi sahte saatle kare kare ilerletilir (gerçek zamanlı beklemek yok).
// Adres: GAME_URL (varsayılan http://localhost:5187). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ALTYAZI, ISARET } from '../src/gosteri-ibo.js';
import tr from '../src/diller/tr.js';

const pw = process.env.PLAYWRIGHT_MODULE || 'playwright';
const pwYol = /^[a-zA-Z]:[\\/]|^\//.test(pw) ? pathToFileURL(/\.[cm]?js$/.test(pw) ? pw : pw.replace(/[\\/]$/, '') + '/index.mjs').href : pw;
const { chromium } = await import(pwYol);
const url = process.env.GAME_URL || 'http://localhost:5187';
await mkdir('artifacts', { recursive: true });

/** Çekimdeki sahte saat (bkz. ajanlar/icerik/short-uret.mjs): kareyi test ilerletir. */
const SAAT = `(() => {
  let simdi = 0; const sira = [];
  performance.now = () => simdi;
  Date.now = () => 1767571200000 + simdi;
  window.requestAnimationFrame = cb => sira.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__kare = ms => { simdi += ms; for (const cb of sira.splice(0)) cb(simdi); };
})()`;

const browser = await chromium.launch({ headless: true, args: process.env.SWIFTSHADER ? ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader'] : ['--mute-audio', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ locale: 'tr-TR', viewport: { width: 540, height: 960 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('sp.cam', 'shoulder'); } catch { /* yok */ }
    window.__sockets = 0; window.__istek = 0;
    const WS = window.WebSocket;
    window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
    const fetch0 = window.fetch.bind(window);
    window.fetch = (u, o) => { if (String(u).includes('/presence')) window.__istek++; return fetch0(u, o); };
  });
  await ctx.addInitScript(SAAT);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const oku = fn => page.evaluate(fn);
  const ilerle = async n => { for (let i = 0; i < n; i++) await page.evaluate(() => window.__kare(1000 / 30)); };

  await page.goto(url + '/?gosteri=ibo');
  await page.waitForFunction(() => !!window.__sonPlaka && !!window.__gosteri, null, { timeout: 20000, polling: 100 });
  // Isınma kareleri sıfır süreyle: sahne kurulur ama saati ilerlemez (çekim betiğiyle aynı).
  for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__kare(0)); await page.waitForTimeout(100); }

  // 1) Menü ve arayüz gizli, kamera birinci şahıs, oyuncunun tercihi bozulmamış, müzik hiç kurulmamış.
  assert.ok(await oku(() => document.getElementById('son-plaka').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  for (const sel of ['#sp-home', '#sp-scoreboard', '#sp-player', '#sp-controls', '#sp-crosshair', '#sp-touch', '#sp-help']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }
  assert.equal(await oku(() => window.__sonPlaka.view().cameraMode), 'fps', 'birinci şahıs kamera');
  assert.equal(await oku(() => localStorage.getItem('sp.cam')), 'shoulder', 'kamera tercihi (sp.cam) değişmez');
  assert.equal(await oku(() => window.__sonPlaka.muzik().kapali), true, 'gösteride müzik hiç kurulmaz');
  // Sahnede tek görünür oyuncu vardır (İbo); kalan koltuklar gizlidir.
  assert.equal(await oku(() => window.__sonPlaka.world().players.filter(p => !p.out).length), 1, 'kadrajda yalnız İbo var');

  // 2) Altyazılar: her cümle kendi saniyesinde, doğru metinle ve kutusuyla ekranda.
  const yazi = page.locator('#sp-gosteri-yazi'), tekrar = page.locator('#sp-gosteri-tekrar');
  assert.ok(await yazi.isHidden(), 'sahnenin başında altyazı yok');
  let kare = 0;
  const kadar = async sn => { const hedef = Math.round(sn * 30); await ilerle(hedef - kare); kare = hedef; };
  // 3) "TEKRAR" rozeti yalnız tekrar bölümünde durur (altyazıların ikisi o bölüme düşer, ikisi de denetlenir).
  let tekrarKaresi = false;
  for (const [bas, , metin] of ALTYAZI) {
    await kadar(bas + 0.2);
    assert.ok(await yazi.isVisible(), `${bas} sn: altyazı kutusu açık`);
    assert.equal((await yazi.textContent()).trim(), tr[metin], // ALTYAZI sözlük anahtarı tutar; sayfa Türkçe (locale tr-TR)
      `${bas} sn: doğru cümle`);
    const tekrarda = bas + 0.2 >= ISARET.tekrar1 && bas + 0.2 < ISARET.canli - 0.2;
    assert.equal(await tekrar.isVisible(), tekrarda, `${bas} sn: TEKRAR rozeti ${tekrarda ? 'görünür' : 'gizli'}`);
    if (tekrarda && !tekrarKaresi) { tekrarKaresi = true; await page.screenshot({ path: 'artifacts/gosteri-ibo-tekrar.png' }); }
  }
  assert.ok(tekrarKaresi, 'tekrar bölümünden kare alındı');
  await kadar(ISARET.bitis);
  await page.screenshot({ path: 'artifacts/gosteri-ibo-son.png' });

  // 4) Çekim betiğinin okuduğu ölçümler (kabul ölçütleri burada birimle denetlenir: tests/gosteri-ibo.test.mjs).
  const g = await oku(() => ({ ...window.__gosteri, altyazi: window.__gosteri.altyazi.length }));
  assert.equal(g.altyazi, ALTYAZI.length, 'bütün altyazılar gösterildi');
  assert.ok(g.bitti && g.carpmaAt > 0 && g.tekrarAcisi === 3 && g.yuruyor2036 && g.rampaKullanimi === 0,
    'sahne ölçümleri yerinde: ' + JSON.stringify(g));

  // 5) Ne ağ ne sunucu sinyali.
  assert.equal(await oku(() => window.__sockets), 0, 'gösteride sunucuya bağlanılmaz');
  assert.equal(await oku(() => window.__istek), 0, 'gösteride sunucuya istek gitmez');
  assert.deepEqual(errors, [], 'sayfa hatasız');

  // 6) Normal oyun bu kipten etkilenmez: giriş ekranı açılır, altyazı ve rozet gizli kalır.
  const normal = await ctx.newPage(), normalHata = [];
  normal.on('pageerror', e => normalHata.push(e.message));
  await normal.goto(url + '/');
  await normal.waitForSelector('#sp-home', { state: 'visible', timeout: 20000 });
  assert.ok(!(await normal.evaluate(() => document.getElementById('son-plaka').classList.contains('gosteri'))), 'normal oyunda gösteri sınıfı yok');
  assert.ok(await normal.locator('#sp-gosteri-yazi').isHidden(), 'normal oyunda altyazı kutusu gizli');
  assert.ok(await normal.locator('#sp-gosteri-tekrar').isHidden(), 'normal oyunda TEKRAR rozeti gizli');
  assert.deepEqual(normalHata, [], 'normal oyun hatasız');

  console.log('İbo gösteri sahnesi dumanı testi geçti.');
} finally {
  await browser.close();
}
