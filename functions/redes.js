/* Respuestas automáticas a comentarios de Facebook e Instagram (y borradores para TikTok).

   Flujo:
   1. Meta avisa de cada comentario nuevo al webhook metaWebhook (firmado con el secreto de la app de Meta).
   2. El comentario se guarda en Firestore (rs_comentario) y Claude redacta la respuesta (redes-ia.js).
   3. Comentarios comunes, preguntas y críticas: se publican solos. Casos delicados (lesiones, cobros, denuncias,
      insultos) quedan "pendientes" hasta que Marketing los apruebe en el centro de mando.
   4. TikTok no permite responder por API: el panel pega el comentario y recibe el borrador para copiarlo.

   Colecciones:
   - rs_cuenta/{id de página o de cuenta de Instagram}: { plataforma, pais, nombre, activa, auto }.
   - rs_token/{mismo id}: { token } (token de la página; solo lo lee esta función, nunca el navegador).
   - rs_config/{bolivia|paraguay}: { datos, whatsapp, tono_extra, auto_activo, max_por_hora }.
   - rs_comentario/{plataforma_idComentario}: el comentario, la respuesta y su estado. */
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const ia = require("./redes-ia");

const REGION = "southamerica-east1";
const GRAPH = "https://graph.facebook.com/v21.0";
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const META_APP_SECRET = defineSecret("META_APP_SECRET");
const META_VERIFY_TOKEN = defineSecret("META_VERIFY_TOKEN");
const MAX_POR_HORA = 60;

const ahora = () => new Date().toISOString();

/* ---------- Webhook de Meta ---------- */

function firmaValida(cuerpoCrudo, firma, secreto) {
    if (!cuerpoCrudo || !firma || !secreto || !/^sha256=[a-f0-9]{64}$/.test(firma)) return false;
    const esperado = "sha256=" + crypto.createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(firma));
}

/* Saca los comentarios nuevos del aviso de Meta (páginas de Facebook e Instagram). Ignora los de la propia cuenta. */
function comentariosDelAviso(b) {
    const out = [];
    const entradas = Array.isArray(b && b.entry) ? b.entry : [];
    for (const e of entradas) {
        const cuenta = String(e.id || "");
        for (const ch of Array.isArray(e.changes) ? e.changes : []) {
            const v = ch.value || {};
            if (b.object === "page" && ch.field === "feed" && v.item === "comment" && v.verb === "add" && v.comment_id) {
                const de = (v.from && String(v.from.id)) || "";
                if (de === cuenta) continue;
                out.push({ plataforma: "facebook", cuenta, id: String(v.comment_id), texto: String(v.message || ""), autor: (v.from && v.from.name) || "",
                    autor_id: de, publicacion_id: String(v.post_id || ""), respuesta_a: v.parent_id && v.parent_id !== v.post_id ? String(v.parent_id) : null });
            } else if (b.object === "instagram" && ch.field === "comments" && v.id) {
                const de = (v.from && String(v.from.id)) || "";
                if (de === cuenta) continue;
                out.push({ plataforma: "instagram", cuenta, id: String(v.id), texto: String(v.text || ""), autor: (v.from && v.from.username) || "",
                    autor_id: de, publicacion_id: String((v.media && v.media.id) || ""), respuesta_a: v.parent_id ? String(v.parent_id) : null });
            }
        }
    }
    return out;
}

async function recibirAviso(db, b) {
    let guardados = 0;
    for (const c of comentariosDelAviso(b)) {
        if (!c.texto.trim()) continue;
        const cta = await db.collection("rs_cuenta").doc(c.cuenta).get();
        if (!cta.exists || cta.data().activa !== true) continue;
        const doc = Object.assign({}, c, { pais: cta.data().pais === "paraguay" ? "paraguay" : "bolivia", texto: c.texto.slice(0, 4000),
            cuenta_nombre: cta.data().nombre || "", estado: "nuevo", fecha_on: ahora() });
        try { await db.collection("rs_comentario").doc(c.plataforma + "_" + c.id).create(doc); guardados++; }
        catch (e) { if (e.code !== 6 && e.code !== "already-exists") throw e; } // Meta reenvía avisos: el repetido se ignora.
    }
    return guardados;
}

/* ---------- Graph API ---------- */

async function graph(ruta, token, metodo, cuerpo) {
    const url = GRAPH + "/" + ruta;
    const opts = { method: metodo || "GET", headers: { Authorization: "Bearer " + token } };
    if (cuerpo) { opts.headers["Content-Type"] = "application/x-www-form-urlencoded"; opts.body = new URLSearchParams(cuerpo).toString(); }
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw Object.assign(new Error((j.error && j.error.message) || ("Graph " + r.status)), { graph: j.error || null });
    return j;
}

async function textoPublicacion(c, token, g) {
    if (!c.publicacion_id || !token) return "";
    try {
        const campo = c.plataforma === "instagram" ? "caption" : "message";
        const j = await g(encodeURIComponent(c.publicacion_id) + "?fields=" + campo, token);
        return String(j[campo] || "").slice(0, 1500);
    } catch (e) { return ""; }
}

async function publicar(c, texto, token, g) {
    const ruta = encodeURIComponent(c.id) + (c.plataforma === "instagram" ? "/replies" : "/comments");
    const j = await g(ruta, token, "POST", { message: texto });
    return String(j.id || "");
}

/* ---------- Procesamiento ---------- */

/* Cupo de respuestas automáticas por cuenta y por hora (freno ante una avalancha de comentarios o un ataque). */
async function tomarCupo(db, cuenta, max) {
    const hora = new Date().toISOString().slice(0, 13);
    const ref = db.collection("rs_contador").doc(cuenta + "_" + hora);
    return db.runTransaction(async (t) => {
        const d = await t.get(ref);
        const n = d.exists ? Number(d.data().n) || 0 : 0;
        if (n >= max) return false;
        t.set(ref, { n: n + 1, cuenta, hora }, { merge: true });
        return true;
    });
}

async function datosDe(db, c) {
    const [conf, cta, tok] = await Promise.all([
        db.collection("rs_config").doc(c.pais || "bolivia").get(),
        c.plataforma === "tiktok" ? null : db.collection("rs_cuenta").doc(c.cuenta).get(),
        c.plataforma === "tiktok" ? null : db.collection("rs_token").doc(c.cuenta).get()
    ]);
    return { conf: conf.exists ? conf.data() : {}, cuenta: cta && cta.exists ? cta.data() : {}, token: tok && tok.exists ? tok.data().token : "" };
}

/* Redacta la respuesta y decide: publicar sola, dejar pendiente, borrador (TikTok) o ignorar (spam). */
async function procesar(db, ref, c, deps) {
    const g = deps.graph || graph;
    const { conf, cuenta, token } = await datosDe(db, c);
    const pub = c.publicacion_texto || (c.plataforma === "tiktok" ? "" : await textoPublicacion(c, token, g));
    const confIA = Object.assign({}, conf);
    if (c.indicacion) confIA.tono_extra = [conf.tono_extra, "Para este comentario: " + c.indicacion].filter(Boolean).join("\n");
    let r;
    try { r = await (deps.redactar || ia.redactar)(Object.assign({}, c, { publicacion_texto: pub }), confIA); }
    catch (e) {
        console.error("redes: redactar", e.status || "", e.message);
        return ref.update({ estado: c.plataforma === "tiktok" ? "borrador" : "pendiente", respuesta: "", categoria: "otro",
            motivo: "No se pudo generar la respuesta automática (" + (e.status || "error") + "). Escríbela a mano o vuelve a generarla.", fecha_proceso: ahora(), indicacion: null });
    }
    const base = { categoria: r.categoria, motivo: r.motivo, respuesta: r.respuesta, respuesta_final: r.respuesta, requiere_humano: r.requiere_humano,
        modelo: r.modelo || ia.MODELO, publicacion_texto: pub, fecha_proceso: ahora(), indicacion: null };
    if (r.categoria === "spam") return ref.update(Object.assign(base, { estado: "ignorado" }));
    if (c.plataforma === "tiktok") return ref.update(Object.assign(base, { estado: "borrador" }));
    let razon = null;
    if (c.regenerado) razon = "Respuesta regenerada: revísala y apruébala.";
    else if (r.requiere_humano) razon = "Caso delicado: espera aprobación.";
    else if (conf.auto_activo !== true) razon = "Respuestas automáticas apagadas para " + (c.pais === "paraguay" ? "Paraguay" : "Bolivia") + ".";
    else if (cuenta.auto !== true) razon = "Esta cuenta tiene las respuestas automáticas apagadas.";
    else if (!token) razon = "Falta el token de la cuenta.";
    else if (!(await tomarCupo(db, c.cuenta, Number(conf.max_por_hora) > 0 ? Number(conf.max_por_hora) : MAX_POR_HORA))) razon = "Se alcanzó el máximo de respuestas automáticas de esta hora.";
    if (razon) return ref.update(Object.assign(base, { estado: "pendiente", espera: razon }));
    try {
        const id = await publicar(c, r.respuesta, token, g);
        return ref.update(Object.assign(base, { estado: "respondido", id_respuesta: id, fecha_respuesta: ahora(), publicado_por: "automatico" }));
    } catch (e) {
        return ref.update(Object.assign(base, { estado: "error", detalle_error: String(e.message).slice(0, 300) }));
    }
}

/* Marketing aprobó (o reintenta) una respuesta pendiente: se publica tal como quedó en respuesta_final. */
async function publicarAprobado(db, ref, c, deps) {
    const g = deps.graph || graph;
    const texto = String(c.respuesta_final || "").trim();
    if (!texto) return ref.update({ estado: "pendiente", espera: "La respuesta está vacía." });
    const tok = await db.collection("rs_token").doc(c.cuenta).get();
    const token = tok.exists ? tok.data().token : "";
    if (!token) return ref.update({ estado: "error", detalle_error: "Falta el token de la cuenta." });
    try {
        const id = await publicar(c, texto.slice(0, 1000), token, g);
        return ref.update({ estado: "respondido", id_respuesta: id, fecha_respuesta: ahora(), publicado_por: c.revisado_por || "aprobado" });
    } catch (e) {
        return ref.update({ estado: "error", detalle_error: String(e.message).slice(0, 300) });
    }
}

async function alCambiar(db, ref, antes, despues, deps) {
    if (!antes || !despues || antes.estado === despues.estado) return null;
    if (despues.estado === "aprobado" && despues.plataforma !== "tiktok") return publicarAprobado(db, ref, despues, deps);
    if (despues.estado === "regenerar") {
        await ref.update({ estado: "generando" });
        return procesar(db, ref, Object.assign({}, despues, { regenerado: true }), deps);
    }
    return null;
}

/* ---------- Funciones publicadas ---------- */

const opcionesIA = { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: "256MiB", maxInstances: 5, retry: false };

exports.metaWebhook = onRequest({ region: REGION, secrets: [META_APP_SECRET, META_VERIFY_TOKEN], maxInstances: 5, timeoutSeconds: 30, memory: "256MiB" }, async (req, res) => {
    if (req.method === "GET") {
        const q = req.query || {};
        if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] && q["hub.verify_token"] === META_VERIFY_TOKEN.value()) return res.status(200).send(String(q["hub.challenge"] || ""));
        return res.status(403).send("No");
    }
    if (req.method !== "POST") return res.status(405).send("No");
    if (!firmaValida(req.rawBody, req.get("x-hub-signature-256"), META_APP_SECRET.value())) return res.status(401).send("Firma no válida");
    try { await recibirAviso(admin.firestore(), req.body); }
    catch (e) { console.error("metaWebhook", e.message); return res.status(500).send("Error"); }
    return res.status(200).send("OK");
});

exports.rsNuevoComentario = onDocumentCreated(Object.assign({ document: "rs_comentario/{id}" }, opcionesIA), async (ev) => {
    const d = ev.data && ev.data.data();
    if (!d || d.estado !== "nuevo") return null;
    return procesar(admin.firestore(), ev.data.ref, d, {});
});

exports.rsComentarioCambio = onDocumentUpdated(Object.assign({ document: "rs_comentario/{id}" }, opcionesIA), async (ev) => {
    return alCambiar(admin.firestore(), ev.data.after.ref, ev.data.before.data(), ev.data.after.data(), {});
});

exports._internos = { firmaValida, comentariosDelAviso, recibirAviso, procesar, publicarAprobado, alCambiar, tomarCupo };
