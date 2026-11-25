/* «Estudio creativo» · producción del contenido (Bolivia y Paraguay).
   Toma un paquete creativo ya armado y FABRICA las piezas, todo con Google Cloud (Vertex AI) del proyecto:
     - imagen:  pieza gráfica terminada, con su titular y CTA en la imagen (Gemini imagen).
     - escena:  una imagen vertical por bloque del guion, para el reel con imágenes animadas (económico).
     - clip:    un video vertical por bloque del guion (Veo), para el reel con video IA.
     - voz:     la voz en off del guion (Text-to-Speech, voz en español).
     - musica:  la música instrumental (Lyria).
     - montaje: arma el reel final 1080×1920 con ffmpeg (escenas o clips, texto en pantalla, voz y música).
   Cada producción es un documento mkt_produccion/{id} (campo «pais») con la lista de pasos. Esta función se dispara
   con cada cambio del documento, hace UN paso por vez y avanza al siguiente (así ningún paso supera el tiempo máximo).
   Los archivos quedan en Firebase Storage (creativo/<pais>/<id>/…) con enlace de descarga. */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const crypto = require("crypto");
const { execFile } = require("child_process");

const PROYECTO = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "centro-de-comando-a57cf";
const BUCKET = process.env.CREATIVO_BUCKET || (PROYECTO + ".firebasestorage.app");
const M_IMAGEN = process.env.CREATIVO_M_IMAGEN || "gemini-3.1-flash-image";
const M_VIDEO = process.env.CREATIVO_M_VIDEO || "veo-3.1-fast-generate-001";
const M_MUSICA = process.env.CREATIVO_M_MUSICA || "lyria-002";
const VOZ = process.env.CREATIVO_VOZ || "es-US-Chirp3-HD-Charon";
const REGION_IA = process.env.CREATIVO_REGION_IA || "us-central1";
const FUENTE = path.join(__dirname, "fuentes", "Inter-ExtraBold.otf");

/* ---------- utilidades ---------- */
async function tokenGoogle() {
    const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
    if (!r.ok) throw new Error("metadata " + r.status);
    return (await r.json()).access_token;
}
async function google(url, cuerpo) {
    const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + await tokenGoogle(), "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(((d.error && d.error.message) || ("HTTP " + r.status)).slice(0, 300));
    return d;
}
function urlModelo(modelo, metodo, region) {
    const loc = region || REGION_IA;
    const host = loc === "global" ? "aiplatform.googleapis.com" : loc + "-aiplatform.googleapis.com";
    return "https://" + host + "/v1/projects/" + PROYECTO + "/locations/" + loc + "/publishers/google/models/" + modelo + ":" + metodo;
}
async function subir(ruta, buffer, tipo) {
    const token = crypto.randomUUID();
    await admin.storage().bucket(BUCKET).file(ruta).save(buffer, { contentType: tipo, resumable: false, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    return { ruta, tipo, url: "https://firebasestorage.googleapis.com/v0/b/" + BUCKET + "/o/" + encodeURIComponent(ruta) + "?alt=media&token=" + token };
}
async function bajar(ruta) { const [b] = await admin.storage().bucket(BUCKET).file(ruta).download(); return b; }
function ffmpegBin() { return require("ffmpeg-static"); }
function ffmpeg(args) {
    return new Promise((ok, mal) => execFile(ffmpegBin(), ["-hide_banner", "-y"].concat(args), { maxBuffer: 64 * 1024 * 1024 }, (e, so, se) => e ? mal(new Error("ffmpeg: " + String(se || e.message).split("\n").slice(-6).join(" | ").slice(0, 400))) : ok(String(se || ""))));
}
function duracion(archivo) {
    return new Promise((ok) => execFile(ffmpegBin(), ["-hide_banner", "-i", archivo], (e, so, se) => {
        const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(se || ""));
        ok(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0);
    }));
}
const t = (v, max) => String(v == null ? "" : v).trim().slice(0, max || 2000);

/* «0–3 s», «3-7s», «0:05–0:10» → [inicio, fin] en segundos */
function tramo(s) {
    const n = String(s || "").replace(/,/g, ".").match(/\d+(?::\d+)?(?:\.\d+)?/g) || [];
    const seg = (x) => x.indexOf(":") >= 0 ? Number(x.split(":")[0]) * 60 + Number(x.split(":")[1]) : Number(x);
    if (n.length >= 2) { const a = seg(n[0]), b = seg(n[1]); if (b > a) return [a, b]; }
    return null;
}
function duraciones(guion) {
    return (guion || []).map((g) => { const r = tramo(g.tiempo); return Math.min(10, Math.max(1.5, r ? r[1] - r[0] : 3)); });
}
function aspecto(formato) {
    const s = String(formato || "");
    const m = /(\d{3,4})\s*[x×]\s*(\d{3,4})/.exec(s);
    if (m) { const r = Number(m[1]) / Number(m[2]); return r > 1.6 ? "16:9" : r > 1.1 ? "4:3" : r > 0.95 ? "1:1" : r > 0.7 ? "4:5" : "9:16"; }
    const a = /(\d+)\s*:\s*(\d+)/.exec(s); if (a) return a[1] + ":" + a[2];
    return /histori|story|reel|vertical|9:16/i.test(s) ? "9:16" : "4:5";
}
function estilo(p) {
    const d = (p && p.direccion_arte) || {};
    return ["Art direction: " + [d.luz, d.camara_y_encuadre, d.textura_y_estilo, d.casting_y_vestuario].filter(Boolean).join(". "),
        "Palette: " + (d.paleta || []).join(", ") + ". Dark, high-contrast calisthenics gym; red #E30613 only as a small accent.",
        "Real athletic people training calisthenics (pull-up bars, parallel bars, rings, bodyweight). Authentic, not stock-photo looking, no gym machines."].join("\n");
}
function promptsDe(p, tipo) { return ((p && p.prompts) || []).filter((x) => x.tipo === tipo); }

/* ---------- generadores ---------- */
async function generarImagen(prompt, ar) {
    const d = await google(urlModelo(M_IMAGEN, "generateContent", "global"), {
        contents: [{ role: "user", parts: [{ text: prompt.slice(0, 6000) }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: ar } }
    });
    const partes = (((d.candidates || [])[0] || {}).content || {}).parts || [];
    const img = partes.find((x) => x.inlineData && x.inlineData.data);
    if (!img) throw new Error("el modelo no devolvió imagen (puede haber bloqueado el pedido)");
    return { buffer: Buffer.from(img.inlineData.data, "base64"), mime: img.inlineData.mimeType || "image/png" };
}
async function generarClip(prompt, segundos) {
    const dur = segundos <= 4 ? 4 : segundos <= 6 ? 6 : 8;
    const op = await google(urlModelo(M_VIDEO, "predictLongRunning"), {
        instances: [{ prompt: prompt.slice(0, 3500) }],
        parameters: { aspectRatio: "9:16", durationSeconds: dur, sampleCount: 1, generateAudio: false, personGeneration: "allow_adult", resolution: "720p" }
    });
    const hasta = Date.now() + 440000;
    while (Date.now() < hasta) {
        await new Promise((r) => setTimeout(r, 10000));
        const e = await google(urlModelo(M_VIDEO, "fetchPredictOperation"), { operationName: op.name });
        if (!e.done) continue;
        if (e.error) throw new Error(e.error.message || "Veo devolvió un error");
        const v = ((e.response || {}).videos || [])[0];
        if (!v || !v.bytesBase64Encoded) throw new Error((e.response && e.response.raiMediaFilteredReasons && e.response.raiMediaFilteredReasons[0]) || "Veo no devolvió el video (filtro de contenido)");
        return { buffer: Buffer.from(v.bytesBase64Encoded, "base64"), mime: v.mimeType || "video/mp4" };
    }
    throw new Error("Veo tardó demasiado en esta escena");
}
async function generarVoz(texto) {
    const r = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
        method: "POST", headers: { Authorization: "Bearer " + await tokenGoogle(), "Content-Type": "application/json" },
        body: JSON.stringify({ input: { text: texto.slice(0, 4500) }, voice: { languageCode: VOZ.slice(0, 5), name: VOZ }, audioConfig: { audioEncoding: "MP3", speakingRate: 1.05 } })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.audioContent) throw new Error(((d.error && d.error.message) || "HTTP " + r.status).slice(0, 300));
    return Buffer.from(d.audioContent, "base64");
}
async function generarMusica(prompt) {
    const d = await google(urlModelo(M_MUSICA, "predict"), { instances: [{ prompt: prompt.slice(0, 1500), negative_prompt: "vocals, singing, lyrics, speech, low quality, distorted" }], parameters: { sample_count: 1 } });
    const p = (d.predictions || [])[0] || {};
    const b64 = p.bytesBase64Encoded || p.audioContent;
    if (!b64) throw new Error("el modelo de música no devolvió audio");
    return { buffer: Buffer.from(b64, "base64"), mime: p.mimeType || "audio/wav" };
}

/* ---------- pasos ---------- */
const ext = (mime) => ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "audio/wav": "wav", "audio/mpeg": "mp3" }[mime] || "bin");
function carpeta(d, id) { return "creativo/" + d.pais + "/" + id + "/"; }

const PASOS = {
    async imagen(d, paso, id) {
        const p = d.paquete, pieza = (p.piezas_graficas || [])[paso.i], pi = promptsDe(p, "imagen");
        let base, ar, nombre;
        if (pieza) {
            const pr = pi[paso.i] || pi[0];
            base = (pr ? pr.prompt : pieza.idea) + "\n\n" + estilo(p);
            ar = aspecto(pieza.formato || (pr && pr.relacion_aspecto));
            nombre = pieza.nombre || ("Pieza " + (paso.i + 1));
            base += "\n\nThis is the FINISHED social media graphic for Calistenia Company. Render this Spanish text exactly as written (same spelling and accents), in bold condensed uppercase sans-serif, white, high contrast, perfectly legible on a phone:" +
                "\nHEADLINE: \"" + t(pieza.titular, 80) + "\"" + (pieza.texto_apoyo ? "\nSUPPORTING LINE (smaller): \"" + t(pieza.texto_apoyo, 120) + "\"" : "") + (pieza.cta ? "\nCALL TO ACTION (smaller, on a solid red #E30613 bar with square corners): \"" + t(pieza.cta, 60) + "\"" : "") +
                "\nKeep generous safe margins, square corners, no logos, no watermarks and no other text.";
        } else {
            const pr = pi[paso.i];
            base = pr.prompt + "\n\n" + estilo(p); ar = aspecto(pr.relacion_aspecto); nombre = pr.para_que || ("Imagen " + (paso.i + 1));
        }
        const img = await generarImagen(base, ar);
        const f = await subir(carpeta(d, id) + "imagen-" + (paso.i + 1) + "." + ext(img.mime), img.buffer, img.mime);
        return { "resultados.imagenes": FieldValue.arrayUnion(Object.assign({ i: paso.i, nombre, aspecto: ar }, f)) };
    },
    async escena(d, paso, id) {
        const p = d.paquete, g = (p.guion || [])[paso.i] || {}, pv = promptsDe(p, "video");
        const pr = pv.length === (p.guion || []).length ? pv[paso.i].prompt : [g.plano, g.accion].filter(Boolean).join(". ");
        const img = await generarImagen("Vertical 9:16 photorealistic still frame for a short video. Scene: " + pr + "\n\n" + estilo(p) + "\n\nNo text, no letters, no subtitles, no logos in the image.", "9:16");
        const f = await subir(carpeta(d, id) + "escena-" + (paso.i + 1) + "." + ext(img.mime), img.buffer, img.mime);
        return { ["resultados.escenas." + paso.i]: f };
    },
    async clip(d, paso, id) {
        const p = d.paquete, g = (p.guion || [])[paso.i] || {}, pv = promptsDe(p, "video");
        const pr = pv.length === (p.guion || []).length ? pv[paso.i].prompt : [g.plano, g.accion].filter(Boolean).join(". ");
        const v = await generarClip("Vertical 9:16 video. " + pr + "\n" + estilo(p) + "\nNo text overlays, no subtitles, no logos.", duraciones(p.guion)[paso.i]);
        const f = await subir(carpeta(d, id) + "clip-" + (paso.i + 1) + ".mp4", v.buffer, "video/mp4");
        return { ["resultados.clips." + paso.i]: f };
    },
    async voz(d, paso, id) {
        const texto = (d.paquete.guion || []).map((g) => t(g.voz, 400)).filter((x) => x && x !== "—" && x !== "-").join(" … ");
        if (!texto) return {};
        const f = await subir(carpeta(d, id) + "voz.mp3", await generarVoz(texto), "audio/mpeg");
        return { "resultados.voz": Object.assign({ texto }, f) };
    },
    async musica(d, paso, id) {
        const pm = promptsDe(d.paquete, "musica")[0];
        const prompt = pm ? pm.prompt : "Instrumental urban hip-hop beat, 95 BPM, energetic, gritty gym atmosphere, punchy drums, no vocals";
        const m = await generarMusica(prompt);
        const f = await subir(carpeta(d, id) + "musica." + ext(m.mime), m.buffer, m.mime);
        return { "resultados.musica": f };
    },
    async montaje(d, paso, id, leer) {
        const actual = await leer();
        const p = actual.paquete, guion = p.guion || [], R = actual.resultados || {};
        const dur = duraciones(guion);
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-"));
        try {
            const fuentes = [];
            for (let i = 0; i < guion.length; i++) {
                const c = R.clips && R.clips[i], e = R.escenas && R.escenas[i];
                fuentes.push(c ? { tipo: "video", ruta: c.ruta } : e ? { tipo: "imagen", ruta: e.ruta } : null);
            }
            const respaldo = fuentes.find(Boolean) || ((R.imagenes || [])[0] && { tipo: "imagen", ruta: R.imagenes[0].ruta });
            if (!respaldo) throw new Error("no hay escenas ni clips para armar el reel");
            const segs = [];
            for (let i = 0; i < guion.length; i++) {
                const f = fuentes[i] || respaldo, entrada = path.join(dir, "in-" + i + path.extname(f.ruta)), seg = path.join(dir, "seg-" + i + ".mp4");
                await fs.writeFile(entrada, await bajar(f.ruta));
                const texto = textoPantalla(guion[i].texto_pantalla);
                let filtro;
                const cuadros = Math.round(dur[i] * 30);
                if (f.tipo === "video") filtro = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=" + dur[i];
                else filtro = "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='1+0.12*on/" + cuadros + "':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=" + cuadros + ":s=1080x1920:fps=30,setsar=1";
                if (texto) {
                    const tf = path.join(dir, "t-" + i + ".ass"); await fs.writeFile(tf, ass(texto, dur[i]));
                    filtro += ",ass=" + tf + ":fontsdir=" + path.dirname(FUENTE);
                }
                const entradaArgs = f.tipo === "video" ? ["-i", entrada] : ["-loop", "1", "-framerate", "30", "-i", entrada];
                await ffmpeg(entradaArgs.concat(["-t", String(dur[i]), "-vf", filtro, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", seg]));
                segs.push(seg);
            }
            const lista = path.join(dir, "lista.txt");
            await fs.writeFile(lista, segs.map((s) => "file '" + s + "'").join("\n"));
            const video = path.join(dir, "video.mp4");
            await ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", video]);
            const totalVideo = dur.reduce((a, b) => a + b, 0);
            let vozArch = null, musArch = null, dVoz = 0;
            if (R.voz) { vozArch = path.join(dir, "voz.mp3"); await fs.writeFile(vozArch, await bajar(R.voz.ruta)); dVoz = await duracion(vozArch); }
            if (R.musica) { musArch = path.join(dir, "musica" + path.extname(R.musica.ruta)); await fs.writeFile(musArch, await bajar(R.musica.ruta)); }
            const total = Math.max(totalVideo, dVoz ? dVoz + 0.9 : 0);
            const pad = Math.max(0, total - totalVideo);
            const args = ["-i", video], filtros = ["[0:v]tpad=stop_mode=clone:stop_duration=" + pad.toFixed(2) + "[v]"];
            let n = 1, etiquetas = [];
            if (vozArch) { args.push("-i", vozArch); filtros.push("[" + n + ":a]adelay=400|400,volume=1.15[a" + n + "]"); etiquetas.push("[a" + n + "]"); n++; }
            if (musArch) {
                args.push("-stream_loop", "-1", "-i", musArch);
                filtros.push("[" + n + ":a]volume=" + (vozArch ? "0.20" : "0.75") + ",afade=t=in:d=0.4,afade=t=out:st=" + Math.max(0, total - 1.3).toFixed(2) + ":d=1.3[a" + n + "]"); etiquetas.push("[a" + n + "]"); n++;
            }
            if (etiquetas.length > 1) filtros.push(etiquetas.join("") + "amix=inputs=" + etiquetas.length + ":duration=longest:normalize=0[a]");
            else if (etiquetas.length === 1) filtros.push(etiquetas[0] + "anull[a]");
            const reel = path.join(dir, "reel.mp4");
            await ffmpeg(args.concat(["-filter_complex", filtros.join(";"), "-map", "[v]"]).concat(etiquetas.length ? ["-map", "[a]", "-c:a", "aac", "-b:a", "160k"] : ["-an"])
                .concat(["-t", total.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", reel]));
            const f = await subir(carpeta(actual, id) + "reel.mp4", await fs.readFile(reel), "video/mp4");
            return { "resultados.reel": Object.assign({ segundos: Math.round(total) }, f) };
        } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
    }
};
/* Texto en pantalla: mayúsculas y cortado en líneas de hasta 18 letras (drawtext no corta solo). */
function textoPantalla(s) {
    const x = t(s, 120).replace(/^[—-]$/, "").toUpperCase();
    if (!x) return "";
    const palabras = x.split(/\s+/), lineas = []; let l = "";
    palabras.forEach((w) => { if ((l + " " + w).trim().length > 18 && l) { lineas.push(l); l = w; } else l = (l + " " + w).trim(); });
    if (l) lineas.push(l);
    return lineas.slice(0, 4).join("\n");
}
/* Subtítulo del bloque en formato ASS (la versión de ffmpeg incluida dibuja texto con libass): blanco sobre caja oscura. */
function ass(texto, segundos) {
    const hms = (x) => { const h = Math.floor(x / 3600), m = Math.floor(x / 60) % 60, s = (x % 60).toFixed(2); return h + ":" + String(m).padStart(2, "0") + ":" + s.padStart(5, "0"); };
    const linea = texto.replace(/[{}\\]/g, "").split("\n").join("\\N");
    return ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 2", "",
        "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: T,Inter ExtraBold,80,&H00FFFFFF,&H00FFFFFF,&H380A0A0A,&H380A0A0A,0,0,0,0,100,100,1,0,3,22,0,2,80,80,520,1", "",
        "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        "Dialogue: 0," + hms(0) + "," + hms(segundos + 1) + ",T,,0,0,0,," + linea, ""].join("\n");
}
const NOMBRES = { imagen: "Imagen", escena: "Escena", clip: "Video de la escena", voz: "Voz en off", musica: "Música", montaje: "Armado del reel" };

/* Lista de pasos de una producción (la usa creativo.js al crearla). */
function planificar(paquete, op) {
    const p = paquete || {}, pasos = [], guion = (p.guion || []).slice(0, 8);
    if (op.voz && guion.some((g) => t(g.voz).length > 1)) pasos.push({ tipo: "voz" });
    if (op.musica && guion.length) pasos.push({ tipo: "musica" });
    if (op.imagenes) {
        const n = (p.piezas_graficas || []).length ? Math.min(4, p.piezas_graficas.length) : Math.min(3, promptsDe(p, "imagen").length);
        for (let i = 0; i < n; i++) pasos.push({ tipo: "imagen", i });
    }
    if (guion.length && op.video === "imagenes") guion.forEach((g, i) => pasos.push({ tipo: "escena", i }));
    if (guion.length && op.video === "ia") guion.forEach((g, i) => pasos.push({ tipo: "clip", i }));
    if (guion.length && (op.video === "imagenes" || op.video === "ia")) pasos.push({ tipo: "montaje" });
    return pasos.map((x) => Object.assign(x, { nombre: NOMBRES[x.tipo] + (x.i != null ? " " + (x.i + 1) : "") }));
}

exports.creativoProduccion = onDocumentWritten({ document: "mkt_produccion/{id}", region: "southamerica-east1", timeoutSeconds: 540, memory: "2GiB", cpu: 2, maxInstances: 6, retry: false }, async (ev) => {
    const antes = ev.data.before.exists ? ev.data.before.data() : null;
    const d = ev.data.after.exists ? ev.data.after.data() : null;
    if (!d || d.estado !== "pendiente") return;
    if (antes && antes.estado === "pendiente" && antes.paso_i === d.paso_i) return;
    const ref = ev.data.after.ref, db = admin.firestore();
    const tomado = await db.runTransaction(async (tx) => {
        const s = await tx.get(ref), x = s.data();
        if (!x || x.estado !== "pendiente" || x.paso_i !== d.paso_i) return false;
        tx.update(ref, { estado: "trabajando", avance: (x.pasos[x.paso_i] || {}).nombre || "", actualizado: FieldValue.serverTimestamp() });
        return true;
    });
    if (!tomado) return;
    const paso = d.pasos[d.paso_i], sig = d.paso_i + 1, fin = sig >= d.pasos.length;
    const cierre = { paso_i: sig, estado: fin ? "listo" : "pendiente", avance: fin ? "" : (d.pasos[sig] || {}).nombre || "", actualizado: FieldValue.serverTimestamp() };
    try {
        const cambios = paso ? await PASOS[paso.tipo](d, paso, ev.params.id, () => ref.get().then((s) => s.data())) : {};
        await ref.update(Object.assign({}, cambios || {}, cierre));
    } catch (e) {
        console.error("creativoProduccion", paso && paso.tipo, e.message);
        await ref.update(Object.assign({ errores: FieldValue.arrayUnion((paso ? paso.nombre : "?") + ": " + String(e.message || e).slice(0, 300)) }, cierre));
    }
});

exports._internos = { ass, planificar, tramo, duraciones, aspecto, textoPantalla, PASOS, M: { M_IMAGEN, M_VIDEO, M_MUSICA, VOZ, BUCKET } };
