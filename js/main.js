import { SONGS } from '../songs.js';
import { parseOsu } from './parser.js';
import { Engine, GRADES } from './engine.js';
import { loadSkin, layout, draw, makeDemo } from './render.js';
import { loadSettings, saveSettings, keyLabel } from './settings.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const skin = loadSkin('skin/');
const demo = makeDemo();
const set = loadSettings();

let screen = 'select';          // select | ready | playing | paused | results
let song = null, charts = [], chartIdx = 0, audio = null, engine = null, hitBuf = null, actx = null;
let t0 = 0, audioStarted = false, pausedAt = 0, rebinding = -1;
const vid = $('bgvideo');
let videoFailed = false, previewing = null, previewToken = 0, hoverTimer = 0;
const audios = new Map(), hitBufs = new Map(), chartCache = new Map();
const pressed = [false, false, false, false];
const url = (s, f) => encodeURI(`${s.folder}/${f}`);

// ---------- Pantallas ----------
function show(name) {
  screen = name;
  for (const id of ['select', 'ready', 'pause', 'results']) {
    $('screen-' + id).classList.toggle('hidden', !(id === name || (id === 'pause' && name === 'paused')));
  }
  $('bg').style.opacity = name === 'select' ? 0 : 1;
  $('dim').style.display = name === 'select' ? 'none' : 'block';
}

function applyVisuals() {
  $('dim').style.opacity = set.bgDim / 100;
  for (const a of [audio, previewing]) if (a) a.volume = set.musicVol / 100;
}

// ---------- Selección de canción ----------
const getAudio = (s) => {
  if (!audios.has(s.id)) { const a = new Audio(url(s, s.audio)); a.preload = 'auto'; audios.set(s.id, a); }
  return audios.get(s.id);
};
// Solo se cargan las dificultades de mania 4K (se ignoran otros modos)
const loadCharts = (s) => {
  if (!chartCache.has(s.id)) {
    chartCache.set(s.id, Promise.all(s.charts.map(async (f) => {
      const map = parseOsu(await (await fetch(url(s, f))).text());
      return { file: f, ...map };
    })).then((l) => l.filter((c) => c.meta.mode === 3 && c.keys === 4)));
  }
  return chartCache.get(s.id);
};

for (const s of SONGS) {
  const b = document.createElement('button');
  b.className = 'song';
  b.style.setProperty('--bg', `url("${url(s, s.background)}")`);
  b.innerHTML = `<b>${s.title}</b><span>${s.artist} · mapa de ${s.mapper}<br>${s.charts.length} dificultad${s.charts.length > 1 ? 'es' : ''} · 4K${s.video ? ' · video' : ''}</span>`;
  b.onclick = () => openSong(s);
  b.onmouseenter = () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => startPreview(s), 250); };
  b.onmouseleave = () => clearTimeout(hoverTimer);
  $('song-list').append(b);
}

// Vista previa: suena desde PreviewTime (leído del .osu) hasta el final, y vuelve a ese punto
async function startPreview(s) {
  const token = ++previewToken;
  const a = getAudio(s);
  let list = [];
  try { list = await loadCharts(s); } catch { return; }
  if (token !== previewToken || !list.length) return;
  const pt = Math.max(0, list[0].meta.previewTime) / 1000;
  if (previewing && previewing !== a) { previewing.onended = null; previewing.pause(); }
  if (previewing === a && !a.paused) return;
  previewing = a; a.volume = set.musicVol / 100; a.currentTime = pt;
  a.onended = () => { if (previewing === a) { a.currentTime = pt; a.play().catch(() => {}); } };
  a.play().catch(() => {}); // el navegador puede bloquearlo hasta el primer clic
}
function stopPreview() {
  previewToken++; clearTimeout(hoverTimer);
  if (previewing) { previewing.onended = null; previewing.pause(); previewing = null; }
}

async function openSong(s) {
  song = s; initAudioCtx();
  $('loading').classList.remove('hidden');
  try { charts = await loadCharts(s); } catch (e) { console.error(e); charts = []; }
  $('loading').classList.add('hidden');
  if (!charts.length) { alert('No se encontraron dificultades 4K para esta canción. Revisa songs.js y las rutas.'); return; }
  chartIdx = 0; videoFailed = false;
  loadHit(s);
  enterReady();
}

function enterReady() {
  show('ready'); stopVideo();
  $('bg').style.backgroundImage = `url("${url(song, song.background)}")`;
  $('info-title').textContent = song.title;
  $('info-meta').innerHTML = `${song.artist}<br>Mapa: ${song.mapper}`;
  renderDiffs(); syncVideoUI(); syncVideoSrc(); applyVisuals();
  startPreview(song);
}

function renderDiffs() {
  $('diff-list').innerHTML = '';
  charts.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'diff' + (i === chartIdx ? ' active' : '');
    b.innerHTML = `<b>${c.meta.version}</b><span>${c.notes.length} notas · ${c.lnCount} largas · OD ${c.od}</span>`;
    b.onclick = () => { chartIdx = i; renderDiffs(); };
    $('diff-list').append(b);
  });
}

// ---------- Video de fondo ----------
const videoUsable = () => !!(song && song.video && !videoFailed);
const videoOn = () => videoUsable() && set.video;
vid.onerror = () => { if (vid.getAttribute('src')) { videoFailed = true; syncVideoUI(); } };
function syncVideoSrc() {
  if (!videoOn()) return;
  const src = url(song, song.video);
  if (vid.getAttribute('data-src') !== src) { vid.setAttribute('data-src', src); vid.src = src; vid.load(); }
}
function syncVideoUI() { $('row-video').hidden = !videoUsable(); } // sin video: la opción desaparece
function stopVideo() { vid.pause(); vid.style.opacity = 0; }
function syncVideo(raw) {
  if (!videoOn() || !vid.readyState) { vid.style.opacity = 0; return; }
  const vt = (raw - (charts[chartIdx].meta.videoOffset || 0)) / 1000;
  if (vt < 0 || vt > vid.duration) { vid.style.opacity = 0; if (!vid.paused) vid.pause(); return; }
  vid.style.opacity = 1;
  if (vid.paused) { vid.currentTime = vt; vid.play().catch(() => {}); }
  else if (Math.abs(vid.currentTime - vt) > 0.25) vid.currentTime = vt;
}

function initAudioCtx() { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); }
function loadHit(s) {
  hitBuf = hitBufs.get(s.id) || null;
  if (hitBuf) return;
  fetch(url(s, s.hitsound)).then((r) => r.arrayBuffer()).then((b) => actx.decodeAudioData(b)).then((d) => { hitBufs.set(s.id, d); if (song === s) hitBuf = d; }).catch(() => {});
}
function playHit() {
  if (!hitBuf || !actx) return;
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = hitBuf; g.gain.value = set.sfxVol / 100;
  src.connect(g).connect(actx.destination); src.start();
}

// ---------- Ajustes ----------
const ROWS = [
  { id: 'speed', label: 'Velocidad', min: 1, max: 40, step: 1 },
  { id: 'musicVol', label: 'Volumen música', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'sfxVol', label: 'Volumen golpes', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'bgDim', label: 'Oscurecer fondo', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'fieldOpacity', label: 'Opacidad del campo', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'offset', label: 'Offset (+ = notas antes)', min: -150, max: 150, step: 1, unit: ' ms' },
];

const PAUSE_ROWS = [
  { id: 'musicVol', label: 'Volumen música', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'sfxVol', label: 'Volumen golpes', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'bgDim', label: 'Oscurecer fondo', min: 0, max: 100, step: 1, unit: '%' },
  { id: 'fieldOpacity', label: 'Opacidad del campo', min: 0, max: 100, step: 1, unit: '%' },
];

const settingSyncs = new Map();

function bindSettingRow(r, container) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label>${r.label}<output></output></label><input type="range" autocomplete="off" min="${r.min}" max="${r.max}" step="${r.step}">`;
  const input = row.querySelector('input'), out = row.querySelector('output');
  const sync = () => { out.textContent = set[r.id] + (r.unit || ''); input.value = set[r.id]; };
  sync();
  if (!settingSyncs.has(r.id)) settingSyncs.set(r.id, []);
  settingSyncs.get(r.id).push(sync);

  input.oninput = () => {
    set[r.id] = +input.value;
    saveSettings(set);
    applyVisuals();
    (settingSyncs.get(r.id) || []).forEach((fn) => fn());
    input.blur();
  };
  container.append(row);
}

for (const r of ROWS) bindSettingRow(r, $('settings-rows'));
const pauseSettingsEl = $('pause-settings');
if (pauseSettingsEl) {
  for (const r of PAUSE_ROWS) bindSettingRow(r, pauseSettingsEl);
}
{
  const row = document.createElement('div'); row.className = 'row check'; row.id = 'row-video'; row.hidden = true;
  row.innerHTML = `<label><span>Video de fondo</span><input type="checkbox"></label>`;
  const cb = row.querySelector('input'); cb.checked = set.video;
  cb.onchange = () => { set.video = cb.checked; saveSettings(set); syncVideoSrc(); cb.blur(); };
  $('settings-rows').append(row);
}
{
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label>Dirección</label><select><option value="down">Hacia abajo</option><option value="up">Hacia arriba</option></select>`;
  const sel = row.querySelector('select'); sel.value = set.scroll;
  sel.onchange = () => { set.scroll = sel.value; saveSettings(set); sel.blur(); };
  $('settings-rows').append(row);
}
function renderKeys() {
  $('key-row').innerHTML = '';
  set.keys.forEach((k, i) => {
    const b = document.createElement('button');
    b.textContent = rebinding === i ? '…' : keyLabel(k); b.className = rebinding === i ? 'wait' : '';
    b.onclick = () => { rebinding = i; renderKeys(); };
    $('key-row').append(b);
  });
}
renderKeys();

// ---------- Reloj de la canción ----------
// Se usa performance.now() (suave) corregido con audio.currentTime (que avanza a saltos).
const rawTime = (p = performance.now()) => p - t0;
const songTime = (p = performance.now()) => p - t0 + set.offset;

function syncClock() {
  const p = performance.now();
  if (!audioStarted && p - t0 >= 0) { audioStarted = true; audio.play().catch(() => {}); }
  if (audioStarted && !audio.paused && audio.currentTime > 0.02) {
    const drift = p - t0 - audio.currentTime * 1000;
    t0 += Math.abs(drift) > 100 ? drift : drift * 0.05;
  }
}

async function startGame() {
  show('ready'); $('loading').classList.remove('hidden');
  try {
    initAudioCtx(); stopPreview();
    const chart = charts[chartIdx];
    engine = new Engine(chart.notes, chart.od, chart.keys);
    audio = getAudio(song); audio.onended = null; audio.pause(); audio.currentTime = 0; applyVisuals();
    const waitFor = (el, ev, ok) => new Promise((res) => {
      if (ok()) return res();
      el.addEventListener(ev, res, { once: true }); el.addEventListener('error', res, { once: true });
      setTimeout(res, 12000);
    });
    syncVideoSrc(); vid.currentTime = 0;
    await Promise.all([
      waitFor(audio, 'canplaythrough', () => audio.readyState >= 3),
      videoOn() ? waitFor(vid, 'canplay', () => vid.readyState >= 3) : null,
    ]);
    audioStarted = false; t0 = performance.now() + 2000; // 2 s de cuenta previa
    $('loading').classList.add('hidden');
    show('playing');
  } catch (e) {
    console.error('Error al iniciar:', e); $('loading').classList.add('hidden'); alert('No se pudo cargar la canción. Mira la consola.');
  }
}

function stopAudio() { if (audio) { audio.pause(); audio.currentTime = 0; } stopVideo(); }
function pause() { if (screen !== 'playing') return; pausedAt = performance.now(); audio.pause(); vid.pause(); show('paused'); }
function resume() { if (screen !== 'paused') return; t0 += performance.now() - pausedAt; if (audioStarted) audio.play(); show('playing'); }
function endGame() {
  stopAudio(); const st = engine.stats();
  $('res-rank').textContent = st.rank;
  $('res-title').textContent = `${song.title} [${charts[chartIdx].meta.version}]`;
  $('res-score').textContent = String(st.score).padStart(7, '0');
  $('res-acc').textContent = st.acc.toFixed(2) + '%';
  $('res-combo').textContent = st.maxCombo + 'x';
  $('res-counts').innerHTML = GRADES.map((g) => `<div>${g === 'max' ? 'MAX' : g === 'miss' ? 'Miss' : g}: <b>${st.counts[g]}</b></div>`).join('');
  show('results');
}

// ---------- Botones ----------
$('btn-play').onclick = startGame;
$('btn-back').onclick = () => { stopAudio(); stopPreview(); show('select'); };
$('btn-resume').onclick = resume;
$('btn-retry').onclick = () => { stopAudio(); startGame(); };
$('btn-quit').onclick = () => { stopAudio(); engine = null; enterReady(); };
$('btn-again').onclick = () => { engine = null; enterReady(); };
$('btn-songs').onclick = () => { engine = null; stopVideo(); show('select'); };

// ---------- Velocidad con F3 / F4 (como osu!mania) ----------
let speedToast = null;
function changeSpeed(delta) {
  set.speed = Math.min(40, Math.max(1, set.speed + delta));
  saveSettings(set);
  speedToast = { time: performance.now(), speed: set.speed };
  (settingSyncs.get('speed') || []).forEach((fn) => fn());
}

// ---------- Teclado ----------
window.addEventListener('keydown', (e) => {
  if (rebinding >= 0) {
    e.preventDefault();
    if (e.code !== 'Escape') {
      const j = set.keys.indexOf(e.code); if (j >= 0) set.keys[j] = set.keys[rebinding]; // intercambia si estaba repetida
      set.keys[rebinding] = e.code; saveSettings(set);
    }
    rebinding = -1; renderKeys(); return;
  }
  if (e.code === 'F3') { e.preventDefault(); changeSpeed(-1); return; }
  if (e.code === 'F4') { e.preventDefault(); changeSpeed(1); return; }
  if (e.code === 'Escape') { e.preventDefault(); screen === 'playing' ? pause() : screen === 'paused' ? resume() : screen === 'ready' && $('btn-back').click(); return; }
  const col = set.keys.indexOf(e.code);
  if (col < 0) return;
  e.preventDefault();
  if (e.repeat) return;
  pressed[col] = true;
  if (screen === 'playing' && engine) { if (engine.press(col, songTime(e.timeStamp))) playHit(); }
});
window.addEventListener('keyup', (e) => {
  const col = set.keys.indexOf(e.code);
  if (col < 0) return;
  pressed[col] = false;
  if (screen === 'playing' && engine && engine.release(col, songTime(e.timeStamp))) playHit();
});
window.addEventListener('blur', () => { pressed.fill(false); pause(); });

// ---------- Bucle principal ----------
function resize() {
  const dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return layout(W, H, set);
}

function frame() {
  const L = resize();
  if (screen === 'playing' && engine) {
    syncClock();
    syncVideo(rawTime());
    const t = songTime();
    engine.update(t);
    draw(ctx, { L, skin, set, pressed, engine, t, mode: 'play', speedToast });
    if (engine.isFinished(t)) endGame();
  } else if (screen === 'paused' && engine) {
    draw(ctx, { L, skin, set, pressed, engine, t: songTime(pausedAt), mode: 'play', speedToast });
  } else if (screen === 'ready') {
    draw(ctx, { L, skin, set, pressed, demo, mode: 'preview', speedToast });
  } else if (screen === 'results' && engine) {
    draw(ctx, { L, skin, set, pressed, engine, t: engine.lastTime + 1, mode: 'field', speedToast });
  } else ctx.clearRect(0, 0, L.W, L.H);
  requestAnimationFrame(frame);
}

show('select'); applyVisuals();
requestAnimationFrame(frame);
