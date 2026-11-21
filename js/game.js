// Core gameplay: chart setup, timing/judgement, rendering.
window.Game = (function () {
  const WIN = { COOL: 0.045, GOOD: 0.09, BAD: 0.15 };           // seconds (±)
  const JUDGE = {
    COOL: { score: 300, hp: 1.0, acc: 100, color: '#7df9ff' },
    GOOD: { score: 150, hp: 0.4, acc: 65, color: '#8dff8a' },
    BAD:  { score: 50,  hp: -2,  acc: 25, color: '#ffcf5a' },
    MISS: { score: 0,   hp: -6,  acc: 0,  color: '#ff5f6d' },
  };
  // 도 레 미 파 솔 라 시 colours
  const COLORS = ['#ff5a5f', '#ff9f43', '#ffd93d', '#4cd964', '#34c6f4', '#5b7cfa', '#b06cf5'];
  const PC_TO_WHITE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const SOLFEGE = ['도', '레', '미', '파', '솔', '라', '시'];
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LONG_MIN = 0.8;   // seconds; longer notes become hold notes
  const LEAD_IN = 2.5;    // seconds before t=0

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.round(v * k).toString(16).padStart(2, '0');
    return '#' + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  }

  class Game {
    constructor(canvas) {
      this.cv = canvas;
      this.g = canvas.getContext('2d');
      this.running = false;
      this.paused = false;
      this.onFinish = null;
      this.resize();
      addEventListener('resize', () => this.resize());
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      this.W = innerWidth; this.H = innerHeight;
      this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
      this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
      this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.notes) this.layout();
    }

    laneOf(midi) { return this.mode === 'seven' ? PC_TO_WHITE[midi % 12] : midi; }

    setup(chart, opts) {
      this.opts = opts;
      this.mode = opts.mode;
      this.title = chart.title;
      const rate = opts.rate || 1;

      const play = chart.play.map(n => ({ time: n.time / rate, dur: n.dur / rate, midi: n.midi }))
        .sort((a, b) => a.time - b.time || a.midi - b.midi);

      if (this.mode === 'piano') {
        let lo = 127, hi = 0;
        for (const n of play) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
        lo -= lo % 12; hi = hi - (hi % 12) + 11;
        while (hi - lo + 1 < 24) { if (hi + 12 <= 119) hi += 12; else lo -= 12; }
        this.lo = Math.max(21, lo); this.hi = Math.min(108, hi);
      }

      // per-lane queues: merge near-simultaneous duplicates, trim overlaps
      const byLane = new Map();
      for (const n of play) {
        const L = this.laneOf(n.midi);
        if (!byLane.has(L)) byLane.set(L, []);
        const arr = byLane.get(L);
        const prev = arr[arr.length - 1];
        if (prev && n.time - prev.time < 0.04) { prev.dur = Math.max(prev.dur, n.dur); continue; }
        if (prev && prev.time + prev.dur > n.time - 0.06) prev.dur = Math.max(0, n.time - 0.06 - prev.time);
        arr.push({ time: n.time, dur: n.dur, midi: n.midi, lane: L, state: 0, missed: false });
      }
      this.notes = [];
      this.queues = new Map();
      this.totalUnits = 0;
      for (const [L, arr] of byLane) {
        for (const n of arr) {
          n.long = !!opts.longNotes && n.dur >= LONG_MIN;
          this.totalUnits += n.long ? 2 : 1;
          this.notes.push(n);
        }
        this.queues.set(L, { arr, ptr: 0 });
      }
      this.notes.sort((a, b) => a.time - b.time);

      this.accomp = chart.accomp.map(n => ({ time: n.time / rate, dur: n.dur / rate, midi: n.midi, vel: n.vel ?? 0.7 }))
        .sort((a, b) => a.time - b.time);
      this.accPtr = 0;

      let end = 0;
      for (const n of this.notes) end = Math.max(end, n.time + n.dur);
      for (const n of this.accomp) end = Math.max(end, n.time + n.dur);
      this.endTime = end + 1.5;

      this.counts = { COOL: 0, GOOD: 0, BAD: 0, MISS: 0 };
      this.fast = 0; this.slow = 0;
      this.combo = 0; this.maxCombo = 0; this.score = 0; this.hp = 100;
      this.judged = 0; this.accPts = 0;
      this.pressed = new Map();   // lane -> Set(midi)
      this.holding = new Map();   // lane -> note
      this.keysDown = new Set();  // midi (for drawing piano keys)
      this.effects = [];
      this.judgeText = null;
      this.drawStart = 0;
      this.failed = false;

      // computer keyboard mapping for this mode
      const kb = Input.keyboard;
      kb.mode = this.mode;
      if (this.mode === 'piano') {
        kb.min = this.lo; kb.max = this.hi;
        let base = Math.max(this.lo, Math.min(60, this.hi - 16));
        base -= base % 12;
        if (base < this.lo) base += 12;
        kb.base = base;
      }
      this.layout();
    }

    layout() {
      const { W, H } = this;
      this.rects = new Map();
      if (this.mode === 'seven') {
        this.fw = Math.min(560, W - 80);
        this.kbH = 84;
        this.fx = (W - this.fw) / 2;
        const lw = this.fw / 7;
        for (let i = 0; i < 7; i++) this.rects.set(i, { x: this.fx + i * lw, w: lw, black: false });
        this.headH = 16;
      } else {
        let whites = 0;
        for (let m = this.lo; m <= this.hi; m++) if (!IS_BLACK[m % 12]) whites++;
        this.fw = Math.min(W - 80, Math.max(640, whites * 30));
        this.fx = (W - this.fw) / 2;
        const ww = this.fw / whites;
        this.kbH = Math.max(80, Math.min(150, ww * 4.6));
        let wi = 0;
        for (let m = this.lo; m <= this.hi; m++) {
          if (IS_BLACK[m % 12]) this.rects.set(m, { x: this.fx + wi * ww - ww * 0.31, w: ww * 0.62, black: true });
          else { this.rects.set(m, { x: this.fx + wi * ww, w: ww, black: false }); wi++; }
        }
        this.headH = 12;
      }
      this.judgeY = H - this.kbH - 18;
    }

    noteColor(midi) {
      const c = COLORS[PC_TO_WHITE[midi % 12]];
      return this.mode === 'piano' && IS_BLACK[midi % 12] ? shade(c, 0.7) : c;
    }

    // ── clock ──
    // Audio is scheduled on the AudioContext clock; visuals/judgement use performance.now().
    // Both are aligned at start; `lat` compensates the audio output latency.
    songTime(perfMs = performance.now()) {
      return (perfMs - this.perfStart) / 1000 - LEAD_IN - this.lat;
    }

    start() {
      const ctx = Sound.ctx;
      this.bus = Sound.createBus(0.8);
      this.lat = ctx.outputLatency || ctx.baseLatency || 0;
      this.ctxStart = ctx.currentTime + 0.1;
      this.perfStart = performance.now() + 100;
      this.running = true;
      this.paused = false;
      const loop = () => {
        if (!this.running) return;
        if (!this.paused) {
          const t = this.songTime();
          this.update(t);
          if (this.running) this.render(t);
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    pause() {
      if (!this.running || this.paused) return;
      this.paused = true;
      this.pausedAt = performance.now();
      Sound.allOff();
      Sound.ctx.suspend();
    }

    async resume() {
      if (!this.paused) return;
      await Sound.ctx.resume();
      this.perfStart += performance.now() - this.pausedAt;
      this.paused = false;
    }

    stop() {
      this.running = false;
      this.paused = false;
      Sound.killBus(this.bus);
      Sound.allOff();
      if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();
    }

    // ── input ──
    keySoundOn(src) {
      const k = this.opts.keySound;
      return k === 'on' || (k === 'auto' && src === 'key');
    }

    noteOn(midi, vel, ts, src) {
      if (!this.running || this.paused) return;
      if (this.keySoundOn(src)) Sound.noteOn(midi, vel);
      this.keysDown.add(midi);
      const lane = this.laneOf(midi);
      if (!this.rects.has(lane)) return;
      if (!this.pressed.has(lane)) this.pressed.set(lane, new Set());
      this.pressed.get(lane).add(midi);
      if (this.opts.autoplay) return;
      const t = this.songTime(ts) - this.opts.offset / 1000;
      this.press(lane, t, false);
    }

    noteOff(midi, ts, src) {
      Sound.noteOff(midi);
      this.keysDown.delete(midi);
      if (!this.running) return;
      const lane = this.laneOf(midi);
      const set = this.pressed.get(lane);
      if (!set) return;
      set.delete(midi);
      if (set.size === 0 && !this.opts.autoplay) {
        this.release(lane, this.songTime(ts) - this.opts.offset / 1000);
      }
    }

    press(lane, t, auto) {
      const q = this.queues.get(lane);
      if (!q) return;
      for (let i = q.ptr; i < q.arr.length; i++) {
        const n = q.arr[i];
        if (n.state !== 0) continue;
        const d = t - n.time;
        if (d > WIN.BAD) { this.missNote(n); continue; }
        if (d < -WIN.BAD) return; // too early: ignore, no penalty
        const a = Math.abs(d);
        const res = auto ? 'COOL' : a <= WIN.COOL ? 'COOL' : a <= WIN.GOOD ? 'GOOD' : 'BAD';
        this.judge(res, d);
        this.effects.push({ lane, at: performance.now(), color: JUDGE[res].color });
        if (n.long) { n.state = 1; this.holding.set(lane, n); }
        else n.state = 2;
        return;
      }
    }

    release(lane, t) {
      const n = this.holding.get(lane);
      if (!n) return;
      this.holding.delete(lane);
      n.state = 2;
      if (t < n.time + n.dur - Math.max(0.2, n.dur * 0.25)) { n.missed = true; this.judge('MISS'); }
      else this.judge('COOL');
    }

    completeHold(lane, n) {
      this.holding.delete(lane);
      n.state = 2;
      this.judge('COOL');
      this.effects.push({ lane, at: performance.now(), color: JUDGE.COOL.color });
    }

    missNote(n) {
      n.state = 2;
      n.missed = true;
      this.judge('MISS');
      if (n.long) this.judge('MISS');
    }

    judge(res, delta) {
      const j = JUDGE[res];
      this.counts[res]++;
      this.judged++;
      this.accPts += j.acc;
      if (res === 'MISS') this.combo = 0;
      else {
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.score += j.score + Math.min(this.combo, 200);
      }
      if ((res === 'GOOD' || res === 'BAD') && delta !== undefined) {
        if (delta < 0) this.fast++; else this.slow++;
      }
      this.hp = Math.max(0, Math.min(100, this.hp + j.hp));
      this.judgeText = { res, at: performance.now(), delta: res === 'GOOD' || res === 'BAD' ? delta : undefined };
    }

    // ── update ──
    update(t) {
      // accompaniment: schedule ~0.8s ahead on the audio clock
      while (this.accPtr < this.accomp.length && this.accomp[this.accPtr].time < t + 0.8) {
        const a = this.accomp[this.accPtr++];
        if (a.time < t - 0.05) continue;
        Sound.playAt(a.midi, this.ctxStart + LEAD_IN + a.time, a.dur, a.vel * 0.7, this.bus);
      }

      if (this.opts.autoplay) {
        for (const [lane, q] of this.queues) {
          for (let i = q.ptr; i < q.arr.length && q.arr[i].time <= t; i++) {
            const n = q.arr[i];
            if (n.state !== 0) continue;
            const h = this.holding.get(lane);
            if (h) this.completeHold(lane, h);
            Sound.playAt(n.midi, this.ctxStart + LEAD_IN + n.time, n.dur, 0.75, this.bus);
            this.press(lane, n.time, true);
          }
        }
      }

      // misses & queue pointers
      for (const q of this.queues.values()) {
        while (q.ptr < q.arr.length) {
          const n = q.arr[q.ptr];
          if (n.state === 0 && t > n.time + WIN.BAD) this.missNote(n);
          if (n.state === 2) q.ptr++;
          else break;
        }
      }

      // completed holds
      for (const [lane, n] of this.holding) {
        if (t >= n.time + n.dur) this.completeHold(lane, n);
      }

      if (this.hp <= 0 && !this.opts.noFail) { this.failed = true; this.finish(); return; }
      if (t > this.endTime) this.finish();
    }

    finish() {
      this.stop();
      const acc = this.judged ? this.accPts / this.judged : 0;
      const fullAcc = this.totalUnits ? this.accPts / this.totalUnits : 0;
      const a = Math.min(acc, fullAcc || acc);
      const rank = this.failed ? 'F' : a >= 95 ? 'S' : a >= 90 ? 'A' : a >= 80 ? 'B' : a >= 70 ? 'C' : 'D';
      this.onFinish && this.onFinish({
        title: this.title, score: this.score, accuracy: a, rank,
        counts: this.counts, maxCombo: this.maxCombo, fast: this.fast, slow: this.slow,
        failed: this.failed, autoplay: !!this.opts.autoplay,
        fullCombo: !this.failed && this.counts.MISS === 0 && this.judged > 0,
      });
    }

    // ── render ──
    render(t) {
      const { g, W, H, fx, fw, judgeY } = this;
      const now = performance.now();
      g.fillStyle = '#07080f';
      g.fillRect(0, 0, W, H);

      const bg = g.createLinearGradient(0, 0, 0, judgeY);
      bg.addColorStop(0, '#090b16'); bg.addColorStop(1, '#151b36');
      g.fillStyle = bg;
      g.fillRect(fx, 0, fw, judgeY);

      this.drawLanes();

      // notes
      const pps = 250 * this.opts.speed;
      const ahead = judgeY / pps + 0.2;
      while (this.drawStart < this.notes.length) {
        const n = this.notes[this.drawStart];
        if (n.state === 2 && n.time + n.dur < t - 3) this.drawStart++; else break;
      }
      this.due = new Set();
      for (let i = this.drawStart; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.time > t + ahead) break;
        if (n.state === 0 && n.time - t < 0.3 && n.time - t > -0.1) this.due.add(n.lane);
        this.drawNote(n, t, pps);
      }

      // judge line
      g.save();
      g.shadowColor = '#7df9ff'; g.shadowBlur = 14;
      g.fillStyle = 'rgba(220,250,255,0.95)';
      g.fillRect(fx, judgeY - 2, fw, 3);
      g.restore();

      this.drawKeyboard();
      this.drawEffects(now);
      this.drawHUD(t, now);
    }

    drawLanes() {
      const { g, judgeY } = this;
      if (this.mode === 'seven') {
        for (let i = 0; i < 7; i++) {
          const r = this.rects.get(i);
          if (i % 2) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(r.x, 0, r.w, judgeY); }
          g.fillStyle = 'rgba(255,255,255,0.07)';
          g.fillRect(r.x, 0, 1, judgeY);
          if (this.pressed.get(i)?.size) this.beam(r, COLORS[i]);
        }
        g.fillRect(this.fx + this.fw - 1, 0, 1, judgeY);
      } else {
        for (const [m, r] of this.rects) {
          if (r.black) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(r.x, 0, r.w, judgeY); }
          else {
            g.fillStyle = m % 12 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.045)';
            g.fillRect(r.x, 0, 1, judgeY);
          }
        }
        for (const [m, r] of this.rects) if (this.pressed.get(m)?.size) this.beam(r, this.noteColor(m));
      }
    }

    beam(r, col) {
      const { g, judgeY } = this;
      const gr = g.createLinearGradient(0, judgeY, 0, judgeY - 320);
      gr.addColorStop(0, rgba(col, 0.38)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(r.x, judgeY - 320, r.w, 320);
    }

    drawNote(n, t, pps) {
      if (n.state === 2 && !n.missed) return;
      const { g, judgeY, headH } = this;
      const r = this.rects.get(n.lane);
      if (!r) return;
      const col = this.mode === 'seven' ? COLORS[n.lane] : this.noteColor(n.midi);
      let yHead = judgeY - (n.time - t) * pps;
      if (n.state === 1) yHead = judgeY;
      if (yHead - headH > this.H) return;
      const pad = r.black ? 1 : Math.max(2, r.w * 0.06);
      const x = r.x + pad, w = r.w - pad * 2;
      g.globalAlpha = n.missed ? 0.28 : 1;

      if (n.long) {
        const yEnd = judgeY - (n.time + n.dur - t) * pps;
        if (yEnd < yHead) {
          const bw = w * 0.72, bx = x + (w - bw) / 2;
          g.fillStyle = rgba(col, n.state === 1 ? 0.75 : 0.45);
          g.fillRect(bx, yEnd, bw, yHead - yEnd);
          g.fillStyle = rgba(col, 0.9);
          g.fillRect(bx, yEnd, bw, 4);
        }
      }
      g.fillStyle = col;
      roundRect(g, x, yHead - headH, w, headH, Math.min(5, headH / 2));
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x + 3, yHead - headH + 2, w - 6, 2);
      g.globalAlpha = 1;
    }

    drawKeyboard() {
      const { g, judgeY, kbH } = this;
      const y0 = judgeY + 6;
      if (this.mode === 'seven') {
        for (let i = 0; i < 7; i++) {
          const r = this.rects.get(i);
          const on = this.pressed.get(i)?.size > 0;
          g.fillStyle = on ? COLORS[i] : this.due.has(i) ? rgba(COLORS[i], 0.28) : '#161a2e';
          roundRect(g, r.x + 3, y0, r.w - 6, kbH, 8); g.fill();
          g.strokeStyle = rgba(COLORS[i], 0.7); g.lineWidth = 2;
          roundRect(g, r.x + 3, y0, r.w - 6, kbH, 8); g.stroke();
          g.textAlign = 'center';
          g.fillStyle = on ? '#0b0d18' : '#e8eaf4';
          g.font = 'bold 22px "Malgun Gothic", sans-serif';
          g.fillText(SOLFEGE[i], r.x + r.w / 2, y0 + 34);
          g.font = '12px sans-serif';
          g.fillStyle = on ? '#0b0d18' : '#8b90a8';
          g.fillText(`${LETTERS[i]} · ${Input.SEVEN_KEYS[i]}`, r.x + r.w / 2, y0 + 58);
        }
        return;
      }
      // piano
      const blackH = kbH * 0.62;
      for (const [m, r] of this.rects) {
        if (r.black) continue;
        const on = this.keysDown.has(m);
        g.fillStyle = on ? this.noteColor(m) : '#eef0f7';
        g.fillRect(r.x + 0.5, y0, r.w - 1, kbH);
        if (!on && this.due.has(m)) { g.fillStyle = rgba(this.noteColor(m), 0.45); g.fillRect(r.x + 0.5, y0 + blackH, r.w - 1, kbH - blackH); }
        if (m % 12 === 0) {
          g.fillStyle = '#5a5f78'; g.font = `${Math.min(12, r.w * 0.45)}px sans-serif`; g.textAlign = 'center';
          g.fillText('C' + (m / 12 - 1), r.x + r.w / 2, y0 + kbH - 6);
        }
      }
      for (const [m, r] of this.rects) {
        if (!r.black) continue;
        const on = this.keysDown.has(m);
        g.fillStyle = on ? this.noteColor(m) : this.due.has(m) ? shade(this.noteColor(m), 0.6) : '#1b1d27';
        roundRect(g, r.x, y0, r.w, blackH, 3); g.fill();
      }
    }

    drawEffects(now) {
      const { g, judgeY } = this;
      g.save();
      g.globalCompositeOperation = 'lighter';
      this.effects = this.effects.filter(e => now - e.at < 280);
      for (const e of this.effects) {
        const r = this.rects.get(e.lane);
        if (!r) continue;
        const k = (now - e.at) / 280;
        const cx = r.x + r.w / 2;
        const rad = Math.max(r.w, 30) * (0.5 + k * 1.1);
        const gr = g.createRadialGradient(cx, judgeY, 0, cx, judgeY, rad);
        gr.addColorStop(0, rgba(e.color, 0.9 * (1 - k)));
        gr.addColorStop(1, rgba(e.color, 0));
        g.fillStyle = gr;
        g.fillRect(cx - rad, judgeY - rad, rad * 2, rad * 2);
      }
      g.restore();
    }

    drawHUD(t, now) {
      const { g, W, fx, fw, judgeY } = this;
      const cx = fx + fw / 2;

      // progress bar
      g.fillStyle = '#1a1e33'; g.fillRect(0, 0, W, 4);
      g.fillStyle = '#5b7cfa'; g.fillRect(0, 0, W * Math.max(0, Math.min(1, t / this.endTime)), 4);

      g.textAlign = 'left';
      g.fillStyle = '#e8eaf4'; g.font = 'bold 18px "Malgun Gothic", sans-serif';
      g.fillText(this.title, 20, 36);
      g.fillStyle = '#8b90a8'; g.font = '13px "Malgun Gothic", sans-serif';
      const rateTxt = this.opts.rate !== 1 ? ` · ${Math.round(this.opts.rate * 100)}%` : '';
      g.fillText((this.mode === 'seven' ? '7키 모드' : '피아노 모드') + rateTxt + (this.opts.autoplay ? ' · AUTO' : ''), 20, 58);
      if (this.mode === 'piano') g.fillText(`키보드 옥타브: C${Input.keyboard.base / 12 - 1} (Z/X)`, 20, 78);
      g.fillText('Esc: 일시정지', 20, this.H - 16);

      g.textAlign = 'right';
      g.fillStyle = '#e8eaf4'; g.font = 'bold 30px Consolas, monospace';
      g.fillText(String(this.score).padStart(7, '0'), W - 20, 44);
      g.fillStyle = '#8b90a8'; g.font = '15px Consolas, monospace';
      const acc = this.judged ? this.accPts / this.judged : 100;
      g.fillText(acc.toFixed(2) + '%', W - 20, 68);

      // HP gauge
      const hx = fx + fw + 14, hh = judgeY * 0.55, hy = judgeY - hh;
      g.fillStyle = '#1a1e33'; g.fillRect(hx, hy, 8, hh);
      g.fillStyle = this.hp > 50 ? '#4cd964' : this.hp > 25 ? '#ffcf5a' : '#ff5f6d';
      g.fillRect(hx, hy + hh * (1 - this.hp / 100), 8, hh * this.hp / 100);

      g.textAlign = 'center';
      if (t < 0) {
        g.fillStyle = '#e8eaf4'; g.font = 'bold 56px sans-serif';
        g.fillText(Math.ceil(-t), cx, judgeY * 0.42);
        g.font = '18px "Malgun Gothic", sans-serif'; g.fillStyle = '#8b90a8';
        g.fillText('준비', cx, judgeY * 0.42 + 34);
      }

      if (this.combo >= 2) {
        g.fillStyle = 'rgba(232,234,244,0.92)'; g.font = 'bold 64px sans-serif';
        g.fillText(this.combo, cx, judgeY * 0.36);
        g.font = 'bold 14px sans-serif'; g.fillStyle = '#8b90a8';
        g.fillText('COMBO', cx, judgeY * 0.36 + 22);
      }

      const jt = this.judgeText;
      if (jt) {
        const age = (now - jt.at) / 1000;
        if (age < 0.6) {
          const s = 1 + Math.max(0, 0.12 - age) * 2.5;
          g.save();
          g.globalAlpha = 1 - Math.max(0, age - 0.35) / 0.25;
          g.translate(cx, judgeY * 0.52);
          g.scale(s, s);
          g.fillStyle = JUDGE[jt.res].color;
          g.shadowColor = JUDGE[jt.res].color; g.shadowBlur = 18;
          g.font = 'italic 900 44px sans-serif';
          g.fillText(jt.res, 0, 0);
          if (jt.delta !== undefined) {
            g.shadowBlur = 0; g.font = 'bold 14px sans-serif';
            g.fillStyle = jt.delta < 0 ? '#34c6f4' : '#ff9f43';
            g.fillText(jt.delta < 0 ? 'FAST' : 'SLOW', 0, 24);
          }
          g.restore();
        }
      }
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  return Game;
})();
