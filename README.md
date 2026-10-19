# web-osu-mania

Un juego tipo **osu!mania (4K)** que corre en el navegador. Elige una canción, ajusta las opciones y juega.

**Jugar:** abre `index.html` con Live Server (VS Code) o desde GitHub Pages.

## Controles

- Teclas por defecto: **D F J K** (se pueden cambiar en la pantalla de ajustes).
- `Esc`: pausar.

## Ajustes

Velocidad, volumen de música y de golpes, oscurecer fondo, opacidad del campo, offset de audio, video de fondo (solo si la canción tiene), dirección (abajo/arriba) y teclas. Se guardan en el navegador.

## Puntuación

Sigue las reglas de osu!mania (ScoreV1): máximo 1.000.000 puntos (mitad base, mitad bono que se reinicia con cada miss), precisión con MAX/300/200/100/50, y cada nota larga cuenta como un solo juicio según el error de cabeza y cola. Fuente: wiki de osu!.

## Agregar canciones

1. Copia la carpeta del mapa (con `.osu`, audio, fondo, video y `soft-hitnormal.wav`) al repositorio.
2. Añade una entrada en `songs.js` con sus dificultades (`charts`). Solo se admiten mapas **mania 4K**; los de otros modos se ignoran.
3. La vista previa usa el `PreviewTime` del `.osu`, y el video (opcional) se sincroniza con su offset.

## Créditos

- **Canción:** "Houkago Mermaid" (放課後マーメイド) — Shigure Ui (しぐれうい).
- **Mapa:** [beatmapset 2551742](https://osu.ppy.sh/beatmapsets/2551742#mania/5661343), dificultad "The Title is After School Mermaid", creado por **Ainer**.
- **Canción:** "Wishing Umbrella" — Shigure Ui (しぐれうい). Mapa mania por **Gsuncraft** (dificultades Insane y AelSan's Umbrella and You Daisuki). Fondo y video: MV original.
- **Skin:** Cirno-V2.0 — autor: _(completar con el nombre del creador de la skin)_.
- **osu!** es un juego de ppy Pty Ltd. Este proyecto es un fan project sin afiliación oficial.

La música, el mapa y la skin pertenecen a sus respectivos autores y se incluyen solo con fines de demostración/aprendizaje. Si algún autor pide retirarlos, se eliminarán.
