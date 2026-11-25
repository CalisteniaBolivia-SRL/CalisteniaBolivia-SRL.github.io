/* =====================================================================================================
   Conexión directa de Instagram («Instagram API with Instagram Login»): sin página de Facebook ni portafolio.
   1. El panel de Redes (permiso marketing o Dirección) pide la dirección de autorización (POST con su sesión).
   2. Instagram muestra su propia pantalla: se entra con el usuario de Instagram de la empresa y se toca «Permitir».
   3. Instagram vuelve a esta función con un código: se cambia por un acceso de larga duración (60 días), se guarda
      la cuenta (rs_cuenta) y su acceso (rs_token, api: "instagram"; solo lo lee el servidor) y se la suscribe a los
      avisos de comentarios y mensajes. Desde ahí, metaWebhook y las respuestas automáticas funcionan igual que antes.
   4. El acceso se renueva solo cuando tiene más de 20 días (tokenDe).
   Claves en Secret Manager: IG_APP_ID e IG_APP_SECRET (de la app de Meta, producto «Instagram»).
   ===================================================================================================== */
const crypto = require("crypto");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

if (!admin.apps.length) admin.initializeApp();
const IG_APP_ID = defineSecret("IG_APP_ID");
const IG_APP_SECRET = defineSecret("IG_APP_SECRET");
const REGION = "southamerica-east1";
const IG_GRAPH = "https://graph.instagram.com/v21.0";
const REDIRECCION = "https://southamerica-east1-centro-de-comando-a57cf.cloudfunctions.net/igConectar";
const PANEL = "https://calisteniabolivia-srl.github.io/dashboard/redes.html";
const ORIGENES = ["https://calisteniabolivia-srl.github.io"].concat(process.env.ORIGEN_EXTRA ? [process.env.ORIGEN_EXTRA] : []);
const PERMISOS = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments";
const RENOVAR_DIAS = 20;
const ahora = () => new Date().toISOString();

async function pedir(url, opts) {
    const r = await fetch(url, opts || {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error || j.error_message) {
        const m = (j.error && (j.error.message || j.error)) || j.error_message || ("Instagram " + r.status);
        throw Object.assign(new Error(String(m)), { status: r.status });
    }
    return j;
}

/* Quién puede conectar: Marketing o Dirección (Bolivia) o Marketing de Paraguay, con sesión vigente del centro de mando. */
async function verificar(req, pais) {
    const m = /^Bearer\s+(.+)$/.exec(String(req.get("authorization") || ""));
    if (!m) return null;
    try {
        const t = await admin.auth().verifyIdToken(m[1]);
        if (t.cm !== 1 || !(Number(t.vence) > Date.now())) return null;
        const bo = t.tableros || [], py = t.tableros_py || [];
        const ok = bo.indexOf("marketing") >= 0 || bo.indexOf("direccion") >= 0 || (pais === "paraguay" && py.indexOf("marketing") >= 0);
        return ok ? t : null;
    } catch (e) { return null; }
}

function volverAlPanel(res, pais, params) {
    const q = new URLSearchParams(Object.assign(pais === "paraguay" ? { pais: "paraguay" } : {}, params));
    return res.redirect(302, PANEL + "?" + q.toString() + "#config");
}

/* Acceso vigente de una cuenta; si es de Instagram directo y tiene más de 20 días, se renueva (dura 60). */
async function tokenDe(db, cuenta, deps) {
    const ref = db.collection("rs_token").doc(String(cuenta));
    const d = await ref.get();
    if (!d.exists) return { token: "", api: "facebook" };
    const v = d.data(), api = v.api === "instagram" ? "instagram" : "facebook";
    if (api === "instagram" && v.token && v.fecha_token && Date.now() - Date.parse(v.fecha_token) > RENOVAR_DIAS * 86400000) {
        try {
            const j = await ((deps && deps.pedir) || pedir)("https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(v.token));
            if (j.access_token) {
                await ref.set({ token: j.access_token, fecha_token: ahora(), vence: new Date(Date.now() + (Number(j.expires_in) || 5184000) * 1000).toISOString() }, { merge: true });
                return { token: j.access_token, api };
            }
        } catch (e) { console.warn("ig: no se pudo renovar el acceso de", cuenta, e.message); }
    }
    return { token: v.token || "", api };
}

/* Del código que devuelve Instagram a la cuenta guardada y suscrita. */
async function completar(db, codigo, estadoDoc, deps) {
    const p = (deps && deps.pedir) || pedir;
    const appId = deps && deps.appId != null ? deps.appId : IG_APP_ID.value(), secreto = deps && deps.appSecret != null ? deps.appSecret : IG_APP_SECRET.value();
    const corto = await p("https://api.instagram.com/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: appId, client_secret: secreto, grant_type: "authorization_code", redirect_uri: REDIRECCION, code: codigo }).toString() });
    const tokCorto = corto.access_token || (Array.isArray(corto.data) && corto.data[0] && corto.data[0].access_token);
    if (!tokCorto) throw new Error("Instagram no entregó el acceso.");
    const largo = await p("https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=" + encodeURIComponent(secreto) + "&access_token=" + encodeURIComponent(tokCorto));
    const token = largo.access_token || tokCorto;
    const yo = await p(IG_GRAPH + "/me?fields=user_id,username,name&access_token=" + encodeURIComponent(token));
    const id = String(yo.user_id || yo.id || "");
    if (!id) throw new Error("No se pudo leer la cuenta de Instagram.");
    const pais = estadoDoc.pais === "paraguay" ? "paraguay" : "bolivia", f = ahora(), nombre = "@" + (yo.username || yo.name || id);
    const b = db.batch();
    b.set(db.collection("rs_cuenta").doc(id), { plataforma: "instagram", pais, nombre, activa: true, auto: true, conexion: "instagram_directo", fecha_mod: f, mod_por: estadoDoc.uid || null }, { merge: true });
    b.set(db.collection("rs_token").doc(id), { token, api: "instagram", fecha_token: f, vence: new Date(Date.now() + (Number(largo.expires_in) || 5184000) * 1000).toISOString(), fecha_mod: f, mod_por: estadoDoc.uid || null });
    await b.commit();
    let suscrita = true;
    try { await p(IG_GRAPH + "/me/subscribed_apps?subscribed_fields=comments,messages&access_token=" + encodeURIComponent(token), { method: "POST" }); }
    catch (e) { suscrita = false; console.warn("ig: subscribed_apps", e.message); }
    return { id, nombre, pais, suscrita };
}

exports.igConectar = onRequest({ region: REGION, cors: ORIGENES, secrets: [IG_APP_ID, IG_APP_SECRET], maxInstances: 2, timeoutSeconds: 60, memory: "256MiB" }, async (req, res) => {
    const db = admin.firestore();
    /* 1) El panel pide la dirección de autorización. */
    if (req.method === "POST") {
        const pais = req.body && req.body.pais === "paraguay" ? "paraguay" : "bolivia";
        const t = await verificar(req, pais);
        if (!t) return res.status(401).json({ error: "Sesión vencida o sin permiso (Marketing o Dirección). Salí y volvé a entrar con tu usuario del ERP." });
        if (!IG_APP_ID.value() || !IG_APP_SECRET.value()) return res.status(500).json({ error: "Falta cargar las claves de la app de Instagram (IG_APP_ID e IG_APP_SECRET)." });
        const estado = crypto.randomBytes(24).toString("hex");
        await db.collection("rs_ig_estado").doc(estado).set({ uid: t.uid, pais, fecha: ahora(), vence: Date.now() + 15 * 60000 });
        const url = "https://www.instagram.com/oauth/authorize?" + new URLSearchParams({ enable_fb_login: "0", force_authentication: "1", client_id: IG_APP_ID.value(),
            redirect_uri: REDIRECCION, response_type: "code", scope: PERMISOS, state: estado }).toString();
        return res.json({ url });
    }
    if (req.method !== "GET") return res.status(405).send("No");
    /* 2) Instagram vuelve con el código (o con el aviso de que se canceló). */
    const q = req.query || {};
    const ref = q.state && /^[a-f0-9]{48}$/.test(String(q.state)) ? db.collection("rs_ig_estado").doc(String(q.state)) : null;
    const ed = ref ? await ref.get() : null;
    if (!ed || !ed.exists || !(Number(ed.data().vence) > Date.now())) return volverAlPanel(res, "bolivia", { ig: "error", motivo: "La autorización venció o no es válida. Volvé a tocar «Conectar Instagram»." });
    const estadoDoc = ed.data();
    await ref.delete().catch(() => {});
    if (q.error || !q.code) return volverAlPanel(res, estadoDoc.pais, { ig: "error", motivo: q.error_description || "Se canceló la conexión en Instagram." });
    try {
        const r = await completar(db, String(q.code).replace(/#_$/, ""), estadoDoc);
        return volverAlPanel(res, r.pais, { ig: r.suscrita ? "ok" : "sin_avisos", cuenta: r.nombre });
    } catch (e) {
        console.error("igConectar", e.message);
        return volverAlPanel(res, estadoDoc.pais, { ig: "error", motivo: String(e.message).slice(0, 200) });
    }
});

exports._internos = { tokenDe, completar, verificar, IG_GRAPH, REDIRECCION };
exports.IG_APP_ID = IG_APP_ID;
exports.IG_APP_SECRET = IG_APP_SECRET;
