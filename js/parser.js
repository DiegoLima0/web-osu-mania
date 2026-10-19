// Lee un archivo .osu: notas, OD, teclas y metadatos (vista previa, video, nombre de dificultad).
export function parseOsu(text) {
  let section = '', od = 5, keys = 4;
  const meta = { mode: 0, previewTime: -1, title: '', artist: '', creator: '', version: '', video: null, videoOffset: 0, background: null };
  const raw = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;
    if (line[0] === '[') { section = line; continue; }
    const i = line.indexOf(':');
    const k = line.slice(0, i), v = line.slice(i + 1).trim();
    if (section === '[General]') {
      if (k === 'Mode') meta.mode = parseInt(v);
      if (k === 'PreviewTime') meta.previewTime = parseInt(v);
    } else if (section === '[Metadata]') {
      if (k === 'Title') meta.title = v;
      if (k === 'Artist') meta.artist = v;
      if (k === 'Creator') meta.creator = v;
      if (k === 'Version') meta.version = v;
    } else if (section === '[Difficulty]') {
      if (k === 'OverallDifficulty') od = parseFloat(v);
      if (k === 'CircleSize') keys = parseFloat(v);
    } else if (section === '[Events]') {
      const p = line.split(',');
      if (p[0] === 'Video' || p[0] === '1') {
        meta.video = (p[2] || '').replace(/"/g, '').trim();
        meta.videoOffset = parseInt(p[1]) || 0;
      } else if (p[0] === '0' || p[0] === 'Background') {
        const bg = (p[2] || '').replace(/"/g, '').trim();
        if (bg) meta.background = bg;
      }
    } else if (section === '[HitObjects]') raw.push(line.split(','));
  }
  const notes = raw.map((p) => {
    const x = parseInt(p[0]), time = parseInt(p[2]), type = parseInt(p[3]);
    const isLN = (type & 128) !== 0;
    const end = isLN ? parseInt((p[5] || '').split(':')[0]) : time;
    return { col: Math.min(keys - 1, Math.floor((x * keys) / 512)), time, end, isLN };
  });
  notes.sort((a, b) => a.time - b.time || a.col - b.col);
  return { notes, od, keys, meta, lnCount: notes.filter((n) => n.isLN).length };
}
