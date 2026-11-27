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

/* Inicia sesión en el ERP y lee, en el mismo socket y en orden: las páginas/permisos del usuario en Bolivia y en
   Paraguay, y sus ROLES del ERP (con el nombre de cada rol de las dos empresas). Lo de Paraguay y los roles son
   opcionales: si no responden a tiempo, el ingreso sigue sin ellos. */
function loginERP(usuario, passwordMd5) {
    return new Promise((resolver, rechazar) => {
        let ws, buffer = "", terminado = false;
        const esperando = [];
        const fin = () => { terminado = true; clearTimeout(reloj); try { ws.close(); } catch (e) {} };
        const fallar = (codigo) => { if (terminado) return; fin(); rechazar(Object.assign(new Error(codigo), { codigo })); };
        let reloj = setTimeout(() => fallar("tiempo"), 45000);
        /* La respuesta se reconoce por su _ssocket_promise; si el ERP no lo devuelve, por componente y tipo
           (solo cuando hay un único pedido de ese tipo esperando). */
        const pedir = (msg, ms) => new Promise((ok) => {
            const id = idUnico();
            const e = { id, component: msg.component, type: msg.type };
            const quitar = () => { const i = esperando.indexOf(e); if (i >= 0) esperando.splice(i, 1); };
            const t = setTimeout(() => { quitar(); ok(null); }, ms);
            e.ok = (m) => { clearTimeout(t); quitar(); ok(m); };
            esperando.push(e);
            ws.send(JSON.stringify(Object.assign({ version: "1.0", estado: "cargando", _ssocket_promise: id }, msg)) + "\n");
        });
        const flujo = async () => {
            const l = await pedir({ service: "usuario", component: "usuario", version: "2.0", type: "login", data: { usuario: usuario, password: passwordMd5 } }, 30000);
            if (!l) return fallar("tiempo");
            if (l.estado !== "exito") return fallar("credenciales");
            const login = l.data || {};
            const key = login.key || login.key_usuario;
            if (!key) return fallar("credenciales");
            const bo = await pedir({ service: "roles_permisos", component: "usuarioPage", type: "getAll", key_usuario: key, key_empresa: KEY_EMPRESA }, 15000);
            if (!bo || bo.estado !== "exito") return fallar("permisos");
            /* Paraguay y los roles (los de cada empresa, con su nombre, y los del usuario), a la vez. */
            const [py, rolesBO, rolesPY, mios] = await Promise.all([
                pedir({ service: "roles_permisos", component: "usuarioPage", type: "getAll", key_usuario: key, key_empresa: KEY_EMPRESA_PY }, 8000),
                pedir({ service: "roles_permisos", component: "rol", type: "getAll", key_empresa: KEY_EMPRESA }, 6000),
                pedir({ service: "roles_permisos", component: "rol", type: "getAll", key_empresa: KEY_EMPRESA_PY }, 6000),
                pedir({ service: "roles_permisos", component: "usuarioRol", type: "getAllByUsuarios", keys: [key] }, 6000)
            ]);
            const ex = (m) => (m && m.estado === "exito" ? m.data : null);
            fin();
            resolver({ login, paginas: bo.data || {}, paginasPY: ex(py) || {}, roles: rolesDelERP(key, ex(rolesBO), ex(rolesPY), ex(mios)) });
        };
        try { ws = new WebSocket(ERP_WS_URL); } catch (e) { return fallar("conexion"); }
        ws.on("error", () => fallar("conexion"));
        ws.on("close", () => { if (!terminado) fallar("conexion"); });
        let arranco = false;
        ws.on("message", (datos) => {
            buffer += datos.toString();
            let i;
            while ((i = buffer.indexOf(MARCA)) >= 0) {
                const crudo = buffer.slice(0, i).split("---SSkey---")[0];
                buffer = buffer.slice(i + MARCA.length);
                let m;
                try { m = JSON.parse(crudo); } catch (e) { continue; }
                if (!arranco && m.component === "servicio" && m.type === "init") { arranco = true; flujo().catch(() => fallar("conexion")); continue; }
                let e = esperando.find((x) => x.id === m._ssocket_promise);
                if (!e) { const mismos = esperando.filter((x) => x.component === m.component && x.type === m.type); if (mismos.length === 1) e = mismos[0]; }
                if (e) e.ok(m);
            }
        });
    });
}

/* Lista de filas de una respuesta del ERP (objeto por key, lista, o anidado un nivel). */
function filas(d) {
    const out = [];
    const ver = (x, prof) => {
        if (!x || typeof x !== "object" || prof > 3) return;
        if (Array.isArray(x)) return x.forEach((y) => ver(y, prof + 1));
        if (x.key_rol || x.descripcion || x.key) { if (typeof x.key === "string" || x.key_rol) out.push(x); }
        if (!x.key_rol && !(typeof x.key === "string" && x.descripcion)) Object.keys(x).forEach((k) => { if (x[k] && typeof x[k] === "object") ver(x[k], prof + 1); });
    };
    ver(d, 0);
    return out;
}
const vigente = (x) => x.estado == null || Number(x.estado) > 0;
/* Roles del ERP: todos los de cada empresa ({key: nombre}) y los del usuario en cada una. */
function rolesDelERP(keyUsuario, dataBO, dataPY, dataMios) {
    const lista = (d) => { const r = {}; filas(d).forEach((x) => { if (typeof x.key === "string" && x.descripcion && !x.key_rol && vigente(x)) r[x.key] = String(x.descripcion).slice(0, 80); }); return r; };
    const bolivia = lista(dataBO), paraguay = lista(dataPY);
    const mios = filas(dataMios).filter((x) => x.key_rol && vigente(x) && (!x.key_usuario || x.key_usuario === keyUsuario)).map((x) => x.key_rol);
    return {
        bolivia, paraguay,
        mios_bo: [...new Set(mios.filter((k) => bolivia[k]))],
        mios_py: [...new Set(mios.filter((k) => paraguay[k]))],
        leidos: dataBO != null && dataMios != null
    };
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

/* Lo que cada rol del ERP puede ver lo elige Dirección en roles.html (colección cm_rol_cfg, una por rol):
   módulos visibles y los permisos de datos que esos módulos necesitan. Se suma a los permisos de /centro_mando. */
async function porRoles(rolesBO, rolesPY) {
    const db = admin.firestore();
    const leer = async (keys) => {
        if (!keys || !keys.length) return null;
        const docs = await Promise.all(keys.map((k) => db.collection("cm_rol_cfg").doc(k).get().catch(() => null)));
        const con = docs.filter((d) => d && d.exists && Array.isArray(d.data().modulos));
        if (!con.length) return null;   // ningún rol suyo configurado: sigue con los permisos del ERP
        const modulos = new Set(), tableros = new Set();
        con.forEach((d) => { (d.data().modulos || []).forEach((m) => modulos.add(String(m))); (d.data().tableros || []).forEach((t) => { if (TABLEROS.indexOf(t) >= 0) tableros.add(t); }); });
        return { modulos: [...modulos], tableros: [...tableros] };
    };
    const [bo, py] = await Promise.all([leer(rolesBO), leer(rolesPY)]);
    return { bolivia: bo, paraguay: py };
}
const unir = (a, b) => [...new Set((a || []).concat(b || []))];

/* Arma el token de la sesión con los permisos del ERP guardados al ingresar + lo que Dirección eligió para sus roles. */
async function sesionDe(uid, vence) {
    const u = await admin.firestore().collection("cm_usuario").doc(uid).get();
    if (!u.exists) return null;
    const d = u.data();
    const r = await porRoles(d.roles_bo, d.roles_py);
    const tableros = unir(d.erp_bo, r.bolivia && r.bolivia.tableros);
    const tableros_py = unir(d.erp_py, r.paraguay && r.paraguay.tableros);
    const cm = tableros.length || tableros_py.length ? 1 : 0;
    const token = await admin.auth().createCustomToken(uid, { cm, ref: 1, tableros, tableros_py, nombre: d.nombre, usuario: d.usuario, vence });
    return { token, uid, nombre: d.nombre, tableros, tableros_py, vence,
        rol_tableros: (r.bolivia && r.bolivia.tableros) || [], rol_tableros_py: (r.paraguay && r.paraguay.tableros) || [],
        modulos: { bolivia: r.bolivia ? r.bolivia.modulos : null, paraguay: r.paraguay ? r.paraguay.modulos : null } };
}

async function ingresar(usuario, passwordMd5) {
    const r = await loginERP(usuario, passwordMd5);
    const uid = String(r.login.key || r.login.key_usuario);
    const nombre = nombreDe(r.login, usuario);
    const db = admin.firestore();
    /* Crea el usuario de Firebase del lado del servidor (así se puede cerrar el registro libre de cuentas).
       Si falla, no corta el ingreso: solo lo deja anotado. */
    await admin.auth().getUser(uid).catch((e) => e.code === "auth/user-not-found" ? admin.auth().createUser({ uid }) : null).catch((e) => console.warn("erpLogin crear usuario", e.code || e.message));
    /* Lo que trae el ERP queda guardado (sin contraseña) para poder renovar la sesión cuando Dirección cambia un rol. */
    const ficha = { nombre, usuario: usuario.slice(0, 80), erp_bo: permisosERP(r.paginas), erp_py: permisosERP(r.paginasPY || {}), visto: new Date().toISOString() };
    const ro = r.roles;
    if (ro.leidos) { ficha.roles_bo = ro.mios_bo; ficha.roles_py = ro.mios_py; }
    await db.collection("cm_usuario").doc(uid).set(ficha, { merge: true });
    /* Lista de roles de cada ERP, para que Dirección elija qué ve cada uno (solo se escribe si cambió). */
    if (ro.leidos) await Promise.all([["bolivia", ro.bolivia], ["paraguay", ro.paraguay]].map(async ([pais, roles]) => {
        if (!Object.keys(roles).length) return;
        const ref = db.collection("cm_roles").doc(pais), ant = await ref.get().catch(() => null);
        if (ant && ant.exists && JSON.stringify(ant.data().roles || {}) === JSON.stringify(roles)) return;
        await ref.set({ roles, actualizado: new Date().toISOString() });
    })).catch((e) => console.warn("erpLogin roles", e.message));
    return sesionDe(uid, Date.now() + DIAS_SESION * 86400000);
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
        return res.json({ token: r.token, nombre: r.nombre, tableros: r.tableros, tableros_py: r.tableros_py, rol_tableros: r.rol_tableros, rol_tableros_py: r.rol_tableros_py, modulos: r.modulos, vence: r.vence, solo_referidos: !r.tableros.length && !r.tableros_py.length });
    } catch (e) {
        if (e.codigo === "credenciales") { fallo(ip); return res.status(401).json({ error: "Usuario o contraseña incorrectos." }); }
        if (e.codigo === "permisos") return res.status(502).json({ error: "No se pudieron leer los permisos del ERP." });
        console.error("erpLogin", e.codigo || e.message);
        return res.status(502).json({ error: "No se pudo conectar con el ERP. Intenta de nuevo." });
    }
});

/* Renueva la sesión sin pedir la contraseña: con el token vigente del usuario, vuelve a calcular sus permisos con lo
   último que Dirección eligió para sus roles. El portal la llama cada vez que se abre. */
exports.cmRenovar = onRequest({ region: "southamerica-east1", cors: ORIGENES, maxInstances: 5, timeoutSeconds: 30, memory: "256MiB" }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Solo POST." });
    const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ""));
    if (!m) return res.status(401).json({ error: "Falta la sesión." });
    try {
        const t = await admin.auth().verifyIdToken(m[1]);
        if (!(Number(t.vence) > Date.now())) return res.status(401).json({ error: "La sesión venció." });
        const r = await sesionDe(t.uid, Number(t.vence));
        if (!r) return res.status(404).json({ error: "Volvé a ingresar con tu usuario del ERP." });
        return res.json({ token: r.token, tableros: r.tableros, tableros_py: r.tableros_py, rol_tableros: r.rol_tableros, rol_tableros_py: r.rol_tableros_py, modulos: r.modulos, vence: r.vence });
    } catch (e) {
        return res.status(401).json({ error: "Sesión no válida." });
    }
});

exports._internos = { loginERP, permisosERP, ingresar, rolesDelERP, filas, sesionDe };

/* Redes sociales: respuestas automáticas a comentarios (redes.js). */
const redes = require("./redes");
exports.metaWebhook = redes.metaWebhook;
exports.rsNuevoComentario = redes.rsNuevoComentario;
exports.rsComentarioCambio = redes.rsComentarioCambio;
exports.rsMensajeNuevo = redes.rsMensajeNuevo;
exports.rsVincular = redes.rsVincular;
exports.igConectar = require("./redes-ig").igConectar;

/* «Estudio creativo» de Marketing: paquete creativo completo y prompts para cada IA (creativo.js). */
exports.creativo = require("./creativo").creativo;
/* Producción del contenido del Estudio creativo (imágenes, voz, música, video y reel), paso a paso. */
exports.creativoProduccion = require("./creativo-produccion").creativoProduccion;

/* Snacks: el servidor lee las ventas del ERP (Bolivia y Paraguay) y las guarda por mes (snacks-sync.js). */
exports.snacksSync = require("./snacks-sync").snacksSync;

/* Asistente de voz en tiempo real (Gemini Live): entrega el token temporal. */
exports.liveToken = require("./live").liveToken;
