// Unified note input: Web MIDI devices + computer keyboard fallback.
// Listeners receive (type 'on'|'off', midi, velocity 0..1, timestamp in performance.now() ms, source 'midi'|'key').
window.Input = (function () {
  const listeners = [];
  const emit = (...a) => listeners.forEach(fn => fn(...a));
  let statusCb = () => {};
  const state = { supported: !!navigator.requestMIDIAccess, devices: [], error: null };

  function fixTs(ts) {
    const now = performance.now();
    return (!ts || ts > now + 5 || now - ts > 1000) ? now : ts;
  }

  function onMessage(e) {
    const [st, d1, d2] = e.data;
    const cmd = st & 0xF0;
    const ts = fixTs(e.timeStamp);
    if (cmd === 0x90 && d2 > 0) emit('on', d1, d2 / 127, ts, 'midi');
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) emit('off', d1, 0, ts, 'midi');
  }

  function bind(access) {
    state.devices = [];
    access.inputs.forEach(inp => {
      inp.onmidimessage = onMessage;
      state.devices.push(inp.name || 'MIDI 장치');
    });
    statusCb(state);
  }

  async function initMIDI() {
    if (!state.supported) { statusCb(state); return; }
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      bind(access);
      access.onstatechange = () => bind(access);
    } catch (err) {
      state.error = err && err.message || '권한 거부';
      statusCb(state);
    }
  }

  // ── computer keyboard ──
  // 7-key mode
  const SEVEN = { KeyS: 60, KeyD: 62, KeyF: 64, Space: 65, KeyJ: 67, KeyK: 69, KeyL: 71 };

  // 88-key piano layout (A0–C8)
  //  C2–C7 : white  1234567890qwertyuiopasdfghjklzxcvbnm   black (Shift)  !@$%^*(QWETYIOPSDGHJLZCVB
  //  A0–B1 : Ctrl/Alt + 1234567890qwert  (chromatic)
  //  C#7–C8: Ctrl/Alt + yuiopasdfghj     (chromatic)
  const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const SHIFT_DIGIT = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0' };
  const PIANO = {};   // 'M'(modifier) + 'S'(shift) + KeyboardEvent.code -> midi
  const LABELS = {};  // midi -> { ch, mod }
  function codeOf(ch) {
    if (/[0-9]/.test(ch)) return { code: 'Digit' + ch, shift: false };
    if (/[a-z]/.test(ch)) return { code: 'Key' + ch.toUpperCase(), shift: false };
    if (/[A-Z]/.test(ch)) return { code: 'Key' + ch, shift: true };
    return { code: 'Digit' + SHIFT_DIGIT[ch], shift: true };
  }
  function add(ch, midi, mod) {
    const { code, shift } = codeOf(ch);
    PIANO[(mod ? 'M' : '') + (shift ? 'S' : '') + code] = midi;
    LABELS[midi] = { ch, mod };
  }
  {
    const W = '1234567890qwertyuiopasdfghjklzxcvbnm', B = '!@$%^*(QWETYIOPSDGHJLZCVB';
    let wi = 0, bi = 0;
    for (let m = 36; m <= 96; m++) add(IS_BLACK[m % 12] ? B[bi++] : W[wi++], m, false);
    '1234567890qwert'.split('').forEach((ch, i) => add(ch, 21 + i, true));
    'yuiopasdfghj'.split('').forEach((ch, i) => add(ch, 97 + i, true));
  }

  const kb = { enabled: false, mode: 'seven' };
  const held = new Map(); // code -> midi

  addEventListener('keydown', (e) => {
    if (!kb.enabled || e.repeat || e.metaKey) return;
    let midi;
    if (kb.mode === 'seven') {
      if (e.ctrlKey || e.altKey) return;
      midi = SEVEN[e.code];
    } else {
      midi = PIANO[(e.ctrlKey || e.altKey ? 'M' : '') + (e.shiftKey ? 'S' : '') + e.code];
    }
    if (midi === undefined) return;
    e.preventDefault();
    if (held.has(e.code)) emit('off', held.get(e.code), 0, fixTs(e.timeStamp), 'key');
    held.set(e.code, midi);
    emit('on', midi, 0.75, fixTs(e.timeStamp), 'key');
  });
  addEventListener('keyup', (e) => {
    if (!held.has(e.code)) return;
    const midi = held.get(e.code);
    held.delete(e.code);
    emit('off', midi, 0, fixTs(e.timeStamp), 'key');
  });
  addEventListener('blur', () => {
    for (const midi of held.values()) emit('off', midi, 0, performance.now(), 'key');
    held.clear();
  });

  return {
    on(fn) { listeners.push(fn); },
    onStatus(fn) { statusCb = fn; },
    initMIDI,
    state,
    keyboard: kb,
    SEVEN_KEYS: ['S', 'D', 'F', '␣', 'J', 'K', 'L'],
    LABELS,
  };
})();
