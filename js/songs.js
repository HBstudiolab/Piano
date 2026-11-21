// Built-in songs (public domain) arranged with a disco backing band.
// Notation:  "C4/1" note + duration in beats (quarter = 1, default 1),  "C4+E4/2" chord,  "R/.5" rest,  "|" ignored.
// Backing strings / bass come from a chord progression "C:4 F:2 G:2"; drums from the bar grid (discoDrums).
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

  // ── disco drums (GM: 36 kick, 38 snare, 39 clap, 42 closed hat, 46 open hat, 49 crash, 45/41 toms) ──
  // Four-on-the-floor kick, snare+clap on 2 & 4, open hat on every off-beat ("츠"), 16th closed hats,
  // a fill every 4th bar, crash every 8 bars, and a final kick+crash on the song's last note.
  function discoDrums(bars, finalAt, beatSec) {
    const notes = [];
    const hit = (t, m, v) => { if (t >= 0 && t < finalAt - 0.01) notes.push({ time: t, dur: 0.1, midi: m, vel: v }); };
    const grid = bars.slice();
    if (!grid.length) grid.push(0);
    while (grid[grid.length - 1] < finalAt) grid.push(grid[grid.length - 1] + 4 * beatSec);

    // pickup before the first bar: snare roll
    if (grid[0] > beatSec * 0.4) {
      const step = beatSec / 4, n = Math.floor(grid[0] / step);
      for (let j = 0; j < n; j++) hit(grid[0] - (n - j) * step, 38, 0.35 + 0.5 * j / n);
    }
    for (let i = 0; i + 1 < grid.length; i++) {
      const b0 = grid[i], b1 = grid[i + 1];
      const nb = Math.max(1, Math.min(12, Math.round((b1 - b0) / beatSec)));
      const bl = (b1 - b0) / nb;
      for (let k = 0; k < nb; k++) {
        const t = b0 + k * bl;
        if (i % 4 === 3 && k === nb - 1 && nb >= 3) {        // fill on the last beat of every 4th bar
          [38, 38, 45, 41].forEach((m, j) => hit(t + j * bl / 4, m, 0.7 + j * 0.08));
          hit(t, 36, 0.9);
          continue;
        }
        hit(t, 36, 1);                                        // 쿵
        if (k === 0 && i % 8 === 0) hit(t, 49, 0.75);
        if (k % 2 === 1) { hit(t, 38, 0.75); hit(t, 39, 0.8); } // 짝
        hit(t, 42, 0.45);
        hit(t + bl / 4, 42, 0.25);
        hit(t + bl / 2, 46, 0.6);                             // 츠
        hit(t + bl * 3 / 4, 42, 0.25);
      }
    }
    notes.push({ time: finalAt, dur: 0.1, midi: 36, vel: 1 }, { time: finalAt, dur: 0.1, midi: 49, vel: 0.9 });
    return notes;
  }

  // ── strings / bass from a chord progression ──
  const CHORD = { C: 'E3+G3+C4', F: 'F3+A3+C4', G: 'D3+G3+B3', Am: 'E3+A3+C4', E: 'E3+G#3+B3', Dm: 'F3+A3+D4' };
  const ROOT = { C: 'C2', F: 'F2', G: 'G2', Am: 'A2', E: 'E2', Dm: 'D2' };
  const up = (n) => n.replace(/\d$/, d => +d + 1);
  const prog = (p) => p.trim().split(/\s+/).map(t => { const [c, b] = t.split(':'); return [c, parseFloat(b)]; });
  const strings = (p) => prog(p).map(([c, b]) => c === 'R' ? `R/${b}` : `${CHORD[c]}/${b}`).join(' ');
  // disco octave bass: low-high eighth notes ("둥둥")
  const bass = (p) => prog(p).map(([c, b], i, all) => {
    if (c === 'R') return `R/${b}`;
    const r = ROOT[c], out = [];
    if (i === all.length - 1) return `${r}/${b}`;             // last chord: one held root
    for (let k = 0; k < b * 2; k++) out.push(`${k % 2 ? up(r) : r}/.5`);
    return out.join(' ');
  }).join(' ');

  function song(id, title, artist, bpm, parts, meter = {}) {
    const bar = meter.bar || 4, pickup = meter.pickup || 0;
    const spb = 60 / bpm;
    const ps = parts.map(p => ({
      name: p.name, role: p.role, inst: p.inst || 'piano', isDrum: false,
      program: null, notes: seq(p.notes, bpm, p.vel),
    }));
    let end = 0, finalAt = 0;
    for (const p of ps) for (const n of p.notes) {
      end = Math.max(end, n.time + n.dur);
      if (p.role === 'play') finalAt = Math.max(finalAt, n.time);   // ending hit lands on the melody's last note
    }
    const bars = [];
    for (let b = pickup; b * spb <= end + 0.01; b += bar) bars.push(b * spb);
    ps.push({ name: '디스코 드럼', role: 'accomp', inst: 'drum', isDrum: true, program: null,
              notes: discoDrums(bars, finalAt, spb) });
    return { id, title, artist, builtin: true, parts: ps, bars, beatSec: spb };
  }

  const TWINKLE = 'C:4 F:2 C:2 F:2 C:2 G:2 C:2 C:2 F:2 C:2 G:2 C:2 F:2 C:2 G:2 C:4 F:2 C:2 F:2 C:2 G:2 C:2';
  const ODE = 'C:4 G:4 C:4 G:4 C:4 G:4 C:4 G:2 C:2 G:2 C:2 G:2 C:2 G:2 C:1 G:1 C:2 G:2 C:4 G:4 C:4 G:2 C:2';
  const SCALE = 'C:4 G:4 F:2 G:2 G:2 C:2 C:4 C:4 C:4';
  const ELISE = 'R:1 Am:4 Am:4 E:4 Am:4 Am:4 Am:4 E:4 Am:4';

  const list = [
    song('scale', 'C 장조 음계', '연습곡 · 디스코', 116, [
      { name: '오른손', role: 'play', notes:
        'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 | ' +
        'C4/.5 D4/.5 E4/.5 F4/.5 G4/.5 A4/.5 B4/.5 C5/.5 | C5/.5 B4/.5 A4/.5 G4/.5 F4/.5 E4/.5 D4/.5 C4/.5 | C4/4' },
      { name: '스트링', role: 'accomp', inst: 'strings', vel: 0.4, notes: strings(SCALE) },
      { name: '베이스', role: 'accomp', inst: 'bass', vel: 0.6, notes: bass(SCALE) },
    ]),
    song('twinkle', '반짝반짝 작은별', '프랑스 민요 · 디스코', 120, [
      { name: '오른손 (멜로디)', role: 'play', notes:
        'C4 C4 G4 G4 | A4 A4 G4/2 | F4 F4 E4 E4 | D4 D4 C4/2 | ' +
        'G4 G4 F4 F4 | E4 E4 D4/2 | G4 G4 F4 F4 | E4 E4 D4/2 | ' +
        'C4 C4 G4 G4 | A4 A4 G4/2 | F4 F4 E4 E4 | D4 D4 C4/2' },
      { name: '왼손 (피아노 반주)', role: 'accomp', vel: 0.5, notes:
        'C3+G3/4 | F3+A3/2 C3+G3/2 | F3+A3/2 C3+G3/2 | G2+D3/2 C3+G3/2 | ' +
        'C3+G3/2 F3+A3/2 | C3+G3/2 G2+D3/2 | C3+G3/2 F3+A3/2 | C3+G3/2 G2+D3/2 | ' +
        'C3+G3/4 | F3+A3/2 C3+G3/2 | F3+A3/2 C3+G3/2 | G2+D3/2 C3+G3/2' },
      { name: '스트링', role: 'accomp', inst: 'strings', vel: 0.4, notes: strings(TWINKLE) },
      { name: '베이스', role: 'accomp', inst: 'bass', vel: 0.6, notes: bass(TWINKLE) },
    ]),
    song('ode', '환희의 송가', '베토벤 · 디스코', 124, [
      { name: '오른손 (멜로디)', role: 'play', notes:
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/1.5 D4/.5 D4/2 | ' +
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/1.5 C4/.5 C4/2 | ' +
        'D4 D4 E4 C4 | D4 E4/.5 F4/.5 E4 C4 | D4 E4/.5 F4/.5 E4 D4 | C4 D4 G3/2 | ' +
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/1.5 C4/.5 C4/2' },
      { name: '왼손 (피아노 반주)', role: 'accomp', vel: 0.45, notes:
        'C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/4 | ' +
        'C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/2 C3+G3/2 | ' +
        'G2+D3/2 C3+G3/2 | G2+D3/2 C3+G3/2 | G2+D3/2 C3+G3/1 G2+D3/1 | C3+G3/2 G2+D3/2 | ' +
        'C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/2 C3+G3/2' },
      { name: '스트링', role: 'accomp', inst: 'strings', vel: 0.4, notes: strings(ODE) },
      { name: '베이스', role: 'accomp', inst: 'bass', vel: 0.6, notes: bass(ODE) },
    ]),
    // 3/8 original re-rhythmed into 4/4 so it grooves with the disco beat
    song('elise', '엘리제를 위하여 (디스코 리믹스)', '베토벤 · 디스코', 120, [
      { name: '오른손', role: 'play', notes:
        'E5/.5 D#5/.5 | E5/.5 D#5/.5 E5/.5 B4/.5 D5/.5 C5/1.5 | ' +
        'A4/1 R/.5 C4/.5 E4/.5 A4/.5 R/1 | B4/1 R/.5 E4/.5 G#4/.5 B4/.5 R/1 | ' +
        'C5/1 R/.5 E4/.5 R/1 E5/.5 D#5/.5 | E5/.5 D#5/.5 E5/.5 B4/.5 D5/.5 C5/1.5 | ' +
        'A4/1 R/.5 C4/.5 E4/.5 A4/.5 R/1 | B4/1 R/.5 E4/.5 C5/.5 B4/.5 R/1 | A4/4' },
      { name: '왼손', role: 'accomp', vel: 0.5, notes:
        'R/1 | R/4 | A2/.5 E3/.5 A3/.5 R/2.5 | E2/.5 E3/.5 G#3/.5 R/2.5 | A2/.5 E3/.5 A3/.5 R/2.5 | ' +
        'R/4 | A2/.5 E3/.5 A3/.5 R/2.5 | E2/.5 E3/.5 G#3/.5 R/2.5 | A2/.5 E3/.5 A3/3' },
      { name: '스트링', role: 'accomp', inst: 'strings', vel: 0.35, notes: strings(ELISE) },
      { name: '베이스', role: 'accomp', inst: 'bass', vel: 0.6, notes: bass(ELISE) },
    ], { bar: 4, pickup: 1 }),
  ];

  return { list, noteToMidi, midiName, discoDrums };
})();
