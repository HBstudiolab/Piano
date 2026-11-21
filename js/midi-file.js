// Standard MIDI File (.mid) parser → parts (track + channel) with notes in seconds.
window.MidiFile = (function () {
  function parse(buffer) {
    const d = new DataView(buffer);
    let p = 0;
    const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p++)); return s; };
    const u32 = () => { const v = d.getUint32(p); p += 4; return v; };
    const u16 = () => { const v = d.getUint16(p); p += 2; return v; };
    const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

    if (str(4) !== 'MThd') throw new Error('MIDI 파일이 아닙니다.');
    const hlen = u32();
    u16(); // format
    const ntrk = u16();
    const div = u16();
    p += hlen - 6;
    if (div & 0x8000) throw new Error('SMPTE 타임코드 방식 MIDI는 지원하지 않습니다.');

    const tempos = [];
    const timesigs = [];
    let maxTick = 0;
    const rawTracks = [];
    let tracksRead = 0;
    while (tracksRead < ntrk && p + 8 <= d.byteLength) {
      const id = str(4);
      const len = u32();
      const end = Math.min(p + len, d.byteLength);
      if (id !== 'MTrk') { p = end; continue; }
      tracksRead++;

      let tick = 0, status = 0, name = '';
      const notes = [];
      const open = {};
      const programs = {};
      while (p < end) {
        tick += vlq();
        let b = d.getUint8(p);
        if (b & 0x80) { status = b; p++; }
        else if (!status) { p++; continue; } // corrupt data: skip byte

        if (status === 0xFF) {
          const type = d.getUint8(p++);
          const l = vlq();
          if (type === 0x51 && l === 3) {
            tempos.push({ tick, mpq: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2) });
          } else if (type === 0x58 && l >= 2) {
            timesigs.push({ tick, num: d.getUint8(p), den: Math.pow(2, d.getUint8(p + 1)) });
          } else if (type === 0x03 && !name) {
            const bytes = new Uint8Array(buffer, p, l);
            try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
            catch { try { name = new TextDecoder('euc-kr').decode(bytes); } catch { name = ''; } }
            name = name.replace(/\0/g, '').trim();
          }
          p += l;
          status = 0;
          if (type === 0x2F) break;
        } else if (status === 0xF0 || status === 0xF7) {
          p += vlq();
          status = 0;
        } else {
          const hi = status & 0xF0, ch = status & 0x0F;
          const a = d.getUint8(p++);
          const v = (hi === 0xC0 || hi === 0xD0) ? 0 : d.getUint8(p++);
          const key = ch * 128 + a;
          if (hi === 0x90 && v > 0) {
            (open[key] || (open[key] = [])).push({ tick, vel: v });
          } else if (hi === 0x80 || (hi === 0x90 && v === 0)) {
            const st = open[key];
            if (st && st.length) {
              const s = st.shift();
              notes.push({ midi: a, ch, startTick: s.tick, endTick: tick, vel: s.vel });
              maxTick = Math.max(maxTick, tick);
            }
          } else if (hi === 0xC0 && programs[ch] === undefined) {
            programs[ch] = a;
          }
        }
      }
      // close dangling notes
      for (const key in open) {
        for (const s of open[key]) {
          notes.push({ midi: key % 128, ch: Math.floor(key / 128), startTick: s.tick, endTick: Math.max(tick, s.tick + div / 4), vel: s.vel });
        }
      }
      p = end;
      rawTracks.push({ name, notes, programs });
    }

    // tempo map
    tempos.sort((a, b) => a.tick - b.tick);
    if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, mpq: 500000 });
    let sec = 0;
    for (let i = 0; i < tempos.length; i++) {
      if (i > 0) sec += (tempos[i].tick - tempos[i - 1].tick) * tempos[i - 1].mpq / 1e6 / div;
      tempos[i].sec = sec;
    }
    const toSec = (tick) => {
      let lo = 0, hi = tempos.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tempos[m].tick <= tick) lo = m; else hi = m - 1; }
      const t = tempos[lo];
      return t.sec + (tick - t.tick) * t.mpq / 1e6 / div;
    };

    // split into parts by track + channel
    const parts = [];
    rawTracks.forEach((tr, ti) => {
      const byCh = {};
      for (const n of tr.notes) (byCh[n.ch] || (byCh[n.ch] = [])).push(n);
      const chans = Object.keys(byCh).map(Number);
      for (const ch of chans) {
        const notes = byCh[ch].map(n => {
          const time = toSec(n.startTick);
          return { time, dur: Math.max(0.05, toSec(n.endTick) - time), midi: n.midi, vel: n.vel / 127 };
        }).sort((a, b) => a.time - b.time || a.midi - b.midi);
        let name = tr.name || `트랙 ${ti + 1}`;
        if (chans.length > 1) name += ` (ch ${ch + 1})`;
        parts.push({ name, channel: ch, program: tr.programs[ch] ?? null, isDrum: ch === 9, notes });
      }
    });

    // bar lines from time signatures (default 4/4)
    timesigs.sort((a, b) => a.tick - b.tick);
    if (!timesigs.length || timesigs[0].tick > 0) timesigs.unshift({ tick: 0, num: 4, den: 4 });
    let bars = [];
    for (let i = 0; i < timesigs.length; i++) {
      const ts = timesigs[i];
      const endTick = i + 1 < timesigs.length ? timesigs[i + 1].tick : maxTick + 1;
      const step = Math.max(1, ts.num * div * 4 / ts.den);
      for (let tk = ts.tick; tk < endTick; tk += step) bars.push(toSec(tk));
    }

    // trim leading silence so the first note isn't far away
    let first = Infinity;
    for (const pt of parts) if (pt.notes.length) first = Math.min(first, pt.notes[0].time);
    if (first > 1 && first !== Infinity) {
      const shift = first - 1;
      for (const pt of parts) for (const n of pt.notes) n.time -= shift;
      bars = bars.map(b => b - shift).filter(b => b >= -0.01);
    }
    return { parts, bars, beatSec: tempos[0].mpq / 1e6 };
  }

  return { parse };
})();
