/* Capa de Firebase de los módulos nuevos del centro de mando.
   - Ingreso con el mismo usuario y contraseña del ERP: el portal llama al puente (Cloud Function erpLogin),
     que confirma el usuario en el ERP y entrega una sesión con los permisos de /centro_mando.
   - Atiende en el navegador las herramientas legal_*, cuentas_por_pagar_* y comercial_* que antes iban al
     MCP: window.CM.llamar las desvía a Firestore; el resto de herramientas siguen yendo al MCP.
   Seguridad real: reglas de Firestore (firestore.rules). Esta capa solo arma la interfaz y las consultas. */
(function () {
    "use strict";
    var CFG = window.CM_FIREBASE_CONFIG;
    /* Puente de ingreso (Cloud Function erpLogin): confirma usuario y contraseña del ERP y entrega la sesión. */
    var PUENTE = window.CM_FIREBASE_PUENTE || (CFG ? "https://southamerica-east1-" + CFG.projectId + ".cloudfunctions.net/erpLogin" : null);
    var herramientas = {}; /* prefijo o nombre -> función(args) */
    var estado = { configurado: !!CFG, usuario: null, claims: {}, error: null };
    var resolverListo, listo = new Promise(function (r) { resolverListo = r; });

    function sinFirebase(msg) { return Object.assign(new Error(msg), { sinFirebase: true }); }
    function usuarioKey() { return estado.usuario ? estado.usuario.uid : ""; }
    function nombre() { return (estado.claims && estado.claims.nombre) || ""; }
    /* Sesión del portal (permisos del ERP releídos sin contraseña). */
    function sesionPortal() { try { return JSON.parse(localStorage.getItem("cb_centro_mando") || "null"); } catch (e) { return null; } }
    /* En este equipo quedó la sesión de datos de otra persona (el portal es de un usuario y Firebase de otro). */
    function otraPersona() {
        var s = sesionPortal();
        return !!(estado.usuario && s && s.key_usuario && s.key_usuario !== estado.usuario.uid);
    }
    function sesionVigente() { return !!(estado.usuario && estado.claims.cm === 1 && Number(estado.claims.vence) > Date.now()) && !otraPersona(); }
    /* Permisos que el ERP ya tiene (portal) pero el token de Firebase todavía no: el token conserva los del último
       ingreso con contraseña (dura 30 días); a quien le dieron un permiso después, Firestore lo rechaza. */
    function permisosFaltantes() {
        if (!sesionVigente()) return [];
        var s = sesionPortal() || {}, c = estado.claims || {}, ct = c.tableros || [], cp = c.tableros_py || [];
        var falta = (s.tableros || []).filter(function (t) { return ct.indexOf(t) < 0; });
        if (ct.indexOf("direccion") < 0) (s.tableros_py || []).forEach(function (t) { if (cp.indexOf(t) < 0 && falta.indexOf(t) < 0) falta.push(t); });
        return falta;
    }
    /* Permiso del ERP (página /centro_mando) incluido en la sesión. */
    function tieneRol(r) { return sesionVigente() && (estado.claims.tableros || []).indexOf(r) >= 0; }
    /* Permiso en el país del módulo: en Paraguay, los de /centro_mando del ERP de Paraguay (Dirección de Bolivia, todo). */
    function tieneRolPais(r) {
        if (window.CM_PAIS !== "paraguay") return tieneRol(r);
        return sesionVigente() && ((estado.claims.tableros_py || []).indexOf(r) >= 0 || (estado.claims.tableros || []).indexOf("direccion") >= 0);
    }

    /* ---------- ingreso (lo llama el portal, con la misma contraseña del ERP) ---------- */
    function entrarConERP(usuario, passwordMd5) {
        if (!estado.configurado || !PUENTE) return Promise.reject(sinFirebase("Falta configurar Firebase."));
        return fetch(PUENTE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: usuario, password_md5: passwordMd5 }) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.token) throw sinFirebase(d.error || "El puente de ingreso respondió " + r.status + "."); return d; }); })
            .then(function (d) { return firebase.auth().signInWithCustomToken(d.token).then(function () { guardarPorRol(d); return d; }); });
    }
    /* ---------- lo que Dirección eligió para los roles del ERP del usuario (roles.html) ---------- */
    var RENOVAR = window.CM_FIREBASE_RENOVAR || (PUENTE ? PUENTE.replace(/erpLogin$/, "cmRenovar") : null), K_ROL = "cm_por_rol";
    function guardarPorRol(d) {
        var u = firebase.auth().currentUser;
        try { localStorage.setItem(K_ROL, JSON.stringify({ uid: u ? u.uid : "", tableros: d.rol_tableros || [], tableros_py: d.rol_tableros_py || [], modulos: d.modulos || {} })); } catch (e) {}
    }
    /* { tableros, tableros_py (solo los que dan sus roles), modulos: { bolivia: [ids] | null, paraguay: [ids] | null } } del usuario de esta sesión. */
    function porRol() {
        try { var s = JSON.parse(localStorage.getItem(K_ROL) || "null"); var u = estado.usuario || (window.firebase && firebase.apps.length && firebase.auth().currentUser);
            return s && u && s.uid === u.uid ? s : null; } catch (e) { return null; }
    }
    /* Renueva la sesión de datos sin contraseña, con lo último que Dirección eligió para sus roles. */
    function renovar() {
        if (!RENOVAR || !estado.usuario || !(Number(estado.claims.vence) > Date.now())) return Promise.resolve(null);
        return estado.usuario.getIdToken().then(function (idt) {
            return fetch(RENOVAR, { method: "POST", headers: { "Authorization": "Bearer " + idt, "Content-Type": "application/json" }, body: "{}" });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.token) throw sinFirebase(d.error || "renovar " + r.status); return d; }); })
            .then(function (d) { return firebase.auth().signInWithCustomToken(d.token).then(function (c) { return c.user.getIdTokenResult(true); }).then(function (t) { estado.usuario = firebase.auth().currentUser; estado.claims = t.claims || {}; guardarPorRol(d); pintarBarra(); return d; }); })
            .catch(function (e) { console.warn("Renovar sesión:", e.message); return null; });
    }
    function salir() { try { return window.firebase && firebase.apps.length ? firebase.auth().signOut() : Promise.resolve(); } catch (e) { return Promise.resolve(); } }

    /* ---------- barra de estado (solo en los tableros que usan estos datos) ---------- */
    function barra() {
        var b = document.getElementById("cm-fb-barra");
        if (!b) {
            b = document.createElement("div");
            b.id = "cm-fb-barra";
            var ref = document.querySelector(".cm-aviso-sesion") || document.querySelector(".cm-barra");
            if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref.nextSibling); else document.body.insertBefore(b, document.body.firstChild);
        }
        return b;
    }
    function pintarBarra() {
        if (!document.body || !document.querySelector(".cm-barra") || window.CM_FB_SIN_BARRA) return;
        var faltan = permisosFaltantes();
        if (estado.configurado && !estado.error && sesionVigente() && !faltan.length) { var x = document.getElementById("cm-fb-barra"); if (x) x.remove(); return; }
        var b = barra(); b.textContent = ""; b.className = "cm-fb-barra is-warn";
        var t = document.createElement("span");
        if (!estado.configurado) t.textContent = "Falta configurar Firebase para guardar los datos de este módulo.";
        else if (estado.error) { t.textContent = "No se pudo abrir la sesión de datos: " + estado.error; b.className = "cm-fb-barra is-bad"; }
        else if (otraPersona()) { t.textContent = "En este equipo quedó abierta la sesión de datos de otra persona. Para trabajar con tu usuario, vuelve a ingresar."; b.className = "cm-fb-barra is-bad"; }
        else if (faltan.length) { t.textContent = "Tus permisos del ERP cambiaron desde tu último ingreso (nuevo: " + faltan.join(", ") + "). Hasta que vuelvas a ingresar con tu usuario y contraseña del ERP, no vas a poder guardar con esos permisos (por ejemplo, asignar listas)."; b.className = "cm-fb-barra is-bad"; }
        else if (estado.usuario && estado.claims.cm !== 1) t.textContent = "Te dieron permisos nuevos en el ERP. Para que este módulo los tome, tocá «Volver a ingresar» y entrá otra vez con tu usuario y contraseña del ERP (una sola vez).";
        else t.textContent = "Para guardar y ver los datos de este módulo, sal del centro de mando y vuelve a ingresar con tu usuario y contraseña del ERP.";
        b.appendChild(t);
        if (estado.configurado) {
            var btn = document.createElement("button");
            btn.type = "button"; btn.textContent = "Volver a ingresar";
            btn.onclick = function () {
                salir().then(function () { try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} if (window.CM) window.CM.cerrarSesion(); location.href = "./"; });
            };
            b.appendChild(btn);
        }
    }

    /* ---------- arranque ---------- */
    function arrancar() {
        if (!estado.configurado) { pintarBarra(); resolverListo(estado); return; }
        if (!window.firebase || !firebase.initializeApp) { estado.error = "no se pudo cargar la librería de Firebase."; pintarBarra(); resolverListo(estado); return; }
        try {
            if (!firebase.apps.length) firebase.initializeApp(CFG);
            var emu = window.CM_FIREBASE_EMULADOR; /* solo para pruebas locales */
            if (emu) { firebase.auth().useEmulator("http://" + emu.auth); var h = emu.firestore.split(":"); firebase.firestore().useEmulator(h[0], +h[1]); }
        } catch (e) { estado.error = e.message; pintarBarra(); resolverListo(estado); return; }
        var primera = true;
        firebase.auth().onAuthStateChanged(function (u) {
            estado.usuario = u;
            var fin = function () { pintarBarra(); if (primera) { primera = false; resolverListo(estado); } };
            if (!u) { estado.claims = {}; return fin(); }
            u.getIdTokenResult().then(function (t) { estado.claims = t.claims || {}; }).catch(function () { estado.claims = {}; }).then(fin);
        });
    }

    /* ---------- desvío de herramientas ---------- */
    function buscarHerramienta(nombre) {
        if (herramientas[nombre]) return herramientas[nombre];
        var pref = Object.keys(herramientas).filter(function (k) { return k.slice(-1) === "*" && nombre.indexOf(k.slice(0, -1)) === 0; })[0];
        return pref ? herramientas[pref] : null;
    }
    function instalarDesvio() {
        var CM = window.CM;
        if (!CM || CM.__fb) return;
        var original = CM.llamar;
        CM.llamar = function (nombre, args) {
            var h = buscarHerramienta(nombre);
            if (!h) return original.call(CM, nombre, args);
            return listo.then(function () {
                if (!estado.configurado) throw sinFirebase("Falta configurar Firebase para este módulo.");
                if (estado.error) throw sinFirebase("Firebase: " + estado.error);
                if (!sesionVigente()) throw sinFirebase("Sal del centro de mando y vuelve a ingresar con tu usuario del ERP para usar este módulo.");
                return h(JSON.parse(JSON.stringify(args || {})), nombre);
            }).then(function (r) { return r; }, function (e) {
                if (e && e.code === "permission-denied") {
                    var f = permisosFaltantes();
                    throw sinFirebase(f.length ? "Te dieron el permiso (" + f.join(", ") + ") después de tu último ingreso: sal del centro de mando y vuelve a ingresar con tu usuario del ERP para que se active."
                        : "Tu usuario del ERP no tiene permiso para esto en /centro_mando. Si te lo dieron hace poco, sal y vuelve a ingresar.");
                }
                if (e && e.code === "resource-exhausted") throw sinFirebase("Se llegó al límite de uso de la base de datos por hoy (Firebase). Avísale a Dirección.");
                if (e && e.code === "unavailable") throw sinFirebase("No hay conexión con la base de datos. Revisa el internet y vuelve a intentar.");
                throw e;
            });
        };
        CM.__fb = true;
    }

    /* ---------- utilidades para los módulos ---------- */
    function db() { return firebase.firestore(); }
    function ahora() { return new Date().toISOString(); }
    function docs(q) { return q.get().then(function (s) { return s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }); }); }
    function vigentes(lista) { return lista.filter(function (r) { return Number(r.estado == null ? 1 : r.estado) > 0; }); }
    function err(msg) { return new Error(msg); }
    function txt(o, campo, max, req) {
        var v = o[campo], s = v == null ? "" : String(v).trim();
        if (!s) { if (req) throw err("Falta el campo " + campo + "."); return null; }
        if (s.length > max) throw err("El campo " + campo + " admite hasta " + max + " caracteres.");
        return s;
    }
    function opcion(o, campo, ops, def, req) {
        var s = txt(o, campo, 40, req && def == null);
        if (s == null) return def == null ? null : def;
        if (ops.indexOf(s) < 0) throw err("El campo " + campo + " debe ser uno de: " + ops.join(", ") + ".");
        return s;
    }
    function fecha(o, campo, req) {
        var s = txt(o, campo, 10, req);
        if (s == null) return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + "T00:00:00"))) throw err("El campo " + campo + " debe ser una fecha AAAA-MM-DD.");
        return s;
    }
    function monto(o, campo, req, positivo) {
        var s = txt(o, campo, 20, req);
        if (s == null) return null;
        if (!/^\d+(\.\d{1,2})?$/.test(s)) throw err("El campo " + campo + " debe ser un monto positivo con hasta 2 decimales.");
        var n = Number(s);
        if (positivo && !(n > 0)) throw err("El campo " + campo + " debe ser mayor a cero.");
        return n;
    }
    function entero(o, campo, min, max, def) {
        var s = txt(o, campo, 6, false);
        if (s == null) return def == null ? null : def;
        if (!/^\d+$/.test(s) || +s < min || +s > max) throw err("El campo " + campo + " debe ser un número entre " + min + " y " + max + ".");
        return +s;
    }
    function url(o, campo) {
        var s = txt(o, campo, 500, false);
        if (s == null) return null;
        if (!/^https:\/\/[^\s"'<>]{4,490}$/.test(s)) throw err("El enlace del documento debe empezar con https:// (por ejemplo, el enlace de Google Drive).");
        return s;
    }
    function bool(o, campo) { var v = o[campo]; return v === true || v === "true"; }
    /* Nombres de sucursal: los que Dirección cargó en config/sucursales y los que aparecen en las ventas (MCP). */
    var cacheSucursales = null;
    function sucursales() {
        if (cacheSucursales) return cacheSucursales;
        var h = new Date(), d = new Date(h); d.setDate(d.getDate() - 90);
        var iso = function (x) { return x.toISOString().slice(0, 10); };
        var deVentas = window.CM.llamar("reporte_ventas", { desde: iso(d), hasta: iso(h), agrupar_por: "sucursal" })
            .then(function (r) { return ((r && r.filas) || []).map(function (f) { return String(f.grupo || "").trim(); }); }).catch(function () { return []; });
        /* La lista guardada en la configuración es la de Bolivia; en Paraguay solo vale lo que dicen sus ventas. */
        var deConfig = window.CM_PAIS === "paraguay" ? Promise.resolve([]) : db().collection("config").doc("sucursales").get().then(function (x) { return x.exists ? (x.data().lista || []) : []; }).catch(function () { return []; });
        cacheSucursales = Promise.all([deConfig, deVentas]).then(function (a) {
            var vistos = {}, out = [];
            a[0].concat(a[1]).forEach(function (s) { var t = String(s || "").trim(), k = t.toLowerCase(); if (t && !vistos[k]) { vistos[k] = 1; out.push(t); } });
            return out.sort(function (x, y) { return x.localeCompare(y); });
        });
        return cacheSucursales;
    }

    window.CMFB = {
        listo: listo, estado: estado, tieneRol: tieneRol, tieneRolPais: tieneRolPais, usuarioKey: usuarioKey, nombre: nombre, sesionVigente: sesionVigente, permisosFaltantes: permisosFaltantes, otraPersona: otraPersona,
        entrarConERP: entrarConERP, salir: salir, renovar: renovar, porRol: porRol,
        registrar: function (nombreH, fn) { herramientas[nombreH] = fn; },
        util: { db: db, ahora: ahora, docs: docs, vigentes: vigentes, err: err, txt: txt, opcion: opcion, fecha: fecha, monto: monto, entero: entero, url: url, bool: bool, sucursales: sucursales }
    };

    instalarDesvio();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar); else arrancar();

    /* Estilos de la barra (comunes a todos los tableros). */
    var css = document.createElement("style");
    css.textContent = ".cm-fb-barra{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:8px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid #2B2E33;background:#121417;color:#A4A8AF;font-size:13px}" +
        ".cm-fb-barra.is-warn{color:#D9AE5B}.cm-fb-barra.is-bad{color:#D9776F}" +
        ".cm-fb-ayuda{flex-basis:100%;color:#F0C987}.cm-fb-ayuda:empty{display:none}" +
        ".cm-fb-barra button{font:inherit;color:#FFFFFF;background:#B8050F;border:0;padding:5px 12px;cursor:pointer}.cm-fb-barra button:hover{background:#E30613}.cm-fb-barra button:disabled{opacity:.6}";
    (document.head || document.documentElement).appendChild(css);
})();
