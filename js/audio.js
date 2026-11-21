// Web Audio synth: piano + backing instruments (strings, bass, organ, pluck, brass, lead) + drum kit.
window.Sound = (function () {
  let ctx = null, master = null, noiseBuf = null;
  const live = new Map();

  async function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
    return ctx;
  }

  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ── melodic instruments ──
  // oscs: [type, freq multiplier, gain, detune cents]
  const INST = {
    piano: (m, v) => ({
      oscs: [['triangle', 1, 1], ['sine', 2, 0.3]],
      cutoff: Math.min(14000, freq(m) * 5 + 1500 * v), peak: 0.22, attack: 0.006,
      decay: 0.35 + Math.max(0, 96 - m) / 70, sustain: 0, release: 0.07,
    }),
    strings: (m, v) => ({
      oscs: [['sawtooth', 1, 0.5, -7], ['sawtooth', 1, 0.5, 7], ['sawtooth', 0.5, 0.25]],
      cutoff: 1400 + 1800 * v, peak: 0.085, attack: 0.22, release: 0.35,
    }),
    bass: (m, v) => ({
      oscs: [['sawtooth', 1, 0.6], ['sine', 1, 0.8]],
      cutoff: 520, filterEnv: [1600, 420, 0.08], peak: 0.3, attack: 0.005,
      decay: 0.5, sustain: 0.55, release: 0.06,
    }),
    organ: (m, v) => ({
      oscs: [['sine', 1, 1], ['sine', 2, 0.5], ['sine', 3, 0.25], ['sine', 4, 0.12]],
      cutoff: 6000, peak: 0.08, attack: 0.015, release: 0.05,
    }),
    pluck: (m, v) => ({
      oscs: [['triangle', 1, 1], ['sawtooth', 1, 0.25]],
      cutoff: 3200, filterEnv: [4500, 900, 0.15], peak: 0.18, attack: 0.003,
      decay: 0.3, sustain: 0, release: 0.08,
    }),
    brass: (m, v) => ({
      oscs: [['sawtooth', 1, 0.7], ['sawtooth', 1, 0.4, 5]],
      cutoff: 900, filterEnv: [500, 2400, 0.06], peak: 0.09, attack: 0.04, release: 0.1,
    }),
    lead: (m, v) => ({
      oscs: [['square', 1, 0.6], ['sawtooth', 1, 0.3, 6]],
      cutoff: 3000, peak: 0.06, attack: 0.01, release: 0.06,
    }),
  };

  function voice(midi, when, vel, out, inst = 'piano') {
    const cfg = (INST[inst] || INST.piano)(midi, vel);
    const f = freq(midi);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = cfg.cutoff;
    if (cfg.filterEnv) {
      filt.frequency.setValueAtTime(cfg.filterEnv[0], when);
      filt.frequency.setTargetAtTime(cfg.filterEnv[1], when, cfg.filterEnv[2]);
    }
    const oscs = cfg.oscs.map(([type, mult, gain, det]) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f * mult;
      if (det) o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = gain;
      o.connect(og).connect(filt);
      o.start(when);
      return o;
    });
    filt.connect(g).connect(out || master);

    const peak = cfg.peak * Math.max(0.15, vel);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + cfg.attack);
    if (cfg.decay) g.gain.setTargetAtTime(peak * (cfg.sustain || 0), when + cfg.attack, cfg.decay);
    let stopped = false;
    return {
      release(at) {
        if (stopped) return;
        stopped = true;
        at = Math.max(at, ctx.currentTime);
        if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(at);
        g.gain.setTargetAtTime(0, at, cfg.release);
        for (const o of oscs) o.stop(at + cfg.release * 6 + 0.05);
      },
    };
  }

  // ── drum kit (General MIDI note numbers) ──
  function noise(when, dur) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.start(when, Math.random() * 0.5);
    s.stop(when + dur);
    return s;
  }
  function noiseHit(when, vel, out, hp, peak, tau) {
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * vel, when);
    g.gain.setTargetAtTime(0, when, tau);
    noise(when, tau * 6 + 0.05).connect(f).connect(g).connect(out);
  }
  function toneHit(when, vel, out, type, f0, f1, sweep, peak, tau) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + sweep);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * vel, when);
    g.gain.setTargetAtTime(0, when, tau);
    o.connect(g).connect(out);
    o.start(when); o.stop(when + tau * 6 + 0.05);
  }
  function drum(n, when, vel, out) {
    out = out || master;
    const v = Math.max(0.2, vel);
    if (n === 35 || n === 36) {                                                              // kick
      toneHit(when, v, out, 'sine', 160, 45, 0.11, 1.0, 0.13);
      noiseHit(when, v, out, 2500, 0.12, 0.006);                                             // beater click
    }
    else if (n === 39) {                                                                     // hand clap
      for (const dt of [0, 0.011, 0.022]) {
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.8;
        const g = ctx.createGain();
        const t = when + dt, last = dt === 0.022;
        g.gain.setValueAtTime(0.55 * v, t);
        g.gain.setTargetAtTime(0, t, last ? 0.07 : 0.006);
        noise(t, last ? 0.5 : 0.05).connect(f).connect(g).connect(out);
      }
    }
    else if (n === 38 || n === 40 || n === 37) {                                             // snare
      noiseHit(when, v, out, 1200, 0.45, 0.06);
      toneHit(when, v, out, 'triangle', 220, 160, 0.05, 0.3, 0.05);
    }
    else if (n === 42 || n === 44) noiseHit(when, v, out, 7500, 0.16, 0.018);               // closed hi-hat
    else if (n === 46) noiseHit(when, v, out, 7000, 0.14, 0.12);                            // open hi-hat
    else if (n === 49 || n === 52 || n === 55 || n === 57) noiseHit(when, v, out, 4500, 0.2, 0.35); // crash
    else if (n === 51 || n === 53 || n === 59) noiseHit(when, v, out, 6000, 0.08, 0.15);    // ride
    else if (n >= 41 && n <= 50) {                                                           // toms
      const f = 70 + (n - 41) * 14;
      toneHit(when, v, out, 'sine', f * 1.6, f, 0.18, 0.6, 0.14);
    }
    else noiseHit(when, v, out, 3000, 0.08, 0.03);                                           // misc percussion
  }

  return {
    ensure,
    get ctx() { return ctx; },
    // fixed-length note scheduled at `when` (accompaniment / autoplay)
    playAt(midi, when, dur, vel, out, inst = 'piano') {
      if (!ctx) return;
      if (inst === 'drum') { drum(midi, when, vel, out); return; }
      voice(midi, when, vel, out, inst).release(when + Math.max(0.08, dur));
    },
    // live key press (piano)
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
