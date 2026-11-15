/* Capa de Firebase de los módulos nuevos del centro de mando.
   - Ingreso con Google (barra propia debajo de la barra del centro de mando).
   - Roles por correo en Firestore (colección "roles", la administra Dirección en roles.html).
   - Atiende en el navegador las herramientas legal_*, cuentas_por_pagar_* y comercial_* que antes iban al
     MCP: window.CM.llamar las desvía a Firestore; el resto de herramientas siguen yendo al MCP.
   Seguridad real: reglas de Firestore (firestore.rules). Esta capa solo arma la interfaz y las consultas. */
(function () {
    "use strict";
    var CFG = window.CM_FIREBASE_CONFIG;
    var ROLES_ETIQUETA = { admin: "Dirección (administra roles)", legal: "Legal", administracion: "Administración (cuentas por pagar)", comercial: "Sistema comercial (master)", ventas: "Ejecutiva de ventas", reportes: "Reportes" };
    var herramientas = {}; /* prefijo o nombre -> función(args) */
    var estado = { configurado: !!CFG, usuario: null, roles: {}, error: null };
    var resolverListo, listo = new Promise(function (r) { resolverListo = r; });

    function sinFirebase(msg) { return Object.assign(new Error(msg), { sinFirebase: true }); }
    function correo() { return estado.usuario ? String(estado.usuario.email || "").toLowerCase() : ""; }
    function tieneRol(r) { return !!(estado.roles && (estado.roles.admin || estado.roles[r])); }

    /* ---------- barra de ingreso ---------- */
    function barra() {
        var b = document.getElementById("cm-fb-barra");
        if (!b) {
            b = document.createElement("div");
            b.id = "cm-fb-barra";
            b.className = "cm-fb-barra";
            var ref = document.querySelector(".cm-aviso-sesion") || document.querySelector(".cm-barra");
            if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref.nextSibling); else document.body.insertBefore(b, document.body.firstChild);
        }
        return b;
    }
    function pintarBarra() {
        if (!document.body) return;
        var b = barra(); b.textContent = "";
        var t = document.createElement("span");
        if (!estado.configurado) {
            t.textContent = "Falta configurar Firebase para guardar los datos de este módulo (ver dashboard/FIREBASE.md).";
            b.className = "cm-fb-barra is-warn"; b.appendChild(t); return;
        }
        if (estado.error) { t.textContent = "Firebase: " + estado.error; b.className = "cm-fb-barra is-bad"; b.appendChild(t); return; }
        if (!estado.usuario) {
            t.textContent = "Para usar este módulo ingresa con tu cuenta de Google de la empresa.";
            var btn = document.createElement("button");
            btn.type = "button"; btn.textContent = "Ingresar con Google";
            btn.onclick = function () {
                btn.disabled = true;
                var p = new firebase.auth.GoogleAuthProvider();
                p.setCustomParameters({ prompt: "select_account" });
                firebase.auth().signInWithPopup(p).catch(function (e) {
                    btn.disabled = false;
                    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return firebase.auth().signInWithRedirect(p);
                    if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") { estado.error = e.message; pintarBarra(); }
                });
            };
            b.className = "cm-fb-barra is-warn"; b.appendChild(t); b.appendChild(btn); return;
        }
        var nombres = Object.keys(ROLES_ETIQUETA).filter(function (r) { return estado.roles[r]; }).map(function (r) { return ROLES_ETIQUETA[r]; });
        t.textContent = "Datos de módulos: " + correo() + (nombres.length ? " · " + nombres.join(", ") : " · sin roles asignados (pídelos a Dirección)");
        var salir = document.createElement("button");
        salir.type = "button"; salir.textContent = "Cambiar de cuenta";
        salir.onclick = function () { firebase.auth().signOut().then(function () { location.reload(); }); };
        b.className = "cm-fb-barra" + (nombres.length ? "" : " is-warn"); b.appendChild(t); b.appendChild(salir);
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
            var fin = function () { pintarBarra(); if (primera) { primera = false; resolverListo(estado); } else location.reload(); };
            if (!u) { estado.roles = {}; return fin(); }
            if (!u.emailVerified) { estado.error = "la cuenta " + u.email + " no tiene el correo verificado."; estado.roles = {}; return fin(); }
            firebase.firestore().collection("roles").doc(correo()).get().then(function (d) {
                estado.roles = d.exists && Number(d.data().estado == null ? 1 : d.data().estado) > 0 ? d.data() : {};
            }).catch(function () { estado.roles = {}; }).then(fin);
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
                if (!estado.usuario) throw sinFirebase("Ingresa con tu cuenta de Google (barra de arriba) para usar este módulo.");
                return h(JSON.parse(JSON.stringify(args || {})), nombre);
            }).then(function (r) { return r; }, function (e) {
                if (e && e.code === "permission-denied") throw sinFirebase("Tu cuenta " + correo() + " no tiene permiso para esto. Pídele a Dirección el rol que corresponde.");
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
        var deConfig = db().collection("config").doc("sucursales").get().then(function (x) { return x.exists ? (x.data().lista || []) : []; }).catch(function () { return []; });
        cacheSucursales = Promise.all([deConfig, deVentas]).then(function (a) {
            var vistos = {}, out = [];
            a[0].concat(a[1]).forEach(function (s) { var t = String(s || "").trim(), k = t.toLowerCase(); if (t && !vistos[k]) { vistos[k] = 1; out.push(t); } });
            return out.sort(function (x, y) { return x.localeCompare(y); });
        });
        return cacheSucursales;
    }

    window.CMFB = {
        listo: listo, estado: estado, tieneRol: tieneRol, correo: correo, ROLES_ETIQUETA: ROLES_ETIQUETA,
        registrar: function (nombre, fn) { herramientas[nombre] = fn; },
        util: { db: db, ahora: ahora, docs: docs, vigentes: vigentes, err: err, txt: txt, opcion: opcion, fecha: fecha, monto: monto, entero: entero, url: url, bool: bool, sucursales: sucursales }
    };

    instalarDesvio();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar); else arrancar();

    /* Estilos de la barra (comunes a todos los tableros). */
    var css = document.createElement("style");
    css.textContent = ".cm-fb-barra{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:8px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid #2B2E33;background:#121417;color:#A4A8AF;font-size:13px}" +
        ".cm-fb-barra.is-warn{color:#D9AE5B}.cm-fb-barra.is-bad{color:#D9776F}" +
        ".cm-fb-barra button{font:inherit;color:#FFFFFF;background:#B8050F;border:0;padding:5px 12px;cursor:pointer}.cm-fb-barra button:hover{background:#E30613}.cm-fb-barra button:disabled{opacity:.6}";
    (document.head || document.documentElement).appendChild(css);
})();
