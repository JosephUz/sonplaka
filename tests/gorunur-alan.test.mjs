// Görünür alana kilitleme (src/gorunur-alan.js): telefonda tarayıcı çubuklarının bıraktığı alanın ölçüsü ve kilidin
// yazdığı CSS değişkenleri. Tarayıcı gerekmez: ölçü hesabı saf işlev, kilit ise sahte bir pencereyle denenir.
//
// Sınır: burası birim testidir, gerçek tarayıcı davranışını kanıtlamaz. Gerçek Chromium'da ölçülen sonuç için
// tests/mobil-ust-alan.mjs'e bak (orada hangi senaryonun gerçek, hangisinin taklit olduğu yazılı).
import assert from 'node:assert/strict';
import test from 'node:test';
import { KLAVYE_ESIGI, gorunurAlanaKilitle, olcumler } from '../src/gorunur-alan.js';

test('görünür alan ölçüleri visualViewport değerlerinden gelir', () => {
  const o = olcumler({ vvH: 334, vvW: 844, vvTop: 56, vvLeft: 0, innerH: 390, innerW: 844 });
  assert.deepEqual(o, { kilit: true, h: 334, w: 844, top: 56, left: 0, klavye: false });
});

test('visualViewport yoksa pencere ölçüsüne düşer', () => {
  const o = olcumler({ innerH: 390, innerW: 844 });
  assert.equal(o.h, 390);
  assert.equal(o.w, 844);
  assert.equal(o.top, 0);
});

test('Android Chrome durumu: çubuk görünür alanı kısaltır ama ofset 0 kalır', () => {
  // Gerçek Android Chrome'da adres çubuğu düzen görünümünü de kısaltır: offsetTop 0'dır, yükseklik küçüktür.
  // Kilit burada kökün boyunu doğru verir (vh yerine): asıl iş --vv-h'de, --vv-top'ta değil.
  const o = olcumler({ vvH: 334, vvW: 844, vvTop: 0, innerH: 334, innerW: 844 }, 390);
  assert.equal(o.h, 334);
  assert.equal(o.top, 0);
  assert.equal(o.kilit, true);
});

test('iOS / yakınlaştırma durumu: görünür alan aşağı inince ofset uygulanır', () => {
  // offsetTop yalnız görünür alan düzen görünümünün içinde kaydığında 0'dan büyük olur (iOS çubuk geri gelirken).
  const o = olcumler({ vvH: 334, vvW: 844, vvTop: 56 }, 390);
  assert.equal(o.h, 334);
  assert.equal(o.top, 56);
  assert.equal(o.klavye, false);
});

test('yakınlaştırmada kilit kapanır: masaüstü ve iOS yakınlaştırma davranışı değişmesin', () => {
  const o = olcumler({ vvH: 200, vvW: 400, vvTop: 90, vvLeft: 120, olcek: 2.5, innerH: 390, innerW: 844 }, 390);
  assert.equal(o.kilit, false, 'scale > 1 iken kök serbest bırakılmalı');
  assert.equal(o.top, 0);
  assert.equal(o.left, 0);
});

test('ölçek 1 (ya da bildirilmemiş) ise kilit çalışır', () => {
  assert.equal(olcumler({ vvH: 334, vvW: 844, olcek: 1 }).kilit, true);
  assert.equal(olcumler({ vvH: 334, vvW: 844 }).kilit, true);
});

test('oda kodu yazarken klavye açılınca yükseklik korunur, ofset de dondurulur', () => {
  // Klavye görünür alanı hem kısaltır hem aşağı indirir. Yükseklik taban kalırken ofset büyüseydi kök ekranın
  // altına taşardı: ikisi birlikte dondurulur.
  const o = olcumler({ vvH: 180, vvW: 844, vvTop: 120, yaziGirisi: true }, 390);
  assert.equal(o.klavye, true, 'klavye olarak görülmeli');
  assert.equal(o.h, 390, 'içerik bozulmasın diye son kararlı yükseklik kalır');
  assert.equal(o.top, 0, 'yükseklik donduysa ofset de donar, yoksa kök alttan taşar');
});

test('yazı girişi odaktayken bile küçük kısalma (eşiğin üstünde) uygulanır', () => {
  const h = Math.round(390 * KLAVYE_ESIGI) + 5;
  const o = olcumler({ vvH: h, vvW: 844, yaziGirisi: true }, 390);
  assert.equal(o.klavye, false);
  assert.equal(o.h, h);
});

test('eksik ya da negatif ofsetler sıfırlanır', () => {
  const o = olcumler({ vvH: 334, vvW: 844, vvTop: -3 });
  assert.equal(o.top, 0);
  assert.equal(o.left, 0);
});

/** Sahte pencere: CSS değişkenlerini ve sınıfları toplayan en küçük DOM. */
function sahtePencere({ h, w, top = 0, left = 0, olcek = 1, vvYok = false } = {}) {
  const degiskenler = new Map(), siniflar = new Set(), dinleyiciler = new Map();
  const kaydet = (hedef, tur, fn) => { if (!hedef.has(tur)) hedef.set(tur, new Set()); hedef.get(tur).add(fn); };
  const vv = {
    height: h, width: w, offsetTop: top, offsetLeft: left, scale: olcek,
    addEventListener: (tur, fn) => kaydet(dinleyiciler, 'vv:' + tur, fn),
    removeEventListener: (tur, fn) => dinleyiciler.get('vv:' + tur)?.delete(fn),
  };
  const doc = {
    activeElement: null,
    documentElement: {
      style: {
        setProperty: (k, v) => degiskenler.set(k, v),
        removeProperty: k => degiskenler.delete(k),
      },
      classList: {
        add: (...c) => c.forEach(x => siniflar.add(x)),
        remove: (...c) => c.forEach(x => siniflar.delete(x)),
        toggle: (c, on) => (on ? siniflar.add(c) : siniflar.delete(c)),
      },
    },
    addEventListener: (tur, fn) => kaydet(dinleyiciler, 'doc:' + tur, fn),
    removeEventListener: (tur, fn) => dinleyiciler.get('doc:' + tur)?.delete(fn),
  };
  const kaydirma = [];
  const win = {
    document: doc, visualViewport: vvYok ? undefined : vv,
    innerHeight: h, innerWidth: w, scrollX: 0, scrollY: 0,
    setTimeout: () => 0,
    scrollTo: (x, y) => kaydirma.push([x, y]),
    addEventListener: (tur, fn) => kaydet(dinleyiciler, 'win:' + tur, fn),
    removeEventListener: (tur, fn) => dinleyiciler.get('win:' + tur)?.delete(fn),
  };
  return { win, vv, degiskenler, siniflar, kaydirma, tetikle: ad => dinleyiciler.get(ad)?.forEach(fn => fn()) };
}

test('kilit CSS değişkenlerini ve vv sınıfını yazar', () => {
  const p = sahtePencere({ h: 334, w: 844, top: 56 });
  const kilit = gorunurAlanaKilitle(p.win);
  assert.ok(p.siniflar.has('vv'), 'style.css kuralları için vv sınıfı eklenmeli');
  assert.equal(p.degiskenler.get('--vv-h'), '334px');
  assert.equal(p.degiskenler.get('--vv-w'), '844px');
  assert.equal(p.degiskenler.get('--vv-top'), '56px');
  assert.equal(p.degiskenler.get('--vv-left'), '0px');
  kilit.birak();
  assert.ok(!p.siniflar.has('vv'));
  assert.equal(p.degiskenler.size, 0);
});

test('adres çubuğu açılıp kapanınca (visualViewport resize) değişkenler güncellenir', () => {
  const p = sahtePencere({ h: 390, w: 844 });
  gorunurAlanaKilitle(p.win);
  assert.equal(p.degiskenler.get('--vv-h'), '390px');
  p.vv.height = 334; p.vv.offsetTop = 56;
  p.tetikle('vv:resize');
  assert.equal(p.degiskenler.get('--vv-h'), '334px');
  assert.equal(p.degiskenler.get('--vv-top'), '56px');
});

test('yakınlaştırınca kök serbest kalır, uzaklaşınca kilit geri gelir', () => {
  const p = sahtePencere({ h: 390, w: 844 });
  gorunurAlanaKilitle(p.win);
  assert.ok(p.siniflar.has('vv'));
  p.vv.scale = 2; p.vv.height = 195; p.vv.offsetTop = 80;
  p.tetikle('vv:resize');
  assert.ok(!p.siniflar.has('vv'), 'yakınlaştırmada vv sınıfı kalkmalı (CSS yedeği çalışsın)');
  assert.equal(p.degiskenler.size, 0, 'değişkenler silinmeli, yoksa eski ölçü yapışık kalır');
  p.vv.scale = 1; p.vv.height = 390; p.vv.offsetTop = 0;
  p.tetikle('vv:resize');
  assert.ok(p.siniflar.has('vv'));
  assert.equal(p.degiskenler.get('--vv-h'), '390px');
});

test('yakınlaştırmadayken sayfa başa alınmaz (kullanıcı baktığı yeri kaybetmesin)', () => {
  const p = sahtePencere({ h: 390, w: 844, olcek: 2 });
  gorunurAlanaKilitle(p.win);
  p.win.scrollY = 40;
  p.tetikle('win:scroll');
  assert.deepEqual(p.kaydirma, [], 'yakınlaştırmada scrollTo çağrılmamalı');
});

test('sayfa kayarsa başa alınır (iOS overflow:hidden olmasına rağmen kaydırır)', () => {
  const p = sahtePencere({ h: 390, w: 844 });
  gorunurAlanaKilitle(p.win);
  p.win.scrollY = 40;
  p.tetikle('win:scroll');
  assert.deepEqual(p.kaydirma.at(-1), [0, 0]);
});

test('visualViewport desteklenmeyen tarayıcıda hiçbir şey yazılmaz (CSS yedeği çalışır)', () => {
  const p = sahtePencere({ h: 390, w: 844, vvYok: true });
  gorunurAlanaKilitle(p.win);
  assert.equal(p.siniflar.size, 0);
  assert.equal(p.degiskenler.size, 0);
});
