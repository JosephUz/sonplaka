import { BOT, CROWBAR, DISC, PICKUP } from './config.js';
import { alive } from './actions.js';
import { distance } from './math.js';

/**
 * Bot kararı: bu adımın girdisi { x, z, yaw, pitch, tap, release, hold, secondary, jump }. BOT.think aralıkla plan yapar
 * (hedef, gidilecek nokta, düello mu), her adım plana göre yürür ve nişan alır.
 * - Plakası titriyor / düşüyorsa ya da merkez küçülürken kenardaysa: içeri götüren zıplama plakasına (ya da merkeze) kaçar.
 * - Plakasında güç diski varsa (elinde güç yokken) onu alır.
 * - Rakiple aynı plakadaysa düello: mesafeyi korur, yanlara kayar, kenardan uzak durur, disk atar, yakınsa levye.
 * - Rakip başka plakadaysa: bazen uzaktan atar; zıplama plakalarıyla ona (ya da merkeze) gider.
 * - Üstüne gelen diski görünce zıplayarak kaçınır.
 */
export function botInput(w, p) {
  const b = p.bot ??= { target: null, dest: null, duel: false, cross: false, stay: 0, strafe: 1, strafeT: 0, fireT: 0, charge: false, jumpT: 0, aimErr: 0 };
  const cmd = { x: 0, z: 0, yaw: p.yaw, pitch: p.pitch };
  if (p.knock > 0 || p.freeze > 0 || p.out) return cmd;
  if (p.think <= 0) { p.think = BOT.think + w.random() * BOT.thinkJitter; plan(w, p, b); }
  const enemy = b.target !== null ? w.players[b.target] : null, target = enemy && alive(enemy) ? enemy : null;
  if (target) {
    const lead = { x: target.x + target.vx * 0.18, y: target.y + target.vy * 0.1, z: target.z + target.vz * 0.18 };
    const dx = lead.x - p.x, dz = lead.z - p.z, dh = Math.hypot(dx, dz);
    cmd.yaw = Math.atan2(dx, dz) + b.aimErr;
    cmd.pitch = Math.atan2(lead.y + 1 - (p.y + 1.3), dh);
  }
  if (p.flight <= 0) {
    if (b.dest) {
      const dx = b.dest.x - p.x, dz = b.dest.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.35) { cmd.x = dx / d; cmd.z = dz / d; }
      cmd.sprint = !!b.dest.pad; // rampaya koşarken ve kaçarken hızlı
    }
    if (b.duel && target && p.ground) {
      if (w.time >= b.strafeT) { b.strafeT = w.time + BOT.strafe * (0.6 + w.random() * 0.8); b.strafe = -b.strafe; }
      const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz) || 1;
      let sx = -dz / d * b.strafe, sz = dx / d * b.strafe;
      const pl = p.plate >= 0 ? w.arena.plates[p.plate] : null, ps = pl ? w.plates[p.plate] : null;
      if (pl) {
        // Kenara yaklaşan yan adım merkeze doğru bükülür.
        const nx = p.x + sx * 1.5 - pl.x, nz = p.z + sz * 1.5 - pl.z;
        if (Math.hypot(nx, nz) > ps.r - BOT.edge) { sx = (pl.x - p.x) * 0.3; sz = (pl.z - p.z) * 0.3; b.strafe = -b.strafe; }
      }
      cmd.x += sx * 0.8; cmd.z += sz * 0.8;
    }
  }
  if (target && w.time >= b.fireT && p.discs > 0 && p.throwCd <= 0) {
    const d = distance(p, target);
    if (d <= BOT.fireRange && (b.duel || b.cross)) {
      if (b.charge) { cmd.hold = true; if (p.charge >= DISC.sharpCharge - 0.01) { cmd.release = true; b.charge = false; b.fireT = w.time + BOT.fireEvery + w.random() * BOT.fireJitter; } }
      else { cmd.tap = true; cmd.release = true; b.fireT = w.time + BOT.fireEvery + w.random() * BOT.fireJitter; b.aimErr = (w.random() - 0.5) * 2 * BOT.aimError; }
    }
    if (d < CROWBAR.range * 0.9 && p.barCd <= 0 && Math.abs(target.y - p.y) < 2) cmd.secondary = true;
  }
  if (p.ground && w.time >= b.jumpT && incoming(w, p)) { b.jumpT = w.time + 1.2; if (w.random() < BOT.dodgeChance) cmd.jump = true; }
  return cmd;
}

function plan(w, p, b) {
  const plate = p.plate >= 0 ? w.arena.plates[p.plate] : null, ps = plate ? w.plates[p.plate] : null;
  b.duel = false; b.cross = false; b.dest = null;
  // Hedef: en yakın rakip; aynı plakadaki çok daha çekici.
  let best = null, score = Infinity;
  for (const t of w.players) {
    if (t.team === p.team || !alive(t)) continue;
    const s = distance(p, t) - (t.plate === p.plate && p.plate >= 0 ? 15 : 0);
    if (s < score) { score = s; best = t; }
  }
  b.target = best ? best.id : null;
  if (!b.charge && best) b.charge = w.random() < BOT.sharpChance;
  if (!plate) return;
  // Kaçış: plaka titriyor ya da düşüyor, ya da merkez küçülürken kenardayım.
  const shrinking = plate.ring === 0 && ps.r < plate.r - 0.5;
  if (ps.phase >= 1) {
    const pad = escapePad(w, p);
    b.dest = pad ? { x: pad.x, z: pad.z, pad: true } : { x: plate.x, z: plate.z };
    return;
  }
  if (shrinking && Math.hypot(p.x - plate.x, p.z - plate.z) > ps.r - BOT.edge) { b.dest = { x: plate.x, z: plate.z }; b.duel = !!best && best.plate === p.plate; return; }
  // Güç diski.
  if (!p.power) {
    for (let i = 0; i < w.pickups.length; i++) {
      const s = w.pickups[i], spot = w.arena.pickups[i];
      if (s.active && spot.plate === p.plate) { b.dest = { x: spot.x, z: spot.z }; b.duel = !!best && best.plate === p.plate; return; }
    }
  }
  if (!best) { b.dest = wander(w, p, plate, ps); return; }
  if (best.plate === p.plate) {
    b.duel = true;
    const d = distance(p, best), toward = d > BOT.range ? 1 : d < BOT.close ? -1 : 0;
    const ux = (best.x - p.x) / (d || 1), uz = (best.z - p.z) / (d || 1);
    b.dest = inside(plate, ps, { x: p.x + ux * toward * 3, z: p.z + uz * toward * 3 });
    return;
  }
  // Başka plakada: menzildeyse çoğunlukla yerinde kalıp uzaktan atar (rakibe bakan kenara yakın, yanlara kayarak);
  // yeni indiği plakada bir süre kalır; aksi halde zıplama plakalarıyla ona (plakası ayaktaysa) ya da merkeze gider.
  const d = distance(p, best);
  if (p.flight > 0) b.stay = w.time + BOT.stay;
  b.cross = d <= BOT.fireRange;
  if (b.cross && (w.time < b.stay || w.random() > BOT.crossChance)) {
    const ux = (best.x - plate.x) / (Math.hypot(best.x - plate.x, best.z - plate.z) || 1), uz = (best.z - plate.z) / (Math.hypot(best.x - plate.x, best.z - plate.z) || 1);
    b.duel = true;
    b.dest = inside(plate, ps, { x: plate.x + ux * (ps.r - BOT.edge - 1), z: plate.z + uz * (ps.r - BOT.edge - 1) });
    return;
  }
  const goal = best.plate >= 0 && w.plates[best.plate].phase < 2 ? best.plate : w.plates[0].phase < 2 ? 0 : p.plate;
  const pad = routePad(w, p.plate, goal);
  b.dest = pad ? { x: pad.x, z: pad.z, pad: true } : wander(w, p, plate, ps);
}

/** Plaka içinde rastgele bir nokta (kenardan uzak). */
function wander(w, p, plate, ps) {
  const a = w.random() * Math.PI * 2, r = w.random() * Math.max(0, ps.r - BOT.edge);
  return { x: plate.x + Math.sin(a) * r, z: plate.z + Math.cos(a) * r };
}

/** Noktayı plakanın içine (kenardan BOT.edge uzağa) sıkıştırır. */
function inside(plate, ps, pt) {
  const dx = pt.x - plate.x, dz = pt.z - plate.z, d = Math.hypot(dx, dz), max = Math.max(0.5, ps.r - BOT.edge);
  if (d <= max) return pt;
  return { x: plate.x + dx / d * max, z: plate.z + dz / d * max };
}

/** Kaçış plakası: hedefi sağlam (titremeyen) ve açık olan, en içteki, sonra en yakın. */
function escapePad(w, p) {
  let best = null, score = Infinity;
  for (const id of w.arena.plates[p.plate].pads) {
    const q = w.arena.pads[id];
    if (w.pads[id].off > 0 || w.plates[q.to].phase !== 0) continue;
    const s = w.arena.plates[q.to].ring * 100 + Math.hypot(q.x - p.x, q.z - p.z);
    if (s < score) { score = s; best = q; }
  }
  return best;
}

/** Plakalar arası en kısa yol (genişlik öncelikli, açık ve sağlam plakalar): ilk zıplama plakası ya da null. */
export function routePad(w, from, to) {
  if (from < 0 || from === to) return null;
  const prev = new Map([[from, null]]), queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const id of w.arena.plates[cur].pads) {
      const q = w.arena.pads[id];
      if (w.pads[id].off > 0 || w.plates[q.to].phase >= 2 || prev.has(q.to)) continue;
      prev.set(q.to, { from: cur, pad: q });
      if (q.to === to) {
        let node = to, pad = null;
        while (prev.get(node)) { pad = prev.get(node).pad; node = prev.get(node).from; }
        return pad;
      }
      queue.push(q.to);
    }
  }
  return null;
}

/** Yaklaşan rakip diski: 0,7 saniye içinde 1,6 birimden geçecek. */
function incoming(w, p) {
  for (const d of w.discs) {
    if (d.team === p.team) continue;
    const rx = p.x - d.x, rz = p.z - d.z, v2 = d.vx * d.vx + d.vz * d.vz;
    if (v2 < 1) continue;
    const t = (rx * d.vx + rz * d.vz) / v2;
    if (t < 0 || t > 0.7) continue;
    if (Math.hypot(rx - d.vx * t, rz - d.vz * t) < 1.6 && Math.abs(d.y - (p.y + 1)) < 2) return true;
  }
  return false;
}
