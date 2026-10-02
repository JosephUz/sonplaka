/**
 * Görünür alana kilitleme — telefon tarayıcılarında oyunun üst kısmının (üst çubuk, oda adı, oda kodu) tarayıcı
 * çubuklarının altında kalmasını engeller.
 *
 * ## Ne oluyor (ölçülen davranış, varsayım değil)
 *
 * "Adres çubuğu" tek bir durum değil, üç ayrı durum var ve hepsi aynı belirtiyi veriyor:
 *
 * 1. **Çubuk görünür alanı kısaltıyor (Android Chrome, masaüstü dahil her yerde).** Burada `visualViewport.offsetTop`
 *    **0'dır**: tarayıcı düzen görünümünü (layout viewport) de kısaltır, `position:fixed;inset:0` zaten görünen
 *    alana oturur. Üst çubuk çubuğun altında kalmaz — ama **`vh` ile ölçülen her şey taşar**, çünkü mobil tarayıcıda
 *    `100vh` çubuksuz (büyük) görünümdür, gerçek alandan ~56 px fazladır. Bizdeki belirti: kart (`max-height:92vh`)
 *    ve giriş ekranı ekrandan taşıyor. **Çözen parça: `--vv-h` / `100dvh`**, `vh` değil.
 * 2. **Sayfa kayıyor (iOS Safari).** iOS, `overflow:hidden` olmasına rağmen sayfayı kaydırabilir (sıçrama, çubuk
 *    gizlenirken, bağlantıdan dönüşte). Sayfa kayınca `position:fixed` kök de yukarı çıkar ve üstü görünmez olur.
 *    **Çözen parça: `basaAl()`**.
 * 3. **Görünür alan düzen görünümünün içinde aşağı iniyor** — klavye açılınca, yakınlaştırılıp kaydırılınca ve iOS
 *    Safari'de çubuk geri gelirken. Yalnız bu durumda `visualViewport.offsetTop > 0` olur.
 *    **Çözen parça: `--vv-top` / `--vv-left`**.
 *
 * Yani `--vv-top` tek başına "adres çubuğu düzeltmesi" değil; asıl işi (1) ve (2) görür. Üçü birlikte kökü
 * **gerçekten görünen** dikdörtgene oturtur.
 *
 * ## Nasıl
 *
 * `window.visualViewport`'tan okunan ölçüler CSS değişkeni olarak belgeye yazılır ve kök bu dikdörtgene oturtulur
 * (bkz. style.css → `html.vv`):
 *   `--vv-h` yükseklik · `--vv-w` genişlik · `--vv-top` üst ofset · `--vv-left` sol ofset
 * `visualViewport` yoksa hiçbir şey yazılmaz, `vv` sınıfı eklenmez: CSS kendi `100dvh` / `100%` yedeğinde kalır.
 *
 * **Yakınlaştırma (`scale > 1`): kilit kapanır.** Kullanıcı yakınlaştırınca görünür alan sayfanın küçük bir
 * penceresidir; kök oraya kilitlenirse yakınlaştırılan yer kayar ve kullanıcı baktığı şeyi kaybeder. Masaüstünde
 * trackpad ile, iOS'ta çift parmakla (`user-scalable=no` yok sayılır) olur. O an değişkenler silinir, `vv` sınıfı
 * kalkar ve CSS yedeği (`100dvh` / `100%`) devreye girer: oyun yakınlaştırma öncesi davranışına döner.
 *
 * **Klavye:** oda kodu yazarken görünür alan yarıya iner. O an kök küçültülürse lobi ve giriş ekranı bozulur; bu
 * yüzden yazı girişi odaktayken ve alan KLAVYE_ESIGI'nden fazla kısaldıysa son kararlı yükseklik korunur. Yükseklik
 * donduğu için **ofset de dondurulur**: tarayıcı girişi göstermek için görünür alanı aşağı kaydırırken `--vv-top`
 * büyümeye devam etseydi, taban yükseklikteki kök ekranın altına taşardı.
 *
 * Bu dosya oyuna bağlı değildir: dört oyunda da aynısı kullanılır (yalnız `style.css`'teki `html.vv` kuralları
 * oyunun köküne göre yazılır).
 */

/** Görünür alan bu oranın altına inerse sebep açılan klavyedir: yükseklik küçültülmez. */
export const KLAVYE_ESIGI = 0.75;

/** Bu ölçeğin üstünde kullanıcı yakınlaştırmıştır: kilit uygulanmaz (yuvarlama payı bırakılır). */
export const OLCEK_ESIGI = 1.01;

/** Yazı girişi sayılan öğeler (klavye bunlar için açılır). */
const YAZI_GIRISI = 'input:not([type=radio]):not([type=checkbox]):not([type=button]),textarea,[contenteditable=""],[contenteditable="true"]';

/**
 * Ham görünüm ölçülerinden kökün oturacağı dikdörtgeni hesaplar (saf işlev: testten de çağrılır).
 * `kilit:false` dönerse kök serbest bırakılır (CSS yedeği çalışır).
 * @param {{vvH?:number,vvW?:number,vvTop?:number,vvLeft?:number,olcek?:number,innerH?:number,innerW?:number,yaziGirisi?:boolean}} g
 * @param {number} sabitH son kararlı (klavyesiz) yükseklik; yoksa 0
 * @returns {{kilit:boolean,h:number,w:number,top:number,left:number,klavye:boolean}}
 */
export function olcumler(g, sabitH = 0) {
  const h = Math.round(g.vvH || g.innerH || 0);
  const w = Math.round(g.vvW || g.innerW || 0);
  const taban = Math.round(sabitH || 0);
  // Yakınlaştırmada kilit yok: kullanıcı yakınlaştırdığı yeri kaybetmesin (masaüstü trackpad, iOS çift parmak).
  if ((Number(g.olcek) || 1) > OLCEK_ESIGI) return { kilit: false, h, w, top: 0, left: 0, klavye: false };
  const klavye = !!g.yaziGirisi && taban > 0 && h > 0 && h < taban * KLAVYE_ESIGI;
  return {
    kilit: true,
    h: klavye ? taban : h,
    w,
    // Klavye açıkken yükseklik donduruldu: ofset de dondurulur, yoksa kök görünür alanın altına taşar.
    top: klavye ? 0 : Math.max(0, Math.round(g.vvTop || 0)),
    left: klavye ? 0 : Math.max(0, Math.round(g.vvLeft || 0)),
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
  const DEGISKENLER = ['--vv-h', '--vv-w', '--vv-top', '--vv-left'];
  let sabitH = 0;

  /** Kökü serbest bırakır: CSS kendi `100dvh` / `100%` yedeğine döner (yakınlaştırma). */
  const serbest = () => {
    kok.classList.remove('vv');
    for (const ad of DEGISKENLER) kok.style.removeProperty(ad);
  };

  const uygula = () => {
    const o = olcumler({
      vvH: vv.height, vvW: vv.width, vvTop: vv.offsetTop, vvLeft: vv.offsetLeft, olcek: vv.scale,
      innerH: win.innerHeight, innerW: win.innerWidth,
      yaziGirisi: yaziGirisiOdakta(doc),
    }, sabitH);
    if (!o.kilit) { serbest(); return o; }
    if (!o.klavye) sabitH = o.h;
    kok.style.setProperty('--vv-h', o.h + 'px');
    kok.style.setProperty('--vv-w', o.w + 'px');
    kok.style.setProperty('--vv-top', o.top + 'px');
    kok.style.setProperty('--vv-left', o.left + 'px');
    kok.classList.add('vv');
    return o;
  };

  // Sayfa kaymasın: iOS `overflow:hidden` olmasına rağmen kaydırır ve sabit kök görünmez bölgeye çıkar. Klavye
  // açıkken ve yakınlaştırmada tarayıcı kasten kaydırır; o an karışma.
  const basaAl = () => {
    if (yaziGirisiOdakta(doc) || (Number(vv.scale) || 1) > OLCEK_ESIGI) return;
    if (win.scrollX || win.scrollY) win.scrollTo(0, 0);
  };

  const yenile = () => { uygula(); basaAl(); };
  // Yön değişiminde ve klavye kapanışında tarayıcı eski ölçüyü verebilir: biraz sonra bir kez daha oku.
  const gecikmeliYenile = () => { yenile(); win.setTimeout(yenile, 120); win.setTimeout(yenile, 400); };

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
      serbest();
    },
  };
}
