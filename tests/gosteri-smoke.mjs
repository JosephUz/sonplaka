// Gösteri kipi dumanı testi (?gosteri=1): içerik klipleri için "kendi kendine oynayan" maç çalışıyor mu?
// Denetlenenler: menü atlanır ve maç başlar, on koltuğun hepsi bottur, arayüz gizlidir, sunucuya hiç WebSocket açılmaz
// ve "sekme açık" sinyali gitmez, oyuncunun kamera tercihi (sp.cam) bozulmaz, ilk saniyelerde disk uçar ve kavga
// başlar, kamera kavgayı omuz üstünden izler, maç bitince yenisi başlar.
// Adres: GAME_URL (varsayılan http://localhost:5187). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// PLAYWRIGHT_MODULE bir klasör yolu da olabilir (gece testi böyle verir: C:/ju/sonplaka/node_modules/playwright):
// Windows'ta mutlak yol import() için file:// olmalı ve klasör yerine giriş dosyası verilmeli.
const pw = process.env.PLAYWRIGHT_MODULE || 'playwright';
const pwYol = /^[a-zA-Z]:[\\/]|^\//.test(pw) ? pathToFileURL(/\.[cm]?js$/.test(pw) ? pw : pw.replace(/[\\/]$/, '') + '/index.mjs').href : pw;
const { chromium } = await import(pwYol);
const url = process.env.GAME_URL || 'http://localhost:5187';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Açılan WebSocket'ler ve sunucuya giden istekler sayılır: gösteri kipinde ikisi de olmamalı. Kamera tercihi
  // önceden 'fps' yazılır: gösteri omuz kamerasına geçer ama tercihi DEĞİŞTİRMEMELİ (aynı tarayıcıda normal oyun
  // eskisi gibi birinci şahıs açılsın).
  await ctx.addInitScript(() => {
    try { localStorage.setItem('sp.cam', 'fps'); } catch { /* yok */ }
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
  const oku = fn => page.evaluate(fn); // sayfadan okuma: dünya, görünüm, sayaçlar

  await page.goto(url + '/?gosteri=1');
  await page.waitForFunction(() => !!window.__sonPlaka, null, { timeout: 20000 });

  // 1) Menü atlanır, on koltuğun hepsini bot oynar.
  assert.ok(await page.locator('#sp-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await oku(() => document.getElementById('son-plaka').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  assert.equal(await oku(() => window.__sonPlaka.world().players.length), 10, 'on koltuk kurulur');
  assert.equal(await oku(() => window.__sonPlaka.world().players.filter(p => p.human).length), 0, 'hiç insan oyuncu yok');
  assert.equal(await oku(() => window.__sonPlaka.view().cameraMode), 'shoulder', 'omuz kamerası açılır');
  // Gösteri kullanıcının kamera tercihine dokunmaz: normal oyun sonraki açılışta hâlâ birinci şahıs başlar.
  assert.equal(await oku(() => localStorage.getItem('sp.cam')), 'fps', 'kamera tercihi (sp.cam) değişmez');

  // 2) Arayüz gizli: üst çubuk, skor tabelası, oyuncu kartı, kontrol şeridi, nişangah, dokunma kontrolleri.
  for (const sel of ['#sp-scoreboard', '#sp-player', '#sp-controls', '#sp-crosshair', '#sp-touch', '#sp-help']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }

  // 3) İlk saniyelerde aksiyon: disk atılır ve isabet eder (botlar dibinde rakiple başlar).
  await page.waitForFunction(() => window.__sonPlaka.world().players.some(p => p.stats.throws > 0), null, { timeout: 8000 });
  await page.waitForFunction(() => window.__sonPlaka.world().players.reduce((n, p) => n + p.stats.hits, 0) > 0, null, { timeout: 15000 });
  await page.screenshot({ path: 'artifacts/gosteri-1-kavga.png' });

  // 4) Ne ağ ne sunucu sinyali; oyun saati gerçek zamandan hızlı akar (GOSTERI.hiz).
  assert.equal(await oku(() => window.__sockets), 0, 'gösteri kipinde sunucuya bağlanılmaz');
  assert.equal(await oku(() => window.__istek), 0, 'gösteri kipinde sunucuya istek gitmez');
  const t0 = await oku(() => window.__sonPlaka.world().time);
  await page.waitForTimeout(4000);
  const t1 = await oku(() => window.__sonPlaka.world().time);
  assert.ok(t1 - t0 > 4.4, `maç hızlandırılmış koşar (4 sn'de ${(t1 - t0).toFixed(1)} sn)`);

  // 5) Kamera kavgayı izler. "Yakında rakip var" demek yetmez (kamera yanlış yöne bakarken de doğru çıkar): yarım
  // saniyede bir, oyuncuların dünya konumu kameranın KENDİ izdüşüm matrisiyle ekrana taşınır ve KADRAJA giren ayakta
  // oyuncu sayılır — yani klibi izleyenin gerçekten gördüğü şey ölçülür. Beklenen: kadrajda hep en az iki oyuncu
  // (kavga), ortancada üç ve üstü, ve kamera odağı omuz mesafesinde tutar.
  const ornekler = [];
  for (let i = 0; i < 20; i++) {
    ornekler.push(await oku(() => {
      const w = window.__sonPlaka.world(), view = window.__sonPlaka.view();
      const cam = view.camera, P = cam.projectionMatrix.elements, V = cam.matrixWorldInverse.elements;
      const carp = (m, a) => [0, 1, 2, 3].map(i => m[i] * a[0] + m[i + 4] * a[1] + m[i + 8] * a[2] + m[i + 12] * a[3]);
      // Oyuncunun göğsü (y + 1) ekranda mı: görünüm × izdüşüm sonrası NDC kutusunun içinde ve kameranın önünde mi?
      const kadrajda = q => { const c = carp(P, carp(V, [q.x, q.y + 1, q.z, 1])); return c[3] > 0 && Math.abs(c[0] / c[3]) <= 1 && Math.abs(c[1] / c[3]) <= 1; };
      const ayakta = w.players.filter(p => !p.out && p.respawn <= 0);
      const odak = w.players[window.__sonPlaka.gosteri().odakId()];
      if (!odak) return null;
      return { kadraj: ayakta.filter(kadrajda).length, ayakta: ayakta.length, odakKadrajda: kadrajda(odak),
        uzaklik: Math.hypot(cam.position.x - odak.x, cam.position.z - odak.z), out: odak.out };
    }));
    await page.waitForTimeout(500);
  }
  const sayilar = ornekler.map(o => o && o.kadraj).join(',');
  assert.ok(ornekler.every(o => o && !o.out), 'kamera hep ayakta bir oyuncuyu izler');
  const omuzda = ornekler.filter(o => o.uzaklik < 12).length;
  assert.ok(omuzda >= 14, `kamera oyuncunun omzunda (20 örneğin ${omuzda} tanesi)`);
  // Boş kadraj olmasın: en az iki oyuncu görünsün (arenada o kadar oyuncu kalmadıysa kalanlar görünsün).
  const dolu = ornekler.filter(o => o.kadraj >= Math.min(2, o.ayakta)).length;
  assert.ok(dolu >= 17, `kadrajda kavga var (20 örneğin ${dolu} tanesinde en az iki oyuncu; ${sayilar})`);
  const sirali = ornekler.map(o => o.kadraj).sort((a, b) => a - b), ortanca = (sirali[9] + sirali[10]) / 2;
  assert.ok(ortanca >= 3, `kadraj kalabalık (ortanca ${ortanca} oyuncu; ${sayilar})`);
  const odakta = ornekler.filter(o => o.odakKadrajda).length;
  assert.ok(odakta >= 14, `izlenen oyuncu kadrajda (20 örneğin ${odakta} tanesi; düşen odak kısa süre kadraj dışına çıkabilir)`);

  // 6) Maç bitince yenisi başlar (bitişi elle tetikleyip bekliyoruz).
  await oku(() => { window.__sonPlaka.world().winner = 0; });
  await page.waitForFunction(() => { const w = window.__sonPlaka.world(); return w.winner === null && w.time < 5; }, null, { timeout: 15000 });
  assert.equal(await oku(() => window.__sonPlaka.world().players.filter(p => !p.out).length), 10, 'yeni maç on oyuncuyla kurulur');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'artifacts/gosteri-2-yeni-mac.png' });

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log('Gösteri kipi dumanı testi geçti.');
} finally {
  await browser.close();
}
