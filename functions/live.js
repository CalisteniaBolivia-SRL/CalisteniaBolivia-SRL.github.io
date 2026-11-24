/* =====================================================================================================
   Capital Corp · asistente de voz en tiempo real (Gemini Live).
   El navegador habla directo con Gemini Live por WebSocket (voz a voz, con pausas e interrupciones naturales).
   Esta función solo entrega un TOKEN TEMPORAL (un uso, 30 minutos): la clave de Google (secreto GEMINI_API_KEY)
   nunca sale del servidor. El token viene con la configuración BLOQUEADA (modelo, voz, instrucciones y
   herramientas), para que nadie pueda usarlo para otra cosa.
   Pueden usarlo: muro, Dirección e inversionistas (permiso «accionistas»), de Bolivia o de Paraguay.
   ===================================================================================================== */
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");

if (!admin.apps.length) admin.initializeApp();
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const MODELO = defineString("GEMINI_LIVE_MODEL", { default: "gemini-3.8-live" });
const VOZ = defineString("GEMINI_LIVE_VOZ", { default: "Charon" });
const ORIGENES = ["https://calisteniabolivia-srl.github.io"].concat(process.env.ORIGEN_EXTRA ? [process.env.ORIGEN_EXTRA] : []);
const PERMITIDOS = ["muro", "direccion", "accionistas"];
const API = "https://generativelanguage.googleapis.com/v1beta";

/* Herramientas que el asistente puede pedir; las ejecuta el navegador con la sesión de datos del usuario
   (Bolivia: sistema de Calistenia; Paraguay: ERP de Paraguay). Nunca ven más de lo que ve el usuario. */
function herramientas() {
    const fecha = { type: "STRING", description: "Fecha AAAA-MM-DD" };
    return [{ functionDeclarations: [
        { name: "ventas", description: "Ingresos por venta de paquetes cobrados en un rango de fechas. Agrupa por día, mes, sucursal, paquete, tipo de pago o cajero. Úsala para cualquier pregunta de ventas, ingresos, facturación o comparación entre períodos o sucursales.",
          parameters: { type: "OBJECT", properties: { desde: fecha, hasta: fecha, agrupar_por: { type: "STRING", enum: ["dia", "mes", "sucursal", "paquete", "tipo_pago", "cajero"] } }, required: ["desde", "hasta", "agrupar_por"] } },
        { name: "asistencia_hoy", description: "Visitas de hoy: cuántas personas entraron, por sucursal y por hora, comparado con un día igual.",
          parameters: { type: "OBJECT", properties: {} } },
        { name: "clientes_por_vencer", description: "Clientes cuyo plan vence en los próximos N días y todavía no renovaron.",
          parameters: { type: "OBJECT", properties: { dias: { type: "INTEGER", description: "Días hacia adelante (1 a 30)" } }, required: ["dias"] } },
        { name: "clientes_vencidos", description: "Clientes cuyo plan venció en los últimos N días y no renovaron (para recuperar).",
          parameters: { type: "OBJECT", properties: { dias: { type: "INTEGER", description: "Días hacia atrás (1 a 180)" } }, required: ["dias"] } }
    ] }];
}

function instrucciones(o) {
    const py = o.pais === "paraguay";
    return [
        "Eres «Capital», el asistente personal de voz del grupo Capital Corp (gimnasios Calistenia Company en Bolivia y Paraguay). Tu estilo es el de Jarvis: un mayordomo ejecutivo brillante, sereno, elegante, con calidez y un toque de humor fino.",
        "Hablas en español latinoamericano neutro, natural y conversacional, como una persona real: frases cortas, pausas naturales, sin listas ni números leídos como tabla. Tratas de usted. Al director, José Miguel Parada, le dices «señor», nunca su nombre.",
        "Escuchas con paciencia: si la persona hace una pausa, esperas; si te interrumpe, te callas y atiendes lo nuevo. Si no entendiste, pides que lo repita en pocas palabras.",
        "Respuestas breves: primero la respuesta en una frase; el detalle solo si lo piden. Nunca inventes cifras: para datos de la empresa usa SIEMPRE las herramientas, y si una herramienta no tiene el dato, dilo con naturalidad.",
        "Al saludar, solo saluda y ofrece ayuda; no des datos que nadie pidió.",
        "Montos " + (py ? "en guaraníes, redondeados («unos treinta y dos millones de guaraníes»)" : "en bolivianos, redondeados («unos cuarenta y dos mil bolivianos»)") + "; porcentajes enteros.",
        "País de esta sesión: " + (py ? "Paraguay (una sucursal en Asunción)" : "Bolivia (sucursales en Santa Cruz de la Sierra)") + ". Hoy es " + o.hoy + " (zona " + (py ? "America/Asuncion" : "America/La_Paz") + ").",
        o.nombre ? "Usuario conectado: " + o.nombre + "." : ""
    ].filter(Boolean).join("\n");
}

async function verificar(req) {
    const m = /^Bearer\s+(.+)$/.exec(String(req.get("authorization") || ""));
    if (!m) return null;
    try {
        const t = await admin.auth().verifyIdToken(m[1]);
        if (t.cm !== 1 || !(Number(t.vence) > Date.now())) return null;
        const tab = [].concat(t.tableros || [], t.tableros_py || []);
        return PERMITIDOS.some((p) => tab.indexOf(p) >= 0) ? t : null;
    } catch (e) { return null; }
}

/* Freno por usuario: 20 conversaciones por hora (por instancia). */
const uso = new Map();
function frenado(uid) {
    const u = uso.get(uid), ahora = Date.now();
    if (!u || ahora - u.desde > 3600000) { uso.set(uid, { n: 1, desde: ahora }); return false; }
    return ++u.n > 20;
}

function setupDe(o) {
    return {
        model: "models/" + o.modelo,
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voz } }, languageCode: "es-US" } },
        systemInstruction: { parts: [{ text: instrucciones(o) }] },
        tools: herramientas()
    };
}

async function crearToken(o, clave, fetchFn) {
    const ahora = Date.now();
    const cuerpo = { uses: 1, expireTime: new Date(ahora + 30 * 60000).toISOString(), newSessionExpireTime: new Date(ahora + 2 * 60000).toISOString(), bidiGenerateContentSetup: setupDe(o) };
    const r = await (fetchFn || fetch)(API + "/auth_tokens?key=" + encodeURIComponent(clave), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const txt = await r.text();
    if (!r.ok) { const e = new Error("Gemini " + r.status + ": " + txt.slice(0, 300)); e.status = r.status; throw e; }
    const d = JSON.parse(txt);
    if (!d.name) throw new Error("Gemini no devolvió el token.");
    return d.name;
}

exports.liveToken = onRequest({ region: "southamerica-east1", cors: ORIGENES, secrets: [GEMINI_API_KEY], maxInstances: 3, timeoutSeconds: 30, memory: "256MiB" }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Solo POST." });
    const t = await verificar(req);
    if (!t) return res.status(401).json({ error: "Sesión del centro de mando vencida o sin permiso (muro, Dirección o accionistas). Salí y volvé a ingresar con tu usuario del ERP." });
    if (frenado(t.uid)) return res.status(429).json({ error: "Demasiadas conversaciones seguidas. Probá en unos minutos." });
    const b = req.body || {};
    const pais = b.pais === "paraguay" ? "paraguay" : "bolivia";
    const hoy = new Date().toLocaleDateString("es-BO", { timeZone: pais === "paraguay" ? "America/Asuncion" : "America/La_Paz", weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const o = { modelo: MODELO.value() || "gemini-3.8-live", voz: VOZ.value() || "Charon", pais, hoy, nombre: String(t.nombre || "").slice(0, 80) };
    try {
        const token = await crearToken(o, GEMINI_API_KEY.value());
        return res.json({ token, modelo: o.modelo, setup: setupDe(o) });
    } catch (e) {
        console.error("liveToken", e.message);
        return res.status(502).json({ error: "No se pudo abrir la conversación con Google (" + (e.status || "error") + ")." });
    }
});

exports._internos = { setupDe, crearToken, instrucciones, herramientas };
