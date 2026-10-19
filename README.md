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

## Créditos de las canciones

1. **"Houkago Mermaid" (放課後マーメイド)**
   - **Artista:** Shigure Ui (しぐれうい)
   - **Mapeador:** [Ainer](https://osu.ppy.sh/beatmapsets/2551742#mania/5661343)
   - **Dificultades:** The Title is After School Mermaid
   - **Recursos:** MV original y audio oficial.

2. **"Wishing Umbrella"**
   - **Artista:** Shigure Ui (しぐれうい)
   - **Mapeador:** [Gsuncraft](https://osu.ppy.sh/beatmapsets/2563159#mania/5878157)
   - **Dificultades:** Insane, AelSan's Umbrella and You Daisuki
   - **Recursos:** Video musical original y fondo por Gsuncraft.

3. **"World's Smallest Violin"**
   - **Artista:** AJR
   - **Mapeador:** [Carpihat](https://osu.ppy.sh/beatmapsets/2168512#mania/4575684)
   - **Dificultades:** YuEast's Hard, Magnificent World of the Violin
   - **Recursos:** Audio original y fondo Mr. Krabs.

4. **"UNA ALARM"**
   - **Artista:** Maro Note (feat. Otomachi Una)
   - **Mapeador:** [Karin-](https://osu.ppy.sh/beatmapsets/2543663#mania/5633120)
   - **Dificultades:** How to wake up (Advanced, Another, Hyper, Intermediate method)
   - **Recursos:** Video oficial y audio.

5. **"Static"**
   - **Artista:** FLAVOR FOLEY
   - **Mapeador:** [Monoseul](https://osu.ppy.sh/beatmapsets/2383590#mania/5153607)
   - **Dificultades:** It's Easy!, It's Normal!, It's Johno's Hard!, It's Insane!, It's me!
   - **Recursos:** Video y audio original.

6. **"Idol" (アイドル)**
   - **Artista:** YOASOBI
   - **Mapeador:** [Akasha-](https://osu.ppy.sh/beatmapsets/1982752#mania/4117650)
   - **Dificultades:** Easy, Normal, CS' Hard, CS' Insane, (L)ove (I)n (E)ternity
   - **Recursos:** Video oficial (Oshi no Ko / Doga Kobo), fondos BG1 a BG5 por dificultad.

## Créditos del juego y recursos

- **Skin:** Cirno-V2.0 — autor: **Blulletgun** (elementos de juicio, combo y notas).
- **osu!:** Propiedad de ppy Pty Ltd (Dean Herbert). Este proyecto es una recreación experimental web para la comunidad sin fines de lucro.
- **Aviso legal y retiro de contenido:** La música, los videos, los mapas y las imágenes son propiedad intelectual de sus respectivos artistas y creadores, utilizándose aquí únicamente con fines de demostración y aprendizaje. Si eres el autor o titular de los derechos de cualquier contenido incluido aquí y deseas su retiro o modificación, por favor abre un *Issue* en este repositorio y se eliminará de inmediato.
