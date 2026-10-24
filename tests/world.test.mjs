import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, DISC, FREEZE, LIFE, MATCH, MOVE, PAD, PICKUP, ROUND, botParams } from '../src/config.js';
import { aliveCount, createWorld, groundAt, jump, step, throwDisc } from '../src/world.js';

/** Raund oynanır durumda, herkes yerinde; botlar düşünmesin diye uzun think. */
const setup = () => {
  const w = createWorld();
  w.state = 'play'; w.t = 0;
  for (const p of w.players) { p.think = 999; p.human = true; p.shield = 0; }
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
  assert.equal(w.spawns[0].length, 4); assert.equal(w.spawns[1].length, 4);
  assert.equal(a.pads.length, 40);
  for (const q of a.pads) { assert.equal(a.pads[q.back].to, q.plate); assert.ok(q.time >= PAD.min && q.time <= PAD.max); }
  assert.equal(a.plates[0].pillars.length, ARENA.center.pillars);
});

test('5v5 başlar: geri sayım, sonra oyun; herkes kendi takımının dış plakasında ve yerde; doğuş açık', () => {
  const w = createWorld();
  assert.equal(w.players.length, 10); assert.equal(w.state, 'countdown'); assert.equal(w.teams, 2); assert.equal(w.respawnOpen, true);
  for (const p of w.players) { assert.ok(w.spawns[p.team].includes(p.plate), 'yanlış plaka'); assert.ok(p.ground); }
  run(w, Math.ceil(ROUND.start * 60) + 2);
  assert.equal(w.state, 'play');
});

test('kipler: herkes tek 5 ayrı takım, 2v2 dört oyuncu; doğuş plakaları takımlara paylaştırılır', () => {
  const ffa = createWorld(1, { teamSize: 1 });
  assert.equal(ffa.players.length, 5); assert.equal(ffa.teams, 5); assert.deepEqual(ffa.players.map(p => p.team), [0, 1, 2, 3, 4]);
  assert.equal(ffa.score.length, 5); assert.deepEqual(ffa.spawns.map(s => s.length), [2, 2, 1, 2, 1]);
  for (const p of ffa.players) assert.ok(ffa.spawns[p.team].includes(p.plate));
  const duo = createWorld(1, { teamSize: 2 });
  assert.equal(duo.players.length, 4); assert.deepEqual(duo.players.map(p => p.team), [0, 0, 1, 1]);
  assert.equal(new Set(duo.players.map(p => p.plate)).size, 4, 'ikişer kişi ayrı plakalarda doğmalı');
});

test('plakadan yürüyerek çıkan boşluğa düşer ve elenir; doğuş açıkken geri gelir', () => {
  const w = setup(), p = center(w, 0, ARENA.center.r - 0.5, 0);
  run(w, 180, { x: 1, z: 0 });
  assert.ok(p.out, 'düşmedi'); assert.equal(p.stats.falls, 1); assert.ok(p.respawn > 0);
  run(w, Math.ceil(ROUND.respawn * 60) + 5);
  assert.ok(!p.out, 'doğmadı'); assert.ok(w.spawns[0].includes(p.plate));
});

test('dış halka 40. saniyede titrer ve düşer; üstündeki oyuncu plakayla düşer ve iç halkada yeniden doğar', () => {
  const w = setup(); spread(w);
  const p = w.players[0];
  w.t = ROUND.ring2At - ROUND.tremble - 0.1;
  run(w, 12);
  assert.equal(w.plates[5].phase, 1, 'titremedi');
  assert.ok(w.events.some(e => e.type === 'tremble' && e.ring === 2));
  w.events.length = 0;
  w.t = ROUND.ring2At - 0.05;
  run(w, 6);
  assert.equal(w.plates[5].phase, 2);
  run(w, 240);
  assert.ok(p.out, 'plakayla düşmedi'); assert.ok(p.respawn > 0, 'düşme hakkı sınırsız: doğuş süresi verilmeli');
  run(w, Math.ceil(ROUND.respawn * 60) + 5);
  assert.ok(!p.out, 'geri doğmadı'); assert.equal(w.arena.plates[p.plate].ring, 1, 'dış halka düşünce iç halkada doğmalı');
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
  assert.ok(t.out, 'kenardan düşmedi'); assert.equal(p.stats.kills, 1, 'düşürme sayılmadı'); assert.deepEqual(w.score, [1, 0], 'takım skoru yazılmadı');
});

test('ağır disk: 1,5 sn basılı tutup bırakınca çıkar; elemez, normal diskten çok daha sert savurur', () => {
  const w = setup();
  const p = center(w, 0, -2.8, -2.8), t = center(w, 5, 0, 0), yaw = Math.PI / 4;
  p.yaw = yaw;
  run(w, Math.ceil(DISC.heavyCharge * 60) + 2, { hold: true, yaw, pitch: 0 });
  assert.equal(w.discs.length, 0, 'bırakmadan attı');
  step(w, 1 / 60, { release: true, yaw, pitch: 0 });
  assert.equal(w.discs[0]?.kind, 'heavy');
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) { step(w, 1 / 60); if (t.knock > 0) hit = true; }
  assert.ok(hit, 'ağır disk değmedi');
  assert.equal(t.out, false, 'disk eledi: eleme yalnız düşmeyle olmalı');
  const heavySpeed = Math.hypot(t.vx, t.vz);
  assert.ok(heavySpeed > DISC.knock * 1.5, `ağır disk sert savurmadı: ${heavySpeed.toFixed(1)}`);
  assert.ok(t.vy > DISC.lift, 'ağır disk daha çok havalandırmalı');
});

test('kısa sol tık normal disk atar; diskler 1,5 saniyede bir yenilenir; elde en çok 5', () => {
  const w = setup(), p = center(w, 0);
  for (const t of w.players) if (t.id !== 0) Object.assign(t, { out: true, respawn: 999 }); // kenarda bekler, sayılır
  step(w, 1 / 60, { tap: true, release: true, yaw: 0, pitch: 0 });
  assert.equal(w.discs.length, 1); assert.equal(w.discs[0].kind, 'normal'); assert.equal(p.discs, DISC.max - 1);
  run(w, Math.ceil(DISC.regen * 60) + 2);
  assert.equal(p.discs, DISC.max);
  run(w, 200);
  assert.equal(p.discs, DISC.max);
});

test('zıplama: yerde kalkar, havada bir kez daha zıplar, üçüncü olmaz', () => {
  const w = setup(), p = center(w, 0);
  assert.ok(jump(w, 0)); assert.ok(!p.ground);
  step(w, 1 / 60);
  assert.ok(jump(w, 0), 'çift zıplama yok'); assert.equal(jump(w, 0), false);
  run(w, 200);
  assert.ok(p.ground); assert.equal(p.plate, 0);
});

test('rampaya basan hedef plakaya uçar ve oraya iner; inince hemen geri dönmez', () => {
  const w = setup(), q = w.arena.pads.find(x => x.plate === 0);
  const p = center(w, 0, q.x, q.z); p.padLock = 0;
  for (const t of w.players) if (t.id !== 0) Object.assign(t, { out: true, respawn: 999 }); // kenarda bekler, sayılır
  step(w, 1 / 60);
  assert.ok(p.flight > 0, 'uçmadı'); assert.equal(p.stats.pads, 1);
  run(w, Math.ceil(q.time * 60) + 10);
  assert.equal(p.plate, q.to, 'hedef plakaya inmedi'); assert.ok(p.ground);
  run(w, 30);
  assert.equal(p.plate, q.to, 'geri uçtu');
});

test('rampa hiç kapanmaz: disk vursa da, biri az önce uçmuş olsa da basan uçar', () => {
  const w = setup(), q = w.arena.pads.find(x => x.plate === 0);
  const p = center(w, 0, q.x - Math.sin(q.dir) * 4, q.z - Math.cos(q.dir) * 4);
  p.yaw = q.dir; p.pitch = -0.28;
  for (const t of w.players) if (t.id !== 0) Object.assign(t, { out: true, respawn: 999 }); // kenarda bekler, sayılır
  assert.ok(throwDisc(w, 0));
  run(w, 30);
  assert.equal(w.pads[q.id].off, 0, 'disk rampayı kapattı');
  const r = center(w, 1, q.x, q.z); r.out = false;
  step(w, 1 / 60);
  assert.ok(r.flight > 0, 'rampa fırlatmadı');
  const s = center(w, 2, q.x, q.z); s.out = false;
  step(w, 1 / 60);
  assert.ok(s.flight > 0, 'arka arkaya ikinci basan uçmadı');
});

test('Shift hızlı koşturur', () => {
  const w = setup(), p = center(w, 0);
  for (const t of w.players) if (t.id !== 0) Object.assign(t, { out: true, respawn: 999 }); // kenarda bekler, sayılır
  run(w, 40, { x: 1, z: 0, sprint: true });
  assert.ok(p.vx > MOVE.speed * 1.3, 'hızlanmadı: ' + p.vx.toFixed(2));
  run(w, 40, { x: -1, z: 0 });
  assert.ok(Math.abs(p.vx) < MOVE.speed + 0.1 && !p.sprint);
});

test('disk görünmez sınırdan seker, ömrü biter; plakalarda kolon yok', () => {
  const w = setup(), p = center(w, 0, 0, 8);
  for (const t of w.players) if (t.id !== 0) Object.assign(t, { out: true, respawn: 999 }); // kenarda bekler, sayılır
  assert.ok(w.arena.plates.every(pl => pl.pillars.length === 0), 'kolon var');
  p.yaw = 0; p.pitch = 0;
  throwDisc(w, 0);
  run(w, Math.ceil((ARENA.bound - 8) / DISC.speed * 60) + 10);
  assert.ok(w.events.some(e => e.type === 'bounce'), 'sınırdan sekmedi');
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

test('iç halka düşünce son plaka: doğuş kapanır, düşen elenir; rakip takımın kimsesi kalmayınca ayakta kalan kazanır', () => {
  const w = setup(); spread(w);
  w.t = ROUND.ring1At - 0.05;
  run(w, 6);
  assert.equal(w.respawnOpen, false, 'iç halka düşünce doğuş kapanmalı');
  assert.ok(w.events.some(e => e.type === 'collapse' && e.ring === 1));
  // Doğuş kapalıyken düşen doğuş süresi almaz.
  const t = w.players[5]; Object.assign(t, { x: 0, y: -31, z: 0, plate: -1, ground: false });
  step(w, 1 / 60);
  assert.ok(t.out && t.respawn === 0, 'son plakada elenen geri gelmemeli');
  assert.equal(w.state, 'play', 'turuncunun başka oyuncusu varken maç bitmemeli');
  for (const p of w.players) if (p.team === 1) Object.assign(p, { out: true, respawn: 0 });
  step(w, 1 / 60);
  assert.equal(w.state, 'over'); assert.equal(w.winner, 0);
  assert.ok(w.events.some(e => e.type === 'end' && e.team === 0 && e.why === 'last'));
});

test('doğmayı bekleyen oyuncu sayılır: doğuş açıkken herkes düşse de maç bitmez', () => {
  const w = setup(); spread(w);
  for (const p of w.players) if (p.team === 1) Object.assign(p, { out: true, respawn: 2 });
  step(w, 1 / 60);
  assert.equal(w.state, 'play');
  w.respawnOpen = false;
  step(w, 1 / 60);
  assert.equal(w.state, 'play', 'doğmayı bekleyen sayılmalı');
});

test('süre bitince maç biter: son plakada ayakta oyuncusu çok olan, eşitse en çok düşüren kazanır, o da eşitse berabere', () => {
  const w = setup(); spread(w); w.respawnOpen = false;
  Object.assign(w.players[5], { out: true, respawn: 0 });
  w.t = ROUND.endAt - 0.02;
  run(w, 3);
  assert.equal(w.state, 'over'); assert.equal(w.winner, 0, 'ayakta 5-4: mavi kazanmalı');
  assert.ok(w.events.some(e => e.type === 'end' && e.why === 'time'));
  const tie = setup(); spread(tie); tie.respawnOpen = false; tie.score = [1, 3];
  tie.t = ROUND.endAt - 0.02; run(tie, 3);
  assert.equal(tie.winner, 1, 'ayakta eşit: en çok düşüren kazanmalı');
  const even = setup(); spread(even); even.respawnOpen = false;
  even.t = ROUND.endAt - 0.02; run(even, 3);
  assert.equal(even.winner, -1, 'her şey eşit: berabere');
  const ffa = createWorld(1, { teamSize: 1 }); ffa.state = 'play'; ffa.respawnOpen = false;
  for (const p of ffa.players) if (p.id !== 3) Object.assign(p, { out: true, respawn: 0 });
  step(ffa, 1 / 60);
  assert.equal(ffa.winner, 3, 'herkes tek: kalan son oyuncu kazanır');
});

test('merkez plaka 100. saniyeden sonra küçülür ama itiş sürsün diye 5,5 yarıçapta durur; hiç düşmez', () => {
  const w = setup(); spread(w);
  w.t = ROUND.shrinkAt + ROUND.shrinkTime / 2;
  run(w, 3);
  assert.ok(w.plates[0].r < ARENA.center.r - 2 && w.plates[0].r > ROUND.minR);
  assert.equal(groundAt(w, ARENA.center.r - 0.5, 0), null, 'küçülen plakanın dışı zemin sayıldı');
  w.t = ROUND.shrinkAt + ROUND.shrinkTime + 1;
  run(w, 3);
  assert.equal(w.plates[0].r, ROUND.minR, "daralma minR'de durmalı");
  assert.ok(ROUND.minR >= 5, 'son evrede itişecek alan kalmalı: minR en az 5');
  assert.ok(groundAt(w, ROUND.minR - 0.3, 0), 'daralmış merkez hâlâ zemin olmalı');
});

test('süre bitince merkez plaka DÜŞMEZ: maç biter ve o an son plakada kalanlar kazanır', () => {
  const w = setup(); spread(w); w.respawnOpen = false;
  // Turuncunun iki oyuncusu merkezde, mavinin biri; kalanlar elenmiş.
  for (const p of w.players) Object.assign(p, { out: true, respawn: 0 });
  for (const id of [0, 5, 6]) { const p = center(w, id, id - 5, 0); p.out = false; }
  w.t = ROUND.endAt - 0.02;
  run(w, 3);
  assert.equal(w.state, 'over'); assert.equal(w.over.why, 'time');
  assert.ok(w.plates[0].phase < 2, 'merkez plaka süre bitince düşmemeli');
  assert.ok(w.plates[0].y === 0, 'merkez plaka yerinde kalmalı');
  assert.ok(!w.events.some(e => e.type === 'collapse' && e.ring === 0), 'merkez için çöküş olayı çıkmamalı');
  assert.equal(w.winner, 1, 'merkezde 2 turuncu 1 mavi: turuncu kazanmalı');
  for (const id of [0, 5, 6]) assert.equal(w.players[id].out, false, 'son plakadakiler düşmemeli');
});

test('süre bitince son plakada eşit sayıdaysa en çok düşüren kazanır; herkes tek kipinde merkezde kalan tek kişi', () => {
  const tie = setup(); spread(tie); tie.respawnOpen = false;
  for (const p of tie.players) Object.assign(p, { out: true, respawn: 0 });
  for (const id of [0, 5]) { const p = center(tie, id, id - 2.5, 0); p.out = false; }
  tie.score = [2, 7];
  tie.t = ROUND.endAt - 0.02; run(tie, 3);
  assert.equal(tie.winner, 1, 'merkezde 1-1: düşürme puanı çok olan kazanmalı');

  // Herkes tek: merkezde iki kişi kaldıysa (yoksa 'rakip kalmadı' kuralı zaten hemen bitirir) en çok düşüren kazanır.
  const ffa = createWorld(1, { teamSize: 1 });
  ffa.state = 'play'; ffa.respawnOpen = false;
  for (const p of ffa.players) { p.think = 999; p.human = true; Object.assign(p, { out: true, respawn: 0 }); }
  for (const id of [2, 3]) center(ffa, id, id - 2.5, 0).out = false;
  ffa.score = [0, 0, 5, 1, 0];
  ffa.t = ROUND.endAt - 0.02; run(ffa, 3);
  assert.equal(ffa.over.why, 'time', 'süre bitince bitmeli');
  assert.equal(ffa.winner, 2, 'herkes tek: merkezde kalanlar arasında en çok düşüren kazanır');
});

test('son evrede botlar merkeze gidip orada kalır ve rakibi diskle iter', () => {
  const w = createWorld(1, { teamSize: 2 });
  w.state = 'play'; w.t = ROUND.shrinkAt + 28; w.respawnOpen = false;
  // Yalnız merkez ayakta; botlar bir iç halka plakasında.
  for (let i = 1; i < w.plates.length; i++) w.plates[i].phase = i === 1 ? 0 : 2;
  const inner = w.arena.plates[1];
  w.players.forEach((p, i) => Object.assign(p, { x: inner.x + i * 0.9, y: 0, z: inner.z, vx: 0, vy: 0, vz: 0, ground: true, plate: 1, out: false, respawn: 0, padLock: 0 }));
  run(w, 60 * 6);
  assert.ok(w.players.some(p => !p.out && p.plate === 0), 'botlar son evrede merkeze gitmedi');

  // Son evre düellosu: levye yok, itiş yalnız diskle.
  const duel = createWorld(1, { teamSize: 2 });
  duel.state = 'play'; duel.t = ROUND.shrinkAt + 28; duel.respawnOpen = false;
  for (let i = 1; i < duel.plates.length; i++) duel.plates[i].phase = 2;
  duel.players.forEach((p, i) => { const a = i / duel.players.length * Math.PI * 2; Object.assign(p, { x: Math.sin(a) * 3, y: 0, z: Math.cos(a) * 3, vx: 0, vy: 0, vz: 0, ground: true, plate: 0, out: false, respawn: 0 }); });
  let hits = 0;
  for (let i = 0; i < 60 * 15 && duel.winner === null; i++) {
    step(duel, 1 / 60);
    for (const e of duel.events) if (e.type === 'hit') hits++;
    duel.events.length = 0;
  }
  assert.ok(hits > 0, 'son evrede botlar diskle vurmadı');
  assert.ok(duel.winner !== null, 'itiş kimseyi düşürmedi');
});

test('botlarla tam maç biter: son plakada kalan kazanır (en geç süre bitince), koordinatlar geçerli, botlar atar ve düşürür', () => {
  for (const teamSize of [5, 1]) {
    const w = createWorld(7, { teamSize });
    let throws = 0;
    for (let i = 0; i < 60 * (ROUND.endAt + 30) && w.winner === null; i++) {
      step(w, 1 / 60);
      for (const e of w.events) if (e.type === 'throw') throws++;
      w.events.length = 0;
      for (const p of w.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    }
    assert.notEqual(w.winner, null, 'maç bitmedi'); assert.ok(w.t <= ROUND.endAt + 0.1, 'maç en geç süre bitince bitmeli');
    assert.ok(w.plates[0].phase < 2, 'merkez plaka hiç düşmemeli');
    assert.equal(w.respawnOpen, false, 'son plaka evresine gelinmeli');
    if (w.winner >= 0) assert.equal(aliveCount(w, w.winner), Math.max(...w.players.map(p => aliveCount(w, p.team))), 'kazanan ayakta oyuncusu en çok olan olmalı');
    assert.ok(throws > 50, 'botlar disk atmadı: ' + throws);
    assert.ok(w.players.slice(1).some(p => p.stats.kills > 0), 'hiçbir bot düşürmedi');
    assert.equal(w.score.reduce((a, b) => a + b, 0), w.players.reduce((a, p) => a + p.stats.kills, 0), 'takım skoru düşürmelerin toplamı olmalı');
  }
});

test('doğuş koruması: yeni doğan 2 sn savrulmaz, botlar onu hedef almaz; ilk atış korumayı bitirir', () => {
  const w = setup();
  const p = center(w, 0, -3, 0), t = center(w, 5, 3, 0);
  t.shield = LIFE.shield; t.vx = 0;
  p.yaw = Math.PI / 2; // +x yönü: t'ye doğru
  // Girdi yalnız p'ye (players biçimi): aynı girdi t'ye de gitse t atar ve kendi korumasını bozardı.
  step(w, 1 / 60, { players: { 0: { tap: true, release: true, yaw: Math.PI / 2, pitch: 0 } } });
  assert.equal(p.shield, 0, 'atan korumasını kaybetmeli'); assert.ok(t.shield > 0, 't korumasını korumalı');
  run(w, 40);
  assert.equal(t.knock, 0, 'korumalı oyuncu savruldu'); assert.ok(Math.abs(t.vx) < 0.01);
  run(w, Math.ceil(LIFE.shield * 60) + 2);
  assert.equal(t.shield, 0);
  // Koruma bitince aynı atış savurur.
  p.discs = DISC.max; p.throwCd = 0;
  step(w, 1 / 60, { players: { 0: { tap: true, release: true, yaw: Math.PI / 2, pitch: 0 } } });
  run(w, 40);
  assert.ok(t.knock > 0 || t.vx > 1, 'koruma bitince disk işlemedi');
});

test('botlar doğar doğmaz atmaz (spawnWait), sonra atar', () => {
  const w = createWorld(3, { difficulty: 'hard' });
  w.state = 'play'; w.t = 0;
  const bot = w.players[5], human = w.players[0];
  center(w, 5, 0, 0); center(w, 0, 6, 0); human.human = true; human.think = 999; human.shield = 0;
  for (const q of w.players) if (q.id !== 0 && q.id !== 5) q.out = true;
  Object.assign(bot, { shield: 0, bot: null, think: 0 });
  let early = 0;
  for (let i = 0; i < Math.floor((w.bot.spawnWait - 0.2) * 60); i++) { step(w, 1 / 60); for (const e of w.events) if (e.type === 'throw' && e.id === 5) early++; w.events.length = 0; }
  assert.equal(early, 0, 'bot doğar doğmaz attı');
  let later = 0;
  for (let i = 0; i < 60 * 4; i++) { step(w, 1 / 60); for (const e of w.events) if (e.type === 'throw' && e.id === 5) later++; w.events.length = 0; if (human.out) center(w, 0, 6, 0), Object.assign(human, { out: false, respawn: 0, shield: 0 }); }
  assert.ok(later > 0, 'bot bekleme bitince atmadı');
});

test('ısınma: dış halka düşene kadar düşmek hak götürmez, kendi düşüşü rakibe puan yazmaz', () => {
  const w = setup(), p = center(w, 0, ARENA.center.r - 0.5, 0);
  run(w, 180, { x: 1, z: 0 });
  assert.ok(p.out && p.respawn > 0, 'düşmedi');
  assert.equal(p.lives, LIFE.lives, 'ısınmada hak gitti');
  assert.equal(w.score.reduce((a, b) => a + b, 0), 0, 'kendi düşüşü puan yazdı');
  const fall = w.events.filter(e => e.type === 'fall' && e.id === 0).at(-1);
  assert.ok(!fall || fall.free, 'düşüş olayı ısınmayı bildirmeli');
});

test('düşme hakkı 5: her düşüş bir hak götürür, beşincide doğuş açıkken de elenir; hakkı biten sayılmaz', () => {
  const w = setup(); w.t = ROUND.ring2At + 1;
  const p = center(w, 0, ARENA.center.r - 0.5, 0);
  assert.equal(p.lives, LIFE.lives);
  p.lives = 2;
  run(w, 180, { x: 1, z: 0 });
  assert.ok(p.out && p.respawn > 0 && p.lives === 1, 'dördüncü düşüşte geri gelmeli');
  run(w, Math.ceil(ROUND.respawn * 60) + 5);
  assert.ok(!p.out);
  center(w, 0, ARENA.center.r - 0.5, 0); p.shield = 0;
  run(w, 180, { x: 1, z: 0 });
  assert.ok(p.out && p.respawn === 0 && p.lives === 0, 'beşinci düşüşte elenmeli');
  assert.equal(w.events.filter(e => e.type === 'fall' && e.id === 0).at(-1)?.lives, 0);
  assert.equal(aliveCount(w, 0), 4, 'hakkı biten sayılmamalı');
  // Doğuş açıkken bile bir takımın herkesinin hakkı biterse maç biter.
  for (const t of w.players) if (t.team === 0 && t.id !== 0) Object.assign(t, { out: true, respawn: 0, lives: 0 });
  step(w, 1 / 60);
  assert.equal(w.winner, 1);
});

test('zorluk: kolay botlar zora göre daha seyrek atar ve daha sapmalı nişan alır; ayarlar dünyaya işlenir', () => {
  assert.ok(botParams('easy').fireEvery > botParams('normal').fireEvery && botParams('normal').fireEvery > botParams('hard').fireEvery);
  assert.ok(botParams('easy').aimError > botParams('hard').aimError && botParams('easy').spawnWait > botParams('hard').spawnWait);
  assert.equal(createWorld(1, { difficulty: 'saçma' }).difficulty, MATCH.difficulty, 'geçersiz zorluk varsayılana dönmeli');
  const throwsIn = difficulty => {
    const w = createWorld(11, { teamSize: 2, difficulty });
    w.state = 'play'; w.t = 0;
    for (const p of w.players) { p.human = false; p.shield = 0; p.bot = null; }
    let n = 0;
    for (let i = 0; i < 60 * 30; i++) { step(w, 1 / 60); for (const e of w.events) if (e.type === 'throw') n++; w.events.length = 0; }
    return n;
  };
  const easy = throwsIn('easy'), hard = throwsIn('hard');
  assert.ok(easy < hard, `kolay botlar daha az atmalı: kolay ${easy}, zor ${hard}`);
});
