import { DISC, ROUND, TEAMS } from './config.js';
import { aliveCount } from './world.js';

/**
 * Arayüz (DOM): ekranlar (giriş, yardım, mola, maç sonu, lobi), skor tabelası (raund ışıkları, ayakta olan sayısı,
 * raund saati ve sıradaki evre), sol alttaki oyuncu kartı (disk çubukları, güç), nişangah çevresinde keskin disk dolum
 * halkası, ortadaki mesaj, çökme uyarı şeridi, düşme ve donma perdeleri. Simülasyonu yalnızca okur.
 */
const SCREENS = ['home', 'help', 'pause', 'results', 'lobby'];
const STATS = ['kills', 'falls', 'hits', 'throws', 'pickups', 'pads'];
const POWER = { triple: 'ÜÇLÜ DİSK', freeze: 'DONDURUCU' };

export function createUI(root) {
  const $ = id => root.querySelector('#sp-' + id);
  const el = {
    screens: Object.fromEntries(SCREENS.map(s => [s, $(s)])),
    playing: ['scoreboard', 'controls', 'player', 'pause-open'].map($),
    wins: [$('blue-wins'), $('orange-wins')], alive: [$('blue-alive'), $('orange-alive')], timer: $('timer'), phase: $('phase'),
    side: $('side'), status: $('status'), discText: $('disc-text'), discs: $('discs'), power: $('power'),
    down: $('down'), downTitle: $('down-title'), downCount: $('down-count'), downNote: $('down-note'), freeze: $('freeze'),
    crosshair: $('crosshair'), message: $('message'), warn: $('warn'),
    charge: $('charge'), chargeText: $('charge-text'),
    site: $('site'), resultTitle: $('result-title'), finalScore: $('final-score'), stats: $('stats'), sound: $('sound'), pauseSound: $('pause-sound'),
  };
  for (const node of el.wins) node.innerHTML = '<i></i>'.repeat(ROUND.wins);
  el.discs.innerHTML = '<i></i>'.repeat(DISC.max);
  let messageTime = 0, warnTime = 0;

  return {
    button: (id, fn) => { $(id).onclick = fn; },
    show(screen) { for (const s of SCREENS) el.screens[s].hidden = screen !== s; },
    /** Ses düğmeleri (üst çubuk ve mola menüsü) aynı durumu gösterir. */
    setSound(on) {
      el.sound.textContent = on ? 'Ses açık' : 'Ses kapalı'; el.sound.classList.toggle('muted', !on);
      el.pauseSound.textContent = on ? 'Ses: açık' : 'Ses: kapalı'; el.pauseSound.classList.toggle('muted', !on);
    },
    message(text, time = 2) { el.message.textContent = text; el.message.hidden = false; messageTime = time; },
    /** Kırmızı uyarı şeridi (plaka çöküyor); süre boyunca kalır. */
    warn(text, time = 5) { el.warn.textContent = text; el.warn.hidden = false; warnTime = time; },

    /** Mesaj ve uyarı süreleri; raund geri sayımında "HAZIR OL". */
    tick(dt, w, active) {
      if (messageTime > 0 && active) { messageTime -= dt; if (messageTime <= 0) el.message.hidden = true; }
      if (warnTime > 0 && active) { warnTime -= dt; if (warnTime <= 0) el.warn.hidden = true; }
      if (messageTime > 0) return;
      if (active && w.state === 'countdown') { el.message.hidden = false; el.message.textContent = `RAUND ${w.round} · HAZIR OL · ${Math.ceil(w.t)}`; }
      else el.message.hidden = true;
    },

    /** Tabela, saat ve oyuncu kartı (kısa aralıkla). */
    hud(w, playing, screen) {
      for (const node of el.playing) node.hidden = !playing;
      el.site.hidden = playing;
      const me = w.players[w.me];
      el.crosshair.hidden = !playing || !!screen || me.out;
      for (const team of [0, 1]) {
        [...el.wins[team].children].forEach((pip, i) => pip.classList.toggle('won', i < w.wins[team]));
        el.alive[team].textContent = aliveCount(w, team);
      }
      const t = Math.max(0, w.state === 'play' ? w.t : 0);
      el.timer.textContent = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
      const [text, hot] = phase(w);
      el.phase.textContent = text; el.phase.classList.toggle('hot', hot);
      el.side.textContent = 'SEN / ' + TEAMS.names[me.team] + ' TAKIM';
      el.status.textContent = me.out ? (me.respawn > 0 ? 'DÖNÜYORSUN' : 'ELENDİN') : me.freeze > 0 ? 'DONDUN' : me.knock > 0 ? 'SAVRULDUN' : me.flight > 0 ? 'UÇUŞTA' : me.discs > 0 ? 'DİSKLER HAZIR' : 'DİSK YENİLENİYOR';
      el.discText.textContent = me.discs + ' / ' + DISC.max;
      [...el.discs.children].forEach((pip, i) => {
        const full = i < me.discs, filling = i === me.discs && me.discs < DISC.max;
        pip.classList.toggle('empty', !full && !filling);
        pip.style.setProperty('--f', full ? 1 : filling ? (1 - me.regen / DISC.regen).toFixed(3) : 0);
      });
      el.power.textContent = me.power ? `${POWER[me.power]} ×${me.powerLeft}` : '—';
      // Düşüyorsun: plakanın altına indin ve zemin yok. Düştün / elendin: doğuş sayacı ya da izleme notu.
      const falling = playing && !screen && !me.out && !me.ground && me.flight <= 0 && me.y < -1.5;
      const down = playing && !screen && me.out;
      el.down.hidden = !down && !falling;
      if (falling) { el.downTitle.textContent = 'DÜŞÜYORSUN!'; el.downCount.textContent = ''; el.downNote.textContent = ''; }
      else if (down) {
        el.downTitle.textContent = me.respawn > 0 ? 'DÜŞTÜN!' : 'ELENDİN';
        el.downCount.textContent = me.respawn > 0 ? me.respawn.toFixed(1) + ' sn' : '';
        el.downNote.textContent = me.respawn > 0 ? 'Kendi plakanda yeniden doğacaksın.' : w.state === 'over' ? 'Raund bitti.' : 'Doğuş kapandı: raund bitene kadar takım arkadaşını izliyorsun.';
      }
      el.downNote.hidden = !el.downNote.textContent;
      el.freeze.hidden = !playing || !!screen || me.freeze <= 0;
    },

    /** Dolum halkası: null gizler; { p: 0-1, text, full }. Dolunca kırmızı. */
    charge(state) {
      el.charge.hidden = !state;
      if (!state) return;
      el.charge.style.setProperty('--p', Math.max(0, Math.min(1, state.p)).toFixed(3));
      el.charge.style.setProperty('--c', state.full ? '#ff3b3b' : '#7fe0e8');
      el.charge.classList.toggle('full', !!state.full);
      el.chargeText.textContent = state.text;
    },

    results(w) {
      const me = w.players[w.me];
      el.resultTitle.textContent = w.winner === me.team ? 'Son plaka sizin!' : 'Boşluk bu kez sizi yuttu.';
      el.finalScore.textContent = w.wins[0] + ' : ' + w.wins[1];
      el.stats.innerHTML = w.players.map(p =>
        `<tr class="${p.team === 0 ? 'blue-text' : 'orange-text'}${p.id === w.me ? ' me' : ''}"><td>${esc(p.name)}</td>` +
        STATS.map(k => `<td>${p.stats[k]}</td>`).join('') + '</tr>').join('');
    },

    teamName: team => TEAMS.names[team],
  };
}

/** Sıradaki evre ve kalan süre: [metin, kritik mi]. */
function phase(w) {
  if (w.state === 'countdown') return [`RAUND ${w.round}`, false];
  if (w.state === 'over') return [w.over?.team == null ? 'RAUND BERABERE' : TEAMS.names[w.over.team] + ' RAUNDU ALDI', false];
  const t = w.t, left = at => Math.ceil(at - t);
  if (t < ROUND.ring2At) return [`DIŞ HALKA DÜŞER · ${left(ROUND.ring2At)}`, t >= ROUND.ring2At - ROUND.tremble];
  if (t < ROUND.ring1At) return [`İÇ HALKA DÜŞER · ${left(ROUND.ring1At)}`, t >= ROUND.ring1At - ROUND.tremble];
  if (t < ROUND.shrinkAt) return [`MERKEZ DARALIR · ${left(ROUND.shrinkAt)}`, t >= ROUND.shrinkAt - ROUND.tremble];
  if (t < ROUND.endAt) return [`SON PLAKA · ${left(ROUND.endAt)}`, true];
  return ['BOŞLUK', true];
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
