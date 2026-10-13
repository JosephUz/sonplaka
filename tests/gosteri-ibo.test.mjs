// "İbo" gösteri sahnesinin (`?gosteri=ibo`, bkz. src/gosteri-ibo.js) kabul ölçütleri. Sahne üç.js ve DOM kullanmaz:
// görünüm yerine sahte bir `view` verilir ve sahne Node'da, çekimdeki gibi 1/30 adımlarla baştan sona koşturulur.
// Denetlenen, görevdeki (JOS-2266) altı ölçüt: altyazılar kendi saniyelerinde çıkar, düşüş sessizliğe denk gelir,
// "yürüyor" anında İbo aşağıda yürüyor, iki tekrar açısı var, ikinci düşüş yerinde ve süre sesle aynı.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ALTYAZI, ISARET, createIboGosteri } from '../src/gosteri-ibo.js';
import { GOSTERI_IBO } from '../src/config.js';

/**
 * Sesin süresi: calisma/icerik/muzik/short/kaynak/son-plaka-meme-kahkaha.mp3. Kayıt, "Oğlum yükselmiş ha" ve
 * ardından gelen kahkahayı içerir, sonraki konuşmadan önce (34,75) kesilmiştir. Oyun görüntüsü burada biter;
 * videonun kalan 3 saniyesi kurgudaki SON PLAKA · josephuz.com kapanışıdır.
 */
const SES = 34.75;
const KARE = 1 / 30;

/** Sahneyi baştan sona koşturur; her karede İbo'nun durumunu toplar. */
function kostur() {
  const sahte = { setCamera() {}, setWorld() {}, face() {}, event() {}, setFov() {}, shake() {} };
  const s = createIboGosteri({ view: sahte });
  const w = s.basla();
  const ibo = w.players[0], iz = [];
  for (let i = 1; i <= Math.round(SES * 30); i++) {
    s.guncelle(KARE);
    iz.push({ t: i * KARE, x: ibo.x, y: ibo.y, z: ibo.z, ground: ibo.ground, out: ibo.out,
      hiz: Math.hypot(ibo.vx, ibo.vz), plaka: ibo.plate });
  }
  return { s, w, ibo, iz, olcum: s.olcum() };
}

const o = kostur();
/** `t` anına en yakın kare. */
const kare = t => o.iz.reduce((en, k) => (Math.abs(k.t - t) < Math.abs(en.t - t) ? k : en), o.iz[0]);

test('1 · her altyazı kendi cümlesinin saniyesinde çıkar', () => {
  assert.equal(o.olcum.altyazi.length, ALTYAZI.length, 'bütün altyazılar gösterilir');
  for (const [i, kayit] of o.olcum.altyazi.entries()) {
    assert.equal(kayit.metin, ALTYAZI[i][2]);
    const sapma = kayit.t - ALTYAZI[i][0];
    assert.ok(sapma >= 0 && sapma <= KARE + 1e-6, `"${kayit.metin}" ${ALTYAZI[i][0]} sn'de çıkar (sapma ${sapma.toFixed(3)} sn)`);
  }
});

test('2 · İbo\'nun düşüşü 18,5-20 sn\'deki sessizliğe denk gelir', () => {
  assert.ok(Math.abs(o.olcum.dususAt - ISARET.dusus) <= KARE + 1e-6, `plaka 18,5'te çöker (${o.olcum.dususAt})`);
  assert.ok(o.olcum.carpmaAt > ISARET.dusus && o.olcum.carpmaAt < 20,
    `çarpma sessizliğin içinde (${o.olcum.carpmaAt?.toFixed(2)} sn)`);
  // Düşüş gerçekten derin ve sert: oyunun kendi yerçekimiyle 12 birimden fazla iner, 20 birim/sn üstünde çarpar.
  assert.ok(o.olcum.carpmaDerin > 12, `düşüş derin (${o.olcum.carpmaDerin.toFixed(1)} birim)`);
  assert.ok(o.olcum.carpmaHiz > 20, `çarpma sert (${o.olcum.carpmaHiz.toFixed(1)} birim/sn)`);
  // Düşüş boyunca hiç yere basmaz: ara bir plakaya takılmadan boşluğa düşer.
  const dususte = o.iz.filter(k => k.t > o.olcum.dususAt + 0.1 && k.t < o.olcum.carpmaAt - 0.05);
  assert.ok(dususte.every(k => !k.ground), 'düşüş boyunca havadadır');
});

test('3 · "yürüyor" (20,36 sn) anında İbo aşağıda yürüyor görünür', () => {
  const k = kare(ISARET.yuruyor);
  assert.ok(!k.out, 'İbo elenmemiş, sahnede');
  assert.ok(k.ground && k.plaka === 0, 'aşağıdaki plakanın üstünde ayakta');
  assert.ok(k.y < GOSTERI_IBO.derinlik + 0.2, `çok aşağıda (y ${k.y.toFixed(1)})`);
  assert.ok(k.hiz > 0.4, `yürüyor (${k.hiz.toFixed(2)} birim/sn)`);
  assert.ok(o.olcum.yuruyor2036, 'sahnenin kendi ölçümü de yürüdüğünü söyler');
  // Çarpmadan sonra gerçekten yol alır (sersem yürüyüş): iki saniyede en az bir birim.
  const a = kare(20.5), b = kare(22.5);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 1, 'çarpmadan sonra yürüyerek yol alır');
});

test('4 · üç tekrar açısı var ve çarpma havaya sekmeyle biter', () => {
  assert.equal(o.olcum.tekrarAcisi, 3, 'üç tekrar açısı oynatılır');
  assert.ok(o.olcum.sekme > 0.8, `çarpma İbo'yu havaya sektirir (${o.olcum.sekme.toFixed(2)} birim)`);
  assert.ok(ISARET.tekrar1 < ISARET.tekrar2 && ISARET.tekrar2 < ISARET.tekrar3 && ISARET.tekrar3 < ISARET.canli,
    'üç açı da sırayla ve sahnenin içinde');
  // İkinci açı altyazısızdır: ondan sonraki altyazılar üçüncü açıya ("Oğlum yükselmiş ha" + kahkaha) aittir.
  assert.ok(ALTYAZI.every(([bas]) => bas < ISARET.tekrar2 || bas >= ISARET.tekrar3),
    'ikinci tekrar açısı altyazısızdır');
});

test('5 · kahkahanın tepesinde İbo sekmenin en yüksek noktasında', () => {
  // Kahkaha ~33,4'te doruğa çıkıyor; üçüncü tekrar açısının kayıt penceresi, sekmenin tepesi tam o kareye
  // düşecek şekilde seçildi (bkz. config GOSTERI_IBO.tekrar.uc).
  const tepe = kare(ISARET.sekmeTepesi);
  const once = kare(ISARET.sekmeTepesi - 0.45), sonra = kare(ISARET.sekmeTepesi + 0.45);
  assert.ok(!tepe.out && !tepe.ground, 'kahkahanın tepesinde İbo havada');
  assert.ok(tepe.y > once.y && tepe.y > sonra.y,
    `sekmenin en yüksek noktası kahkahanın tepesinde (${once.y.toFixed(2)} → ${tepe.y.toFixed(2)} → ${sonra.y.toFixed(2)})`);
  assert.ok(tepe.y - GOSTERI_IBO.derinlik > 1, `plakadan en az 1 birim yukarıda (${(tepe.y - GOSTERI_IBO.derinlik).toFixed(2)})`);
  // Kahkaha altyazısı yazıya dökülmez.
  assert.equal(ALTYAZI.at(-1)[2], '😂', 'son altyazı kahkaha simgesi');
  assert.equal(ALTYAZI.at(-2)[2], 'Oğlum yükselmiş ha.', 'ondan önceki "Oğlum yükselmiş ha."');
  assert.ok(ALTYAZI.at(-1)[1] < ISARET.bitis - 0.2, 'son altyazı kapanıştan önce kalkar');
});

test('6 · süre sesle aynı ve sahne oyunun kurallarından sapmaz', () => {
  assert.ok(o.olcum.saniye >= SES - KARE, `sahne sesin süresi kadar koşar (${o.olcum.saniye.toFixed(2)} sn)`);
  assert.ok(o.olcum.bitti, 'oyun görüntüsünün sonuna varılır');
  assert.equal(o.olcum.rampaKullanimi, 0, 'İbo hiçbir rampaya basmaz (sahne yalnız yürüyüş ve düşüş)');
  assert.equal(o.w.winner, null, 'maç bitmez: sahne sonuna kadar akar');
  assert.equal(o.w.discs.length, 0, 'sahnede hiç disk atılmaz');
  // Sahnede tek görünür oyuncu vardır; kalan dört koltuk gizlidir.
  assert.equal(o.w.players.filter(p => !p.out).length, o.ibo.out ? 0 : 1, 'kadrajda yalnız İbo var');
});

test('sahne kare kare yeniden üretilebilir (iki koşu birebir aynı)', () => {
  const b = kostur();
  assert.deepEqual(b.olcum.altyazi.map(a => a.t), o.olcum.altyazi.map(a => a.t));
  assert.equal(b.olcum.carpmaAt, o.olcum.carpmaAt);
  assert.deepEqual([b.ibo.x, b.ibo.y, b.ibo.z], [o.ibo.x, o.ibo.y, o.ibo.z]);
});
