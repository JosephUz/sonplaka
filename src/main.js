import { createAudio } from './audio.js';
import { CAMERA, DISC, PICKUP, TEAMS } from './config.js';
import { createInput } from './input.js';
import { createLobby } from './lobby.js';
import { createNetClient } from './net/client.js';
import { onlineEnabled, serverHttp } from './platform.js';
import { enterFullscreen, touchDevice } from './touch.js';
import { createUI } from './ui.js';
import { createView } from './view/view.js';
import { alive, createWorld, step } from './world.js';

/**
 * İstemci uygulaması: dünya, görünüm, girdi, arayüz ve ekran akışı (giriş → maç ↔ mola / yardım → maç sonu).
 * Her kare: sabit 1/60 sn adımlarla simülasyon (girdi her adımda okunur; bakış açıları kameradan gelir) → olaylar
 * (efekt, ses, mesaj, sarsıntı) → çizim. Kamera seni izler; elenince (doğuş kapalıyken) ayakta kalan takım arkadaşını
 * omuz üstünden izlersin. Doğunca bakış merkeze çevrilir. Fare kilidi düşerse (Esc) oyun molaya girer.
 *
 * **Çevrim içi** (webde, config.js → ONLINE; bkz. lobby.js, net/): maçı sunucu koşturur, bu sayfa girdiyi yollar ve
 * gelen durumu çizer (net/client.js). Çevrim içinde mola maçı durdurmaz.
 *
 * Dokunmatik kip (telefon, tablet; ?touch=1 ile masaüstünde de): joystick ve düğmeler (touch.js), omuz kamerası,
 * hafif görüntü, önemli anlarda titreşim.
 */
const STEP = 1 / 60, MAX_STEPS = 5;
const POWER_NAMES = { triple: 'ÜÇLÜ DİSK', freeze: 'DONDURUCU DİSK' };

export async function start(root) {
  const testMode = new URLSearchParams(location.search).has('test');
  const touch = touchDevice();
  root.classList.toggle('touch', touch);
  const view = createView(root.querySelector('#sp-view'), { mobile: touch });
  const camButton = root.querySelector('#sp-cam');
  const setCamera = mode => {
    view.setCamera(mode);
    camButton.innerHTML = (mode === 'fps' ? '🎥 Omuz' : '🎥 Birinci şahıs') + ' <kbd>V</kbd>';
    try { localStorage.setItem('sp.cam', mode); } catch { /* yok */ }
  };
  let savedCam = null, input = null;
  try { savedCam = localStorage.getItem('sp.cam'); } catch { /* yok */ }
  setCamera(touch ? (savedCam === 'fps' ? 'fps' : 'shoulder') : savedCam === 'shoulder' ? 'shoulder' : 'fps');
  const toggleCamera = () => setCamera(view.cameraMode === 'fps' ? 'shoulder' : 'fps');
  camButton.onclick = toggleCamera;
  const ui = createUI(root);
  const audio = createAudio();
  let online = false;
  let w = createWorld(), screen = 'home', started = false, acc = 0, uiClock = 0, helpReturn = 'home', pausedAt = 0, last = performance.now();
  view.setWorld(w);
  faceCenter();

  const active = () => started && !screen;
  input = createInput(view.canvas, {
    testMode,
    touch: touch && root,
    playing: active,
    onHelp: help,
    onCamera: () => toggleCamera(),
    onPause: pause,
    onLook: (dx, dy) => view.look(dx, dy),
    onUnlock: () => { if (active()) show('pause'); },
    onBlur: () => { if (active()) show('pause'); else input.clear(); },
  });

  function faceCenter() { const p = w.players[w.me]; view.face(p.yaw, 0); }
  function show(next) {
    screen = next;
    if (next === 'pause') pausedAt = performance.now();
    if (next) input.unlock();
    ui.show(next);
    input.clear();
    root.querySelector('#sp-restart').hidden = online;
    root.querySelector('#sp-pause-note').hidden = !online;
    root.querySelector('#sp-again').textContent = online ? 'LOBİYE DÖN' : 'BİR MAÇ DAHA';
    refresh();
  }
  function begin() {
    if (online) { showLobby(); return; }
    w = createWorld(1 + Math.floor(Math.random() * 1e6)); faceCenter();
    started = true; acc = 0;
    if (touch) enterFullscreen();
    show(null); input.lock();
  }
  function resume() { show(null); input.lock(); if (touch) enterFullscreen(); }
  function help() {
    if (screen === 'help') { closeHelp(); return; }
    helpReturn = screen; show('help');
  }
  function closeHelp() { show(helpReturn); if (active()) input.lock(); }
  function pause() {
    if (!started || screen === 'home' || screen === 'results' || screen === 'lobby') return;
    if (screen === 'help') { closeHelp(); return; }
    if (screen === 'pause') { if (performance.now() - pausedAt > 250) resume(); return; }
    show('pause');
  }
  function menu() {
    if (online) { leaveRoom(); return; }
    started = false; w = createWorld(); faceCenter(); show('home');
  }

  ui.button('start', () => { if (online) leaveRoom(); begin(); }); ui.button('restart', begin); ui.button('again', begin);
  ui.button('pause-open', pause); ui.button('resume', resume); ui.button('menu', menu);
  ui.button('help-open', help); ui.button('help-close', closeHelp);
  ui.button('sound', () => ui.setSound(audio.toggle()));

  // ---------- Çevrim içi ----------
  const net = onlineEnabled() ? createNetClient({
    onWelcome() {
      lobby.setServer(true);
      if (pending) { const go = pending; pending = null; go(); return; }
      const code = inviteCode || (!net.world && net.rememberedRoom());
      inviteCode = null;
      if (code && !net.lobby) net.join(code);
    },
    onLobby(msg) {
      online = true;
      if (screen === 'lobby') lobby.render(msg);
      else if (!started && screen !== 'results') showLobby(msg);
    },
    onError(msg) {
      lobby.status(msg);
      if (msg === 'Böyle bir oda yok' && screen !== 'lobby') net.leave();
    },
    onStart(msg, first) {
      if (!first) return;
      online = true;
      w = net.world; faceCenter();
      started = true; acc = 0;
      if (touch) enterFullscreen();
      show(null); input.lock();
    },
    onEvents(list) { w.events.push(...list); consume(); },
    onEnd(msg, world) {
      if (world) { w = world; ui.results(w); }
      started = false;
      show('results');
    },
    onOnline: n => lobby.setOnline(n),
    onDisconnect(was) {
      lobby.setServer(false);
      if (was && online && started) ui.message('BAĞLANTI KOPTU · YENİDEN BAĞLANIYOR', 3);
    },
  }) : null;
  let pending = null, inviteCode = null;
  const lobby = createLobby(root, {
    id: () => net?.id,
    create(nick) { withHello(nick, () => net.create()); },
    join(nick, code) { withHello(nick, () => net.join(code)); },
    seat: slot => net.seat(slot),
    move: (id, slot) => net.move(id, slot),
    start: () => net.start(),
    leave: leaveRoom,
  });
  function withHello(nick, go) { if (!net?.connected) return; pending = go; net.hello(nick); }
  function showLobby(msg = net?.lobby) {
    if (!msg) { show('home'); return; }
    online = true;
    lobby.render(msg);
    if (screen !== 'lobby') show('lobby');
  }
  function leaveRoom() {
    net?.leave();
    online = false; started = false; w = createWorld(); faceCenter();
    lobby.status('');
    show('home');
  }
  if (net) {
    inviteCode = lobby.urlCode();
    if (inviteCode) lobby.showJoin();
    net.connect(lobby.nick());
  }

  const who = p => (p.id === w.me ? 'SEN' : p.name.toUpperCase());
  /** Dolum halkası: sol tık basılıyken keskin disk şarjı. */
  function chargeState() {
    if (!active()) return null;
    const p = w.players[w.me];
    if (p.out || p.charge <= 0) return null;
    const full = p.charge >= DISC.sharpCharge - 0.01;
    return { p: p.charge / DISC.sharpCharge, full, text: full ? 'BIRAK: KESKİN DİSK' : 'BIRAK: DİSK · TUT: KESKİN' };
  }

  function consume() {
    const me = w.me;
    for (const e of w.events) {
      view.event(e);
      audio.play(e.type);
      if (touch) buzz(e, me);
      switch (e.type) {
        case 'go': ui.message('BAŞLA!', 1); break;
        case 'spawn': if (e.id === me) faceCenter(); break;
        case 'tremble': ui.warn(e.ring === 2 ? 'DIŞ HALKA ÇÖKÜYOR · İÇERİ KAÇ' : 'İÇ HALKA ÇÖKÜYOR · MERKEZE KAÇ', 5); break;
        case 'collapse': ui.message(e.ring === 2 ? 'DIŞ HALKA DÜŞTÜ · DOĞUŞ KAPANDI' : e.ring === 1 ? 'İÇ HALKA DÜŞTÜ' : 'SON PLAKA DA GİTTİ', 2.5); view.shake(0.35); break;
        case 'shrinkWarn': ui.warn('MERKEZ DARALIYOR · KENARDAN UZAK DUR', 5); break;
        case 'hit':
          if (e.id === me) { view.shake(CAMERA.knockShake); if (e.kind === 'freeze') ui.message('DONDUN · 2 SN', 1.5); }
          break;
        case 'fall':
          if (e.id === me) {
            ui.message(e.cause === 'sharp' ? 'KESKİN DİSK · ELENDİN' : e.by !== null ? who(w.players[e.by]) + ' SENİ DÜŞÜRDÜ' : 'DÜŞTÜN', 2.5);
            // Düşüş sineması: kamera düştüğün yerde alçalırken yukarıdaki arenaya bakar.
            if (e.cause !== 'sharp') { fallCam = { x: e.x, y: e.y, z: e.z, t: 0, yaw: view.yaw, pitch: 0.7, id: -1 }; view.face(view.yaw, 0.7); }
          }
          else if (e.by === me) ui.message(who(w.players[e.id]) + ' DÜŞTÜ · SENİN SAYENDE', 2);
          break;
        case 'pickup': if (e.id === me) ui.message(POWER_NAMES[e.kind] + ' ×' + PICKUP.shots, 1.8); break;
        case 'roundEnd': ui.message(e.team === null ? 'RAUND BERABERE' : TEAMS.names[e.team] + ' RAUNDU ALDI · ' + e.wins[0] + ':' + e.wins[1], 3); break;
        case 'round': if (e.n > 1) ui.message('RAUND ' + e.n, 1.5); break;
        default: break;
      }
    }
    w.events.length = 0;
    if (!online && w.winner !== null && screen !== 'results') { show('results'); ui.results(w); }
  }

  const refresh = () => ui.hud(w, started && screen !== 'home' && screen !== 'lobby', screen);

  /**
   * İzlenen oyuncu: sen; düştüysen CAMERA.fallView saniye düştüğün yerde alçalan bakış (arena yukarıda uzaklaşır);
   * elenmişsen ayakta kalan takım arkadaşın (yoksa herhangi biri); kimse yoksa arena üstü.
   */
  const ghost = { x: 0, y: 8, z: 0, yaw: 0, pitch: -0.4, id: -1 };
  let fallCam = null;
  function followTarget(dt) {
    const me = w.players[w.me];
    if (!me.out) { fallCam = null; return { p: me, spectate: false }; }
    if (fallCam) {
      fallCam.t += dt; fallCam.y -= CAMERA.fallSink * dt;
      if (fallCam.t < CAMERA.fallView) return { p: fallCam, spectate: false };
      fallCam = null;
    }
    const mate = w.players.find(p => p.team === me.team && alive(p)) || w.players.find(p => alive(p));
    if (mate && me.respawn <= 0) return { p: mate, spectate: true };
    ghost.yaw = view.yaw; ghost.pitch = view.pitch;
    return { p: ghost, spectate: false };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    if (online && started) {
      const move = active() ? input.move(view) : null;
      net.input(active() ? input.read(view) : { x: 0, z: 0, yaw: view.yaw, pitch: view.pitch, hold: false }, dt);
      net.update(dt, move);
      const me = w.players[w.me];
      if (!me.out) { me.yaw = view.yaw; me.pitch = view.pitch; }
    } else if (active()) {
      acc += dt;
      for (let n = 0; acc >= STEP && n < MAX_STEPS; n++) {
        step(w, STEP, input.read(view));
        consume();
        acc -= STEP;
        if (screen) break;
      }
    } else acc = 0;
    ui.tick(dt, w, active());
    ui.charge(chargeState());
    input.sync(w, active());
    const target = followTarget(screen ? 0 : dt), playing = started && screen !== 'home' && screen !== 'lobby';
    const drawDt = online && started ? dt : screen ? 0 : dt;
    view.render(w, drawDt, playing, target.p, target.spectate);
    uiClock -= dt;
    if (uiClock <= 0) { uiClock = 0.08; refresh(); }
  }

  if (testMode) {
    window.__sonPlaka = {
      world: () => w, view: () => view, net: () => net, state: () => ({ screen, started, online }),
      step: n => { for (let i = 0; i < n; i++) step(w, STEP); consume(); refresh(); },
    };
  }
  const app = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.registerPlugin?.('App') : null;
  app?.addListener('backButton', () => {
    if (screen === 'help') closeHelp();
    else if (active() || screen === 'pause') pause();
    else if (screen === 'home') app.exitApp();
    else menu();
  });

  refresh();
  requestAnimationFrame(frame);
  if (!testMode && !net) heartbeat();
}

/** Dokunmatikte kısa titreşim: atış, isabet, düşme, çökme. */
const BUZZ = { throw: 12, hit: 40, fall: 70, collapse: [60, 40, 90], pad: 20 };
function buzz(e, me) {
  const ms = BUZZ[e.type];
  const mine = e.type === 'collapse' || e.id === me || e.by === me;
  if (ms && mine) try { navigator.vibrate?.(ms); } catch { /* desteklenmiyor */ }
}

/** Sunucuya "bu sekme açık" sinyali (çevrim içi sayısı için); çok oyunculusu kapalı platformda kullanılır. */
function heartbeat() {
  const id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const url = serverHttp() + '/presence?id=' + id;
  const beat = () => { if (!document.hidden) fetch(url, { method: 'POST', keepalive: true }).catch(() => {}); };
  beat();
  setInterval(beat, 20000);
  document.addEventListener('visibilitychange', beat);
  addEventListener('pagehide', () => navigator.sendBeacon?.(url + '&bye=1'));
}
