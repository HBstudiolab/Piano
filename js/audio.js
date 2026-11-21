// Small Web Audio piano-ish synth.
window.Sound = (function () {
  let ctx = null, master = null;
  const live = new Map();

  async function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
    return ctx;
  }

  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Creates one voice starting at `when`. Returns { release(at) }.
  function voice(midi, when, vel, out) {
    const f = freq(midi);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = Math.min(14000, f * 5 + 1500 * vel);
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o1.connect(filt); o2.connect(g2).connect(filt);
    filt.connect(g).connect(out || master);

    const peak = 0.22 * Math.max(0.15, vel);
    const tau = 0.35 + Math.max(0, 96 - midi) / 70; // lower notes ring longer
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.006);
    g.gain.setTargetAtTime(0, when + 0.006, tau);
    o1.start(when); o2.start(when);
    let stopped = false;
    return {
      release(at) {
        if (stopped) return;
        stopped = true;
        at = Math.max(at, ctx.currentTime);
        g.gain.setTargetAtTime(0, at, 0.07);
        o1.stop(at + 0.5); o2.stop(at + 0.5);
      },
    };
  }

  return {
    ensure,
    get ctx() { return ctx; },
    // fixed-length note scheduled in the future (accompaniment / autoplay)
    playAt(midi, when, dur, vel, out) {
      if (!ctx) return;
      voice(midi, when, vel, out).release(when + Math.max(0.08, dur));
    },
    // live key press
    noteOn(midi, vel) {
      if (!ctx) return;
      this.noteOff(midi);
      live.set(midi, voice(midi, ctx.currentTime, vel));
    },
    noteOff(midi) {
      const v = live.get(midi);
      if (v) { v.release(ctx.currentTime); live.delete(midi); }
    },
    allOff() { for (const m of [...live.keys()]) this.noteOff(m); },
    // separate bus so a whole song's scheduled notes can be silenced at once
    createBus(gain = 1) {
      const b = ctx.createGain();
      b.gain.value = gain;
      b.connect(master);
      return b;
    },
    killBus(b) {
      if (!b || !ctx) return;
      b.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => b.disconnect(), 400);
    },
  };
})();
