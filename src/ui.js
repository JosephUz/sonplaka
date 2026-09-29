import { DISC, ROUND, TEAMS } from './config.js';
import { leaders } from './world.js';

/**
 * Arayüz (DOM): ekranlar (giriş, yardım, mola, maç sonu, lobi), skor tabelası (takım skorları, kalan maç süresi ve
 * sıradaki dalga evresi), sol alttaki oyuncu kartı (disk çubukları, güç), nişangah çevresinde ağır disk dolum
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
    boards: [$('board-l'), $('board-r')], timer: $('timer'), phase: $('phase'),
    side: $('side'), status: $('status'), discText: $('disc-text'), discs: $('discs'), power: $('power'),
    down: $('down'), downTitle: $('down-title'), downCount: $('down-count'), downNote: $('down-note'), freeze: $('freeze'),
    crosshair: $('crosshair'), message: $('message'), warn: $('warn'),
    charge: $('charge'), chargeText: $('charge-text'),
    site: $('site'), resultTitle: $('result-title'), finalScore: $('final-score'), stats: $('stats'), sound: $('sound'), pauseSound: $('pause-sound'),
  };
  el.discs.innerHTML = '<i></i>'.repeat(DISC.max);
  let messageTime = 0, warnTime = 0, boardKey = '', scoreCells = [];

  /** Tabela takım hücreleri: kip ya da takımın değişince yeniden kurulur (sol yarı / sağ yarı). */
  function buildBoard(w) {
    const me = w.players[w.me].team, half = Math.ceil(w.teams / 2);
    scoreCells = [];
    el.boards.forEach((node, side) => {
      const teams = Array.from({ length: w.teams }, (_, t) => t).filter(t => (side === 0 ? t < half : t >= half));
      node.innerHTML = teams.map(t => `<div class="team${t === me ? ' me' : ''}" style="--tc:${TEAMS.colors[t]}"><span>${TEAMS.names[t]}</span><b>0</b></div>`).join('');
      [...node.querySelectorAll('b')].forEach((b, i) => { scoreCells[teams[i]] = b; });
    });
  }

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

    /** Mesaj ve uyarı süreleri; dalga geri sayımında "HAZIR OL". */
    tick(dt, w, active) {
      if (messageTime > 0 && active) { messageTime -= dt; if (messageTime <= 0) el.message.hidden = true; }
      if (warnTime > 0 && active) { warnTime -= dt; if (warnTime <= 0) el.warn.hidden = true; }
      if (messageTime > 0) return;
      if (active && w.state === 'countdown') { el.message.hidden = false; el.message.textContent = `${w.round > 1 ? `DALGA ${w.round}` : 'BAŞLIYOR'} · HAZIR OL · ${Math.ceil(w.t)}`; }
      else el.message.hidden = true;
    },

    /** Tabela, saat ve oyuncu kartı (kısa aralıkla). */
    hud(w, playing, screen) {
      for (const node of el.playing) node.hidden = !playing;
      el.site.hidden = playing;
      const me = w.players[w.me];
      el.crosshair.hidden = !playing || !!screen || me.out;
      const key = `${w.teams}:${me.team}`;
      if (key !== boardKey) { boardKey = key; buildBoard(w); }
      w.score.forEach((s, t) => { if (scoreCells[t]) scoreCells[t].textContent = s; });
      const t = Math.max(0, w.matchT);
      el.timer.textContent = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
      el.timer.classList.toggle('hot', w.state === 'play' && t <= 30);
      const [text, hot] = phase(w);
      el.phase.textContent = text; el.phase.classList.toggle('hot', hot);
      el.side.textContent = 'SEN / ' + TEAMS.names[me.team] + (w.teamSize > 1 ? ' TAKIM' : '');
      el.status.textContent = me.out ? 'DÖNÜYORSUN' : me.freeze > 0 ? 'DONDUN' : me.knock > 0 ? 'SAVRULDUN' : me.flight > 0 ? 'UÇUŞTA' : me.discs > 0 ? 'DİSKLER HAZIR' : 'DİSK YENİLENİYOR';
      el.discText.textContent = me.discs + ' / ' + DISC.max;
      [...el.discs.children].forEach((pip, i) => {
        const full = i < me.discs, filling = i === me.discs && me.discs < DISC.max;
        pip.classList.toggle('empty', !full && !filling);
        pip.style.setProperty('--f', full ? 1 : filling ? (1 - me.regen / DISC.regen).toFixed(3) : 0);
      });
      el.power.textContent = me.power ? `${POWER[me.power]} ×${me.powerLeft}` : '—';
      // Düşüyorsun: plakanın altına indin ve zemin yok. Düştün: doğuş sayacı.
      const falling = playing && !screen && !me.out && !me.ground && me.flight <= 0 && me.y < -1.5;
      const down = playing && !screen && me.out;
      el.down.hidden = !down && !falling;
      if (falling) { el.downTitle.textContent = 'DÜŞÜYORSUN!'; el.downCount.textContent = ''; el.downNote.textContent = ''; }
      else if (down) {
        el.downTitle.textContent = 'DÜŞTÜN!';
        el.downCount.textContent = me.respawn > 0.05 ? me.respawn.toFixed(1) + ' sn' : '';
        el.downNote.textContent = w.state === 'over' ? 'Dalga bitti: plakalar geri geliyor.' : me.respawn > 0.05 ? 'Ayakta bir plakada yeniden doğacaksın.' : 'Ayakta plaka bekleniyor.';
      }
      el.downNote.hidden = !el.downNote.textContent;
      el.freeze.hidden = !playing || !!screen || me.freeze <= 0;
    },

    /** Dolum halkası: null gizler; { p: 0-1, text, full }. Dolunca turuncu. */
    charge(state) {
      el.charge.hidden = !state;
      if (!state) return;
      el.charge.style.setProperty('--p', Math.max(0, Math.min(1, state.p)).toFixed(3));
      el.charge.style.setProperty('--c', state.full ? '#ff9a50' : '#7fe0e8');
      el.charge.classList.toggle('full', !!state.full);
      el.chargeText.textContent = state.text;
    },

    /** Maç karnesi: kazanan, takım skorları, oyuncu istatistikleri (takım rengiyle, en çok düşüren üstte). */
    results(w) {
      const me = w.players[w.me];
      el.resultTitle.textContent = w.winner === me.team ? 'Arena sizin!' : w.winner === -1 || w.winner === null ? 'Berabere. Boşluk kimseyi seçmedi.' : 'Boşluk bu kez sizi yuttu.';
      el.finalScore.innerHTML = w.score.map((s, t) => `<span style="color:${TEAMS.colors[t]}">${TEAMS.names[t]} <b>${s}</b></span>`).join('<i>·</i>');
      const rows = [...w.players].sort((a, b) => b.stats.kills - a.stats.kills || a.stats.falls - b.stats.falls || a.id - b.id);
      el.stats.innerHTML = rows.map(p =>
        `<tr class="${p.id === w.me ? 'me' : ''}" style="color:${TEAMS.colors[p.team]}"><td>${esc(p.name)}</td>` +
        STATS.map(k => `<td>${p.stats[k]}</td>`).join('') + '</tr>').join('');
    },

    teamName: team => TEAMS.names[team],
  };
}

/** Sıradaki dalga evresi ve kalan süre: [metin, kritik mi]. */
function phase(w) {
  if (w.winner !== null) return ['MAÇ BİTTİ', false];
  if (w.state === 'countdown') return [w.round > 1 ? `DALGA ${w.round}` : 'BAŞLIYOR', false];
  if (w.state === 'over') return ['PLAKALAR GERİ GELİYOR', false];
  const t = w.t, left = at => Math.ceil(at - t);
  if (t < ROUND.ring2At) return [`DIŞ HALKA DÜŞER · ${left(ROUND.ring2At)}`, t >= ROUND.ring2At - ROUND.tremble];
  if (t < ROUND.ring1At) return [`İÇ HALKA DÜŞER · ${left(ROUND.ring1At)}`, t >= ROUND.ring1At - ROUND.tremble];
  if (t < ROUND.shrinkAt) return [`MERKEZ DARALIR · ${left(ROUND.shrinkAt)}`, t >= ROUND.shrinkAt - ROUND.tremble];
  if (t < ROUND.endAt) return [`SON PLAKA · ${left(ROUND.endAt)}`, true];
  return ['BOŞLUK', true];
}

/** Önde olan takımın adı (tek başına öndeyse), yoksa null. */
export const leaderName = w => { const top = leaders(w); return top.length === 1 ? TEAMS.names[top[0]] : null; };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
