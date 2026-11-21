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
    // electric guitar: detuned saws through a distortion stage, then a "cabinet" low-pass
    eguitar: (m, v) => ({
      oscs: [['sawtooth', 1, 0.6], ['sawtooth', 1, 0.5, 9], ['square', 0.5, 0.25]],
      drive: 30, cutoff: 3000, filterEnv: [5200, 2400, 0.18], peak: 0.1, attack: 0.004,
      decay: 1.4, sustain: 0.55, release: 0.09,
    }),
    lead: (m, v) => ({
      oscs: [['square', 1, 0.6], ['sawtooth', 1, 0.3, 6]],
      cutoff: 3000, peak: 0.06, attack: 0.01, release: 0.06,
    }),
  };

  const curves = {};
  function driveCurve(k) {
    if (!curves[k]) {
      const c = new Float32Array(1024);
      for (let i = 0; i < c.length; i++) { const x = i / 511.5 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
      curves[k] = c;
    }
    return curves[k];
  }

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
    let input = filt;
    if (cfg.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(cfg.drive);
      ws.oversample = '2x';
      ws.connect(filt);
      input = ws;
    }
    const oscs = cfg.oscs.map(([type, mult, gain, det]) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f * mult;
      if (det) o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = gain;
      o.connect(og).connect(input);
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
  // filtered noise burst; type = highpass | bandpass | lowpass
  function noiseHit(when, vel, out, type, freq, peak, tau, q = 0.7) {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * vel, when);
    g.gain.setTargetAtTime(0, when, tau);
    noise(when, tau * 6 + 0.05).connect(f).connect(g).connect(out);
  }
  // pitched one-shot with pitch sweep f0 -> f1
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
  // metallic cymbal tone: six detuned square waves (classic drum-machine recipe)
  const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
  function metal(when, vel, out, hp, peak, tau, center = 10000) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = center; bp.Q.value = 0.6;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * vel, when);
    g.gain.setTargetAtTime(0, when, tau);
    bp.connect(h).connect(g).connect(out);
    for (const f of METAL) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * 1.5;
      o.connect(bp); o.start(when); o.stop(when + tau * 6 + 0.05);
    }
  }

  function drum(n, when, vel, out) {
    out = out || master;
    const v = Math.max(0.15, vel);
    switch (n) {
      case 35: case 36:                                                  // kick: sweep + sub + click
        toneHit(when, v, out, 'sine', 170, 46, 0.1, 1.0, 0.14);
        toneHit(when, v, out, 'triangle', 90, 40, 0.15, 0.35, 0.12);
        noiseHit(when, v, out, 'highpass', 3000, 0.12, 0.005);
        break;
      case 38: case 40:                                                  // snare: body + rattle
        toneHit(when, v, out, 'triangle', 240, 175, 0.04, 0.45, 0.05);
        toneHit(when, v, out, 'sine', 330, 300, 0.03, 0.2, 0.03);
        noiseHit(when, v, out, 'bandpass', 3200, 0.55, 0.075, 0.6);
        noiseHit(when, v, out, 'highpass', 6000, 0.2, 0.05);
        break;
      case 37:                                                           // rim shot / side stick
        toneHit(when, v, out, 'triangle', 1750, 1600, 0.01, 0.35, 0.015);
        noiseHit(when, v, out, 'highpass', 3500, 0.15, 0.01);
        break;
      case 39:                                                           // hand clap: 3 quick bursts + tail
        for (const dt of [0, 0.011, 0.022]) {
          const last = dt === 0.022;
          noiseHit(when + dt, v, out, 'bandpass', 1300, 0.55, last ? 0.07 : 0.006, 0.8);
        }
        break;
      case 42: case 44: metal(when, v, out, 7000, 0.28, 0.025); break;   // closed hi-hat
      case 46: metal(when, v, out, 7000, 0.24, 0.13); noiseHit(when, v, out, 'highpass', 9000, 0.05, 0.12); break; // open hat
      case 49: case 52: case 55: case 57:                                // crash
        metal(when, v, out, 4500, 0.22, 0.45, 8000);
        noiseHit(when, v, out, 'highpass', 5000, 0.18, 0.5);
        break;
      case 51: case 59: metal(when, v, out, 5000, 0.1, 0.22, 7000); break; // ride
      case 53: metal(when, v, out, 2500, 0.16, 0.3, 3000); break;          // ride bell
      case 54:                                                           // tambourine: jingles
        metal(when, v, out, 8000, 0.14, 0.06, 11000);
        noiseHit(when, v, out, 'bandpass', 9000, 0.18, 0.05, 1.5);
        noiseHit(when + 0.012, v, out, 'bandpass', 9500, 0.12, 0.04, 1.5);
        break;
      case 56: {                                                         // cowbell
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.35 * v, when); g.gain.setTargetAtTime(0, when, 0.06);
        bp.connect(g).connect(out);
        for (const f of [562, 845]) {
          const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
          o.connect(bp); o.start(when); o.stop(when + 0.5);
        }
        break;
      }
      case 60: toneHit(when, v, out, 'sine', 420, 390, 0.03, 0.5, 0.06); break;   // hi bongo
      case 61: toneHit(when, v, out, 'sine', 300, 280, 0.03, 0.5, 0.08); break;   // low bongo
      case 62: toneHit(when, v, out, 'sine', 340, 320, 0.02, 0.4, 0.03); break;   // muted conga
      case 63: toneHit(when, v, out, 'sine', 360, 330, 0.04, 0.55, 0.12); break;  // open hi conga
      case 64: toneHit(when, v, out, 'sine', 240, 215, 0.05, 0.6, 0.15); break;   // low conga
      case 69: case 70: case 82:                                         // cabasa / maracas / shaker
        noiseHit(when, v, out, 'bandpass', 6500, 0.22, 0.025, 1.2);
        break;
      case 75: case 76: case 77:                                         // claves / wood block
        toneHit(when, v, out, 'sine', n === 75 ? 2500 : 1200, n === 75 ? 2450 : 1150, 0.01, 0.45, 0.025);
        break;
      default:
        if (n >= 41 && n <= 50) {                                        // toms
          const f = 75 + (n - 41) * 15;
          toneHit(when, v, out, 'sine', f * 1.7, f, 0.2, 0.7, 0.16);
          noiseHit(when, v, out, 'lowpass', 1500, 0.08, 0.03);
        } else noiseHit(when, v, out, 'bandpass', 4000, 0.12, 0.03);    // misc percussion
    }
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
