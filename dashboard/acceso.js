/* Ingreso al centro de mando con el usuario y la contraseña del ERP (serp.servisofts.com).
   Usa el mismo pedido que la web del ERP: servicio "usuario", tipo "login", por su conexión segura.
   La contraseña no se guarda: solo se recuerda el nombre durante la sesión del navegador (8 horas). */
(function () {
    var WS_URL = "wss://serp.servisofts.com/ws/";
    var MARCA = "---SSofts---";
    var CLAVE = "cb_centro_mando";
    var HORAS = 8;

    /* ===== Accesos por cargo =====
       Qué ve cada cargo después de ingresar. Claves de tablero:
       muro, direccion, administracion, contabilidad, atencion, supervision, marketing, rrhh */
    var CARGOS = {
        director:       ["muro", "direccion", "administracion", "contabilidad", "atencion", "supervision", "marketing", "rrhh"],
        administrador:  ["muro", "administracion"],
        contabilidad:   ["contabilidad"],
        atencion:       ["atencion"],
        supervision:    ["muro", "supervision", "marketing"],
        rrhh:           ["rrhh"]
    };
    var NOMBRE_CARGO = {
        director: "Director (ve todo)", administrador: "Administrador", contabilidad: "Contabilidad",
        atencion: "Atención al cliente", supervision: "Supervisión y marketing", rrhh: "Recursos humanos"
    };
    /* Siempre Director, aunque el archivo de accesos falle: así Dirección nunca queda afuera. */
    var FIJOS = { "8f44fa04-0d56-453d-98a9-7af3fc13862d": "director" };   // Jose Miguel Parada
    /* El resto se asigna desde el módulo "Accesos del equipo" y se guarda en accesos.json. */
    var ACCESOS = [];
    var REPO = "CalisteniaBolivia-SRL/CalisteniaBolivia-SRL.github.io";
    var ARCHIVO = "dashboard/accesos.json";

    var acceso = document.getElementById("acceso");
    var portal = document.getElementById("portal");
    var nav = document.getElementById("nav-portal");
    var form = document.getElementById("f-acceso");
    var error = document.getElementById("acc-error");
    var boton = document.getElementById("acc-btn");
    var hola = document.getElementById("hola");
    var salir = document.getElementById("salir");
    var sesion = null;

    function normal(u) { return String(u || "").trim().toLowerCase(); }

    function cargoDe(usuario, clave) {
        if (clave && FIJOS[clave]) return FIJOS[clave];
        for (var i = 0; i < ACCESOS.length; i++) {
            var a = ACCESOS[i];
            if ((a.usuario && normal(a.usuario) === normal(usuario)) || (clave && a.usuario === clave)) return a.cargo;
        }
        return null;
    }

    function cargarAccesos() {
        return fetch("accesos.json?t=" + Date.now(), { cache: "no-store" })
            .then(function (r) { return r.ok ? r.json() : { usuarios: [] }; })
            .then(function (d) { ACCESOS = Array.isArray(d.usuarios) ? d.usuarios : []; })
            .catch(function () { ACCESOS = []; });
    }

    function mostrarPortal(nombre, usuario, clave) {
        sesion = { nombre: nombre, usuario: usuario, clave: clave };
        var cargo = cargoDe(usuario, clave);
        var permitidos = CARGOS[cargo] || [];
        document.querySelectorAll("[data-tablero]").forEach(function (el) {
            el.hidden = permitidos.indexOf(el.getAttribute("data-tablero")) < 0;
        });
        var hayTarjetas = permitidos.some(function (t) { return t !== "muro"; });
        document.querySelectorAll('#equipo, a[href="#equipo"]').forEach(function (el) { el.hidden = !hayTarjetas; });
        document.getElementById("sin-acceso").hidden = permitidos.length > 0;
        document.getElementById("mi-usuario").textContent = (usuario ? "«" + usuario + "»" : "") + (clave ? " (clave " + clave + ")" : "");
        document.getElementById("admin-accesos").hidden = cargo !== "director";
        if (cargo === "director") pintarAdmin();
        acceso.hidden = true;
        portal.hidden = false;
        nav.hidden = false;
        hola.textContent = nombre ? "Hola, " + nombre + (cargo ? " · " + NOMBRE_CARGO[cargo] : "") : "";
    }
    function mostrarAcceso() {
        try { sessionStorage.removeItem(CLAVE); } catch (e) {}
        sesion = null;
        portal.hidden = true;
        nav.hidden = true;
        acceso.hidden = false;
        document.getElementById("acc-usuario").focus();
    }

    try {
        var s = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
        if (s && s.vence > Date.now()) cargarAccesos().then(function () { mostrarPortal(s.nombre, s.usuario, s.clave); });
    } catch (e) {}

    /* ===== Módulo de accesos (solo Director) ===== */
    var admFilas = document.getElementById("adm-filas");
    var admEstado = document.getElementById("adm-estado");
    var admCargo = document.getElementById("adm-cargo");
    var admToken = document.getElementById("adm-token");
    var LLAVE_TOKEN = "cb_admin_token";
    var cambios = false;

    Object.keys(NOMBRE_CARGO).forEach(function (k) { admCargo.add(new Option(NOMBRE_CARGO[k], k)); });

    function leerToken() { try { return localStorage.getItem(LLAVE_TOKEN) || ""; } catch (e) { return ""; } }
    function avisar(texto, tipo) { admEstado.textContent = texto; admEstado.className = "cm-nota" + (tipo ? " cm-" + tipo : ""); }

    function pintarAdmin() {
        admFilas.replaceChildren();
        if (!ACCESOS.length) {
            var tr0 = document.createElement("tr"), td0 = document.createElement("td");
            td0.colSpan = 4; td0.className = "cm-vacio"; td0.textContent = "Todavía no asignaste a nadie. Agrega el primer usuario abajo.";
            tr0.append(td0); admFilas.append(tr0);
        }
        ACCESOS.forEach(function (a, i) {
            var tr = document.createElement("tr");
            var t1 = document.createElement("td"); t1.textContent = a.usuario;
            var t2 = document.createElement("td"); t2.textContent = a.nombre || "";
            var t3 = document.createElement("td"), sel = document.createElement("select");
            sel.setAttribute("aria-label", "Cargo de " + a.usuario);
            Object.keys(NOMBRE_CARGO).forEach(function (k) { sel.add(new Option(NOMBRE_CARGO[k], k)); });
            sel.value = a.cargo;
            sel.addEventListener("change", function () { ACCESOS[i].cargo = sel.value; marcarCambios(); });
            t3.append(sel);
            var t4 = document.createElement("td"), quitar = document.createElement("button");
            quitar.type = "button"; quitar.className = "cm-quitar"; quitar.textContent = "Quitar";
            quitar.addEventListener("click", function () { ACCESOS.splice(i, 1); marcarCambios(); pintarAdmin(); });
            t4.append(quitar);
            tr.append(t1, t2, t3, t4);
            admFilas.append(tr);
        });
        document.getElementById("adm-token-box").open = !leerToken();
        if (!cambios) avisar(leerToken() ? "" : "Para guardar, primero pega la llave de GitHub (abajo).");
    }
    function marcarCambios() { cambios = true; avisar("Hay cambios sin guardar.", "aviso"); }

    document.getElementById("adm-nuevo").addEventListener("submit", function (e) {
        e.preventDefault();
        var u = document.getElementById("adm-usuario").value.trim();
        var n = document.getElementById("adm-nombre").value.trim();
        if (!u) { avisar("Escribe el usuario del ERP.", "error"); return; }
        var existe = ACCESOS.filter(function (a) { return normal(a.usuario) === normal(u); })[0];
        if (existe) { existe.cargo = admCargo.value; if (n) existe.nombre = n; }
        else ACCESOS.push({ usuario: u, nombre: n, cargo: admCargo.value });
        e.target.reset();
        marcarCambios();
        pintarAdmin();
    });

    document.getElementById("adm-token-guardar").addEventListener("click", function () {
        var t = admToken.value.trim();
        if (!t) { avisar("Pega la llave antes de guardarla.", "error"); return; }
        try { localStorage.setItem(LLAVE_TOKEN, t); } catch (e) {}
        admToken.value = "";
        document.getElementById("adm-token-box").open = false;
        avisar("Llave guardada en este navegador." + (cambios ? " Ahora presiona Guardar cambios." : ""), "ok");
    });
    document.getElementById("adm-token-borrar").addEventListener("click", function () {
        try { localStorage.removeItem(LLAVE_TOKEN); } catch (e) {}
        avisar("Llave borrada de este navegador.", "ok");
    });

    function base64(texto) { return btoa(unescape(encodeURIComponent(texto))); }

    document.getElementById("adm-guardar").addEventListener("click", function () {
        var token = leerToken();
        if (!token) { document.getElementById("adm-token-box").open = true; avisar("Falta la llave de GitHub para guardar.", "error"); return; }
        var api = "https://api.github.com/repos/" + REPO + "/contents/" + ARCHIVO;
        var cab = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json" };
        var cuerpo = JSON.stringify({ actualizado: new Date().toISOString(), por: sesion ? sesion.nombre : "", usuarios: ACCESOS }, null, 2) + "\n";
        var btn = this; btn.disabled = true; avisar("Guardando…");
        fetch(api + "?ref=main", { headers: cab, cache: "no-store" })
            .then(function (r) { return r.status === 404 ? {} : r.ok ? r.json() : Promise.reject(r.status); })
            .then(function (actual) {
                return fetch(api, { method: "PUT", headers: cab, body: JSON.stringify({
                    message: "Accesos del centro de mando: actualizado por " + (sesion ? sesion.nombre : "Dirección"),
                    content: base64(cuerpo), sha: actual.sha, branch: "main" }) });
            })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
            .then(function () { cambios = false; avisar("Guardado. En 1 o 2 minutos los cambios rigen para todos.", "ok"); })
            .catch(function (st) {
                avisar(st === 401 || st === 403 ? "GitHub rechazó la llave: revisa que tenga permiso Contents: Read and write sobre este repositorio."
                    : "No se pudo guardar (" + st + "). Intenta de nuevo.", "error");
            })
            .then(function () { btn.disabled = false; });
    });

    /* El ERP espera la contraseña cifrada con MD5 (hexadecimal en minúsculas), igual que su web. */
    function md5(texto) {
        function suma(x, y) { var l = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xFFFF); }
        function rot(n, c) { return (n << c) | (n >>> (32 - c)); }
        function cmn(q, a, b, x, s, t) { return suma(rot(suma(suma(a, q), suma(x, t)), s), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
        var bytes = unescape(encodeURIComponent(texto)), n = bytes.length, x = [], i;
        for (i = 0; i < n; i++) x[i >> 2] |= bytes.charCodeAt(i) << ((i % 4) * 8);
        x[n >> 2] |= 0x80 << ((n % 4) * 8);
        x[(((n + 8) >> 6) + 1) * 16 - 2] = n * 8;
        var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (i = 0; i < x.length; i += 16) {
            var oa = a, ob = b, oc = c, od = d;
            for (var k = 0; k < 16; k++) if (x[i + k] === undefined) x[i + k] = 0;
            a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
            a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
            a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
            a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
            a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
            a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
            a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
            a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
            a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
            a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
            a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
            a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
            a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
            a = suma(a, oa); b = suma(b, ob); c = suma(c, oc); d = suma(d, od);
        }
        var hex = "", partes = [a, b, c, d];
        for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) hex += ("0" + ((partes[i] >>> (j * 8)) & 0xFF).toString(16)).slice(-2);
        return hex;
    }
    window.__cbMd5 = md5;

    function idUnico() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    /* serp.servisofts.com tiene dos direcciones y una no responde: el navegador puede tardar
       hasta ~30 s en pasar a la que sí funciona. Por eso se espera más y se reintenta. */
    function loginERP(usuario, password) {
        var intentos = 3;
        function intentar(n) {
            return loginUnaVez(usuario, password).catch(function (err) {
                /* Solo se reintenta si no se llegó a enviar el ingreso (problema de conexión). */
                if ((err.message === "conexion" || err.message === "tiempo") && !err.enviado && n < intentos) {
                    boton.textContent = "Reintentando conexión (" + (n + 1) + " de " + intentos + ")…";
                    return intentar(n + 1);
                }
                throw err;
            });
        }
        return intentar(1);
    }

    function loginUnaVez(usuario, password) {
        return new Promise(function (resolver, rechazar) {
            var ws, buffer = "", enviado = false, id = idUnico(), terminado = false, paso = "conectando";
            function fin() { terminado = true; clearTimeout(reloj); try { ws.close(); } catch (e) {} }
            function fallar(motivo) {
                if (terminado) return;
                fin();
                var e = new Error(motivo); e.paso = paso; e.enviado = enviado;
                rechazar(e);
            }
            var reloj = setTimeout(function () { fallar("tiempo"); }, 45000);
            try { ws = new WebSocket(WS_URL); } catch (e) { return fallar("conexion"); }
            ws.onopen = function () { paso = "conectado, esperando saludo del ERP"; };
            ws.onerror = function () { fallar("conexion"); };
            ws.onclose = function (ev) { if (!terminado) { paso += " (cerrado " + ev.code + ")"; fallar("conexion"); } };
            ws.onmessage = function (ev) {
                buffer += ev.data;
                var i;
                while ((i = buffer.indexOf(MARCA)) >= 0) {
                    var crudo = buffer.slice(0, i).split("---SSkey---")[0];
                    buffer = buffer.slice(i + MARCA.length);
                    var m;
                    try { m = JSON.parse(crudo); } catch (e) { continue; }
                    if (!enviado && m.component === "servicio" && m.type === "init") {
                        enviado = true;
                        paso = "usuario enviado, esperando respuesta";
                        ws.send(JSON.stringify({
                            service: "usuario", component: "usuario", version: "2.0", type: "login", estado: "cargando",
                            data: { usuario: usuario, password: md5(password) }, _ssocket_promise: id
                        }) + "\n");
                    } else if (enviado && (m._ssocket_promise === id || (m.component === "usuario" && m.type === "login"))) {
                        /* La respuesta del ingreso: la reconoce por su identificador o, si el ERP no lo devuelve, por su tipo. */
                        if (m.estado === "exito") { fin(); resolver(m); }
                        else if (m.estado === "error") { fin(); rechazar(new Error(m.error || "error_login")); }
                    }
                }
            };
        });
    }

    function nombreDe(respuesta, usuario) {
        var d = (respuesta && respuesta.data) || {};
        var n = d.Nombres || d.nombres || d.nombre || d.Nombre || "";
        n = String(n).trim().split(/\s+/)[0];
        return n || usuario;
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        var usuario = form.usuario.value.trim();
        var password = form.password.value;
        if (!usuario || !password) { error.textContent = "Escribe tu usuario y tu contraseña."; return; }
        error.textContent = "";
        boton.disabled = true;
        boton.textContent = "Conectando con el ERP…";
        loginERP(usuario, password).then(function (r) {
            var nombre = nombreDe(r, usuario);
            var datos = (r && r.data) || {};
            var clave = datos.key || datos.key_usuario || "";
            try { sessionStorage.setItem(CLAVE, JSON.stringify({ nombre: nombre, usuario: usuario, clave: clave, vence: Date.now() + HORAS * 3600000 })); } catch (e2) {}
            form.reset();
            return cargarAccesos().then(function () { mostrarPortal(nombre, usuario, clave); });
        }).catch(function (err) {
            form.password.value = "";
            var detalle = err.paso ? " (paso: " + err.paso + ")" : "";
            error.textContent = err.message === "error_login" ? "Usuario o contraseña incorrectos."
                : err.enviado ? "El ERP recibió tu usuario pero no respondió a tiempo. Intenta de nuevo" + detalle + "."
                : err.message === "tiempo" ? "El ERP no respondió a tiempo. Intenta de nuevo" + detalle + "."
                : err.message === "conexion" ? "No se pudo conectar con el ERP" + detalle + ". Intenta de nuevo en un momento."
                : "El ERP rechazó el ingreso: " + err.message + ".";
        }).then(function () {
            boton.disabled = false;
            boton.textContent = "Ingresar";
        });
    });

    salir.addEventListener("click", mostrarAcceso);
})();
