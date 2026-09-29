import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRooms } from '../server/rooms.mjs';
import { S2C } from '../src/net/protocol.js';

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
  assert.equal(b.last(S2C.START), undefined, 'yalnız yönetici başlatır');
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

test('yönetici kipi değiştirir: koltuklar yeniden dizilir; herkes tek beş koltuk; maç o kiple başlar', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create', teamSize: 3 });
  let lobby = a.last(S2C.LOBBY);
  assert.equal(lobby.settings.teamSize, 3); assert.equal(lobby.seats.length, 6);
  b.say({ t: 'join', code: lobby.code });
  lobby = b.last(S2C.LOBBY);
  assert.equal(lobby.seats[3].nick, 'Ayşe', 'katılan karşı takımın ilk koltuğuna oturmalı');
  b.say({ t: 'settings', teamSize: 1 });
  assert.equal(a.last(S2C.LOBBY).settings.teamSize, 3, 'yalnız yönetici kipi değiştirir');
  a.say({ t: 'settings', teamSize: 1 });
  lobby = b.last(S2C.LOBBY);
  assert.equal(lobby.settings.teamSize, 1); assert.equal(lobby.seats.length, 5);
  assert.equal(lobby.seats[0].nick, 'Ali'); assert.equal(lobby.seats[1].nick, 'Ayşe');
  a.say({ t: 'start' });
  assert.equal(a.last(S2C.START).teamSize, 1); assert.equal(b.last(S2C.START).you, 1);
  const w = [...rooms.rooms.values()][0].world;
  assert.equal(w.players.length, 5); assert.equal(w.teams, 5);
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
