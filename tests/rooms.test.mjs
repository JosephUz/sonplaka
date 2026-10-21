import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRooms } from '../server/rooms.mjs';
import { S2C, normalizeCode } from '../src/net/protocol.js';

// Sahte soket: sunucunun yolladıklarını biriktirir, istemci mesajı `say` ile gider.
function fakeWs() {
  const handlers = {}, got = [];
  return {
    readyState: 1, got,
    on(ev, fn) { handlers[ev] = fn; },
    send(data) { got.push(JSON.parse(data)); },
    say(obj) { handlers.message(Buffer.from(JSON.stringify(obj))); },
    close() { this.readyState = 3; handlers.close(); },
    last(t) { return [...got].reverse().find(m => m.t === t); },
  };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function setup() {
  const rooms = createRooms({ log: () => {} });
  const join = nick => { const ws = fakeWs(); rooms.attach(ws); ws.say({ t: 'hello', nick }); return ws; };
  return { rooms, join };
}

test('oda kurulur, katılan karşı takıma oturur, istediği boş koltuğa geçer', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create' });
  const code = a.last(S2C.LOBBY).code;
  b.say({ t: 'join', code });
  let lobby = b.last(S2C.LOBBY);
  assert.equal(lobby.seats[0].nick, 'Ali'); assert.equal(lobby.seats[5].nick, 'Ayşe');
  b.say({ t: 'seat', slot: 3 });
  lobby = a.last(S2C.LOBBY);
  assert.equal(lobby.seats[3].nick, 'Ayşe'); assert.equal(lobby.seats[5], null);
  b.say({ t: 'seat', slot: 0 });
  assert.match(b.last(S2C.ERROR).msg, /dolu/);
  rooms.close();
});

test('maç başlar: herkes koltuğunu öğrenir, girdisi kendi oyuncusunu döndürür ve yürütür, durum paketi gelir', async () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create' });
  b.say({ t: 'join', code: a.last(S2C.LOBBY).code });
  b.say({ t: 'start' });
  assert.equal(b.last(S2C.START), undefined, 'yalnız kuran başlatır');
  a.say({ t: 'start' });
  assert.equal(a.last(S2C.START).you, 0); assert.equal(b.last(S2C.START).you, 5);
  const room = [...rooms.rooms.values()][0], w = room.world, p = w.players[0];
  w.state = 'play'; w.t = 0;
  Object.assign(p, { x: 0, y: 0, z: 0, plate: 0, ground: true, padLock: 5 });
  const x0 = p.x;
  for (let i = 0; i < 20; i++) { a.say({ t: 'in', mv: [1, 0], yaw: 1.2, pitch: 0.3, hold: false, e: '' }); await wait(16); }
  assert.ok(p.x > x0 + 0.8, 'Ali yürümedi: ' + p.x);
  assert.ok(Math.abs(p.yaw - 1.2) < 1e-6 && Math.abs(p.pitch - 0.3) < 1e-6, 'bakış gelmedi');
  a.say({ t: 'in', mv: [0, 0], yaw: 0, pitch: 0, hold: false, e: 'tr' });
  await wait(40);
  assert.ok(w.discs.length > 0 || p.discs < 3, 'disk atılmadı');
  const snap = a.last(S2C.SNAP);
  assert.ok(snap && snap.p.length === 10 && snap.h[5] === 1 && snap.pl.length === 13, 'durum paketi eksik');
  rooms.close();
});

test('kopan oyuncunun koltuğu tutulur, o sürede bot oynar; token ile geri döner', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create' });
  b.say({ t: 'join', code: a.last(S2C.LOBBY).code });
  a.say({ t: 'start' });
  const room = [...rooms.rooms.values()][0], token = b.last(S2C.WELCOME).token;
  b.close();
  assert.equal(room.world.players[5].human, false);
  const b2 = fakeWs(); rooms.attach(b2); b2.say({ t: 'hello', nick: 'Ayşe', token });
  assert.equal(b2.last(S2C.START).you, 5);
  assert.equal(room.world.players[5].human, true);
  rooms.close();
});

test('maç bitince END gider ve oda lobiye döner', async () => {
  const { rooms, join } = setup();
  const a = join('Ali');
  a.say({ t: 'create' }); a.say({ t: 'start' });
  const room = [...rooms.rooms.values()][0], w = room.world;
  w.score = [2, 0]; w.state = 'play'; w.t = 90; w.respawnOpen = false;
  for (const p of w.players) if (p.team === 1) Object.assign(p, { out: true, respawn: 0 });
  await wait(60);
  const end = a.last(S2C.END);
  assert.ok(end, 'END gelmedi'); assert.equal(end.winner, 0); assert.deepEqual(end.score, [2, 0]);
  assert.equal(room.state, 'lobby');
  rooms.close();
});

test('kuran kipi değiştirir: koltuklar yeniden dizilir; herkes tek beş koltuk; maç o kiple başlar', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create', teamSize: 3, difficulty: 'easy' });
  let lobby = a.last(S2C.LOBBY);
  assert.equal(lobby.settings.teamSize, 3); assert.equal(lobby.seats.length, 6); assert.equal(lobby.settings.difficulty, 'easy');
  b.say({ t: 'join', code: lobby.code });
  lobby = b.last(S2C.LOBBY);
  assert.equal(lobby.seats[3].nick, 'Ayşe', 'katılan karşı takımın ilk koltuğuna oturmalı');
  b.say({ t: 'settings', teamSize: 1 });
  assert.equal(a.last(S2C.LOBBY).settings.teamSize, 3, 'yalnız kuran kipi değiştirir');
  a.say({ t: 'settings', teamSize: 1 });
  lobby = b.last(S2C.LOBBY);
  assert.equal(lobby.settings.teamSize, 1); assert.equal(lobby.seats.length, 5);
  assert.equal(lobby.settings.difficulty, 'easy', 'kip değişince zorluk korunmalı');
  assert.equal(lobby.seats[0].nick, 'Ali'); assert.equal(lobby.seats[1].nick, 'Ayşe');
  a.say({ t: 'settings', difficulty: 'hard' });
  lobby = b.last(S2C.LOBBY);
  assert.equal(lobby.settings.difficulty, 'hard'); assert.equal(lobby.seats.length, 5, 'yalnız zorluk değişince koltuklar bozulmamalı');
  a.say({ t: 'start' });
  assert.equal(a.last(S2C.START).teamSize, 1); assert.equal(a.last(S2C.START).difficulty, 'hard'); assert.equal(b.last(S2C.START).you, 1);
  const w = [...rooms.rooms.values()][0].world;
  assert.equal(w.players.length, 5); assert.equal(w.teams, 5); assert.equal(w.difficulty, 'hard');
  assert.equal(a.last(S2C.SNAP)?.p.length ?? 5, 5);
  rooms.close();
});

test('bağlı kimse kalmayınca oda kapanır', async () => {
  const rooms = createRooms({ log: () => {}, presence: () => 0 });
  const a = fakeWs(); rooms.attach(a); a.say({ t: 'hello', nick: 'Ali' });
  a.say({ t: 'create' }); a.say({ t: 'start' });
  assert.equal(rooms.rooms.size, 1);
  a.close();
  await wait(40);
  assert.equal(rooms.rooms.size, 0);
  rooms.close();
});

test('oda herkese açık kurulur; kuran lobide özele çevirir: listeden düşer, kodla yine girilir', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe'), c = join('Can');
  a.say({ t: 'create', teamSize: 3 });
  b.say({ t: 'create', teamSize: 2 });
  assert.equal(a.last(S2C.LOBBY).private, false); assert.equal(a.last(S2C.LOBBY).settings.private, false);
  c.say({ t: 'list' });
  assert.equal(c.last(S2C.ROOMS).rooms.length, 2);
  assert.deepEqual(c.last(S2C.ROOMS).rooms.find(r => r.host === 'Ali'),
    { code: a.last(S2C.LOBBY).code, host: 'Ali', teamSize: 3, difficulty: 'normal', humans: 1, seats: 6, state: 'lobby', full: false });
  b.say({ t: 'settings', private: true });
  assert.equal(b.last(S2C.LOBBY).private, true); assert.equal(b.last(S2C.LOBBY).settings.private, true);
  assert.equal(b.last(S2C.LOBBY).settings.teamSize, 2, 'yalnız görünürlük değişince kip korunmalı');
  c.say({ t: 'list' });
  assert.deepEqual(c.last(S2C.ROOMS).rooms.map(r => r.host), ['Ali'], 'özel oda listede çıkmamalı');
  c.say({ t: 'quick', teamSize: 2 });
  assert.equal(c.last(S2C.LOBBY).code, a.last(S2C.LOBBY).code, 'hızlı katıl özel odaya koymamalı');
  const d = join('Deniz');
  d.say({ t: 'join', code: b.last(S2C.LOBBY).code });
  assert.equal(d.last(S2C.LOBBY).seats[2].nick, 'Deniz', 'özel odaya kodla girilmeli');
  d.say({ t: 'settings', private: false });
  assert.equal(b.last(S2C.LOBBY).private, true, 'yalnız kuran değiştirir');
  b.say({ t: 'settings', private: false });
  assert.equal(d.last(S2C.LOBBY).private, false);
  rooms.close();
});

test('oda kodu tiresiz ve küçük harfle de bulunur', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe'), c = join('Can');
  a.say({ t: 'create' });
  const code = a.last(S2C.LOBBY).code;
  b.say({ t: 'join', code: code.replace('-', '').toLowerCase() });
  assert.equal(b.last(S2C.LOBBY)?.code, code);
  c.say({ t: 'join', code: ' ' + code.toLowerCase() + ' ' });
  assert.equal(c.last(S2C.LOBBY)?.code, code);
  const d = join('Deniz'); d.say({ t: 'join', code: 'ZZZZ9' });
  assert.equal(d.last(S2C.ERROR).msg, 'Böyle bir oda yok');
  assert.equal(normalizeCode('kprt4'), 'KPRT-4'); assert.equal(normalizeCode('KPRT-4'), 'KPRT-4'); assert.equal(normalizeCode('kpr'), 'KPR');
  rooms.close();
});

test('kuran çıkarsa kuranlık sıradaki insana geçer; maçta koparsa bağlı insana', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe'), c = join('Can');
  a.say({ t: 'create' });
  const code = a.last(S2C.LOBBY).code;
  b.say({ t: 'join', code }); c.say({ t: 'join', code });
  // Koltuk sırası: Ali 0, Can 1 (Ayşe karşı takımın ilk koltuğu 5'te): sıradaki insan Can.
  assert.equal(c.last(S2C.LOBBY).seats[1].nick, 'Can');
  a.say({ t: 'leave' });
  assert.equal(b.last(S2C.LOBBY).hostId, c.last(S2C.WELCOME).id);
  c.say({ t: 'start' });
  c.close();
  assert.equal(b.last(S2C.LOBBY).hostId, b.last(S2C.WELCOME).id, 'kopan kuranın yerine bağlı insan kuran olmalı');
  rooms.close();
});

test('hızlı katıl: önce lobideki, sonra insanı çok olan oda; eşitlikte aynı kip', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe'), c = join('Can'), d = join('Deniz');
  a.say({ t: 'quick', teamSize: 2 });
  const code = a.last(S2C.LOBBY).code;
  assert.equal(rooms.rooms.size, 1); assert.equal(a.last(S2C.LOBBY).hostId, a.last(S2C.WELCOME).id, 'oda yoksa hızlı katılan kurar ve kuran olur');
  assert.equal(a.last(S2C.LOBBY).private, false);
  b.say({ t: 'quick', teamSize: 2 });
  assert.equal(b.last(S2C.LOBBY).code, code);
  assert.equal(b.last(S2C.LOBBY).seats[2].nick, 'Ayşe');
  // Başka kipte tek kişilik oda: kip tutsa da insanı çok olan oda önce.
  c.say({ t: 'create', teamSize: 4 });
  d.say({ t: 'quick', teamSize: 4 });
  assert.equal(d.last(S2C.LOBBY).code, code, 'insanı çok olan oda önce');
  rooms.close();
  // Eşit kalabalıkta aynı kip.
  const s2 = setup();
  const e = s2.join('Ece'), f = s2.join('Fikret'), g = s2.join('Gül');
  e.say({ t: 'create', teamSize: 4 }); f.say({ t: 'create', teamSize: 3 });
  g.say({ t: 'quick', teamSize: 3 });
  assert.equal(g.last(S2C.LOBBY).code, f.last(S2C.LOBBY).code, 'eşit kalabalıkta aynı kip önce');
  s2.rooms.close();
});

test('hızlı katıl: maçtaki odaya da oturtur ve doğrudan maça sokar; lobideki oda varsa o önce', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe'), c = join('Can'), d = join('Deniz');
  a.say({ t: 'create', teamSize: 2 }); b.say({ t: 'join', code: a.last(S2C.LOBBY).code }); a.say({ t: 'start' });
  c.say({ t: 'quick', teamSize: 5 });
  assert.equal(c.last(S2C.LOBBY).code, a.last(S2C.LOBBY).code, 'maçtaki odaya oturmalı');
  assert.ok(c.last(S2C.START), 'maçtaki odaya giren START almalı');
  assert.equal(c.last(S2C.START).teamSize, 2);
  const e = join('Ece'); e.say({ t: 'create', teamSize: 5 });
  d.say({ t: 'quick', teamSize: 2 });
  assert.equal(d.last(S2C.LOBBY).code, e.last(S2C.LOBBY).code, 'lobideki oda maçtakinden önce');
  rooms.close();
});

test('hızlı katıl: dolu ve özel odalar önerilmez; dolu açık oda listede DOLU olarak durur', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), d = join('Deniz'), e = join('Ece');
  a.say({ t: 'create', teamSize: 1, private: true });
  // Dolu oda: herkes tek beş koltuk, beşi de dolu.
  const full = [join('F1'), join('F2'), join('F3'), join('F4'), join('F5')];
  full[0].say({ t: 'create', teamSize: 1 });
  for (const f of full.slice(1)) f.say({ t: 'join', code: full[0].last(S2C.LOBBY).code });
  assert.equal(full[4].last(S2C.LOBBY).seats.filter(Boolean).length, 5);
  e.say({ t: 'list' });
  assert.deepEqual(e.last(S2C.ROOMS).rooms.map(r => [r.code, r.full]), [[full[0].last(S2C.LOBBY).code, true]], 'listede yalnız dolu açık oda (DOLU)');
  const g = join('G'); g.say({ t: 'join', code: full[0].last(S2C.LOBBY).code });
  assert.equal(g.last(S2C.ERROR).msg, 'Oda dolu');
  d.say({ t: 'quick', teamSize: 1 });
  const mine = d.last(S2C.LOBBY);
  assert.ok(![a, full[0]].some(x => x.last(S2C.LOBBY).code === mine.code), 'uygun olmayan odaya kondu');
  assert.equal(mine.seats.filter(Boolean).length, 1); assert.equal(mine.settings.teamSize, 1); assert.equal(mine.private, false);
  assert.equal(rooms.rooms.size, 3);
  rooms.close();
});

test('liste izleyiciye değişince kendiliğinden gelir; boşalan oda listeden düşer', async () => {
  const { rooms, join } = setup();
  const a = join('Ali'), w = join('İzleyen');
  w.say({ t: 'list' });
  assert.equal(w.last(S2C.ROOMS).rooms.length, 0);
  a.say({ t: 'create' });
  await wait(300);
  assert.equal(w.last(S2C.ROOMS).rooms.length, 1);
  const sent = w.got.filter(m => m.t === S2C.ROOMS).length;
  a.say({ t: 'ping', at: 1 });
  await wait(300);
  assert.equal(w.got.filter(m => m.t === S2C.ROOMS).length, sent, 'değişiklik yokken liste yeniden gitmemeli');
  a.say({ t: 'leave' });
  await wait(300);
  assert.equal(w.last(S2C.ROOMS).rooms.length, 0);
  assert.equal(rooms.rooms.size, 0);
  assert.equal(a.got.filter(m => m.t === S2C.ROOMS).length, 0, 'listeyi istemeyene liste gitmez');
  rooms.close();
});
