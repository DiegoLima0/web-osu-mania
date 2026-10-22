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
  document.body.classList.toggle('playing', name === 'playing');
  for (const id of ['select', 'ready', 'pause', 'results']) {
    $('screen-' + id).classList.toggle('hidden', !(id === name || (id === 'pause' && name === 'paused')));
  }
  $('bg').style.opacity = name === 'select' ? 0 : 1;
  $('dim').style.display = name === 'select' ? 'none' : 'block';
  if (name === 'select') {
    if (typeof updateCarouselLayout === 'function') updateCarouselLayout();
    if (typeof selectSongPreview === 'function') selectSongPreview(selectedSongIdx, false);
  }
}

function applyVisuals() {
  $('dim').style.opacity = set.bgDim / 100;
  for (const a of [audio, previewing]) if (a) a.volume = set.musicVol / 100;
}

// ---------- Selección de canción ----------
const getAudio = (s) => {
  if (!audios.has(s.id)) {
    const a = new Audio(url(s, s.audio));
    a.preload = 'auto';
    a.addEventListener('play', () => syncPlayButtons());
    a.addEventListener('pause', () => syncPlayButtons());
    audios.set(s.id, a);
  }
  return audios.get(s.id);
};
// Solo se cargan las dificultades de mania 4K (se ignoran otros modos) ordenadas por dificultad
const loadCharts = (s) => {
  if (!chartCache.has(s.id)) {
    chartCache.set(s.id, Promise.all(s.charts.map(async (f) => {
      const map = parseOsu(await (await fetch(url(s, f))).text());
      return { file: f, ...map };
    })).then((l) => {
      const filtered = l.filter((c) => c.meta.mode === 3 && c.keys === 4);
      filtered.sort((a, b) => (a.notes.length * (a.od + 2)) - (b.notes.length * (b.od + 2)));
      return filtered;
    }));
  }
  return chartCache.get(s.id);
};

// Pre-cargar datos de canciones para que la vista previa responda al instante en 1 solo clic
SONGS.forEach((s) => loadCharts(s).catch(() => {}));

let selectedSongIdx = 0;
let playingSongIdx = -1;
let currentPage = 0;
let totalPages = 1;
let currentFitCount = SONGS.length;
const songButtons = [];

function calcFitCount() {
  const H = window.innerHeight;
  // Espacio disponible restando encabezado, reproductor y paginación (~200px)
  const avail = H - 200;
  const fit = Math.floor((avail + 8) / 94);
  // Máximo 6 canciones por página para que con 11 canciones se creen 2 páginas limpias (6 y 5)
  const maxPerPage = 6;
  return Math.max(1, Math.min(maxPerPage, fit));
}

function updateCarouselLayout() {
  const fit = calcFitCount();
  currentFitCount = fit;
  totalPages = Math.ceil(SONGS.length / currentFitCount);

  const paginationEl = $('song-pagination');
  if (paginationEl) {
    paginationEl.classList.toggle('hidden', totalPages <= 1);
  }

  const track = $('song-carousel-track');
  if (track) {
    track.innerHTML = '';
    for (let p = 0; p < totalPages; p++) {
      const pageEl = document.createElement('div');
      pageEl.className = 'song-page';
      const start = p * currentFitCount;
      const end = Math.min(SONGS.length, start + currentFitCount);
      for (let i = start; i < end; i++) {
        if (songButtons[i]) pageEl.appendChild(songButtons[i]);
      }
      track.appendChild(pageEl);
    }
  }

  renderPageControls();
  const targetPage = Math.floor(selectedSongIdx / currentFitCount);
  goToPage(Math.min(targetPage, totalPages - 1), false);
}

function goToPage(p, animate = true) {
  if (p < 0) p = 0;
  if (p >= totalPages) p = totalPages - 1;
  currentPage = p;
  const track = $('song-carousel-track');
  if (track) {
    track.style.transition = animate ? 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    track.style.transform = `translateX(-${currentPage * 100}%)`;
  }
  renderPageControls();
}

function renderPageControls() {
  const indicator = $('page-indicator');
  const btnPrev = $('btn-prev-page');
  const btnNext = $('btn-next-page');
  const dotsContainer = $('page-dots');

  if (indicator) indicator.textContent = `${currentPage + 1} / ${totalPages}`;
  if (btnPrev) btnPrev.disabled = currentPage === 0;
  if (btnNext) btnNext.disabled = currentPage === totalPages - 1;

  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('button');
      dot.className = 'page-dot' + (i === currentPage ? ' active' : '');
      dot.title = `Página ${i + 1}`;
      dot.onclick = () => {
        goToPage(i);
        selectSongPreview(i * currentFitCount, true);
      };
      dotsContainer.appendChild(dot);
    }
  }
}

function syncPlayButtons() {
  const isPlaying = previewing && !previewing.paused && playingSongIdx >= 0;
  songButtons.forEach((btn, i) => {
    const playBtn = btn.querySelector('.song-play-btn');
    if (!playBtn) return;
    const isThisPlaying = isPlaying && playingSongIdx === i;
    btn.classList.toggle('playing-preview', isThisPlaying);
    playBtn.textContent = isThisPlaying ? '⏸' : '▶';
    playBtn.title = isThisPlaying ? 'Pausar vista previa' : 'Reproducir vista previa';
  });
  const toggleBtn = $('btn-toggle-preview');
  if (toggleBtn) toggleBtn.textContent = isPlaying ? '⏸' : '▶';
}

function toggleSongPreview(i) {
  // Si esta misma canción ya está sonando, pausarla con el mismo botón
  if (playingSongIdx === i && previewing && !previewing.paused) {
    stopPreview();
    return;
  }
  // En cualquier otro caso (canción diferente o pausada), reproducir esta con 1 solo clic
  playSongPreview(i);
}

async function playSongPreview(i) {
  const s = SONGS[i];
  if (!s) return;

  playingSongIdx = i;
  selectedSongIdx = i;

  // Actualizar tarjeta seleccionada y barra de título
  songButtons.forEach((btn, idx) => {
    btn.classList.toggle('selected', idx === i);
  });
  const titleEl = $('preview-title');
  if (titleEl) titleEl.textContent = `${s.title} - ${s.artist}`;

  // Mostrar inmediatamente estado de reproducción en la tarjeta seleccionada (1 solo clic)
  syncPlayButtons();

  startPreview(s, i);
}

function selectSongPreview(idx, startAudio = false) {
  if (!SONGS.length) return;
  selectedSongIdx = (idx + SONGS.length) % SONGS.length;
  songButtons.forEach((btn, i) => {
    btn.classList.toggle('selected', i === selectedSongIdx);
  });

  const targetPage = Math.floor(selectedSongIdx / currentFitCount);
  if (targetPage !== currentPage) {
    goToPage(targetPage, true);
  }

  const s = SONGS[selectedSongIdx];
  const titleEl = $('preview-title');
  if (titleEl && playingSongIdx < 0) {
    titleEl.textContent = `${s.title} - ${s.artist}`;
  }

  if (startAudio) playSongPreview(selectedSongIdx);
  else syncPlayButtons();
}

function togglePreview() {
  if (previewing && !previewing.paused && playingSongIdx >= 0) {
    stopPreview();
  } else if (previewing && previewing.paused && playingSongIdx >= 0) {
    previewing.play().catch(() => {});
    syncPlayButtons();
  } else if (SONGS[selectedSongIdx]) {
    playSongPreview(selectedSongIdx);
  }
}

SONGS.forEach((s, i) => {
  const b = document.createElement('div');
  b.className = 'song';
  b.setAttribute('role', 'button');
  b.setAttribute('tabindex', '0');
  b.style.setProperty('--bg', `url("${url(s, s.background)}")`);
  b.innerHTML = `
    <div class="song-info">
      <b>${s.title}</b>
      <span>${s.artist} · mapa de ${s.mapper}<br>${s.charts.length} dificultad${s.charts.length > 1 ? 'es' : ''} · 4K${s.video ? ' · video' : ''}</span>
    </div>
    <button class="song-play-btn" title="Reproducir vista previa" type="button" aria-label="Reproducir">▶</button>
  `;

  // Clic en la tarjeta: abre la canción
  b.onclick = () => { selectSongPreview(i, false); openSong(s); };
  b.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); selectSongPreview(i, false); openSong(s); }
  };

  // Clic en el botón lateral dentro de la imagen: reproduce/pausa vista previa con 1 solo clic (estilo osu!)
  const playBtn = b.querySelector('.song-play-btn');
  playBtn.onclick = (e) => {
    e.stopPropagation();
    toggleSongPreview(i);
  };

  // Al pasar el cursor: solo selección visual SIN alterar la canción que esté sonando
  b.onmouseenter = () => {
    songButtons.forEach((btn, idx) => {
      btn.classList.toggle('selected', idx === i);
    });
    selectedSongIdx = i;
  };

  b.onmouseleave = () => {
    // Si hay una canción sonando, mantenerla visualmente seleccionada al retirar el mouse
    if (playingSongIdx >= 0) {
      selectedSongIdx = playingSongIdx;
      songButtons.forEach((btn, idx) => {
        btn.classList.toggle('selected', idx === playingSongIdx);
      });
    }
  };

  songButtons.push(b);
});

updateCarouselLayout();
window.addEventListener('resize', updateCarouselLayout);

if ($('btn-prev-page')) $('btn-prev-page').onclick = () => {
  if (currentPage > 0) {
    goToPage(currentPage - 1);
    selectSongPreview(currentPage * currentFitCount, false);
  }
};
if ($('btn-next-page')) $('btn-next-page').onclick = () => {
  if (currentPage < totalPages - 1) {
    goToPage(currentPage + 1);
    selectSongPreview(currentPage * currentFitCount, false);
  }
};

const carouselContainer = $('song-carousel-container');
if (carouselContainer) {
  carouselContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY > 0) selectSongPreview(selectedSongIdx + 1, false);
    else if (e.deltaY < 0) selectSongPreview(selectedSongIdx - 1, false);
  }, { passive: false });
}

if ($('btn-prev-song')) $('btn-prev-song').onclick = () => selectSongPreview(selectedSongIdx - 1, true);
if ($('btn-next-song')) $('btn-next-song').onclick = () => selectSongPreview(selectedSongIdx + 1, true);
if ($('btn-toggle-preview')) $('btn-toggle-preview').onclick = () => togglePreview();

// Control de volumen en index + bloqueo de seguridad la primera vez
let warnedVolume = localStorage.getItem('osu-mania:vol-warned-v4') === 'true';

function triggerVolumeWarning() {
  if (warnedVolume) return;
  warnedVolume = true;
  localStorage.setItem('osu-mania:vol-warned-v4', 'true');

  const bubble = $('vol-warning-bubble');
  if (bubble) {
    bubble.classList.remove('hidden');
    setTimeout(() => { bubble.classList.add('hidden'); }, 8000);
  }

  // Alerta modal informativa
  alert('⚠️ ¡Cuidado con el volumen!\n\nPuede sonar muy fuerte por accidente. Te recomendamos subirlo poco a poco.');

  // Asegurar que el volumen siga estrictamente en 2% tras la alerta
  syncVolumeUI(set.musicVol);
}

function syncVolumeUI(val) {
  set.musicVol = Math.min(100, Math.max(0, val));
  saveSettings(set);
  applyVisuals();
  const slider = $('index-vol-slider');
  const valText = $('index-vol-val');
  if (slider && +slider.value !== set.musicVol) slider.value = set.musicVol;
  if (valText) valText.textContent = `${set.musicVol}%`;
  (settingSyncs.get('musicVol') || []).forEach((fn) => fn());
}

const volSlider = $('index-vol-slider');
if (volSlider) {
  volSlider.value = set.musicVol;
  const valText = $('index-vol-val');
  if (valText) valText.textContent = `${set.musicVol}%`;

  // La primera vez bloqueamos cualquier salto antes de que cambie el valor
  const lockFirstTime = (e) => {
    if (!warnedVolume) {
      e.preventDefault();
      e.stopPropagation();
      volSlider.value = set.musicVol;
      if (valText) valText.textContent = `${set.musicVol}%`;
      triggerVolumeWarning();
    }
  };

  volSlider.addEventListener('pointerdown', lockFirstTime, { capture: true });
  volSlider.addEventListener('mousedown', lockFirstTime, { capture: true });
  volSlider.addEventListener('touchstart', lockFirstTime, { capture: true });

  volSlider.addEventListener('input', (e) => {
    if (!warnedVolume) {
      volSlider.value = set.musicVol;
      triggerVolumeWarning();
      return;
    }
    syncVolumeUI(parseInt(e.target.value, 10));
  });
}

// Vista previa: suena desde PreviewTime (leído del .osu) hasta el final, y vuelve a ese punto en bucle continuo
async function startPreview(s, songIdx = null) {
  if (songIdx !== null) playingSongIdx = songIdx;
  else {
    const found = SONGS.indexOf(s);
    if (found >= 0) playingSongIdx = found;
  }

  const token = ++previewToken;
  const a = getAudio(s);

  if (previewing && previewing !== a) {
    previewing.onended = null;
    previewing.pause();
  }

  previewing = a;
  a.volume = set.musicVol / 100;

  let pt = 0;
  try {
    const list = await loadCharts(s);
    if (list && list.length && list[0].meta.previewTime > 0) {
      pt = list[0].meta.previewTime / 1000;
    }
  } catch {}

  if (token !== previewToken) return;

  try {
    if (a.paused || Math.abs(a.currentTime - pt) > 2) a.currentTime = pt;
  } catch {}

  a.onended = () => {
    if (previewing === a) {
      try { a.currentTime = pt; } catch {}
      a.play().catch(() => {});
    }
  };

  syncPlayButtons();
  a.play().then(() => {
    if (token === previewToken) syncPlayButtons();
  }).catch(() => {
    if (token === previewToken) syncPlayButtons();
  });
}

function stopPreview() {
  previewToken++;
  clearTimeout(hoverTimer);
  if (previewing) {
    previewing.onended = null;
    previewing.pause();
  }
  playingSongIdx = -1;
  syncPlayButtons();
}

function updateBackground() {
  if (!song) return;
  const chart = charts[chartIdx];
  const diffBg = chart?.meta?.background;
  const defaultUrl = song.background ? url(song, song.background) : '';

  if (diffBg) {
    const targetUrl = url(song, diffBg);
    const img = new Image();
    img.onload = () => { $('bg').style.backgroundImage = `url("${targetUrl}")`; };
    img.onerror = () => { if (defaultUrl) $('bg').style.backgroundImage = `url("${defaultUrl}")`; };
    img.src = targetUrl;
  } else if (defaultUrl) {
    $('bg').style.backgroundImage = `url("${defaultUrl}")`;
  }
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
  updateBackground();
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
    b.onclick = () => { chartIdx = i; updateBackground(); renderDiffs(); };
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
  };
  container.append(row);
}

for (const r of ROWS) bindSettingRow(r, $('settings-rows'));
const pauseSettingsEl = $('pause-settings');
if (pauseSettingsEl) {
  for (const r of PAUSE_ROWS) bindSettingRow(r, pauseSettingsEl);
}
if (!settingSyncs.has('musicVol')) settingSyncs.set('musicVol', []);
settingSyncs.get('musicVol').push(() => {
  const slider = $('index-vol-slider');
  const valText = $('index-vol-val');
  if (slider && +slider.value !== set.musicVol) slider.value = set.musicVol;
  if (valText) valText.textContent = `${set.musicVol}%`;
});
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
function resume() { if (screen !== 'paused') return; if (document.activeElement?.blur) document.activeElement.blur(); t0 += performance.now() - pausedAt; if (audioStarted) audio.play(); show('playing'); }
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
$('btn-play').onclick = () => { if (document.activeElement?.blur) document.activeElement.blur(); startGame(); };
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
  if (screen === 'select') {
    if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
      e.preventDefault(); selectSongPreview(selectedSongIdx - 1, true); return;
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
      e.preventDefault(); selectSongPreview(selectedSongIdx + 1, true); return;
    }
    if (e.code === 'PageUp') {
      e.preventDefault();
      if (currentPage > 0) {
        goToPage(currentPage - 1);
        selectSongPreview(currentPage * currentFitCount, true);
      }
      return;
    }
    if (e.code === 'PageDown') {
      e.preventDefault();
      if (currentPage < totalPages - 1) {
        goToPage(currentPage + 1);
        selectSongPreview(currentPage * currentFitCount, true);
      }
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault(); togglePreview(); return;
    }
    if (e.code === 'Enter') {
      e.preventDefault(); if (SONGS[selectedSongIdx]) openSong(SONGS[selectedSongIdx]); return;
    }
  }
  if (e.code === 'F3') { e.preventDefault(); changeSpeed(-1); return; }
  if (e.code === 'F4') { e.preventDefault(); changeSpeed(1); return; }
  if (e.code === 'Escape') {
    e.preventDefault();
    if (document.activeElement?.blur) document.activeElement.blur();
    if (screen === 'playing') {
      // Si la canción ya pasó sus notas o está terminando, saltar inmediatamente a resultados
      if (engine && songTime() >= engine.lastTime - 300) endGame();
      else pause();
    } else if (screen === 'paused') {
      resume();
    } else if (screen === 'results') {
      // En pantalla de resultados, Esc vuelve directo a seleccionar canción (como en osu!)
      stopAudio(); engine = null; show('select');
    } else if (screen === 'ready') {
      $('btn-back').click();
    }
    return;
  }
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
