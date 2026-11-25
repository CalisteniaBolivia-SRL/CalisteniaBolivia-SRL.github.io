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
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const ia = require("./redes-ia");
const ig = require("./redes-ig");   // conexión directa de Instagram (sin página de Facebook)

const REGION = "southamerica-east1";
const GRAPH = "https://graph.facebook.com/v21.0";
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const META_APP_SECRET = defineSecret("META_APP_SECRET");
const META_VERIFY_TOKEN = defineSecret("META_VERIFY_TOKEN");
const META_APP_ID = defineString("META_APP_ID", { default: "" });
const MAX_POR_HORA = 60;
const ESPERA_MS = 4000;          // si el cliente manda varios mensajes seguidos, se responde una vez al último
const VENTANA_MS = 24 * 3600000; // Meta deja responder mensajes directos hasta 24 h después del último del cliente

const ahora = () => new Date().toISOString();
const appIdIG = () => { try { return ig.IG_APP_ID.value() || ""; } catch (e) { return ""; } };

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

async function recibirAviso(db, b, deps) {
    let guardados = await recibirMensajes(db, b, deps || {});
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

/* api «instagram»: cuentas conectadas directo con Instagram (graph.instagram.com); si no, Graph de Facebook. */
async function graph(ruta, token, metodo, cuerpo, api) {
    const url = (api === "instagram" ? ig._internos.IG_GRAPH : GRAPH) + "/" + ruta;
    const opts = { method: metodo || "GET", headers: token ? { Authorization: "Bearer " + token } : {} };
    if (cuerpo) { opts.headers["Content-Type"] = "application/x-www-form-urlencoded"; opts.body = new URLSearchParams(cuerpo).toString(); }
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw Object.assign(new Error((j.error && j.error.message) || ("Graph " + r.status)), { graph: j.error || null });
    return j;
}

async function textoPublicacion(c, token, g, api) {
    if (!c.publicacion_id || !token) return "";
    try {
        const campo = c.plataforma === "instagram" ? "caption" : "message";
        const j = await g(encodeURIComponent(c.publicacion_id) + "?fields=" + campo, token, undefined, undefined, api);
        return String(j[campo] || "").slice(0, 1500);
    } catch (e) { return ""; }
}

async function publicar(c, texto, token, g, api) {
    const ruta = encodeURIComponent(c.id) + (c.plataforma === "instagram" ? "/replies" : "/comments");
    const j = await g(ruta, token, "POST", { message: texto }, api);
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
        c.plataforma === "tiktok" ? null : ig._internos.tokenDe(db, c.cuenta)
    ]);
    return { conf: conf.exists ? conf.data() : {}, cuenta: cta && cta.exists ? cta.data() : {}, token: tok ? tok.token : "", api: tok ? tok.api : "facebook" };
}

/* Redacta la respuesta y decide: publicar sola, dejar pendiente, borrador (TikTok) o ignorar (spam). */
async function procesar(db, ref, c, deps) {
    const g = deps.graph || graph;
    const { conf, cuenta, token, api } = await datosDe(db, c);
    const pub = c.publicacion_texto || (c.plataforma === "tiktok" ? "" : await textoPublicacion(c, token, g, api));
    const confIA = Object.assign({}, conf);
    if (c.indicacion) confIA.tono_extra = [conf.tono_extra, "Para este comentario: " + c.indicacion].filter(Boolean).join("\n");
    let r;
    try { r = await (deps.redactar || ia.redactar)(Object.assign({}, c, { publicacion_texto: pub }), confIA); }
    catch (e) {
        console.error("redes: redactar", e.status || "", e.message);
        return ref.update({ estado: c.plataforma === "tiktok" ? "borrador" : "pendiente", respuesta: "", categoria: "otro",
            motivo: "No se pudo generar la respuesta automática (" + (e.status || "error") + "). Escríbela a mano o vuelve a generarla.", fecha_proceso: ahora(), indicacion: null });
    }
    const base = { categoria: r.categoria, tema: r.tema || "otro", motivo: r.motivo, respuesta: r.respuesta, respuesta_final: r.respuesta, requiere_humano: r.requiere_humano,
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
        const id = await publicar(c, r.respuesta, token, g, api);
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
    const { token, api } = await ig._internos.tokenDe(db, c.cuenta);
    if (!token) return ref.update({ estado: "error", detalle_error: "Falta el token de la cuenta." });
    try {
        const id = await publicar(c, texto.slice(0, 1000), token, g, api);
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

/* ---------- Mensajes directos (Messenger e Instagram) ----------
   rs_conversacion/{plataforma_cuenta_usuario}: una ficha por persona y cuenta (el CRM).
   rs_mensaje/{id}: cada mensaje (de: cliente | bot | personal). El personal escribe desde el panel creando un mensaje
   «pendiente», que esta función envía. Si el personal toma la conversación, el bot se pausa. */
function mensajesDelAviso(b) {
    const out = [];
    for (const e of Array.isArray(b && b.entry) ? b.entry : []) {
        const cuenta = String(e.id || "");
        for (const m of Array.isArray(e.messaging) ? e.messaging : []) {
            if (!m || !m.message || !m.sender || !m.recipient) continue;
            const eco = m.message.is_echo === true;
            const cliente = String(eco ? m.recipient.id : m.sender.id);
            out.push({ plataforma: b.object === "instagram" ? "instagram_dm" : "messenger", cuenta, cliente, eco,
                app_id: m.message.app_id != null ? String(m.message.app_id) : "", mid: String(m.message.mid || ""),
                texto: String(m.message.text || (m.message.attachments ? "(envió un adjunto)" : "")).slice(0, 4000),
                fecha: new Date(Number(m.timestamp) || Date.now()).toISOString() });
        }
    }
    return out;
}
const idConversacion = (m) => m.plataforma + "_" + m.cuenta + "_" + m.cliente;

async function nombreCliente(m, token, g, api) {
    if (!token) return "";
    try {
        const campos = m.plataforma === "instagram_dm" ? "name,username" : "first_name,last_name";
        const j = await g(encodeURIComponent(m.cliente) + "?fields=" + campos, token, undefined, undefined, api);
        return String(j.name || j.username || [j.first_name, j.last_name].filter(Boolean).join(" ") || "").slice(0, 120);
    } catch (e) { return ""; }
}

async function recibirMensajes(db, b, deps) {
    const g = deps.graph || graph;
    let n = 0;
    for (const m of mensajesDelAviso(b)) {
        if (!m.mid || !m.texto) continue;
        const cta = await db.collection("rs_cuenta").doc(m.cuenta).get();
        if (!cta.exists || cta.data().activa !== true) continue;
        const refM = db.collection("rs_mensaje").doc(m.plataforma + "_" + m.mid.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 300));
        if ((await refM.get()).exists) continue;                       // Meta reenvía avisos; los propios ya están guardados
        if (m.eco && m.app_id && (m.app_id === META_APP_ID.value() || m.app_id === appIdIG())) continue;   // lo mandó esta app (bot o panel)
        const idc = idConversacion(m), refC = db.collection("rs_conversacion").doc(idc);
        const c = await refC.get();
        const pais = cta.data().pais === "paraguay" ? "paraguay" : "bolivia";
        if (!c.exists) {
            const tok = await ig._internos.tokenDe(db, m.cuenta);
            await refC.set({ plataforma: m.plataforma, cuenta: m.cuenta, cuenta_nombre: cta.data().nombre || "", pais, cliente_id: m.cliente,
                usuario_nombre: await nombreCliente(m, tok.token, g, tok.api), tema: "otro", temas: [], estado_atencion: "bot", bot: "activo",
                asignado_a: null, asignado_nombre: null, nota: null, no_leidos: 0, fecha_on: ahora() });
        }
        if (m.eco) {
            /* Alguien del equipo respondió desde la bandeja de Meta: se registra y el bot se pausa en esta conversación. */
            await refM.set({ conversacion: idc, de: "personal", texto: m.texto, fecha: m.fecha, mid: m.mid, autor: null, autor_nombre: "Bandeja de Meta", estado_envio: "enviado" });
            await refC.update({ ultimo_texto: m.texto.slice(0, 200), ultimo_de: "personal", fecha_ultimo: m.fecha, bot: "pausado", estado_atencion: "en_curso" });
        } else {
            await refM.set({ conversacion: idc, de: "cliente", texto: m.texto, fecha: m.fecha, mid: m.mid });
            await refC.update({ ultimo_texto: m.texto.slice(0, 200), ultimo_de: "cliente", fecha_ultimo: m.fecha, fecha_ultimo_cliente: m.fecha,
                no_leidos: admin.firestore.FieldValue.increment(1) });
        }
        n++;
    }
    return n;
}

async function enviarMensaje(db, conv, texto, g) {
    const tok = await ig._internos.tokenDe(db, conv.cuenta);
    if (!tok.token) throw new Error("Falta el token de la cuenta.");
    const cuerpo = { recipient: JSON.stringify({ id: conv.cliente_id }), message: JSON.stringify({ text: texto.slice(0, 1000) }) };
    if (tok.api !== "instagram") cuerpo.messaging_type = "RESPONSE";   // Messenger lo exige; Instagram directo no lo usa
    const j = await g("me/messages", tok.token, "POST", cuerpo, tok.api);
    return String(j.message_id || "");
}

/* Mensaje nuevo del cliente: si el bot está activo, responde (una vez por ráfaga de mensajes). */
async function procesarMensaje(db, refM, m, deps) {
    const g = deps.graph || graph;
    if (deps.esperar !== false) await new Promise((r) => setTimeout(r, deps.esperaMs != null ? deps.esperaMs : ESPERA_MS));
    const refC = db.collection("rs_conversacion").doc(m.conversacion);
    const c = await refC.get();
    if (!c.exists) return null;
    const conv = c.data();
    const hist = (await db.collection("rs_mensaje").where("conversacion", "==", m.conversacion).get()).docs.map((d) => Object.assign({ id: d.id }, d.data()))
        .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const ultimoCliente = hist.filter((x) => x.de === "cliente").slice(-1)[0];
    if (!ultimoCliente || ultimoCliente.id !== refM.id) return null;            // llegó otro después: responde ese
    const conf = (await db.collection("rs_config").doc(conv.pais || "bolivia").get()).data() || {};
    const cta = (await db.collection("rs_cuenta").doc(conv.cuenta).get()).data() || {};
    let r;
    try { r = await (deps.responder || ia.responderConversacion)(conv, hist, conf); }
    catch (e) {
        console.error("redes: conversación", e.status || "", e.message);
        return refC.update({ estado_atencion: "por_atender", motivo: "No se pudo generar la respuesta automática: respóndale una persona." });
    }
    const temas = Array.from(new Set((conv.temas || []).concat([r.tema]))).slice(-6);
    const cambios = { tema: r.tema, temas, categoria: r.categoria, motivo: r.motivo, sugerencia: r.respuesta || null };
    if (r.categoria === "spam") return refC.update(Object.assign(cambios, { estado_atencion: "no_requiere" }));
    if (conv.bot !== "activo") return refC.update(Object.assign(cambios, { estado_atencion: conv.estado_atencion === "en_curso" ? "en_curso" : "por_atender" }));
    let razon = null;
    if (r.requiere_humano) razon = "humano";
    else if (conf.auto_activo !== true || cta.auto !== true) razon = "apagado";
    else if (!(await tomarCupo(db, conv.cuenta, Number(conf.max_por_hora) > 0 ? Number(conf.max_por_hora) : MAX_POR_HORA))) razon = "cupo";
    /* Cuando hace falta una persona, igual se le avisa al cliente que lo van a atender (si el bot está permitido). */
    const aviso = r.requiere_humano && r.respuesta && conf.auto_activo === true && cta.auto === true;
    if (razon && !aviso) return refC.update(Object.assign(cambios, { estado_atencion: "por_atender" }));
    try {
        const mid = await enviarMensaje(db, conv, r.respuesta, g);
        const f = ahora();
        await db.collection("rs_mensaje").doc(conv.plataforma + "_" + (mid || "bot" + Date.now()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 300))
            .set({ conversacion: m.conversacion, de: "bot", texto: r.respuesta, fecha: f, mid, estado_envio: "enviado" });
        return refC.update(Object.assign(cambios, { estado_atencion: razon ? "por_atender" : "bot", ultimo_texto: r.respuesta.slice(0, 200), ultimo_de: "bot", fecha_ultimo: f }));
    } catch (e) {
        return refC.update(Object.assign(cambios, { estado_atencion: "por_atender", motivo: "No se pudo enviar la respuesta: " + String(e.message).slice(0, 200) }));
    }
}

/* El personal escribió desde el panel: se envía y el bot queda pausado en esa conversación. */
async function enviarDelPersonal(db, refM, m, deps) {
    const g = deps.graph || graph;
    const refC = db.collection("rs_conversacion").doc(m.conversacion);
    const c = await refC.get();
    if (!c.exists) return refM.update({ estado_envio: "error", error: "La conversación no existe." });
    const conv = c.data();
    if (conv.fecha_ultimo_cliente && Date.now() - Date.parse(conv.fecha_ultimo_cliente) > VENTANA_MS) {
        return refM.update({ estado_envio: "error", error: "Pasaron más de 24 horas desde el último mensaje del cliente: Meta no deja responder por aquí. Escríbale por WhatsApp o espere a que vuelva a escribir." });
    }
    try {
        const mid = await enviarMensaje(db, conv, String(m.texto || ""), g);
        await refM.update({ estado_envio: "enviado", mid });
        return refC.update({ ultimo_texto: String(m.texto).slice(0, 200), ultimo_de: "personal", fecha_ultimo: ahora(), bot: "pausado",
            estado_atencion: conv.estado_atencion === "atendido" ? "atendido" : "en_curso", no_leidos: 0 });
    } catch (e) {
        return refM.update({ estado_envio: "error", error: String(e.message).slice(0, 300) });
    }
}

/* ---------- Conectar páginas con el botón «Conectar con Facebook» ----------
   El panel guarda el acceso de corta duración que entrega Facebook; aquí se cambia por uno de larga duración,
   se guardan las páginas y sus cuentas de Instagram, y se las suscribe a los avisos de comentarios y mensajes. */
async function vincular(db, ref, v, deps) {
    const g = deps.graph || graph;
    const appId = deps.appId || META_APP_ID.value(), secreto = deps.appSecret || META_APP_SECRET.value();
    const pais = v.pais === "paraguay" ? "paraguay" : "bolivia";
    try {
        if (!appId || !secreto) throw new Error("Falta configurar la app de Meta (META_APP_ID y META_APP_SECRET).");
        const largo = await g("oauth/access_token?grant_type=fb_exchange_token&client_id=" + encodeURIComponent(appId) + "&client_secret=" + encodeURIComponent(secreto) + "&fb_exchange_token=" + encodeURIComponent(v.user_token), "");
        const paginas = await g("me/accounts?fields=id,name,access_token,instagram_business_account%7Bid,username%7D&limit=100", largo.access_token);
        const hechas = [], b = db.batch(), f = ahora();
        for (const p of paginas.data || []) {
            if (Array.isArray(v.paginas) && v.paginas.length && v.paginas.indexOf(p.id) < 0) continue;
            b.set(db.collection("rs_cuenta").doc(p.id), { plataforma: "facebook", pais, nombre: p.name, activa: true, auto: true, fecha_mod: f, mod_por: v.creado_por }, { merge: true });
            b.set(db.collection("rs_token").doc(p.id), { token: p.access_token, fecha_mod: f, mod_por: v.creado_por });
            hechas.push({ id: p.id, nombre: p.name, red: "facebook" });
            const ig = p.instagram_business_account;
            if (ig && ig.id) {
                b.set(db.collection("rs_cuenta").doc(ig.id), { plataforma: "instagram", pais, nombre: "@" + (ig.username || p.name), activa: true, auto: true, fecha_mod: f, mod_por: v.creado_por }, { merge: true });
                b.set(db.collection("rs_token").doc(ig.id), { token: p.access_token, fecha_mod: f, mod_por: v.creado_por });
                hechas.push({ id: ig.id, nombre: "@" + (ig.username || p.name), red: "instagram" });
            }
            try { await g(encodeURIComponent(p.id) + "/subscribed_apps", p.access_token, "POST", { subscribed_fields: "feed,messages,message_echoes" }); }
            catch (e) { console.warn("subscribed_apps", p.id, e.message); }
        }
        await b.commit();
        return ref.update({ user_token: admin.firestore.FieldValue.delete(), estado: hechas.length ? "conectado" : "sin_paginas", cuentas: hechas, fecha_fin: ahora(),
            error: hechas.length ? null : "Ese usuario de Facebook no administra ninguna página (o no dio permiso a las páginas)." });
    } catch (e) {
        return ref.update({ user_token: admin.firestore.FieldValue.delete(), estado: "error", error: String(e.message).slice(0, 300), fecha_fin: ahora() });
    }
}

/* ---------- Funciones publicadas ---------- */

const opcionesIA = { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: "256MiB", maxInstances: 5, retry: false };

exports.metaWebhook = onRequest({ region: REGION, secrets: [META_APP_SECRET, META_VERIFY_TOKEN, ig.IG_APP_ID, ig.IG_APP_SECRET], maxInstances: 5, timeoutSeconds: 30, memory: "256MiB" }, async (req, res) => {
    if (req.method === "GET") {
        const q = req.query || {};
        if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] && q["hub.verify_token"] === META_VERIFY_TOKEN.value()) return res.status(200).send(String(q["hub.challenge"] || ""));
        return res.status(403).send("No");
    }
    if (req.method !== "POST") return res.status(405).send("No");
    /* Los avisos vienen firmados con la clave de la app de Meta o con la de Instagram (conexión directa). */
    const firma = req.get("x-hub-signature-256");
    if (!firmaValida(req.rawBody, firma, META_APP_SECRET.value()) && !firmaValida(req.rawBody, firma, ig.IG_APP_SECRET.value())) return res.status(401).send("Firma no válida");
    try { await recibirAviso(admin.firestore(), req.body, {}); }
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

exports.rsMensajeNuevo = onDocumentCreated(Object.assign({ document: "rs_mensaje/{id}" }, opcionesIA), async (ev) => {
    const d = ev.data && ev.data.data();
    if (!d) return null;
    if (d.de === "cliente") return procesarMensaje(admin.firestore(), ev.data.ref, d, {});
    if (d.de === "personal" && d.estado_envio === "pendiente") return enviarDelPersonal(admin.firestore(), ev.data.ref, d, {});
    return null;
});

exports.rsVincular = onDocumentCreated({ document: "rs_vinculo/{id}", region: REGION, secrets: [META_APP_SECRET], timeoutSeconds: 60, memory: "256MiB", maxInstances: 2, retry: false }, async (ev) => {
    const d = ev.data && ev.data.data();
    if (!d || d.estado !== "nuevo" || !d.user_token) return null;
    return vincular(admin.firestore(), ev.data.ref, d, {});
});

exports._internos = { firmaValida, comentariosDelAviso, recibirAviso, procesar, publicarAprobado, alCambiar, tomarCupo,
    mensajesDelAviso, recibirMensajes, procesarMensaje, enviarDelPersonal, vincular };
