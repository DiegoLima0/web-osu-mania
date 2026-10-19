// Lista de canciones. Para agregar una: copia su carpeta al repo y añade un objeto aquí.
// charts: SOLO los .osu de osu!mania 4K (ignora los de taiko, catch o standard).
// video: nombre del archivo de video (o null / quitar la línea si no tiene).
export const SONGS = [
  {
    id: 'houkago-mermaid',
    folder: '2551742 Shigure Ui - Houkago Mermaid',
    title: 'Houkago Mermaid',
    artist: 'Shigure Ui',
    mapper: 'Ainer',
    audio: 'audio.mp3',
    background: 'background.jpg',
    video: 'video (1).mp4',
    hitsound: 'soft-hitnormal.wav',
    charts: ['dificultad.osu'],
  },
  {
    id: 'wishing-umbrella',
    folder: 'Shigure Ui - Wishing Umbrella',
    title: 'Wishing Umbrella',
    artist: 'Shigure Ui',
    mapper: 'Gsuncraft',
    audio: 'audio.mp3',
    background: 'wishing.jpg',
    video: 'mv.mp4',
    hitsound: 'soft-hitnormal.wav',
    charts: [
      'Shigure Ui - Wishing Umbrella (Gsuncraft) [Insane].osu',
      "Shigure Ui - Wishing Umbrella (Gsuncraft) [AelSan's Umbrella and You Daisuki].osu",
    ],
  },
];
