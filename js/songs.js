// Built-in songs (public domain) written in a tiny text notation.
//   "C4/1"  note + duration in beats (quarter = 1). Duration defaults to 1.
//   "C4+E4/2" chord,  "R/0.5" rest,  "|" bar line (ignored)
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

  function song(id, title, artist, bpm, parts) {
    return {
      id, title, artist, builtin: true,
      parts: parts.map(p => ({ name: p.name, role: p.role, notes: seq(p.notes, bpm, p.vel), isDrum: false, program: 0 })),
    };
  }

  const list = [
    song('scale', 'C 장조 음계', '연습곡', 90, [
      { name: '오른손', role: 'play', notes:
        'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 | ' +
        'C4/.5 D4/.5 E4/.5 F4/.5 G4/.5 A4/.5 B4/.5 C5/.5 | C5/.5 B4/.5 A4/.5 G4/.5 F4/.5 E4/.5 D4/.5 C4/.5 | C4/4' },
    ]),
    song('twinkle', '반짝반짝 작은별', '프랑스 민요', 100, [
      { name: '오른손 (멜로디)', role: 'play', notes:
        'C4 C4 G4 G4 | A4 A4 G4/2 | F4 F4 E4 E4 | D4 D4 C4/2 | ' +
        'G4 G4 F4 F4 | E4 E4 D4/2 | G4 G4 F4 F4 | E4 E4 D4/2 | ' +
        'C4 C4 G4 G4 | A4 A4 G4/2 | F4 F4 E4 E4 | D4 D4 C4/2' },
      { name: '왼손 (반주)', role: 'accomp', vel: 0.6, notes:
        'C3+G3/4 | F3+A3/2 C3+G3/2 | F3+A3/2 C3+G3/2 | G2+D3/2 C3+G3/2 | ' +
        'C3+G3/2 F3+A3/2 | C3+G3/2 G2+D3/2 | C3+G3/2 F3+A3/2 | C3+G3/2 G2+D3/2 | ' +
        'C3+G3/4 | F3+A3/2 C3+G3/2 | F3+A3/2 C3+G3/2 | G2+D3/2 C3+G3/2' },
    ]),
    song('ode', '환희의 송가', '베토벤', 110, [
      { name: '오른손 (멜로디)', role: 'play', notes:
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4/1.5 D4/.5 D4/2 | ' +
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/1.5 C4/.5 C4/2 | ' +
        'D4 D4 E4 C4 | D4 E4/.5 F4/.5 E4 C4 | D4 E4/.5 F4/.5 E4 D4 | C4 D4 G3/2 | ' +
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4/1.5 C4/.5 C4/2' },
      { name: '왼손 (반주)', role: 'accomp', vel: 0.55, notes:
        'C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/4 | ' +
        'C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/2 C3+G3/2 | ' +
        'G2+D3/2 C3+G3/2 | G2+D3/2 C3+G3/2 | G2+D3/2 C3+G3/1 G2+D3/1 | C3+G3/2 G2+D3/2 | ' +
        'C3+G3/4 | G2+D3/4 | C3+G3/4 | G2+D3/2 C3+G3/2' },
    ]),
    song('elise', '엘리제를 위하여 (도입부)', '베토벤', 72, [
      { name: '오른손', role: 'play', notes:
        'E5/.25 D#5/.25 | E5/.25 D#5/.25 E5/.25 B4/.25 D5/.25 C5/.25 | ' +
        'A4/.5 R/.25 C4/.25 E4/.25 A4/.25 | B4/.5 R/.25 E4/.25 G#4/.25 B4/.25 | ' +
        'C5/.5 R/.25 E4/.25 E5/.25 D#5/.25 | E5/.25 D#5/.25 E5/.25 B4/.25 D5/.25 C5/.25 | ' +
        'A4/.5 R/.25 C4/.25 E4/.25 A4/.25 | B4/.5 R/.25 E4/.25 C5/.25 B4/.25 | A4/1.5' },
      { name: '왼손', role: 'accomp', vel: 0.6, notes:
        'R/.5 | R/1.5 | ' +
        'A2/.25 E3/.25 A3/.25 R/.75 | E2/.25 E3/.25 G#3/.25 R/.75 | ' +
        'A2/.25 E3/.25 A3/.25 R/.75 | R/1.5 | ' +
        'A2/.25 E3/.25 A3/.25 R/.75 | E2/.25 E3/.25 G#3/.25 R/.75 | A2/.25 E3/.25 A3/1' },
    ]),
  ];

  return { list, noteToMidi, midiName };
})();
