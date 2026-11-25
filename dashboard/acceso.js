/* Ingreso al centro de mando con el usuario y la contraseña del ERP (serp.servisofts.com).
   Usa el mismo pedido que la web del ERP: servicio "usuario", tipo "login", por su conexión segura.
   Qué tableros ve cada persona lo deciden sus roles en el ERP (página /centro_mando).
   La contraseña no se guarda: se recuerda el nombre y los tableros permitidos por 30 días en
   este navegador (localStorage), para no volver a ingresar. */
(function () {
    var WS_URL = "wss://serp.servisofts.com/ws/";
    var MARCA = "---SSofts---";
    var CLAVE = "cb_centro_mando";
    var HORAS = 24 * 30;
    var PAGINA_CM = "/centro_mando";                                   // página de permisos en el ERP
    var KEY_EMPRESA = "d4118f82-0b0a-44e3-8525-73df48be69db";           // Calistenia Bolivia en el ERP
    var KEY_EMPRESA_PY = "3433c7d4-a626-44de-b825-f924334e679c";        // Calistenia Paraguay en el ERP
    var CLAVE_CTX = "cc_contexto";                                       // empresa y país elegidos (Capital Corp)
    /* Un permiso del ERP por tablero; "todo" equivale a todos. */
    var TABLEROS = ["muro", "direccion", "administracion", "contabilidad", "atencion", "supervision", "marketing", "rrhh", "reportes", "legal", "atc", "jefe_atc", "accionistas", "mantenimiento"];

    var acceso = document.getElementById("acceso");
    var portal = document.getElementById("portal");
    var nav = document.getElementById("nav-portal");
    var form = document.getElementById("f-acceso");
    var error = document.getElementById("acc-error");
    var boton = document.getElementById("acc-btn");
    var hola = document.getElementById("hola");
    var salir = document.getElementById("salir");

    /* Tableros permitidos según la página /centro_mando del ERP.
       null = no se pudieron leer los permisos; [] = el usuario no tiene ningún rol del Centro de mando. */
    function permisosERP(paginas) {
        if (!paginas) return null;
        var p = null;
        Object.keys(paginas).forEach(function (k) { var v = paginas[k]; if (v && (v.url === PAGINA_CM || k === PAGINA_CM)) p = v; });
        var permisos = (p && p.permisos) || {};
        return permisos.todo ? TABLEROS.slice() : TABLEROS.filter(function (t) { return !!permisos[t]; });
    }

    /* Permisos de cada ERP: /centro_mando (mismos nombres) y la página /accionistas (cualquier permiso = solo ingresos en vivo). */
    function permisosPY(paginas) {
        if (!paginas) return null;
        var t = permisosERP(paginas) || [];
        var acc = null;
        Object.keys(paginas).forEach(function (k) { var v = paginas[k]; if (v && (v.url === "/accionistas" || k === "/accionistas")) acc = v; });
        if (acc && acc.permisos && Object.keys(acc.permisos).length && t.indexOf("accionistas") < 0) t.push("accionistas");
        return t;
    }

    /* ---------- Capital Corp: empresa → país → portal ---------- */
    var sesionActual = null;
    function leerCtx() { try { return JSON.parse(localStorage.getItem(CLAVE_CTX) || "null") || {}; } catch (e) { return {}; } }
    function guardarCtx(c) { try { localStorage.setItem(CLAVE_CTX, JSON.stringify(c)); } catch (e) {} }
    /* Tarjetas de Paraguay: ingresos con permiso del ERP de Paraguay (o Dirección); Legal y Redes usan los mismos
       permisos de datos que en Bolivia (la sesión de datos es una sola). */
    function tablerosPY(s) {
        var bo = (s && s.tableros) || [], py = (s && s.tableros_py) || [], out = [];
        if (py.indexOf("accionistas") >= 0 || py.indexOf("direccion") >= 0 || bo.indexOf("direccion") >= 0 || bo.indexOf("accionistas") >= 0) out.push("accionistas");
        if (bo.indexOf("legal") >= 0) out.push("legal");
        if (bo.indexOf("marketing") >= 0) out.push("marketing");
        return out;
    }
    var PASOS = ["acceso", "cc-empresa", "cc-pais", "portal", "portal-py"];
    /* Botón «Atrás» del celular: cada paso (empresa → país → portal) queda en el historial del navegador. */
    var restaurando = false, primerPaso = true;
    function marcar(id, pais) {
        if (restaurando || id === "acceso") return;
        var est = { cmPaso: id, pais: pais || null };
        try {
            var actual = history.state;
            if (primerPaso || !actual || !actual.cmPaso) history.replaceState(est, "");
            else if (actual.cmPaso !== id || actual.pais !== est.pais) history.pushState(est, "");
        } catch (e) {}
        primerPaso = false;
    }
    window.addEventListener("popstate", function (e) {
        var st = e.state; if (!st || !st.cmPaso || !sesionActual) return;
        restaurando = true;
        try {
            if (st.cmPaso === "cc-empresa") { guardarCtx({}); irEmpresa(); }
            else if (st.cmPaso === "cc-pais") { guardarCtx({ empresa: "calistenia" }); irPais(); }
            else if (st.cmPaso === "portal" || st.cmPaso === "portal-py") irPortal(st.pais || (st.cmPaso === "portal-py" ? "paraguay" : "bolivia"));
        } finally { restaurando = false; }
    });
    function ver(id) {
        PASOS.forEach(function (p) { var n = document.getElementById(p); if (n) n.hidden = p !== id; });
        document.body.classList.toggle("cc", id !== "portal" && id !== "portal-py");
        nav.hidden = id === "acceso";
        if (id !== "portal") document.querySelectorAll('#nav-portal a[href="#muro"], #nav-portal a[href="#equipo"]').forEach(function (el) { el.hidden = true; });
        window.scrollTo(0, 0);
    }
    function pintarRuta(pais) {
        var r = document.getElementById("cc-ruta"); if (!r) return;
        r.textContent = "";
        function b(txt, fn) { var x = document.createElement("button"); x.type = "button"; x.textContent = txt; x.onclick = fn; return x; }
        function sep() { var x = document.createElement("span"); x.className = "cc-sep"; x.textContent = "›"; return x; }
        r.appendChild(b("Capital Corp", function () { guardarCtx({}); irEmpresa(); }));
        if (pais) {
            r.appendChild(sep()); r.appendChild(b("Calistenia Company", function () { guardarCtx({ empresa: "calistenia" }); irPais(); }));
            r.appendChild(sep()); var p = document.createElement("span"); p.textContent = pais === "paraguay" ? "Paraguay" : "Bolivia"; r.appendChild(p);
        }
        r.hidden = !pais;
    }
    function irEmpresa() {
        pintarRuta(null);
        var h = document.getElementById("cc-hola-empresa");
        if (h) h.textContent = sesionActual && sesionActual.nombre ? "Buenos días, " + sesionActual.nombre + ". ¿Con qué empresa trabajamos?" : "";
        if (h && sesionActual && sesionActual.nombre) { var hr = new Date().getHours(); h.textContent = (hr < 12 ? "Buenos días, " : hr < 19 ? "Buenas tardes, " : "Buenas noches, ") + sesionActual.nombre + ". ¿Con qué empresa trabajamos?"; }
        ver("cc-empresa"); marcar("cc-empresa");
    }
    function irPais() {
        pintarRuta(null);
        var py = permisosDe("paraguay"), bo = (sesionActual && sesionActual.tableros) || [];
        var bPy = document.querySelector('[data-pais="paraguay"]'), bBo = document.querySelector('[data-pais="bolivia"]');
        bPy.disabled = !py.length; bBo.disabled = !bo.length;
        var nota = document.getElementById("cc-pais-nota");
        nota.textContent = !py.length ? "Paraguay: tu usuario no tiene permisos en el ERP de Calistenia Paraguay (páginas /centro_mando o /accionistas)." : !bo.length ? "Bolivia: tu usuario no tiene permisos en /centro_mando del ERP de Calistenia Bolivia." : "";
        ver("cc-pais"); marcar("cc-pais");
    }
    function irPortal(pais) {
        guardarCtx({ empresa: "calistenia", pais: pais });
        pintarRuta(pais);
        if (pais === "paraguay") {
            pintarModulos("paraguay");
            document.querySelectorAll('a[href="#muro"], a[href="#equipo"]').forEach(function (el) { el.hidden = true; });
            ver("portal-py"); marcar("portal-py", "paraguay");
        } else {
            mostrarPortal(sesionActual.nombre, sesionActual.usuario, sesionActual.tableros);
            marcar("portal", "bolivia");
        }
    }
    /* Después de ingresar (o con la sesión recordada): vuelve a donde estaba o empieza por la empresa. */
    function entrar(ses) {
        sesionActual = ses;
        hola.textContent = ses.nombre ? "Hola, " + ses.nombre : "";
        var c = leerCtx();
        if (c.empresa === "calistenia" && (c.pais === "bolivia" || c.pais === "paraguay")) {
            if (c.pais === "paraguay" ? permisosDe("paraguay").length : (ses.tableros || []).length) return irPortal(c.pais);
        }
        if (c.empresa === "calistenia") return irPais();
        irEmpresa();
    }
    document.querySelectorAll("[data-empresa]").forEach(function (b) { b.addEventListener("click", function () { guardarCtx({ empresa: b.getAttribute("data-empresa") }); irPais(); }); });
    document.querySelectorAll("[data-pais]").forEach(function (b) { b.addEventListener("click", function () { irPortal(b.getAttribute("data-pais")); }); });

    /* Permisos por país: Bolivia, los de /centro_mando del ERP de Bolivia; Paraguay, los del ERP de Paraguay
       (/centro_mando y /accionistas) más, para Dirección de Bolivia, todo. */
    function permisosDe(pais) {
        var s = sesionActual || {}, bo = s.tableros || [];
        if (pais !== "paraguay") return bo;
        var py = (s.tableros_py || []).slice();
        if (bo.indexOf("direccion") >= 0) py.push("todo");
        if (bo.indexOf("accionistas") >= 0 && py.indexOf("accionistas") < 0) py.push("accionistas");   // inversionistas: ingresos de los dos países
        ["legal", "marketing"].forEach(function (t) { if (bo.indexOf(t) >= 0 && py.indexOf(t) < 0) py.push(t); });
        return py;
    }
    /* Muro y tableros de cada país salen del registro único de módulos (modulos.js) + el checklist de Dirección. */
    function pintarModulos(pais, cfg) {
        if (!window.CM_MODULOS) return { pantallas: 0, tableros: 0 };
        var r = CM_MODULOS.pintar({ pais: pais, permisos: permisosDe(pais), cfg: cfg,
            pantallas: document.getElementById("pantallas-" + pais), tableros: document.getElementById("tableros-" + pais),
            bloqueMuro: document.getElementById(pais === "paraguay" ? "muro-py" : "muro"), bloqueTableros: document.getElementById(pais === "paraguay" ? "equipo-py" : "equipo"),
            cuentaMuro: document.getElementById("cuenta-" + pais) });
        if (pais === "paraguay") { var n = document.getElementById("py-sin"); if (n) n.hidden = r.pantallas + r.tableros > 0; var eq = document.getElementById("equipo-py"); if (eq) eq.hidden = false; }
        var dir = permisosDe("bolivia").indexOf("direccion") >= 0, nm = document.getElementById("nav-modulos"); if (nm) nm.hidden = !dir;
        return r;
    }
    /* Cuando llega el checklist actualizado de la base, se vuelve a pintar el portal que está a la vista. */
    if (window.CM_MODULOS) CM_MODULOS.cargarConfig().then(function (cfg) {
        if (!cfg || !sesionActual) return;
        ["bolivia", "paraguay"].forEach(function (p) { var n = document.getElementById(p === "paraguay" ? "portal-py" : "portal"); if (n && !n.hidden) pintarModulos(p, cfg); });
    });
    function mostrarPortal(nombre, usuario, permitidos) {
        var lista = permitidos || [];
        pintarRuta("bolivia");
        var r = pintarModulos("bolivia");
        document.querySelectorAll('a[href="#muro"]').forEach(function (el) { el.hidden = !r.pantallas; });
        document.querySelectorAll('a[href="#equipo"]').forEach(function (el) { el.hidden = !r.tableros; });
        document.getElementById("sin-acceso").hidden = lista.length > 0;
        document.getElementById("sin-permisos-erp").hidden = permitidos !== null;
        document.getElementById("sin-rol").hidden = permitidos === null;
        document.getElementById("mi-usuario").textContent = usuario ? "«" + usuario + "»" : "";
        ver("portal");
        hola.textContent = nombre ? "Hola, " + nombre : "";
    }
    function mostrarAcceso() {
        try { localStorage.removeItem(CLAVE); } catch (e) {}
        sesionActual = null;
        ver("acceso");
        document.getElementById("acc-usuario").focus();
    }

    try {
        var s = JSON.parse(localStorage.getItem(CLAVE) || "null");
        if (s && s.vence > Date.now() && "tableros" in s) { entrar(s); actualizarPermisos(s); }
    } catch (e) {}

    /* La sesión no vence mientras se use (cm-mcp.js la extiende), así que cada vez que se abre el portal se vuelven
       a leer los permisos del usuario en el ERP de Bolivia Y en el de Paraguay, sin pedirle la contraseña: si Dirección
       le cambió o le quitó un rol, lo ve al instante (antes Paraguay quedaba con los permisos del primer ingreso). */
    function actualizarPermisos(ses) {
        if (!ses || !ses.key_usuario || !window.WebSocket) return;
        var ws, buffer = "", idBo = "perm-bo-" + Date.now(), idPy = "perm-py-" + Date.now(), listo = false, bo, py, pidioPy = false;
        var reloj = setTimeout(function () { cerrar(); }, 15000);
        function cerrar() { listo = true; clearTimeout(reloj); try { ws.close(); } catch (e) {} }
        function pedir(empresa, id) {
            ws.send(JSON.stringify({ version: "1.0", service: "roles_permisos", component: "usuarioPage", type: "getAll", estado: "cargando",
                key_usuario: ses.key_usuario, key_empresa: empresa, _ssocket_promise: id }) + "\n");
        }
        function aplicar() {
            cerrar();
            if (bo === null) return;   // no se pudieron leer: se deja lo que había
            var actual = JSON.parse(localStorage.getItem(CLAVE) || "null");
            if (!actual || actual.usuario !== ses.usuario) return;
            var nuevoPy = py === null ? (actual.tableros_py || []) : py;
            if (JSON.stringify(bo) === JSON.stringify(actual.tableros) && JSON.stringify(nuevoPy) === JSON.stringify(actual.tableros_py || [])) return;
            actual.tableros = bo; actual.tableros_py = nuevoPy;
            try { localStorage.setItem(CLAVE, JSON.stringify(actual)); } catch (e) {}
            sesionActual = actual;
            var pPy = document.getElementById("portal-py");
            if (!portal.hidden) mostrarPortal(actual.nombre, actual.usuario, bo);
            else if (pPy && !pPy.hidden) { if (permisosDe("paraguay").length) pintarModulos("paraguay"); else irPais(); }
        }
        try { ws = new WebSocket(WS_URL); } catch (e) { return; }
        ws.onerror = cerrar;
        ws.onmessage = function (ev) {
            buffer += ev.data;
            var i;
            while ((i = buffer.indexOf(MARCA)) >= 0 && !listo) {
                var crudo = buffer.slice(0, i).split("---SSkey---")[0], m;
                buffer = buffer.slice(i + MARCA.length);
                try { m = JSON.parse(crudo); } catch (e) { continue; }
                if (m.component === "servicio" && m.type === "init") pedir(KEY_EMPRESA, idBo);
                else if (bo === undefined && (m._ssocket_promise === idBo || (!pidioPy && m.component === "usuarioPage" && m.type === "getAll"))) {
                    /* Mismo cálculo que al ingresar: /centro_mando más la página /accionistas. */
                    bo = m.estado === "exito" ? permisosPY(m.data || {}) : null;
                    pidioPy = true; pedir(KEY_EMPRESA_PY, idPy);
                } else if (pidioPy && (m._ssocket_promise === idPy || (m.component === "usuarioPage" && m.type === "getAll"))) {
                    py = m.estado === "exito" ? (permisosPY(m.data || {}) || []) : null;
                    aplicar();
                }
            }
        };
    }

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
            /* Tras ingresar, en la misma conexión se piden los permisos del usuario en el ERP
               (servicio roles_permisos). Si no llegan en 10 s, se entra igual sin ellos. */
            var pidiendo = false, idPermisos = idUnico(), loginOk = null;
            var pidiendoPy = false, idPermisosPy = idUnico(), paginasBo = null, keyUsuario = null;
            function pedirPermisos(m) {
                loginOk = m;
                var key = m.data && (m.data.key || m.data.key_usuario);
                if (!key) { fin(); return resolver({ login: m, paginas: null }); }
                keyUsuario = key;
                pidiendo = true;
                paso = "leyendo permisos del ERP";
                clearTimeout(reloj);
                reloj = setTimeout(function () { if (!terminado) { fin(); resolver({ login: m, paginas: null, paginasPy: null }); } }, 10000);
                ws.send(JSON.stringify({
                    version: "1.0", service: "roles_permisos", component: "usuarioPage", type: "getAll", estado: "cargando",
                    key_usuario: key, key_empresa: KEY_EMPRESA, _ssocket_promise: idPermisos
                }) + "\n");
            }
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
                        if (m.estado === "exito") { pedirPermisos(m); }
                        else if (m.estado === "error") { fin(); rechazar(new Error(m.error || "error_login")); }
                    } else if (pidiendo && !paginasBo && (m._ssocket_promise === idPermisos || (!pidiendoPy && m.component === "usuarioPage" && m.type === "getAll"))) {
                        /* Permisos de Bolivia listos: en la misma conexión se piden los de Paraguay (5 s como máximo). */
                        paginasBo = m.estado === "exito" ? (m.data || {}) : null;
                        pidiendoPy = true;
                        clearTimeout(reloj);
                        reloj = setTimeout(function () { if (!terminado) { fin(); resolver({ login: loginOk, paginas: paginasBo, paginasPy: null }); } }, 5000);
                        ws.send(JSON.stringify({ version: "1.0", service: "roles_permisos", component: "usuarioPage", type: "getAll", estado: "cargando",
                            key_usuario: keyUsuario, key_empresa: KEY_EMPRESA_PY, _ssocket_promise: idPermisosPy }) + "\n");
                    } else if (pidiendoPy && (m._ssocket_promise === idPermisosPy || (m.component === "usuarioPage" && m.type === "getAll"))) {
                        fin();
                        resolver({ login: loginOk, paginas: paginasBo, paginasPy: m.estado === "exito" ? (m.data || {}) : null });
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
        loginERP(usuario, password).then(function (res) {
            var r = res.login;
            var nombre = nombreDe(r, usuario);
            var tableros = permisosPY(res.paginas);   // /centro_mando y /accionistas (inversionistas: solo ingresos), igual que en Paraguay
            var tablerosPy = permisosPY(res.paginasPy) || [];
            /* Si no se pudieron leer los permisos, no se recuerda la sesión: al reingresar se vuelven a pedir. */
            if (tableros !== null) {
                var dl = (r && r.data) || {};
                try { localStorage.setItem(CLAVE, JSON.stringify({ nombre: nombre, usuario: usuario, key_usuario: dl.key || dl.key_usuario || null, tableros: tableros, tableros_py: tablerosPy, vence: Date.now() + HORAS * 3600000 })); } catch (e2) {}
            }
            /* Con la misma contraseña se abre la sesión de datos de los módulos (Legal, Cuentas por pagar,
               CRM de los ATC): el puente del ERP en Firebase confirma el usuario y sus permisos. Si falla,
               el portal funciona igual y esos módulos avisan. */
            var md5Clave = md5(password);
            form.reset();
            var hayAlgo = (tableros && tableros.length) || tablerosPy.length;
            /* La sesión de datos se abre con permisos en cualquiera de los dos países (antes solo con permisos de Bolivia,
               y quien trabaja solo en Paraguay quedaba sin poder usar los módulos). */
            var pDatos = (hayAlgo && window.CMFB && window.CMFB.estado.configurado)
                ? (boton.textContent = "Abriendo la sesión de datos…", window.CMFB.entrarConERP(usuario, md5Clave).catch(function (e) { console.warn("Sesión de datos:", e.message); }))
                : Promise.resolve();
            return pDatos.then(function () {
                var dl2 = (r && r.data) || {};
                if (!hayAlgo) mostrarPortal(nombre, usuario, tableros);   // sin permisos: el aviso de siempre
                else entrar({ nombre: nombre, usuario: usuario, key_usuario: dl2.key || dl2.key_usuario || null, tableros: tableros || [], tableros_py: tablerosPy });
                /* En el mismo ingreso se conectan los datos de Calistenia, una sola vez: después quedan recordados. */
                if (tableros && tableros.length && window.CM && !window.CM.conSesion()) {
                    boton.textContent = "Conectando los datos de Calistenia…";
                    window.CM.iniciarSesion("./");
                }
            });
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

    salir.addEventListener("click", function () { if (window.CM) window.CM.cerrarSesion(); if (window.CMFB) window.CMFB.salir(); mostrarAcceso(); });

    /* Vuelta del inicio de sesión de Calistenia (datos de los tableros): canjea el código y
       abre el tablero desde el que se pidió. */
    if (window.CM && /[?&](code|error)=/.test(location.search)) {
        window.CM.atenderVuelta().then(function (volverA) {
            if (volverA) location.replace(volverA);
        }).catch(function (err) {
            /* Con el portal abierto, el formulario de ingreso está oculto: el motivo se muestra arriba del portal. */
            var txt = "No se pudo conectar los datos de Calistenia: " + err.message;
            error.textContent = txt;
            if (acceso.hidden) {
                var av = document.createElement("p");
                av.className = "cm-error"; av.setAttribute("role", "alert"); av.textContent = txt;
                av.style.cssText = "margin:12px 0;padding:10px 14px;border-left:3px solid #E30613;background:rgba(227,6,19,.08)";
                portal.insertBefore(av, portal.firstChild);
            }
        });
    }
})();
