/* Conexión con el ERP S-ERP (serp.servisofts.com) por su socket seguro, igual que la web del ERP.
   - Ingreso con el usuario y la contraseña del ERP (la contraseña viaja cifrada en MD5, como en la web del ERP).
   - Solo entran usuarios con permiso en la página /accionistas del ERP de Calistenia Paraguay.
   - Los datos se leen en vivo desde el ERP: este sitio no guarda cifras en GitHub. */
(function () {
    var WS_URL = "wss://serp.servisofts.com/ws/";
    var MARCA = "---SSofts---";
    var KEY_EMPRESA = "3433c7d4-a626-44de-b825-f924334e679c";   // Calistenia Paraguay en el ERP
    var PAGINA = "/accionistas";                                   // página de permisos en el ERP

    var ws = null, listo = null, buffer = "", pendientes = {};

    function idUnico() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    /* Abre (o reutiliza) la conexión. Resuelve cuando el ERP manda su saludo "init". */
    function conectar() {
        if (listo) return listo;
        buffer = "";
        listo = new Promise(function (resolver, rechazar) {
            var saludado = false, cerrado = false;
            function caer(err) {
                if (cerrado) return;
                cerrado = true; listo = null; clearTimeout(reloj);
                try { ws.close(); } catch (e) {}
                Object.keys(pendientes).forEach(function (k) { clearTimeout(pendientes[k].t); pendientes[k].rechazar(err); });
                pendientes = {};
                if (!saludado) rechazar(err);
            }
            var reloj = setTimeout(function () { caer(new Error("tiempo")); }, 45000);
            try { ws = new WebSocket(WS_URL); } catch (e) { return caer(new Error("conexion")); }
            ws.onerror = function () { caer(new Error("conexion")); };
            ws.onclose = function () { caer(new Error("conexion")); };
            ws.onmessage = function (ev) {
                buffer += ev.data;
                var i;
                while ((i = buffer.indexOf(MARCA)) >= 0) {
                    var crudo = buffer.slice(0, i).split("---SSkey---")[0];
                    buffer = buffer.slice(i + MARCA.length);
                    var m;
                    try { m = JSON.parse(crudo); } catch (e) { continue; }
                    if (!saludado && m.component === "servicio" && m.type === "init") {
                        saludado = true; clearTimeout(reloj); resolver(); continue;
                    }
                    /* La respuesta se reconoce por su identificador o, si el ERP no lo devuelve, por servicio y tipo. */
                    var id = m._ssocket_promise && pendientes[m._ssocket_promise] ? m._ssocket_promise : null;
                    if (!id) Object.keys(pendientes).some(function (k) {
                        var p = pendientes[k];
                        if (p.component === m.component && p.type === m.type) { id = k; return true; }
                        return false;
                    });
                    if (!id) continue;
                    var p = pendientes[id]; delete pendientes[id]; clearTimeout(p.t);
                    if (m.estado === "exito") p.resolver(m);
                    else p.rechazar(Object.assign(new Error(m.error || "error_erp"), { respuesta: m }));
                }
            };
        });
        return listo;
    }

    /* Envía un pedido y espera su respuesta. */
    function pedir(cuerpo, ms) {
        return conectar().then(function () {
            return new Promise(function (resolver, rechazar) {
                var id = idUnico();
                var p = { resolver: resolver, rechazar: rechazar, component: cuerpo.component, type: cuerpo.type };
                p.t = setTimeout(function () { delete pendientes[id]; rechazar(new Error("tiempo")); }, ms || 60000);
                pendientes[id] = p;
                cuerpo = Object.assign({ estado: "cargando" }, cuerpo, { _ssocket_promise: id });
                try { ws.send(JSON.stringify(cuerpo) + "\n"); }
                catch (e) { clearTimeout(p.t); delete pendientes[id]; rechazar(new Error("conexion")); }
            });
        });
    }

    /* El ERP espera la contraseña en MD5 (hexadecimal en minúsculas), igual que su web. */
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

    /* Ingreso: valida usuario y contraseña, y lee si tiene permiso en /accionistas de Calistenia Paraguay.
       Resuelve { key, nombre, permitido } ; permitido = null si no se pudieron leer los permisos. */
    function ingresar(usuario, password) {
        return pedir({ service: "usuario", component: "usuario", version: "2.0", type: "login", data: { usuario: usuario, password: md5(password) } }, 45000)
            .catch(function (err) {
                if (err.respuesta) throw new Error("error_login");
                throw err;
            })
            .then(function (m) {
                var d = m.data || {};
                var key = d.key || d.key_usuario;
                var nombre = String(d.Nombres || d.nombres || d.nombre || d.Nombre || "").trim().split(/\s+/)[0] || usuario;
                if (!key) return { key: null, nombre: nombre, permitido: null };
                return pedir({ version: "1.0", service: "roles_permisos", component: "usuarioPage", type: "getAll", key_usuario: key, key_empresa: KEY_EMPRESA }, 20000)
                    .then(function (r) { return { key: key, nombre: nombre, permitido: tienePermiso(r.data) }; },
                          function () { return { key: key, nombre: nombre, permitido: null }; });
            });
    }
    function tienePermiso(paginas) {
        if (!paginas) return null;
        var p = null;
        Object.keys(paginas).forEach(function (k) { var v = paginas[k]; if (v && (v.url === PAGINA || k === PAGINA)) p = v; });
        if (!p) return false;
        var permisos = p.permisos || {};
        return !!(permisos.ver || permisos.todo || Object.keys(permisos).length);
    }

    function valores(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        return Object.keys(data).map(function (k) { return data[k]; });
    }

    window.ERP = {
        KEY_EMPRESA: KEY_EMPRESA,
        pedir: pedir,
        /* Usuarios de la empresa: key_usuario -> nombre (alias) */
        usuarios: function () {
            return pedir({ service: "empresa", component: "empresa_usuario", type: "getAll", key_empresa: KEY_EMPRESA }, 30000)
                .then(function (m) { var r = {}; valores(m.data).forEach(function (x) { if (x && x.key_usuario) r[x.key_usuario] = String(x.alias || "").trim(); }); return r; });
        },
        /* Formas de pago de la empresa: key -> clase (caja = efectivo, banco = transferencia, …) */
        tiposPago: function () {
            return pedir({ service: "caja", component: "empresa_tipo_pago", type: "getAll", key_empresa: KEY_EMPRESA }, 30000)
                .then(function (m) { var r = {}; valores(m.data).forEach(function (x) { if (x && x.key) r[x.key] = { clase: x.key_tipo_pago, nombre: x.descripcion }; }); return r; });
        },
        PAGINA: PAGINA,
        ingresar: ingresar,
        /* Catálogo de productos: key_modelo -> key_tipo_producto */
        modelos: function (keyUsuario) {
            return pedir({ version: "1.0", service: "inventario", component: "modelo", type: "getAll", key_empresa: KEY_EMPRESA, key_usuario: keyUsuario }, 60000)
                .then(function (m) { var r = {}; valores(m.data).forEach(function (x) { if (x && x.key) r[x.key] = x.key_tipo_producto; }); return r; });
        },
        /* Movimientos de todas las cajas entre dos fechas (YYYY-MM-DD) */
        movimientos: function (desde, hasta) {
            return pedir({ service: "caja", component: "caja", type: "getAllMovimientosCajasByEmpresa", key_empresa: KEY_EMPRESA, fecha_inicio: desde, fecha_fin: hasta }, 90000)
                .then(function (m) { return valores(m.data); });
        },
        /* Venta completa con su detalle de productos */
        venta: function (key) {
            return pedir({ service: "compra_venta", component: "compra_venta", type: "getJson", key: key, key_empresa: KEY_EMPRESA }, 30000)
                .then(function (m) { var d = m.data; if (Array.isArray(d)) d = d[0]; if (d && !d.key && !d.detalle) { var v = valores(d); if (v.length === 1) d = v[0]; } return d; });
        },
        cerrar: function () { try { if (ws) ws.close(); } catch (e) {} listo = null; }
    };
})();
