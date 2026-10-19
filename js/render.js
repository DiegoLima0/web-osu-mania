// Dibujo del campo de juego en canvas.
const SCROLL_CONST = 11485; // ms de caída = SCROLL_CONST / velocidad (igual que osu!lazer)
const GRADE_COLORS = { max: '#9ff3ff', 300: '#7fd6ff', 200: '#7dff9a', 100: '#ffe27a', 50: '#ffa05a', miss: '#ff4d6d' };

export function loadSkin(base = 'skin/') {
  const load = (n) => { const i = new Image(); i.src = base + n; return i; };
  const dirs = ['left', 'down', 'up', 'right'];
  const skin = {
    notes: dirs.map((d) => load(`${d}.png`)),
    key: dirs.map((d) => load(`k_${d}.png`)),
    keyDown: dirs.map((d) => load(`kd_${d}.png`)),
    crop: new Map(),
  };
  // Las imágenes de tecla tienen espacio transparente: se recorta a la parte visible
  [...skin.key, ...skin.keyDown].forEach((img) => { img.onload = () => skin.crop.set(img, cropBox(img)); });
  return skin;
}

function cropBox(img) {
  try {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      if (d[(y * w + xx) * 4 + 3] > 8) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return x1 < 0 ? null : { sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1 };
  } catch { return null; }
}

export function layout(W, H, set) {
  const laneW = Math.min(H * 0.15, W * 0.13);
  const down = set.scroll === 'down';
  const hitY = down ? H * 0.86 : H * 0.14;
  const dir = down ? 1 : -1;
  const dist = down ? hitY : H - hitY;
  return { W, H, laneW, fieldW: laneW * 4, x0: (W - laneW * 4) / 2, hitY, dir, pxPerMs: (dist * set.speed) / SCROLL_CONST, size: laneW * 0.94 };
}

const yAt = (L, time, t) => L.hitY - L.dir * (time - t) * L.pxPerMs;
const cx = (L, col) => L.x0 + col * L.laneW + L.laneW / 2;

function drawNote(ctx, L, skin, n, t) {
  const x = cx(L, n.col), r = L.size * 0.4, bodyW = L.size * 0.8;
  const failed = n.broken || n.head === 'miss';
  if (!n.isLN) {
    if (n.done && !failed) return;
    const y = yAt(L, n.time, t);
    if (y < -L.size || y > L.H + L.size) return;
    ctx.globalAlpha = failed ? 0.35 : 1;
    ctx.drawImage(skin.notes[n.col], x - L.size / 2, y - L.size / 2, L.size, L.size);
    ctx.globalAlpha = 1;
    return;
  }
  if (n.done && !failed) return; // nota larga completada: desaparece
  const yTail = yAt(L, n.end, t);
  // Mientras se mantiene bien, la cabeza queda en la línea de juicio y nunca la pasa
  const yHead = n.holding ? L.hitY : yAt(L, n.time, t);
  const lo = Math.min(yHead, yTail), hi = Math.max(yHead, yTail);
  if (hi < -L.size || lo > L.H + L.size) return;
  ctx.globalAlpha = failed ? 0.35 : 1;
  // cuerpo blanco con punta redondeada en el extremo final
  const capY = yTail + L.dir * r;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); // una sola ruta: evita costuras al ser semitransparente
  ctx.arc(x, capY, bodyW / 2, 0, Math.PI * 2);
  ctx.rect(x - bodyW / 2, Math.min(capY, yHead), bodyW, Math.abs(yHead - capY));
  ctx.fill();
  ctx.drawImage(skin.notes[n.col], x - L.size / 2, yHead - L.size / 2, L.size, L.size);
  ctx.globalAlpha = 1;
}

function drawField(ctx, L, skin, set, pressed) {
  ctx.fillStyle = `rgba(18,20,24,${set.fieldOpacity / 100})`;
  ctx.fillRect(L.x0, 0, L.fieldW, L.H);
  for (let i = 0; i <= 4; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(L.x0 + i * L.laneW - 1, 0, 2, L.H);
  }
  for (let i = 0; i < 4; i++) if (pressed[i]) {
    const g = ctx.createLinearGradient(0, L.hitY - L.dir * L.H * 0.5, 0, L.hitY + L.dir * L.size);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.18)');
    ctx.fillStyle = g; ctx.fillRect(L.x0 + i * L.laneW, 0, L.laneW, L.H);
  }
}

function drawReceptors(ctx, L, skin, pressed) {
  for (let i = 0; i < 4; i++) {
    const img = pressed[i] ? skin.keyDown[i] : skin.key[i];
    if (!img.complete || !img.naturalWidth) continue;
    const c = skin.crop.get(img);
    const s = L.size;
    if (c) ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, cx(L, i) - s / 2, L.hitY - s / 2, s, s); // cuadrado = círculo perfecto
    else ctx.drawImage(img, cx(L, i) - s / 2, L.hitY - s / 2, s, s);
  }
}

export function draw(ctx, S) {
  const { L, skin, set, pressed, engine, t, mode } = S;
  ctx.clearRect(0, 0, L.W, L.H);
  drawField(ctx, L, skin, set, pressed);
  if (mode === 'preview') {
    // Demostración de velocidad en la pantalla previa
    const T = 6500, tt = (performance.now() % T) - 1000;
    for (const n of S.demo) if (n.time >= tt - 60) drawNote(ctx, L, skin, n, tt);
  } else if (engine && mode !== 'field') {
    for (const n of engine.notes) drawNote(ctx, L, skin, n, t);
  }
  drawReceptors(ctx, L, skin, pressed);
  if (mode === 'play' && engine) drawHud(ctx, L, engine, t);
}

function drawHud(ctx, L, engine, t) {
  const st = engine.stats();
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '700 38px monospace';
  ctx.fillText(String(st.score).padStart(7, '0'), L.W - 28, 52);
  ctx.font = '600 20px monospace'; ctx.fillStyle = '#ddd';
  ctx.fillText(st.liveAcc.toFixed(2) + '%', L.W - 28, 82);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(0, 0, L.W * Math.min(1, Math.max(0, t / engine.lastTime)), 3);
  ctx.textAlign = 'center';
  if (engine.combo > 1) {
    ctx.font = '700 54px monospace'; ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
    ctx.fillText(engine.combo, L.W / 2, L.H * 0.3);
    ctx.shadowBlur = 0;
  }
  const j = engine.last;
  if (j && t - j.t < 450 && t - j.t >= 0) {
    ctx.globalAlpha = 1 - (t - j.t) / 450;
    ctx.font = '700 28px monospace'; ctx.fillStyle = GRADE_COLORS[j.grade];
    ctx.fillText(j.grade === 'max' ? '300' : j.grade === 'miss' ? 'MISS' : j.grade, L.W / 2, L.H * 0.3 + 44);
    ctx.globalAlpha = 1;
  }
}

// Notas de demostración (patrón en bucle)
export function makeDemo() {
  const cols = [0, 2, 1, 3, 0, 3, 1, 2];
  const demo = cols.map((col, i) => ({ col, time: 600 + i * 450, end: 600 + i * 450, isLN: false, head: null, done: false, broken: false, holding: false }));
  demo.push({ col: 1, time: 4300, end: 4300 + 900, isLN: true, head: null, done: false, broken: false, holding: false });
  return demo;
}
