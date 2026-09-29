import * as T from 'three';
import { DISC, TEAMS } from '../config.js';
import { box, mat } from './builders.js';

/**
 * Oyuncu görselleri: blok gövde, kafa, saç, kollar ve bacaklar (koşarken sallanır, havada açılır), sağ elde disk
 * (şarj olurken büyüyüp parlar), sol elde levye; üstte isim etiketi (DOM). Savrulan geriye takla atar, donan buz
 * küpünün içinde titrer, elenen gizlenir. Birinci şahısta senin gövden çizilmez. Senin karakterin sarı saçlı.
 */
const iceGeo = new T.BoxGeometry(1.3, 2.4, 1.3);
const iceMat = new T.MeshStandardMaterial({ color: '#9fefff', transparent: true, opacity: 0.55, roughness: 0.2, emissive: '#3bc7e8', emissiveIntensity: 0.3 });
const discGeo = new T.CylinderGeometry(0.5, 0.5, 0.1, 20);

export function createActor(scene, labels, id) {
  const root = new T.Group(), body = new T.Group();
  root.add(body); scene.add(root);
  const team = id < 5 ? 0 : 1, color = TEAMS.colors[team];
  box(body, 0.76, 0.9, 0.46, color, 0, 1.05, 0);
  box(body, 0.78, 0.26, 0.49, '#263a3a', 0, 0.59, 0);
  box(body, 0.53, 0.55, 0.5, '#d6a17c', 0, 1.75, 0);
  const hairColor = id % 3 === 0 ? '#443b31' : '#40352d';
  const hair = box(body, 0.56, 0.16, 0.54, hairColor, 0, 2.03, 0);
  box(body, 0.31, 0.08, 0.08, '#ffedcd', 0, 1.73, 0.27);
  const limbs = [];
  for (const x of [-0.23, 0.23]) {
    const leg = new T.Group(); leg.position.set(x, 0.6, 0);
    box(leg, 0.23, 0.53, 0.24, '#263a3a', 0, -0.22, 0);
    box(leg, 0.27, 0.18, 0.45, '#f3e6bf', 0, -0.5, 0.09);
    body.add(leg); limbs.push(leg);
  }
  let disc = null, bar = null;
  for (const x of [-0.52, 0.52]) {
    const arm = new T.Group(); arm.position.set(x, 1.42, 0);
    box(arm, 0.22, 0.53, 0.25, color, 0, -0.2, 0);
    box(arm, 0.2, 0.25, 0.22, '#d6a17c', 0, -0.5, 0);
    if (x > 0) {
      disc = new T.Mesh(discGeo, new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 }));
      disc.position.set(0.15, -0.55, 0.35); disc.rotation.x = Math.PI / 2 - 0.4; arm.add(disc);
    } else {
      bar = box(arm, 0.08, 0.08, 1.1, '#b8402f', 0, -0.55, 0.45); bar.rotation.x = 0.5;
    }
    body.add(arm); limbs.push(arm);
  }
  const ice = new T.Mesh(iceGeo, iceMat); ice.position.y = 1.2; ice.visible = false; root.add(ice);
  const label = document.createElement('div');
  label.className = 'actor-label ' + (team === 0 ? 'blue' : 'orange');
  labels.append(label);
  return { root, body, limbs, disc, bar, ice, label, hair, hairColor, mine: null, team };
}

/**
 * Her kare: konum, bakış, uzuvlar, disk ve etiket. hide: gövdesi çizilmeyecek oyuncu (birinci şahısta sen).
 */
export function syncActors(actors, w, time, playing, project, hide = -1) {
  for (const p of w.players) {
    const v = actors[p.id], mine = p.id === w.me;
    if (v.mine !== mine) { v.mine = mine; v.hair.material = mat(mine ? '#f4cf3c' : v.hairColor); }
    v.root.visible = !p.out && p.id !== hide;
    v.label.hidden = true;
    if (!v.root.visible) continue;
    v.root.position.set(p.x, p.y, p.z);
    v.root.rotation.y = p.yaw;
    const speed = Math.hypot(p.vx, p.vz), swing = p.ground ? Math.min(speed / 7, 1) * 0.7 : 0;
    const air = !p.ground && p.knock <= 0;
    v.limbs.forEach((l, i) => {
      l.rotation.x = air ? (i < 2 ? (i === 0 ? -0.5 : 0.6) : Math.sin(time * 9 + i) * 0.6 - 0.8) : Math.sin(time * 14 + i * Math.PI) * swing;
    });
    // Sağ kol nişanda: bakış eğimine göre kalkar; şarjda disk büyür ve parlar.
    const arm = v.limbs[3];
    if (p.charge > 0 || (p.ground && speed < 0.5)) arm.rotation.x = -1.2 - p.pitch * 0.6;
    if (p.barCd > 0.5) v.limbs[2].rotation.x = -2.2 + (0.8 - p.barCd) * 4; // levye savruluşu
    v.body.rotation.x = p.knock > 0 ? -(1 - p.knock / DISC.knockTime) * 1.4 : 0;
    v.body.rotation.z = p.freeze > 0 ? Math.sin(time * 30) * 0.03 : 0;
    v.ice.visible = p.freeze > 0;
    v.disc.visible = p.discs > 0;
    const k = 1 + (p.charge / DISC.heavyCharge) * 0.9;
    v.disc.scale.set(k, 1, k);
    v.disc.material.emissiveIntensity = 0.6 + (p.charge / DISC.heavyCharge) * 2.4;
    v.disc.material.emissive.set(p.charge >= DISC.heavyCharge - 0.01 ? '#ff9a50' : p.power === 'freeze' ? '#8ff3ff' : p.power === 'triple' ? '#ffd35c' : TEAMS.colors[p.team]);
    const text = p.freeze > 0 ? 'DONDU' : !mine && (w.online ? p.human : false) ? p.name : mine ? '' : '';
    v.label.textContent = text;
    const s = project(p.x, p.y + 2.6, p.z);
    v.label.hidden = !playing || !text || s.behind;
    v.label.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
  }
}
