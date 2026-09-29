import { createTouch } from './touch.js';

/**
 * Klavye ve fare (yalnızca tarayıcı). WASD / oklar hareket, fare kilitliyken bakış; sol tık disk (basılı tutunca
 * keskin disk şarjı, bırakınca atış), sağ tık ya da F levye, Boşluk zıplama; V kamera, F1 yardım, Esc mola. Basışlar
 * (tap, release, secondary, jump) bir sonraki okumada bir kez tüketilir. Kilit yokken sahaya tıklamak önce fareyi
 * kilitler; test kipinde (başsız tarayıcı kilit vermez) tıklama doğrudan işler.
 * Dokunmatik kipte (`touch` kök öğesi verilince, bkz. touch.js) fare kilidi yoktur: joystick hareket, sağ yarı bakış,
 * düğmeler fare ve klavyeyle aynı basışları üretir.
 */
export function createInput(canvas, { playing, onHelp, onPause, onLook, onUnlock, onBlur, onCamera, testMode, touch }) {
  const keys = new Set();
  let edges = {}, held = false;
  const pad = touch ? createTouch(touch, {
    down(name) {
      if (!playing()) return;
      if (name === 'shoot') { held = true; edges.tap = true; }
      else if (name === 'bar') edges.secondary = true;
      else edges[name] = true;
    },
    up(name) { if (name === 'shoot' && held) { held = false; edges.release = true; } },
    look: (dx, dy) => { if (playing()) onLook(dx, dy); },
  }) : null;

  const locked = () => document.pointerLockElement === canvas;
  const lock = () => { if (pad) return; try { canvas.requestPointerLock()?.catch(() => {}); } catch { /* desteklenmiyor */ } };
  const unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  const clear = () => { pad?.clear(); keys.clear(); edges = {}; held = false; };

  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'F1') { onHelp(); return; }
    if (e.code === 'KeyV' && playing()) { onCamera(); return; }
    if (e.code === 'Escape') { onPause(); return; }
    if (!playing()) return;
    keys.add(e.code);
    if (e.code === 'Space') edges.jump = true;
    if (e.code === 'KeyF') edges.secondary = true;
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });
  document.addEventListener('pointerlockchange', () => { if (!locked()) onUnlock(); });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousemove', e => { if (playing() && locked()) onLook(e.movementX, e.movementY); });
  canvas.addEventListener('mousedown', e => {
    if (!playing()) return;
    if (!locked() && !testMode && !pad) { lock(); return; }
    if (e.button === 0) { held = true; edges.tap = true; }
    if (e.button === 2) edges.secondary = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0 && held) { held = false; edges.release = true; } });

  /** Ekran yönlü hareket ekseni (x sağ, z geri): klavye, yoksa joystick (analog). */
  function axes() {
    const on = (...codes) => codes.some(c => keys.has(c));
    const x = Number(on('KeyD', 'ArrowRight')) - Number(on('KeyA', 'ArrowLeft'));
    const z = Number(on('KeyS', 'ArrowDown')) - Number(on('KeyW', 'ArrowUp'));
    if (x || z || !pad) return [x, z];
    const s = pad.axis();
    return [s.x, s.z];
  }

  return {
    lock, unlock, clear,
    touch: !!pad,
    sync(w, visible) { pad?.sync(w, visible); },
    held: () => held,
    /** Bakış yönlü hareket (dünya uzayında); basışları tüketmez. */
    move(view) { return view.movement(...axes()); },
    /** Bu adımın girdisi: bakış yönlü hareket, bakış açıları, sol tık durumu ve birikmiş basışlar. */
    read(view) {
      const move = view.movement(...axes());
      // Shift (ya da joystick sonuna kadar itili) hızlı koşu.
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || (pad ? Math.hypot(pad.axis().x, pad.axis().z) > 0.97 : false);
      const cmd = { ...move, yaw: view.yaw, pitch: view.pitch, hold: held, sprint, ...edges };
      edges = {};
      return cmd;
    },
  };
}
