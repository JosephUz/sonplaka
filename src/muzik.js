import { gosteriAcik } from './gosteri.js';

/**
 * Oyun içi müzik: üç parça, üç sahne, çapraz geçiş.
 *  - **sakin** (`Boşlukta`): giriş ekranı, lobi, mola ve maç sonu karnesi — tek parça, kendi kendine döner.
 *  - **mac** (`Hızlı Aksiyon`): maç sürerken ana tema.
 *  - **doruk** (`Son Plaka Düşüyor` ↔ `Hızlı Aksiyon`): son plaka evresi — ayakta `DORUK_PLAKA` ya da daha az plaka
 *    kaldığında (ya da kalanlar düşmek üzere titrerken); parça bitince ana temaya, o da bitince yeniden gerilime
 *    döner, araya sessizlik girmez.
 *
 * Çalma `<audio>` öğeleriyledir (Web Audio gerekmez): dosya akarak iner, sahne değişince ses düzeyi karşılıklı
 * süzülür. Dosyalar **gerektiğinde** yüklenir: menüde yalnız sakin parça iner, maç parçası maç başlarken.
 *
 * Ses düzeyi efektlerin (audio.js) altındadır: varsayılan %35. Açık / kapalı ve düzey tarayıcıda saklanır
 * (`sp.muzik`, `sp.muzik.ses`); açma / kapama düğmesi hem üst çubukta hem mola menüsündedir (bkz. ui.js setMuzik),
 * ses düzeyi sürgüsü mola menüsündedir. Efekt sesi düğmesi (`sp.sound`) müziği etkilemez: ikisi bağımsızdır.
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
/** Son plaka evresi: ayakta bu kadar (ya da daha az) plaka kalınca gerilim parçasına geçilir. */
export const DORUK_PLAKA = 3;
/** Çapraz geçiş süresi (sn): sahne değişiminde ve parça bitmeden önce. */
const GECIS = 1.8;
const VARSAYILAN_SES = 0.35;
/** Süzülme saatinin adımı (sn). */
const ADIM = 0.05;

const kis = v => Math.max(0, Math.min(1, v));

/**
 * Doruk mu? Ayakta (`phase < 2`) üç ya da daha az plaka kaldıysa — yani son plaka evresi. Plakalar düşmeden
 * `ROUND.tremble` saniye önce titrer (`phase === 1`): merkez dışındaki her şey titriyorsa son plaka geliyor demektir,
 * gerilim parçası o an girer. Dış halka titrerken (13 plaka ayakta, 8'i titriyor) henüz doruk değildir.
 */
function doruktaMi(w) {
  let ayakta = 0, titreyen = 0;
  for (const s of w.plates) if (s.phase < 2) { ayakta++; if (s.phase === 1) titreyen++; }
  return ayakta <= DORUK_PLAKA || (titreyen > 0 && ayakta - titreyen <= DORUK_PLAKA);
}

/**
 * Hangi sahne çalmalı? Saf işlev: ekran akışından ve dünyanın durumundan okur, her kareden sorulabilir (aynı sahne
 * yeniden verilince hiçbir şey olmaz). Maç dışındaki her şey — giriş, lobi, mola, karne — sakin parçadır.
 *  - `started`: maç kuruldu mu (main.js `started`)
 *  - `screen`: açık perde ('home' | 'lobby' | 'pause' | 'results' | 'help' | null)
 *  - `w`: dünya (plates, state, winner)
 */
export function sahneSec(started, screen, w) {
  if (!started || !w || w.winner !== null || w.state === 'over') return 'sakin';
  // Yardım perdesi maçın üstünde açılır: müzik maçın müziğidir. Mola bir nefestir, sakin parçaya döner.
  if (screen && screen !== 'help') return 'sakin';
  return doruktaMi(w) ? 'doruk' : 'mac';
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
  try { const v = Number(localStorage.getItem('sp.muzik.ses')); if (Number.isFinite(v) && v > 0 && v <= 1) ses = v; } catch { /* yok */ }
  const sakla = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } };

  const parcalar = new Map();
  /** Süren süzülmeler: öğe -> { bas, hedef, t, sure, bitince }. Tek bir sayaç hepsini yürütür. */
  const suzulme = new Map();
  let saat = null, sahneAdi = null, sira = 0, aktif = null, dokunuldu = false, gizli = false;

  const hedefSes = () => (acik ? ses : 0);

  function tik() {
    for (const [a, f] of suzulme) {
      f.t += ADIM;
      const k = Math.min(1, f.t / f.sure);
      a.volume = kis(f.bas + (f.hedef - f.bas) * k);
      if (k >= 1) { suzulme.delete(a); f.bitince?.(); }
    }
    if (!suzulme.size && saat !== null) { clearInterval(saat); saat = null; }
  }
  /** Öğenin sesini `sure` saniyede `hedef`e süzer; `sure` 0 ise anında. */
  function suz(a, hedef, sure, bitince) {
    if (sure <= 0) { suzulme.delete(a); a.volume = kis(hedef); bitince?.(); return; }
    suzulme.set(a, { bas: a.volume, hedef, t: 0, sure, bitince });
    saat = saat ?? setInterval(tik, ADIM * 1000);
  }

  /** Parçanın `<audio>` öğesi; ilk istendiğinde kurulur (dosya o an inmeye başlar). */
  function parca(ad) {
    let a = parcalar.get(ad);
    if (a) return a;
    a = new Audio();
    a.preload = 'auto';
    a.volume = 0;
    a.hidden = true;
    a.dataset.parca = ad;
    // Göreli yol: hem web sunucusunda hem Capacitor'da (https://localhost/) aynı dosyayı bulur.
    a.src = `muzik/${ad}.mp3`;
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

  /** Şu an çalması gereken parçanın adı (hiçbiri değilse null). */
  function istenen() {
    if (kapali || !acik || !dokunuldu || !sahneAdi) return null;
    const liste = SAHNELER[sahneAdi];
    return liste?.length ? liste[sira % liste.length] : null;
  }

  function calistir(a) {
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
    yeni.volume = 0;
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

  /** İlk kullanıcı girdisi: tarayıcı buradan sonra çalmaya izin verir. */
  function ilkDokunus() {
    if (kapali || dokunuldu) return;
    dokunuldu = true;
    uygula(0.8);
  }
  if (!kapali) {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, ilkDokunus, { passive: true });
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
    /** Ses düzeyi (0-1); saklanır ve çalan parçaya anında uygulanır. */
    sesAyarla(v) {
      ses = kis(Number(v) || 0);
      sakla('sp.muzik.ses', String(ses));
      if (aktif && !suzulme.has(aktif)) aktif.volume = hedefSes();
      return ses;
    },
    /** Testler ve hata ayıklama için: hangi parça, hangi sahne, çalıyor mu. */
    durum() {
      return { kapali, acik, ses, sahne: sahneAdi, parca: aktif?.dataset.parca || null, caliyor: Boolean(aktif && !aktif.paused), ogeler: parcalar.size };
    },
  };
}
