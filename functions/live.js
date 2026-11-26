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
/* Todo lo que se puede LEER del sistema de Calistenia (nada que escriba ni abra puertas). */
const CONSULTAS = ["reporte_ventas", "listar_ventas", "ver_venta", "listar_paquetes", "listar_servicios", "listar_sucursales", "ver_horarios",
    "buscar_cliente", "ver_cliente", "historial_paquetes_cliente", "asistencias_cliente", "progreso_cliente",
    "listar_clientes_activos", "clientes_por_vencer", "clientes_vencidos", "clientes_sin_asistir", "clientes_cumpleanos",
    "asistencia_del_dia", "reporte_asistencia", "comparar_asistencia", "detalle_asistencias", "frecuencia_asistencia", "asistencia_por_instructor", "ocupacion_por_horario",
    "cajas_abiertas", "listar_cajas", "ver_caja", "reporte_movimientos_caja", "listar_cuentas_banco", "movimientos_banco", "listar_pagos_qr", "listar_facturas",
    "listar_prorrogas", "reporte_traspasos", "reporte_paquetes_eliminados", "reporte_cambios_fecha", "reporte_convenios",
    "listar_molinetes", "estado_molinetes", "eventos_molinete", "reporte_accesos_molinete", "usuarios_en_molinete"];

function herramientas() {
    const fecha = { type: "STRING", description: "Fecha AAAA-MM-DD" };
    const rango = { desde: fecha, hasta: fecha };
    return [{ functionDeclarations: [
        { name: "resumen", description: "Panorama del día en una sola consulta: ventas de hoy, ventas del mes contra el mismo tramo del mes anterior, visitas de hoy contra el mismo día de la semana pasada y clientes activos. Úsala para «¿cómo vamos?», «¿qué tal el día?», «dame un resumen».",
          parameters: { type: "OBJECT", properties: {} } },
        { name: "ventas", description: "Ingresos por venta de paquetes cobrados en un rango de fechas. Agrupa por día, mes, sucursal, paquete, tipo de pago o cajero. Úsala para cualquier pregunta de ventas, ingresos, facturación, mejor sucursal o paquete, o comparación entre períodos (llamala una vez por período).",
          parameters: { type: "OBJECT", properties: { desde: fecha, hasta: fecha, agrupar_por: { type: "STRING", enum: ["dia", "mes", "sucursal", "paquete", "tipo_pago", "cajero"] } }, required: ["desde", "hasta", "agrupar_por"] } },
        { name: "asistencia_hoy", description: "Visitas de hoy: cuántas personas entraron, por sucursal, comparado con el mismo día de la semana pasada.",
          parameters: { type: "OBJECT", properties: {} } },
        { name: "asistencia", description: "Visitas en un rango de fechas, por día o por sucursal.",
          parameters: { type: "OBJECT", properties: Object.assign({ agrupar_por: { type: "STRING", enum: ["dia", "sucursal"] } }, rango), required: ["desde", "hasta", "agrupar_por"] } },
        { name: "horarios", description: "Ocupación por horario en un rango: qué horas se llenan y cuáles están vacías.",
          parameters: { type: "OBJECT", properties: rango, required: ["desde", "hasta"] } },
        { name: "clientes_activos", description: "Cuántos clientes tienen el plan vigente hoy, en total y por sucursal.",
          parameters: { type: "OBJECT", properties: {} } },
        { name: "clientes_por_vencer", description: "Clientes cuyo plan vence en los próximos N días y todavía no renovaron.",
          parameters: { type: "OBJECT", properties: { dias: { type: "INTEGER", description: "Días hacia adelante (1 a 30)" } }, required: ["dias"] } },
        { name: "clientes_vencidos", description: "Clientes cuyo plan venció en los últimos N días y no renovaron (para recuperar).",
          parameters: { type: "OBJECT", properties: { dias: { type: "INTEGER", description: "Días hacia atrás (1 a 180)" } }, required: ["dias"] } },
        { name: "cajas_abiertas", description: "Cajas abiertas ahora: sucursal, cajero, desde qué hora y cuánto tienen.",
          parameters: { type: "OBJECT", properties: {} } },
        { name: "pendientes", description: "Lo que el equipo tiene pendiente en el centro de mando: tareas urgentes, tareas que esperan a Dirección, fallas de mantenimiento abiertas, pagos de referidos por confirmar, referidos sin asignar, denuncias y sugerencias sin responder.",
          parameters: { type: "OBJECT", properties: {} } },
        { name: "consultar_sistema", description: "Acceso de LECTURA a todo el sistema de Calistenia, para cualquier dato que no cubran las otras herramientas. Herramientas: " +
            "reporte_ventas(desde,hasta,agrupar_por: dia|mes|sucursal|paquete|tipo_pago|cajero, key_sucursal?) · listar_ventas(desde,hasta,limite) · ver_venta(key_paquete_venta) · " +
            "listar_paquetes() · listar_servicios() · listar_sucursales() · ver_horarios(key_sucursal?) · " +
            "buscar_cliente(texto) · ver_cliente(key_usuario) · historial_paquetes_cliente(key_usuario) · asistencias_cliente(key_usuario,desde,hasta) · progreso_cliente(key_usuario) · " +
            "listar_clientes_activos(limite,offset) · clientes_por_vencer(dias,limite) · clientes_vencidos(dias,limite) · clientes_sin_asistir(dias,limite) · clientes_cumpleanos(desde?,hasta?) · " +
            "asistencia_del_dia(fecha) · reporte_asistencia(desde,hasta,agrupar_por: dia|sucursal) · comparar_asistencia(a_desde,a_hasta,b_desde,b_hasta) · detalle_asistencias(desde,hasta) · frecuencia_asistencia(desde,hasta,top) · asistencia_por_instructor(desde,hasta) · ocupacion_por_horario(desde,hasta) · " +
            "cajas_abiertas() · listar_cajas(desde,hasta) · ver_caja(key_caja) · reporte_movimientos_caja(desde,hasta,agrupar_por) · listar_cuentas_banco() · movimientos_banco(desde,hasta,limite) · listar_pagos_qr(desde,hasta) · listar_facturas(desde,hasta,limite) · " +
            "listar_prorrogas(desde,hasta) · reporte_traspasos(desde,hasta) · reporte_paquetes_eliminados(desde,hasta) · reporte_cambios_fecha(desde,hasta) · reporte_convenios(desde,hasta) · " +
            "listar_molinetes() · estado_molinetes(horas) · eventos_molinete(desde,hasta) · reporte_accesos_molinete(desde,hasta) · usuarios_en_molinete(). " +
            "Pasá los argumentos como JSON en argumentos_json (ej. {\"desde\":\"2026-11-01\",\"hasta\":\"2026-11-26\",\"agrupar_por\":\"cajero\"}). Podés llamarla varias veces y paginar con offset.",
          parameters: { type: "OBJECT", properties: { herramienta: { type: "STRING", enum: CONSULTAS }, argumentos_json: { type: "STRING", description: "Argumentos en JSON; {} si no lleva" } }, required: ["herramienta"] } },
        { name: "referidos", description: "Programa de referidos del mes: cuántos se anotaron, cuántos se vendieron, pagos por confirmar y los referidores que más traen.",
          parameters: { type: "OBJECT", properties: {} } }
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
        "Lo que consultas con las herramientas aparece solo en la pantalla como tarjeta. Por eso di solo lo importante (el total, el mejor y el peor, la diferencia) y, si hay más detalle, di «lo tiene en pantalla». Nunca leas listas largas.",
        "Si una herramienta responde sin_datos_paraguay, explica que ese dato todavía no está conectado en Paraguay.",
        "Para comparar períodos, consulta cada período y di la diferencia en porcentaje. «Este mes» va del día 1 a hoy; «el mes pasado», el mes calendario anterior.",
        "Puedes encadenar consultas sin pedir permiso. Si la pregunta es ambigua, elige lo más razonable y dilo.",
        "No tienes límites de datos: para cualquier cosa que no cubran las herramientas principales (un cliente puntual, un cajero, bancos, facturas, molinetes, prórrogas, traspasos, instructores, horarios de clases…) usa consultar_sistema. Si un resultado viene paginado y hace falta más, pide la página siguiente. Nunca digas que no tienes acceso sin haberlo intentado.",
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

/* Freno por usuario: 120 conversaciones por hora (por instancia), solo contra abusos. */
const uso = new Map();
function frenado(uid) {
    const u = uso.get(uid), ahora = Date.now();
    if (!u || ahora - u.desde > 3600000) { uso.set(uid, { n: 1, desde: ahora }); return false; }
    return ++u.n > 120;
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

exports._internos = { setupDe, crearToken, instrucciones, herramientas, CONSULTAS };
