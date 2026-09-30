// Tarayıcı dumanı testi: çalışan sunucuya (varsayılan http://localhost:5187) Playwright'ın kendi başsız Chromium'uyla
// bağlanır (`npx playwright install chromium`; kullanıcının Chrome'una ve faresine dokunmaz), ana akışları dener ve
// artifacts/ klasörüne ekran görüntüsü bırakır. Başka bir Playwright modülü: PLAYWRIGHT_MODULE ortam değişkeni.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://localhost:5187';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);
  const hero = () => game(() => window.__sonPlaka.world().players[0]);

  await page.goto(url + '/?test=1');
  await page.waitForFunction(() => !!window.__sonPlaka);
  await page.mouse.move(768, 480); // başsız Chrome fare kilidi verebilir: ilk tıklama bakışı çevirmesin
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/01-home.png' });

  await page.locator('#sp-start').click();
  await page.waitForTimeout(1200);
  assert.equal(await game(() => window.__sonPlaka.world().players.length), 10);
  assert.ok(await page.locator('#sp-scoreboard').isVisible());
  assert.ok(await page.locator('#sp-crosshair').isVisible());
  assert.equal(await game(() => window.__sonPlaka.view().cameraMode), 'fps', 'masaüstünde birinci şahısla başlar');
  // Geri sayımı atla.
  await game(() => { const w = window.__sonPlaka.world(); w.state = 'play'; w.t = 0; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/02-game.png' });

  const before = await hero();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  const after = await hero();
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.5, 'yürümedi');
  assert.ok(after.ground, 'yerde değil');

  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  assert.ok(!(await hero()).ground, 'zıplamadı');
  await page.waitForTimeout(900);

  // Sol tık: disk. Fare kilidi başsız tarayıcıda yok; test kipinde tıklama doğrudan işler.
  const discsBefore = (await hero()).discs;
  await page.mouse.click(768, 480);
  await page.waitForTimeout(120);
  assert.equal((await hero()).discs, discsBefore - 1, 'disk atılmadı');
  assert.ok(await game(() => window.__sonPlaka.world().discs.length >= 0));

  // Sağ tık: levye (bekleme başlar).
  await page.mouse.click(768, 480, { button: 'right' });
  await page.waitForTimeout(60);
  assert.ok((await hero()).barCd > 0, 'levye sallanmadı');

  // V: omuz kamerası, tekrar V: birinci şahıs.
  await page.keyboard.press('KeyV'); await page.waitForTimeout(100);
  assert.equal(await game(() => window.__sonPlaka.view().cameraMode), 'shoulder');
  await page.screenshot({ path: 'artifacts/03-shoulder.png' });
  await page.keyboard.press('KeyV'); await page.waitForTimeout(100);
  assert.equal(await game(() => window.__sonPlaka.view().cameraMode), 'fps');

  // Dış halka düşsün: 41. saniyeye sar; oyuncu plakayla düşer (düşme perdesi), 4 sn sonra iç halkada yeniden doğar.
  await game(() => { const w = window.__sonPlaka.world(); w.t = 39.9; });
  await page.waitForFunction(() => window.__sonPlaka.world().players[0].out, null, { timeout: 8000 });
  assert.ok(await page.locator('#sp-down').isVisible(), 'düşme perdesi yok');
  await page.screenshot({ path: 'artifacts/04-fall.png' });
  await page.waitForFunction(() => { const w = window.__sonPlaka.world(), p = w.players[0]; return !p.out && w.arena.plates[p.plate]?.ring === 1; }, null, { timeout: 10000 });
  assert.ok(await game(() => window.__sonPlaka.world().plates[5].phase >= 2), 'dış halka düşmedi');
  assert.equal((await hero()).stats.falls, 1, 'düşme sayılmadı');
  await page.screenshot({ path: 'artifacts/05-respawn.png' });
  assert.ok(await page.locator('#sp-scoreboard .team').count() === 2, 'tabelada iki takım yok');

  // Esc: mola; devam.
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  assert.ok(await page.locator('#sp-pause').isVisible());
  await page.locator('#sp-pause-sound').click();
  assert.equal(await page.locator('#sp-pause-sound').textContent(), 'Ses: kapalı', 'mola menüsünden ses kapanmadı');
  assert.equal(await page.evaluate(() => localStorage.getItem('sp.sound')), 'off', 'ses ayarı kaydedilmedi');
  assert.ok(await page.locator('#sp-sound').evaluate(b => b.classList.contains('muted')), 'üst çubuk ses düğmesi aynı durumu göstermiyor');
  await page.locator('#sp-pause-sound').click();
  assert.equal(await page.locator('#sp-pause-sound').textContent(), 'Ses: açık');
  await page.locator('#sp-resume').click(); await page.waitForTimeout(150);
  assert.ok(await page.locator('#sp-pause').isHidden());

  // F1 yardım.
  await page.keyboard.press('F1'); await page.waitForTimeout(150);
  assert.ok(await page.locator('#sp-help').isVisible());
  await page.locator('#sp-help-close').click();
  // Fare kilidi olayları gecikmeli gelebilir (başsız Chrome): oyun molaya düştüyse devam et.
  await page.waitForTimeout(400);
  if (await page.locator('#sp-pause').isVisible()) { await page.locator('#sp-resume').click(); await page.waitForTimeout(200); }

  // Maç sonu: son plakada turuncunun kimsesi kalmasın.
  await game(() => { const w = window.__sonPlaka.world(); w.state = 'play'; w.t = 90; w.respawnOpen = false; for (const p of w.players) { p.out = p.team === 1; p.respawn = 0; } });
  await page.waitForTimeout(400);
  assert.ok(await page.locator('#sp-results').isVisible(), 'karne açılmadı');
  assert.match(await page.locator('#sp-result-title').textContent(), /Son plaka sizin/, 'kazanan yazısı yanlış');
  await page.screenshot({ path: 'artifacts/06-results.png' });

  // Dokunmatik kip (kamera seçimi hatırlanır; temiz başlasın); herkes tek kipi seçilir: 5 oyuncu, 5 takım.
  await game(() => { localStorage.removeItem('sp.cam'); localStorage.removeItem('sp.mode'); });
  await page.goto(url + '/?test=1&touch=1');
  await page.waitForFunction(() => !!window.__sonPlaka);
  await page.locator('.mode-row label:has(input[value="1"])').click();
  await page.locator('.diff-row label:has(input[value="easy"])').click();
  await page.locator('#sp-start').click();
  await page.waitForTimeout(800);
  assert.ok(await page.locator('#sp-touch').isVisible(), 'dokunmatik kontroller yok');
  assert.equal(await game(() => window.__sonPlaka.view().cameraMode), 'shoulder', 'telefonda omuzla başlar');
  assert.equal(await game(() => window.__sonPlaka.world().players.length), 5, 'herkes tek kipinde 5 oyuncu olmalı');
  assert.equal(await game(() => window.__sonPlaka.world().teams), 5);
  assert.equal(await page.locator('#sp-scoreboard .team').count(), 5, 'tabelada beş takım yok');
  assert.equal(await game(() => localStorage.getItem('sp.mode')), '1', 'kip hatırlanmadı');
  assert.equal(await game(() => window.__sonPlaka.world().difficulty), 'easy', 'bot zorluğu dünyaya işlenmedi');
  assert.equal(await game(() => localStorage.getItem('sp.diff')), 'easy', 'zorluk hatırlanmadı');
  assert.equal(await game(() => window.__sonPlaka.world().players[0].lives), 5, 'düşme hakkı 5 olmalı');
  await page.screenshot({ path: 'artifacts/07-touch-ffa.png' });

  assert.deepEqual(errors, [], 'tarayıcı hataları: ' + errors.join(' | '));
  console.log('Tarayıcı dumanı testi geçti; ekran görüntüleri artifacts/ içinde.');
} finally {
  await browser.close();
}
