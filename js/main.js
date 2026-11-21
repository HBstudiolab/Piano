// Menu / screens / settings glue.
(function () {
  const $ = (s) => document.querySelector(s);
  const DEFAULTS = { mode: 'seven', speed: 3, rate: 1, offset: 0, keySound: 'auto', longNotes: true, noFail: true, autoplay: false,
                     wait: false, showScore: true, scoreOpacity: 0.7 };
  // GM program family -> synth instrument
  const GM_INST = ['piano', 'pluck', 'organ', 'pluck', 'bass', 'strings', 'strings', 'brass',
                   'brass', 'organ', 'lead', 'strings', 'lead', 'pluck', 'pluck', 'piano'];
  const INST_NAME = { piano: '피아노', strings: '현악', bass: '베이스', organ: '오르간', pluck: '기타/플럭',
                      brass: '브라스', lead: '신스 리드', drum: '드럼' };
  const GM_FAMILY = ['피아노', '크로매틱 퍼커션', '오르간', '기타', '베이스', '현악기', '앙상블', '브라스',
                     '리드', '관악기', '신스 리드', '신스 패드', '신스 효과', '민속 악기', '타악기', '효과음'];

  let settings = { ...DEFAULTS };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('keyfall.settings') || '{}')); } catch {}
  const save = () => { try { localStorage.setItem('keyfall.settings', JSON.stringify(settings)); } catch {} };

  const songs = Songs.list.slice();
  let selected = null;
  let lastChart = null;
  const game = new Game($('#cv'));

  // ── screens ──
  function show(id) {
    for (const s of ['#menu', '#game', '#result']) $(s).classList.toggle('hidden', s !== id);
    $('#pauseMenu').classList.add('hidden');
    Input.keyboard.enabled = id === '#game';
  }

  // ── settings UI ──
  function bindSettings() {
    document.querySelectorAll('input[name=mode]').forEach(r => {
      r.checked = r.value === settings.mode;
      r.onchange = () => { settings.mode = r.value; save(); updateHelp(); if (selected) renderDetail(); };
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
    $('#keyHelp').innerHTML = settings.mode === 'seven'
      ? '<b>7키 모드</b>: 옥타브와 상관없이 도·레·미·파·솔·라·시 중 맞는 음을 치면 됩니다. 검은건반(#)은 아래 흰건반 레인으로 처리됩니다.<br>' +
        'MIDI가 없으면 키보드 <b>S D F Space J K L</b>'
      : '<b>피아노 모드</b>: 88건반 위로 노트가 떨어집니다. 정확한 음을 쳐야 합니다.<br>' +
        'MIDI가 없으면 키보드: 흰건반 <b>1~0, q~m</b> (C2~C7), 검은건반 <b>Shift</b>+키, ' +
        '양 끝 확장 건반(점 표시)은 <b>Ctrl</b> 또는 <b>Alt</b>+키';
  }

  // ── MIDI status ──
  Input.onStatus((st) => {
    const el = $('#midiStatus');
    el.classList.remove('ok', 'warn');
    if (!st.supported) { el.textContent = '이 브라우저는 Web MIDI 미지원 (Chrome/Edge 권장)'; el.classList.add('warn'); }
    else if (st.error) { el.textContent = 'MIDI 접근 거부됨: ' + st.error; el.classList.add('warn'); }
    else if (!st.devices.length) { el.textContent = 'MIDI 장치 없음 — 피아노를 연결하세요 (키보드로도 가능)'; el.classList.add('warn'); }
    else { el.textContent = '🎹 ' + st.devices.join(', '); el.classList.add('ok'); }
  });
  Input.initMIDI();

  // ── song list ──
  function fmtTime(s) { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function songLength(s) {
    let e = 0;
    for (const p of s.parts) for (const n of p.notes) e = Math.max(e, n.time + n.dur);
    return e;
  }

  function renderSongs() {
    const ul = $('#songList');
    ul.innerHTML = '';
    for (const s of songs) {
      const li = document.createElement('li');
      if (s === selected) li.classList.add('sel');
      li.innerHTML = `<b></b><small></small>`;
      li.querySelector('b').textContent = s.title;
      li.querySelector('small').textContent = `${s.artist} · ${fmtTime(songLength(s))}`;
      li.onclick = () => { selected = s; renderSongs(); renderDetail(); };
      ul.appendChild(li);
    }
  }

  function partInfo(p) {
    if (!p.notes.length) return '노트 없음';
    let lo = 127, hi = 0;
    for (const n of p.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
    const inst = p.program != null && !p.isDrum ? GM_FAMILY[p.program >> 3] : INST_NAME[p.inst] || '';
    return [inst, `${p.notes.length}노트`, p.isDrum ? '' : `${Songs.midiName(lo)}–${Songs.midiName(hi)}`].filter(Boolean).join(' · ');
  }

  function renderDetail() {
    const s = selected;
    $('#songTitle').textContent = s.title;
    const play = s.parts.filter(p => p.role === 'play');
    const nPlay = play.reduce((a, p) => a + p.notes.length, 0);
    $('#songMeta').textContent = `${s.artist} · ${fmtTime(songLength(s) / settings.rate)} · 연주할 노트 ${nPlay}개`;
    const list = $('#partList');
    list.innerHTML = '';
    for (const p of s.parts) {
      const row = document.createElement('div');
      row.className = 'part';
      row.innerHTML = `<div class="info"><b></b><small></small></div>
        <div class="roles">
          <button data-role="play">연주</button><button data-role="accomp">반주</button><button data-role="off">끔</button>
        </div>`;
      row.querySelector('b').textContent = p.name;
      row.querySelector('small').textContent = partInfo(p);
      row.querySelectorAll('.roles button').forEach(b => {
        b.classList.toggle('on', b.dataset.role === p.role);
        b.onclick = () => { p.role = b.dataset.role; renderDetail(); };
      });
      list.appendChild(row);
    }
    $('#startBtn').disabled = nPlay === 0;
  }

  // ── MIDI file import ──
  async function importFile(file) {
    try {
      const mf = MidiFile.parse(await file.arrayBuffer());
      const parts = mf.parts.filter(p => p.notes.length);
      if (!parts.length) throw new Error('노트가 없습니다.');
      // default: the busiest non-drum part is played, others accompany, drums off
      let best = null;
      for (const p of parts) if (!p.isDrum && (!best || p.notes.length > best.notes.length)) best = p;
      for (const p of parts) {
        p.role = p === best ? 'play' : 'accomp';
        p.inst = p.isDrum ? 'drum' : GM_INST[(p.program ?? 0) >> 3];
      }
      // always offer a disco groove; on by default when the file has no drums of its own
      const hasDrums = parts.some(p => p.isDrum);
      let finalAt = 0;
      for (const p of parts) if (!p.isDrum) for (const n of p.notes) finalAt = Math.max(finalAt, n.time);
      parts.push({ name: '디스코 드럼 (자동)', role: hasDrums ? 'off' : 'accomp', inst: 'drum', isDrum: true,
                   program: null, notes: Songs.discoDrums(mf.bars, finalAt, mf.beatSec) });
      const song = { id: 'file-' + Date.now(), title: file.name.replace(/\.midi?$/i, ''), artist: 'MIDI 파일', parts,
                     bars: mf.bars, beatSec: mf.beatSec };
      songs.push(song);
      selected = song;
      renderSongs();
      renderDetail();
    } catch (err) {
      alert('MIDI 파일을 불러오지 못했습니다.\n' + err.message);
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

  // ── game flow ──
  function buildChart(s) {
    const play = [], accomp = [], score = [];
    for (const p of s.parts) {
      if (p.role === 'off') continue;
      const isPlay = p.role === 'play';
      if (isPlay) play.push(...p.notes);
      else accomp.push(...p.notes.map(n => ({ ...n, inst: p.inst || 'piano' })));
      // sheet music shows the parts you play plus piano accompaniment
      if (!p.isDrum && (isPlay || (p.inst || 'piano') === 'piano')) {
        for (const n of p.notes) score.push({ time: n.time, dur: n.dur, midi: n.midi, play: isPlay });
      }
    }
    return { title: s.title, play, accomp, score, bars: s.bars, beatSec: s.beatSec };
  }

  async function startGame(chart) {
    if (!chart || !chart.play.length) return;
    lastChart = chart;
    await Sound.ensure();
    show('#game');
    game.setup(chart, { ...settings });
    game.start();
  }

  $('#startBtn').onclick = () => selected && startGame(buildChart(selected));

  game.onFinish = (r) => {
    show('#result');
    $('#resTitle').textContent = r.title + (r.wait ? ' · 연습 모드' : '') + (r.autoplay ? ' (AUTO)' : '');
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

  const toMenu = () => { game.stop(); show('#menu'); };
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

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const inMenu = !$('#menu').classList.contains('hidden');
    const inGame = !$('#game').classList.contains('hidden');
    const inResult = !$('#result').classList.contains('hidden');
    if (inMenu && e.key === 'Enter' && selected && !$('#startBtn').disabled) { e.preventDefault(); $('#startBtn').click(); }
    else if (inGame && e.key === 'Escape') { e.preventDefault(); togglePause(); }
    else if (inGame && game.paused && e.code === 'KeyR') restart();
    else if (inGame && game.paused && e.code === 'KeyQ') toMenu();
    else if (inResult && (e.code === 'KeyR' || e.key === 'Enter')) restart();
    else if (inResult && e.key === 'Escape') toMenu();
  });

  // ── note input routing ──
  const recent = [];
  Input.on((type, midi, vel, ts, src) => {
    if (game.running) {
      if (type === 'on') game.noteOn(midi, vel, ts, src);
      else game.noteOff(midi, ts, src);
      return;
    }
    if (type !== 'on') return;
    recent.push(`${Songs.midiName(midi)}`);
    if (recent.length > 10) recent.shift();
    $('#inputTest').innerHTML = recent.map(n => `<span class="n">${n}</span>`).join('') +
      `<br><small>${src === 'midi' ? 'MIDI' : '키보드'} · 세기 ${Math.round(vel * 127)}</small>`;
  });

  // warm up audio on first interaction (browsers require a user gesture)
  addEventListener('pointerdown', () => Sound.ensure(), { once: true });

  bindSettings();
  renderSongs();
  selected = songs[1];
  renderSongs();
  renderDetail();
})();
