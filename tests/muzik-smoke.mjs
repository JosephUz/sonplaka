// Oyun içi müzik dumanı testi (bkz. src/muzik.js). Denetlenenler: ilk tıklamadan önce hiç çalmaz, tıklayınca menüde
// sakin parça (`son-6-son-isik`) çalar ve ilerler, maç başlayınca ana temaya (`son-5-sifir-yercekimi`), son plaka
// evresinde (doğuş kapanınca) gerilim parçasına (`son-4-yorunge`) geçer ve parça bitince ana temaya devreder;
// "Müzik: kapalı" ayarı sayfa yenilenince korunur, efekt sesi düğmesi müziği etkilemez ve `?gosteri=1`'de hiç ses
// öğesi kurulmaz.
// Parça yokken (src/muzik.js `MUZIK_VAR` false; 4 Ekim 2026'dan beri böyle) çalma ölçümleri "müzik yok: atlandı" diye
// atlanır; yerine Müzik düğmelerinin gizli olduğu ve hiçbir ses dosyasının inmediği ölçülür.
// Tarayıcı sesi `--mute-audio` ile kısılır: ölçüm `audio.currentTime` / `paused` üzerinden yapılır.
// Oyunun kendisi otomatik tarayıcıda müziği kapatır (navigator.webdriver), bu yüzden `?muzik=1` ile açılır;
// `?test=1` oyunun okuma amaçlı test kancasını (`window.__sonPlaka`) açar.
// Adres: GAME_URL (varsayılan http://127.0.0.1:5187). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { MUZIK_VAR } from '../src/muzik.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = (process.env.GAME_URL || 'http://127.0.0.1:5187').replace(/\/$/, '');
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true,
  args: ['--mute-audio', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])],
});
const olcum = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  /** Sayfadaki bütün ses öğelerinin durumu: hangi dosya, duruyor mu, nerede, ne kadar sesli. */
  const sesler = () => page.evaluate(() => [...document.querySelectorAll('audio')].map(a => ({
    parca: a.dataset.parca, paused: a.paused, currentTime: a.currentTime, volume: a.volume, loop: a.loop,
  })));
  /** O an baskın olan parça: çapraz geçiş sırasında iki öğe birden çalar, sesi yüksek olan yeni parçadır. */
  const calan = async () => (await sesler()).filter(s => !s.paused && s.volume > 0).sort((a, b) => b.volume - a.volume)[0] || null;
  const durum = () => page.evaluate(() => window.__sonPlaka.muzik());
  const hazir = () => page.waitForFunction(() => !!window.__sonPlaka?.muzik, null, { timeout: 20000 });

  if (!MUZIK_VAR) {
    // Müzik şimdilik kaldırıldı (4 Ekim 2026, src/muzik.js SAHNELER boş): parça çalma ölçümleri atlanır. Yerine
    // ölçülen: Müzik düğmeleri (üst çubuk ve mola menüsü) gizli, dokunuştan / maçtan sonra hiçbir ses dosyası inmez.
    console.log('müzik yok: atlandı (parça çalma ölçümleri)');
    await page.goto(url + '/?test=1&muzik=1');
    await hazir();
    assert.equal((await durum()).kapali, false, '?muzik=1 ile müzik kurulur (yalnız parça yoktur)');
    assert.equal(await page.locator('#sp-muzik').isVisible(), false, 'parça yokken üst çubukta Müzik düğmesi gizli');
    await page.locator('#sp-home h1').click();
    await page.locator('#sp-start').click();
    await page.waitForFunction(() => window.__sonPlaka.state().started, null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    assert.equal((await sesler()).length, 0, 'parça yokken hiçbir <audio> kurulmaz, dosya inmez');
    assert.equal((await durum()).caliyor, false, 'hiçbir şey çalmaz');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#sp-pause').isVisible(), 'Esc duraklatma menüsünü açar');
    assert.equal(await page.locator('#sp-pause-muzik').isVisible(), false, 'parça yokken mola menüsünde Müzik düğmesi gizli');
    olcum.muzikYok = { sesOgesi: 0, dugmelerGizli: true };
  } else {
    // 1) Açılış: oyun kurulur, müzik açıktır ama kullanıcı daha dokunmadığı için hiçbir şey çalmaz.
    await page.goto(url + '/?test=1&muzik=1');
    await hazir();
    const ilk = await durum();
    assert.equal(ilk.kapali, false, 'müzik açık (?muzik=1)');
    assert.equal(ilk.acik, true, 'varsayılan ayar: müzik açık');
    assert.ok(Math.abs(ilk.ses - 0.35) < 0.001, `varsayılan ses düzeyi %35 (okunan: ${ilk.ses})`);
    assert.equal(await calan(), null, 'ilk dokunuştan önce hiçbir parça çalmaz');
    assert.equal((await sesler()).length, 0, 'dokunulmadan ses dosyası da yüklenmez');
    assert.equal(await page.locator('#sp-muzik').textContent(), 'Müzik: açık', 'üst çubuktaki müzik düğmesi');
    assert.equal(await page.locator('#sp-sound').textContent(), 'Ses: açık', 'üst çubuktaki standart ses yazısı');

    // 2) İlk tıklamadan sonra giriş ekranında sakin parça çalar ve gerçekten ilerler.
    await page.locator('#sp-home h1').click();
    await page.waitForFunction(() => {
      const a = [...document.querySelectorAll('audio')].find(x => !x.paused);
      return a && a.dataset.parca === 'son-6-son-isik' && a.currentTime > 0.2;
    }, null, { timeout: 15000 });
    const menu = await calan();
    assert.equal(menu.parca, 'son-6-son-isik', 'menüde sakin parça çalar');
    assert.equal(menu.loop, true, 'tek parçalı sahne kendi kendine döner');
    const t0 = menu.currentTime;
    await page.waitForTimeout(1200);
    const menu2 = await calan();
    assert.ok(menu2.currentTime > t0 + 0.5, `sakin parça ilerler (${t0.toFixed(2)} → ${menu2.currentTime.toFixed(2)})`);
    assert.ok(menu2.volume > 0.3 && menu2.volume <= 0.36, `ses düzeyi ~%35 (okunan: ${menu2.volume.toFixed(3)})`);
    olcum.menu = { parca: menu2.parca, currentTime: +menu2.currentTime.toFixed(2), volume: +menu2.volume.toFixed(3), paused: menu2.paused };

    // 3) Maç başlayınca ana temaya geçilir; sakin parça susar. Geçiş 1,8 sn çapraz süzülmedir.
    await page.locator('#sp-start').click();
    await page.waitForFunction(() => window.__sonPlaka.state().started, null, { timeout: 20000 });
    await page.waitForFunction(() => {
      const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.3);
      return a && a.dataset.parca === 'son-5-sifir-yercekimi' && a.currentTime > 0.2;
    }, null, { timeout: 15000 });
    const mac = await calan();
    assert.equal(mac.parca, 'son-5-sifir-yercekimi', 'maç başlayınca ana temaya geçilir');
    assert.equal((await durum()).sahne, 'mac', 'müzik sahnesi: maç');
    await page.waitForFunction(() => {
      const s = [...document.querySelectorAll('audio')].find(x => x.dataset.parca === 'son-6-son-isik');
      return s && (s.paused || s.volume === 0);
    }, null, { timeout: 10000 });
    const sakin = (await sesler()).find(s => s.parca === 'son-6-son-isik');
    assert.ok(sakin.paused, 'sakin parça maçta susar');
    olcum.mac = { parca: mac.parca, currentTime: +mac.currentTime.toFixed(2), volume: +mac.volume.toFixed(3), sakinDurdu: sakin.paused };

    // 4) Son plaka evresi (iç halka düştü, doğuş kapandı): gerilim parçası devralır.
    // Maç geri sayıma alınır: ölçüm boyunca kimse düşmesin, maç kendiliğinden bitip karneye (sakin) dönmesin —
    // sahne seçimi yalnız `respawnOpen` ve `winner` okur (bkz. src/muzik.js sahneSec), geri sayım ikisini de değiştirmez.
    await page.evaluate(() => { const w = window.__sonPlaka.world(); w.state = 'countdown'; w.t = 999; w.respawnOpen = false; });
    await page.waitForFunction(() => {
      const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.3);
      return a && a.dataset.parca === 'son-4-yorunge' && a.currentTime > 0.2;
    }, null, { timeout: 15000 });
    const doruk = await calan();
    assert.equal(doruk.parca, 'son-4-yorunge', 'son plakada gerilim parçasına geçilir');
    assert.equal((await durum()).sahne, 'doruk', 'müzik sahnesi: doruk');
    assert.equal(doruk.loop, false, 'iki parçalı sahnede döngü yok: sırayla çalınır');
    assert.equal(await page.evaluate(() => window.__sonPlaka.world().winner), null, 'ölçüm sırasında maç sürüyor');
    olcum.doruk = { parca: doruk.parca, currentTime: +doruk.currentTime.toFixed(2), volume: +doruk.volume.toFixed(3) };

    // 4b) Parça bitmeden öbürü üstüne açılır: gerilim ↔ ana tema sırayla gider, araya sessizlik girmez.
    await page.evaluate(() => {
      const a = [...document.querySelectorAll('audio')].find(x => x.dataset.parca === 'son-4-yorunge');
      a.currentTime = Math.max(0, a.duration - 2.4);
    });
    await page.waitForFunction(() => {
      const el = ad => [...document.querySelectorAll('audio')].find(x => x.dataset.parca === ad);
      const yeni = el('son-5-sifir-yercekimi'), eski = el('son-4-yorunge');
      return yeni && !yeni.paused && yeni.currentTime > 0.1 && (eski.paused || eski.volume === 0);
    }, null, { timeout: 20000 });
    const devir = await calan();
    assert.equal(devir.parca, 'son-5-sifir-yercekimi', 'gerilim parçası bitince ana tema devralır');
    olcum.devir = { parca: devir.parca, currentTime: +devir.currentTime.toFixed(2) };

    // 5) Mola: Esc sakin parçaya döner. Efekt sesi düğmesi müziği etkilemez: ikisi bağımsızdır.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.ok(await page.locator('#sp-pause').isVisible(), 'Esc duraklatma menüsünü açar');
    assert.equal(await page.locator('#sp-resume').textContent(), 'DEVAM ET →', 'standart ilk düğme');
    // Çapraz geçiş bitene kadar bekle: ortasında iki parça da yarım seslidir.
    await page.waitForFunction(() => {
      const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.3);
      return a && a.dataset.parca === 'son-6-son-isik';
    }, null, { timeout: 15000 });
    assert.equal((await durum()).sahne, 'sakin', 'molada sakin parça çalar');
    olcum.mola = { parca: (await calan()).parca, sahne: 'sakin' };

    // 5b) Moladan açılan "Kontroller F1": yardım perdesinin kendi müziği yoktur, altındaki ekranınki sürer.
    // Duraklatılmış oyunda yardıma girip çıkmak maç müziğini açıp kapatmamalı (bkz. sahneSec `yardimDonus`).
    await page.locator('#sp-pause-help').click();
    await page.waitForTimeout(2500); // çapraz geçiş süresinden uzun: yanlış parça başlasaydı duyulurdu
    assert.ok(await page.locator('#sp-help').isVisible(), 'mola menüsündeki Kontroller yardımı açar');
    assert.equal((await durum()).sahne, 'sakin', 'moladan açılan yardımda maç müziği başlamaz');
    const yardimda = await calan();
    assert.equal(yardimda.parca, 'son-6-son-isik', 'yardım perdesinde sakin parça sürer');
    olcum.yardimMolada = { parca: yardimda.parca, sahne: 'sakin' };
    await page.locator('#sp-help-close').click();
    await page.waitForTimeout(400);
    assert.ok(await page.locator('#sp-pause').isVisible(), 'yardım kapanınca molaya dönülür');
    assert.equal((await durum()).sahne, 'sakin', 'dönünce de sakin');

    await page.locator('#sp-pause-sound').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('sp.sound')), 'off', 'efekt sesi kapandı');
    await page.waitForTimeout(600);
    const efektSonrasi = await calan();
    assert.ok(efektSonrasi && efektSonrasi.volume > 0.3, 'efekt sesi kapanınca müzik durmamalı: ' + JSON.stringify(efektSonrasi));
    assert.equal((await durum()).acik, true, 'müzik ayarı efekt düğmesinden etkilenmez');
    await page.locator('#sp-pause-sound').click(); // efekt sesini geri aç
    olcum.efektBagimsiz = { parca: efektSonrasi.parca, volume: +efektSonrasi.volume.toFixed(3) };

    // 6) "Müzik: kapalı": duraklatma menüsünden kapat, müzik dursun, ayar sayfa yenilenince korunsun.
    await page.locator('#sp-pause-muzik').click();
    assert.equal(await page.locator('#sp-pause-muzik').textContent(), 'Müzik: kapalı', 'düğme kapalıyı gösterir');
    assert.equal(await page.locator('#sp-muzik').textContent(), 'Müzik: kapalı', 'üst çubuktaki düğme de aynı durumu gösterir');
    await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(a => a.paused || a.volume === 0), null, { timeout: 8000 });
    const kapaliyken = await sesler();
    assert.ok(kapaliyken.every(s => s.paused || s.volume === 0), 'müzik kapanınca hiçbir parça duyulmaz');
    assert.equal(await page.evaluate(() => localStorage.getItem('sp.muzik')), 'off', 'ayar tarayıcıda saklanır');
    olcum.kapali = kapaliyken.map(s => ({ parca: s.parca, paused: s.paused, volume: +s.volume.toFixed(3) }));

    await page.goto(url + '/?test=1&muzik=1');
    await hazir();
    assert.equal((await durum()).acik, false, 'yenilemeden sonra müzik kapalı');
    assert.equal(await page.locator('#sp-muzik').textContent(), 'Müzik: kapalı', 'yenilemeden sonra düğme de kapalı yazar');
    await page.locator('#sp-home h1').click();
    await page.waitForTimeout(2500);
    assert.equal(await calan(), null, 'müzik kapalıyken tıklamadan sonra da hiç çalmaz');
    assert.equal((await sesler()).length, 0, 'müzik kapalıyken dosya da inmez');

    // Ayarı geri aç: aynı tarayıcı profilinde kalan "kapalı" sonraki koşuyu şaşırtmasın.
    await page.locator('#sp-muzik').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('sp.muzik')), 'on', 'ayar geri açılabilir');
    await page.waitForFunction(() => {
      const a = [...document.querySelectorAll('audio')].find(x => !x.paused && x.volume > 0.2);
      return a && a.dataset.parca === 'son-6-son-isik';
    }, null, { timeout: 15000 });
  }

  // 7) Gösteri kipi: video betiği müziğini kendi ekler, oyun hiç ses öğesi kurmaz.
  await page.goto(url + '/?gosteri=1');
  await page.waitForFunction(() => !!window.__sonPlaka?.muzik, null, { timeout: 20000 });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(2000);
  assert.equal((await durum()).kapali, true, 'gösteride müzik kapalıdır');
  assert.equal((await sesler()).length, 0, '?gosteri=1 sayfasında hiç <audio> öğesi yok');
  olcum.gosteri = { kapali: true, sesOgesi: 0 };

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log(JSON.stringify(olcum, null, 2));
  console.log('Müzik dumanı testi geçti.');
} finally {
  await browser.close();
}
