const BASE_URL = "https://raw.githubusercontent.com/DiegoLima0/web-osu-mania/main/2551742%20Shigure%20Ui%20-%20Houkago%20Mermaid/";
const urlAudio = BASE_URL + "audio.mp3";
const urlOsu = BASE_URL + "dificultad.osu";

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CANTIDAD_TECLAS = 4;
const ANCHO_CARRIL = canvas.width / CANTIDAD_TECLAS;
const LINEA_JUICIO_Y = 700;

const speedRange = document.getElementById('speedRange');
const speedVal = document.getElementById('speedVal');

let VELOCIDAD_CAIDA = parseFloat(speedRange.value);

speedRange.addEventListener('input', (e) => {
    VELOCIDAD_CAIDA = parseFloat(e.target.value);
    speedVal.innerText = VELOCIDAD_CAIDA.toFixed(1) + " px/ms";
});

let listaNotas = [];
let audio = null;
let juegoIniciado = false;

const teclasPresionadas = [false, false, false, false];
const MAPEO_TECLAS = {
    'KeyD': 0,
    'KeyF': 1,
    'KeyJ': 2,
    'KeyK': 3
};

function parsearHitObjects(textoOsu) {
    const lineas = textoOsu.split('\n');
    let modoHitObjects = false;
    const notas = [];

    for (let linea of lineas) {
        linea = linea.trim();
        if (linea === "[HitObjects]") {
            modoHitObjects = true;
            continue;
        }
        if (modoHitObjects && linea.startsWith("[")) break;

        if (modoHitObjects && linea !== "") {
            const partes = linea.split(',');
            const x = parseInt(partes[0]);
            const time = parseInt(partes[2]);
            const type = parseInt(partes[3]);

            const columna = Math.floor((x * CANTIDAD_TECLAS) / 512);
            let esHoldNote = (type & 128) !== 0;
            let endTime = time;

            if (esHoldNote && partes[5]) {
                const extras = partes[5].split(':');
                endTime = parseInt(extras[0]);
            }

            notas.push({ 
                columna, 
                time, 
                esHold: esHoldNote, 
                endTime, 
                hit: false,
                headHit: false 
            });
        }
    }
    return notas;
}

function gameLoop() {
    if (!juegoIniciado) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < CANTIDAD_TECLAS; i++) {
        ctx.fillStyle = teclasPresionadas[i] ? "rgba(255, 255, 255, 0.12)" : "#000";
        ctx.fillRect(i * ANCHO_CARRIL, 0, ANCHO_CARRIL, canvas.height);

        ctx.strokeStyle = "#2a2a2a";
        ctx.lineWidth = 2;
        ctx.strokeRect(i * ANCHO_CARRIL, 0, ANCHO_CARRIL, canvas.height);
    }

    ctx.strokeStyle = "#ff0055";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, LINEA_JUICIO_Y);
    ctx.lineTo(canvas.width, LINEA_JUICIO_Y);
    ctx.stroke();

    const tiempoActualMs = audio.currentTime * 1000;

    for (let nota of listaNotas) {
        if (nota.esHold) {
            if (tiempoActualMs > nota.endTime) continue;

            const tiempoRestanteHead = nota.time - tiempoActualMs;
            const posYHead = LINEA_JUICIO_Y - (tiempoRestanteHead * VELOCIDAD_CAIDA);
            
            const tiempoRestanteTail = nota.endTime - tiempoActualMs;
            const posYTail = LINEA_JUICIO_Y - (tiempoRestanteTail * VELOCIDAD_CAIDA);

            ctx.fillStyle = nota.headHit ? "rgba(0, 255, 204, 0.5)" : "rgba(0, 255, 204, 0.25)";
            ctx.fillRect(
                nota.columna * ANCHO_CARRIL + 8,
                posYTail,
                ANCHO_CARRIL - 16,
                Math.max(10, posYHead - posYTail)
            );

            if (posYHead > -50 && posYHead < canvas.height + 50) {
                ctx.fillStyle = "#00ffcc";
                ctx.fillRect(
                    nota.columna * ANCHO_CARRIL + 5,
                    posYHead - 10,
                    ANCHO_CARRIL - 10,
                    20
                );
            }

        } else {
            if (nota.hit) continue;

            const tiempoRestante = nota.time - tiempoActualMs;
            const posY = LINEA_JUICIO_Y - (tiempoRestante * VELOCIDAD_CAIDA);

            if (posY > -50 && posY < canvas.height + 50) {
                ctx.fillStyle = "#ffaa00";
                ctx.fillRect(
                    nota.columna * ANCHO_CARRIL + 5,
                    posY - 10,
                    ANCHO_CARRIL - 10,
                    20
                );
            }
        }
    }

    requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (MAPEO_TECLAS.hasOwnProperty(e.code)) {
        const col = MAPEO_TECLAS[e.code];
        teclasPresionadas[col] = true;

        if (!juegoIniciado) return;

        const tiempoActualMs = audio.currentTime * 1000;
        const ventanaJuicioMs = 150;

        for (let nota of listaNotas) {
            if (nota.columna === col) {
                if (!nota.esHold && !nota.hit) {
                    if (Math.abs(nota.time - tiempoActualMs) <= ventanaJuicioMs) {
                        nota.hit = true;
                        break;
                    }
                } else if (nota.esHold && !nota.headHit) {
                    if (Math.abs(nota.time - tiempoActualMs) <= ventanaJuicioMs) {
                        nota.headHit = true;
                        break;
                    }
                }
            }
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (MAPEO_TECLAS.hasOwnProperty(e.code)) {
        const col = MAPEO_TECLAS[e.code];
        teclasPresionadas[col] = false;
    }
});

document.getElementById('btnPlay').addEventListener('click', async () => {
    try {
        const respuestaOsu = await fetch(urlOsu);
        const textoOsu = await respuestaOsu.text();

        listaNotas = parsearHitObjects(textoOsu);

        audio = new Audio(urlAudio);
        audio.volume = 0.1;
        audio.play();

        juegoIniciado = true;
        document.getElementById('btnPlay').style.display = 'none';

        gameLoop();

    } catch (error) {
        console.error("Error al iniciar el juego:", error);
    }
});