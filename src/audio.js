/**
 * Kısa sentez sesler (dosya yok): disk, isabet, levye, zıplama, zıplama plakası, düşüş, titreme, çökme, güç diski.
 * Tarayıcı ilk kullanıcı hareketinden önce ses açtırmaz; bağlam ilk seste kurulur, hata olursa sessiz kalır.
 */
const TONES = {
  throw: [520, 240],
  hit: [300, 90],
  swing: [200, 640],
  jump: [300, 520],
  pad: [380, 980],
  padOff: [220, 70],
  fall: [520, 50],
  tremble: [90, 70],
  collapse: [70, 28],
  shrinkWarn: [130, 90],
  pickup: [700, 1300],
  bounce: [900, 620],
  roundEnd: [500, 840],
  go: [600, 920],
  end: [400, 1000],
};

export function createAudio() {
  let context = null, enabled = true;
  return {
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; return enabled; },
    play(type) {
      const tone = TONES[type];
      if (!enabled || !tone) return;
      try {
        context ??= new AudioContext();
        context.resume();
        const o = context.createOscillator(), g = context.createGain(), t = context.currentTime;
        const long = type === 'collapse' || type === 'tremble' || type === 'roundEnd' || type === 'end';
        o.type = type === 'collapse' || type === 'tremble' ? 'sawtooth' : 'sine';
        o.frequency.setValueAtTime(tone[0], t);
        o.frequency.exponentialRampToValueAtTime(tone[1], t + (long ? 0.6 : 0.18));
        g.gain.setValueAtTime(long ? 0.06 : 0.045, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + (long ? 0.8 : 0.23));
        o.connect(g); g.connect(context.destination);
        o.start(); o.stop(t + (long ? 0.85 : 0.24));
      } catch { /* ses yok */ }
    },
  };
}
