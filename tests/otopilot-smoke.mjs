// Otopilot dumanı testi (?otopilot=1): içerik videoları için "senin oyuncunu da bot oynayan" gerçek maç çalışıyor mu?
// Denetlenenler: menü atlanır ve maç başlar, senin koltuğun bota verilmiştir (p.human false) ama w.me değişmez,
// gösteri kipi **değildir** (arayüz normal oyundaki gibi durur, maç normal bot ayarlarıyla koşar), oyuncun arenada
// yürür / nişan alır / disk atar, kamera botun nişanını izler, oyuncunun kamera tercihi (sp.cam) bozulmaz, sunucuya
// hiç WebSocket açılmaz ve "sekme açık" sinyali gitmez, maç bitince karne açılmaz yenisi başlar.
// Adres: GAME_URL (varsayılan http://localhost:5187). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const pw = process.env.PLAYWRIGHT_MODULE || 'playwright';
const pwYol = /^[a-zA-Z]:[\\/]|^\//.test(pw) ? pathToFileURL(/\.[cm]?js$/.test(pw) ? pw : pw.replace(/[\\/]$/, '') + '/index.mjs').href : pw;
const { chromium } = await import(pwYol);
const url = process.env.GAME_URL || 'http://localhost:5187';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Kamera tercihi önceden 'fps' yazılır: otopilot omuz kamerasına geçer ama tercihi DEĞİŞTİRMEMELİ.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('sp.cam', 'fps'); } catch { /* yok */ }
    window.__sockets = 0; window.__istek = 0;
    const WS = window.WebSocket;
    window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
    const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (beacon) navigator.sendBeacon = (u, b) => { window.__istek++; return beacon(u, b); };
    const fetch0 = window.fetch.bind(window);
    window.fetch = (u, o) => { if (/\/api\//.test(String(u))) window.__istek++; return fetch0(u, o); };
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);

  await page.goto(url + '/?otopilot=1&muzik=0');
  await page.waitForFunction(() => window.__sonPlaka && window.__sonPlaka.state().started, null, { timeout: 20000 });

  // 1) Menü atlanır; kip otopilottur, gösteri değildir (arayüz normal oyundaki gibi durur).
  assert.ok(await page.locator('#sp-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => !document.getElementById('son-plaka').classList.contains('gosteri')), 'arayüz gizlenmez');
  assert.ok(await game(() => window.__sonPlaka.world().otopilot === true), 'otopilot açık');

  // 2) Senin koltuğun bota verilmiştir ama izlenen oyuncu değişmez.
  assert.equal(await game(() => { const w = window.__sonPlaka.world(); return w.players[w.me].human; }), false, 'senin koltuğunu bot oynar');
  assert.equal(await game(() => window.__sonPlaka.world().me), 0, 'izlenen oyuncu değişmez');
  assert.equal(await game(() => window.__sonPlaka.world().players.filter(p => p.human).length), 0, 'insan girdisi bekleyen koltuk kalmaz');

  // 3) Oyuncun gerçekten oynuyor: yürür, nişanı döner ve disk atar.
  await game(() => {
    const g = window.__sonPlaka;
    window.__s = { kare: 0, hareket: 0, atis: 0, donus: 0, nisanFark: 0 };
    let disk = null, onceki = g.view().yaw;
    window.__sayac = setInterval(() => {
      const w = g.world(), p = w.players[w.me], s = window.__s; s.kare++;
      if (Math.hypot(p.vx, p.vz) > 0.5) s.hareket++;
      if (disk !== null && p.discs < disk) s.atis++;
      disk = p.discs;
      const y = g.view().yaw;
      s.donus += Math.abs(Math.atan2(Math.sin(y - onceki), Math.cos(y - onceki)));
      onceki = y;
      // Kamera botun nişanını izlemeli: bakış ile oyuncunun yaw'ı ayrışmamalı (ekrandaki artı atışın yönü).
      if (!p.out) s.nisanFark = Math.max(s.nisanFark, Math.abs(Math.atan2(Math.sin(y - p.yaw), Math.cos(y - p.yaw))));
    }, 50);
  });
  await page.waitForTimeout(30000);
  const say = await game(() => { clearInterval(window.__sayac); return window.__s; });
  await page.screenshot({ path: 'artifacts/otopilot-1-mac.png' });
  assert.ok(say.hareket > say.kare * 0.2, `oyuncun boş durmaz (${say.hareket}/${say.kare} örnekte yürüyor)`);
  assert.ok(say.atis > 0, `oyuncun disk atar (${say.atis} atış)`);
  assert.ok(say.donus > 1, `nişan döner (toplam ${say.donus.toFixed(1)} rad)`);
  assert.ok(say.nisanFark < 0.05, `kamera botun nişanını izler (en büyük ayrışma ${say.nisanFark.toFixed(3)} rad)`);

  // 4) Oyuncunun kamera tercihi bozulmaz, ağ ve sinyal yok.
  assert.equal(await game(() => localStorage.getItem('sp.cam')), 'fps', 'kamera tercihi değişmez');
  assert.equal(await game(() => window.__sockets), 0, 'otopilotta sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__istek), 0, 'otopilotta sunucuya istek gitmez');

  // 5) Maç bitince karne açılmaz, yenisi kurulur.
  await game(() => { window.__sonPlaka.world().winner = 0; });
  await page.waitForFunction(() => window.__sonPlaka.world().winner === null, null, { timeout: 15000 });
  assert.ok(await page.locator('#sp-results').isHidden(), 'karne açılmaz');
  assert.ok(await game(() => window.__sonPlaka.state().started), 'yeni maç başlar');
  await page.screenshot({ path: 'artifacts/otopilot-2-yeni-mac.png' });

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log(`Otopilot dumanı testi geçti (yürüyüş ${say.hareket}/${say.kare}, ${say.atis} atış, nişan dönüşü ${say.donus.toFixed(1)} rad).`);
} finally {
  await browser.close();
}
