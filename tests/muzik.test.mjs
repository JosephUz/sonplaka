// Oyun içi müzik (bkz. src/muzik.js): hangi sahnede hangi parçanın çaldığı, parçaların gerçekten durduğu ve **iki
// dağıtım yolunun da** (yerel/tünel sunucusu ile Cloudflare'e ve Play Store paketine giden dist/ derlemesi) müziği
// verdiği. Biri listeden düşerse oyun sessiz kalır ya da 404 alır — bu test tam olarak onu yakalar.
//
// Ayrıca STANDART üst araç çubuğu ve duraklatma menüsünün sırası: bütün JosephUz oyunlarında aynı olmalı
// (← josephuz.com · Ses · Müzik · Kontroller F1). Tarayıcı ölçümleri tests/muzik-smoke.mjs dosyasındadır.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MUZIK_VAR, sahneSec } from '../src/muzik.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = ad => readFile(path.join(root, ad), 'utf8');
/**
 * Oyundaki parçalar; LISANS.txt ve src/muzik.js bunları tanımalı. 4 Ekim 2026'dan beri oyunda müzik yok (SAHNELER boş,
 * eski parçalar muzik/archive/ altında): `MUZIK_VAR` false iken parça dosyası / çalma ölçen bölümler atlanır, silinmez.
 * Müzik geri gelince yeni parça adları buraya yazılır.
 */
const PARCALAR = MUZIK_VAR ? ['son-5-sifir-yercekimi', 'son-6-son-isik', 'son-4-yorunge'] : [];
/** Parça gerektiren test: müzik yokken "müzik yok: atlandı" diye atlanır. */
const parcaTesti = MUZIK_VAR ? test : (ad, fn) => {
  console.log(`müzik yok: atlandı (${ad})`);
  return test(ad, { skip: 'müzik yok: atlandı' }, fn);
};
/** Dünya taslağı: doğuş açıksa dış / iç halka ayakta, kapalıysa **son plaka** evresi (bkz. world.js). */
const dunya = (respawnOpen, ek = {}) => ({ respawnOpen, winner: null, ...ek });

/**
 * Tarayıcı genelini Node'da taklit etmek için: `globalThis.navigator` yalnız okunur bir erişimci olduğundan düz
 * atama atar, `defineProperty` gerekir. Eski değerleri geri koyan bir işlev döner.
 */
function geneliKur(degerler) {
  const eski = Object.keys(degerler).map(ad => [ad, Object.getOwnPropertyDescriptor(globalThis, ad)]);
  const koy = (ad, value) => Object.defineProperty(globalThis, ad, { value, configurable: true, writable: true });
  for (const [ad, v] of Object.entries(degerler)) koy(ad, v);
  return () => { for (const [ad, tanim] of eski) if (tanim) Object.defineProperty(globalThis, ad, tanim); else delete globalThis[ad]; };
}

test('sahne seçimi: menü, lobi, mola ve karne sakin; maç ana tema; son plaka evresi gerilim', () => {
  assert.equal(sahneSec(false, 'home', null), 'sakin', 'giriş ekranı');
  assert.equal(sahneSec(false, 'lobby', dunya(true)), 'sakin', 'lobi');
  assert.equal(sahneSec(true, 'pause', dunya(true)), 'sakin', 'mola');
  assert.equal(sahneSec(true, 'results', dunya(false)), 'sakin', 'maç sonu karnesi');
  assert.equal(sahneSec(true, null, dunya(false, { winner: 1 })), 'sakin', 'maç bittiyse karne parçası');

  assert.equal(sahneSec(true, null, dunya(true)), 'mac', 'maç başı: doğuş açık');
  assert.equal(sahneSec(true, null, dunya(false)), 'doruk', 'iç halka düştü, doğuş kapandı: son plaka');
});

test('yardım perdesinin müziği altındaki ekranındır: maçtan açılırsa maçın, moladan açılırsa molanın', () => {
  // F1 maçın üstünde: altta ekran yok (helpReturn null), maç müziği sürer.
  assert.equal(sahneSec(true, 'help', dunya(true), null), 'mac', 'maçtan açılan yardım maç müziğini kesmez');
  assert.equal(sahneSec(true, 'help', dunya(false), null), 'doruk', 'son plakada da öyle');
  // Mola menüsündeki "Kontroller F1": altta mola var, sakin parça sürmeli — yoksa duraklatılmış oyunda
  // yardıma girip çıkmak maç müziğini açıp kapatıyordu.
  assert.equal(sahneSec(true, 'help', dunya(true), 'pause'), 'sakin', 'moladan açılan yardımda maç müziği başlamaz');
  assert.equal(sahneSec(true, 'help', dunya(false), 'pause'), 'sakin', 'son plakada molada da sakin kalır');
  assert.equal(sahneSec(true, 'help', dunya(false), 'results'), 'sakin', 'karneden açılan yardım');
});

/**
 * `createMuzik` tarayıcı nesnelerine dayanır; burada en küçük taklitle kurulur ve **davranışı** ölçülür: hangi
 * olayda `play()` çağrıldığı, reddedilince yeniden denenip denenmediği, ses düzeyinin nereye yazıldığı.
 *
 * `secenek`:
 *  - `iosVolume`: `<audio>.volume` salt okunur olsun (iOS Safari böyledir) — atama yutulur, değer 1 kalır.
 *  - `playRed`: ilk kaç `play()` çağrısı reddedilsin (tarayıcının otomatik oynatma engeli).
 */
async function muzikKur(saklanan = {}, secenek = {}) {
  const { iosVolume = false, playRed = 0 } = secenek;
  const { createMuzik } = await import('../src/muzik.js');
  const kutu = { ...saklanan };
  const dinlenen = [];
  const dinleyiciler = new Map();
  const ogeler = [];
  const baglamlar = [];
  let kalanRed = playRed;

  class SahteAudio {
    constructor() {
      this.dataset = {}; this.paused = true; this.loop = false; this.currentTime = 0; this.duration = NaN;
      this.calmaSayisi = 0;
      if (iosVolume) { Object.defineProperty(this, 'volume', { get: () => 1, set() { /* iOS: yutulur */ }, configurable: true }); }
      else this.volume = 0;
      ogeler.push(this);
    }
    addEventListener() {}
    pause() { this.paused = true; }
    play() {
      this.calmaSayisi++;
      if (kalanRed > 0) { kalanRed--; return Promise.reject(new Error('NotAllowedError')); }
      this.paused = false;
      return Promise.resolve();
    }
  }
  class SahteKazanc { constructor() { this.gain = { value: 1 }; } connect() {} }
  class SahteBaglam {
    constructor() { this.state = 'suspended'; this.destination = {}; this.kaynaklar = []; baglamlar.push(this); }
    createGain() { return new SahteKazanc(); }
    createMediaElementSource(a) { this.kaynaklar.push(a); return { connect() {} }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }

  const belge = {
    addEventListener: (ev, fn) => { dinlenen.push(ev); if (!dinleyiciler.has(ev)) dinleyiciler.set(ev, []); dinleyiciler.get(ev).push(fn); },
    hidden: false,
  };
  const geriAl = geneliKur({
    location: { search: '?muzik=1', hostname: 'localhost', protocol: 'http:', host: 'localhost' },
    navigator: { webdriver: false },
    window: { Capacitor: undefined },
    localStorage: { getItem: k => (k in kutu ? kutu[k] : null), setItem: (k, v) => { kutu[k] = String(v); } },
    document: belge,
    Audio: SahteAudio,
    AudioContext: SahteBaglam,
  });
  /** Olayı tetikler (tarayıcıdaki dokunuş / tuş karşılığı). */
  const olay = ev => { for (const fn of dinleyiciler.get(ev) ?? []) fn(); };
  /** Sekmeyi gizler / geri getirir (tarayıcıdaki `visibilitychange` karşılığı). */
  const gizle = v => { belge.hidden = v; olay('visibilitychange'); };
  try {
    return { muzik: createMuzik({ appendChild() {} }), dinlenen, olay, gizle, belge, ogeler, baglamlar, kutu, geriAl };
  } catch (e) { geriAl(); throw e; }
}

/** Süzülme `setInterval` ile yürür: gerçek zaman bekler (ADIM 50 ms). */
const bekle = ms => new Promise(r => setTimeout(r, ms));

test('müzik ses düzeyi sabit %35: eski sürümden saklı düzey okunmaz (menüde sürgü yok)', async () => {
  let k = await muzikKur();
  try { assert.ok(Math.abs(k.muzik.ses - 0.35) < 1e-9, `varsayılan %35 (okunan: ${k.muzik.ses})`); } finally { k.geriAl(); }
  // Eski sürümde sürgüyle saklanmış her değer (0 dahil) yok sayılır: herkes aynı standart düzeyde başlar.
  for (const bozuk of ['0', '0.6', '', 'abc', '-1', '2']) {
    k = await muzikKur({ 'sp.muzik.ses': bozuk });
    try { assert.ok(Math.abs(k.muzik.ses - 0.35) < 1e-9, `saklı değer (${JSON.stringify(bozuk)}) yok sayılmalı`); } finally { k.geriAl(); }
  }
});

test('ilk dokunuş bırakma olaylarında da yakalanır (iOS Safari sesi touchend / click ile açar)', async () => {
  const k = await muzikKur();
  try {
    for (const ev of ['pointerup', 'touchend', 'click']) {
      assert.ok(k.dinlenen.includes(ev), `${ev} dinlenmeli: iOS yalnız basma olayında ses çalmaya izin vermez`);
    }
    for (const ev of ['pointerdown', 'touchstart', 'keydown']) assert.ok(k.dinlenen.includes(ev), ev + ' dinlenmeli');
  } finally { k.geriAl(); }
});

/**
 * Dokunmatikteki gerçek sıra: parmak basınca (`pointerdown`) tarayıcı `play()`'i **reddeder**, parmak kalkınca
 * (`touchend`) izin verir. Yalnız dinleyici adlarına bakan test bunu kaçırıyordu; burada reddedilen deneme ve
 * ardından gelen başarılı deneme sayılıyor.
 */
parcaTesti('basmada play() reddedilirse bırakmada yeniden denenir ve müzik başlar', async () => {
  const k = await muzikKur({}, { playRed: 1 });
  try {
    k.muzik.sahne('sakin');
    assert.equal(k.ogeler.length, 0, 'dokunuştan önce hiçbir <audio> kurulmaz (6 MB boşuna inmesin)');

    k.olay('pointerdown');
    const oge = k.ogeler[0];
    assert.ok(oge, 'ilk dokunuşta parça kurulur');
    assert.equal(oge.calmaSayisi, 1, 'basmada bir kez denenir');
    await bekle(20); // reddin yakalanması mikro görev sırasındadır
    assert.equal(oge.paused, true, 'reddedilen deneme çalmaz');
    assert.equal(k.muzik.durum().caliyor, false);

    k.olay('touchend');
    assert.equal(oge.calmaSayisi, 2, 'bırakmada yeniden denenmeli: yoksa iOS\'ta müzik hiç başlamaz');
    await bekle(20);
    assert.equal(oge.paused, false, 'ikinci denemede çalmaya başlar');
    assert.equal(k.muzik.durum().caliyor, true);
    assert.equal(k.muzik.durum().parca, 'son-6-son-isik', 'menüde sakin parça çalar');
  } finally { k.geriAl(); }
});

/**
 * iOS Safari'de `<audio>.volume` salt okunurdur: atama yutulur, değer 1 kalır. Düzey oraya yazılmaya devam
 * ederse müzik %35 yerine tam seste çalar, sürgü hiçbir şey yapmaz ve çapraz geçişte iki parça birden bağırır.
 * Düzeltme: düzeyin uygulanıp uygulanmadığı ölçülür, uygulanmıyorsa Web Audio kazancına geçilir.
 */
parcaTesti('iOS: <audio>.volume yutuluyorsa ses düzeyi Web Audio kazancıyla verilir', async () => {
  const k = await muzikKur({}, { iosVolume: true });
  try {
    k.muzik.sahne('sakin');
    k.olay('touchend');
    const d = k.muzik.durum();
    assert.equal(d.sesYolu, 'gain', 'volume uygulanmıyorsa kazanç yoluna geçilmeli');
    assert.equal(k.baglamlar.length, 1, 'tek bir AudioContext kurulur');
    assert.deepEqual(k.baglamlar[0].kaynaklar, [k.ogeler[0]], 'parça Web Audio grafiğine bağlanır');
    assert.equal(k.baglamlar[0].state, 'running', 'askıdaki bağlam dokunuşta sürdürülmeli, yoksa çıkış sessiz kalır');

    await bekle(1100); // açılış süzülmesi 0,8 sn
    assert.ok(Math.abs(k.muzik.durum().duzey - 0.35) < 0.02, `varsayılan %35 kazanca yazılmalı (ölçülen: ${k.muzik.durum().duzey})`);
    assert.equal(k.ogeler[0].volume, 1, 'öğenin kendi düzeyi iOS\'ta 1 kalır: grafiğe tam ses girer');

    k.muzik.sesAyarla(0.8);
    assert.ok(Math.abs(k.muzik.durum().duzey - 0.8) < 1e-6, 'sürgü kazancı anında değiştirmeli');
  } finally { k.geriAl(); }
});

/**
 * iOS uygulamayı arka plana alınca Web Audio bağlamını `suspended` / `interrupted` bırakır ve çalan öğeyi
 * duraklatır. `visibilitychange` içinden yapılan `resume()` kullanıcı hareketi sayılmadığı için işe yaramaz:
 * bağlam ancak bir dokunuşun içinden geri gelir. Eskiden dinleyici `dokunuldu` true olduğu için hemen dönüyordu,
 * yani dönüşten sonraki hiçbir dokunuş bağlamı sürdürmüyordu — öğe "çalıyor" görünürken ses çıkmıyordu.
 */
parcaTesti('iOS: arka plandan dönünce bağlam ve çalma sonraki dokunuşta onarılır', async () => {
  const k = await muzikKur({}, { iosVolume: true });
  try {
    k.muzik.sahne('sakin');
    k.olay('touchend');
    const oge = k.ogeler[0], baglam = k.baglamlar[0];
    assert.equal(baglam.state, 'running', 'ilk dokunuşta bağlam sürdürülür');
    assert.equal(oge.paused, false);

    // Arka plana atılıp dönüldü: iOS bağlamı kesti ve öğeyi duraklattı (sayfa görünür, `gizli` false).
    baglam.state = 'interrupted';
    oge.paused = true;
    const oncekiCalma = oge.calmaSayisi;

    k.olay('pointerup');
    assert.equal(baglam.state, 'running', 'dönüşten sonraki dokunuş bağlamı yeniden sürdürmeli');
    assert.ok(oge.calmaSayisi > oncekiCalma, 'beklenmedik duraklamada parça yeniden başlatılmalı');
    await bekle(20);
    assert.equal(oge.paused, false, 'müzik dokunuştan sonra gerçekten çalmalı');
    assert.equal(k.ogeler.length, 1, 'onarım yeni bir <audio> kurmaz: aynı parça sürer');
  } finally { k.geriAl(); }
});

/**
 * Sekme çapraz geçişin ortasında gizlenirse susması gereken eski parça arka planda çalmayı sürdürüyordu: yalnız
 * `aktif` duraklatılıyor, süzülme sayacı da arka planda yavaşladığı için geçiş on saniyelerce asılı kalıyordu.
 */
parcaTesti('sekme gizlenince geçişteki parçalar da durur; dönünce yalnız doğru parça sürer', async () => {
  const k = await muzikKur();
  try {
    k.muzik.sahne('sakin');
    k.olay('click');
    await bekle(1000); // açılış süzülmesi bitsin
    const sakin = k.ogeler[0];
    assert.equal(sakin.paused, false);

    // Maça geçiş: 1,8 sn çapraz süzülme başlar, ortasında sekme gizlenir.
    k.muzik.sahne('mac');
    await bekle(200);
    const mac = k.ogeler[1];
    assert.ok(mac, 'maç parçası kuruldu');
    assert.equal(mac.paused, false, 'geçişte iki parça birden çalar');
    assert.equal(sakin.paused, false);

    k.gizle(true);
    assert.equal(sakin.paused, true, 'geçişte susmakta olan parça da duraklamalı');
    assert.equal(mac.paused, true, 'gizli sekmede hiçbir parça çalmaz');
    assert.equal(sakin.currentTime, 0, 'susan parça başa sarılır: bekleyen temizlik de çalışmalı');

    // Arka planda süzülme sayacı asılı kalmamalı: beklemeye rağmen hiçbir şey kendiliğinden çalmaya başlamaz.
    await bekle(400);
    assert.equal(sakin.paused, true);
    assert.equal(mac.paused, true);

    k.gizle(false);
    await bekle(500);
    assert.equal(mac.paused, false, 'dönünce sahnenin parçası kaldığı yerden sürer');
    assert.equal(sakin.paused, true, 'eski parça sessiz kalır');
    assert.equal(k.muzik.durum().parca, 'son-5-sifir-yercekimi');
  } finally { k.geriAl(); }
});

parcaTesti('masaüstü / Android: volume çalışıyorsa Web Audio hiç kurulmaz', async () => {
  const k = await muzikKur();
  try {
    k.muzik.sahne('sakin');
    k.olay('click');
    assert.equal(k.muzik.durum().sesYolu, 'oge', 'volume uygulanıyorsa öğe yolunda kalınır');
    assert.equal(k.baglamlar.length, 0, 'gereksiz yere AudioContext açılmamalı');
    await bekle(1100);
    assert.ok(Math.abs(k.ogeler[0].volume - 0.35) < 0.02, `düzey öğeye yazılmalı (ölçülen: ${k.ogeler[0].volume})`);
  } finally { k.geriAl(); }
});

/**
 * Sürgü dibe çekilince sessizlik **duraklatmayla** sağlanır: düzeyi hiç uygulayamayan tarayıcıda (ne `volume`
 * ne Web Audio) kısmak işe yaramazdı. Parça kaldığı yerde bekler, sürgü kalkınca oradan sürer.
 */
parcaTesti('ses düzeyi sıfır parçayı duraklatır, kaldığı yerde bekletir; sıfırdan çıkınca oradan sürer', async () => {
  const k = await muzikKur();
  try {
    k.muzik.sahne('sakin');
    k.olay('click');
    await bekle(1100);
    const oge = k.ogeler[0];
    assert.equal(oge.paused, false);
    oge.currentTime = 42;

    k.muzik.sesAyarla(0);
    await bekle(500); // 0,3 sn süzülme + duraklatma
    assert.equal(oge.paused, true, 'sıfır düzeyde parça duraklar');
    assert.equal(oge.currentTime, 42, 'başa sarılmaz: sürgü kalkınca kaldığı yerden sürmeli');
    assert.equal(k.muzik.durum().caliyor, false);

    k.muzik.sesAyarla(0.5);
    await bekle(500);
    assert.equal(oge.paused, false, 'sürgü kalkınca yeniden çalar');
    assert.equal(oge.currentTime, 42, 'aynı yerden sürer');
    assert.ok(Math.abs(oge.volume - 0.5) < 0.02, 'yeni düzey uygulanır');
  } finally { k.geriAl(); }
});

parcaTesti('parçalar yerinde: 128 kbps, dosya başı 3 MB altı, lisans notu yanında', async () => {
  for (const ad of PARCALAR) {
    const bilgi = await stat(path.join(root, 'muzik', ad + '.mp3'));
    assert.ok(bilgi.size > 500_000, `${ad}.mp3 eksik ya da bozuk (${bilgi.size} bayt)`);
    assert.ok(bilgi.size <= 3 * 1024 * 1024, `${ad}.mp3 3 MB'tan büyük (${bilgi.size} bayt)`);
  }
  const lisans = await oku('muzik/LISANS.txt');
  assert.match(lisans, /© 2026 JosephUz/);
  assert.match(lisans, /VSCO 2 Community Edition \(CC0\)/);
  for (const ad of PARCALAR) assert.ok(lisans.includes(ad + '.mp3'), `LISANS.txt ${ad} parçasını saymıyor`);
});

/**
 * Sunucuyu gerçekten ayağa kaldırıp müzik isteği atar: kaynakta metin aramak yerine davranışı ölçer. Port
 * başkasıyla çakışmasın diye yüksek ve rastgeledir; süreç test bitince kapatılır.
 */
test('sunucu müziği gerçekten veriyor: içerik türü, önbellek ve Range (206)', async t => {
  const port = 5400 + Math.floor(Math.random() * 400);
  const sunucu = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore' });
  t.after(() => sunucu.kill());
  const adres = `http://127.0.0.1:${port}`;
  // Dinlemeye başlamasını bekle (ilk istek bağlanana kadar).
  for (let i = 0; i < 100; i++) {
    try { await fetch(adres + '/health'); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }

  // Müzik yokken (MUZIK_VAR false) parça dosyası bölümü atlanır; muzik/ servisinin dışa yol açmadığı yine ölçülür.
  if (!MUZIK_VAR) console.log('müzik yok: atlandı (sunucu parça dosyası / Range ölçümü)');
  else {
  const tam = await fetch(adres + '/muzik/son-6-son-isik.mp3');
  assert.equal(tam.status, 200);
  assert.equal(tam.headers.get('content-type'), 'audio/mpeg', 'mp3 içerik türü');
  assert.equal(tam.headers.get('accept-ranges'), 'bytes', 'Range desteklendiği ilan edilmeli');
  assert.match(tam.headers.get('cache-control'), /max-age=604800/, 'müzik bir hafta önbelleğe alınır (oyun dosyaları alınmaz)');
  const govde = Buffer.from(await tam.arrayBuffer());
  assert.ok(govde.length > 500_000, 'dosyanın tamamı geliyor');

  // Chrome inmemiş bir noktaya sarmak için Range ister: karşılığı 206 ve tam o dilim olmalı.
  const dilim = await fetch(adres + '/muzik/son-6-son-isik.mp3', { headers: { Range: 'bytes=100-199' } });
  assert.equal(dilim.status, 206, 'Range isteğine 206 dönmeli');
  assert.equal(dilim.headers.get('content-range'), `bytes 100-199/${govde.length}`);
  const parca = Buffer.from(await dilim.arrayBuffer());
  assert.equal(parca.length, 100);
  assert.deepEqual(parca, govde.subarray(100, 200), 'dönen dilim dosyanın o bölümü olmalı');

  // Anlaşılmayan Range: tam dosya, 200.
  const bozuk = await fetch(adres + '/muzik/son-6-son-isik.mp3', { headers: { Range: 'satir=1-2' } });
  assert.equal(bozuk.status, 200, 'anlaşılmayan Range tam dosyaya düşer');
  }

  // muzik/ dışındaki dosyalara yol açılmadı.
  assert.equal((await fetch(adres + '/muzik/yok.mp3')).status, 404);
  assert.equal((await fetch(adres + '/package.json')).status, 404, 'muzik/ servisi başka dosyaları açmamalı');
});

/** Derlemeyi gerçekten koşturur: `dist/muzik/` dosyaları kaynağın aynısı mı (Cloudflare ve Play Store paketi). */
test('müzik dist/ derlemesine de giriyor', async () => {
  await new Promise((coz, hata) => {
    const p = spawn(process.execPath, ['scripts/build-web.mjs'], { cwd: root, stdio: 'ignore' });
    p.on('error', hata);
    p.on('exit', k => (k === 0 ? coz() : hata(new Error('build-web.mjs çıkış kodu ' + k))));
  });
  for (const ad of PARCALAR) {
    const [kaynak, derlenen] = await Promise.all([
      stat(path.join(root, 'muzik', ad + '.mp3')), stat(path.join(root, 'dist', 'muzik', ad + '.mp3')),
    ]);
    assert.equal(derlenen.size, kaynak.size, `dist/muzik/${ad}.mp3 kaynaktan farklı`);
  }
  await stat(path.join(root, 'dist', 'muzik', 'LISANS.txt')); // yoksa atar
  // Arşiv yayına girmez; müzik yokken dist/muzik/ yalnız lisans notunu taşır (boş müzik klasörü derlemeyi bozmaz).
  const derlenenler = await readdir(path.join(root, 'dist', 'muzik'));
  assert.ok(!derlenenler.includes('archive'), 'muzik/archive/ dist/ derlemesine girmemeli');
  if (!MUZIK_VAR) {
    console.log('müzik yok: atlandı (dist/ parça dosyası karşılaştırması)');
    assert.deepEqual(derlenenler.filter(ad => ad.endsWith('.mp3')), [], 'müzik yokken dist/muzik/ altında mp3 olmamalı');
  }
});

/** Müzik yokken (SAHNELER boş): dokunuşta hiçbir <audio> kurulmaz, hiçbir dosya istenmez, hiçbir şey çalmaz. */
test('parça yoksa hiçbir şey indirilmez ve çalmaz; parcaVar MUZIK_VAR ile aynı', async () => {
  const k = await muzikKur();
  try {
    assert.equal(k.muzik.parcaVar, MUZIK_VAR, 'createMuzik().parcaVar, MUZIK_VAR ile aynı olmalı');
    if (MUZIK_VAR) return;
    for (const sahne of ['sakin', 'mac', 'doruk']) {
      k.muzik.sahne(sahne);
      for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) k.olay(ev);
    }
    k.gizle(true); k.gizle(false);
    k.muzik.ac(false); k.muzik.ac(true);
    await bekle(100);
    assert.equal(k.ogeler.length, 0, 'parça yokken hiçbir <audio> kurulmaz (dosya istenmez)');
    assert.equal(k.muzik.durum().caliyor, false);
    assert.equal(k.muzik.durum().parca, null);
  } finally { k.geriAl(); }
});

/**
 * `muzikKapali()` tarayıcı genelini (location, navigator) okur; burada Node'da taklit edilip **davranışı** ölçülür:
 * gösteri ve otomatik tarayıcı sessiz, `?muzik=1` yalnız otomatik tarayıcıyı açar, gösteriyi açamaz.
 */
test('gösteri kipleri ve otomatik tarayıcılar sessiz; ?muzik=1 gösteriyi açamaz', async () => {
  const { muzikKapali } = await import('../src/muzik.js');
  let geriAl = () => {};
  const kur = (search, webdriver) => {
    geriAl();
    geriAl = geneliKur({
      location: { search, hostname: 'localhost', protocol: 'http:', host: 'localhost' },
      navigator: { webdriver },
      window: { Capacitor: undefined },
    });
  };
  try {
    kur('', false);
    assert.equal(muzikKapali(), false, 'sıradan tarayıcıda müzik açık');
    kur('?gosteri=1', false);
    assert.equal(muzikKapali(), true, '?gosteri=1 müziği kapatır (video betiği kendi müziğini ekler)');
    kur('?gosteri=1&muzik=1', false);
    assert.equal(muzikKapali(), true, 'gösteriyi ?muzik=1 bile açamaz');
    kur('', true);
    assert.equal(muzikKapali(), true, 'otomatik tarayıcı (Playwright) sessiz: 6 MB ses indirmesin');
    kur('?muzik=1', true);
    assert.equal(muzikKapali(), false, '?muzik=1 otomatik tarayıcıda açar (müziği ölçen test bunu kullanır)');
    kur('?muzik=0', false);
    assert.equal(muzikKapali(), true, '?muzik=0 elle kapatır');
  } finally { geriAl(); }
});

test('STANDART üst araç çubuğu: ← josephuz.com · Ses · Müzik · Kontroller F1 (bu sırayla)', async () => {
  const html = await oku('index.html');
  const cubuk = html.slice(html.indexOf('<div class="header-actions">'), html.indexOf('</div>', html.indexOf('<div class="header-actions">')));
  const sira = [...cubuk.matchAll(/id="(sp-[a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(sira.slice(0, 4), ['sp-site', 'sp-sound', 'sp-muzik', 'sp-help-open'],
    'standart dörtlü bu sırayla başta olmalı; oyuna özgü düğmeler sonra gelir');
  assert.ok(cubuk.includes('>Ses: açık<'), 'ses düğmesinin yazısı "Ses: açık" olmalı ("Ses açık" değil)');
  assert.ok(cubuk.includes('>Müzik: açık<'), 'müzik düğmesinin yazısı "Müzik: açık" olmalı');
  assert.ok(/>Kontroller <kbd>F1<\/kbd></.test(cubuk), 'yardım düğmesi "Kontroller F1" olmalı ("Nasıl oynanır" değil)');
});

test('STANDART duraklatma menüsü: DEVAM ET → · Kontroller F1 · Ses · Müzik · … · josephuz.com\'a dön', async () => {
  const html = await oku('index.html');
  const kart = html.slice(html.indexOf('<section id="sp-pause"'), html.indexOf('</section>', html.indexOf('<section id="sp-pause"')));
  const sira = [...kart.matchAll(/id="(sp-[a-z-]+)"/g)].map(m => m[1]).filter(id => id !== 'sp-pause-note');
  assert.deepEqual(sira, ['sp-pause', 'sp-resume', 'sp-pause-help', 'sp-pause-sound', 'sp-pause-muzik', 'sp-restart', 'sp-menu'],
    'duraklatma menüsünün sırası standart olmalı');
  assert.ok(!kart.includes('type="range"'), 'menüde müzik sesi sürgüsü olmamalı (ses düzeyi sabit)');
  assert.ok(kart.includes('>DEVAM ET →<'), 'ilk düğme "DEVAM ET →" olmalı');
  assert.ok(kart.includes("josephuz.com'a dön"), 'menünün sonunda josephuz.com bağlantısı olmalı');
});
