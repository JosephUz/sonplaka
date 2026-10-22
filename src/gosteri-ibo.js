import { CAMERA, GOSTERI_IBO as G } from './config.js';
import { t as ceviri } from './dil.js';
import { knock } from './actions.js';
import { clamp, wrap } from './math.js';
import { isApp } from './platform.js';
import { createWorld, step } from './world.js';

/**
 * **"İbo" gösteri sahnesi** (`?gosteri=ibo`, yalnız tarayıcıda): komik short için sahnelenmiş tek bir düşüş.
 * `?gosteri=1`den (gosteri.js) farkı, bunun bir maç değil **baştan sona yazılmış tek çekim** olmasıdır: sahne
 * saniye saniye bir ses kaydına kilitlidir (bkz. ISARET / ALTYAZI), kamera serbesttir ve ekranda meme usulü
 * altyazılar durur. Kamera, İbo'yu telefonla çeken arkadaşının gözüdür.
 *
 * Sahneleme:
 *  - Kamera ve İbo **1 numaralı iç halka plakasındadır** (arena.js, köşegen eksen); aşağıda, merkez plaka
 *    GOSTERI_IBO.derinlik kadar alçakta asılı durur. Bu, yalnız bu kipe özel tek sahneleme hamlesidir: plakanın
 *    **hâli** değişmez (ayakta, rampaları açık), yalnız yüksekliği değişir. Bu yüzden İbo'nun plakasındaki rampa
 *    boşluğa değil doğrudan **aşağıdaki plakaya** bakar — "alt tarafım var ya, yol gibi".
 *  - **0-18,5** Kamera sırayla boşluktaki plakalara, İbo'ya, iki plaka arasındaki boşluğa ve rampaya döner.
 *    İbo önce sağa sola bakıp yol arar, sonra rampaya yürür ve kenarında tedirgin adımlarla bekler.
 *  - **18,5** İbo'nun altındaki plaka çöker (oyunun kendi `phase` düşüşü) ve İbo boşluğa savrulur. Düşüş
 *    tamamen oyunun fiziğidir: yerçekimi, savrulma takla atması, plaka zemini, çarpma.
 *  - **~19,55** Aşağıdaki plakaya çakılır ve çarpma onu havaya sektirir (oyunun kendi `knock`u). **~20,2** yere
 *    basar, sersem sersem yürümeye başlar.
 *  - **22,4-27,4** Kamera uzaktaki minicik İbo'ya zoom yapar; İbo durup yukarı bakar.
 *  - **27,8-34,75** **Spor tekrarı**: aynı çarpışma, kaydedilmiş karelerden **üç ayrı kameradan** ağır çekimde
 *    yeniden oynatılır (köşede "TEKRAR" yazısı; bkz. TEKRARLAR). Canlı dünya bu sırada dondurulur. Üçüncü açı
 *    sekmeyi yakından gösterir ve sekmenin en yüksek noktası kahkahanın tepesine (33,40) denk getirilmiştir.
 *    Sahne burada biter; kalan 3 sn kurgudaki josephuz.com kapanışıdır.
 *
 * Arayüzün gizlenmesi, girdinin okunmaması, müziğin hiç kurulmaması ve sunucuya bağlanılmaması `?gosteri=1` ile
 * ortaktır (bkz. main.js, muzik.js, style.css `.gosteri`). `?gosteri=1` ve normal oyun bu dosyadan hiç etkilenmez;
 * uygulamada (isApp) açılmaz.
 *
 * Sahne **kare kare yeniden üretilebilir**: rastgelelik kullanılmaz (sarsıntı da saate bağlı sinüstür), botlar
 * koşmaz, İbo'nun girdisini senaryo verir. Çekim: `ajanlar/icerik/short-uret.mjs` (sahte saat, 1/30 adım).
 */
export function iboGosteriAcik() {
  if (isApp()) return false;
  return new URLSearchParams(location.search).get('gosteri') === 'ibo';
}

/**
 * Sahnenin saniyeleri. Hepsi `calisma/icerik/muzik/short/kaynak/son-plaka-meme.mp3` kaydının kelime zamanlarından
 * gelir (aynı klasördeki `.yazi.txt`). Değiştirilirse hem altyazı hem görüntü sesten kayar.
 */
export const ISARET = {
  cagir: 2.60,        // "Gel la hadi, çekiyom."
  bosluk: 4.44,       // "Buzu gözüküyor."  → kamera aşağı, iki plaka arasına
  arar: 6.32,         // "Sen gel la. Nereyen gelecek belam?" → İbo sağa sola bakıp yol arar
  rampa: 8.46,        // "Bak alt tarafım var ya, yol gibi var ya, yol gibi." → kamera rampayı gösterir
  yuru: 13.38,        // "Oraya in." → İbo rampaya yürür
  kenar: 16.08,       // "Bak düşme sakın, vallahi çok kötü düşersin la."
  dusus: 18.50,       // plaka çöker — sessizlik, düşüş
  carpma: 19.55,      // hedef çarpma anı (ölçülen değer buna 0,25 sn'den fazla uzak olmamalı)
  yuruyor: 20.36,     // "La ya bak o oğlum, yürüyor lan."
  zoom: 22.44,        // "La İbo!" → uzaktaki İbo'ya zoom
  dogrul: 24.38,      // "Bir şey oldu mu?" → durur, yukarı bakar
  tekrar1: 27.80,     // 1. tekrar açısı ("Baya çok kötü çarptı bak." 28,08)
  tekrar2: 30.00,     // 2. tekrar açısı (altyazısız: İbo çarpınca havaya sekiyor)
  tekrar3: 31.90,     // 3. tekrar açısı: yakından sekme ("Oğlum yükselmiş ha." + kahkaha)
  sekmeTepesi: 33.40, // kahkahanın tepesi: sekmenin en yüksek noktası tam buraya denk getirilir
  // Sahne tekrarın üçüncü açısında biter. Ses "Oğlum" sonrasındaki konuşmadan önce (34,75) kesildi — devamında
  // Yusuf'un çıkarılmasını istediği kısım var. Kalan 3 sn kurgudaki SON PLAKA · josephuz.com kapanışıdır
  // (bkz. ajanlar/icerik/short-uret.mjs `videoSn`).
  canli: 34.75,       // tekrar bölümünün sonu = oyun görüntüsünün sonu
  bitis: 34.75,       // oyun görüntüsünün sonu (kalanı kurgudaki josephuz.com kapanışı)
};

/**
 * Altyazılar: her cümle konuşulduğu saniyede çıkar, sustuğunda kalkar (meme usulü, ekranın ortasına yakın). Üçüncü
 * öğe sözlük anahtarıdır (src/diller/: 'ibo.N'); ekrana etkin dildeki metin yazılır. Türkçe ses + Türkçe altyazı için
 * sahne `?gosteri=ibo&dil=tr` ile açılır.
 */
export const ALTYAZI = [
  [2.60, 4.30, 'ibo.1'],
  [4.44, 6.30, 'ibo.2'],
  [6.32, 8.10, 'ibo.3'],
  [8.46, 12.20, 'ibo.4'],
  [13.38, 14.40, 'ibo.5'],
  [16.08, 18.10, 'ibo.6'],
  [20.36, 21.85, 'ibo.7'],
  [22.44, 23.30, 'ibo.8'],
  [24.38, 25.95, 'ibo.9'],
  [26.14, 27.45, 'ibo.9'],
  [28.08, 29.90, 'ibo.10'],
  [31.90, 33.00, 'ibo.11'],
  // Kahkaha: yazıya dökülmez, yalnız gülen yüz durur (Yusuf 13 Ekim).
  [33.05, 34.40, 'ibo.12'],
];

/**
 * Spor tekrarının bölümleri: her biri bir kamera açısı (bkz. GOSTERI_IBO.tekrar) ve kayıttan o açıda oynatılacak
 * aralık. Üçü de **aynı** çarpışmayı gösterir, farklı yerden ve farklı yavaşlıkta.
 *  1. 27,80-30,00 — çarpışmanın kendisi, yukarıdan ("Baya çok kötü çarptı bak.").
 *  2. 30,00-31,90 — alçak açıdan sekme (altyazısız).
 *  3. 31,90-34,75 — yakından sekme: "Oğlum yükselmiş ha." ve kahkaha. Sekmenin en yüksek noktası kahkahanın
 *     tepesine (ISARET.sekmeTepesi) denk gelsin diye `uc.bit` buna göre seçildi, bkz. config.
 */
const TEKRARLAR = [
  { no: 1, bas: ISARET.tekrar1, bit: ISARET.tekrar2, ayar: G.tekrar.bir },
  { no: 2, bas: ISARET.tekrar2, bit: ISARET.tekrar3, ayar: G.tekrar.iki },
  { no: 3, bas: ISARET.tekrar3, bit: ISARET.canli, ayar: G.tekrar.uc },
];

/**
 * Sahnenin ekseni: merkez plakayı 1 numaralı iç halka plakasına bağlayan köşegen (arena.js, ring1.angle0 = π/4).
 * Konumlar iki sayıyla verilir: `r` merkeze uzaklık (eksen boyunca), `yan` eksenin sağına kayma.
 */
const EKSEN = Math.SQRT1_2;
const yerde = (r, yan = 0) => ({ x: EKSEN * (r + yan), z: EKSEN * (r - yan) });
/** İbo'nun plakası (iç halka, köşegen üstünde) ve altındaki yakalayıcı plaka (merkez). */
const IBO_PLAKA = 1, ALT_PLAKA = 0;

/**
 * Kamera anahtar kareleri. `t` saniye, `r`/`yan` yer (bkz. yerde), `y` göz yüksekliği, `yaw`/`pitch` bakış,
 * `fov` görüş açısı (zoom), `takip` bakışı İbo'ya kilitler (yaw/pitch yok sayılır). Aradaki her kare iki
 * anahtarın yumuşatılmış arasıdır: kesme yoktur, kamera elde çekim gibi döner.
 * Açılar ham sayıdır ve kısa yoldan yürür; bu yüzden tabloda sıçrama olmamalı.
 */
const KAMERA = [
  // 0-2,6 — boşlukta asılı plakalar: kamera plakanın iç kenarında durur, karşıdaki dış halka plakasına bakar.
  { t: 0.00, r: 21.0, yan: 4.5, y: 2.50, yaw: 1.46, pitch: 0.06, fov: 78 },
  { t: 1.95, r: 21.0, yan: 4.5, y: 2.50, yaw: 1.32, pitch: 0.01, fov: 78 },
  // 2,6-4,4 — "Gel la hadi, çekiyom.": kamera İbo'ya döner.
  { t: 3.20, r: 21.0, yan: 4.5, y: 2.50, yaw: 0.052, pitch: -0.19, fov: 72 },
  { t: 4.45, r: 21.0, yan: 4.5, y: 2.50, yaw: 0.052, pitch: -0.19, fov: 72 },
  // 4,4-6,3 — "Buzu gözüküyor.": kamera kenardan aşağı bakar; boşluğun dibinde alttaki plaka durur.
  { t: 5.35, r: 21.0, yan: 4.5, y: 2.50, yaw: -2.146, pitch: -0.70, fov: 74 },
  { t: 6.20, r: 21.0, yan: 4.5, y: 2.50, yaw: -2.146, pitch: -0.66, fov: 74 },
  // 6,3-8,4 — "Sen gel la": kamera İbo'ya döner, o sağa sola bakıp yol arar.
  { t: 7.05, r: 21.0, yan: 4.5, y: 2.50, yaw: 0.052, pitch: -0.20, fov: 72 },
  { t: 8.40, r: 21.0, yan: 4.5, y: 2.50, yaw: 0.052, pitch: -0.20, fov: 72 },
  // 8,5-12,1 — "Bak alt tarafım var ya, yol gibi": kamera rampaya iner, sonra rampanın baktığı boşluğa kayar.
  { t: 9.35, r: 21.0, yan: 4.5, y: 2.50, yaw: -1.326, pitch: -0.36, fov: 66 },
  { t: 11.10, r: 21.0, yan: 4.5, y: 2.50, yaw: -1.70, pitch: -0.52, fov: 70 },
  { t: 12.10, r: 21.0, yan: 4.5, y: 2.50, yaw: -2.10, pitch: -0.66, fov: 74 },
  // 12,2-13,4 — "Oraya in.": kamera İbo'ya döner (hızlı çevirme), oradan sonra bakış ona kilitli. Çevirme kısadır:
  // aradaki her kare boş plaka görüntüsüdür, uzasa kadraj bir saniye boşa akar.
  { t: 12.45, r: 21.0, yan: 4.5, y: 2.50, yaw: -1.40, pitch: -0.42, fov: 72 },
  { t: 12.80, r: 21.0, yan: 4.5, y: 2.50, fov: 70, takip: true },
  // 16,1-18,5 — "Bak düşme sakın": İbo rampanın kenarında tedirgin, kamera yakın.
  { t: 16.00, r: 21.0, yan: 4.5, y: 2.50, fov: 64, takip: true },
  { t: 18.40, r: 21.0, yan: 4.5, y: 2.45, fov: 62, takip: true },
  // 18,5-20,4 — plaka çöker: İbo kameranın dibinden uçar, kamera kenara eğilip onu takip eder.
  { t: 19.55, r: 21.0, yan: 4.5, y: 2.30, fov: 68, takip: true },
  { t: 20.36, r: 21.0, yan: 4.5, y: 2.10, fov: 72, takip: true },
  // 20,4-22,4 — "yürüyor lan": çok aşağıdaki İbo minicik görünür.
  { t: 22.40, r: 21.0, yan: 4.5, y: 2.00, fov: 72, takip: true },
  // 22,5-27,4 — "La İbo!": zoom; İbo durup yukarı bakar.
  { t: 23.60, r: 21.0, yan: 4.5, y: 1.95, fov: 27, takip: true },
  // Son anahtar kare burada: 27,80'den sonrası tekrar bölümüdür, kamerayı `G.tekrar` açıları sürer (bkz. kamera()).
  { t: 27.80, r: 21.0, yan: 4.5, y: 1.90, fov: 26, takip: true },
];

export function createIboGosteri({ view, root = null }) {
  const yaziEl = root ? root.querySelector('#sp-gosteri-yazi') : null;
  const tekrarEl = root ? root.querySelector('#sp-gosteri-tekrar') : null;
  // Kameraya verilen sahte "oyuncu": view/camera.js birinci şahısta gözü buranın CAMERA.eye üstüne koyar.
  const goz = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, id: -1, out: false };
  const kayit = [];
  let w = null, t = 0, altKare = 0, sars = 0, rampaId = -1;
  let carpmaAt = null, carpmaNokta = null, carpmaHizi = 0, daldi = false;
  let yaziIndex = -1, tekrarAcik = false, donmus = null;
  const olcum = bosOlcum();

  function bosOlcum() {
    return { saniye: 0, dususAt: null, carpmaAt: null, carpmaHiz: 0, carpmaDerin: 0, sekme: 0,
      yuruyor2036: false, tekrarAcisi: 0, rampaKullanimi: 0, altyazi: [], bitti: false };
  }

  /** Sahneyi kurar: beş koltuklu dünya, yalnız İbo ayakta, alttaki plaka aşağıda, hiçbir takvim işlemez. */
  function basla() {
    w = createWorld(G.tohum, { teamSize: 1, difficulty: 'normal' });
    w.state = 'play'; w.t = 0; w.respawnOpen = false;
    // Sahnede tek oyuncu var: İbo. Kalan dört koltuk gizlenir ama "sayılan" kalır (respawn > 0), yoksa world.js
    // rakipsiz kalan takımı kazanan ilan edip maçı bitirirdi (checkEnd).
    for (const p of w.players) {
      if (p.id === 0) continue;
      Object.assign(p, { out: true, respawn: 1e6, y: -1000 });
    }
    // Güç diskleri bu sahnede hiç doğmaz: kadrajda oyunun parlayan toplayıcıları olmasın.
    for (const s of w.pickups) { s.active = false; s.t = 1e6; }
    // Sahnenin "yol gibi" rampası: İbo'nun plakasından aşağıdaki plakaya bakan zıplama plakası. Rampalar oyundaki
    // gibi açık bırakılır (hepsi parlar); senaryo İbo'yu hiçbirinin üstüne basmayacak kadar uzakta tutar ve
    // `rampaKullanimi` ölçümü bunu denetler.
    rampaId = w.arena.pads.findIndex(q => q.plate === IBO_PLAKA && q.to === ALT_PLAKA);
    // Alttaki plaka sahne boyunca aşağıda asılı durur: hâli değişmez (phase 0 — ayakta, rampaları açık),
    // yalnız yeri değişir. plates() yalnız çöken plakaları (phase 2) indirir, bu yüzden burada kalır.
    w.plates[ALT_PLAKA].y = G.derinlik;

    const ibo = w.players[0], bas = yerde(G.ibo.baslangic);
    // Eli boş: İbo bu sahnede dövüşmez, elindeki disk kadrajda yalnız gürültü olurdu. `regen` yüksek tutulur,
    // yoksa oyun saniyede bir yeni disk verir (bkz. world.js step).
    Object.assign(ibo, { x: bas.x, y: 0, z: bas.z, vx: 0, vy: 0, vz: 0, ground: true, plate: IBO_PLAKA,
      shield: 0, lives: 1, discs: 0, regen: 1e6, name: 'İbo' });

    t = 0; altKare = 0; sars = 0; carpmaAt = null; carpmaNokta = null; carpmaHizi = 0; daldi = false;
    yaziIndex = -1; tekrarAcik = false; donmus = null;
    kayit.length = 0;
    Object.assign(olcum, bosOlcum());
    view.setCamera('fps');
    view.setWorld(w);
    kamera(0);
    ibo.yaw = kameraYonu(ibo);
    return w;
  }

  /** İbo'dan kameraya bakan açı (konuşan arkadaşına döner). */
  const kameraYonu = p => Math.atan2(goz.x - p.x, goz.z - p.z);

  // ---------------------------------------------------------------------------------------------------------
  // Sahnenin ilerleyişi
  // ---------------------------------------------------------------------------------------------------------

  /**
   * Bir kare: tekrar oynuyorsa kaydedilmiş kareler geri yazılır (canlı dünyaya dokunulmaz), değilse dünya oyunun
   * kendi sabit adımıyla (1/60) ilerletilir ve İbo'ya senaryonun girdisi verilir. Güncel dünyayı döner.
   */
  function guncelle(dt) {
    t += dt;
    olcum.saniye = t;
    if (t >= ISARET.tekrar1 && t < ISARET.canli) tekrar();
    else { if (tekrarAcik) tekrardanDon(); ilerlet(dt); }
    sars = dt > 0 ? sars * Math.exp(-dt * G.kamera.sarsinmaSonum) : sars;
    kamera(dt);
    yaz();
    // Kayan nokta payı: çekim tam 1137 kareyi 1/30'ar ilerletir ve toplam 37,8999… çıkar.
    if (t >= ISARET.bitis - 1e-3) olcum.bitti = true;
    return w;
  }

  /** Canlı bölüm: senaryonun olayları, dünya adımları, ölçüm ve tekrar kaydı. */
  function ilerlet(dt) {
    const ibo = w.players[0];
    olaylar();
    altKare += dt;
    const ADIM = 1 / 60;
    for (let n = 0; altKare >= ADIM && n < 16; n++) {
      step(w, ADIM, girdi(ibo));
      // Maç takvimi bu sahnede hiç işlemez: plakaları ve bitişi senaryo yönetir (schedule eşiklerine varılmaz).
      w.t = 0;
      altKare -= ADIM;
      dalis(ibo);
      carpmaDenetle(ibo);
    }
    bosalt();
    if (t >= G.kayit.bas && t <= G.kayit.bit) kaydet();
    if (carpmaAt !== null && !ibo.out) olcum.sekme = Math.max(olcum.sekme, ibo.y - G.derinlik);
    if (Math.abs(t - ISARET.yuruyor) <= 0.05) {
      olcum.yuruyor2036 = !ibo.out && ibo.ground && ibo.y < -1 && Math.hypot(ibo.vx, ibo.vz) > 0.4;
    }
    olcum.rampaKullanimi = ibo.stats.pads;
  }

  /** Senaryonun iki dönüm noktası: iki plaka çöküşü. İkisi de oyunun kendi çökme ve savrulma yoluyla olur. */
  function olaylar() {
    if (olcum.dususAt === null && t >= ISARET.dusus) {
      olcum.dususAt = t;
      cok(IBO_PLAKA);
      // Çöken plaka İbo'yu merkeze doğru savurur: yatay hız onu aşağıdaki plakanın üstüne taşıyacak kadardır,
      // `kalk` ise onu plakanın üstünden kurtarır (yoksa oyunun inişi onu çöken plakaya hemen geri yapıştırır).
      savur(G.savrulma.hiz, Math.PI / 4 + Math.PI, G.savrulma.kalk);
      sars = G.kamera.sarsinma;
    }
  }

  /**
   * Plaka çöker: oyunun kendi çökme hâli (phase 2) ve efekti; plakanın yerinde şok halkası patlar. Plakaya ilk
   * hızı da verilir (`G.cokmeHizi`): ayağının altından **görünür biçimde** kayıp gitsin, yoksa sıfırdan hızlanan
   * plaka ile üstündeki oyuncu birkaç kare birlikte iner ve çöküş okunmaz.
   */
  function cok(id) {
    const s = w.plates[id], pl = w.arena.plates[id];
    s.phase = 2; s.vy = G.cokmeHizi;
    w.events.push({ type: 'collapse', ring: pl.ring, x: pl.x, y: s.y, z: pl.z });
  }

  /** İbo'yu verilen yönde savurur: oyunun kendi `knock`u — takla atar, kontrolü gider, `dikey` kadar havalanır. */
  function savur(hiz, yon, dikey) {
    knock(w, w.players[0], Math.sin(yon), Math.cos(yon), hiz, dikey, null, 'plaka');
  }

  /**
   * Dalış: İbo çöken plakanın kenarını geçip boşluğa çıktığı an (artık üstüne geri inemez) aşağı doğru hızlanır —
   * plakanın ayağının altından kayışı. Düşüşün derinliğini ve çarpma saniyesini bu belirler.
   */
  function dalis(ibo) {
    if (daldi || olcum.dususAt === null || ibo.out) return;
    if (Math.hypot(ibo.x, ibo.z) > G.savrulma.temizR) return;
    daldi = true;
    ibo.vy = G.savrulma.dalis;
  }

  /** Çarpma anı: İbo aşağıdaki plakaya indiği kare. Oyunun kendi inişinin üstüne sahnenin sekmesi biner. */
  function carpmaDenetle(ibo) {
    if (carpmaAt !== null || olcum.dususAt === null || !ibo.ground || ibo.plate !== ALT_PLAKA) return;
    carpmaAt = t;
    olcum.carpmaAt = t;
    olcum.carpmaDerin = olcum.dususAt !== null ? -ibo.y : 0;
    olcum.carpmaHiz = carpmaHizi;
    carpmaNokta = { x: ibo.x, y: ibo.y, z: ibo.z };
    // Çarpma o kadar serttir ki İbo havaya sekip takla atar — shortun "oğlum yükselmiş ha" tekrarı budur.
    knock(w, ibo, Math.sin(Math.PI / 4 + Math.PI), Math.cos(Math.PI / 4 + Math.PI), G.sekme.hiz, G.sekme.kalk, null, 'carpma');
    w.events.push({ type: 'fall', id: ibo.id, by: null, cause: 'carpma', x: ibo.x, y: ibo.y, z: ibo.z,
      respawn: false, lives: 1, score: [...w.score] });
    sars = G.kamera.sarsinma * 1.6;
  }

  /** Olaylar efektlere gider (toz, kıvılcım, şok halkası); ses ve arayüz yok, kuyruk her karede boşaltılır. */
  function bosalt() {
    for (const e of w.events) view.event(e);
    w.events.length = 0;
  }

  // ---------------------------------------------------------------------------------------------------------
  // İbo'nun girdisi: senaryo onu klavyeyle oynanıyormuş gibi sürer (world.js'e insan girdisi olarak gider)
  // ---------------------------------------------------------------------------------------------------------

  /**
   * İbo'nun o andaki girdisi. Savrulduğu ve düştüğü anlarda girdi yoktur: düşüş tamamen oyunun fiziğidir.
   * Yürüyüşlerde hedefe yaklaştıkça girdi küçülür, böylece hedefin üstünde durur (ve rampaya hiç basmaz).
   */
  function girdi(p) {
    if (p.out) return {};
    if (!p.ground) carpmaHizi = Math.abs(p.vy);
    const bak = { pitch: p.pitch };
    if (t < ISARET.arar) return { ...bak, x: 0, z: 0, yaw: kameraYonu(p), pitch: -0.05 };
    if (t < ISARET.yuru) {
      // "Nereyen gelecek belam?" — yerinde küçük adımlar, bakış sağa sola: yol arıyor.
      const s = Math.sin((t - ISARET.arar) * 1.9);
      return { ...yuru(p, G.ibo.baslangic + s * 0.5), yaw: kameraYonu(p) + s * 0.8, pitch: -0.1 };
    }
    if (t < ISARET.kenar) {
      // "Oraya in." — rampaya doğru yürür. Hedef rampanın üstü değil, biraz gerisidir: rampaya basmaz.
      return { ...yuru(p, G.ibo.rampaBasi, 0.5), yaw: Math.PI / 4 + Math.PI, pitch: -0.2 };
    }
    if (t < ISARET.dusus) {
      // Rampanın kenarında tedirgin adımlar: bir ileri bir geri, bakış sağa sola.
      const s = Math.sin((t - ISARET.kenar) * 4.1);
      const hedef = t > ISARET.dusus - 0.35 ? G.ibo.rampaBasi : G.ibo.rampaBasi + s * 0.45;
      return { ...yuru(p, hedef, 0.3), yaw: Math.PI / 4 + Math.PI + s * 0.45, pitch: -0.32 };
    }
    if (t < ISARET.yuruyor) return {}; // düşüş ve çarpma: oyunun fiziği, girdi yok
    if (t < ISARET.dogrul) {
      // Sersem sersem yürür: aşağıdaki plakanın ortasına doğru, yalpalayarak.
      const s = Math.sin((t - ISARET.yuruyor) * 2.1);
      const h = yerde(G.ibo.sersemR, s * G.ibo.sersemYan);
      const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz) || 1;
      const m = Math.min(G.ibo.sersem, (d / 0.8) * G.ibo.sersem);
      return { x: (dx / d) * m, z: (dz / d) * m, yaw: Math.atan2(dx, dz), pitch: -0.15 };
    }
    // "Bir şey oldu mu?" — durur, yukarıya (kameraya) bakar.
    return { x: 0, z: 0, yaw: kameraYonu(p), pitch: clamp((t - ISARET.dogrul) * 0.7, 0, 0.8) };
  }

  /** Eksen üstünde `hedef` uzaklığına yürüme girdisi (yaklaşınca yavaşlar, üstünde durur). */
  function yuru(p, hedef, g = 0.3) {
    const h = yerde(hedef), dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return { x: 0, z: 0 };
    return { x: (dx / d) * Math.min(g, (d / 0.7) * g), z: (dz / d) * Math.min(g, (d / 0.7) * g) };
  }

  // ---------------------------------------------------------------------------------------------------------
  // Spor tekrarı
  // ---------------------------------------------------------------------------------------------------------

  /** Kayıt: çarpışma çevresindeki her kare (İbo ve plakalar). Tekrar bunlardan oynatılır. */
  function kaydet() {
    const p = w.players[0];
    kayit.push({ t, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw, pitch: p.pitch,
      ground: p.ground, knock: p.knock, plate: p.plate, out: p.out,
      plakalar: w.plates.map(s => ({ phase: s.phase, y: s.y, vy: s.vy })) });
  }

  /** Canlı dünyanın tekrar öncesi hâlini saklar (tekrar bitince aynen geri yüklenir). */
  function dondur() {
    donmus = { oyuncu: { ...w.players[0] }, plakalar: w.plates.map(s => ({ ...s })) };
    tekrarAcik = true;
  }

  function tekrardanDon() {
    if (donmus) {
      Object.assign(w.players[0], donmus.oyuncu);
      w.plates.forEach((s, i) => Object.assign(s, donmus.plakalar[i]));
    }
    donmus = null; tekrarAcik = false;
  }

  /** Kayıttan `zaman` anındaki kareyi dünyaya yazar (iki kare arası doğrusal geçiş). */
  function oynat(zaman) {
    if (!kayit.length) return;
    let i = 0;
    while (i < kayit.length - 1 && kayit[i + 1].t < zaman) i++;
    const a = kayit[i], b = kayit[Math.min(i + 1, kayit.length - 1)];
    const k = b.t > a.t ? clamp((zaman - a.t) / (b.t - a.t), 0, 1) : 0;
    const ara = (u, v) => u + (v - u) * k;
    Object.assign(w.players[0], {
      x: ara(a.x, b.x), y: ara(a.y, b.y), z: ara(a.z, b.z), vx: ara(a.vx, b.vx), vy: ara(a.vy, b.vy), vz: ara(a.vz, b.vz),
      yaw: a.yaw, pitch: a.pitch, ground: a.ground, knock: a.knock, plate: a.plate, out: a.out,
    });
    w.plates.forEach((s, j) => { s.phase = a.plakalar[j].phase; s.y = ara(a.plakalar[j].y, b.plakalar[j].y); s.vy = a.plakalar[j].vy; });
  }

  /** `t` anındaki tekrar bölümü (bkz. TEKRARLAR); tekrar başlamadıysa ilki. */
  const bolum = () => TEKRARLAR.reduce((en, b) => (t >= b.bas ? b : en), TEKRARLAR[0]);

  /** Tekrar bölümü: üç açı, üçü de çarpışma anının ağır çekimi. Canlı dünya bu sırada dondurulmuştur. */
  function tekrar() {
    if (!tekrarAcik) dondur();
    const b = bolum(), A = b.ayar;
    const k = clamp((t - b.bas) / (b.bit - b.bas), 0, 1);
    olcum.tekrarAcisi = Math.max(olcum.tekrarAcisi, b.no);
    oynat((carpmaAt ?? ISARET.carpma) + A.bas + (A.bit - A.bas) * k);
  }

  // ---------------------------------------------------------------------------------------------------------
  // Kamera ve yazılar
  // ---------------------------------------------------------------------------------------------------------

  /**
   * Kamera: tekrar bölümünde çarpışmanın yanında sabit üç açı, geri kalanda KAMERA anahtar kareleri.
   * Düşüşten sonra bakış İbo'ya kilitlidir (`takip`), konumu yine anahtar kareler verir.
   */
  function kamera(dt) {
    const p = w.players[0];
    if (t >= ISARET.tekrar1 && t < ISARET.canli) {
      const A = bolum().ayar;
      const m = carpmaNokta || { ...yerde(G.ibo.carpmaR), y: G.derinlik };
      const yer = yerde(A.kamera.r, A.kamera.yan);
      goz.x = m.x + yer.x; goz.z = m.z + yer.z; goz.y = m.y + A.kamera.y - CAMERA.eye;
      bak(p, 1);
      view.setFov(A.fov);
      titre();
      return;
    }
    const [a, b, k] = anahtarlar(t);
    const ara = (u, v) => u + (v - u) * k;
    const yer = yerde(ara(a.r, b.r), ara(a.yan, b.yan));
    goz.x = yer.x; goz.z = yer.z; goz.y = ara(a.y, b.y) - CAMERA.eye;
    view.setFov(ara(a.fov, b.fov));
    // Takip anahtarından önceki (ve sonraki) açılar yazılmaz: o anahtarlarda bakışı İbo belirler, bu yüzden
    // araya girerken komşunun açısı yoksa bu anahtarınki tutulur (yoksa tanımsızla hesap NaN'a düşer).
    if (a.takip) bak(p, dt > 0 ? 1 - Math.exp(-dt * G.kamera.takip) : 1);
    else {
      goz.yaw = a.yaw + (wrap((b.yaw ?? a.yaw) - a.yaw)) * k;
      goz.pitch = a.pitch + ((b.pitch ?? a.pitch) - a.pitch) * k;
    }
    titre();
  }

  /** Bakışı İbo'nun göğsüne çevirir (`k`: bu karedeki yumuşatma payı). */
  function bak(p, k) {
    const dx = p.x - goz.x, dz = p.z - goz.z, dh = Math.hypot(dx, dz);
    const hedefPitch = clamp(Math.atan2(p.y + 1.1 - (goz.y + CAMERA.eye), Math.max(0.8, dh)), -1.35, 1.1);
    goz.yaw += wrap(Math.atan2(dx, dz) - goz.yaw) * k;
    goz.pitch += (hedefPitch - goz.pitch) * k;
  }

  /**
   * Elde çekim: kamera hafifçe nefes alır, çöküş ve çarpma anlarında sarsılır. İkisi de saate bağlı sinüstür
   * (rastgele değil), böylece aynı video kare kare yeniden üretilebilir.
   */
  function titre() {
    const n = G.kamera.titresim;
    view.face(goz.yaw + Math.sin(t * 1.7) * n + Math.cos(t * 53) * sars,
      goz.pitch + Math.sin(t * 2.3 + 1) * n * 0.7 + Math.sin(t * 61) * sars);
  }

  /** `t` anındaki iki komşu kamera anahtarı ve aralarındaki yumuşatılmış pay. */
  function anahtarlar(zaman) {
    let i = 0;
    while (i < KAMERA.length - 1 && KAMERA[i + 1].t <= zaman) i++;
    const a = KAMERA[i], b = KAMERA[Math.min(i + 1, KAMERA.length - 1)];
    const ham = b.t > a.t ? clamp((zaman - a.t) / (b.t - a.t), 0, 1) : 1;
    return [a, b, ham * ham * (3 - 2 * ham)];
  }

  /** Ekrandaki altyazı ve "TEKRAR" rozeti (yerleri için bkz. style.css `#sp-gosteri-yazi`). */
  function yaz() {
    let i = -1;
    for (let n = 0; n < ALTYAZI.length; n++) if (t >= ALTYAZI[n][0] && t < ALTYAZI[n][1]) i = n;
    if (i !== yaziIndex) {
      yaziIndex = i;
      const metin = i >= 0 ? ceviri(ALTYAZI[i][2]) : '';
      if (i >= 0) olcum.altyazi.push({ i, t, metin });
      if (yaziEl) { yaziEl.textContent = metin; yaziEl.hidden = i < 0; }
    }
    // Rozet son karelerde kalkar: çekimin son karesi donarak kapanışa uzanıyor, rozet orada asılı kalmasın.
    if (tekrarEl) tekrarEl.hidden = !(t >= ISARET.tekrar1 && t < ISARET.canli - 0.2);
  }

  return { basla, guncelle, odak: () => goz, dunya: () => w, olcum: () => olcum, saniye: () => t };
}
