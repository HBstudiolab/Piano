// Built-in songs (public domain) arranged with a backing band.
// Notation:  "C4/1" note + duration in beats (quarter = 1, default 1),  "C4+E4/2" chord,  "R/.5" rest,  "|" ignored.
// Strings / bass are generated from a chord progression "C:4 F:2 G:2"; drums from the bar grid (makeDrums).
window.Songs = (function () {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function noteToMidi(s) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) throw new Error('잘못된 음 표기: ' + s);
    return (parseInt(m[3], 10) + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  function midiName(m) { return NAMES[m % 12] + (Math.floor(m / 12) - 1); }

  function seq(str, bpm, vel = 0.8) {
    const spb = 60 / bpm;
    let beat = 0;
    const out = [];
    for (const tok of str.trim().split(/\s+/)) {
      if (tok === '|') continue;
      const [pitch, d] = tok.split('/');
      const dur = d ? parseFloat(d) : 1;
      if (pitch !== 'R') {
        for (const nn of pitch.split('+')) {
          out.push({ time: beat * spb, dur: dur * spb * 0.95, midi: noteToMidi(nn), vel });
        }
      }
      beat += dur;
    }
    return out;
  }

  // ───────────────────────── drums ─────────────────────────
  // GM notes: 36 kick, 37 rim, 38 snare, 39 clap, 41/45/48/50 toms, 42 closed hat, 46 open hat, 49 crash,
  //           51 ride, 53 ride bell, 54 tambourine, 56 cowbell, 62/63/64 congas, 70 shaker
  // Patterns are 16 steps per 4/4 bar:  x = accent, o = normal, g = ghost, . = rest
  const STYLES = {
    disco: {
      name: '디스코', swing8: 0, swing16: 0, fills: ['snare', 'clap', 'toms'],
      A: { 36: 'x...x...x...x...', 42: 'o.g.o.g.o.g.o.g.', 46: '..o...o...o...o.', 38: '....o.......o...', 39: '....x.......x...' },
      B: { 36: 'x...x...x...x...', 42: 'ogogogogogogogog', 46: '..x...x...x...x.', 38: '....x.......x..g', 39: '....x.......x...', 54: '....o.......o...' },
    },
    funk: {
      name: '펑크', swing8: 0, swing16: 0.12, fills: ['ghost', 'toms', 'snare'],
      A: { 36: 'x.....x...x..x..', 38: '....x..g.g..x..g', 42: 'xgogxgogxgogxgog' },
      B: { 36: 'x.x...x...x..x..', 38: '....x..g.g..x.gg', 42: 'xgogxgogxgogxg..', 46: '..............o.', 56: 'x...o...x...o...', 39: '....o.......o...' },
    },
    rock: {
      name: '록', swing8: 0, swing16: 0, fills: ['toms', 'roll', 'snare'],
      A: { 36: 'x.......x.x.....', 38: '....x.......x...', 42: 'x.o.x.o.x.o.x.o.' },
      B: { 36: 'x.....x.x.x.....', 38: '....x.......x...', 51: 'x.o.x.o.x.o.x.o.', 53: 'o...o...o...o...' },
    },
    house: {
      name: '하우스', swing8: 0, swing16: 0.1, fills: ['clap', 'roll', 'clap'],
      A: { 36: 'x...x...x...x...', 46: '..x...x...x...x.', 39: '....x.......x...', 70: 'g.gog.gog.gog.go' },
      B: { 36: 'x...x...x...x...', 46: '..x...x...x...x.', 42: 'o.oo.oo.o.oo.oo.', 39: '....x.......x...', 38: '....o.......o..g', 70: 'gogogogogogogogo', 53: 'x.......x.......' },
    },
    latin: {
      name: '라틴', swing8: 0, swing16: 0, fills: ['congas', 'toms', 'congas'],
      A: { 36: 'x..x....x..x....', 37: 'x..x..x...x.x...', 63: '..o.......o.....', 64: '......x.......xx', 70: 'ogogogogogogogog' },
      B: { 36: 'x..x..x.x..x..x.', 37: 'x..x..x...x.x...', 63: '..o...o...o...o.', 64: '......x.......xx', 56: 'x.o.x.o.x.o.x.o.', 39: '....x.......x...', 70: 'ogogogogogogogog' },
    },
    lofi: {
      name: '로파이 힙합', swing8: 0.6, swing16: 0, fills: ['ghost', 'snare', 'toms'],
      A: { 36: 'x.....x...x.....', 38: '....x.......x...', 42: 'x.g.o.g.x.g.o.g.', 37: '..........g.....' },
      B: { 36: 'x.....x.x.x...x.', 38: '....x..g....x..g', 42: 'x.o.x.o.x.o.x.o.', 46: '..............o.', 54: '....o.......o...' },
    },
    shuffle: {
      name: '셔플', swing8: 0.65, swing16: 0, fills: ['snare', 'toms', 'roll'],
      A: { 36: 'x.....x.x.......', 38: '....x.......x...', 42: 'x.o.x.o.x.o.x.o.' },
      B: { 36: 'x.....x.x.....x.', 38: '....x.......x..g', 51: 'x.o.x.o.x.o.x.o.', 54: '....o.......o...' },
    },
  };
  // 3/4 bars ("쿵짝짝")
  const WALTZ = { 36: 'x...........', 38: '....o...o...', 39: '....x...x...', 42: 'o.g.o.g.o.g.', 46: '..o...o...o.' };
  // fills: short = last beat (4 steps), long = last 2 beats (8 steps)
  const FILLS = {
    snare:  { short: { 38: 'xoox' },              long: { 38: 'g.oxoxxx' } },
    clap:   { short: { 39: 'xxxx' },              long: { 39: 'x.x.xxxx', 38: '....oooo' } },
    toms:   { short: { 48: 'xx..', 45: '..x.', 41: '...x' },
              long:  { 38: 'xo......', 50: '..xo....', 48: '....xo..', 45: '......x.', 41: '.......x' } },
    ghost:  { short: { 38: 'gxgx' },              long: { 38: 'g.gxg.xx', 46: 'x.......' } },
    roll:   { short: { 38: 'xxxx' },              long: { 38: 'xxxxxxxx' } },
    congas: { short: { 63: 'xx..', 64: '..xx' },  long: { 62: '.x......', 63: 'x.xx....', 64: '....x.xx' } },
  };
  const VEL = { x: 1, o: 0.7, g: 0.35 };

  // barBeats (optional): quarter-note beats in each bar, from the MIDI time signature
  function makeDrums(bars, finalAt, beatSec, styleKey = 'disco', barBeats = null) {
    const st = STYLES[styleKey] || STYLES.disco;
    const notes = [];
    const lvlOf = (m, c, s) => c === 'g' ? 3 : (m == 36 || m == 38 || m == 39 || m == 49) ? 1 : (s % 2 === 1 ? 3 : 2);
    const hit = (t, m, v, lvl = 2) => {
      t += (Math.random() - 0.5) * 0.006;                       // tiny humanize
      if (t >= 0 && t < finalAt - 0.01) notes.push({ time: t, dur: 0.1, midi: +m, vel: v * (0.9 + Math.random() * 0.2), lvl });
    };
    const grid = bars.slice();
    if (!grid.length) grid.push(0);
    while (grid[grid.length - 1] < finalAt) grid.push(grid[grid.length - 1] + 4 * beatSec);
    const nBars = grid.length - 1;
    const phrases = Math.ceil(nBars / 4);

    // pickup before the first bar: crescendo snare roll
    if (grid[0] > beatSec * 0.4) {
      const step = beatSec / 4, n = Math.floor(grid[0] / step);
      for (let j = 0; j < n; j++) hit(grid[0] - (n - j) * step, 38, 0.3 + 0.6 * j / n, j % 2 ? 3 : 2);
    }

    let fillNo = 0;
    for (let i = 0; i < nBars; i++) {
      const b0 = grid[i], b1 = grid[i + 1];
      const nb = Math.max(1, Math.min(12, Math.round(barBeats && barBeats[i] ? barBeats[i] : (b1 - b0) / beatSec)));
      const steps = nb * 4, sl = (b1 - b0) / steps;
      const phrase = Math.floor(i / 4);
      const sec = (phrase % 2 === 1 || phrase === phrases - 1) ? 'B' : 'A';
      const pat = nb === 3 ? WALTZ : st[sec];
      const at = (s) => b0 + s * sl + (s % 4 === 2 ? st.swing8 * sl : 0) + (s % 2 === 1 ? st.swing16 * sl : 0);

      // fill at the end of every 4th bar (longer one every 8th)
      let fill = null, fillLen = 0;
      if (i % 4 === 3 && steps >= 8 && i < nBars - 1) {
        const f = FILLS[st.fills[fillNo++ % st.fills.length]];
        fillLen = i % 8 === 7 ? 8 : 4;
        fill = fillLen === 8 ? f.long : f.short;
      }
      const fillStart = steps - fillLen;

      for (let s = 0; s < steps; s++) {
        if (fill && s >= fillStart) continue;
        for (const m in pat) {
          const c = pat[m][s % pat[m].length];
          if (c && c !== '.') hit(at(s), m, VEL[c], lvlOf(m, c, s));
        }
      }
      if (fill) {
        hit(at(fillStart), 36, 0.9, 1);
        for (const m in fill) {
          for (let j = 0; j < fillLen; j++) {
            const c = fill[m][j];
            if (c && c !== '.') hit(at(fillStart + j), m, VEL[c] * (0.75 + 0.25 * j / fillLen), j % 2 ? 3 : 2);
          }
        }
      }
      if (i % 4 === 0) hit(b0, 49, i === 0 ? 0.85 : 0.7, 1);   // crash at each phrase start
    }
    notes.push({ time: finalAt, dur: 0.1, midi: 36, vel: 1, lvl: 1 }, { time: finalAt, dur: 0.1, midi: 49, vel: 0.9, lvl: 1 });
    return notes.sort((a, b) => a.time - b.time);
  }
  const discoDrums = (bars, finalAt, beatSec) => makeDrums(bars, finalAt, beatSec, 'disco');

  // ───────────────────── strings / bass / guitar from chords ─────────────────────
  const CHORD = { C: 'E3+G3+C4', F: 'F3+A3+C4', G: 'D3+G3+B3', Am: 'E3+A3+C4', E: 'E3+G#3+B3',
                  Dm: 'F3+A3+D4', D: 'D3+F#3+A3', Em: 'E3+G3+B3', Bm: 'D3+F#3+B3', 'F#': 'C#3+F#3+A#3',
                  'F#m': 'C#3+F#3+A3', A: 'C#3+E3+A3', 'C#': 'C#3+F3+G#3', B7: 'D#3+A3+B3' };
  const ROOT = { C: 'C2', F: 'F2', G: 'G2', Am: 'A2', E: 'E2', Dm: 'D2', D: 'D2', Em: 'E2', Bm: 'B1',
                 'F#': 'F#2', 'F#m': 'F#2', A: 'A1', 'C#': 'C#2', B7: 'B1' };
  // guitar power chords (root + fifth)
  const POWER = { C: 'C3+G3', D: 'D3+A3', Dm: 'D3+A3', E: 'E2+B2', Em: 'E2+B2', F: 'F2+C3', G: 'G2+D3', A: 'A2+E3',
                  Am: 'A2+E3', Bm: 'B2+F#3', B7: 'B2+F#3', 'F#': 'F#2+C#3', 'F#m': 'F#2+C#3', 'C#': 'C#3+G#3' };
  const up = (n) => n.replace(/\d$/, d => +d + 1);
  const prog = (p) => p.trim().split(/\s+/).map(t => { const [c, b] = t.split(':'); return [c, parseFloat(b)]; });
  const strings = (p) => prog(p).map(([c, b]) => c === 'R' ? `R/${b}` : `${CHORD[c]}/${b}`).join(' ');
  // bass: 'octave' = low-high eighth notes ("둥둥"), 'root' = one held root per chord; the song's last chord is held
  const bass = (p, last = true, style = 'octave') => prog(p).map(([c, b], i, all) => {
    if (c === 'R') return `R/${b}`;
    const r = ROOT[c];
    if (style === 'root' || (last && i === all.length - 1)) return `${r}/${b}`;
    const out = [];
    for (let k = 0; k < b * 2; k++) out.push(`${k % 2 ? up(r) : r}/.5`);
    return out.join(' ');
  }).join(' ');
  // rhythm guitar: palm-muted power-chord eighths
  const power = (p) => prog(p).map(([c, b]) => c === 'R' ? `R/${b}` : Array(b * 2).fill(`${POWER[c]}/.5`).join(' ')).join(' ');

  // ───────────────────── arrangement helpers ─────────────────────
  const chordBeats = (p) => prog(p).reduce((a, [, b]) => a + b, 0);
  const melBeats = (m) => m.trim().split(/\s+/).filter(t => t !== '|').reduce((a, t) => a + (t.includes('/') ? parseFloat(t.split('/')[1]) : 1), 0);
  const octUp = (m) => m.replace(/([A-G][#b]?)(-?\d)/g, (_, n, o) => n + (+o + 1));
  // section item: { mel, ch, lh, acc, bpm }  — missing parts are rests; bpm overrides the song tempo for that section
  const sec = (mel, ch, lh) => ({ mel, ch, lh });
  const up8 = (it) => ({ ...it, mel: octUp(it.mel) });
  const groove = (ch, mel) => ({ mel, ch });                    // instrumental bars (intro / interlude)

  // opts: melName/melInst (lead part), accName/accInst (extra accompaniment), strings (bool),
  //       bass ('octave' | 'root'), rhythm (power-chord guitar), exclusive ('guitar'), tone (guitar sound)
  function song(id, title, artist, bpm, drumStyle, items, meter = {}, opts = {}) {
    const bar = meter.bar || 4;
    const has = (k) => items.some(it => it[k]);
    const defs = [
      { key: 'mel', name: opts.melName || '오른손 (멜로디)', role: 'play', inst: opts.melInst || 'piano', vel: 0.8 },
      ...(has('lh') ? [{ key: 'lh', name: '왼손 (피아노 반주)', role: 'accomp', inst: 'piano', vel: 0.5 }] : []),
      ...(has('acc') ? [{ key: 'acc', name: opts.accName || '반주', role: 'accomp', inst: opts.accInst || 'piano', vel: 0.45 }] : []),
      ...(opts.rhythm ? [{ key: 'rhythm', name: '리듬 기타', role: 'accomp', inst: 'eguitar', vel: 0.4 }] : []),
      ...(opts.strings !== false ? [{ key: 'strings', name: '스트링', role: 'accomp', inst: 'strings', vel: 0.4 }] : []),
      { key: 'bass', name: '베이스', role: 'accomp', inst: 'bass', vel: 0.6 },
    ];
    const ps = defs.map(d => ({ name: d.name, role: d.role, inst: d.inst, isDrum: false, program: null, notes: [] }));
    const bars = [], barBeats = [];
    let t0 = 0;
    items.forEach((it, idx) => {
      const nb = chordBeats(it.ch), tempo = it.bpm || bpm, spb = 60 / tempo;
      for (const k of ['mel', 'lh', 'acc']) {                   // sanity check: every section lines up
        if (it[k] && Math.abs(melBeats(it[k]) - nb) > 1e-3) console.warn(`[${id}] ${k} ${melBeats(it[k])} ≠ chords ${nb}`);
      }
      const src = {
        mel: it.mel, lh: it.lh, acc: it.acc, rhythm: power(it.ch), strings: strings(it.ch),
        bass: bass(it.ch, idx === items.length - 1, opts.bass || 'octave'),
      };
      defs.forEach((d, i) => {
        for (const n of seq(src[d.key] || `R/${nb}`, tempo, d.vel)) { n.time += t0; ps[i].notes.push(n); }
      });
      for (let b = 0; b < nb - 1e-9; b += bar) { bars.push(t0 + b * spb); barBeats.push(Math.min(bar, nb - b)); }
      t0 += nb * spb;
    });
    bars.push(t0); barBeats.push(bar);
    let finalAt = 0;
    for (const n of ps[0].notes) finalAt = Math.max(finalAt, n.time);  // ending hit lands on the melody's last note
    const beatSec = 60 / bpm;
    ps.push({ name: '드럼', role: 'accomp', inst: 'drum', isDrum: true, autoDrum: true, program: null,
              notes: makeDrums(bars, finalAt, beatSec, drumStyle, barBeats) });
    return { id, title, artist, builtin: true, parts: ps, bars, barBeats, beatSec, finalAt, drumStyle,
             exclusive: opts.exclusive, tone: opts.tone };
  }

  const INTRO = 'C:4 Am:4 F:4 G:4';
  const BREAK = 'F:4 G:4 C:4 G:4';

  // ── 나비야 ──
  const BUTTERFLY = sec(
    'G4 E4 E4/2 | F4 D4 D4/2 | C4 D4 E4 F4 | G4 G4 G4/2 | G4 E4 E4 E4 | F4 D4 D4 D4 | C4 E4 G4 G4 | E4 E4 E4/2 | ' +
    'D4 D4 D4 D4 | D4 E4 F4/2 | E4 E4 E4 E4 | E4 F4 G4/2 | G4 E4 E4/2 | F4 D4 D4/2 | C4 E4 G4 G4 | C4/4',
    'C:4 G:4 C:4 C:4 C:4 G:4 C:4 C:4 G:4 G:4 C:4 C:4 C:4 G:4 C:4 C:4');

  // ── 비행기 ──
  const LAMB = sec(
    'E4 D4 C4 D4 | E4 E4 E4/2 | D4 D4 D4/2 | E4 G4 G4/2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4/4',
    'C:4 C:4 G:4 C:4 C:4 C:4 G:4 C:4');

  // ── 반짝반짝 작은별 ──
  const TWINKLE = sec(
    'C4 C4 G4 G4 | A4 A4 G4/2 | F4 F4 E4 E4 | D4 D4 C4/2 | G4 G4 F4 F4 | E4 E4 D4/2 | ' +
    'G4 G4 F4 F4 | E4 E4 D4/2 | C4 C4 G4 G4 | A4 A4 G4/2 | F4 F4 E4 E4 | D4 D4 C4/2',
    'C:4 F:2 C:2 F:2 C:2 G:2 C:2 C:2 F:2 C:2 G:2 C:2 F:2 C:2 G:2 C:4 F:2 C:2 F:2 C:2 G:2 C:2',
    'C3+G3/4 | F3+A3/2 C3+G3/2 | F3+A3/2 C3+G3/2 | G2+D3/2 C3+G3/2 | C3+G3/2 F3+A3/2 | C3+G3/2 G2+D3/2 | ' +
    'C3+G3/2 F3+A3/2 | C3+G3/2 G2+D3/2 | C3+G3/4 | F3+A3/2 C3+G3/2 | F3+A3/2 C3+G3/2 | G2+D3/2 C3+G3/2');

  // ── 징글벨 (절 + 후렴) ──
  const JINGLE_VERSE = sec(
    'G3 E4 D4 C4 | G3/3 G3/.5 G3/.5 | G3 E4 D4 C4 | A3/4 | A3 F4 E4 D4 | B3/4 | G4 G4 F4 D4 | E4/4 | ' +
    'G3 E4 D4 C4 | G3/4 | G3 E4 D4 C4 | A3/3 A3 | A3 F4 E4 D4 | G4 G4 G4 G4 | A4 G4 F4 D4 | C4/4',
    'C:4 C:4 C:4 F:4 F:4 G:4 G:4 C:4 C:4 C:4 C:4 F:4 F:4 G:4 G:4 C:4');
  const JINGLE_CHORUS = sec(
    'E4 E4 E4/2 | E4 E4 E4/2 | E4 G4 C4/1.5 D4/.5 | E4/4 | F4 F4 F4/1.5 F4/.5 | F4 E4 E4 E4/.5 E4/.5 | E4 D4 D4 E4 | D4/2 G4/2 | ' +
    'E4 E4 E4/2 | E4 E4 E4/2 | E4 G4 C4/1.5 D4/.5 | E4/4 | F4 F4 F4/1.5 F4/.5 | F4 E4 E4 E4/.5 E4/.5 | G4 G4 F4 D4 | C4/4',
    'C:4 C:4 C:4 C:4 F:4 C:4 D:4 G:4 C:4 C:4 C:4 C:4 F:4 C:4 G:4 C:4');

  // ── 환희의 송가 ──
  const ODE = sec(
    'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/1.5 D4/.5 D4/2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/1.5 C4/.5 C4/2 | ' +
    'D4 D4 E4 C4 | D4 E4/.5 F4/.5 E4 C4 | D4 E4/.5 F4/.5 E4 D4 | C4 D4 G3/2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/1.5 C4/.5 C4/2',
    'C:4 G:4 C:4 G:4 C:4 G:4 C:4 G:2 C:2 G:2 C:2 G:2 C:2 G:2 C:1 G:1 C:2 G:2 C:4 G:4 C:4 G:2 C:2',
    'C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/2 C3+G3/2 | ' +
    'G2+D3/2 C3+G3/2 | G2+D3/2 C3+G3/2 | G2+D3/2 C3+G3/1 G2+D3/1 | C3+G3/2 G2+D3/2 | C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/2 C3+G3/2');

  // ── 성자의 행진 ──
  const SAINTS = sec(
    'R/1 C4 E4 F4 | G4/4 | R/1 C4 E4 F4 | G4/4 | R/1 C4 E4 F4 | G4/2 E4/2 | C4/2 E4/2 | D4/4 | ' +
    'R/1 E4 E4 D4 | C4/3 C4 | E4/2 G4 G4 | F4/4 | R/1 E4 F4 G4 | E4/2 C4/2 | D4/4 | C4/4',
    'C:4 C:4 C:4 G:4 C:4 C:4 C:4 G:4 C:4 C:4 C:4 F:4 C:4 C:4 G:4 C:4');

  // ── 캐논 (주제 + 변주) ──
  const CANON = 'C:2 G:2 Am:2 Em:2 F:2 C:2 F:2 G:2';
  const CANON_1 = sec('E5/2 D5/2 | C5/2 B4/2 | A4/2 G4/2 | A4/2 B4/2', CANON);
  const CANON_2 = sec('C5 B4 A4 G4 | F4 E4 F4 D4 | C4 E4 G4 F4 | E4 C4 E4 D4', CANON);
  const CANON_ARP = sec(
    'C5/.5 E5/.5 G5/.5 E5/.5 B4/.5 D5/.5 G5/.5 D5/.5 | C5/.5 E5/.5 A5/.5 E5/.5 B4/.5 E5/.5 G5/.5 E5/.5 | ' +
    'C5/.5 F5/.5 A5/.5 F5/.5 C5/.5 E5/.5 G5/.5 E5/.5 | C5/.5 F5/.5 A5/.5 F5/.5 B4/.5 D5/.5 G5/.5 D5/.5', CANON);

  // ── 엘리제를 위하여 (4/4 리믹스: A A B A A) ──
  const ELISE_A = (ending) => sec(
    'E5/.5 D#5/.5 E5/.5 B4/.5 D5/.5 C5/1.5 | A4/1 R/.5 C4/.5 E4/.5 A4/.5 R/1 | B4/1 R/.5 E4/.5 G#4/.5 B4/.5 R/1 | ' +
    'C5/1 R/.5 E4/.5 R/1 E5/.5 D#5/.5 | E5/.5 D#5/.5 E5/.5 B4/.5 D5/.5 C5/1.5 | A4/1 R/.5 C4/.5 E4/.5 A4/.5 R/1 | ' +
    'B4/1 R/.5 E4/.5 C5/.5 B4/.5 R/1 | ' + ending,
    'Am:4 Am:4 E:4 Am:4 Am:4 Am:4 E:4 Am:4',
    'R/4 | A2/.5 E3/.5 A3/.5 R/2.5 | E2/.5 E3/.5 G#3/.5 R/2.5 | A2/.5 E3/.5 A3/.5 R/2.5 | ' +
    'R/4 | A2/.5 E3/.5 A3/.5 R/2.5 | E2/.5 E3/.5 G#3/.5 R/2.5 | A2/.5 E3/.5 A3/.5 R/2.5');
  const ELISE_B = sec(
    'E5/1.5 R/1 G4/.5 F5/.5 E5/.5 | D5/1.5 R/1 F4/.5 E5/.5 D5/.5 | C5/1.5 R/1 E4/.5 D5/.5 C5/.5 | B4/2 R/1 E5/.5 D#5/.5',
    'C:4 G:4 Am:4 E:4',
    'C3/.5 G3/.5 C4/.5 R/2.5 | G2/.5 G3/.5 B3/.5 R/2.5 | A2/.5 E3/.5 A3/.5 R/2.5 | E2/.5 E3/.5 G#3/.5 R/2.5');
  const PICK = 'A4/3 E5/.5 D#5/.5', TO_B = 'A4/1.5 R/1 B4/.5 C5/.5 D5/.5', FINE = 'A4/4';

  // ── 생일 축하합니다 (3/4) ──
  const BDAY = (ending) => sec(
    'A4 G4 C5 | B4/2 G4/.75 G4/.25 | A4 G4 D5 | C5/2 G4/.75 G4/.25 | G5 E5 C5 | B4 A4 F5/.75 F5/.25 | E5 C5 D5 | ' + ending,
    'C:3 G:3 G:3 C:3 C:3 F:3 C:2 G:1 C:3');

  // ── 음계 연습 ──
  const SCALE_1 = sec(
    'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 | ' +
    'C4/.5 D4/.5 E4/.5 F4/.5 G4/.5 A4/.5 B4/.5 C5/.5 | C5/.5 B4/.5 A4/.5 G4/.5 F4/.5 E4/.5 D4/.5 C4/.5 | C4/4',
    'C:4 G:4 F:2 G:2 G:2 C:2 C:4 C:4 C:4');
  const SCALE_2 = sec(
    'C4/.5 D4/.5 E4/.5 F4/.5 G4/.5 A4/.5 B4/.5 C5/.5 | D5/.5 E5/.5 F5/.5 G5/.5 A5/.5 B5/.5 C6/1 | ' +
    'C6/.5 B5/.5 A5/.5 G5/.5 F5/.5 E5/.5 D5/.5 C5/.5 | B4/.5 A4/.5 G4/.5 F4/.5 E4/.5 D4/.5 C4/1',
    'C:4 G:2 C:2 F:2 C:2 G:2 C:2');

  const list = [
    song('scale', 'C 장조 음계', '연습곡', 116, 'disco',
      [groove(INTRO), SCALE_1, SCALE_2, SCALE_2, SCALE_1]),
    song('butterfly', '나비야', '독일 민요', 118, 'latin',
      [groove(INTRO), BUTTERFLY, BUTTERFLY, groove(BREAK), up8(BUTTERFLY), BUTTERFLY]),
    song('lamb', '비행기', '미국 민요', 120, 'house',
      [groove(INTRO), LAMB, LAMB, groove(BREAK), up8(LAMB), up8(LAMB), LAMB]),
    song('twinkle', '반짝반짝 작은별', '프랑스 민요', 120, 'disco',
      [groove(INTRO), TWINKLE, TWINKLE, groove(BREAK), up8(TWINKLE), TWINKLE]),
    song('jingle', '징글벨', 'J. 피어폰트', 124, 'shuffle',
      [groove(INTRO), JINGLE_VERSE, JINGLE_CHORUS, groove(BREAK), JINGLE_VERSE, JINGLE_CHORUS, up8(JINGLE_CHORUS)]),
    song('ode', '환희의 송가', '베토벤', 124, 'rock',
      [groove(INTRO), ODE, ODE, groove(BREAK), up8(ODE), ODE]),
    song('saints', '성자의 행진', '미국 흑인 영가', 120, 'funk',
      [groove(INTRO), SAINTS, SAINTS, groove(BREAK), up8(SAINTS), SAINTS]),
    song('canon', '캐논', '파헬벨', 112, 'disco',
      [groove(CANON), CANON_1, CANON_2, CANON_ARP, up8(CANON_2), up8(CANON_1), CANON_ARP, CANON_2, sec('C5/4', 'C:4')]),
    song('elise', '엘리제를 위하여 (리믹스)', '베토벤', 120, 'house',
      [groove('Am:4 Am:4 E:4 E:4', 'R/12 R/3 E5/.5 D#5/.5'),
       ELISE_A(PICK), ELISE_A(TO_B), ELISE_B, ELISE_A(PICK), ELISE_A(FINE)]),
    song('birthday', '생일 축하합니다', '힐 자매', 110, 'disco',
      [groove('C:3 F:3 G:3 G:3', 'R/11 G4/.75 G4/.25'), BDAY('C5/2 G4/.75 G4/.25'), BDAY('C5/3'),
       groove('F:3 C:3 G:3 G:3', 'R/11 G5/.75 G5/.25'), up8(BDAY('C5/2 G4/.75 G4/.25')), up8(BDAY('C5/3'))],
      { bar: 3 }),
  ];

  // ───────────────────── electric-guitar songs ─────────────────────
  // 산왕의 궁전에서 (Grieg) — rock arrangement that keeps speeding up, like the original
  const MK_A = sec(
    'B3/.5 C#4/.5 D4/.5 E4/.5 F#4/.5 D4/.5 F#4/1 | F4/.5 C#4/.5 F4/1 E4/.5 C4/.5 E4/1 | ' +
    'B3/.5 C#4/.5 D4/.5 E4/.5 F#4/.5 D4/.5 F#4/.5 B4/.5 | A4/.5 F#4/.5 D4/.5 F#4/.5 A4/2',
    'Bm:4 F#:4 Bm:4 D:4');
  const MK_B = sec(
    'F#4/.5 G#4/.5 A4/.5 B4/.5 C#5/.5 A4/.5 C#5/1 | C5/.5 G#4/.5 C5/1 B4/.5 G4/.5 B4/1 | ' +
    'F#4/.5 G#4/.5 A4/.5 B4/.5 C#5/.5 A4/.5 C#5/.5 F#5/.5 | E5/.5 C#5/.5 A4/.5 C#5/.5 E5/2',
    'F#m:4 C#:4 F#m:4 A:4');
  const at = (it, bpm) => ({ ...it, bpm });
  list.push(song('mountainking', '산왕의 궁전에서', '그리그 · 록 편곡', 100, 'rock', [
    at(groove('Bm:4 Bm:4'), 100), at(MK_A, 100), at(MK_A, 108), at(MK_B, 116), at(MK_A, 124),
    at(up8(MK_A), 132), at(up8(MK_B), 140), at(up8(MK_A), 150), at(up8(MK_A), 160), at(up8(MK_A), 172),
    at(sec('B4/4', 'Bm:4'), 172),
  ], {}, { exclusive: 'guitar', tone: 'eguitar', melName: '리드 기타', melInst: 'eguitar', strings: false, rhythm: true }));

  // 로망스 (Spanish Romance) — melody on top of triplet arpeggios, 3/4
  const ARP = { Em: 'R/.3333 G3/.3333 B3/.3334', Am: 'R/.3333 A3/.3333 C4/.3334', B7: 'R/.3333 F#3/.3333 A3/.3334' };
  const arps = (ch) => prog(ch).map(([c, b]) => Array(b).fill(ARP[c]).join(' ')).join(' ');
  const ROM_CH = 'Em:3 Em:3 Em:3 Em:3 Em:3 Am:3 Am:3 Am:3 B7:3 B7:3 Em:3 Em:3';
  const ROM = { ...sec(
    'B4 B4 B4 | B4 A4 G4 | G4 F#4 E4 | E4 G4 B4 | E5 E5 E5 | E5 D5 C5 | C5 B4 A4 | A4 B4 C5 | ' +
    'B4 C5 B4 | A4 G4 F#4 | G4 F#4 E4 | E4/3', ROM_CH), acc: arps(ROM_CH) };
  list.push(song('romance', '로망스', '스페인 민요', 84, 'lofi', [
    { ch: 'Em:3 Em:3', acc: arps('Em:3 Em:3') }, ROM, ROM, up8(ROM), ROM,
  ], { bar: 3 }, { exclusive: 'guitar', tone: 'pluck', melName: '리드 기타', melInst: 'pluck',
                   accName: '아르페지오', accInst: 'pluck', bass: 'root' }));

  const DRUM_STYLES = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.name]));
  return { list, noteToMidi, midiName, makeDrums, discoDrums, DRUM_STYLES };
})();
