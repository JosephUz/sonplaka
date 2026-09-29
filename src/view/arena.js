import * as T from 'three';
import { ARENA, PICKUP } from '../config.js';
import { mat } from './builders.js';

/**
 * Arena görünümü: boşlukta asılı yuvarlak plakalar (kalın silindir, üstünde parlayan çerçeve), kolonlar, zıplama
 * plakaları (yeşil: açık, kırmızı: kapalı, gri: hedefi düşmüş; hedefi gösteren ok), güç diskleri (dönen, yükselip
 * alçalan), altta yıldızlar ve derin bir boşluk, disk sınırı için ince halka. Simülasyon durumunu her kare okur:
 * titreyen plaka sarsılır, düşen plaka iner, yok olan gizlenir, merkez küçülür.
 */
const PLATE_TOP = ['#5b6f86', '#4d6a66', '#5f5a68'];
const PLATE_SIDE = ['#242c3a', '#22302e', '#2c2833'];
const PICK_COLORS = { triple: '#ffd35c', freeze: '#8ff3ff' };
const PAD_COLORS = { ok: '#5f9fd0', off: '#3a3f4c', dead: '#2b2f3a' };

export function buildArenaView(scene, arena) {
  const plates = arena.plates.map(pl => {
    const group = new T.Group(); group.position.set(pl.x, 0, pl.z); scene.add(group);
    const body = new T.Group(); group.add(body);
    // Alt yüz açık renkli ve altta da parlayan çerçeve: düşerken yukarıda uzaklaşan plakalar görünsün.
    const top = new T.Mesh(new T.CylinderGeometry(pl.r, pl.r * 0.92, 1.6, 56), [mat(PLATE_SIDE[pl.ring]), mat(PLATE_TOP[pl.ring]), mat(PLATE_TOP[pl.ring])]);
    top.position.y = -0.8; top.receiveShadow = true; top.castShadow = true; body.add(top);
    const rimMat = new T.MeshStandardMaterial({ color: '#7fe0e8', emissive: '#4fc7d3', emissiveIntensity: 1.2, roughness: 0.4 });
    for (const y of [0.04, -1.62]) {
      const rim = new T.Mesh(new T.TorusGeometry((y > 0 ? pl.r : pl.r * 0.92) - 0.05, 0.11, 8, 72), rimMat);
      rim.rotation.x = Math.PI / 2; rim.position.y = y; body.add(rim);
    }
    const under = new T.Mesh(new T.CircleGeometry(pl.r * 0.9, 48), new T.MeshBasicMaterial({ color: '#3fbfd8', transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
    under.rotation.x = Math.PI / 2; under.position.y = -1.63; body.add(under);
    // Zemin deseni: iç halka çizgileri.
    for (const k of [0.66, 0.33]) {
      const ring = new T.Mesh(new T.RingGeometry(pl.r * k - 0.05, pl.r * k, 64), new T.MeshBasicMaterial({ color: '#8fa4bd', transparent: true, opacity: 0.18, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; body.add(ring);
    }
    for (const c of pl.pillars) {
      const pillar = new T.Mesh(new T.CylinderGeometry(ARENA.pillarR, ARENA.pillarR * 1.15, ARENA.pillarH, 14), mat('#7c8797'));
      pillar.position.set(c.x - pl.x, ARENA.pillarH / 2, c.z - pl.z); pillar.castShadow = true; pillar.receiveShadow = true; group.add(pillar);
      const cap = new T.Mesh(new T.CylinderGeometry(ARENA.pillarR * 1.2, ARENA.pillarR * 1.2, 0.2, 14), new T.MeshStandardMaterial({ color: '#f5c26b', emissive: '#c48a2a', emissiveIntensity: 0.8 }));
      cap.position.set(c.x - pl.x, ARENA.pillarH + 0.1, c.z - pl.z); group.add(cap);
    }
    return { group, body, r0: pl.r };
  });

  // Rampa: plaka kenarında hedefe doğru yükselen kama; üstünde hedefi gösteren ok. Kama şekli (uzunluk, yükseklik)
  // düzleminde çizilip genişlik boyunca çıkarılır; yerel +X hedef yönüne döndürülür.
  const wedge = new T.Shape();
  wedge.moveTo(-1.5, 0); wedge.lineTo(1.3, 0); wedge.lineTo(1.3, 0.7); wedge.lineTo(-1.5, 0.03); wedge.closePath();
  const rampGeo = new T.ExtrudeGeometry(wedge, { depth: 2.2, bevelEnabled: false });
  rampGeo.translate(0, 0, -1.1);
  const pads = arena.pads.map(q => {
    const plate = plates[q.plate], material = new T.MeshStandardMaterial({ color: PAD_COLORS.ok, emissive: PAD_COLORS.ok, emissiveIntensity: 0.25, roughness: 0.6 });
    const mesh = new T.Mesh(rampGeo, material);
    mesh.position.set(q.x - arena.plates[q.plate].x, 0, q.z - arena.plates[q.plate].z); mesh.rotation.y = q.dir - Math.PI / 2;
    mesh.castShadow = true; mesh.receiveShadow = true; plate.group.add(mesh);
    const arrow = new T.Mesh(new T.ConeGeometry(0.3, 0.8, 3), new T.MeshBasicMaterial({ color: '#dff3ff', transparent: true, opacity: 0.75 }));
    arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 1.05, 0.5);
    const pivot = new T.Group(); pivot.position.copy(mesh.position); pivot.rotation.y = q.dir; pivot.add(arrow); plate.group.add(pivot);
    return { mesh, material, pivot, state: 'ok' };
  });

  const pickups = arena.pickups.map(spot => {
    const group = new T.Group(); group.position.set(spot.x, 1.2, spot.z); scene.add(group);
    const material = new T.MeshStandardMaterial({ color: PICK_COLORS.triple, emissive: PICK_COLORS.triple, emissiveIntensity: 0.9, roughness: 0.3 });
    const gem = new T.Mesh(new T.OctahedronGeometry(0.55), material); gem.castShadow = true; group.add(gem);
    const halo = new T.Mesh(new T.TorusGeometry(0.85, 0.05, 6, 40), material); halo.rotation.x = Math.PI / 2; group.add(halo);
    const base = new T.Mesh(new T.RingGeometry(0.9, 1.2, 40), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide }));
    base.rotation.x = -Math.PI / 2; base.position.y = -1.15; group.add(base);
    return { group, material, gem, halo, kind: 'triple' };
  });

  // Boşluk: yıldızlar, altta derin bir zemin halkası ve merkezde soluk bir çekirdek ışığı; disk sınırı ince halka.
  const starGeo = new T.BufferGeometry(), starPos = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 160, y = -120 + Math.random() * 150;
    starPos.push(Math.sin(a) * r, y, Math.cos(a) * r);
  }
  starGeo.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
  scene.add(new T.Points(starGeo, new T.PointsMaterial({ color: '#c9d8ff', size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.8 })));
  const abyss = new T.Mesh(new T.RingGeometry(20, 140, 64), new T.MeshBasicMaterial({ color: '#141b2c', side: T.DoubleSide, transparent: true, opacity: 0.9 }));
  abyss.rotation.x = -Math.PI / 2; abyss.position.y = -75; scene.add(abyss);
  const core = new T.Mesh(new T.CircleGeometry(16, 48), new T.MeshBasicMaterial({ color: '#2d6f8f', transparent: true, opacity: 0.55 }));
  core.rotation.x = -Math.PI / 2; core.position.y = -74; scene.add(core);
  const bound = new T.Mesh(new T.TorusGeometry(ARENA.bound, 0.08, 6, 120), new T.MeshBasicMaterial({ color: '#7fe0e8', transparent: true, opacity: 0.25 }));
  bound.rotation.x = Math.PI / 2; bound.position.y = 1.2; scene.add(bound);

  return {
    /** Her kare: plaka durumu, zıplama plakası rengi, güç diski. */
    update(w, time) {
      w.plates.forEach((s, i) => {
        const v = plates[i];
        v.group.visible = s.phase < 3;
        if (!v.group.visible) return;
        const jitter = s.phase === 1 ? Math.sin(time * 41 + i) * 0.07 : 0;
        v.group.position.y = s.y + jitter;
        v.group.position.x = w.arena.plates[i].x + (s.phase === 1 ? Math.sin(time * 37 + i * 2) * 0.05 : 0);
        const k = s.r / v.r0;
        v.body.scale.set(k, 1, k);
      });
      w.pads.forEach((s, i) => {
        const q = w.arena.pads[i], v = pads[i], plate = w.plates[q.plate];
        const state = plate.phase >= 2 ? 'dead' : w.plates[q.to].phase >= 2 ? 'dead' : s.off > 0 ? 'off' : 'ok';
        if (state !== v.state) { v.state = state; v.material.color.set(PAD_COLORS[state]); v.material.emissive.set(PAD_COLORS[state]); }
        // Sakin: yanıp sönme yok; açık plaka hafif parlar, kapalı ve ölü plaka sönük.
        v.material.emissiveIntensity = state === 'ok' ? 0.25 : 0.03;
        v.pivot.visible = state === 'ok';
        v.pivot.position.y = Math.sin(time * 3 + i) * 0.08; // ok hafifçe süzülür
      });
      w.pickups.forEach((s, i) => {
        const v = pickups[i], spot = w.arena.pickups[i];
        v.group.visible = s.active && w.plates[spot.plate].phase < 2;
        if (!v.group.visible) return;
        if (v.kind !== s.kind) { v.kind = s.kind; v.material.color.set(PICK_COLORS[s.kind]); v.material.emissive.set(PICK_COLORS[s.kind]); }
        v.group.position.y = w.plates[spot.plate].y + 1.2 + Math.sin(time * 2.2 + i) * 0.18;
        v.gem.rotation.y = time * 1.8; v.gem.rotation.x = Math.sin(time * 1.3) * 0.4; v.halo.rotation.z = time * 0.7;
      });
    },
    kinds: PICKUP.kinds,
  };
}
