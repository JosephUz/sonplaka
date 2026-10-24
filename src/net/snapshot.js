import { PICKUP } from '../config.js';

/**
 * Durum paketi (JSON, kısa diziler): maçın o anki hâli. Konumlar ve süreler yuvarlanır (bant genişliği). Sunucu
 * encodeSnapshot ile paketler, istemci applySnapshot ile kendi dünya kopyasına yazar (konumlar ara değerle ayrıca
 * yumuşatılır, bkz. client.js). Oyuncu alanlarının sırası PLAYER dizisindedir; diskler kimlikleriyle gider (ara değer
 * için istemci kimlikle eşler); plakalar, zıplama plakaları ve güç diskleri kısa diziler.
 */
export const PLAYER = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'knock', 'flight', 'freeze', 'respawn', 'discs', 'regen', 'charge', 'throwCd', 'sprint', 'plate', 'jumps', 'out', 'ground', 'power', 'powerLeft', 'shield', 'lives'];
const KINDS = ['normal', 'heavy', 'freeze'];
const STATES = ['countdown', 'play', 'over'];
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

const enc = (p, k) => {
  const v = p[k];
  if (k === 'out' || k === 'ground' || k === 'sprint') return v ? 1 : 0;
  if (k === 'power') return v ? PICKUP.kinds.indexOf(v) : -1;
  if (k === 'yaw' || k === 'pitch') return r3(v || 0);
  if (k === 'plate' || k === 'jumps' || k === 'discs' || k === 'powerLeft' || k === 'lives') return v | 0;
  return r2(v || 0);
};
const dec = (p, k, v) => {
  if (k === 'out' || k === 'ground' || k === 'sprint') p[k] = !!v;
  else if (k === 'power') p[k] = v < 0 ? null : PICKUP.kinds[v];
  else p[k] = v;
};

/** ts: sunucu saati (sn, gerçek zaman). */
export function encodeSnapshot(w, ts, events) {
  return {
    ts: r3(ts), time: r2(w.time), st: STATES.indexOf(w.state), rt: r2(w.t), rd: w.round, sc: w.score, ro: w.respawnOpen ? 1 : 0, win: w.winner, ov: w.over ? 1 : 0,
    p: w.players.map(p => PLAYER.map(k => enc(p, k))),
    h: w.players.map(p => (p.human ? 1 : 0)),
    d: w.discs.map(d => [d.id, r2(d.x), r2(d.y), r2(d.z), r2(d.vx), r2(d.vy), r2(d.vz), KINDS.indexOf(d.kind), d.owner, d.team]),
    pl: w.plates.map(s => [s.phase, r2(s.y), r2(s.r)]),
    pd: w.pads.map(s => r2(s.off)),
    pk: w.pickups.map(s => [s.active ? 1 : 0, PICKUP.kinds.indexOf(s.kind)]),
    ev: events,
  };
}

/** Paketteki durumu dünya kopyasına yazar (konumlar dahil; ara değer sonradan üstüne yazar). */
export function applySnapshot(w, s) {
  w.time = s.time; w.state = STATES[s.st] || 'play'; w.t = s.rt; w.round = s.rd; w.score = s.sc; w.respawnOpen = !!s.ro; w.winner = s.win ?? null;
  w.over = s.ov ? { why: 'net' } : null;
  s.p.forEach((row, i) => { const p = w.players[i]; PLAYER.forEach((k, j) => dec(p, k, row[j])); p.human = !!s.h[i]; });
  w.discs = s.d.map(([id, x, y, z, vx, vy, vz, kind, owner, team]) => ({ id, x, y, z, vx, vy, vz, kind: KINDS[kind] || 'normal', owner, team, age: 0, bounces: 0 }));
  s.pl.forEach(([phase, y, r], i) => Object.assign(w.plates[i], { phase, y, r }));
  s.pd.forEach((off, i) => { w.pads[i].off = off; });
  s.pk.forEach(([active, kind], i) => { w.pickups[i].active = !!active; w.pickups[i].kind = PICKUP.kinds[kind] || PICKUP.kinds[0]; });
}
