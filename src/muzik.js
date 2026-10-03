import { gosteriAcik } from './gosteri.js';

/**
 * Oyun içi müzik: üç parça, üç sahne, çapraz geçiş.
 *  - **sakin** (`Boşlukta`): giriş ekranı, lobi, mola ve maç sonu karnesi — tek parça, kendi kendine döner.
 *  - **mac** (`Hızlı Aksiyon`): maç sürerken ana tema.
 *  - **doruk** (`Son Plaka Düşüyor` ↔ `Hızlı Aksiyon`): son plaka evresi — iç halka düştü, doğuş kapandı
 *    (bkz. world.js `respawnOpen`); parça bitince ana temaya, o da bitince yeniden gerilime döner, araya
 *    sessizlik girmez.
 *
 * Çalma `<audio>` öğeleriyledir: dosya akarak iner, sahne değişince ses düzeyi karşılıklı süzülür. Dosyalar
 * **gerektiğinde** yüklenir: menüde yalnız sakin parça iner, maç parçası maç başlarken.
 *
 * Ses düzeyi efektlerin (audio.js) altındadır: varsayılan %35. Açık / kapalı ve düzey tarayıcıda saklanır
 * (`sp.muzik`, `sp.muzik.ses`); açma / kapama düğmesi hem üst çubukta hem mola menüsündedir (bkz. ui.js setMuzik),
 * ses düzeyi sürgüsü mola menüsündedir. Efekt sesi düğmesi (`sp.sound`) müziği etkilemez: ikisi bağımsızdır.
 * Düzeyi `<audio>.volume` verir; iOS Safari'de `volume` salt okunur olduğundan orada Web Audio kazancına geçilir
 * (bkz. yolSec / sesVer), sıfır düzey ise her yerde duraklatmadır.
 *
 * Tarayıcının otomatik oynatma kuralı: ilk kullanıcı dokunuşuna / tuşuna kadar hiç `play()` çağrılmaz, engellenirse
 * sonraki dokunuşta yeniden denenir. Sekme gizlenince durur, dönünce kaldığı yerden sürer.
 *
 * Dosya yolları **görelidir** (`muzik/...`): aynı dosyalar Capacitor'ın `https://localhost/` kökünde de çalışır,
 * bir sonraki APK'ya kendiliğinden girer (bkz. scripts/build-web.mjs). Bu görevde APK üretilmez.
 */
const SAHNELER = {
  sakin: ['son-2-boslukta'],
  mac: ['son-1-hizli-aksiyon'],
  doruk: ['son-3-son-plaka', 'son-1-hizli-aksiyon'],
};
/** Çapraz geçiş süresi (sn): sahne değişiminde ve parça bitmeden önce. */
const GECIS = 1.8;
const VARSAYILAN_SES = 0.35;
/** Süzülme saatinin adımı (sn). */
const ADIM = 0.05;

const kis = v => Math.max(0, Math.min(1, v));

/**
 * Hangi sahne çalmalı? Saf işlev: ekran akışından ve dünyanın durumundan okur, her kareden sorulabilir (aynı sahne
 * yeniden verilince hiçbir şey olmaz). Maç dışındaki her şey — giriş, lobi, mola, karne — sakin parçadır.
 *  - `started`: maç kuruldu mu (main.js `started`)
 *  - `screen`: açık perde ('home' | 'lobby' | 'pause' | 'results' | 'help' | null)
 *  - `w`: dünya (respawnOpen, winner)
 *  - `yardimDonus`: yardım kapanınca dönülecek ekran (main.js `helpReturn`)
 */
export function sahneSec(started, screen, w, yardimDonus = null) {
  if (!started || !w || w.winner !== null) return 'sakin';
  // Yardım perdesi her şeyin üstünde açılır ve kendi müziği yoktur: altındaki ekranın müziği sürer. Maçtan
  // (F1) açıldıysa maçın müziği, moladan ("Kontroller F1" düğmesi) açıldıysa molanınki — yoksa duraklatılmış
  // oyunda yardıma girip çıkmak maç müziğini açıp kapatırdı.
  const altta = screen === 'help' ? yardimDonus : screen;
  if (altta) return 'sakin';
  // Son bölüm: iç halka düştü, yalnız merkez kaldı ve doğuş kapandı (world.js `respawnOpen`).
  return w.respawnOpen ? 'mac' : 'doruk';
}

/**
 * Müzik hiç yüklenmesin mi? Gösteri kipleri (`?gosteri=...`) ve otomatik tarayıcılar (Playwright: `navigator.webdriver`)
 * sessizdir — video betiği klibin müziğini kendisi ekler, dumanı testleri de 6 MB ses indirmesin. `?muzik=0` elle
 * kapatır, `?muzik=1` ikisine de bakmadan açar (müziği ölçen test bunu kullanır).
 */
export function muzikKapali() {
  if (gosteriAcik()) return true; // gösteri hiçbir şekilde müzik çalmaz: `?muzik=1` bile açamaz
  const p = new URLSearchParams(location.search).get('muzik');
  if (p === '0') return true;
  if (p === '1') return false;
  return Boolean(navigator.webdriver);
}

export function createMuzik(root) {
  const kapali = muzikKapali();
  let acik = true, ses = VARSAYILAN_SES;
  try { acik = localStorage.getItem('sp.muzik') !== 'off'; } catch { /* yok */ }
  // Sıfır geçerli bir seçimdir (sürgüyü dibe çekmek): `v >= 0`. Anahtar yoksa / boşsa `Number` 0 verirdi, bu yüzden
  // ham değer önce boşluğa karşı denetlenir — yoksa hiç ayar yapmamış oyuncu sessiz başlardı.
  try { const ham = localStorage.getItem('sp.muzik.ses'); const v = ham ? Number(ham) : NaN; if (Number.isFinite(v) && v >= 0 && v <= 1) ses = v; } catch { /* yok */ }
  const sakla = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } };

  const parcalar = new Map();
  /** Süren süzülmeler: öğe -> { bas, hedef, t, sure, bitince }. Tek bir sayaç hepsini yürütür. */
  const suzulme = new Map();
  let saat = null, sahneAdi = null, sira = 0, aktif = null, dokunuldu = false, gizli = false;

  const hedefSes = () => (acik ? ses : 0);

  // --- Ses düzeyi: `<audio>.volume`, iOS'ta Web Audio kazancı -------------------------------------------------
  // iOS Safari'de `HTMLMediaElement.volume` **salt okunurdur**: atama sessizce yutulur, değer 1 kalır. Orada
  // `volume` ile yapılan her şey çalışmaz — varsayılan %35, mola menüsündeki sürgü ve çapraz geçiş. Bu yüzden ilk
  // parçada düzeyin gerçekten uygulanıp uygulanmadığı **ölçülür**; uygulanmıyorsa parçalar Web Audio'ya bağlanır
  // (MediaElementSource → GainNode → çıkış) ve düzeyi `gain` verir. Masaüstü ve Android'de hiçbir şey değişmez:
  // `volume` çalışır, Web Audio hiç kurulmaz.
  let sesYolu = null;              // 'oge' | 'gain' — ilk ölçümde belirlenir, sonra değişmez
  let ctx = null;
  const kazanclar = new Map();     // <audio> -> GainNode (yalnız 'gain' yolunda; kurulamazsa null)

  function yolSec(a) {
    if (sesYolu) return sesYolu;
    const eski = a.volume;
    let uygulandi = false;
    // Salt okunur `volume` kimi tarayıcıda sessizce yutulur, katı kipte atar: ikisi de 'gain' yoluna götürür.
    try { a.volume = 0.5; uygulandi = Math.abs(a.volume - 0.5) < 1e-6; } catch { uygulandi = false; }
    try { a.volume = eski; } catch { /* yok */ }
    sesYolu = uygulandi ? 'oge' : 'gain';
    return sesYolu;
  }

  /** Parçanın kazanç düğümü; ilk istendiğinde Web Audio kurulur. Kurulamazsa null (ses düzeyi verilemez). */
  function kazanc(a) {
    if (kazanclar.has(a)) return kazanclar.get(a);
    let g = null;
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AC) {
        ctx = ctx ?? new AC();
        g = ctx.createGain();
        ctx.createMediaElementSource(a).connect(g);
        g.connect(ctx.destination);
        g.gain.value = 0;
      }
    } catch { g = null; }
    kazanclar.set(a, g);
    return g;
  }

  function sesVer(a, v) {
    v = kis(v);
    if (yolSec(a) === 'oge') { a.volume = v; return; }
    const g = kazanc(a);
    if (g) g.gain.value = v;
    else { try { a.volume = v; } catch { /* uygulanamıyor: sessizliği duraklatma sağlar, bkz. istenen() */ } }
  }

  function sesAl(a) {
    if (sesYolu === 'oge') return a.volume;
    const g = kazanclar.get(a);
    return g ? g.gain.value : a.volume;
  }

  function tik() {
    for (const [a, f] of suzulme) {
      f.t += ADIM;
      const k = Math.min(1, f.t / f.sure);
      sesVer(a, f.bas + (f.hedef - f.bas) * k);
      if (k >= 1) { suzulme.delete(a); f.bitince?.(); }
    }
    if (!suzulme.size && saat !== null) { clearInterval(saat); saat = null; }
  }
  /** Öğenin sesini `sure` saniyede `hedef`e süzer; `sure` 0 ise anında. */
  function suz(a, hedef, sure, bitince) {
    if (sure <= 0) { suzulme.delete(a); sesVer(a, hedef); bitince?.(); return; }
    suzulme.set(a, { bas: sesAl(a), hedef, t: 0, sure, bitince });
    saat = saat ?? setInterval(tik, ADIM * 1000);
  }

  /** Parçanın `<audio>` öğesi; ilk istendiğinde kurulur (dosya o an inmeye başlar). */
  function parca(ad) {
    let a = parcalar.get(ad);
    if (a) return a;
    a = new Audio();
    a.preload = 'auto';
    a.hidden = true;
    a.dataset.parca = ad;
    // Göreli yol: hem web sunucusunda hem Capacitor'da (https://localhost/) aynı dosyayı bulur.
    a.src = `muzik/${ad}.mp3`;
    sesVer(a, 0); // kaynak verildikten sonra: 'gain' yolunda Web Audio bağlantısı burada kurulur
    // Parça bitmeden önce öbürü üstüne açılsın: araya sessizlik girmez. `ended` yalnız yedektir (süre bilinmiyorsa).
    a.addEventListener('timeupdate', () => {
      if (a !== aktif || a.loop || !Number.isFinite(a.duration)) return;
      if (a.duration - a.currentTime <= GECIS + ADIM) sonraki();
    });
    a.addEventListener('ended', () => { if (a === aktif) sonraki(); });
    root.appendChild(a);
    parcalar.set(ad, a);
    return a;
  }

  /**
   * Şu an çalması gereken parçanın adı (hiçbiri değilse null). Hedef düzey sıfırsa (kapalı ya da sürgü dibe
   * çekilmiş) hiçbir parça istenmez: sessizlik sesi kısarak değil **duraklatarak** sağlanır — düzeyi hiç
   * uygulayamayan tarayıcıda (bkz. sesVer) tek doğru sessizlik budur.
   */
  function istenen() {
    if (kapali || !dokunuldu || !sahneAdi || hedefSes() <= 0) return null;
    const liste = SAHNELER[sahneAdi];
    return liste?.length ? liste[sira % liste.length] : null;
  }

  function calistir(a) {
    // Web Audio yolunda bağlam ilk dokunuşa kadar askıdadır: çıkış sessiz kalmasın diye sürdürülür.
    if (ctx?.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
    const s = a.play();
    // Otomatik oynatma engellendiyse ilk dokunuş sayılmaz: bir sonraki dokunuşta yeniden denenir.
    if (s?.catch) s.catch(() => { dokunuldu = false; });
  }

  /**
   * Durumu istenene getirir: gereken parça çalar, gereksiz olan süzülerek susar. `koru`: susan parça kaldığı yerde
   * beklesin (müzik düğmesiyle kapatınca; yeniden açılınca aynı yerden sürer). Sahne değişiminde ve parça devrinde
   * başa sarılır — sarılmazsa bitişine gelmiş bir parça yeniden seçilince anında "bitti" sayılır ve devir döngüye girer.
   */
  function uygula(sure = GECIS, koru = false) {
    if (gizli) return; // sekme kapalıyken çalınmaz; dönünce buraya yeniden gelinir
    const ad = istenen();
    if (!ad) {
      if (!aktif) return;
      const eski = aktif; aktif = null;
      suz(eski, 0, sure, () => { eski.pause(); if (!koru) eski.currentTime = 0; });
      return;
    }
    const yeni = parca(ad);
    if (aktif === yeni) { calistir(yeni); suz(yeni, hedefSes(), Math.min(sure, 0.3)); return; }
    if (aktif) { const eski = aktif; suz(eski, 0, sure, () => { eski.pause(); eski.currentTime = 0; }); }
    aktif = yeni;
    // Tek parçalı sahne (sakin, maç) kendi kendine döner: `ended` hiç gelmez, araya sessizlik girmez.
    yeni.loop = SAHNELER[sahneAdi].length < 2;
    sesVer(yeni, 0);
    calistir(yeni);
    suz(yeni, hedefSes(), sure);
  }

  /** Aynı sahnenin sıradaki parçası (dorukta gerilim ↔ ana tema). */
  function sonraki() {
    const liste = SAHNELER[sahneAdi];
    if (!liste || liste.length < 2) { if (aktif) { aktif.currentTime = 0; calistir(aktif); } return; }
    sira++;
    uygula();
  }

  /**
   * İlk kullanıcı girdisi: tarayıcı buradan sonra çalmaya izin verir.
   *
   * **Dokunmatikte basma değil bırakma sayılır:** iOS Safari ses iznini `touchend` / `pointerup` / `click` ile verir,
   * `touchstart` ya da `pointerdown` ile vermez — yalnız basma olaylarını dinlersek `play()` reddedilir ve telefonda
   * müzik hiç başlamayabilir. Bu yüzden altı olay da dinlenir; hangisi önce gelirse müzik orada başlar.
   */
  function ilkDokunus() {
    if (kapali || dokunuldu) return;
    dokunuldu = true;
    uygula(0.8);
  }
  if (!kapali) {
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown']) document.addEventListener(ev, ilkDokunus, { passive: true });
    document.addEventListener('visibilitychange', () => {
      gizli = document.hidden;
      if (gizli) { if (aktif) aktif.pause(); return; }
      uygula(0.4);
    });
  }

  return {
    kapali,
    /** Sahneyi değiştirir ('sakin' | 'mac' | 'doruk' | null). Aynı sahne yeniden verilirse hiçbir şey olmaz. */
    sahne(ad) {
      if (kapali || ad === sahneAdi) return;
      sahneAdi = ad; sira = 0;
      uygula();
    },
    get acik() { return acik; },
    get ses() { return ses; },
    /** Müzik açık / kapalı (verilmezse çevirir); seçim tarayıcıda saklanır. Yeni durumu döner. */
    ac(v) {
      acik = v === undefined ? !acik : Boolean(v);
      sakla('sp.muzik', acik ? 'on' : 'off');
      uygula(0.6, true); // kapatınca parça kaldığı yerde bekler: yeniden açılınca oradan sürer
      return acik;
    },
    /** Ses düzeyi (0-1); saklanır ve çalan parçaya anında uygulanır. Sıfır parçayı duraklatır (bkz. istenen). */
    sesAyarla(v) {
      const onceki = hedefSes();
      ses = kis(Number(v) || 0);
      sakla('sp.muzik.ses', String(ses));
      const simdi = hedefSes();
      if ((onceki <= 0) !== (simdi <= 0)) uygula(0.3, true); // sessizliğe girdi / çıktı: parça bekler ya da sürer
      else if (aktif && !suzulme.has(aktif)) sesVer(aktif, simdi);
      return ses;
    },
    /** Testler ve hata ayıklama için: hangi parça, hangi sahne, çalıyor mu, düzeyi hangi yol veriyor. */
    durum() {
      return {
        kapali, acik, ses, sahne: sahneAdi, parca: aktif?.dataset.parca || null,
        caliyor: Boolean(aktif && !aktif.paused), ogeler: parcalar.size,
        duzey: aktif ? sesAl(aktif) : 0, sesYolu,
      };
    },
  };
}
