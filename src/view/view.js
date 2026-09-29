import * as T from 'three';
import { CAMERA, DISC, TEAMS, TOUCH } from '../config.js';
import { buildArenaView } from './arena.js';
import { createActor, disposeActor, syncActors } from './actors.js';
import { createCamera } from './camera.js';
import { createDiscs } from './discs.js';
import { createEffects } from './effects.js';

/**
 * Görünüm: three.js sahnesi, ışıklar, arena, on oyuncu, diskler ve efektler; kamera birinci şahıs ya da omuz üstü
 * (setCamera). Simülasyonu yalnızca okur: render her karede dünyayı çizer, event simülasyon olaylarından efekt çıkarır.
 * Birinci şahısta senin gövden çizilmez, ekranın sağ altında elindeki disk görünür (şarjda büyür ve kızarır).
 * mobile: telefonda piksel oranı ve gölge haritası küçülür.
 */
export function createView(container, { mobile = false } = {}) {
  const renderer = new T.WebGLRenderer({ antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? TOUCH.pixelRatio : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = mobile ? T.PCFShadowMap : T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Son Plaka arenası');
  container.insertBefore(renderer.domElement, container.firstChild);

  const scene = new T.Scene();
  scene.background = new T.Color('#0b0f1a');
  scene.fog = new T.Fog('#0b0f1a', 90, 230);
  scene.add(new T.HemisphereLight('#dfe9ff', '#1a2233', 1.9));
  const sun = new T.DirectionalLight('#fff0d8', 2.6);
  sun.position.set(-30, 70, 25); sun.castShadow = true;
  sun.shadow.mapSize.setScalar(mobile ? TOUCH.shadow : 2048); sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 220 });
  scene.add(sun);
  const glow = new T.PointLight('#3fbfd8', 60, 120, 1.6); glow.position.set(0, -20, 0); scene.add(glow);

  const cam = createCamera();
  let arena = null;
  const labels = container.querySelector('#sp-labels');
  let actors = [], actorKey = '';
  const discs = createDiscs(scene);
  const effects = createEffects(scene);
  // Birinci şahıs el diski: kameraya bağlı.
  const hand = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.016, 24), new T.MeshStandardMaterial({ color: '#39c2cf', emissive: '#39c2cf', emissiveIntensity: 0.7, roughness: 0.35 }));
  hand.position.set(0.38, -0.26, -0.9); hand.rotation.set(1.25, 0, 0.35); cam.camera.add(hand); scene.add(cam.camera);
  let time = 0;

  const resize = () => { renderer.setSize(innerWidth, innerHeight); cam.resize(innerWidth, innerHeight); };
  resize(); addEventListener('resize', resize);

  return {
    canvas: renderer.domElement,
    get camera() { return cam.camera; },
    get cameraMode() { return cam.mode; },
    get yaw() { return cam.yaw; },
    get pitch() { return cam.pitch; },
    /** 'fps' | 'shoulder' */
    setCamera: mode => { cam.setMode(mode); },
    /** Arena bir kez kurulur (dünya değişince yeniden kullanılır: geometri aynı); oyuncu görselleri kipe (oyuncu sayısı ve takımlar) göre kurulur. */
    setWorld(w) {
      if (!arena) arena = buildArenaView(scene, w.arena);
      const key = w.players.map(p => p.team).join(',');
      if (key !== actorKey) {
        for (const v of actors) disposeActor(scene, v);
        actors = w.players.map(p => createActor(scene, labels, p.id, p.team));
        actorKey = key;
      }
    },
    face: (yaw, pitch) => cam.face(yaw, pitch),
    look: (dx, dy) => cam.look(dx, dy),
    movement: (x, z) => cam.movement(x, z),
    project: (x, y, z) => cam.project(x, y, z),
    event: e => { effects.spawn(e); },
    shake: power => cam.shake(power),
    /**
     * Çizim: `follow` izlenen oyuncu (sen ya da elenince takım arkadaşın), `spectate` onun bakışına bağlan. Birinci
     * şahısta izlenen kendi gövden gizlidir ve el diski görünür.
     */
    render(w, dt, playing, follow, spectate) {
      time += dt;
      this.setWorld(w);
      const fps = cam.mode === 'fps' && !spectate;
      cam.follow(follow, dt, spectate);
      arena.update(w, time);
      syncActors(actors, w, time, playing, cam.project, fps ? follow.id : -1);
      discs.sync(w.discs, time);
      effects.update(dt);
      const me = w.players[w.me];
      // Hızlı koşuda görüş açısı hafif genişler.
      const fov = CAMERA.fov + (me.sprint && !me.out ? 7 : 0);
      if (Math.abs(cam.camera.fov - fov) > 0.05) { cam.camera.fov += (fov - cam.camera.fov) * Math.min(1, dt * 6); cam.camera.updateProjectionMatrix(); }
      hand.visible = fps && playing && !me.out && me.discs > 0;
      if (hand.visible) {
        const k = 1 + (me.charge / DISC.heavyCharge) * 0.6;
        hand.scale.set(k, 1, k);
        hand.rotation.y = time * (me.charge > 0 ? 9 : 1.5);
        hand.position.y = -0.26 + Math.sin(time * 2.2) * 0.008 + (me.throwCd > 0 ? -0.08 * me.throwCd / DISC.cooldown : 0);
        const color = me.charge >= DISC.heavyCharge - 0.01 ? '#ff9a50' : me.power === 'freeze' ? '#8ff3ff' : me.power === 'triple' ? '#ffd35c' : TEAMS.colors[me.team];
        hand.material.color.set(color); hand.material.emissive.set(color);
        hand.material.emissiveIntensity = 0.7 + (me.charge / DISC.heavyCharge) * 2;
      }
      renderer.render(scene, cam.camera);
    },
    fov: CAMERA.fov,
  };
}
