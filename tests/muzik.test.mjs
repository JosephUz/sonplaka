// Oyun içi müzik (bkz. src/muzik.js): hangi sahnede hangi parçanın çaldığı, parçaların gerçekten durduğu ve **iki
// dağıtım yolunun da** (yerel/tünel sunucusu ile Cloudflare'e ve Play Store paketine giden dist/ derlemesi) müziği
// verdiği. Biri listeden düşerse oyun sessiz kalır ya da 404 alır — bu test tam olarak onu yakalar.
//
// Ayrıca STANDART üst araç çubuğu ve duraklatma menüsünün sırası: bütün JosephUz oyunlarında aynı olmalı
// (← josephuz.com · Ses · Müzik · Kontroller F1). Tarayıcı ölçümleri tests/muzik-smoke.mjs dosyasındadır.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ROUND } from '../src/config.js';
import { DORUK_PLAKA, sahneSec } from '../src/muzik.js';
import { createWorld, step } from '../src/world.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = ad => readFile(path.join(root, ad), 'utf8');
/** Parça adı → sahnesi; LISANS.txt ve src/muzik.js bu üçünü de tanımalı. */
const PARCALAR = ['son-1-hizli-aksiyon', 'son-2-boslukta', 'son-3-son-plaka'];

/** Maçı `sure` saniyeye kadar koşturur (plakalar ROUND takvimine göre titrer ve düşer). */
function oyna(sure) {
  const w = createWorld(7, { teamSize: 5, difficulty: 'normal' });
  const dt = 1 / 30;
  for (let t = 0; t < (ROUND.start + sure) / dt; t++) step(w, dt);
  return w;
}
const ayakta = w => w.plates.filter(s => s.phase < 2).length;

test('sahne seçimi: menü, lobi, mola ve karne sakin; maç ana tema; son plaka evresi gerilim', () => {
  const mac = oyna(10);
  assert.equal(sahneSec(false, 'home', null), 'sakin', 'giriş ekranı');
  assert.equal(sahneSec(false, 'lobby', mac), 'sakin', 'lobi');
  assert.equal(sahneSec(true, 'pause', mac), 'sakin', 'mola');
  assert.equal(sahneSec(true, 'results', mac), 'sakin', 'maç sonu karnesi');
  assert.equal(sahneSec(true, null, { ...mac, winner: 1 }), 'sakin', 'maç bittiyse karne parçası');
  assert.equal(sahneSec(true, null, { ...mac, state: 'over' }), 'sakin', 'maç bittiyse karne parçası');

  assert.equal(sahneSec(true, null, mac), 'mac', 'maç başı: 13 plaka ayakta');
  assert.equal(sahneSec(true, 'help', mac), 'mac', 'yardım perdesi maçın üstünde açılır: müzik maçın');
});

test('doruk: dış halka titrerken değil, son plaka evresi gelince (üç plaka ya da azı)', () => {
  // Dış halka ROUND.ring2At'te düşer, ondan ROUND.tremble saniye önce titrer: 13 plakanın 8'i titrese de doruk değil.
  const disTitriyor = oyna(ROUND.ring2At - 2);
  assert.equal(ayakta(disTitriyor), 13, 'dış halka henüz düşmedi');
  assert.equal(sahneSec(true, null, disTitriyor), 'mac', 'dış halka titrerken ana tema sürer');

  const icHalka = oyna(ROUND.ring2At + 5);
  assert.equal(ayakta(icHalka), 5, 'dış halka düştü: merkez + iç halka kaldı');
  assert.equal(sahneSec(true, null, icHalka), 'mac', 'beş plaka ayakta: hâlâ ana tema');

  // İç halka düşmeden ROUND.tremble saniye önce titrer: merkez dışındaki her şey düşmek üzere, gerilim o an girer.
  const icTitriyor = oyna(ROUND.ring1At - 2);
  assert.equal(ayakta(icTitriyor), 5);
  assert.equal(sahneSec(true, null, icTitriyor), 'doruk', 'iç halka titrerken son plaka evresi başlıyor');

  // İç halka düştükten hemen sonra: bu tohumda maç 82. saniyede biter (doğuş kapanınca bir takım tükenir), bu yüzden
  // ölçüm 81. saniyede — sonrası zaten karne, yani sakin parça.
  const sonPlaka = oyna(ROUND.ring1At + 1);
  assert.equal(sonPlaka.winner, null, 'maç henüz sürüyor');
  assert.ok(ayakta(sonPlaka) <= DORUK_PLAKA, `son plaka evresinde ${DORUK_PLAKA} ya da daha az plaka kalır`);
  assert.equal(sonPlaka.respawnOpen, false, 'son plakada doğuş kapanır');
  assert.equal(sahneSec(true, null, sonPlaka), 'doruk', 'son plaka: gerilim parçası');
  assert.equal(sahneSec(true, 'pause', sonPlaka), 'sakin', 'son plakada bile mola sakin parçaya döner');
});

test('parçalar yerinde: 128 kbps, dosya başı 3 MB altı, lisans notu yanında', async () => {
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

test('müzik iki dağıtım yolunda da verilir: sunucu ve dist/ derlemesi', async () => {
  const sunucu = await oku('server.mjs');
  assert.match(sunucu, /assetDirs = \['src', 'muzik'\]/, 'server.mjs muzik/ klasörünü servis etmeli');
  assert.match(sunucu, /'\.mp3': 'audio\/mpeg'/, 'mp3 içerik türü tanımlı olmalı');
  assert.match(sunucu, /Accept-Ranges/, 'ses dosyalarında Range desteklenmeli');
  const derleme = await oku('scripts/build-web.mjs');
  assert.match(derleme, /'muzik'\), path\.join\(dist, 'muzik'\)/, 'build-web.mjs muzik/ klasörünü dist/ altına kopyalamalı');
});

test('gösteri kipi ve otomatik tarayıcılar sessiz: muzik.js hiç <audio> kurmaz', async () => {
  const kaynak = await oku('src/muzik.js');
  assert.match(kaynak, /if \(gosteriAcik\(\)\) return true/, '?gosteri=1 müziği her durumda kapatmalı');
  assert.match(kaynak, /navigator\.webdriver/, 'Playwright gibi otomatik tarayıcılar sessiz olmalı');
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
  const sira = [...kart.matchAll(/id="(sp-[a-z-]+)"/g)].map(m => m[1]).filter(id => id !== 'sp-muzik-ses' && id !== 'sp-muzik-yuzde' && id !== 'sp-pause-note');
  assert.deepEqual(sira, ['sp-pause', 'sp-resume', 'sp-pause-help', 'sp-pause-sound', 'sp-pause-muzik', 'sp-muzik-row', 'sp-restart', 'sp-menu'],
    'duraklatma menüsünün sırası standart olmalı');
  assert.ok(kart.includes('>DEVAM ET →<'), 'ilk düğme "DEVAM ET →" olmalı');
  assert.ok(kart.includes("josephuz.com'a dön"), 'menünün sonunda josephuz.com bağlantısı olmalı');
});
