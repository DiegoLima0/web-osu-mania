const KEY = 'osu-mania-web:settings:v1';

export const DEFAULTS = {
  speed: 14,          // 1-40, similar a la velocidad de scroll de osu!mania
  musicVol: 30,       // 0-100
  sfxVol: 50,         // 0-100
  bgDim: 60,          // 0-100 (oscurecer fondo)
  fieldOpacity: 55,   // 0-100 (opacidad del campo de juego)
  offset: 0,          // ms
  video: true,        // video de fondo (si la canción tiene)
  scroll: 'down',     // 'down' | 'up'
  keys: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
};

export function loadSettings() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (!Array.isArray(s.keys) || s.keys.length !== 4) s.keys = [...DEFAULTS.keys];
    return s;
  } catch { return { ...DEFAULTS, keys: [...DEFAULTS.keys] }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin storage */ }
}

export const keyLabel = (code) => code.replace(/^Key|^Digit/, '').replace('Semicolon', ';');
