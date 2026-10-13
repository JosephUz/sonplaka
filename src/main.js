import { createAudio } from './audio.js';
import { CAMERA, DIFFICULTIES, DIFFICULTY_LABEL, DISC, MATCH, MODES, PICKUP, TEAMS, modeLabel, playersFor } from './config.js';
import { createGosteri, gosteriAcik } from './gosteri.js';
import { createIboGosteri, iboGosteriAcik } from './gosteri-ibo.js';
import { createOtopilot, otopilotAcik } from './otopilot.js';
import { gorunurAlanaKilitle } from './gorunur-alan.js';
import { createInput } from './input.js';
import { createLobby } from './lobby.js';
import { createMuzik, sahneSec } from './muzik.js';
import { createNetClient } from './net/client.js';
import { onlineEnabled, serverHttp } from './platform.js';
import { enterFullscreen, touchDevice } from './touch.js';
import { createUI } from './ui.js';
import { createView } from './view/view.js';
import { alive, createWorld, step } from './world.js';

/**
 * İstemci uygulaması: dünya, görünüm, girdi, arayüz ve ekran akışı (giriş → maç ↔ mola / yardım → maç sonu). Kip
 * (herkes tek, 2v2 … 5v5) giriş ekranında seçilir ve hatırlanır; tek başına maç ve oda kurma bu seçimle başlar.
 * Her kare: sabit 1/60 sn adımlarla simülasyon (girdi her adımda okunur; bakış açıları kameradan gelir) → olaylar
 * (efekt, ses, mesaj, sarsıntı) → çizim. Kamera seni izler; düşünce düşüşünü, sonra doğana kadar takım arkadaşını
 * omuz üstünden izlersin (son plakada elenince maç bitene kadar). Doğunca bakış merkeze çevrilir. Fare kilidi
 * düşerse (Esc) oyun molaya girer.
 *
 * **Çevrim içi** (webde, config.js → ONLINE; bkz. lobby.js, net/): maçı sunucu koşturur, bu sayfa girdiyi yollar ve
 * gelen durumu çizer (net/client.js). Çevrim içinde mola maçı durdurmaz.
 *
 * Dokunmatik kip (telefon, tablet; ?touch=1 ile masaüstünde de): joystick ve düğmeler (touch.js), omuz kamerası,
 * hafif görüntü, önemli anlarda titreşim.
 *
 * **Gösteri kipi** (yalnız web, `?gosteri=1`; bkz. gosteri.js): içerik klipleri için on botun kendi kendine oynadığı
 * maç. Menü ve lobi atlanır, arayüz gizlenir, girdi ve sunucu yoktur; kamera kavgayı izler, maç bitince yenisi başlar.
 */
const STEP = 1 / 60, MAX_STEPS = 5;
const POWER_NAMES = { triple: 'ÜÇLÜ DİSK', freeze: 'DONDURUCU DİSK' };

export async function start(root) {
  const testMode = new URLSearchParams(location.search).has('test');
  const touch = touchDevice();
  root.classList.toggle('touch', touch);
  // Telefonda oyun kökünü tarayıcının gerçekten görünen alanına kilitler: üst çubuk ve oda kodu adres çubuğunun
  // altında kalmaz (bkz. src/gorunur-alan.js, style.css → `html.vv`).
  gorunurAlanaKilitle(window);
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
  // Kip: giriş ekranındaki seçim (hatırlanır); tek başına maç ve oda kurma buna göre.
  const modeInputs = [...root.querySelectorAll('input[name="sp-mode"]')], diffInputs = [...root.querySelectorAll('input[name="sp-diff"]')];
  const modeChoice = () => Number(modeInputs.find(i => i.checked)?.value) || MATCH.teamSize;
  const diffChoice = () => diffInputs.find(i => i.checked)?.value || MATCH.difficulty;
  const settingsChoice = () => ({ teamSize: modeChoice(), difficulty: diffChoice() });
  const homeMeta = () => {
    const n = modeChoice(), bots = String(playersFor(n) - 1).padStart(2, '0');
    root.querySelector('#sp-home-meta-1').textContent = `${n === 1 ? 'HERKES HERKESE' : modeLabel(n)} · SEN + ${bots} BOT · BOT ${DIFFICULTY_LABEL[diffChoice()]}`;
  };
  const setMode = n => { for (const i of modeInputs) i.checked = Number(i.value) === n; homeMeta(); try { localStorage.setItem('sp.mode', String(n)); } catch { /* yok */ } };
  const setDiff = d => { for (const i of diffInputs) i.checked = i.value === d; homeMeta(); try { localStorage.setItem('sp.diff', d); } catch { /* yok */ } };
  let savedMode = MATCH.teamSize, savedDiff = MATCH.difficulty;
  try { savedMode = Number(localStorage.getItem('sp.mode')) || MATCH.teamSize; savedDiff = localStorage.getItem('sp.diff') || MATCH.difficulty; } catch { /* yok */ }
  setMode(MODES.includes(savedMode) ? savedMode : MATCH.teamSize);
  setDiff(DIFFICULTIES.includes(savedDiff) ? savedDiff : MATCH.difficulty);
  for (const i of modeInputs) i.onchange = () => setMode(Number(i.value));
  for (const i of diffInputs) i.onchange = () => setDiff(i.value);
  let online = false;
  /**
   * Gösteri kipleri (yalnız web, arayüz ve girdi yok):
   *  - `?gosteri=ibo` (bkz. gosteri-ibo.js): komik short için sahnelenmiş tek düşüş, serbest kamera, altyazılı.
   *  - `?gosteri=1` ve kalanı (bkz. gosteri.js): botların kendi kendine oynadığı maç.
   * İkisi de aynı perdeleri gizler ve aynı yolu kullanır; `sahne` hangisi açıksa odur.
   */
  const ibo = iboGosteriAcik() ? createIboGosteri({ view, root }) : null;
  const gosteri = !ibo && gosteriAcik() ? createGosteri({ view }) : null;
  const sahne = ibo || gosteri;
  /**
   * Otopilot (?otopilot=1, bkz. otopilot.js): gösteri değil **gerçek maç**; senin oyuncunu da bot oynar, kamera ve
   * arayüz normal oyundaki gibi kalır. Gösteriyle birlikte açılmaz (gösteri önceliklidir).
   */
  const otopilot = sahne || !otopilotAcik() ? null : createOtopilot();
  let w = createWorld(), screen = 'home', started = false, acc = 0, uiClock = 0, helpReturn = 'home', pausedAt = 0, last = performance.now();
  view.setWorld(w);
  faceCenter();

  const active = () => started && !screen && !sahne;
  input = createInput(view.canvas, {
    testMode,
    touch: touch && root,
    playing: () => !otopilot && active(),
    onHelp: help,
    onCamera: () => toggleCamera(),
    onPause: pause,
    onLook: (dx, dy) => view.look(dx, dy),
    onUnlock: () => { if (!otopilot && active()) show('pause'); },
    onBlur: () => { if (otopilot) return; if (active()) show('pause'); else input.clear(); },
  });

  function faceCenter() { const p = w.players[w.me]; view.face(p.yaw, 0); }
  function show(next) {
    screen = next;
    if (next === 'pause') pausedAt = performance.now();
    if (next) input.unlock();
    ui.show(next);
    input.clear();
    // Çevrim içinde mola yalnız bir perdedir: yeniden başlatma yok, çıkış odadan çıkar (standart menüdeki ad da değişir).
    root.querySelector('#sp-restart').hidden = online;
    root.querySelector('#sp-menu').textContent = online ? 'Odadan çık' : 'Ana menü';
    root.querySelector('#sp-pause-note').hidden = !online;
    root.querySelector('#sp-again').textContent = online ? 'LOBİYE DÖN' : 'BİR MAÇ DAHA';
    refresh();
  }
  function begin() {
    if (online) { showLobby(); return; }
    w = createWorld(1 + Math.floor(Math.random() * 1e6), settingsChoice()); faceCenter();
    started = true; acc = 0;
    // Otopilot: senin koltuğun da bota verilir; tam ekran ve fare kilidi istenmez (bkz. otopilot.js).
    if (otopilot) { otopilot.kur(w); show(null); return; }
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
  const toggleSound = () => ui.setSound(audio.toggle());
  ui.button('sound', toggleSound); ui.button('pause-sound', toggleSound);
  ui.setSound(audio.enabled);
  // Üst çubuktaki ve mola menüsündeki "Kontroller F1" aynı perdeyi açar (standart araç çubuğu).
  ui.button('pause-help', help);
  /**
   * Oyun içi müzik (bkz. muzik.js): efekt sesinden bağımsız açılıp kapanır, ayarı tarayıcıda kalır. Açma / kapama
   * düğmesi hem üst çubukta hem mola menüsündedir; ikisi de aynı durumu gösterir. Ses düzeyi sabit (sürgü yok).
   * Gösteri kiplerinde müzik hiç kurulmaz (`muzik.kapali`), o zaman düğmeler gizlenir.
   */
  const muzik = createMuzik(root);
  const muzikYaz = () => ui.setMuzik(muzik.acik);
  // Düğmeler gösteri kipinde ve **çalınacak parça yokken** (`muzik.parcaVar`, bkz. muzik.js SAHNELER) gizlenir.
  // 4 Ekim 2026: müzik şimdilik kaldırıldı, düğmeler gizli; parça eklenince kendiliğinden geri gelirler.
  // Otomatik tarayıcıda (`muzik.kapali`) parça varsa dururlar: standart çubuk aynı görünür, ayar yine saklanır.
  ui.setMuzikVar(!sahne && muzik.parcaVar);
  const toggleMuzik = () => { muzik.ac(); muzikYaz(); };
  ui.button('muzik', toggleMuzik); ui.button('pause-muzik', toggleMuzik);
  muzikYaz();

  // ---------- Çevrim içi ----------
  const net = onlineEnabled() && !sahne && !otopilot ? createNetClient({
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
    settingsChoice,
    create(nick, settings) { withHello(nick, () => net.create(settings)); },
    join(nick, code) { withHello(nick, () => net.join(code)); },
    seat: slot => net.seat(slot),
    move: (id, slot) => net.move(id, slot),
    settings: s => net.settings(s),
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
  /** Dolum halkası: sol tık basılıyken ağır disk şarjı. */
  function chargeState() {
    if (!active()) return null;
    const p = w.players[w.me];
    if (p.out || p.charge <= 0) return null;
    const full = p.charge >= DISC.heavyCharge - 0.01;
    return { p: p.charge / DISC.heavyCharge, full, text: full ? 'BIRAK: AĞIR DİSK' : 'BIRAK: DİSK · TUT: AĞIR' };
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
        case 'collapse': ui.message(e.ring === 2 ? 'DIŞ HALKA DÜŞTÜ' : 'SON PLAKA · DOĞUŞ KAPANDI · SÜRE BİTİNCE BURADA KALAN KAZANIR', 3); view.shake(0.35); break;
        case 'shrinkWarn': ui.warn('MERKEZ DARALIYOR · KENARDAN UZAK DUR', 5); break;
        case 'hit':
          if (e.id === me) { view.shake(CAMERA.knockShake); if (e.kind === 'freeze') ui.message('DONDUN · 2 SN', 1.5); }
          break;
        case 'fall':
          if (e.id === me) {
            ui.message((e.by !== null ? who(w.players[e.by]) + ' SENİ DÜŞÜRDÜ' : 'DÜŞTÜN') + (e.lives === 0 ? ' · HAK BİTTİ' : e.respawn ? ` · ${e.lives} HAK` : ''), 2.5);
            // Düşüş sineması: kamera düştüğün yerde alçalırken yukarıdaki arenaya bakar.
            // Bakış arenanın merkezine, yukarı: plakalar tepede uzaklaşırken görünsün.
            {
              const yaw = Math.atan2(-e.x, -e.z), pitch = Math.min(1.1, Math.atan2(-e.y + 2, Math.hypot(e.x, e.z) || 1));
              fallCam = { x: e.x, y: e.y, z: e.z, t: 0, yaw, pitch, id: -1 }; view.face(yaw, pitch);
            }
          }
          else if (e.by === me) ui.message(who(w.players[e.id]) + ' DÜŞTÜ · SENİN SAYENDE', 2);
          break;
        case 'pickup': if (e.id === me) ui.message(POWER_NAMES[e.kind] + ' ×' + PICKUP.shots, 1.8); break;
        case 'end': ui.message(e.team == null ? 'BERABERE' : (e.why === 'last' ? 'SON PLAKADA KALAN: ' : 'SÜRE BİTTİ · SON PLAKADA KALAN: ') + TEAMS.names[e.team] + ' KAZANDI', 3); break;
        default: break;
      }
    }
    w.events.length = 0;
    // Otopilotta karne açılmaz: birkaç saniye sonra yeni maç kurulur (bkz. otopilot.guncelle).
    if (!otopilot && !online && w.winner !== null && screen !== 'results') { show('results'); ui.results(w); }
  }

  const refresh = () => ui.hud(w, started && screen !== 'home' && screen !== 'lobby', screen);

  /**
   * İzlenen oyuncu: sen; düştüysen CAMERA.fallView saniye düştüğün yerde alçalan bakış (arena yukarıda uzaklaşır);
   * elenmişsen ayakta kalan takım arkadaşın (yoksa herhangi biri); kimse yoksa arena üstü.
   */
  const ghost = { x: 0, y: 16, z: 34, yaw: Math.PI, pitch: -0.45, id: -1 };
  let fallCam = null, ghostOn = false;
  function followTarget(dt) {
    const me = w.players[w.me];
    if (!me.out) { fallCam = null; ghostOn = false; return { p: me, spectate: false }; }
    if (fallCam) {
      fallCam.t += dt; fallCam.y -= CAMERA.fallSink * dt;
      if (fallCam.t < CAMERA.fallView) return { p: fallCam, spectate: false };
      fallCam = null;
    }
    // Doğuşu beklerken (ya da ayakta plaka yokken) ayakta bir takım arkadaşı, yoksa kimse: arena üstünden bakış.
    const mate = w.players.find(p => p.team === me.team && p.id !== me.id && alive(p));
    if (mate) return { p: mate, spectate: true };
    // Hayalet bakış: ilk girişte arenayı yukarıdan karşıdan görür, sonra serbestçe bakılır.
    if (!ghostOn) { ghostOn = true; view.face(Math.PI, -0.45); }
    ghost.yaw = view.yaw; ghost.pitch = view.pitch;
    return { p: ghost, spectate: false };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    // Müzik sahnesi (bkz. muzik.js): maçta ana tema, son plaka evresinde (doğuş kapalı) gerilim, geri kalan her
    // yerde (giriş, lobi, mola, karne) sakin parça. Aynı sahne yeniden verilince hiçbir şey olmaz, bu yüzden her
    // kareden sorulur: ekran geçişlerini tek tek kancalamaya gerek kalmaz. Gösteride `muzik.kapali`: çağrı boşa düşer.
    muzik.sahne(sahneSec(started, screen, w, helpReturn));
    // Gösteri: girdi ve arayüz yok. `?gosteri=ibo` sahnelenmiş düşüşü serbest kamerayla oynatır (gosteri-ibo.js),
    // `?gosteri=1` botların maçını omuz üstünden izler (gosteri.js).
    if (ibo) { w = ibo.guncelle(dt); view.render(w, dt, false, ibo.odak(), false); return; }
    if (gosteri) { w = gosteri.guncelle(dt); view.render(w, dt, true, gosteri.odak(dt), false); return; }
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
      // Otopilot: kameranın bakışını fare yerine botun nişanı verir, maç bitince yenisi kurulur (bkz. otopilot.js).
      if (otopilot) { otopilot.bakis(w, view); otopilot.guncelle(dt, w, begin); }
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

  if (sahne) {
    // Menü ve lobi atlanır, arayüz gizlenir (bkz. style.css `.gosteri`), sahne hemen başlar. Kamera doğrudan
    // görünüme verilir: `setCamera` tercihi `localStorage`'a (`sp.cam`) yazar; gösteri kipleri oyuncunun kendi
    // kamera tercihine dokunmamalı (aynı tarayıcıda normal oyun eskisi gibi açılsın).
    root.classList.add('gosteri');
    view.setCamera(ibo ? 'fps' : 'shoulder');
    screen = null; started = true; ui.show(null);
    const ad = root.querySelector('#sp-gosteri'); if (ad) ad.hidden = false;
    w = sahne.basla();
    window.__sonPlaka = { world: () => w, view: () => view, net: () => null, gosteri: () => sahne, muzik: () => muzik.durum(), state: () => ({ screen, started, online }) };
    // Çekim betiği (ajanlar/icerik/short-uret.mjs) sahnenin saniyesini ve kabul ölçütlerini buradan okur;
    // `olcum()` her karede yerinde güncellenen tek nesnedir.
    if (ibo) window.__gosteri = ibo.olcum();
  }
  // Otopilot: menü ve lobi atlanır, kamera omuz üstüne alınır, maç hemen başlar. Arayüz **gizlenmez** (bu bir
  // gösteri değil, oynanan maç); yalnız tuşlara basan sen değilsin (bkz. otopilot.js).
  if (otopilot) { view.setCamera('shoulder'); begin(); }
  if (testMode || otopilot) {
    window.__sonPlaka = {
      world: () => w, view: () => view, net: () => net, state: () => ({ screen, started, online }),
      muzik: () => muzik.durum(),
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
  if (!testMode && !net && !sahne && !otopilot) heartbeat();
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
