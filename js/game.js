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

  // blue → purple → pink light across the keyboard
  const GLOW_STOPS = [[0, '#2d5bff'], [0.3, '#5a3dff'], [0.55, '#9b3cff'], [0.8, '#d93cd0'], [1, '#ff3d7f']];
  function gradColor(p) {
    p = Math.max(0, Math.min(1, p));
    for (let i = 1; i < GLOW_STOPS.length; i++) {
      const [p1, c1] = GLOW_STOPS[i];
      if (p <= p1) {
        const [p0, c0] = GLOW_STOPS[i - 1];
        const k = (p - p0) / (p1 - p0);
        const a = parseInt(c0.slice(1), 16), b = parseInt(c1.slice(1), 16);
        const mix = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
        return '#' + [16, 8, 0].map(s => mix(s).toString(16).padStart(2, '0')).join('');
      }
    }
    return GLOW_STOPS[GLOW_STOPS.length - 1][1];
  }

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
        // full 88-key piano (A0–C8)
        this.lo = 21; this.hi = 108;
        for (let i = play.length - 1; i >= 0; i--) if (play[i].midi < 21 || play[i].midi > 108) play.splice(i, 1);
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

      this.accomp = chart.accomp.map(n => ({ time: n.time / rate, dur: n.dur / rate, midi: n.midi, vel: n.vel ?? 0.7, inst: n.inst || 'piano' }))
        .sort((a, b) => a.time - b.time);
      this.accPtr = 0;
      this.wait = !!opts.wait;

      // sheet music (piano parts only)
      this.sheet = opts.showScore && chart.score && chart.score.length
        ? new ScoreView(chart.score.map(n => ({ time: n.time / rate, dur: n.dur / rate, midi: n.midi, play: n.play })),
                        (chart.bars || []).map(b => b / rate), (chart.beatSec || 0.5) / rate)
        : null;

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

      Input.keyboard.mode = this.mode;
      this.wisps = [];
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
        // full-width 88-key keyboard
        let whites = 0;
        for (let m = this.lo; m <= this.hi; m++) if (!IS_BLACK[m % 12]) whites++;
        this.fx = 0;
        this.fw = W;
        const ww = this.ww = W / whites;
        this.kbH = Math.round(Math.max(100, Math.min(170, ww * 4.7)));
        let wi = 0;
        this.keyColor = new Map();
        for (let m = this.lo; m <= this.hi; m++) {
          let r;
          if (IS_BLACK[m % 12]) r = { x: wi * ww - ww * 0.3, w: ww * 0.6, black: true };
          else { r = { x: wi * ww, w: ww, black: false }; wi++; }
          this.rects.set(m, r);
          const c = gradColor((r.x + r.w / 2) / W);
          this.keyColor.set(m, r.black ? shade(c, 0.8) : c);
        }
        this.headH = 12;
      }
      this.judgeY = this.mode === 'piano' ? H - this.kbH : H - this.kbH - 18;
      const sw = Math.min(W - 32, 1100), sh = Math.round(Math.max(150, Math.min(240, this.judgeY * 0.36)));
      this.sheetRect = { x: (W - sw) / 2, y: 96, w: sw, h: sh };
      this.buildGlow();
    }

    // Pre-rendered textures for the aurora glow above the keyboard.
    buildGlow() {
      const GH = this.glowH = Math.round(Math.max(90, Math.min(170, this.H * 0.19)));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(this.fw)); c.height = GH;
      const x = c.getContext('2d');
      const hg = x.createLinearGradient(0, 0, c.width, 0);
      for (const [p, col] of GLOW_STOPS) hg.addColorStop(p, col);
      x.fillStyle = hg;
      x.fillRect(0, 0, c.width, GH);
      x.globalCompositeOperation = 'destination-in';
      const vg = x.createLinearGradient(0, 0, 0, GH);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(0.5, 'rgba(0,0,0,0.12)');
      vg.addColorStop(0.82, 'rgba(0,0,0,0.45)');
      vg.addColorStop(1, 'rgba(0,0,0,0.95)');
      x.fillStyle = vg;
      x.fillRect(0, 0, c.width, GH);
      this.glowTex = c;

      this.blobs = [];
      for (let i = 0; i < 12; i++) {
        const col = gradColor(i / 11);
        const b = document.createElement('canvas');
        b.width = b.height = 64;
        const bx = b.getContext('2d');
        const rg = bx.createRadialGradient(32, 32, 0, 32, 32, 32);
        rg.addColorStop(0, rgba(col, 1)); rg.addColorStop(0.4, rgba(col, 0.45)); rg.addColorStop(1, rgba(col, 0));
        bx.fillStyle = rg;
        bx.fillRect(0, 0, 64, 64);
        this.blobs.push(b);
      }
    }

    noteColor(midi) {
      if (this.mode === 'piano') return this.keyColor.get(midi) || '#8b3dff';
      return COLORS[PC_TO_WHITE[midi % 12]];
    }

    // ── clock ──
    // Normal mode: audio is scheduled ahead on the AudioContext clock; visuals/judgement use
    // performance.now(), both aligned at start (`lat` compensates the audio output latency).
    // Wait (practice) mode: a virtual clock that stops at the next unplayed note until it is hit.
    songTime(perfMs = performance.now()) {
      if (this.wait) return this.clock;
      return (perfMs - this.perfStart) / 1000 - LEAD_IN - this.lat;
    }

    audioTime(songT) {
      return this.wait ? Sound.ctx.currentTime : this.ctxStart + LEAD_IN + songT;
    }

    nextGate() {
      let gate = Infinity;
      for (const q of this.queues.values()) {
        for (let i = q.ptr; i < q.arr.length; i++) {
          if (q.arr[i].state === 0) { gate = Math.min(gate, q.arr[i].time); break; }
        }
      }
      return gate;
    }

    advanceClock() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastPerf) / 1000);
      this.lastPerf = now;
      let nt = this.clock + dt;
      const gate = this.opts.autoplay ? Infinity : this.nextGate();
      if (nt >= gate) {
        if (!this.waiting) { this.waiting = true; this.waitStart = now; }
        nt = gate;
      } else this.waiting = false;
      this.clock = Math.max(this.clock, nt);
    }

    start() {
      const ctx = Sound.ctx;
      this.bus = Sound.createBus(0.8);
      this.lat = ctx.outputLatency || ctx.baseLatency || 0;
      this.ctxStart = ctx.currentTime + 0.1;
      this.perfStart = performance.now() + 100;
      this.clock = -LEAD_IN;
      this.lastPerf = performance.now();
      this.waiting = false;
      this.running = true;
      this.paused = false;
      const loop = () => {
        if (!this.running) return;
        if (!this.paused) {
          if (this.wait) this.advanceClock();
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
      const away = performance.now() - this.pausedAt;
      this.perfStart += away;
      this.lastPerf = performance.now();
      if (this.waiting) this.waitStart += away;
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
      if (this.wait) {
        // how long the song has been waiting counts as lateness
        const late = this.waiting ? (performance.now() - this.waitStart) / 1000 : 0;
        this.press(lane, this.clock, false, late);
      } else {
        this.press(lane, this.songTime(ts) - this.opts.offset / 1000, false);
      }
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
        this.release(lane, this.wait ? this.clock : this.songTime(ts) - this.opts.offset / 1000);
      }
    }

    press(lane, t, auto, late = 0) {
      const q = this.queues.get(lane);
      if (!q) return;
      for (let i = q.ptr; i < q.arr.length; i++) {
        const n = q.arr[i];
        if (n.state !== 0) continue;
        let d = t - n.time;
        if (d > WIN.BAD && !this.wait) { this.missNote(n); continue; }
        if (d < -WIN.BAD) return; // too early: ignore, no penalty
        if (this.wait && d >= -1e-6) d = Math.max(0, d) + late;
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
      if (!this.wait) this.hp = Math.max(0, Math.min(100, this.hp + j.hp));
      this.judgeText = { res, at: performance.now(), delta: res === 'GOOD' || res === 'BAD' ? delta : undefined };
    }

    // ── update ──
    update(t) {
      if (this.wait) {
        // practice mode: accompaniment follows the (stoppable) clock, played as it is reached
        while (this.accPtr < this.accomp.length && this.accomp[this.accPtr].time <= t) {
          const a = this.accomp[this.accPtr++];
          if (a.time >= t - 0.25) Sound.playAt(a.midi, Sound.ctx.currentTime, a.dur, a.vel * 0.7, this.bus, a.inst);
        }
      } else {
        // schedule ~0.8s ahead on the audio clock
        while (this.accPtr < this.accomp.length && this.accomp[this.accPtr].time < t + 0.8) {
          const a = this.accomp[this.accPtr++];
          if (a.time < t - 0.05) continue;
          Sound.playAt(a.midi, this.ctxStart + LEAD_IN + a.time, a.dur, a.vel * 0.7, this.bus, a.inst);
        }
      }

      if (this.opts.autoplay) {
        for (const [lane, q] of this.queues) {
          for (let i = q.ptr; i < q.arr.length && q.arr[i].time <= t; i++) {
            const n = q.arr[i];
            if (n.state !== 0) continue;
            const h = this.holding.get(lane);
            if (h) this.completeHold(lane, h);
            Sound.playAt(n.midi, this.audioTime(n.time), n.dur, 0.75, this.bus);
            this.press(lane, n.time, true);
          }
        }
      }

      // misses & queue pointers
      for (const q of this.queues.values()) {
        while (q.ptr < q.arr.length) {
          const n = q.arr[q.ptr];
          if (n.state === 0 && t > n.time + WIN.BAD && !this.wait) this.missNote(n);
          if (n.state === 2) q.ptr++;
          else break;
        }
      }

      // completed holds
      for (const [lane, n] of this.holding) {
        if (t >= n.time + n.dur) this.completeHold(lane, n);
      }

      if (this.hp <= 0 && !this.opts.noFail && !this.wait) { this.failed = true; this.finish(); return; }
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
        failed: this.failed, autoplay: !!this.opts.autoplay, wait: this.wait,
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

      this.drawGlow(now);
      if (this.sheet) {
        const r = this.sheetRect;
        this.sheet.draw(g, r.x, r.y, r.w, r.h, t, this.opts.scoreOpacity ?? 0.7);
      }
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

    // Aurora light rising from the top edge of the keyboard (also serves as the judge line).
    drawGlow(now) {
      const { g, fx, fw, judgeY, glowH: GH } = this;
      const s = now / 1000;
      const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
      this.lastNow = now;

      const lit = [];
      for (const [lane, set] of this.pressed) {
        if (set.size && this.rects.has(lane)) lit.push(this.rects.get(lane));
      }

      g.save();
      g.globalCompositeOperation = 'lighter';

      // flickering flame-like band, drawn in thin vertical strips
      const sw = 5;
      for (let x = 0; x < fw; x += sw) {
        const X = fx + x, w = Math.min(sw, fw - x);
        const n = 0.5 + 0.5 * (Math.sin(X * 0.011 + s * 1.6) * 0.5 +
                               Math.sin(X * 0.029 - s * 2.3) * 0.3 +
                               Math.sin(X * 0.0047 + s * 0.8) * 0.2);
        let k = 0.4 + 0.45 * n;
        for (const r of lit) {
          const d = Math.abs(X + w / 2 - (r.x + r.w / 2)), span = Math.max(r.w * 2.5, 40);
          if (d < span) k += 0.7 * (1 - d / span);
        }
        const h = GH * Math.min(1.6, k);
        g.drawImage(this.glowTex, x, 0, w, GH, X, judgeY - h, w, h);
      }

      // drifting smoke wisps
      this.wispAcc = (this.wispAcc || 0) + dt * fw / 22;
      const spawn = (x, y, big) => this.wisps.push({
        x, y, vx: (Math.random() - 0.5) * 24, vy: -(25 + Math.random() * (big ? 90 : 45)),
        r: (big ? 26 : 16) + Math.random() * 30, life: 0, max: 1.1 + Math.random() * 1.6,
        a: big ? 0.35 : 0.2, c: Math.min(11, Math.max(0, Math.floor((x - fx) / fw * 12))),
      });
      while (this.wispAcc >= 1) { this.wispAcc--; spawn(fx + Math.random() * fw, judgeY - Math.random() * 18, false); }
      for (const r of lit) if (Math.random() < dt * 25) spawn(r.x + r.w / 2, judgeY - 4, true);
      this.wisps = this.wisps.filter(p => (p.life += dt) < p.max);
      for (const p of this.wisps) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 14;
        g.globalAlpha = Math.sin(Math.PI * p.life / p.max) * p.a;
        g.drawImage(this.blobs[p.c], p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      g.globalAlpha = 1;
      g.restore();

      // bright edge line
      g.save();
      const lg = g.createLinearGradient(fx, 0, fx + fw, 0);
      for (const [p, col] of GLOW_STOPS) lg.addColorStop(p, col);
      g.shadowColor = '#a04cff'; g.shadowBlur = 18;
      g.fillStyle = lg;
      g.fillRect(fx, judgeY - 4, fw, 5);
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(fx, judgeY - 2, fw, 1.5);
      g.restore();
    }

    drawKeyboard() {
      const { g, judgeY, kbH } = this;
      const y0 = this.mode === 'piano' ? judgeY + 1 : judgeY + 6;
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
      // piano (88 keys, computer-keyboard labels)
      const blackH = kbH * 0.6;
      const kh = this.H - y0;
      const fs = Math.round(Math.max(9, Math.min(16, this.ww * 0.52)));
      g.textAlign = 'center';
      g.font = `bold ${fs}px Consolas, "Malgun Gothic", monospace`;
      const label = (m, cx, y, color) => {
        const L = Input.LABELS[m];
        if (!L) return;
        g.fillStyle = color;
        g.fillText(L.ch, cx, y);
        if (L.mod) { g.beginPath(); g.arc(cx, y - fs - 2, Math.max(1.5, fs * 0.14), 0, Math.PI * 2); g.fill(); }
      };

      const wg = g.createLinearGradient(0, y0, 0, y0 + kh);
      wg.addColorStop(0, '#a9aab2'); wg.addColorStop(0.12, '#c9cad1'); wg.addColorStop(1, '#e4e5ea');
      for (const [m, r] of this.rects) {
        if (r.black) continue;
        const on = this.keysDown.has(m);
        g.fillStyle = on ? this.noteColor(m) : wg;
        g.fillRect(r.x, y0, r.w, kh);
        if (on) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(r.x, y0 + kh * 0.6, r.w, kh * 0.4); }
        else if (this.due.has(m)) { g.fillStyle = rgba(this.noteColor(m), 0.4); g.fillRect(r.x, y0 + blackH, r.w, kh - blackH); }
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(r.x, y0, 1, kh);
        label(m, r.x + r.w / 2, y0 + kh - 8, on ? '#fff' : '#2a2b34');
      }
      // shadow cast by the light bar onto the keys
      const sg = g.createLinearGradient(0, y0, 0, y0 + 12);
      sg.addColorStop(0, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sg;
      g.fillRect(this.fx, y0, this.fw, 12);

      const bg = g.createLinearGradient(0, y0, 0, y0 + blackH);
      bg.addColorStop(0, '#08080a'); bg.addColorStop(0.85, '#232329'); bg.addColorStop(1, '#3a3a42');
      for (const [m, r] of this.rects) {
        if (!r.black) continue;
        const on = this.keysDown.has(m);
        const due = !on && this.due.has(m);
        g.fillStyle = on ? this.noteColor(m) : due ? shade(this.noteColor(m), 0.55) : bg;
        roundRect(g, r.x, y0 - 2, r.w, blackH + 2, Math.min(4, r.w * 0.2)); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(r.x + r.w * 0.15, y0 + blackH * 0.9, r.w * 0.7, 2);
        label(m, r.x + r.w / 2, y0 + blackH - 10, '#f2f2f6');
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
      g.fillText((this.mode === 'seven' ? '7키 모드' : '피아노 모드') + (this.wait ? ' · 연습(기다리기)' : '') + rateTxt + (this.opts.autoplay ? ' · AUTO' : ''), 20, 58);
      if (this.mode === 'seven') g.fillText('Esc: 일시정지', 20, this.H - 16);
      else g.fillText('Esc: 일시정지', 20, 78);

      g.textAlign = 'right';
      g.fillStyle = '#e8eaf4'; g.font = 'bold 30px Consolas, monospace';
      g.fillText(String(this.score).padStart(7, '0'), W - 20, 44);
      g.fillStyle = '#8b90a8'; g.font = '15px Consolas, monospace';
      const acc = this.judged ? this.accPts / this.judged : 100;
      g.fillText(acc.toFixed(2) + '%', W - 20, 68);

      // HP gauge
      const hpCol = this.hp > 50 ? '#4cd964' : this.hp > 25 ? '#ffcf5a' : '#ff5f6d';
      if (this.mode === 'seven') {
        const hx = fx + fw + 14, hh = judgeY * 0.55, hy = judgeY - hh;
        g.fillStyle = '#1a1e33'; g.fillRect(hx, hy, 8, hh);
        g.fillStyle = hpCol;
        g.fillRect(hx, hy + hh * (1 - this.hp / 100), 8, hh * this.hp / 100);
      } else {
        g.fillStyle = '#1a1e33'; g.fillRect(W - 220, 80, 200, 6);
        g.fillStyle = hpCol; g.fillRect(W - 220, 80, 200 * this.hp / 100, 6);
      }

      g.textAlign = 'center';
      const top = this.sheet ? this.sheetRect.y + this.sheetRect.h : 0, span = judgeY - top;
      const yCombo = top + span * (this.sheet ? 0.3 : 0.36), yJudge = top + span * (this.sheet ? 0.55 : 0.52);
      if (this.wait && this.waiting && t >= 0) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(now / 250);
        g.fillStyle = '#ffd166'; g.font = 'bold 20px "Malgun Gothic", sans-serif';
        g.fillText('⏸ 빛나는 건반을 누르면 계속됩니다', cx, top + span * 0.78);
        g.globalAlpha = 1;
      }
      if (t < 0) {
        g.fillStyle = '#e8eaf4'; g.font = 'bold 56px sans-serif';
        g.fillText(Math.ceil(-t), cx, yJudge);
        g.font = '18px "Malgun Gothic", sans-serif'; g.fillStyle = '#8b90a8';
        g.fillText('준비', cx, yJudge + 34);
      }

      if (this.combo >= 2) {
        g.fillStyle = 'rgba(232,234,244,0.92)'; g.font = 'bold 64px sans-serif';
        g.fillText(this.combo, cx, yCombo);
        g.font = 'bold 14px sans-serif'; g.fillStyle = '#8b90a8';
        g.fillText('COMBO', cx, yCombo + 22);
      }

      const jt = this.judgeText;
      if (jt) {
        const age = (now - jt.at) / 1000;
        if (age < 0.6) {
          const s = 1 + Math.max(0, 0.12 - age) * 2.5;
          g.save();
          g.globalAlpha = 1 - Math.max(0, age - 0.35) / 0.25;
          g.translate(cx, yJudge);
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
