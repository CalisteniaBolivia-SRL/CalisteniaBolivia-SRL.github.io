/* Puente de ingreso del centro de mando.
   El navegador manda el usuario y la contraseña del ERP (la contraseña ya cifrada con MD5, igual que la web
   del ERP). Esta función:
   1. Inicia sesión en el ERP (wss://serp.servisofts.com/ws/) con el mismo pedido que usa el portal.
   2. Lee los permisos del usuario en la página /centro_mando del ERP.
   3. Devuelve un token de Firebase con esos permisos (tableros), para que Firestore aplique sus reglas.
   No guarda contraseñas ni datos del usuario. */
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const WebSocket = require("ws");

admin.initializeApp();

const ERP_WS_URL = process.env.ERP_WS_URL || "wss://serp.servisofts.com/ws/";
const MARCA = "---SSofts---";
const PAGINA_CM = "/centro_mando";
const KEY_EMPRESA = "d4118f82-0b0a-44e3-8525-73df48be69db"; // Calistenia Bolivia en el ERP
const KEY_EMPRESA_PY = "3433c7d4-a626-44de-b825-f924334e679c"; // Calistenia Paraguay en el ERP
const TABLEROS = ["muro", "direccion", "administracion", "contabilidad", "atencion", "supervision", "marketing", "rrhh", "reportes", "legal", "atc", "jefe_atc", "accionistas", "mantenimiento"];
const DIAS_SESION = 30;
const ORIGENES = ["https://calisteniabolivia-srl.github.io"].concat(process.env.ORIGEN_EXTRA ? [process.env.ORIGEN_EXTRA] : []);

/* Freno simple por IP (por instancia): 10 intentos fallidos en 10 minutos. */
const fallos = new Map();
function bloqueado(ip) {
    const f = fallos.get(ip);
    return f && f.n >= 10 && Date.now() - f.desde < 10 * 60000;
}
function fallo(ip) {
    const f = fallos.get(ip);
    if (!f || Date.now() - f.desde > 10 * 60000) fallos.set(ip, { n: 1, desde: Date.now() });
    else f.n++;
}

function idUnico() { return require("crypto").randomUUID(); }

/* Inicia sesión en el ERP y lee las páginas/permisos del usuario. */
function loginERP(usuario, passwordMd5) {
    return new Promise((resolver, rechazar) => {
        let ws, buffer = "", enviado = false, pidiendo = false, terminado = false, login = null;
        const idLogin = idUnico(), idPermisos = idUnico(), idPermisosPY = idUnico();
        let paginasBO = null;
        const fin = () => { terminado = true; clearTimeout(reloj); try { ws.close(); } catch (e) {} };
        const fallar = (codigo) => { if (terminado) return; fin(); rechazar(Object.assign(new Error(codigo), { codigo })); };
        let reloj = setTimeout(() => fallar("tiempo"), 40000);
        try { ws = new WebSocket(ERP_WS_URL); } catch (e) { return fallar("conexion"); }
        ws.on("error", () => fallar("conexion"));
        ws.on("close", () => { if (!terminado) fallar("conexion"); });
        ws.on("message", (datos) => {
            buffer += datos.toString();
            let i;
            while ((i = buffer.indexOf(MARCA)) >= 0) {
                const crudo = buffer.slice(0, i).split("---SSkey---")[0];
                buffer = buffer.slice(i + MARCA.length);
                let m;
                try { m = JSON.parse(crudo); } catch (e) { continue; }
                if (!enviado && m.component === "servicio" && m.type === "init") {
                    enviado = true;
                    ws.send(JSON.stringify({ service: "usuario", component: "usuario", version: "2.0", type: "login", estado: "cargando",
                        data: { usuario: usuario, password: passwordMd5 }, _ssocket_promise: idLogin }) + "\n");
                } else if (enviado && !pidiendo && (m._ssocket_promise === idLogin || (m.component === "usuario" && m.type === "login"))) {
                    if (m.estado === "error") return fallar("credenciales");
                    if (m.estado !== "exito") continue;
                    login = m.data || {};
                    const key = login.key || login.key_usuario;
                    if (!key) return fallar("credenciales");
                    pidiendo = true;
                    clearTimeout(reloj);
                    reloj = setTimeout(() => fallar("permisos"), 15000);
                    ws.send(JSON.stringify({ version: "1.0", service: "roles_permisos", component: "usuarioPage", type: "getAll", estado: "cargando",
                        key_usuario: key, key_empresa: KEY_EMPRESA, _ssocket_promise: idPermisos }) + "\n");
                } else if (pidiendo && paginasBO === null && (m._ssocket_promise === idPermisos || (m.component === "usuarioPage" && m.type === "getAll"))) {
                    if (m.estado !== "exito") { fin(); return rechazar(Object.assign(new Error("permisos"), { codigo: "permisos" })); }
                    paginasBO = m.data || {};
                    /* Después, los permisos del mismo usuario en el ERP de Paraguay (si no responde, sigue sin ellos). */
                    clearTimeout(reloj);
                    reloj = setTimeout(() => { if (!terminado) { fin(); resolver({ login, paginas: paginasBO, paginasPY: {} }); } }, 8000);
                    ws.send(JSON.stringify({ version: "1.0", service: "roles_permisos", component: "usuarioPage", type: "getAll", estado: "cargando",
                        key_usuario: login.key || login.key_usuario, key_empresa: KEY_EMPRESA_PY, _ssocket_promise: idPermisosPY }) + "\n");
                } else if (pidiendo && paginasBO !== null && (m._ssocket_promise === idPermisosPY || (m.component === "usuarioPage" && m.type === "getAll"))) {
                    fin();
                    resolver({ login, paginas: paginasBO, paginasPY: m.estado === "exito" ? (m.data || {}) : {} });
                }
            }
        });
    });
}

/* Misma regla que el portal: tableros con permiso en /centro_mando; "todo" equivale a todos. */
function permisosERP(paginas) {
    let p = null;
    Object.keys(paginas || {}).forEach((k) => { const v = paginas[k]; if (v && (v.url === PAGINA_CM || k === PAGINA_CM)) p = v; });
    const permisos = (p && p.permisos) || {};
    const t = permisos.todo ? TABLEROS.slice() : TABLEROS.filter((t) => !!permisos[t]);
    /* La página /accionistas (cualquier permiso) da solo ingresos en vivo. */
    const acc = Object.keys(paginas || {}).map((k) => paginas[k]).find((v, i) => v && (v.url === "/accionistas" || Object.keys(paginas)[i] === "/accionistas"));
    if (acc && acc.permisos && Object.keys(acc.permisos).length && t.indexOf("accionistas") < 0) t.push("accionistas");
    return t;
}

function nombreDe(d, usuario) {
    const n = [d.Nombres || d.nombres || d.nombre || "", d.Apellidos || d.apellidos || ""].join(" ").replace(/\s+/g, " ").trim();
    return (n || usuario).slice(0, 120);
}

async function ingresar(usuario, passwordMd5) {
    const r = await loginERP(usuario, passwordMd5);
    const uid = String(r.login.key || r.login.key_usuario);
    const tableros = permisosERP(r.paginas);
    const tableros_py = permisosERP(r.paginasPY || {});
    const nombre = nombreDe(r.login, usuario);
    const vence = Date.now() + DIAS_SESION * 86400000;
    /* cm: sesión del centro de mando (solo con permisos en /centro_mando). ref: cualquier usuario del ERP, para su
       panel de «Mis referidos» (las reglas de Firestore no le dan nada más). */
    const cm = tableros.length || tableros_py.length ? 1 : 0;
    /* Crea el usuario de Firebase del lado del servidor (así se puede cerrar el registro libre de cuentas).
       Si falla, no corta el ingreso: solo lo deja anotado. */
    await admin.auth().getUser(uid).catch((e) => e.code === "auth/user-not-found" ? admin.auth().createUser({ uid }) : null).catch((e) => console.warn("erpLogin crear usuario", e.code || e.message));
    const token = await admin.auth().createCustomToken(uid, { cm, ref: 1, tableros, tableros_py, nombre, usuario: usuario.slice(0, 80), vence });
    return { token, uid, nombre, tableros, tableros_py, vence };
}

exports.erpLogin = onRequest({ region: "southamerica-east1", cors: ORIGENES, maxInstances: 5, timeoutSeconds: 60, memory: "256MiB" }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Solo POST." });
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    if (bloqueado(ip)) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });
    const b = req.body || {};
    const usuario = typeof b.usuario === "string" ? b.usuario.trim() : "";
    const md5 = typeof b.password_md5 === "string" ? b.password_md5.toLowerCase() : "";
    if (!usuario || usuario.length > 80 || !/^[a-f0-9]{32}$/.test(md5)) return res.status(400).json({ error: "Datos de ingreso no válidos." });
    try {
        const r = await ingresar(usuario, md5);
        /* Sin permisos en /centro_mando igual entra, solo a su panel de referidos (ref). */
        return res.json({ token: r.token, nombre: r.nombre, tableros: r.tableros, tableros_py: r.tableros_py, vence: r.vence, solo_referidos: !r.tableros.length && !r.tableros_py.length });
    } catch (e) {
        if (e.codigo === "credenciales") { fallo(ip); return res.status(401).json({ error: "Usuario o contraseña incorrectos." }); }
        if (e.codigo === "permisos") return res.status(502).json({ error: "No se pudieron leer los permisos del ERP." });
        console.error("erpLogin", e.codigo || e.message);
        return res.status(502).json({ error: "No se pudo conectar con el ERP. Intenta de nuevo." });
    }
});

exports._internos = { loginERP, permisosERP, ingresar };

/* Redes sociales: respuestas automáticas a comentarios (redes.js). */
const redes = require("./redes");
exports.metaWebhook = redes.metaWebhook;
exports.rsNuevoComentario = redes.rsNuevoComentario;
exports.rsComentarioCambio = redes.rsComentarioCambio;
exports.rsMensajeNuevo = redes.rsMensajeNuevo;
exports.rsVincular = redes.rsVincular;
exports.igConectar = require("./redes-ig").igConectar;

/* Asistente «Capital Corp» de la pantalla central del muro (asistente.js). */
exports.asistente = require("./asistente").asistente;

/* Asistente de voz en tiempo real (Gemini Live): entrega el token temporal. */
exports.liveToken = require("./live").liveToken;
