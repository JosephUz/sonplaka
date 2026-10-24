import { DISC, LIFE, ROUND, TEAMS } from './config.js';
import { aliveCount, leaders } from './world.js';
import { t } from './dil.js';
import { takimAdi } from './etiket.js';

/**
 * Arayüz (DOM): ekranlar (giriş, yardım, mola, maç sonu, lobi), skor tabelası (takımların ayakta oyuncusu ve düşürmesi,
 * sürenin bitmesine kalan zaman, sıradaki evre), sol alttaki oyuncu kartı (disk çubukları, güç), nişangah çevresinde
 * ağır disk dolum halkası, ortadaki mesaj, çökme uyarı şeridi, son evrede kural şeridi ("süre bitince son plakada
 * kalan kazanır" + kalan süre), düşme ve donma perdeleri. Simülasyonu yalnızca okur.
 */
const SCREENS = ['home', 'help', 'pause', 'results', 'lobby'];
const STATS = ['kills', 'falls', 'hits', 'throws', 'pickups', 'pads'];
const POWER = { triple: 'guc.kisa.triple', freeze: 'guc.kisa.freeze' }; // sözlük anahtarları (src/diller/)

export function createUI(root) {
  const $ = id => root.querySelector('#sp-' + id);
  const el = {
    screens: Object.fromEntries(SCREENS.map(s => [s, $(s)])),
    playing: ['scoreboard', 'controls', 'player', 'pause-open'].map($),
    boards: [$('board-l'), $('board-r')], timer: $('timer'), phase: $('phase'),
    side: $('side'), status: $('status'), discText: $('disc-text'), discs: $('discs'), power: $('power'), lives: $('lives'),
    down: $('down'), downTitle: $('down-title'), downCount: $('down-count'), downNote: $('down-note'), freeze: $('freeze'), hit: $('hit'),
    crosshair: $('crosshair'), message: $('message'), warn: $('warn'), rule: $('rule'),
    charge: $('charge'), chargeText: $('charge-text'),
    site: $('site'), resultTitle: $('result-title'), finalScore: $('final-score'), stats: $('stats'), sound: $('sound'), pauseSound: $('pause-sound'),
    muzik: $('muzik'), pauseMuzik: $('pause-muzik'), dil: root.querySelector('#dil'),
  };
  el.discs.innerHTML = '<i></i>'.repeat(DISC.max);
  let messageTime = 0, warnTime = 0, boardKey = '', scoreCells = [], muzikVar = true;

  /** Tabela takım hücreleri: kip ya da takımın değişince yeniden kurulur (sol yarı / sağ yarı). */
  function buildBoard(w) {
    const me = w.players[w.me].team, half = Math.ceil(w.teams / 2);
    scoreCells = [];
    el.boards.forEach((node, side) => {
      const teams = Array.from({ length: w.teams }, (_, k) => k).filter(k => (side === 0 ? k < half : k >= half));
      node.innerHTML = teams.map(k => `<div class="team${k === me ? ' me' : ''}" style="--tc:${TEAMS.colors[k]}"><span>${takimAdi(k)}</span><b>0</b><small title="${t('tabela.dusurme')}">0 ↓</small></div>`).join('');
      [...node.querySelectorAll('.team')].forEach((cell, i) => { scoreCells[teams[i]] = { alive: cell.querySelector('b'), kills: cell.querySelector('small') }; });
    });
  }

  return {
    button: (id, fn) => { $(id).onclick = fn; },
    show(screen) { for (const s of SCREENS) el.screens[s].hidden = screen !== s; },
    /** Ses (efekt) düğmeleri — üst çubuk ve mola menüsü aynı durumu, standart yazıyla gösterir. */
    setSound(on) {
      const yazi = t(on ? 'ses.acik' : 'ses.kapali');
      for (const b of [el.sound, el.pauseSound]) { b.textContent = yazi; b.classList.toggle('muted', !on); }
    },

    /**
     * Müzik düğmeleri (üst çubuk ve mola menüsü); efekt sesinden **bağımsız** (bkz. muzik.js). Ses düzeyi sabit,
     * menüde sürgü yok (oyuncu cihazın sesinden ayarlar). Gösteri kiplerinde müzik hiç kurulmaz: `setMuzikVar(false)` düğmeleri gizler.
     */
    setMuzik(on) {
      const yazi = t(on ? 'muzik.acik' : 'muzik.kapali');
      for (const b of [el.muzik, el.pauseMuzik]) { b.textContent = yazi; b.classList.toggle('muted', !on); }
    },
    /** Müzik ayarı var mı (gösteri kiplerinde yok): düğmeler büsbütün gizlenir. */
    setMuzikVar(gorunur) { muzikVar = gorunur; el.pauseMuzik.hidden = !gorunur; },
    message(text, time = 2) { el.message.textContent = text; el.message.hidden = false; messageTime = time; },
    /** İsabet: ekran kenarı bir an kırmızı parlar (diskle vurulduğunu kaçırma). */
    hit() { el.hit.classList.remove('on'); void el.hit.offsetWidth; el.hit.classList.add('on'); },
    /** Kırmızı uyarı şeridi (plaka çöküyor); süre boyunca kalır. */
    warn(text, time = 5) { el.warn.textContent = text; el.warn.hidden = false; warnTime = time; },

    /** Mesaj ve uyarı süreleri; maç başı geri sayımında "HAZIR OL". */
    tick(dt, w, active) {
      if (messageTime > 0 && active) { messageTime -= dt; if (messageTime <= 0) el.message.hidden = true; }
      if (warnTime > 0 && active) { warnTime -= dt; if (warnTime <= 0) el.warn.hidden = true; }
      if (messageTime > 0) return;
      if (active && w.state === 'countdown') { el.message.hidden = false; el.message.textContent = t('hazirOl', { n: Math.ceil(w.t) }); }
      else el.message.hidden = true;
    },

    /** Tabela, saat ve oyuncu kartı (kısa aralıkla). */
    hud(w, playing, screen) {
      for (const node of el.playing) node.hidden = !playing;
      el.site.hidden = playing;
      // Dil düğmesi yalnız ana ekranda ve lobide: maçta değiştirmek sayfayı yeniden yükler (josephuz/docs/dil-standardi.md).
      if (el.dil) el.dil.hidden = playing;
      // Müzik düğmesi standart çubuğun parçasıdır; telefonda maç sırasında gizlenir, çünkü üst çubuktaki beşinci
      // simge skor tabelasının üstüne biner (ikisi de ekranın üstünde, bkz. tests/mobil-ust-alan.mjs). Müzik o
      // sırada ☰ → mola menüsünden açılıp kapatılır; masaüstünde çubukta durmaya devam eder.
      el.muzik.hidden = !muzikVar || (playing && root.classList.contains('touch'));
      const me = w.players[w.me];
      el.crosshair.hidden = !playing || !!screen || me.out;
      const key = `${w.teams}:${me.team}`;
      if (key !== boardKey) { boardKey = key; buildBoard(w); }
      w.score.forEach((s, k) => { if (scoreCells[k]) { scoreCells[k].alive.textContent = aliveCount(w, k); scoreCells[k].kills.textContent = s + ' ↓'; } });
      // Saat: sürenin bitmesine kalan zaman (merkez düşmez, süre bitince son plakada kalan kazanır).
      const kalan = Math.max(0, w.state === 'countdown' ? ROUND.endAt : ROUND.endAt - w.t);
      const clock = Math.floor(kalan / 60) + ':' + String(Math.floor(kalan % 60)).padStart(2, '0');
      el.timer.textContent = clock;
      el.timer.classList.toggle('hot', w.state === 'play' && !w.respawnOpen);
      const [text, hot] = phase(w);
      el.phase.textContent = text; el.phase.classList.toggle('hot', hot);
      // Son evre şeridi: kural ve kalan süre birlikte görünür.
      const lastPhase = playing && !screen && w.state === 'play' && !w.respawnOpen;
      el.rule.hidden = !lastPhase;
      if (lastPhase) el.rule.innerHTML = t('kural.serit', { saat: clock });
      el.side.textContent = t(w.teamSize > 1 ? 'oyuncu.yanTakim' : 'oyuncu.yan', { takim: takimAdi(me.team) });
      const returning = me.respawn > 0 || (w.respawnOpen && me.lives > 0);
      el.status.textContent = me.out ? t(returning ? 'durum.donuyor' : 'durum.elendin') : me.shield > 0 ? t('durum.koruma', { s: me.shield.toFixed(1) }) : t(me.freeze > 0 ? 'durum.dondun' : me.knock > 0 ? 'durum.savruldun' : me.flight > 0 ? 'durum.ucusta' : me.discs > 0 ? 'durum.hazir' : 'durum.yenileniyor');
      el.lives.textContent = '♥'.repeat(me.lives) + '♡'.repeat(Math.max(0, LIFE.lives - me.lives));
      el.lives.classList.toggle('low', me.lives <= 1);
      el.discText.textContent = me.discs + ' / ' + DISC.max;
      [...el.discs.children].forEach((pip, i) => {
        const full = i < me.discs, filling = i === me.discs && me.discs < DISC.max;
        pip.classList.toggle('empty', !full && !filling);
        pip.style.setProperty('--f', full ? 1 : filling ? (1 - me.regen / DISC.regen).toFixed(3) : 0);
      });
      el.power.textContent = me.power ? `${t(POWER[me.power])} ×${me.powerLeft}` : '—';
      // Düşüyorsun: plakanın altına indin ve zemin yok. Düştün: doğuş sayacı.
      const falling = playing && !screen && !me.out && !me.ground && me.flight <= 0 && me.y < -1.5;
      const down = playing && !screen && me.out;
      el.down.hidden = !down && !falling;
      if (falling) { el.downTitle.textContent = t('dusme.dusuyorsun'); el.downCount.textContent = ''; el.downNote.textContent = ''; }
      else if (down) {
        const waiting = me.respawn > 0 || (w.respawnOpen && me.lives > 0);
        el.downTitle.textContent = t(waiting ? 'dusme.dustun' : 'dusme.elendin');
        el.downCount.textContent = waiting && me.respawn > 0 ? t('dusme.sn', { s: me.respawn.toFixed(1) }) : '';
        el.downNote.textContent = w.state === 'over' ? t('dusme.macBitti') : waiting ? t('dusme.dogacaksin', { n: me.lives }) : t(me.lives <= 0 ? 'dusme.hakBitti' : 'dusme.dogusKapali') + ' ' + t('dusme.izliyorsun');
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
      el.resultTitle.textContent = t(w.winner === me.team ? 'sonuc.kazandin' : w.winner === -1 || w.winner === null ? 'sonuc.berabere' : 'sonuc.kaybettin');
      el.finalScore.innerHTML = w.score.map((s, k) => `<span style="color:${TEAMS.colors[k]}">${takimAdi(k)} <b>${aliveCount(w, k)}</b> <em>${t('sonuc.ayakta', { n: s })}</em></span>`).join('<i>·</i>');
      const rows = [...w.players].sort((a, b) => b.stats.kills - a.stats.kills || a.stats.falls - b.stats.falls || a.id - b.id);
      el.stats.innerHTML = rows.map(p =>
        `<tr class="${p.id === w.me ? 'me' : ''}" style="color:${TEAMS.colors[p.team]}"><td>${esc(p.name === 'Sen' && !w.online ? t('sonuc.sen') : p.name)}</td>` +
        STATS.map(k => `<td>${p.stats[k]}</td>`).join('') + '</tr>').join('');
    },

    teamName: team => takimAdi(team),
  };
}

/** Sıradaki evre ve kalan süre: [metin, kritik mi]. */
function phase(w) {
  if (w.winner !== null || w.state === 'over') return [t('evre.bitti'), false];
  if (w.state === 'countdown') return [t('evre.basliyor'), false];
  const sn = w.t, left = at => Math.ceil(at - sn);
  if (sn < ROUND.ring2At) return [t('evre.disHalka', { n: left(ROUND.ring2At) }), sn >= ROUND.ring2At - ROUND.tremble];
  if (sn < ROUND.ring1At) return [t('evre.icHalka', { n: left(ROUND.ring1At) }), sn >= ROUND.ring1At - ROUND.tremble];
  if (sn < ROUND.shrinkAt) return [t('evre.daralma', { n: left(ROUND.shrinkAt) }), sn >= ROUND.shrinkAt - ROUND.tremble];
  if (sn < ROUND.endAt) return [t('evre.son', { n: left(ROUND.endAt) }), true];
  return [t('evre.sureBitti'), true];
}

/** Önde olan takımın adı (tek başına öndeyse), yoksa null. */
export const leaderName = w => { const top = leaders(w); return top.length === 1 ? takimAdi(top[0]) : null; };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
