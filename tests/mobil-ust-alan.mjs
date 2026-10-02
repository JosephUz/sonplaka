// Telefon görünümü: üst kısım adres çubuğunun altında kalıyor mu? Playwright'ın kendi başsız Chromium'uyla
// (kullanıcının Chrome'una ve faresine dokunmaz) telefon kipinde (isMobile, hasTouch) ana ekran ve **oda kurulmuş
// lobi** çekilir.
//
// Adres çubuğu taklidi: `visualViewport` sarmalanır — yükseklik CUBUK kadar kısalır, offsetTop CUBUK olur (Android
// Chrome'da üstteki adres çubuğunun yaptığı). Aynı CUBUK yüksekliğinde gri bir şerit de sayfaya eklenir: ekran
// görüntüsünde çubuğun neyi örttüğü görülür. Düzeltmeden önce oyunun üstü (logo, oda kodu) bu şeridin altında kalır;
// düzeltmeden sonra kök görünür alana oturduğu için hepsi şeridin altından başlar.
//
// Kullanım: GAME_URL=http://localhost:5192 ETIKET=sonra node tests/mobil-ust-alan.mjs
//   ETIKET  dosya adı öneki (artifacts/mobil-<etiket>-*.png), varsayılan "sonra"
//   MOBIL_KONTROL=0  yalnız görüntü al, doğrulama yapma (düzeltmeden önceki hal için)
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

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader'] });
const sonuc = [];
try {
  for (const ekran of EKRANLAR) {
    const context = await browser.newContext({ viewport: ekran.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await context.addInitScript(cubuk => {
      // Görünür alanı üstten kısaltan sahte adres çubuğu.
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
    }, CUBUK);

    const page = await context.newPage(), hatalar = [];
    page.on('pageerror', e => hatalar.push(e.message));
    page.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
    await page.goto(url + '/?test=1');
    await page.waitForFunction(() => !!window.__sonPlaka);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `artifacts/mobil-${etiket}-${ekran.ad}-01-ana.png` });
    // Giriş ekranı: ODA KUR düğmesinin altı görünür alanda mı, ekran ne kadar kaydırılabiliyor (kısa ekranda giriş
    // kendi içinde kaydırılır: bkz. style.css `@media(max-height:560px)`).
    const giris = await page.evaluate(() => {
      const h = document.querySelector('#sp-home'), k = document.querySelector('#sp-create');
      return { kaydirma: Math.round(h.scrollHeight - h.clientHeight), kurAlt: Math.round(k.getBoundingClientRect().bottom) };
    });

    // Dik tutuşta oyun "Telefonu yan çevir" perdesini gösterir (değişmedi, yukarıdaki görüntüde duruyor). Lobiye
    // girip ölçebilmek için perde yalnız bu testte gizlenir; oyun kuralları ve kipleri aynı kalır.
    if (ekran.ad === 'dik') await page.addStyleTag({ content: '#sp-rotate{display:none!important}' });

    // Oda kur: sunucuya bağlanınca düğme açılır (lobby.js → setServer).
    let lobi = null;
    await page.waitForSelector('#sp-create:not([disabled])', { timeout: 8000 });
    await page.locator('#sp-create').click();
    await page.waitForSelector('#sp-lobby:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/mobil-${etiket}-${ekran.ad}-02-lobi.png` });

    const olc = async sec => page.locator(sec).boundingBox();
    const kod = await olc('#sp-lobby-code'), baslik = await olc('#sp-lobby-title'), ust = await olc('#son-plaka header');
    const kodMetni = (await page.locator('#sp-lobby-code').textContent()).trim();
    lobi = { kod, baslik, ust, kodMetni };
    const gorunur = { ust: CUBUK, alt: ekran.viewport.height };
    const icerde = k => !!k && k.y >= gorunur.ust - 0.5 && k.y + k.height <= gorunur.alt + 0.5;
    const satir = {
      ekran: ekran.ad, kod: kodMetni,
      odaKoduGorunur: icerde(kod), lobiBasligiGorunur: icerde(baslik), ustCubukGorunur: icerde(ust),
      kodY: kod && Math.round(kod.y), ustY: ust && Math.round(ust.y),
      // Giriş ekranı: ODA KUR düğmesinin altı görünür alanda mı, ekran ne kadar kaydırılabiliyor.
      odaKurAlt: giris.kurAlt, odaKurGorunur: giris.kurAlt <= ekran.viewport.height + 0.5, girisKaydirma: giris.kaydirma,
    };
    sonuc.push(satir);
    console.log(JSON.stringify(satir));

    if (kontrol) {
      assert.ok(/^[A-Z0-9-]{4,10}$/.test(kodMetni), `oda kodu okunamadı: "${kodMetni}"`);
      assert.ok(icerde(kod), `${ekran.ad}: oda kodu görünür alanın dışında (y=${kod?.y})`);
      assert.ok(icerde(baslik), `${ekran.ad}: lobi başlığı görünür alanın dışında (y=${baslik?.y})`);
      assert.ok(icerde(ust), `${ekran.ad}: üst çubuk görünür alanın dışında (y=${ust?.y})`);
      assert.ok(satir.odaKurGorunur, `${ekran.ad}: giriş ekranında ODA KUR düğmesi görünür alanın dışında (alt=${giris.kurAlt})`);
      if (ekran.ad === 'yatay') assert.equal(giris.kaydirma, 0, 'yatay telefonda giriş ekranı kaydırmadan sığmalı');
      assert.deepEqual(hatalar, [], 'tarayıcı hataları: ' + hatalar.join(' | '));
    }
    await context.close();
  }
  console.log(`Telefon görünümü ekran görüntüleri: artifacts/mobil-${etiket}-*.png`);
  if (kontrol) console.log('Üst kısım adres çubuğunun altında kalmıyor: oda kodu, lobi başlığı ve üst çubuk görünür alanda.');
} finally {
  await browser.close();
}
