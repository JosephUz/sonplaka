// Gösteri kipi dumanı testi (?gosteri=1): içerik klipleri için "kendi kendine oynayan" maç çalışıyor mu?
// Denetlenenler: menü atlanır ve maç başlar, on koltuğun hepsi bottur, arayüz gizlidir, sunucuya hiç WebSocket açılmaz
// ve "sekme açık" sinyali gitmez, ilk saniyelerde disk uçar ve kavga başlar, kamera kavgayı omuz üstünden izler, maç
// bitince yenisi başlar. Adres: GAME_URL (varsayılan http://localhost:5187). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://localhost:5187';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Açılan WebSocket'ler ve sunucuya giden istekler sayılır: gösteri kipinde ikisi de olmamalı.
  await ctx.addInitScript(() => {
    window.__sockets = 0; window.__istek = 0;
    const WS = window.WebSocket;
    window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
    const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (beacon) navigator.sendBeacon = (u, b) => { window.__istek++; return beacon(u, b); };
    const fetch0 = window.fetch.bind(window);
    window.fetch = (u, o) => { if (String(u).includes('/presence')) window.__istek++; return fetch0(u, o); };
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);
  const dunya = fn => page.evaluate(fn);

  await page.goto(url + '/?gosteri=1');
  await page.waitForFunction(() => !!window.__sonPlaka, null, { timeout: 20000 });

  // 1) Menü atlanır, on koltuğun hepsini bot oynar.
  assert.ok(await page.locator('#sp-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('son-plaka').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  assert.equal(await dunya(() => window.__sonPlaka.world().players.length), 10, 'on koltuk kurulur');
  assert.equal(await dunya(() => window.__sonPlaka.world().players.filter(p => p.human).length), 0, 'hiç insan oyuncu yok');
  assert.equal(await game(() => window.__sonPlaka.view().cameraMode), 'shoulder', 'omuz kamerası açılır');

  // 2) Arayüz gizli: üst çubuk, skor tabelası, oyuncu kartı, kontrol şeridi, nişangah, dokunma kontrolleri.
  for (const sel of ['#sp-scoreboard', '#sp-player', '#sp-controls', '#sp-crosshair', '#sp-touch', '#sp-help']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }

  // 3) İlk saniyelerde aksiyon: disk atılır ve isabet eder (botlar dibinde rakiple başlar).
  await page.waitForFunction(() => window.__sonPlaka.world().players.some(p => p.stats.throws > 0), null, { timeout: 8000 });
  await page.waitForFunction(() => window.__sonPlaka.world().players.reduce((n, p) => n + p.stats.hits, 0) > 0, null, { timeout: 15000 });
  await page.screenshot({ path: 'artifacts/gosteri-1-kavga.png' });

  // 4) Ne ağ ne sunucu sinyali; oyun saati gerçek zamandan hızlı akar (GOSTERI.hiz).
  assert.equal(await game(() => window.__sockets), 0, 'gösteri kipinde sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__istek), 0, 'gösteri kipinde sunucuya istek gitmez');
  const t0 = await dunya(() => window.__sonPlaka.world().time);
  await page.waitForTimeout(4000);
  const t1 = await dunya(() => window.__sonPlaka.world().time);
  assert.ok(t1 - t0 > 4.4, `maç hızlandırılmış koşar (4 sn'de ${(t1 - t0).toFixed(1)} sn)`);

  // 5) Kamera kavgayı izler: örneklerin çoğunda ayakta bir oyuncunun omzunda ve yakınında rakip var. (Boşluğa düşen
  // oyuncuyu gösterdiği kısa anlarda kamera plakada kalır, odak uzaklaşır: birkaç örneğin uzak çıkması beklenir.)
  const ornekler = [];
  for (let i = 0; i < 12; i++) {
    ornekler.push(await dunya(() => {
      const w = window.__sonPlaka.world(), c = window.__sonPlaka.view().camera.position;
      const odak = w.players[window.__sonPlaka.gosteri().odakId()];
      if (!odak) return null;
      let rakip = Infinity;
      for (const t of w.players) if (!t.out && t.team !== odak.team) rakip = Math.min(rakip, Math.hypot(t.x - odak.x, t.z - odak.z));
      return { rakip, uzaklik: Math.hypot(c.x - odak.x, c.z - odak.z), out: odak.out, dusuyor: odak.y < -1.5 };
    }));
    await page.waitForTimeout(250);
  }
  assert.ok(ornekler.every(o => o && !o.out), 'kamera hep ayakta bir oyuncuyu izler');
  const omuzda = ornekler.filter(o => o.uzaklik < 12).length;
  assert.ok(omuzda >= 8, `kamera oyuncunun omzunda (12 örneğin ${omuzda} tanesi)`);
  const kavgada = ornekler.filter(o => o.rakip < 30).length;
  assert.ok(kavgada >= 8, `izlenen oyuncunun yakınında rakip var (12 örneğin ${kavgada} tanesi)`);

  // 6) Maç bitince yenisi başlar (bitişi elle tetikleyip bekliyoruz).
  await dunya(() => { window.__sonPlaka.world().winner = 0; });
  await page.waitForFunction(() => { const w = window.__sonPlaka.world(); return w.winner === null && w.time < 5; }, null, { timeout: 15000 });
  assert.equal(await dunya(() => window.__sonPlaka.world().players.filter(p => !p.out).length), 10, 'yeni maç on oyuncuyla kurulur');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'artifacts/gosteri-2-yeni-mac.png' });

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log('Gösteri kipi dumanı testi geçti.');
} finally {
  await browser.close();
}
