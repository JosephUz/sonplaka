import { DISC, LIFE, ROUND, TEAMS } from './config.js';
import { aliveCount, leaders } from './world.js';

/**
 * Arayüz (DOM): ekranlar (giriş, yardım, mola, maç sonu, lobi), skor tabelası (takımların ayakta oyuncusu ve düşürmesi,
 * sürenin bitmesine kalan zaman, sıradaki evre), sol alttaki oyuncu kartı (disk çubukları, güç), nişangah çevresinde
 * ağır disk dolum halkası, ortadaki mesaj, çökme uyarı şeridi, son evrede kural şeridi ("süre bitince son plakada
 * kalan kazanır" + kalan süre), düşme ve donma perdeleri. Simülasyonu yalnızca okur.
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
    side: $('side'), status: $('status'), discText: $('disc-text'), discs: $('discs'), power: $('power'), lives: $('lives'),
    down: $('down'), downTitle: $('down-title'), downCount: $('down-count'), downNote: $('down-note'), freeze: $('freeze'),
    crosshair: $('crosshair'), message: $('message'), warn: $('warn'), rule: $('rule'),
    charge: $('charge'), chargeText: $('charge-text'),
    site: $('site'), resultTitle: $('result-title'), finalScore: $('final-score'), stats: $('stats'), sound: $('sound'), pauseSound: $('pause-sound'),
    muzik: $('muzik'), pauseMuzik: $('pause-muzik'),
  };
  el.discs.innerHTML = '<i></i>'.repeat(DISC.max);
  let messageTime = 0, warnTime = 0, boardKey = '', scoreCells = [], muzikVar = true;

  /** Tabela takım hücreleri: kip ya da takımın değişince yeniden kurulur (sol yarı / sağ yarı). */
  function buildBoard(w) {
    const me = w.players[w.me].team, half = Math.ceil(w.teams / 2);
    scoreCells = [];
    el.boards.forEach((node, side) => {
      const teams = Array.from({ length: w.teams }, (_, t) => t).filter(t => (side === 0 ? t < half : t >= half));
      node.innerHTML = teams.map(t => `<div class="team${t === me ? ' me' : ''}" style="--tc:${TEAMS.colors[t]}"><span>${TEAMS.names[t]}</span><b>0</b><small title="Düşürme">0 ↓</small></div>`).join('');
      [...node.querySelectorAll('.team')].forEach((cell, i) => { scoreCells[teams[i]] = { alive: cell.querySelector('b'), kills: cell.querySelector('small') }; });
    });
  }

  return {
    button: (id, fn) => { $(id).onclick = fn; },
    show(screen) { for (const s of SCREENS) el.screens[s].hidden = screen !== s; },
    /** Ses (efekt) düğmeleri — üst çubuk ve mola menüsü aynı durumu, standart yazıyla gösterir. */
    setSound(on) {
      const yazi = on ? 'Ses: açık' : 'Ses: kapalı';
      for (const b of [el.sound, el.pauseSound]) { b.textContent = yazi; b.classList.toggle('muted', !on); }
    },

    /**
     * Müzik düğmeleri (üst çubuk ve mola menüsü); efekt sesinden **bağımsız** (bkz. muzik.js). Ses düzeyi sabit,
     * menüde sürgü yok (oyuncu cihazın sesinden ayarlar). Gösteri kiplerinde müzik hiç kurulmaz: `setMuzikVar(false)` düğmeleri gizler.
     */
    setMuzik(on) {
      const yazi = on ? 'Müzik: açık' : 'Müzik: kapalı';
      for (const b of [el.muzik, el.pauseMuzik]) { b.textContent = yazi; b.classList.toggle('muted', !on); }
    },
    /** Müzik ayarı var mı (gösteri kiplerinde yok): düğmeler büsbütün gizlenir. */
    setMuzikVar(gorunur) { muzikVar = gorunur; el.pauseMuzik.hidden = !gorunur; },
    message(text, time = 2) { el.message.textContent = text; el.message.hidden = false; messageTime = time; },
    /** Kırmızı uyarı şeridi (plaka çöküyor); süre boyunca kalır. */
    warn(text, time = 5) { el.warn.textContent = text; el.warn.hidden = false; warnTime = time; },

    /** Mesaj ve uyarı süreleri; maç başı geri sayımında "HAZIR OL". */
    tick(dt, w, active) {
      if (messageTime > 0 && active) { messageTime -= dt; if (messageTime <= 0) el.message.hidden = true; }
      if (warnTime > 0 && active) { warnTime -= dt; if (warnTime <= 0) el.warn.hidden = true; }
      if (messageTime > 0) return;
      if (active && w.state === 'countdown') { el.message.hidden = false; el.message.textContent = `HAZIR OL · ${Math.ceil(w.t)}`; }
      else el.message.hidden = true;
    },

    /** Tabela, saat ve oyuncu kartı (kısa aralıkla). */
    hud(w, playing, screen) {
      for (const node of el.playing) node.hidden = !playing;
      el.site.hidden = playing;
      // Müzik düğmesi standart çubuğun parçasıdır; telefonda maç sırasında gizlenir, çünkü üst çubuktaki beşinci
      // simge skor tabelasının üstüne biner (ikisi de ekranın üstünde, bkz. tests/mobil-ust-alan.mjs). Müzik o
      // sırada ☰ → mola menüsünden açılıp kapatılır; masaüstünde çubukta durmaya devam eder.
      el.muzik.hidden = !muzikVar || (playing && root.classList.contains('touch'));
      const me = w.players[w.me];
      el.crosshair.hidden = !playing || !!screen || me.out;
      const key = `${w.teams}:${me.team}`;
      if (key !== boardKey) { boardKey = key; buildBoard(w); }
      w.score.forEach((s, t) => { if (scoreCells[t]) { scoreCells[t].alive.textContent = aliveCount(w, t); scoreCells[t].kills.textContent = s + ' ↓'; } });
      // Saat: sürenin bitmesine kalan zaman (merkez düşmez, süre bitince son plakada kalan kazanır).
      const t = Math.max(0, w.state === 'countdown' ? ROUND.endAt : ROUND.endAt - w.t);
      const clock = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
      el.timer.textContent = clock;
      el.timer.classList.toggle('hot', w.state === 'play' && !w.respawnOpen);
      const [text, hot] = phase(w);
      el.phase.textContent = text; el.phase.classList.toggle('hot', hot);
      // Son evre şeridi: kural ve kalan süre birlikte görünür.
      const lastPhase = playing && !screen && w.state === 'play' && !w.respawnOpen;
      el.rule.hidden = !lastPhase;
      if (lastPhase) el.rule.innerHTML = `SÜRE BİTİNCE SON PLAKADA KALAN KAZANIR · <b>${clock}</b>`;
      el.side.textContent = 'SEN / ' + TEAMS.names[me.team] + (w.teamSize > 1 ? ' TAKIM' : '');
      const returning = me.respawn > 0 || (w.respawnOpen && me.lives > 0);
      el.status.textContent = me.out ? (returning ? 'DÖNÜYORSUN' : 'ELENDİN') : me.shield > 0 ? 'KORUMA · ' + me.shield.toFixed(1) : me.freeze > 0 ? 'DONDUN' : me.knock > 0 ? 'SAVRULDUN' : me.flight > 0 ? 'UÇUŞTA' : me.discs > 0 ? 'DİSKLER HAZIR' : 'DİSK YENİLENİYOR';
      el.lives.textContent = '♥'.repeat(me.lives) + '♡'.repeat(Math.max(0, LIFE.lives - me.lives));
      el.lives.classList.toggle('low', me.lives <= 1);
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
        const waiting = me.respawn > 0 || (w.respawnOpen && me.lives > 0);
        el.downTitle.textContent = waiting ? 'DÜŞTÜN!' : 'ELENDİN';
        el.downCount.textContent = waiting && me.respawn > 0 ? me.respawn.toFixed(1) + ' sn' : '';
        el.downNote.textContent = w.state === 'over' ? 'Maç bitti.' : waiting ? `Ayakta bir plakada yeniden doğacaksın. ${me.lives} hakkın kaldı.` : (me.lives <= 0 ? 'Düşme hakkın bitti.' : 'Son plaka: doğuş kapalı.') + ' Takım arkadaşını izliyorsun.';
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

    /** Maç karnesi: kazanan, takımların son plakada ayakta kalanı ve düşürmesi, oyuncu istatistikleri (en çok düşüren üstte). */
    results(w) {
      const me = w.players[w.me];
      el.resultTitle.textContent = w.winner === me.team ? 'Son plaka sizin!' : w.winner === -1 || w.winner === null ? 'Berabere. Boşluk kimseyi seçmedi.' : 'Boşluk bu kez sizi yuttu.';
      el.finalScore.innerHTML = w.score.map((s, t) => `<span style="color:${TEAMS.colors[t]}">${TEAMS.names[t]} <b>${aliveCount(w, t)}</b> <em>ayakta · ${s} düşürme</em></span>`).join('<i>·</i>');
      const rows = [...w.players].sort((a, b) => b.stats.kills - a.stats.kills || a.stats.falls - b.stats.falls || a.id - b.id);
      el.stats.innerHTML = rows.map(p =>
        `<tr class="${p.id === w.me ? 'me' : ''}" style="color:${TEAMS.colors[p.team]}"><td>${esc(p.name)}</td>` +
        STATS.map(k => `<td>${p.stats[k]}</td>`).join('') + '</tr>').join('');
    },

    teamName: team => TEAMS.names[team],
  };
}

/** Sıradaki evre ve kalan süre: [metin, kritik mi]. */
function phase(w) {
  if (w.winner !== null || w.state === 'over') return ['MAÇ BİTTİ', false];
  if (w.state === 'countdown') return ['BAŞLIYOR', false];
  const t = w.t, left = at => Math.ceil(at - t);
  if (t < ROUND.ring2At) return [`DIŞ HALKA DÜŞER · ${left(ROUND.ring2At)}`, t >= ROUND.ring2At - ROUND.tremble];
  if (t < ROUND.ring1At) return [`İÇ HALKA DÜŞER · DOĞUŞ KAPANIR · ${left(ROUND.ring1At)}`, t >= ROUND.ring1At - ROUND.tremble];
  if (t < ROUND.shrinkAt) return [`SON PLAKA · DARALMA · ${left(ROUND.shrinkAt)}`, t >= ROUND.shrinkAt - ROUND.tremble];
  if (t < ROUND.endAt) return [`SÜRE BİTİNCE KALAN KAZANIR · ${left(ROUND.endAt)}`, true];
  return ['SÜRE BİTTİ', true];
}

/** Önde olan takımın adı (tek başına öndeyse), yoksa null. */
export const leaderName = w => { const top = leaders(w); return top.length === 1 ? TEAMS.names[top[0]] : null; };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
