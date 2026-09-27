import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, CROWBAR, DISC, FREEZE, PAD, PICKUP, ROUND } from '../src/config.js';
import { aliveCount, createWorld, groundAt, jump, step, swing, throwDisc } from '../src/world.js';

/** Raund oynanır durumda, herkes yerinde; botlar düşünmesin diye uzun think. */
const setup = () => {
  const w = createWorld();
  w.state = 'play'; w.t = 0;
  for (const p of w.players) { p.think = 999; p.human = true; }
  return w;
};
const run = (w, n, input = {}) => { for (let i = 0; i < n; i++) step(w, 1 / 60, input); };
/** Oyuncuyu merkez plakaya koyar. */
const center = (w, id, x = 0, z = 0) => { const p = w.players[id]; Object.assign(p, { x, y: 0, z, vx: 0, vy: 0, vz: 0, ground: true, plate: 0, padLock: 1 }); return p; };
/** Bütün oyuncuları ayrı ayrı uzak plakalara koyar (birbirine değmesinler). */
const spread = w => { w.players.forEach((p, i) => { const pl = w.arena.plates[5 + (i % 8)]; Object.assign(p, { x: pl.x, y: 0, z: pl.z, plate: pl.id, ground: true, padLock: 1 }); }); };

test('arena: merkez + 4 iç + 8 dış plaka, her takıma 4 doğuş plakası, karşılıklı zıplama plakaları', () => {
  const w = createWorld(), a = w.arena;
  assert.equal(a.plates.length, 13);
  assert.deepEqual(a.plates.map(p => p.ring), [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2]);
  assert.equal(a.spawns[0].length, 4); assert.equal(a.spawns[1].length, 4);
  assert.equal(a.pads.length, 40);
  for (const q of a.pads) { assert.equal(a.pads[q.back].to, q.plate); assert.ok(q.time >= PAD.min && q.time <= PAD.max); }
  assert.equal(a.plates[0].pillars.length, ARENA.center.pillars);
});

test('5v5 başlar: geri sayım, sonra oyun; herkes kendi takımının dış plakasında ve yerde', () => {
  const w = createWorld();
  assert.equal(w.players.length, 10); assert.equal(w.state, 'countdown');
  for (const p of w.players) { assert.ok(w.arena.spawns[p.team].includes(p.plate), 'yanlış plaka'); assert.ok(p.ground); }
  run(w, Math.ceil(ROUND.start * 60) + 2);
  assert.equal(w.state, 'play');
});

test('plakadan yürüyerek çıkan boşluğa düşer ve elenir; doğuş açıkken geri gelir', () => {
  const w = setup(), p = center(w, 0, ARENA.center.r - 0.5, 0);
  run(w, 180, { x: 1, z: 0 });
  assert.ok(p.out, 'düşmedi'); assert.equal(p.stats.falls, 1); assert.ok(p.respawn > 0);
  run(w, Math.ceil(ROUND.respawn * 60) + 5);
  assert.ok(!p.out, 'doğmadı'); assert.ok(w.arena.spawns[0].includes(p.plate));
});

test('dış halka 40. saniyede titrer, düşer ve doğuş kapanır; üstündeki oyuncu plakayla düşer', () => {
  const w = setup(); spread(w);
  const p = w.players[0];
  w.t = ROUND.ring2At - ROUND.tremble - 0.1;
  run(w, 12);
  assert.equal(w.plates[5].phase, 1, 'titremedi');
  assert.ok(w.events.some(e => e.type === 'tremble' && e.ring === 2));
  w.events.length = 0;
  w.t = ROUND.ring2At - 0.05;
  run(w, 6);
  assert.equal(w.plates[5].phase, 2); assert.equal(w.respawnOpen, false);
  run(w, 240);
  assert.ok(p.out, 'plakayla düşmedi'); assert.equal(p.respawn, 0, 'doğuş kapalıyken doğuş süresi verildi');
});

test('disk isabeti hasar vermez, savurur ve havalandırır; savrulan kenara yakınsa düşer', () => {
  const w = setup();
  // Çapraz eksen: merkez plakanın kolonları 0°/90°/180°/270° yönlerinde, 45° boş.
  const p = center(w, 0, -2.1, -2.1), t = center(w, 5, 4.2, 4.2);
  p.yaw = Math.PI / 4; p.pitch = 0; t.yaw = -Math.PI * 3 / 4;
  assert.ok(throwDisc(w, 0));
  assert.equal(p.discs, DISC.max - 1); assert.equal(w.discs.length, 1);
  run(w, 24);
  assert.ok(t.knock > 0, 'savrulmadı'); assert.ok(t.vz > 5 && t.vx > 5, 'disk yönünde itilmedi'); assert.ok(!t.ground);
  assert.equal(p.stats.hits, 1); assert.equal(w.discs.length, 0);
  assert.equal(t.out, false);
  run(w, 200);
  assert.ok(t.out, 'kenardan düşmedi'); assert.equal(p.stats.kills, 1, 'düşürme sayılmadı');
});

test('keskin disk: 1,5 sn basılı tutup bırakınca çıkar, değdiğini anında eler', () => {
  const w = setup();
  const p = center(w, 0, -2.8, -2.8), t = center(w, 5, 0, 0), yaw = Math.PI / 4;
  p.yaw = yaw;
  run(w, Math.ceil(DISC.sharpCharge * 60) + 2, { hold: true, yaw, pitch: 0 });
  assert.equal(w.discs.length, 0, 'bırakmadan attı');
  step(w, 1 / 60, { release: true, yaw, pitch: 0 });
  assert.equal(w.discs[0]?.kind, 'sharp');
  run(w, 30);
  assert.ok(t.out, 'elenmedi'); assert.equal(p.stats.kills, 1);
});

test('kısa sol tık normal disk atar; diskler 1,5 saniyede bir yenilenir; elde en çok 3', () => {
  const w = setup(), p = center(w, 0);
  for (const t of w.players) if (t.id !== 0) t.out = true;
  step(w, 1 / 60, { tap: true, release: true, yaw: 0, pitch: 0 });
  assert.equal(w.discs.length, 1); assert.equal(w.discs[0].kind, 'normal'); assert.equal(p.discs, 2);
  run(w, Math.ceil(DISC.regen * 60) + 2);
  assert.equal(p.discs, 3);
  run(w, 200);
  assert.equal(p.discs, DISC.max);
});

test('levye: bakış konisindeki yakın rakibi uzağa iter, arkadakini itmez', () => {
  const w = setup();
  const p = center(w, 0, 0, 0), front = center(w, 5, 0, 1.8), back = center(w, 6, 0, -1.8);
  p.yaw = 0;
  assert.ok(swing(w, 0));
  assert.ok(front.knock > 0 && front.vz > CROWBAR.knock * 0.9, 'öndeki itilmedi');
  assert.equal(back.knock, 0, 'arkadaki itildi');
  assert.equal(swing(w, 0), false, 'bekleme yok');
});

test('zıplama: yerde kalkar, havada bir kez daha zıplar, üçüncü olmaz', () => {
  const w = setup(), p = center(w, 0);
  assert.ok(jump(w, 0)); assert.ok(!p.ground);
  step(w, 1 / 60);
  assert.ok(jump(w, 0), 'çift zıplama yok'); assert.equal(jump(w, 0), false);
  run(w, 200);
  assert.ok(p.ground); assert.equal(p.plate, 0);
});

test('zıplama plakasında Boşluk hedef plakaya uçurur, basmak yetmez; inince hemen geri dönmez', () => {
  const w = setup(), q = w.arena.pads.find(x => x.plate === 0);
  const p = center(w, 0, q.x, q.z); p.padLock = 0;
  for (const t of w.players) if (t.id !== 0) t.out = true;
  run(w, 10);
  assert.equal(p.flight, 0, 'basınca kendiliğinden fırlattı'); assert.ok(p.ground);
  step(w, 1 / 60, { jump: true });
  assert.ok(p.flight > 0, 'uçmadı'); assert.equal(p.stats.pads, 1);
  run(w, Math.ceil(q.time * 60) + 10);
  assert.equal(p.plate, q.to, 'hedef plakaya inmedi'); assert.ok(p.ground);
  run(w, 30);
  assert.equal(p.plate, q.to, 'geri uçtu');
});

test('diskle vurulan zıplama plakası 5 saniye kapanır', () => {
  const w = setup(), q = w.arena.pads.find(x => x.plate === 0);
  const p = center(w, 0, q.x - Math.sin(q.dir) * 4, q.z - Math.cos(q.dir) * 4);
  p.yaw = q.dir; p.pitch = -0.28;
  for (const t of w.players) if (t.id !== 0) t.out = true;
  assert.ok(throwDisc(w, 0));
  run(w, 30);
  assert.ok(w.pads[q.id].off > PAD.off - 1, 'kapanmadı: ' + w.pads[q.id].off);
  const r = center(w, 1, q.x, q.z); r.padLock = 0; r.out = false;
  step(w, 1 / 60, { players: { 1: { jump: true } } });
  assert.equal(r.flight, 0, 'kapalı plaka fırlattı');
});

test('disk sınırdan ve kolondan seker, ömrü biter', () => {
  const w = setup(), p = center(w, 0, 0, -8);
  for (const t of w.players) if (t.id !== 0) t.out = true;
  p.yaw = 0; p.pitch = 0;
  throwDisc(w, 0);
  run(w, 30);
  assert.ok(w.events.some(e => e.type === 'bounce'), 'kolondan sekmedi');
  const d = w.discs[0];
  assert.ok(d && d.vz < 0, 'geri dönmedi');
  run(w, Math.ceil(DISC.life * 60) + 5);
  assert.equal(w.discs.length, 0);
});

test('güç diski: üçlü üç disk atar, dondurucu 2 saniye dondurur', () => {
  const w = setup(), p = center(w, 0), t = center(w, 5, 4.2, 4.2);
  p.yaw = Math.PI / 4; p.power = 'triple'; p.powerLeft = 1;
  throwDisc(w, 0);
  assert.equal(w.discs.length, 3); assert.equal(p.power, null);
  w.discs.length = 0; p.discs = 3; p.throwCd = 0;
  p.power = 'freeze'; p.powerLeft = PICKUP.shots;
  throwDisc(w, 0);
  assert.equal(w.discs[0].kind, 'freeze'); assert.equal(p.powerLeft, PICKUP.shots - 1);
  run(w, 20);
  assert.ok(t.freeze > FREEZE.time - 0.5, 'donmadı');
});

test('güç diski alınır, sonra sıradaki tür yeniden doğar', () => {
  const w = setup(), spot = w.arena.pickups[1];
  const p = center(w, 0, spot.x, spot.z); p.plate = spot.plate;
  const kind = w.pickups[1].kind;
  step(w, 1 / 60);
  assert.equal(p.power, kind); assert.equal(w.pickups[1].active, false);
  center(w, 0); // uzaklaş: yeniden doğanı hemen almasın
  run(w, Math.ceil(PICKUP.respawn * 60) + 2);
  assert.equal(w.pickups[1].active, true); assert.notEqual(w.pickups[1].kind, kind);
});

test('doğuş kapandıktan sonra bir takımın kimsesi kalmayınca raund biter ve puan yazılır', () => {
  const w = setup(); spread(w);
  w.respawnOpen = false;
  for (const p of w.players) if (p.team === 1) Object.assign(p, { out: true, respawn: 0 });
  step(w, 1 / 60);
  assert.equal(w.state, 'over'); assert.deepEqual(w.wins, [1, 0]); assert.equal(aliveCount(w, 1), 0);
  run(w, Math.ceil(ROUND.between * 60) + 2);
  assert.equal(w.round, 2); assert.equal(w.state, 'countdown');
  assert.ok(w.players.every(p => !p.out));
});

test('doğmayı bekleyen oyuncu sayılır: doğuş kapanınca raund hemen bitmez', () => {
  const w = setup(); spread(w);
  for (const p of w.players) if (p.team === 1) Object.assign(p, { out: true, respawn: 2 });
  w.respawnOpen = false;
  step(w, 1 / 60);
  assert.equal(w.state, 'play');
});

test('merkez plaka 100. saniyeden sonra küçülür, 145. saniyede düşer', () => {
  const w = setup(); spread(w);
  w.t = ROUND.shrinkAt + ROUND.shrinkTime / 2;
  run(w, 3);
  assert.ok(w.plates[0].r < ARENA.center.r - 2 && w.plates[0].r > ROUND.minR);
  assert.equal(groundAt(w, ARENA.center.r - 0.5, 0), null, 'küçülen plakanın dışı zemin sayıldı');
  w.t = ROUND.endAt - 0.02;
  run(w, 3);
  assert.equal(w.plates[0].phase, 2);
});

test('botlarla tam maç biter: bir takım 3 raund alır, koordinatlar geçerli, botlar atar ve düşürür', () => {
  const w = createWorld(7);
  let throws = 0;
  for (let i = 0; i < 60 * 60 * 25 && w.winner === null; i++) {
    step(w, 1 / 60);
    for (const e of w.events) if (e.type === 'throw') throws++;
    w.events.length = 0;
    for (const p of w.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }
  assert.notEqual(w.winner, null, 'maç bitmedi');
  assert.equal(w.wins[w.winner], ROUND.wins);
  assert.ok(throws > 50, 'botlar disk atmadı: ' + throws);
  assert.ok(w.players.slice(1).some(p => p.stats.kills > 0), 'hiçbir bot düşürmedi');
});
