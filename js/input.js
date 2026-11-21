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
  const SEVEN = { KeyS: 60, KeyD: 62, KeyF: 64, Space: 65, KeyJ: 67, KeyK: 69, KeyL: 71 };
  const PIANO = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8,
                  KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };
  const kb = { enabled: false, mode: 'seven', base: 60, min: 21, max: 108 };
  const held = new Map(); // code -> midi

  addEventListener('keydown', (e) => {
    if (!kb.enabled || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (kb.mode === 'piano' && (e.code === 'KeyZ' || e.code === 'KeyX')) {
      const nb = kb.base + (e.code === 'KeyZ' ? -12 : 12);
      if (nb >= kb.min - 12 && nb <= kb.max) kb.base = nb;
      e.preventDefault();
      return;
    }
    const map = kb.mode === 'seven' ? SEVEN : PIANO;
    if (!(e.code in map)) return;
    e.preventDefault();
    const midi = kb.mode === 'seven' ? map[e.code] : kb.base + map[e.code];
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
    for (const [code, midi] of held) emit('off', midi, 0, performance.now(), 'key');
    held.clear();
  });

  return {
    on(fn) { listeners.push(fn); },
    onStatus(fn) { statusCb = fn; },
    initMIDI,
    state,
    keyboard: kb,
    SEVEN_KEYS: ['S', 'D', 'F', '␣', 'J', 'K', 'L'],
  };
})();
