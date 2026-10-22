// Telefon görünümü: oyunun üst kısmı (üst çubuk, lobi başlığı, oda kodu) tarayıcı çubuklarının altında kalıyor mu?
// Playwright'ın kendi başsız Chromium'uyla (kullanıcının Chrome'una ve faresine dokunmaz) telefon kipinde
// (isMobile, hasTouch) ana ekran ve **oda kurulmuş lobi** çekilir.
//
// ## Senaryolar ve neyin gerçek, neyin taklit olduğu
//
// Başsız Chromium'un adres çubuğu yoktur; telefon tarayıcısının iki ayrı davranışı ayrı ayrı kurulur:
//
// A) `cubuk` — **GERÇEK, taklitsiz.** Sayfa yüklendikten sonra viewport CUBUK kadar kısaltılır. Android Chrome
//    adres çubuğu belirince tam olarak bunu yapar: düzen görünümünü (layout viewport) de kısaltır, bu yüzden
//    `visualViewport.offsetTop` **0** kalır ve `position:fixed;inset:0` zaten görünen alana oturur.
//    **Sınır:** başsız tarayıcıda gerçek çubuk olmadığı için burada `vh` de kısalır — gerçek telefonda kısalmaz.
//    Yani bu senaryo hatayı yeniden üretmez; **gerileme koruması**dır: kilit bu en yaygın durumda hiçbir şeyi
//    bozmamalı (düzeltmesiz yapı da geçer, geçmesi beklenir).
//
// B) `uzun-duzen` — **TAKLİT, ama telefonun gerçek durumu.** Viewport olduğu gibi kalır (yani `vh` ve
//    `position:fixed` TAM yüksekliği görür) ve `visualViewport` sarmalanır: yükseklik CUBUK kadar az, offsetTop
//    CUBUK. Gerçek telefonda düzen görünümünün görünür alandan uzun olması tam olarak budur ve iki yerde olur:
//    iOS Safari'de (çubuklar görünürken) ve her mobil tarayıcıda `100vh`'in çubuksuz "büyük görünüm" olmasında.
//    **Belirtiyi yeniden üreten senaryo budur**; aşağıdaki iddialar buna bakar.
//    Taklidin sınırı: gerçek `visualViewport` nesnesi sarmalanıyor, tarayıcıya gerçekten çubuk çizdirilmiyor.
//    Ekran görüntüsünde çubuğun neyi örttüğü görünsün diye aynı yükseklikte gri bir şerit de eklenir.
//
// Sayfanın kayması (iOS `overflow:hidden`e rağmen kaydırır) burada denenemez: Chromium `overflow:hidden` ile
// gerçekten kaydırmaz. O yol birim testinde (tests/gorunur-alan.test.mjs → "sayfa kayarsa başa alınır").
//
// Kullanım: GAME_URL=http://localhost:5192 ETIKET=sonra node tests/mobil-ust-alan.mjs
//   ETIKET  dosya adı öneki (artifacts/mobil-<etiket>-*.png), varsayılan "sonra"
//   MOBIL_KONTROL=0  yalnız görüntü al ve ölç, doğrulama yapma (düzeltmeden önceki hal için)
//   PLAYWRIGHT_MODULE  başka bir Playwright kurulumu (file:// URL)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = (process.env.GAME_URL || 'http://localhost:5187').replace(/\/$/, '');
const etiket = process.env.ETIKET || 'sonra';
const kontrol = process.env.MOBIL_KONTROL !== '0';
const CUBUK = 56; // tarayıcı adres çubuğu yüksekliği (Android Chrome ~56 CSS px)
const EKRANLAR = [
  { ad: 'yatay', viewport: { width: 844, height: 390 } },
  { ad: 'dik', viewport: { width: 390, height: 844 } },
];
const SENARYOLAR = [
  // gercek: taklit yok. kisalt: sayfa yüklendikten sonra viewport kısaltılsın mı. sahteVV: visualViewport sarmalansın mı.
  { ad: 'cubuk', gercek: true, kisalt: true, sahteVV: false, iddia: false },
  { ad: 'uzun-duzen', gercek: false, kisalt: false, sahteVV: true, iddia: true },
];

/** visualViewport'u CUBUK kadar kısaltan sarmalayıcı + ekran görüntüsünde görünsün diye gri şerit. */
function sahteCubukBetigi(cubuk) {
  const gercek = window.visualViewport;
  const sahte = {
    get width() { return gercek.width; },
    get height() { return Math.max(0, gercek.height - cubuk); },
    get offsetTop() { return cubuk; },
    get offsetLeft() { return gercek.offsetLeft; },
    get pageTop() { return gercek.pageTop; },
    get pageLeft() { return gercek.pageLeft; },
    get scale() { return gercek.scale; },
    addEventListener: (...a) => gercek.addEventListener(...a),
    removeEventListener: (...a) => gercek.removeEventListener(...a),
    dispatchEvent: (...a) => gercek.dispatchEvent(...a),
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => sahte });
  addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div');
    el.id = 'sahte-adres-cubugu';
    el.style.cssText = `position:fixed;left:0;top:0;width:100%;height:${cubuk}px;z-index:2147483647;display:flex;align-items:center;gap:10px;`
      + 'background:#30343a;color:#dfe3e8;font:13px system-ui,sans-serif;padding:0 14px;box-sizing:border-box;border-bottom:1px solid #000;pointer-events:none';
    el.textContent = '🔒  sonplaka.josephuz.com';
    document.body.appendChild(el);
  });
}

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader'] });
const sonuc = [];
try {
  for (const senaryo of SENARYOLAR) {
    for (const ekran of EKRANLAR) {
      const context = await browser.newContext({ locale: 'tr-TR', viewport: { ...ekran.viewport }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      if (senaryo.sahteVV) await context.addInitScript(sahteCubukBetigi, CUBUK);

      const page = await context.newPage(), hatalar = [];
      page.on('pageerror', e => hatalar.push(e.message));
      page.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
      await page.goto(url + '/?test=1');
      await page.waitForFunction(() => !!window.__sonPlaka);
      // Çubuk belirir: Android Chrome'un yaptığı gibi görünüm kısalır (gerçek resize olayı, taklit yok).
      if (senaryo.kisalt) {
        await page.setViewportSize({ width: ekran.viewport.width, height: ekran.viewport.height - CUBUK });
      }
      await page.waitForTimeout(900);

      // Görünür alan: kısaltma senaryosunda viewport'un tamamı, taklit senaryosunda üstteki CUBUK hariç.
      const gorunur = senaryo.kisalt
        ? { ust: 0, alt: ekran.viewport.height - CUBUK }
        : { ust: CUBUK, alt: ekran.viewport.height };
      const on = `${senaryo.ad}-${ekran.ad}`;
      await page.screenshot({ path: `artifacts/mobil-${etiket}-${on}-01-ana.png` });

      // Dik tutuşta oyun "Telefonu yan çevir" perdesini gösterir (değişmedi, yukarıdaki görüntüde duruyor). Lobiye
      // girip ölçebilmek için perde yalnız bu testte gizlenir; oyun kuralları ve kipleri aynı kalır.
      if (ekran.ad === 'dik') await page.addStyleTag({ content: '#sp-rotate{display:none!important}' });

      // Oda kur: sunucuya bağlanınca düğme açılır (lobby.js → setServer).
      await page.waitForSelector('#sp-create:not([disabled])', { timeout: 8000 });
      await page.locator('#sp-create').click();
      await page.waitForSelector('#sp-lobby:not([hidden])', { timeout: 8000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `artifacts/mobil-${etiket}-${on}-02-lobi.png` });

      const olc = async sec => page.locator(sec).boundingBox();
      const kod = await olc('#sp-lobby-code'), baslik = await olc('#sp-lobby-title'), ust = await olc('#son-plaka header');
      const kart = await olc('#sp-lobby .card');
      const kodMetni = (await page.locator('#sp-lobby-code').textContent()).trim();
      const icerde = k => !!k && k.y >= gorunur.ust - 0.5 && k.y + k.height <= gorunur.alt + 0.5;
      const satir = {
        senaryo: senaryo.ad, ekran: ekran.ad, gercek: senaryo.gercek, kod: kodMetni,
        gorunurUst: gorunur.ust, gorunurAlt: gorunur.alt,
        odaKoduGorunur: icerde(kod), lobiBasligiGorunur: icerde(baslik), ustCubukGorunur: icerde(ust),
        kodY: kod && Math.round(kod.y), ustY: ust && Math.round(ust.y),
        // Lobi kartı görünür alana sığıyor mu: `max-height:92vh` mobilde çubuksuz (büyük) görünüme göre ölçülür,
        // bu yüzden kart görünenden uzun olup üstten taşabilir — oda kodu kartın tepesinde olduğu için kaybolur.
        kartUst: kart && Math.round(kart.y), kartAlt: kart && Math.round(kart.y + kart.height), kartSigdi: icerde(kart),
        hatalar,
      };
      sonuc.push(satir);
      console.log(JSON.stringify(satir));

      if (kontrol && senaryo.iddia) {
        assert.ok(/^[A-Z0-9-]{4,10}$/.test(kodMetni), `${on}: oda kodu okunamadı: "${kodMetni}"`);
        assert.ok(icerde(kod), `${on}: oda kodu görünür alanın dışında (y=${kod?.y}, görünür ${gorunur.ust}..${gorunur.alt})`);
        assert.ok(icerde(baslik), `${on}: lobi başlığı görünür alanın dışında (y=${baslik?.y})`);
        assert.ok(icerde(ust), `${on}: üst çubuk görünür alanın dışında (y=${ust?.y})`);
        assert.ok(icerde(kart), `${on}: lobi kartı görünür alana sığmıyor (${satir.kartUst}..${satir.kartAlt})`);
        assert.deepEqual(hatalar, [], `${on}: tarayıcı hataları: ` + hatalar.join(' | '));
      }
      if (kontrol && !senaryo.iddia) {
        // Gerileme koruması: kilit, çubuğun görünümü kısalttığı (en yaygın) durumda üstü bozmamalı.
        assert.ok(icerde(ust), `${on}: üst çubuk görünür alanın dışında (y=${ust?.y})`);
        assert.ok(icerde(kod), `${on}: oda kodu görünür alanın dışında (y=${kod?.y})`);
        assert.deepEqual(hatalar, [], `${on}: tarayıcı hataları: ` + hatalar.join(' | '));
      }
      await context.close();
    }
  }
  console.log(`Telefon görünümü ekran görüntüleri: artifacts/mobil-${etiket}-*.png`);
  if (kontrol) console.log('Üst kısım tarayıcı çubuğunun altında kalmıyor: oda kodu, lobi başlığı, üst çubuk ve lobi kartı görünür alanda.');

  // Yakınlaştırma: kilit kapanmalı, yoksa kullanıcı yakınlaştırınca oyun küçülüp kayar (masaüstünde trackpad,
  // iOS'ta çift parmak — iOS `user-scalable=no` ayarını yok sayar). Taklit yok: sayfa ölçeği gerçekten CDP
  // (Emulation.setPageScaleFactor) ile değiştirilir, `visualViewport.scale` buna göre gerçekten 2 olur.
  {
    const context = await browser.newContext({ locale: 'tr-TR', viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(url + '/?test=1');
    await page.waitForFunction(() => !!window.__sonPlaka);
    const oku = () => page.evaluate(() => ({
      olcek: +visualViewport.scale.toFixed(2),
      kilit: document.documentElement.classList.contains('vv'),
      kokH: Math.round(document.querySelector('#son-plaka').getBoundingClientRect().height),
    }));
    const cdp = await context.newCDPSession(page);
    const normal = await oku();
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await page.waitForTimeout(400);
    const yakin = await oku();
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await page.waitForTimeout(400);
    const geri = await oku();
    console.log(JSON.stringify({ senaryo: 'yakinlastirma', normal, yakin, geri }));
    if (kontrol) {
      assert.equal(normal.kilit, true, 'ölçek 1 iken kök görünür alana kilitli olmalı');
      assert.equal(yakin.olcek, 2, 'sayfa ölçeği gerçekten 2 olmalı (yoksa deney kurulmamış)');
      assert.equal(yakin.kilit, false, 'yakınlaştırmada kilit kapanmalı');
      assert.equal(yakin.kokH, normal.kokH, `yakınlaştırmada oyun küçülmemeli (${normal.kokH} → ${yakin.kokH})`);
      assert.equal(geri.kilit, true, 'uzaklaşınca kilit geri gelmeli');
      assert.equal(geri.kokH, normal.kokH);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
