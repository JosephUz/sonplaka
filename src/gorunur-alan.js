/**
 * Görünür alana kilitleme — telefon tarayıcılarında üst kısmın adres çubuğunun altında kalmasını engeller.
 *
 * Sorun: oyun kökü `position:fixed;inset:0` ile **düzen görünümünü** (layout viewport) doldurur. Telefon tarayıcısında
 * adres çubuğu açıkken gerçekten görünen alan (visual viewport) bundan kısadır ve üstten kayabilir; üst çubuk, oda adı
 * ve oda kodu görünmeyen bölgede kalır. iOS Safari ayrıca `overflow:hidden` olmasına rağmen sayfayı kaydırabilir.
 *
 * Çözüm: `window.visualViewport`'tan okunan ölçüler CSS değişkeni olarak belgeye yazılır ve kök bu dikdörtgene
 * oturtulur (bkz. style.css → `html.vv`):
 *   `--vv-h` yükseklik · `--vv-w` genişlik · `--vv-top` üst ofset · `--vv-left` sol ofset
 * `visualViewport` yoksa hiçbir şey yazılmaz, `vv` sınıfı eklenmez: CSS kendi `100dvh` / `100%` yedeğinde kalır.
 *
 * Klavye: oda kodu yazarken görünür alan yarıya iner. O an kök küçültülürse lobi ve giriş ekranı bozulur; bu yüzden
 * yazı girişi odaktayken ve alan KLAVYE_ESIGI'nden fazla kısaldıysa son kararlı yükseklik korunur.
 *
 * Bu dosya oyuna bağlı değildir: dört oyunda da aynısı kullanılır (yalnız `style.css`'teki `html.vv` kuralları
 * oyunun köküne göre yazılır).
 */

/** Görünür alan bu oranın altına inerse sebep açılan klavyedir: yükseklik küçültülmez. */
export const KLAVYE_ESIGI = 0.75;

/** Yazı girişi sayılan öğeler (klavye bunlar için açılır). */
const YAZI_GIRISI = 'input:not([type=radio]):not([type=checkbox]):not([type=button]),textarea,[contenteditable=""],[contenteditable="true"]';

/**
 * Ham görünüm ölçülerinden kökün oturacağı dikdörtgeni hesaplar (saf işlev: testten de çağrılır).
 * @param {{vvH?:number,vvW?:number,vvTop?:number,vvLeft?:number,innerH?:number,innerW?:number,yaziGirisi?:boolean}} g
 * @param {number} sabitH son kararlı (klavyesiz) yükseklik; yoksa 0
 * @returns {{h:number,w:number,top:number,left:number,klavye:boolean}}
 */
export function olcumler(g, sabitH = 0) {
  const h = Math.round(g.vvH || g.innerH || 0);
  const w = Math.round(g.vvW || g.innerW || 0);
  const taban = Math.round(sabitH || 0);
  const klavye = !!g.yaziGirisi && taban > 0 && h > 0 && h < taban * KLAVYE_ESIGI;
  return {
    h: klavye ? taban : h,
    w,
    top: Math.max(0, Math.round(g.vvTop || 0)),
    left: Math.max(0, Math.round(g.vvLeft || 0)),
    klavye,
  };
}

/** Odaktaki öğe yazı girişi mi (klavye açık olabilir). */
function yaziGirisiOdakta(doc) {
  const el = doc.activeElement;
  return !!el && typeof el.matches === 'function' && el.matches(YAZI_GIRISI);
}

/**
 * Kökü görünür alana kilitler: CSS değişkenlerini yazar, `resize` / `scroll` / yön değişiminde günceller ve sayfanın
 * kaymasını geri alır. `visualViewport` desteklenmiyorsa sessizce hiçbir şey yapmaz (CSS yedeği devreye girer).
 * @returns {{guncelle:()=>void, birak:()=>void}} güncelle: elle yenile · birak: dinleyicileri kaldır
 */
export function gorunurAlanaKilitle(win = globalThis) {
  const doc = win.document;
  const vv = win.visualViewport;
  if (!doc || !vv) return { guncelle() {}, birak() {} };
  const kok = doc.documentElement;
  let sabitH = 0;

  const uygula = () => {
    const o = olcumler({
      vvH: vv.height, vvW: vv.width, vvTop: vv.offsetTop, vvLeft: vv.offsetLeft,
      innerH: win.innerHeight, innerW: win.innerWidth,
      yaziGirisi: yaziGirisiOdakta(doc),
    }, sabitH);
    if (!o.klavye) sabitH = o.h;
    kok.style.setProperty('--vv-h', o.h + 'px');
    kok.style.setProperty('--vv-w', o.w + 'px');
    kok.style.setProperty('--vv-top', o.top + 'px');
    kok.style.setProperty('--vv-left', o.left + 'px');
    kok.classList.toggle('vv-klavye', o.klavye);
    return o;
  };

  // Sayfa kaymasın: iOS `overflow:hidden` olmasına rağmen kaydırır ve sabit kök görünmez bölgeye çıkar. Klavye
  // açıkken tarayıcı girişi göstermek için kaydırır; o an karışma.
  const basaAl = () => {
    if (yaziGirisiOdakta(doc)) return;
    if (win.scrollX || win.scrollY) win.scrollTo(0, 0);
  };

  const yenile = () => { uygula(); basaAl(); };
  // Yön değişiminde ve klavye kapanışında tarayıcı eski ölçüyü verebilir: biraz sonra bir kez daha oku.
  const gecikmeliYenile = () => { yenile(); win.setTimeout(yenile, 120); win.setTimeout(yenile, 400); };

  kok.classList.add('vv');
  gecikmeliYenile();
  vv.addEventListener('resize', yenile);
  vv.addEventListener('scroll', yenile);
  win.addEventListener('resize', yenile);
  win.addEventListener('orientationchange', gecikmeliYenile);
  win.addEventListener('scroll', basaAl, { passive: true });
  doc.addEventListener('focusin', gecikmeliYenile);
  doc.addEventListener('focusout', gecikmeliYenile);

  return {
    guncelle: yenile,
    birak() {
      vv.removeEventListener('resize', yenile);
      vv.removeEventListener('scroll', yenile);
      win.removeEventListener('resize', yenile);
      win.removeEventListener('orientationchange', gecikmeliYenile);
      win.removeEventListener('scroll', basaAl);
      doc.removeEventListener('focusin', gecikmeliYenile);
      doc.removeEventListener('focusout', gecikmeliYenile);
      kok.classList.remove('vv', 'vv-klavye');
      for (const ad of ['--vv-h', '--vv-w', '--vv-top', '--vv-left']) kok.style.removeProperty(ad);
    },
  };
}
