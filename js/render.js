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
    judgments: {
      max: load('perfect.png'),
      300: load('excellent.png'),
      200: load('great.png'),
      100: load('good.png'),
      50: load('bad.png'),
      miss: load('miss.png'),
    },
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
  // Escalado estándar de osu!mania (base 480p de altura)
  const scale = H / 480;
  // Ancho de columna en skin.ini: ColumnWidth: 70
  const laneW = Math.round(70 * scale);
  // ColumnSpacing: 2
  const colGap = Math.max(1, Math.round(2 * scale));
  const fieldW = laneW * 4 + colGap * 3;

  // En osu!mania 16:9 widescreen, ColumnStart es 300 en resolución 480p
  const base16_9W = (H * 16) / 9;
  const stageOffset = Math.round((W - base16_9W) / 2 + 300 * scale);
  const centeredX = Math.round((W - fieldW) / 2);
  // Usar stageOffset de osu!mania si cabe cómodamente en pantalla
  const x0 = (W >= fieldW + 80 && Math.abs(stageOffset - centeredX) < 60) ? stageOffset : centeredX;

  const down = set.scroll === 'down';
  // HitPosition en skin.ini: 456. Centro visual de receptores: ~424 (y = 509 en 576p)
  const hitY = down ? Math.round(424 * scale) : Math.round((480 - 424) * scale);
  const dir = down ? 1 : -1;
  const dist = down ? hitY : H - hitY;
  const size = Math.round(laneW * 0.95);
  return { W, H, scale, laneW, colGap, fieldW, x0, hitY, dir, pxPerMs: (dist * set.speed) / SCROLL_CONST, size };
}

const yAt = (L, time, t) => L.hitY - L.dir * (time - t) * L.pxPerMs;
const cx = (L, col) => L.x0 + col * (L.laneW + (L.colGap || 0)) + L.laneW / 2;

function drawNote(ctx, L, skin, n, t) {
  const x = cx(L, n.col), r = L.size * 0.4, bodyW = L.size * 0.82;
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
  // Fondo oscuro del campo de juego (estilo osu!mania)
  ctx.fillStyle = `rgba(12, 14, 18, ${set.fieldOpacity / 100})`;
  ctx.fillRect(L.x0 - 2, 0, L.fieldW + 4, L.H);

  // Bordes laterales del campo
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(L.x0 - 2, 0, 2, L.H);
  ctx.fillRect(L.x0 + L.fieldW, 0, 2, L.H);

  // Líneas divisorias sutiles entre carriles
  const gap = L.colGap || 0;
  for (let i = 1; i < 4; i++) {
    const lx = L.x0 + i * (L.laneW + gap) - gap / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(lx - 0.5, 0, 1, L.H);
  }

  // Efecto de iluminación de pulsación de carril
  for (let i = 0; i < 4; i++) if (pressed[i]) {
    const lx = L.x0 + i * (L.laneW + gap);
    const g = ctx.createLinearGradient(0, L.hitY - L.dir * L.H * 0.45, 0, L.hitY + L.dir * L.size);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(lx, 0, L.laneW, L.H);
  }
}

function drawReceptors(ctx, L, skin, pressed) {
  for (let i = 0; i < 4; i++) {
    const img = pressed[i] ? skin.keyDown[i] : skin.key[i];
    if (!img.complete || !img.naturalWidth) continue;
    const c = skin.crop.get(img);
    const s = L.size;
    if (c) ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, cx(L, i) - s / 2, L.hitY - s / 2, s, s);
    else ctx.drawImage(img, cx(L, i) - s / 2, L.hitY - s / 2, s, s);
  }
}

export function draw(ctx, S) {
  const { L, skin, set, pressed, engine, t, mode, speedToast } = S;
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
  if (mode === 'play' && engine) drawHud(ctx, L, engine, t, skin, set, speedToast);
  else if (speedToast) drawSpeedToast(ctx, L, speedToast);
}

function drawSpeedToast(ctx, L, speedToast) {
  if (!speedToast || performance.now() - speedToast.time >= 1200) return;
  const dt = performance.now() - speedToast.time;
  const alpha = dt < 900 ? 1 : (1200 - dt) / 300;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  const tw = 160, th = 38, tx = (L.W - tw) / 2, ty = Math.round(L.H * 0.12);
  ctx.fillStyle = 'rgba(15, 17, 23, 0.88)';
  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = 1.5;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 8);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeRect(tx, ty, tw, th);
  }
  ctx.font = '700 15px monospace';
  ctx.fillStyle = '#00ffcc';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.fillText(`Velocidad: ${speedToast.speed}`, L.W / 2, ty + 24);
  ctx.restore();
}

function drawHud(ctx, L, engine, t, skin, set, speedToast) {
  const st = engine.stats();
  const scale = L.scale || (L.H / 480);

  // Puntuación y porcentaje colocados abajo, a la izquierda del campo (para no interferir con las notas)
  const hudX = L.x0 - 20;
  const hudY = L.hitY - 14;

  ctx.save();
  ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 6;

  // Puntuación
  const scoreFontSize = Math.round(30 * Math.max(0.75, scale));
  ctx.font = `700 ${scoreFontSize}px monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(st.score).padStart(7, '0'), hudX, hudY);

  // Porcentaje / Precisión
  const accFontSize = Math.round(19 * Math.max(0.75, scale));
  ctx.font = `600 ${accFontSize}px monospace`;
  ctx.fillStyle = '#9ff3ff';
  ctx.fillText(st.liveAcc.toFixed(2) + '%', hudX, hudY + Math.round(26 * Math.max(0.75, scale)));
  ctx.restore();

  // Barra de progreso de la canción en la parte superior
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillRect(0, 0, L.W * Math.min(1, Math.max(0, t / engine.lastTime)), 3);

  // Combo y juicio centrados sobre la pista (igual que en osu!mania)
  const stageCenter = L.x0 + L.fieldW / 2;
  ctx.textAlign = 'center';

  // Combo más pequeño según lo solicitado
  if (engine.combo > 1) {
    const comboSize = Math.round(24 * scale);
    ctx.font = `700 ${comboSize}px monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    // ComboPosition: 130 en base 480
    ctx.fillText(engine.combo, stageCenter, Math.round(155 * scale));
    ctx.shadowBlur = 0;
  }

  // Juicio por cada nota (con imágenes de la skin y tamaño más pequeño)
  const j = engine.last;
  if (j && t - j.t < 450 && t - j.t >= 0) {
    const age = t - j.t;
    ctx.globalAlpha = 1 - age / 450;
    const jY = Math.round(195 * scale); // ScorePosition
    const img = skin && skin.judgments ? skin.judgments[j.grade] : null;

    if (img && img.complete && img.naturalWidth) {
      // Tamaño más pequeño como pidió el usuario: 54 * scale de ancho (ratio 256x192 = 4:3)
      const jw = Math.round(54 * scale);
      const jh = Math.round(jw * (img.naturalHeight / img.naturalWidth));
      ctx.drawImage(img, stageCenter - jw / 2, jY - jh / 2, jw, jh);
    } else {
      ctx.font = `700 ${Math.round(20 * scale)}px monospace`;
      ctx.fillStyle = GRADE_COLORS[j.grade];
      ctx.fillText(j.grade === 'max' ? '300' : j.grade === 'miss' ? 'MISS' : j.grade, stageCenter, jY);
    }
    ctx.globalAlpha = 1;
  }

  // Aviso de cambio de velocidad con F3/F4
  if (speedToast) drawSpeedToast(ctx, L, speedToast);
}

// Notas de demostración (patrón en bucle)
export function makeDemo() {
  const cols = [0, 2, 1, 3, 0, 3, 1, 2];
  const demo = cols.map((col, i) => ({ col, time: 600 + i * 450, end: 600 + i * 450, isLN: false, head: null, done: false, broken: false, holding: false }));
  demo.push({ col: 1, time: 4300, end: 4300 + 900, isLN: true, head: null, done: false, broken: false, holding: false });
  return demo;
}
