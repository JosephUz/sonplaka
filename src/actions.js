import { CROWBAR, DISC, JUMP, PICKUP } from './config.js';

/**
 * Oyuncu eylemleri: zıplama (çift), disk atma (normal / keskin / dondurucu / üçlü), levye. İnsan girdisi de bot
 * kararları da buradan geçer; eylem yapılamıyorsa (raund oynanmıyor, elenmiş, savrulmuş, donmuş) false döner.
 */
export function emit(w, type, data = {}) { w.events.push({ type, ...data }); }

/** Oyuncu raundda ve ayakta mı (elenmemiş). */
export const alive = p => !p.out;
/** Oyuncu şu an eylem yapabilir mi. */
export const idle = (w, p) => w.winner !== null || w.state !== 'play' || p.out || p.knock > 0 || p.freeze > 0;

/** Bakış yönü birim vektörü (yaw yatay, pitch yukarı pozitif). */
export function facing(p) {
  const c = Math.cos(p.pitch);
  return { x: Math.sin(p.yaw) * c, y: Math.sin(p.pitch), z: Math.cos(p.yaw) * c };
}

/** Zıplama: yerdeyse kalkar; havadaysa (uçuşta değilse) bir kez daha zıplar. */
export function jump(w, id) {
  const p = w.players[id];
  if (idle(w, p) || p.flight > 0) return false;
  if (p.ground) { p.vy = JUMP.vy; p.ground = false; p.jumps = JUMP.double; }
  else if (p.jumps > 0) { p.vy = JUMP.vy * JUMP.secondMult; p.jumps--; }
  else return false;
  emit(w, 'jump', { id, x: p.x, y: p.y, z: p.z });
  return true;
}

/**
 * Disk atar: `kind` 'normal' | 'sharp' (keskin) | 'freeze'. Güç diski varsa (`power`) tür ya da sayı değişir: üçlü
 * yelpaze, dondurucu. Keskin disk gücü ezer (dondurucu gücü yine harcanır).
 */
export function throwDisc(w, id, kind = 'normal') {
  const p = w.players[id];
  if (idle(w, p) || p.discs <= 0 || p.throwCd > 0) return false;
  let count = 1;
  if (p.power === 'triple') count = 3;
  if (p.power === 'freeze' && kind !== 'sharp') kind = 'freeze';
  const f = facing(p), speed = kind === 'sharp' ? DISC.sharpSpeed : DISC.speed;
  for (let i = 0; i < count; i++) {
    const spread = count > 1 ? (i - 1) * DISC.spread : 0, yaw = p.yaw + spread, c = Math.cos(p.pitch);
    const dx = Math.sin(yaw) * c, dz = Math.cos(yaw) * c;
    w.discs.push({ id: w.nextDisc++, kind, owner: id, team: p.team, age: 0, bounces: 0,
      x: p.x + dx * 0.9, y: p.y + 1.3 + f.y * 0.5, z: p.z + dz * 0.9, vx: dx * speed, vy: f.y * speed, vz: dz * speed });
  }
  p.discs--; p.throwCd = DISC.cooldown; p.charge = 0;
  if (p.discs < DISC.max && p.regen <= 0) p.regen = DISC.regen;
  if (p.power && --p.powerLeft <= 0) p.power = null;
  p.stats.throws++;
  emit(w, 'throw', { id, kind, count, x: p.x, y: p.y + 1.3, z: p.z });
  return true;
}

/** Levye: bakış konisindeki yakın rakipleri kendinden uzağa savurur. */
export function swing(w, id) {
  const p = w.players[id];
  if (idle(w, p) || p.barCd > 0) return false;
  p.barCd = CROWBAR.cooldown; p.charge = 0;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  emit(w, 'swing', { id, x: p.x, y: p.y + 1.2, z: p.z });
  for (const t of w.players) {
    if (t.team === p.team || t.out) continue;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d > CROWBAR.range || Math.abs(t.y - p.y) > 2.2) continue;
    if (d > 0.05 && (dx * fx + dz * fz) / d < CROWBAR.cone) continue;
    const ux = d > 0.05 ? dx / d : fx, uz = d > 0.05 ? dz / d : fz;
    knock(w, t, ux, uz, CROWBAR.knock, CROWBAR.lift, p.id, 'bar');
  }
  return true;
}

/** Savurma: verilen yatay yönde hızla iter, havalandırır; kısa süre kontrol yok. Vuran kaydedilir (düşürme sayılır). */
export function knock(w, t, ux, uz, speed, lift, by, kind) {
  t.vx = ux * speed; t.vz = uz * speed; t.vy = Math.max(t.vy, lift);
  t.ground = false; t.knock = DISC.knockTime; t.flight = 0; t.charge = 0;
  t.lastHit = { by, t: w.time };
  const attacker = w.players[by];
  if (attacker) attacker.stats.hits++;
  emit(w, 'hit', { id: t.id, by, kind, x: t.x, y: t.y + 1, z: t.z });
}

/** Güç diskini alır: sonraki PICKUP.shots atış o türden. */
export function pickup(w, p, kind) {
  p.power = kind; p.powerLeft = PICKUP.shots;
  p.stats.pickups++;
  emit(w, 'pickup', { id: p.id, kind, x: p.x, y: p.y + 1, z: p.z });
}
