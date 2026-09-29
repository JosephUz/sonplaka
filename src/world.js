import { ARENA, CREDIT, DISC, FREEZE, JUMP, MATCH, MOVE, PICKUP, ROUND, teamsFor } from './config.js';
import { alive, emit, facing, jump, knock, pickup, swing, throwDisc } from './actions.js';
import { botInput } from './ai.js';
import { buildArena, spawnsFor } from './arena.js';
import { clamp } from './math.js';
import { createRng } from './rng.js';

export { alive, jump, swing, throwDisc };

/**
 * Maç simülasyonu: DOM ve three.js yok, testler Node'da (ve çevrim içi odada sunucuda) koşar. Kip `teamSize`: 1 →
 * herkes tek (MATCH.ffaTeams oyuncu, her biri ayrı takım), 2–5 → iki takım. Tek başına oyunda 0. oyuncu insan, kalanlar
 * bot; çevrim içinde `human` işaretli her koltuk bir insandır. step sabit adımla ilerletir, olayları w.events'e yazar
 * (görünüm, ses ve mesajlar oradan okur; tüketen boşaltır). `me`: bu tarayıcıdaki oyuncu.
 *
 * Maç MATCH.time saniye sürer (`matchT` kalan süre, yalnız 'play' durumunda sayar); düşürme takım skoruna (`score`)
 * yazılır, süre bitince en çok düşüren takım kazanır (`winner`; eşitlikte -1). Düşme hakkı sınırsız: düşen ROUND.respawn
 * saniye sonra ayakta bir plakada doğar. Dalga (`round`): `state` 'countdown' (w.t geri sayar) → 'play' (w.t dalga
 * saati; plakalar ROUND takvimine göre titrer ve düşer, merkez küçülür ve sonunda o da düşer) → 'over' (w.t bekleme;
 * plakalar geri gelir, yeni dalga).
 *
 * İnsan girdisi (her adım): x, z hareket yönü (dünya uzayı); yaw, pitch bakış; hold sol tık basılı, tap bu adımda
 * basıldı, release bırakıldı (kısa: normal disk, DISC.heavyCharge'dan uzun: ağır disk); secondary levye; jump zıplama.
 * Birden çok insan varsa (sunucu) girdi `{ players: { [id]: girdi } }` biçimindedir.
 */
export function createWorld(seed = MATCH.seed, { teamSize = MATCH.teamSize } = {}) {
  const arena = buildArena(), teams = teamsFor(teamSize);
  const w = {
    me: 0, time: 0, round: 0, state: 'countdown', t: 0, teamSize, teams, score: Array(teams).fill(0), matchT: MATCH.time,
    winner: null, over: null, warned: false,
    events: [], players: [], discs: [], nextDisc: 1, arena, spawns: spawnsFor(arena, teams), random: createRng(seed),
    plates: arena.plates.map(pl => ({ phase: 0, y: 0, vy: 0, r: pl.r })),
    pads: arena.pads.map(() => ({ off: 0 })),
    pickups: arena.pickups.map((_, i) => ({ active: false, t: 0, kind: PICKUP.kinds[i % PICKUP.kinds.length] })),
  };
  for (let i = 0; i < teams * teamSize; i++) {
    const team = Math.floor(i / teamSize), role = i % teamSize;
    w.players.push({
      id: i, team, role, human: i === 0, name: i === 0 ? 'Sen' : 'Bot-' + i,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, ground: true, plate: -1, jumps: 0, sprint: false,
      knock: 0, flight: 0, freeze: 0, respawn: 0, out: false, padLock: 0,
      discs: DISC.max, regen: 0, charge: 0, chargeSpent: false, throwCd: 0, barCd: 0, power: null, powerLeft: 0,
      lastHit: null, think: 0.2 + i * 0.05, bot: null,
      stats: { kills: 0, falls: 0, hits: 0, throws: 0, pickups: 0, pads: 0 },
    });
  }
  startWave(w);
  return w;
}

const TIMERS = ['knock', 'flight', 'freeze', 'padLock', 'throwCd', 'barCd', 'think'];

/** Yeni dalga: plakalar, zıplama plakaları ve güç diskleri sıfırlanır, herkes doğuş plakasında dizilir, geri sayım. Skor kalır. */
function startWave(w) {
  w.round++; w.state = 'countdown'; w.t = ROUND.start; w.warned = false; w.over = null;
  w.discs.length = 0;
  w.plates.forEach((s, i) => Object.assign(s, { phase: 0, y: 0, vy: 0, r: w.arena.plates[i].r }));
  for (const s of w.pads) s.off = 0;
  w.pickups.forEach((s, i) => { s.active = i > 0; s.t = i > 0 ? 0 : PICKUP.first; });
  for (const p of w.players) { p.out = false; p.respawn = 0; spawn(w, p); }
  emit(w, 'round', { n: w.round });
}

/**
 * Doğuş plakası: kendi takımının ayakta dış plakası (rolüne göre); dış halka düştüyse ayakta bir iç plaka (takıma göre
 * dağıtılır); o da düştüyse merkez; hiçbiri ayakta değilse null.
 */
function spawnPlate(w, p) {
  const up = id => w.plates[id].phase < 2;
  const outer = w.spawns[p.team].filter(up);
  if (outer.length) return outer[p.role % outer.length];
  const inner = w.arena.plates.filter(pl => pl.ring === 1 && up(pl.id)).map(pl => pl.id);
  if (inner.length) return inner[(p.team * 2 + p.role) % inner.length];
  return up(0) ? 0 : null;
}

/** Doğar: aynı plakadakiler yan yana (kimse kimsenin önünde değil), merkeze bakar. Ayakta plaka yoksa false. */
function spawn(w, p) {
  const id = spawnPlate(w, p);
  if (id === null) return false;
  const plate = w.arena.plates[id], s = w.plates[id], d = Math.hypot(plate.x, plate.z) || 1, px = plate.z / d, pz = -plate.x / d;
  const off = (p.role - (w.teamSize - 1) / 2) * 1.3;
  Object.assign(p, { x: plate.x + px * off, y: s.y, z: plate.z + pz * off, vx: 0, vy: 0, vz: 0, ground: true, plate: id, jumps: 0,
    knock: 0, flight: 0, freeze: 0, respawn: 0, out: false, padLock: 0, discs: DISC.max, regen: 0, charge: 0, chargeSpent: false, throwCd: 0, barCd: 0, power: null, powerLeft: 0, lastHit: null, bot: null });
  p.yaw = Math.atan2(-p.x, -p.z); p.pitch = 0;
  emit(w, 'spawn', { id: p.id });
  return true;
}

export function step(w, dt, input = {}) {
  if (w.winner !== null) return;
  dt = Math.min(dt, 1 / 30);
  w.time += dt;
  if (w.state === 'countdown') {
    w.t -= dt;
    for (const p of w.players) look(p, cmdOf(w, p, input));
    if (w.t <= 0) { w.state = 'play'; w.t = 0; emit(w, 'go'); }
    return;
  }
  const playing = w.state === 'play';
  if (playing) { w.t += dt; w.matchT = Math.max(0, w.matchT - dt); schedule(w); }
  else { w.t -= dt; }
  plates(w, dt);
  for (const s of w.pads) s.off = Math.max(0, s.off - dt);
  pickups(w, dt);
  for (const p of w.players) {
    for (const k of TIMERS) p[k] = Math.max(0, p[k] - dt);
    if (p.out) { respawn(w, p, dt); continue; }
    if (p.discs < DISC.max) { p.regen -= dt; if (p.regen <= 0) { p.discs++; p.regen = p.discs < DISC.max ? DISC.regen : 0; emit(w, 'regen', { id: p.id }); } }
    const cmd = cmdOf(w, p, input);
    look(p, cmd);
    if (playing) act(w, p, cmd, dt);
    else p.charge = 0;
    physics(w, p, cmd, dt);
  }
  discs(w, dt);
  if (playing && w.matchT <= 0) endMatch(w);
  else if (!playing && w.t <= 0) startWave(w);
}

const cmdOf = (w, p, input) => (!p.human ? botInput(w, p) : input.players ? input.players[p.id] || {} : input);

function look(p, cmd) {
  if (Number.isFinite(cmd.yaw)) p.yaw = cmd.yaw;
  if (Number.isFinite(cmd.pitch)) p.pitch = clamp(cmd.pitch, -1.3, 1.3);
}

/** Dalga takvimi: titreme, düşüş, merkezin küçülmesi; merkez de düşünce dalga biter (plakalar geri gelecek). */
function schedule(w) {
  const ring = n => w.plates.filter((_, i) => w.arena.plates[i].ring === n);
  for (const [at, n] of [[ROUND.ring2At, 2], [ROUND.ring1At, 1]]) {
    const list = ring(n);
    if (w.t >= at - ROUND.tremble && list[0].phase === 0) { for (const s of list) s.phase = 1; emit(w, 'tremble', { ring: n }); }
    if (w.t >= at && list[0].phase === 1) { for (const s of list) s.phase = 2; emit(w, 'collapse', { ring: n }); }
  }
  const c = w.plates[0];
  if (w.t >= ROUND.shrinkAt - ROUND.tremble && !w.warned) { w.warned = true; emit(w, 'shrinkWarn'); }
  if (w.t >= ROUND.shrinkAt && c.phase < 2) c.r = Math.max(ROUND.minR, ARENA.center.r - (ARENA.center.r - ROUND.minR) * Math.min(1, (w.t - ROUND.shrinkAt) / ROUND.shrinkTime));
  if (w.t >= ROUND.endAt && c.phase < 2) {
    c.phase = 2; emit(w, 'collapse', { ring: 0 });
    w.state = 'over'; w.t = ROUND.between; w.over = { wave: w.round };
    emit(w, 'roundEnd', { n: w.round, score: [...w.score] });
  }
}

/** Düşen plakalar hızlanarak iner, çok aşağıda yok olur. */
function plates(w, dt) {
  for (const s of w.plates) {
    if (s.phase !== 2) continue;
    s.vy -= ARENA.fallAccel * dt; s.y += s.vy * dt;
    if (s.y < ARENA.gone) s.phase = 3;
  }
}

/** Güç diskleri: alınınca sayaç, dolunca sıradaki tür doğar; plakası düştüyse doğmaz. */
function pickups(w, dt) {
  w.pickups.forEach((s, i) => {
    const spot = w.arena.pickups[i], plate = w.plates[spot.plate];
    if (plate.phase >= 2) { s.active = false; return; }
    if (s.active) {
      for (const p of w.players) {
        if (p.out || p.plate !== spot.plate || !p.ground || Math.hypot(p.x - spot.x, p.z - spot.z) > PICKUP.radius) continue;
        s.active = false; s.t = PICKUP.respawn;
        pickup(w, p, s.kind);
        s.kind = PICKUP.kinds[(PICKUP.kinds.indexOf(s.kind) + 1) % PICKUP.kinds.length];
        break;
      }
    } else { s.t -= dt; if (s.t <= 0) { s.active = true; emit(w, 'spawnPickup', { i, kind: s.kind, x: spot.x, z: spot.z }); } }
  });
}

/** Düşen oyuncu ROUND.respawn saniye sonra doğar; o an ayakta plaka yoksa az sonra yine dener. */
function respawn(w, p, dt) {
  if (p.respawn <= 0) return;
  p.respawn = Math.max(0, p.respawn - dt);
  if (p.respawn === 0 && w.state === 'play' && !spawn(w, p)) p.respawn = 0.5;
}

/** Girdiyi eyleme çevirir: zıplama, levye, disk şarjı ve atış. */
function act(w, p, cmd, dt) {
  if (p.knock > 0 || p.freeze > 0) { p.charge = 0; return; }
  if (cmd.jump) jump(w, p.id);
  if (cmd.secondary) swing(w, p.id);
  const pressing = cmd.hold || cmd.tap;
  if (pressing && p.discs > 0 && p.throwCd <= 0 && !p.chargeSpent) p.charge = Math.min(DISC.heavyCharge, p.charge + dt);
  if (cmd.release || !pressing) {
    if (cmd.release && p.charge > 0 && !p.chargeSpent) throwDisc(w, p.id, p.charge >= DISC.heavyCharge ? 'heavy' : 'normal');
    p.charge = 0; p.chargeSpent = false;
  }
}

/** Zeminin yüksekliği: (x, z) altındaki (düşmemiş) plaka; yoksa null. */
export function groundAt(w, x, z) {
  for (let i = 0; i < w.plates.length; i++) {
    const s = w.plates[i];
    if (s.phase === 3) continue;
    const pl = w.arena.plates[i];
    if (Math.hypot(x - pl.x, z - pl.z) <= s.r) return { plate: i, y: s.y, state: s };
  }
  return null;
}

/**
 * Hareket ve fizik: yerde ve havada yön verme, yerçekimi, kolonlar, plaka zemini, zıplama plakası, düşme.
 * Savrulmuş (knock), uçan (flight) ya da donmuş (freeze) oyuncu yön veremez.
 */
function physics(w, p, cmd, dt) {
  const control = p.knock <= 0 && p.flight <= 0 && p.freeze <= 0 && w.state === 'play';
  const mx = control ? cmd.x || 0 : 0, mz = control ? cmd.z || 0 : 0, md = Math.hypot(mx, mz);
  p.sprint = control && !!cmd.sprint && md > 0.1;
  const speed = MOVE.speed * (p.sprint ? MOVE.sprint : 1);
  const tx = mx / Math.max(1, md) * speed, tz = mz / Math.max(1, md) * speed;
  if (control || (p.ground && p.knock <= 0)) {
    const blend = 1 - Math.exp(-(p.ground ? MOVE.accel : MOVE.air) * dt);
    if (p.freeze > 0) { p.vx *= 1 - blend; p.vz *= 1 - blend; }
    else if (p.ground || md > 0.1) { p.vx += (tx - p.vx) * blend; p.vz += (tz - p.vz) * blend; } // havada girdi yoksa hız korunur
  } else if (p.ground) { const k = Math.exp(-MOVE.friction * dt); p.vx *= k; p.vz *= k; }
  p.vy -= JUMP.gravity * dt;
  const prevY = p.y;
  p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
  pillars(w, p);
  const g = groundAt(w, p.x, p.z);
  // Yalnız yukarıdan gelen iner: plakanın altından geçen (savrulup düşen) üstüne çıkmaz.
  if (g && p.vy <= 0 && p.y <= g.y + 0.02 && prevY >= g.y - 0.05) {
    const landed = !p.ground;
    p.y = g.y; p.vy = g.state.phase === 2 ? g.state.vy : 0; p.ground = true; p.plate = g.plate; p.jumps = 0;
    if (p.flight > 0) p.flight = 0;
    if (landed) emit(w, 'land', { id: p.id, x: p.x, y: p.y, z: p.z });
  } else { p.ground = false; p.plate = g ? g.plate : -1; }
  // Rampaya basan mutlaka uçar (iniş kilidi bitmişse; savrulmuş ya da donmuş oyuncu hariç).
  if (p.ground && p.knock <= 0 && p.freeze <= 0 && w.state === 'play') pad(w, p);
  if (p.y < ARENA.fallDepth && w.state === 'play') eliminate(w, p, 'fall');
}

/** Kolonlar oyuncuyu dışarı iter. */
function pillars(w, p) {
  const R = ARENA.pillarR + 0.4;
  for (let i = 0; i < w.plates.length; i++) {
    const s = w.plates[i];
    if (s.phase >= 2 || p.y > s.y + ARENA.pillarH || p.y < s.y - 1) continue;
    for (const c of w.arena.plates[i].pillars) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-4) continue;
      p.x = c.x + dx / d * R; p.z = c.z + dz / d * R;
      const vn = (p.vx * dx + p.vz * dz) / d;
      if (vn < 0) { p.vx -= vn * dx / d; p.vz -= vn * dz / d; }
    }
  }
}

/** Oyuncunun üstünde durduğu rampa (açık ve hedefi ayakta), yoksa null. */
export function padUnder(w, p) {
  if (!p.ground || p.plate < 0) return null;
  for (const id of w.arena.plates[p.plate].pads) {
    const q = w.arena.pads[id];
    if (w.pads[id].off > 0 || w.plates[q.to].phase >= 2 || Math.hypot(p.x - q.x, p.z - q.z) > ARENA.padR) continue;
    return q;
  }
  return null;
}

/** Rampaya basan hedef plakaya uçar (iniş kilidi bitmişse). Uçtuysa true. */
function pad(w, p) {

  const q = padUnder(w, p);
  if (q) {
    const id = q.id, target = w.plates[q.to];
    const T = q.time;
    p.vx = (q.land.x - p.x) / T; p.vz = (q.land.z - p.z) / T; p.vy = JUMP.gravity * T / 2 + (target.y - p.y) / T;
    p.ground = false; p.flight = T * 1.5; p.jumps = 0; // uçuş inişte biter; süre yalnız güvence
    p.stats.pads++;
    emit(w, 'pad', { id: p.id, pad: id, x: p.x, y: p.y, z: p.z });
    return true;
  }
  return false;
}

/** Diskler: uçuş, sınır ve kolon sekmesi, zıplama plakası kapatma, isabet, ömür. */
function discs(w, dt) {
  const SUB = 2, h = dt / SUB;
  for (let i = w.discs.length - 1; i >= 0; i--) {
    const d = w.discs[i];
    let dead = false;
    for (let s = 0; s < SUB && !dead; s++) {
      d.age += h; d.x += d.vx * h; d.y += d.vy * h; d.z += d.vz * h;
      bounce(w, d);
      dead = d.age > DISC.life || d.bounces > DISC.bounces || d.y < ARENA.fallDepth || collide(w, d);
    }
    if (dead) w.discs.splice(i, 1);
  }
}

function bounce(w, d) {
  const r = Math.hypot(d.x, d.z);
  if (r > ARENA.bound) {
    const nx = d.x / r, nz = d.z / r, vn = d.vx * nx + d.vz * nz;
    if (vn > 0) { d.vx -= 2 * vn * nx; d.vz -= 2 * vn * nz; d.bounces++; emit(w, 'bounce', { x: d.x, y: d.y, z: d.z }); }
    d.x = nx * (ARENA.bound - 0.01); d.z = nz * (ARENA.bound - 0.01);
  }
  for (let i = 0; i < w.plates.length; i++) {
    const s = w.plates[i];
    if (s.phase >= 2 || d.y > s.y + ARENA.pillarH || d.y < s.y - 0.5) continue;
    for (const c of w.arena.plates[i].pillars) {
      const dx = d.x - c.x, dz = d.z - c.z, dist = Math.hypot(dx, dz), R = ARENA.pillarR + DISC.radius;
      if (dist >= R || dist < 1e-4) continue;
      const nx = dx / dist, nz = dz / dist, vn = d.vx * nx + d.vz * nz;
      if (vn < 0) { d.vx -= 2 * vn * nx; d.vz -= 2 * vn * nz; d.bounces++; emit(w, 'bounce', { x: d.x, y: d.y, z: d.z }); }
      d.x = c.x + nx * R; d.z = c.z + nz * R;
    }
  }
}

/** Disk bir rakibe değdi mi (rampalar diske aldırmaz). Rakibe değince disk biter (true). */
function collide(w, d) {
  for (const p of w.players) {
    if (p.out || p.team === d.team) continue;
    if (Math.hypot(p.x - d.x, p.z - d.z) > DISC.radius + 0.55 || d.y < p.y - 0.3 || d.y > p.y + 2.2) continue;
    const vh = Math.hypot(d.vx, d.vz) || 1, ux = d.vx / vh, uz = d.vz / vh;
    // Disk elemez, yalnız savurur; ağır disk daha sert. Eleme yalnız boşluğa düşmekle olur.
    const heavy = d.kind === 'heavy';
    knock(w, p, ux, uz, DISC.knock * (heavy ? DISC.heavyKnock : 1), DISC.lift * (heavy ? DISC.heavyLift : 1), d.owner, d.kind);
    if (d.kind === 'freeze') p.freeze = FREEZE.time;
    return true;
  }
  return false;
}

/**
 * Düşüş: yalnız boşluğa düşünce. Son CREDIT saniyede vuran rakip düşürmüş sayılır (kendi ve takım skoruna yazılır).
 * Düşme hakkı sınırsız: ROUND.respawn saniye sonra geri gelir.
 */
function eliminate(w, p, cause) {
  if (p.out) return;
  const by = p.lastHit && w.time - p.lastHit.t < CREDIT && w.players[p.lastHit.by]?.team !== p.team ? p.lastHit.by : null;
  if (by !== null) { w.players[by].stats.kills++; w.score[w.players[by].team]++; }
  p.stats.falls++;
  const at = { x: p.x, y: p.y, z: p.z };
  Object.assign(p, { out: true, y: -200, vx: 0, vy: 0, vz: 0, ground: false, plate: -1, knock: 0, flight: 0, freeze: 0, charge: 0, power: null, powerLeft: 0, discs: DISC.max, regen: 0 });
  p.respawn = ROUND.respawn;
  emit(w, 'fall', { id: p.id, by, cause, ...at, respawn: true, score: [...w.score] });
}

/** Ayakta olan oyuncu sayısı (takım). */
export const aliveCount = (w, team) => w.players.filter(p => p.team === team && !p.out).length;

/** Önde olan takımlar (en yüksek skor; eşitlikte birden çok). */
export const leaders = w => { const best = Math.max(...w.score); return w.score.map((s, t) => (s === best ? t : -1)).filter(t => t >= 0); };

/** Süre bitti: en çok düşüren takım kazanır; eşitlikte berabere (winner -1). */
function endMatch(w) {
  const top = leaders(w);
  w.winner = top.length === 1 ? top[0] : -1;
  w.state = 'over'; w.t = 0;
  emit(w, 'end', { team: w.winner < 0 ? null : w.winner, score: [...w.score] });
}

export { facing };
