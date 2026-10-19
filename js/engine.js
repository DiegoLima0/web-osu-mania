// Lógica pura del juego (sin DOM). Reglas basadas en la wiki de osu!mania (ScoreV1, stable).
export const GRADES = ['max', '300', '200', '100', '50', 'miss'];

// hv = valor del golpe, bv = valor de bono, add = sube el bono, pun = lo baja
const TABLE = {
  max: { hv: 320, bv: 32, add: 2, pun: 0 },
  300: { hv: 300, bv: 32, add: 1, pun: 0 },
  200: { hv: 200, bv: 16, add: 0, pun: 8 },
  100: { hv: 100, bv: 8, add: 0, pun: 24 },
  50: { hv: 50, bv: 4, add: 0, pun: 44 },
  miss: { hv: 0, bv: 0, add: 0, pun: Infinity },
};
const ACC = { max: 300, 300: 300, 200: 200, 100: 100, 50: 50, miss: 0 };

export function windows(od) {
  const d = 3 * od;
  return { max: 16, 300: 64 - d, 200: 97 - d, 100: 127 - d, 50: 151 - d, miss: 188 - d };
}

// Nota normal. delta = tiempoActual - tiempoNota.
export function judgeTap(delta, w) {
  const a = Math.abs(delta);
  for (const g of GRADES.slice(0, 5)) if (a <= w[g]) return g;
  return 'miss';
}

// Nota larga: un solo juicio según el error de la cabeza (h) y el error combinado cabeza+cola.
export function judgeHold(h, tail, w) {
  const c = h + tail;
  if (h <= w.max * 1.2 && c <= w.max * 2.4) return 'max';
  if (h <= w[300] * 1.1 && c <= w[300] * 2.2) return '300';
  if (h <= w[200] && c <= w[200] * 2) return '200';
  if (h <= w[100] && c <= w[100] * 2) return '100';
  return '50';
}

export class Engine {
  constructor(notes, od, keys = 4) {
    this.w = windows(od);
    this.keys = keys;
    this.notes = notes.map((n) => ({ ...n, head: null, h: 0, holding: false, broken: false, done: false, touched: false }));
    this.cols = Array.from({ length: keys }, () => []);
    this.notes.forEach((n) => this.cols[n.col].push(n));
    this.ptr = Array(keys).fill(0);
    this.holdingNote = Array(keys).fill(null);
    this.keyDown = Array(keys).fill(false);
    this.pending = []; // notas largas rotas esperando su juicio final
    this.counts = Object.fromEntries(GRADES.map((g) => [g, 0]));
    this.total = this.notes.length; // cada nota larga cuenta como UNA, igual que osu!
    this.judged = 0; this.score = 0; this.accPoints = 0; this.bonus = 100;
    this.combo = 0; this.maxCombo = 0;
    this.last = null;
    this.lastTime = this.notes.reduce((m, n) => Math.max(m, n.end), 0);
  }

  record(grade, t) {
    const r = TABLE[grade];
    this.counts[grade]++; this.judged++; this.accPoints += ACC[grade];
    if (grade === 'miss') { this.combo = 0; this.bonus = 0; }
    else { this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.bonus = Math.min(100, Math.max(0, this.bonus + r.add - r.pun)); }
    const unit = 500000 / this.total; // mitad base, mitad bono
    this.score += unit * (r.hv / 320) + unit * ((r.bv * Math.sqrt(this.bonus)) / 320);
    this.last = { grade, t };
  }

  advance(col) {
    const l = this.cols[col];
    while (this.ptr[col] < l.length && l[this.ptr[col]].head !== null) this.ptr[col]++;
    return l[this.ptr[col]];
  }

  expire(col, t) {
    let n;
    while ((n = this.advance(col)) && t - n.time > this.w[50]) {
      n.head = 'miss';
      if (n.isLN) { n.broken = true; this.pending.push(n); }
      else { n.done = true; this.record('miss', t); }
    }
  }

  touchPending(t) {
    for (const n of this.pending) {
      if (this.keyDown[n.col] && t >= n.end - this.w[50] && t <= n.end + this.w[100]) n.touched = true;
    }
  }

  // Devuelve la nota golpeada (para el sonido) o null.
  press(col, t) {
    this.keyDown[col] = true;
    this.expire(col, t);
    this.touchPending(t);
    const n = this.advance(col);
    if (!n) return null;
    const delta = t - n.time;
    if (delta < -this.w.miss) return null; // demasiado temprano: no tiene efecto
    const g = judgeTap(delta, this.w);
    n.head = g; n.h = Math.abs(delta);
    if (n.isLN) {
      if (g === 'miss') { n.broken = true; this.pending.push(n); return null; }
      n.holding = true; this.holdingNote[col] = n; return n;
    }
    n.done = true; this.record(g, t);
    return g === 'miss' ? null : n;
  }

  // Devuelve true si se completó una nota larga (para el sonido).
  release(col, t) {
    this.keyDown[col] = false;
    const n = this.holdingNote[col];
    if (!n) return false;
    this.holdingNote[col] = null; n.holding = false;
    const early = n.end - t;
    if (early > this.w[50]) { n.broken = true; this.pending.push(n); return false; } // soltada en el cuerpo
    // En osu!mania ScoreV1 soltar después del final no penaliza con miss
    const tailErr = early < 0 ? 0 : early;
    const g = judgeHold(n.h, tailErr, this.w);
    n.done = true; this.record(g, t);
    return true;
  }

  update(t) {
    for (let c = 0; c < this.keys; c++) {
      this.expire(c, t);
      const h = this.holdingNote[c];
      if (h && t - h.end > this.w[50]) { // mantenida hasta el final: completa la nota con éxito (como osu!mania)
        this.holdingNote[c] = null; h.holding = false;
        const g = judgeHold(h.h, 0, this.w);
        h.done = true; this.record(g, t);
      }
    }
    this.touchPending(t);
    // Una nota larga rota se juzga al cerrarse la ventana de su cola:
    // MEH si la tecla estuvo presionada en esa ventana, MISS si no.
    this.pending = this.pending.filter((n) => {
      if (t <= n.end + this.w[100]) return true;
      n.done = true; this.record(n.touched ? '50' : 'miss', t);
      return false;
    });
  }

  isFinished(t) { return t > this.lastTime + 1000; }

  stats() {
    const total = this.total || 1;
    const acc = (this.accPoints / (total * 300)) * 100;
    const liveAcc = this.judged ? (this.accPoints / (this.judged * 300)) * 100 : 100;
    const rank = acc >= 100 ? 'SS' : acc > 95 ? 'S' : acc > 90 ? 'A' : acc > 80 ? 'B' : acc > 70 ? 'C' : 'D';
    return { acc, liveAcc, score: Math.round(this.score), rank, maxCombo: this.maxCombo, counts: { ...this.counts } };
  }
}
