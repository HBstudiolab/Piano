// Menu (instrument tabs → song → difficulty → start), settings popup, charts, game flow.
(function () {
  const $ = (s) => document.querySelector(s);
  const SETTINGS_VERSION = 3;
  const DEFAULTS = { instrument: 'piano', mode: 'piano', speed: 3, rate: 1, offset: 0, keySound: 'auto', longNotes: true,
                     noFail: true, autoplay: false, wait: false, showScore: true, scoreOpacity: 0.7, difficulty: 'normal',
                     hands: 'R',
                     v: SETTINGS_VERSION };
  const INSTRUMENTS = {
    piano:  { icon: '🎹', name: '피아노' },
    bass:   { icon: '🎸', name: '베이스' },
    guitar: { icon: '⚡', name: '일렉기타' },
    drum:   { icon: '🥁', name: '드럼' },
  };
  const DIFF_NAME = { easy: '이지', normal: '노말', hard: '하드' };
  const DIFF_HELP = {
    piano: {
      easy: '화음은 한 음만, 빠른 음은 생략합니다 (생략된 음은 자동 반주).',
      normal: '화음은 한 음만 칩니다 (나머지는 자동 반주).',
      hard: '선택한 손의 모든 음을 칩니다.',
    },
    bass: {
      easy: '베이스 4레인 · 큰 박자 위주로 칩니다.',
      normal: '베이스 4레인 · 8분음표까지 칩니다.',
      hard: '베이스 4레인 · 베이스 라인 전부를 칩니다.',
    },
    guitar: {
      easy: '기타 5레인 · 멜로디의 큰 박자만 칩니다.',
      normal: '기타 5레인 · 멜로디를 칩니다.',
      hard: '기타 5레인 · 빠른 음까지 전부 칩니다.',
    },
    drum: {
      easy: '킥 · 스네어 · 크래시만 칩니다.',
      normal: '하이햇 8분음표 · 탐 · 라이드까지 칩니다.',
      hard: '고스트 노트와 16분음표까지 전부 칩니다.',
    },
  };
  // GM program family -> synth instrument
  const GM_INST = ['piano', 'pluck', 'organ', 'eguitar', 'bass', 'strings', 'strings', 'brass',
                   'brass', 'organ', 'lead', 'strings', 'lead', 'pluck', 'pluck', 'piano'];

  // tips shown on the start screen — a different one every time (instead of a tutorial)
  const TIPS = {
    all: [
      '노트가 빛나는 판정선에 닿는 순간에 치면 COOL이에요.',
      '판정 범위: COOL ±45ms · GOOD ±90ms · BAD ±150ms.',
      '타이밍이 계속 늦게 나오면 ⚙ 설정 → 판정 오프셋을 + 쪽으로 올려보세요.',
      '⚙ 설정의 "연습 (기다리기)"를 켜면 칠 때까지 곡이 멈춰서 기다려요.',
      '⚙ 설정에서 곡 재생 속도를 50~90%로 낮추면 천천히 연습할 수 있어요.',
      '노트가 너무 빽빽해 보이면 ⚙ 설정에서 노트 속도를 올려보세요.',
      '길게 이어진 롱노트는 끝날 때까지 누르고 있어야 해요.',
      'MISS 없이 끝까지 치면 FULL COMBO, 전부 COOL이면 ALL COOL!',
      '드럼 스타일을 바꾸면 같은 곡도 전혀 다른 분위기가 돼요.',
      '어려우면 난이도를 이지로 낮춰보세요. 빠진 음은 자동 반주로 들려요.',
    ],
    allKeys: ['Esc로 일시정지, 일시정지 중 R은 처음부터, Q는 메뉴로 가요.'],
    allTouch: ['화면 위쪽 가운데 ⏸ 버튼으로 일시정지할 수 있어요.', '여러 손가락으로 동시에 눌러도 돼요.'],
    piano: [
      '검은건반은 Shift를 누른 채 쳐요. 예: 도#(C#4) = Shift+T',
      '파트 설정에서 오른손 · 왼손 · 양손을 고를 수 있어요.',
      '노트가 떨어질 자리의 건반이 미리 은은하게 빛나요.',
      '위쪽 악보에서 지금 나는 음이 주황색으로 표시돼요.',
      'MIDI 피아노를 연결하면 진짜 피아노로 칠 수 있어요.',
      '하드는 고른 손의 모든 음, 이지·노말은 화음 중 한 음만 쳐요.',
    ],
    bass: [
      '베이스 라인은 곡의 뼈대예요. 드럼과 함께 리듬을 잡아줘요.',
      '음이 높아지면 오른쪽 레인, 낮아지면 왼쪽 레인으로 떨어져요.',
      '노트를 맞혀야 베이스 소리가 나요. 놓치면 그 음이 비어요.',
      '베이스는 드럼 킥과 같이 움직이는 경우가 많아요. 킥 소리를 들어보세요.',
    ],
    guitar: [
      '쉬운 곡에서 손을 풀고 전용곡에 도전해보세요.',
      '음이 높아지면 오른쪽 레인, 낮아지면 왼쪽 레인으로 떨어져요.',
      '노트를 맞혀야 기타 소리가 나요. 놓치면 멜로디가 비어요.',
      '전용곡 "산왕의 궁전에서"는 갈수록 빨라져요. 끝까지 버텨보세요!',
    ],
    drum: [
      '킥과 스네어만 정확히 맞춰도 리듬이 살아나요.',
      'Space가 킥이에요. 엄지로 치면 편해요.',
      '전자드럼(MIDI)은 연결만 하면 바로 칠 수 있어요.',
      '피아노 건반으로도 드럼을 칠 수 있어요. 도~시가 각 레인이에요.',
      '이지는 킥 · 스네어 · 크래시만, 하드는 고스트 노트까지 전부예요.',
    ],
  };
  let lastTip = '';
  function pickTip(which) {
    const pool = [...TIPS.all, ...TIPS[which], ...(isTouch ? TIPS.allTouch : TIPS.allKeys)]
      .filter(t => !(isTouch && /키보드|Shift|Space|Esc/.test(t)))     // phones have no keyboard
      .filter(t => t !== lastTip);
    lastTip = pool[Math.floor(Math.random() * pool.length)] || '';
    return lastTip;
  }

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  let settings = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem('keyfall.settings') || '{}');
    if ((saved.v || 1) < 2) delete saved.mode;                                   // v2: piano became the default
    if ((saved.v || 1) < 3 && saved.mode === 'drum') { saved.mode = 'piano'; saved.instrument = 'drum'; } // v3: drum is a tab
    saved.v = SETTINGS_VERSION;
    Object.assign(settings, saved);
  } catch {}
  if (!INSTRUMENTS[settings.instrument]) settings.instrument = 'piano';
  if (settings.mode !== 'seven') settings.mode = 'piano';
  const save = () => { try { localStorage.setItem('keyfall.settings', JSON.stringify(settings)); } catch {} };
  const inst = () => settings.instrument;
  const gameMode = () => inst() === 'piano' ? settings.mode : inst();

  const songs = Songs.list.slice();
  for (const s of songs) for (const p of s.parts) {
    if (p.role === 'play') p.hand = 'R';
    else if (p.name.startsWith('왼손')) p.hand = 'L';
  }
  let selected = null;
  let lastChart = null;
  const game = new Game($('#cv'));

  // ── screens ──
  function show(id) {
    for (const s of ['#menu', '#game', '#result']) $(s).classList.toggle('hidden', s !== id);
    $('#pauseMenu').classList.add('hidden');
    Input.keyboard.enabled = id === '#game';
  }

  // ── settings popup ──
  const openSettings = () => $('#settingsModal').classList.remove('hidden');
  const closeSettings = () => $('#settingsModal').classList.add('hidden');
  $('#settingsBtn').onclick = openSettings;
  $('#closeSettings').onclick = closeSettings;
  $('#settingsModal').onclick = (e) => { if (e.target.id === 'settingsModal') closeSettings(); };

  function bindSettings() {
    document.querySelectorAll('input[name=mode]').forEach(r => {
      r.checked = r.value === settings.mode;
      r.onchange = () => { settings.mode = r.value; save(); updateHelp(); };
    });
    const speed = $('#speed');
    speed.value = settings.speed;
    const sv = () => { $('#speedVal').textContent = Number(settings.speed).toFixed(1); };
    speed.oninput = () => { settings.speed = parseFloat(speed.value); sv(); save(); };
    sv();
    $('#rate').value = String(settings.rate);
    $('#rate').onchange = (e) => { settings.rate = parseFloat(e.target.value); save(); if (selected) renderDetail(); };
    const off = $('#offset');
    off.value = settings.offset;
    const ov = () => { $('#offsetVal').textContent = (settings.offset > 0 ? '+' : '') + settings.offset + 'ms'; };
    off.oninput = () => { settings.offset = parseInt(off.value, 10); ov(); save(); };
    ov();
    $('#keySound').value = settings.keySound;
    $('#keySound').onchange = (e) => { settings.keySound = e.target.value; save(); };
    document.querySelectorAll('input[name=play]').forEach(r => {
      r.checked = r.value === (settings.wait ? 'wait' : 'normal');
      r.onchange = () => { settings.wait = r.value === 'wait'; save(); updateHelp(); };
    });
    const so = $('#scoreOpacity');
    so.value = settings.scoreOpacity;
    const sov = () => { $('#scoreOpacityVal').textContent = Math.round(settings.scoreOpacity * 100) + '%'; };
    so.oninput = () => { settings.scoreOpacity = parseFloat(so.value); sov(); save(); };
    sov();
    document.querySelectorAll('input[name=diff]').forEach(r => {
      r.onchange = () => { settings.difficulty = r.value; save(); if (selected) renderDetail(); };
    });
    document.querySelectorAll('input[name=hands]').forEach(r => {
      r.onchange = () => { settings.hands = r.value; save(); if (selected) renderDetail(); };
    });
    for (const k of ['longNotes', 'noFail', 'autoplay', 'showScore']) {
      $('#' + k).checked = !!settings[k];
      $('#' + k).onchange = (e) => { settings[k] = e.target.checked; save(); };
    }
    updateHelp();
  }

  function updateHelp() {
    $('#playHelp').textContent = settings.wait
      ? '노트를 칠 때까지 곡이 멈춰서 기다립니다. 천천히 익힐 때 사용하세요.'
      : '곡이 멈추지 않고 진행되며, 놓친 노트는 MISS가 됩니다.';
    $('#keyHelp').innerHTML =
      '<b>🎹 피아노</b>: MIDI 피아노 · 키보드 흰건반 <b>1~0, q~m</b>, 검은건반 <b>Shift</b>+키, 양 끝 건반 <b>Ctrl/Alt</b>+키 ' +
      '(7키 보기: <b>S D F Space J K L</b>)<br>' +
      '<b>🎸 베이스</b>: 4레인 <b>D F J K</b> · <b>⚡ 일렉기타</b>: 5레인 <b>D F Space J K</b> — 친 음이 악기 소리로 납니다. ' +
      'MIDI 건반은 한 옥타브를 레인 수로 나눠 씁니다.<br>' +
      '<b>🥁 드럼</b>: 전자드럼(MIDI) 연결 · 피아노 건반은 도~시 · 키보드 <b>S D F Space J K L</b> (Space = 킥)<br>' +
      '휴대폰은 화면을 터치해서 연주합니다.';
  }

  // ── MIDI status ──
  Input.onStatus((st) => {
    const el = $('#midiStatus');
    el.classList.remove('ok', 'warn');
    if (!st.supported) { el.textContent = 'Web MIDI 미지원 (Chrome/Edge 권장)'; el.classList.add('warn'); }
    else if (st.error) { el.textContent = 'MIDI 접근 거부됨'; el.classList.add('warn'); }
    else if (!st.devices.length) { el.textContent = 'MIDI 장치 없음 (키보드·터치로도 가능)'; el.classList.add('warn'); }
    else { el.textContent = '🎹 ' + st.devices.join(', '); el.classList.add('ok'); }
  });
  Input.initMIDI();

  // ── tabs / song list / detail ──
  function fmtTime(s) { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function songLength(s) {
    let e = 0;
    for (const p of s.parts) for (const n of p.notes) e = Math.max(e, n.time + n.dur);
    return e;
  }
  // songs shown in the current tab: instrument-exclusive songs only in their own tab (listed first)
  function visibleSongs() {
    const list = songs.filter(s => !s.exclusive || s.exclusive === inst());
    return list.filter(s => s.exclusive).concat(list.filter(s => !s.exclusive));
  }

  function renderTabs() {
    document.querySelectorAll('#tabs .tab').forEach(t => {
      t.classList.toggle('on', t.dataset.inst === inst());
      t.onclick = () => selectTab(t.dataset.inst);
    });
  }
  function selectTab(name) {
    settings.instrument = name;
    save();
    const vis = visibleSongs();
    if (!vis.includes(selected)) selected = vis[0] || null;
    renderTabs();
    renderSongs();
    renderDetail();
  }

  function renderSongs() {
    const ul = $('#songList');
    ul.innerHTML = '';
    for (const s of visibleSongs()) {
      const li = document.createElement('li');
      if (s === selected) li.classList.add('sel');
      li.innerHTML = `<b></b><small></small>`;
      li.querySelector('b').textContent = s.title;
      if (s.exclusive) li.querySelector('b').insertAdjacentHTML('beforeend', '<span class="badge">전용곡</span>');
      li.querySelector('small').textContent = `${s.artist} · ${fmtTime(songLength(s))}`;
      li.onclick = () => { selected = s; renderSongs(); renderDetail(); };
      ul.appendChild(li);
    }
  }

  function renderDetail() {
    const s = selected;
    const I = INSTRUMENTS[inst()];
    $('#instLabel').textContent = `${I.icon} ${I.name}로 연주`;
    document.querySelectorAll('input[name=diff]').forEach(r => { r.checked = r.value === settings.difficulty; });
    $('#diffHelp').textContent = DIFF_HELP[inst()][settings.difficulty];
    if (!s) {
      $('#songTitle').textContent = '곡을 선택하세요';
      $('#songMeta').textContent = $('#songCredit').textContent = '';
      $('#drumStyleRow').innerHTML = '';
      $('#startBtn').disabled = true;
      return;
    }
    $('#songTitle').textContent = s.title;
    // part setting (piano): right / left / both hands
    const hp = $('#handPick');
    hp.classList.toggle('hidden', inst() !== 'piano');
    const hasL = hasLeftHand(s);
    const hands = handsFor(s);
    document.querySelectorAll('input[name=hands]').forEach(r => {
      r.checked = r.value === hands;
      r.disabled = !hasL && r.value !== 'R';
      r.parentElement.classList.toggle('disabled', r.disabled);
    });
    $('#handHelp').textContent = hasL
      ? ({ R: '오른손 파트를 칩니다. 왼손은 자동 반주로 나옵니다.', L: '왼손 파트를 칩니다. 오른손은 자동 반주로 나옵니다.',
           both: '양손 파트를 모두 칩니다.' })[hands]
      : '이 곡은 멜로디(오른손) 파트만 있어요.';
    const nPlay = buildChart(s).play.length;
    $('#songMeta').textContent = `${s.artist} · ${fmtTime(songLength(s) / settings.rate)} · ${DIFF_NAME[settings.difficulty]} 노트 ${nPlay}개`;
    $('#songCredit').textContent = s.credit || '';

    // drum style picker (regenerates the auto drum part)
    const dr = $('#drumStyleRow');
    dr.innerHTML = '';
    const auto = s.parts.find(p => p.autoDrum);
    if (auto && !s.backing) {
      const row = document.createElement('div');
      row.className = 'part drum-style';
      row.innerHTML = `<div class="info"><b>🥁 드럼 스타일</b><small>곡 분위기를 바꿔보세요</small></div><select></select>`;
      const sel = row.querySelector('select');
      for (const [k, name] of Object.entries(Songs.DRUM_STYLES)) sel.add(new Option(name, k, false, k === s.drumStyle));
      sel.onchange = () => {
        s.drumStyle = sel.value;
        auto.notes = Songs.makeDrums(s.bars, s.finalAt, s.beatSec, s.drumStyle, s.barBeats);
        if (auto.role === 'off') auto.role = 'accomp';
        renderDetail();
      };
      dr.appendChild(row);
    }

    $('#startBtn').disabled = nPlay === 0;
  }

  // ── MIDI → song ──
  const RIGHT = /right|upper|^up$|\brh\b|treble|오른/i, LEFT = /left|lower|^down$|\blh\b|bass|왼/i;

  // Tag piano parts with hands: by track name, by pitch (two piano tracks), or by splitting one track at middle C.
  function assignHands(parts) {
    const piano = parts.filter(p => !p.isDrum && p.inst === 'piano');
    const label = () => {
      for (const p of piano) if (p.hand && !/[가-힣]/.test(p.name)) p.name = (p.hand === 'R' ? '오른손' : '왼손') + ` (${p.name})`;
      return parts;
    };
    for (const p of piano) p.hand = RIGHT.test(p.name) ? 'R' : LEFT.test(p.name) ? 'L' : null;
    if (piano.some(p => p.hand)) return label();
    const avg = (p) => p.notes.reduce((a, n) => a + n.midi, 0) / p.notes.length;
    if (piano.length === 2) {
      const [hi, lo] = piano.slice().sort((x, y) => avg(y) - avg(x));
      hi.hand = 'R'; lo.hand = 'L';
      return label();
    }
    if (piano.length === 1) {
      const p = piano[0];
      const low = p.notes.filter(n => n.midi < 60), high = p.notes.filter(n => n.midi >= 60);
      if (low.length > p.notes.length * 0.15 && high.length > p.notes.length * 0.15) {
        const i = parts.indexOf(p);
        parts.splice(i, 1,
          { ...p, name: '오른손 (자동 분리)', hand: 'R', notes: high },
          { ...p, name: '왼손 (자동 분리)', hand: 'L', notes: low });
      }
    }
    return parts;
  }

  function songFromMidi(buf, meta) {
    const mf = MidiFile.parse(buf, { trim: !meta.backing });   // keep timing exact when audio is synced to it
    const k = meta.tempoScale || 1;                      // fixes files without a tempo marking
    let parts = mf.parts.filter(p => p.notes.length);
    if (!parts.length) throw new Error('노트가 없습니다.');
    for (const p of parts) {
      p.inst = p.isDrum ? 'drum' : GM_INST[(p.program ?? 0) >> 3];
      if (k !== 1) p.notes = p.notes.map(n => ({ ...n, time: n.time * k, dur: n.dur * k }));
    }
    parts = assignHands(parts);
    // roles: right hand (or the busiest melodic part) is played, everything else accompanies
    let lead = parts.find(p => p.hand === 'R');
    if (!lead) {
      for (const p of parts) if (!p.isDrum && (!lead || p.notes.length > lead.notes.length)) lead = p;
      if (lead) lead.hand = 'R';
    }
    for (const p of parts) p.role = p === lead ? 'play' : 'accomp';
    // drums are always in: generated groove unless the file brings its own drums
    const bars = mf.bars.map(b => b * k);
    const hasDrums = parts.some(p => p.isDrum);
    let finalAt = 0;
    for (const p of parts) if (!p.isDrum) for (const n of p.notes) finalAt = Math.max(finalAt, n.time);
    const style = meta.drumStyle || 'disco';
    parts.push({ name: '자동 드럼', role: hasDrums || meta.drums === false ? 'off' : 'accomp', inst: 'drum', isDrum: true, autoDrum: true,
                 program: null, notes: Songs.makeDrums(bars, finalAt, mf.beatSec * k, style, mf.barBeats) });
    return { id: meta.id || 'file-' + Date.now(), title: meta.title, artist: meta.artist || 'MIDI 파일', credit: meta.credit,
             parts, bars, barBeats: mf.barBeats, beatSec: mf.beatSec * k, finalAt, drumStyle: style,
             exclusive: meta.exclusive, backing: meta.backing, backingOffset: meta.backingOffset || 0 };
  }

  async function importFile(file) {
    try {
      const song = songFromMidi(await file.arrayBuffer(), { title: file.name.replace(/\.midi?$/i, '') });
      songs.push(song);
      selected = song;
      renderSongs();
      renderDetail();
    } catch (err) {
      alert('MIDI 파일을 불러오지 못했습니다.\n' + err.message);
    }
  }

  // songs/songs.json lists extra MIDI songs shipped with the site
  function xhr(url, type) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('GET', url);
      x.responseType = type;
      x.onload = () => (x.status === 200 || (x.status === 0 && x.response)) ? resolve(x.response) : reject(new Error('HTTP ' + x.status));
      x.onerror = () => reject(new Error('network'));
      x.send();
    });
  }
  async function loadLibrary() {
    let list;
    try {
      list = await xhr('songs/songs.json', 'json');
      if (!Array.isArray(list)) throw new Error('bad list');
    } catch {
      $('#libNote').textContent = '클래식 곡은 웹 서버에서 열어야 보입니다 (GitHub Pages 또는 npx serve).';
      return;
    }
    for (const meta of list) {
      try {
        songs.push(songFromMidi(await xhr('songs/' + meta.file, 'arraybuffer'), meta));
        renderSongs();
      } catch (e) { console.warn('곡을 불러오지 못했습니다:', meta.file, e); }
    }
  }

  $('#midiFile').onchange = (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; };
  const dz = $('#dropZone');
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => {
    e.preventDefault(); dz.classList.remove('over');
    for (const f of e.dataTransfer.files) importFile(f);
  };
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => e.preventDefault());

  // ── charts ──
  // Keep one note per onset (highest for melody, lowest for bass) and drop notes closer than minGap.
  function pickNotes(notes, minGap, lowest = false) {
    const sorted = notes.slice().sort((a, b) => a.time - b.time || (lowest ? a.midi - b.midi : b.midi - a.midi));
    const kept = new Set();
    let last = -Infinity, clusterAt = -Infinity;
    for (const n of sorted) {
      if (n.time - clusterAt < 0.03) continue;          // same onset: the first in sort order was considered
      clusterAt = n.time;
      if (n.time - last >= minGap) { kept.add(n); last = n.time; }
    }
    return kept;
  }

  const hasLeftHand = (s) => s.parts.some(p => p.hand === 'L' && p.role !== 'off' && p.notes.length);
  const handsFor = (s) => hasLeftHand(s) ? settings.hands : 'R';

  // piano: play the chosen hand(s); easy / normal keep one note per chord (top for right hand, bottom for left)
  function buildPianoChart(s, diff) {
    const hands = handsFor(s);
    const accomp = [], score = [];
    const right = [], left = [];
    const pianoParts = [];
    for (const p of s.parts) {
      if (p.role === 'off') continue;
      const instr = p.inst || 'piano';
      const isPlay = !p.isDrum && ((p.hand === 'R' && hands !== 'L') || (p.hand === 'L' && hands !== 'R'));
      if (isPlay) (p.hand === 'L' ? left : right).push(...p.notes);
      else accomp.push(...p.notes.map(n => ({ ...n, inst: instr })));
      if (!p.isDrum && (isPlay || instr === 'piano')) pianoParts.push(p);
    }
    let play = right.concat(left);
    let kept = new Set(play);
    if (diff !== 'hard') {
      const gap = (diff === 'easy' ? 0.35 : 0.12) * settings.rate;
      kept = new Set([...pickNotes(right, gap), ...pickNotes(left, gap, true)]);
      for (const n of play) if (!kept.has(n)) accomp.push({ ...n, inst: 'piano' });
      play = play.filter(n => kept.has(n));
    }
    for (const p of pianoParts) for (const n of p.notes) score.push({ time: n.time, dur: n.dur, midi: n.midi, play: kept.has(n) });
    return { play, accomp, score };
  }

  // drum: the drum part becomes the chart; every other part is backing
  function buildDrumChart(s, diff) {
    const MAP = Game.GM_TO_LANE;
    let drums = s.parts.filter(p => p.isDrum && p.role !== 'off');
    if (!drums.length) drums = s.parts.filter(p => p.autoDrum);
    const accomp = [], cand = [];
    for (const p of s.parts) {
      if (p.role === 'off' && !drums.includes(p)) continue;
      if (drums.includes(p)) {
        for (const n of p.notes) (MAP[n.midi] !== undefined ? cand : accomp).push({ ...n, inst: 'drum' });
      } else accomp.push(...p.notes.map(n => ({ ...n, inst: p.inst || 'piano' })));
    }
    // easy = kick/snare/crash, normal = + 8th-note hats, toms, ride, hard = everything
    const maxLvl = { easy: 1, normal: 2, hard: 3 }[diff];
    const minGap = { easy: 0.22, normal: 0.11, hard: 0.05 }[diff] * settings.rate;
    const coreLane = (m) => [0, 2, 3].includes(MAP[m]);
    const lastByLane = {};
    const play = [];
    for (const n of cand.sort((a, b) => a.time - b.time)) {
      const lvl = n.lvl ?? (n.vel < 0.4 ? 3 : coreLane(n.midi) ? 1 : 2);   // files without levels: guess
      const lane = MAP[n.midi];
      const ok = lvl <= maxLvl && n.time - (lastByLane[lane] ?? -1) >= minGap;
      if (ok) { play.push(n); lastByLane[lane] = n.time; } else accomp.push(n);
    }
    return { play, accomp, score: [] };
  }

  // bass (4 lanes) / guitar (5 lanes): one note at a time; the lane follows the pitch contour
  function buildFretChart(s, diff, which) {
    const N = which === 'bass' ? 4 : 5;
    const hitInst = which === 'bass' ? 'bass' : (s.tone || 'eguitar');
    let srcParts = which === 'bass'
      ? s.parts.filter(p => p.inst === 'bass' && !p.isDrum)
      : s.parts.filter(p => p.role === 'play');
    const accomp = [];
    let src;
    if (srcParts.length) {
      src = srcParts.flatMap(p => p.notes);
    } else {
      // no bass track (e.g. a piano piece): lowest left-hand note of each beat, moved into bass range
      const lh = s.parts.filter(p => p.hand === 'L' && p.role !== 'off');
      const low = pickNotes(lh.flatMap(p => p.notes), 0.05, true);
      src = [...low].map(n => {
        let m = n.midi;
        while (m > 52) m -= 12;
        while (m < 28) m += 12;
        return { ...n, midi: m };
      });
    }
    for (const p of s.parts) {
      if (p.role === 'off' || srcParts.includes(p)) continue;
      accomp.push(...p.notes.map(n => ({ ...n, inst: p.inst || 'piano' })));
    }
    const kept = pickNotes(src, { easy: 0.3, normal: 0.15, hard: 0.07 }[diff] * settings.rate, which === 'bass');
    const notes = src.filter(n => kept.has(n));
    for (const n of src) if (!kept.has(n)) accomp.push({ ...n, inst: hitInst });

    // lanes: rank pitches by how often they occur so the notes spread across all lanes
    const count = new Map();
    for (const n of notes) count.set(n.midi, (count.get(n.midi) || 0) + 1);
    const uniq = [...count.keys()].sort((a, b) => a - b);
    const laneOf = new Map();
    if (uniq.length <= N * 2) {                         // few pitches: spread them evenly over the lanes
      uniq.forEach((m, i) => laneOf.set(m, uniq.length === 1 ? Math.floor(N / 2) : Math.round(i * (N - 1) / (uniq.length - 1))));
    } else {
      let acc = 0;
      for (const m of uniq) {
        const c = count.get(m);
        laneOf.set(m, Math.min(N - 1, Math.floor(((acc + c / 2) / notes.length) * N)));
        acc += c;
      }
    }
    const play = notes.map(n => ({ ...n, lane: laneOf.get(n.midi) }));
    return { play, accomp, score: [], hitInst };
  }

  function buildChart(s) {
    const diff = settings.difficulty || 'normal';
    const which = inst();
    const c = which === 'drum' ? buildDrumChart(s, diff)
            : which === 'piano' ? buildPianoChart(s, diff)
            : buildFretChart(s, diff, which);
    return { title: s.title, diff: DIFF_NAME[diff], inst: which, bars: s.bars, beatSec: s.beatSec, song: s,
             backingOffset: s.backingOffset, ...c };
  }

  // ── game flow ──
  async function startGame(chart) {
    if (!chart || !chart.play.length) return;
    lastChart = chart;
    await Sound.ensure();
    const s = chart.song;
    if (s && s.backing && !s.backingBuffer) {               // decode the backing audio once, on first play
      const btn = $('#startBtn'), label = btn.innerHTML;
      btn.disabled = true; btn.textContent = '배경음 불러오는 중…';
      try {
        s.backingBuffer = await Sound.ctx.decodeAudioData(await xhr('songs/' + s.backing, 'arraybuffer'));
      } catch (e) {
        alert('배경음을 불러오지 못했습니다. 웹 서버(GitHub Pages 또는 npx serve)에서 열어주세요.');
      }
      btn.innerHTML = label; btn.disabled = false;
    }
    chart.backing = s && s.backingBuffer || null;
    show('#game');
    await goLandscape();
    const mode = chart.inst === 'piano' ? settings.mode : chart.inst;
    game.setup(chart, { ...settings, mode, compact: isTouch || innerWidth < 900, hitInst: chart.hitInst, tip: pickTip(chart.inst) });
    game.start();
  }

  $('#startBtn').onclick = () => selected && startGame(buildChart(selected));

  game.onFinish = (r) => {
    show('#result');
    const I = INSTRUMENTS[lastChart.inst];
    $('#resTitle').textContent = `${I.icon} ${r.title} · ${lastChart.diff}` + (r.wait ? ' · 연습 모드' : '') + (r.autoplay ? ' (AUTO)' : '');
    const rk = $('#resRank');
    rk.textContent = r.rank;
    rk.className = 'rank ' + r.rank;
    $('#resState').textContent = r.failed ? '실패…' : r.fullCombo ? (r.counts.GOOD + r.counts.BAD === 0 ? '✨ ALL COOL ✨' : 'FULL COMBO!') : '클리어';
    $('#resScore').textContent = r.score.toLocaleString();
    $('#resAcc').textContent = r.accuracy.toFixed(2) + '%';
    $('#resCombo').textContent = r.maxCombo;
    $('#resCool').textContent = r.counts.COOL;
    $('#resGood').textContent = r.counts.GOOD;
    $('#resBad').textContent = r.counts.BAD;
    $('#resMiss').textContent = r.counts.MISS;
    $('#resFastSlow').textContent = `FAST ${r.fast} · SLOW ${r.slow}` +
      (r.fast + r.slow >= 8 ? (r.slow > r.fast * 2 ? ' — 전체적으로 늦어요. 판정 오프셋을 +로 올려보세요.' :
                               r.fast > r.slow * 2 ? ' — 전체적으로 빨라요. 판정 오프셋을 −로 내려보세요.' : '') : '');
  };

  const toMenu = () => { game.stop(); show('#menu'); leaveLandscape(); };
  const restart = () => { game.stop(); startGame(lastChart); };
  const togglePause = () => {
    if (game.paused) { $('#pauseMenu').classList.add('hidden'); game.resume(); }
    else { game.pause(); $('#pauseMenu').classList.remove('hidden'); }
  };
  $('#resumeBtn').onclick = togglePause;
  $('#restartBtn').onclick = restart;
  $('#quitBtn').onclick = toMenu;
  $('#retryBtn').onclick = restart;
  $('#menuBtn').onclick = toMenu;
  $('#pauseBtn').onclick = togglePause;

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const settingsOpen = !$('#settingsModal').classList.contains('hidden');
    const inMenu = !$('#menu').classList.contains('hidden');
    const inGame = !$('#game').classList.contains('hidden');
    const inResult = !$('#result').classList.contains('hidden');
    if (settingsOpen) { if (e.key === 'Escape') closeSettings(); return; }
    if (inMenu && e.key === 'Enter' && selected && !$('#startBtn').disabled) { e.preventDefault(); $('#startBtn').click(); }
    else if (inGame && e.key === 'Escape') { e.preventDefault(); togglePause(); }
    else if (inGame && game.paused && e.code === 'KeyR') restart();
    else if (inGame && game.paused && e.code === 'KeyQ') toMenu();
    else if (inResult && (e.code === 'KeyR' || e.key === 'Enter')) restart();
    else if (inResult && e.key === 'Escape') toMenu();
  });

  // ── note input routing ──
  const recent = [];
  Input.on((type, midi, vel, ts, src, ch) => {
    if (game.running) {
      if (type === 'on') game.noteOn(midi, vel, ts, src, ch);
      else game.noteOff(midi, ts, src, ch);
      return;
    }
    if (type !== 'on') return;
    recent.push(ch === 9 ? `드럼 ${midi}` : Songs.midiName(midi));
    if (recent.length > 10) recent.shift();
    $('#inputTest').innerHTML = recent.map(n => `<span class="n">${n}</span>`).join('') +
      `<br><small>${src === 'midi' ? `MIDI (채널 ${(ch ?? 0) + 1})` : '키보드'} · 세기 ${Math.round(vel * 127)}</small>`;
  });

  // ── phones: landscape + touch ──
  function applyOrientation() {
    const rot = isTouch && !$('#game').classList.contains('hidden') && innerHeight > innerWidth;
    $('#game').classList.toggle('rot', rot);
    game.rot = rot;
    game.resize();
  }
  async function goLandscape() {
    if (isTouch) {
      try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {}
      try { await screen.orientation.lock('landscape'); } catch {}  // unsupported on iPhone: we rotate with CSS instead
    }
    applyOrientation();
  }
  function leaveLandscape() {
    if (isTouch) {
      try { screen.orientation.unlock(); } catch {}
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
    }
    applyOrientation();
  }
  addEventListener('resize', applyOrientation);
  addEventListener('orientationchange', () => setTimeout(applyOrientation, 200));

  const touches = new Map(); // touch id -> { midi, ch }
  function touchPoint(t) {
    // when the game is rotated 90° clockwise, screen (x, y) maps back to game (y, screenWidth - x)
    return game.rot ? [t.clientY, innerWidth - t.clientX] : [t.clientX, t.clientY];
  }
  function onTouch(e) {
    if (!game.running || game.paused) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const prev = touches.get(t.identifier);
      const hit = e.type === 'touchend' || e.type === 'touchcancel' ? null : game.hitTest(...touchPoint(t));
      if (prev && (!hit || hit.midi !== prev.midi)) { game.noteOff(prev.midi, performance.now(), 'touch', prev.ch); touches.delete(t.identifier); }
      if (hit && (!prev || hit.midi !== prev.midi)) { game.noteOn(hit.midi, 0.8, performance.now(), 'touch', hit.ch); touches.set(t.identifier, hit); }
    }
  }
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) $('#cv').addEventListener(ev, onTouch, { passive: false });

  // warm up audio on first interaction (browsers require a user gesture)
  addEventListener('pointerdown', () => Sound.ensure(), { once: true });

  bindSettings();
  selected = songs.find(s => s.id === 'twinkle') || songs[0];
  selectTab(settings.instrument);
  loadLibrary();
})();
