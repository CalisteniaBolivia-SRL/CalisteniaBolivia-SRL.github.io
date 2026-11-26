/* =====================================================================================================
   Mis referidos (trabajador) y Administración de referidos. Bolivia y Paraguay (?pais=paraguay), montos en la moneda del país.
   Entra cualquier usuario del ERP con su usuario y contraseña; Dirección y Administración ven además la pestaña de administración.
   ===================================================================================================== */
(function () {
    "use strict";
    var R = window.REF_LOGICA, D = window.REF_DATOS, PY = D.PY;
    var MON = window.CM_MONEDA || (PY ? "Gs" : "Bs");
    var BASE = "https://calisteniabolivia-srl.github.io/r/";
    var $ = function (id) { return document.getElementById(id); };
    var est = { claims: {}, codigo: null, comisiones: [], liqs: [], cfg: null, paquetes: [], admin: false };

    function plata(n) { var v = Number(n) || 0; return MON + " " + v.toLocaleString(PY ? "es-PY" : "es-BO", { minimumFractionDigits: PY ? 0 : (v % 1 ? 2 : 0), maximumFractionDigits: PY ? 0 : 2 }); }
    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function msg(t, tipo) { var m = $("rf-estado"); m.textContent = t || ""; m.className = "rf-msg" + (tipo ? " is-" + tipo : ""); m.hidden = !t; }
    function fechaCorta(s) { if (!s) return "—"; var d = String(s).slice(0, 10).split("-"); return d[2] + "/" + d[1] + "/" + d[0]; }
    var NOMBRE_ESTADO = { pendiente: "Pendiente", ganada: "Ganada", pagada: "Pagada", revertida: "Revertida" };
    function chip(e) { return el("span", "rf-chip is-" + e, NOMBRE_ESTADO[e] || e); }
    function tabla(cols, filas, vacio) {
        if (!filas.length) return el("p", "rf-muted", vacio || "Todavía no hay datos.");
        var t = el("table", "rf-tabla"), h = el("tr");
        cols.forEach(function (c) { h.appendChild(el("th", c.num ? "is-num" : "", c.t)); });
        var th = el("thead"); th.appendChild(h); t.appendChild(th);
        var tb = el("tbody");
        filas.forEach(function (f) {
            var tr = el("tr");
            cols.forEach(function (c) { var td = el("td", c.num ? "is-num" : ""); var v = c.v(f); if (v instanceof Node) td.appendChild(v); else td.textContent = v == null ? "—" : v; tr.appendChild(td); });
            tb.appendChild(tr);
        });
        t.appendChild(tb); return t;
    }
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

    /* ---------- sesión ---------- */
    function claims() {
        var u = firebase.auth().currentUser;
        if (!u) return Promise.resolve({});
        return u.getIdTokenResult(true).then(function (t) { return t.claims || {}; }, function () { return {}; });
    }
    function esAdmin(c) {
        var bo = c.tableros || [], py = c.tableros_py || [];
        if (c.cm !== 1) return false;
        if (PY) return py.indexOf("direccion") >= 0 || py.indexOf("administracion") >= 0 || bo.indexOf("direccion") >= 0;
        return bo.indexOf("direccion") >= 0 || bo.indexOf("administracion") >= 0;
    }
    function mostrarLogin() {
        msg(""); $("rf-login").hidden = false;
        $("rf-form-login").onsubmit = function (e) {
            e.preventDefault();
            var f = e.target, b = $("rf-btn-login"), u = f.usuario.value.trim(), p = f.password.value;
            if (!u || !p) return;
            b.disabled = true; b.textContent = "Entrando…"; $("rf-login-error").textContent = "";
            CMFB.entrarConERP(u, md5(p)).then(function () { f.reset(); $("rf-login").hidden = true; return iniciar(); }, function (er) {
                $("rf-login-error").textContent = /incorrect/i.test(er.message) ? "Usuario o contraseña incorrectos." : er.message;
            }).then(function () { b.disabled = false; b.textContent = "Ingresar"; });
        };
    }
    function iniciar() {
        msg("Cargando…");
        return claims().then(function (c) {
            est.claims = c;
            if (!c.ref) { mostrarLogin(); return; }   // sesiones viejas (sin «ref») vuelven a ingresar una vez
            $("cm-quien").textContent = c.nombre ? "Hola, " + String(c.nombre).split(" ")[0] : "";
            $("rf-salir").hidden = false;
            est.admin = esAdmin(c);
            return Promise.all([D.miCodigo(), D.config()]).then(function (a) {
                est.codigo = a[0]; est.cfg = a[1].cfg; est.paquetes = a[1].paquetes;
                if (!est.codigo) { msg(""); return mostrarAlta(c); }
                return abrirPanel();
            });
        }).catch(function (e) { msg("No se pudo cargar: " + e.message, "bad"); });
    }
    $("rf-salir").onclick = function () { CMFB.salir().then(function () { location.reload(); }); };

    /* ---------- alta del código ---------- */
    function filaFamiliar(cont, f) {
        f = f || {};
        var d = el("div", "rf-fam-fila");
        [["nombre", "Nombre", 80], ["parentesco", "Parentesco", 30], ["ci", "Carnet", 20], ["telefono", "Celular", 20]].forEach(function (x) {
            var i = el("input"); i.dataset.k = x[0]; i.placeholder = x[1];   /* sin name: no choca con los campos del formulario */ i.maxLength = x[2]; i.value = f[x[0]] || ""; i.setAttribute("aria-label", x[1]); d.appendChild(i);
        });
        var q = el("button", "rf-btn rf-quitar", "Quitar"); q.type = "button"; q.onclick = function () { d.remove(); }; d.appendChild(q);
        cont.appendChild(d);
    }
    function leerFamiliares(cont) {
        return Array.prototype.map.call(cont.querySelectorAll(".rf-fam-fila"), function (d) {
            var o = {}; d.querySelectorAll("input").forEach(function (i) { o[i.dataset.k] = i.value; }); return o;
        });
    }
    function mostrarAlta(c) {
        var f = $("rf-form-alta"); $("rf-alta").hidden = false;
        f.nombre.value = c.nombre || "";
        var cont = $("rf-fam-filas"); cont.textContent = ""; filaFamiliar(cont);
        $("rf-fam-mas").onclick = function () { filaFamiliar(cont); };
        f.onsubmit = function (e) {
            e.preventDefault(); $("rf-alta-error").textContent = "";
            var b = f.querySelector("button[type=submit]"); b.disabled = true;
            D.crearCodigo({ nombre: f.nombre.value, codigo: f.codigo ? f.codigo.value : "", ci: f.ci.value, telefono: f.telefono.value, familiares: leerFamiliares(cont) })
                .then(function () { $("rf-alta").hidden = true; return iniciar(); }, function (er) { $("rf-alta-error").textContent = er.message; })
                .then(function () { b.disabled = false; });
        };
    }

    /* ---------- panel del trabajador ---------- */
    function linkDe(codigo) { return BASE + "?c=" + encodeURIComponent(codigo) + (PY ? "&p=py" : ""); }
    function abrirPanel() {
        $("rf-tabs").hidden = false; $("rf-tab-admin").hidden = !est.admin;
        document.querySelectorAll(".rf-tab").forEach(function (t) {
            t.onclick = function () {
                document.querySelectorAll(".rf-tab").forEach(function (x) { x.classList.toggle("is-on", x === t); });
                $("rf-panel").hidden = t.dataset.tab !== "panel"; $("rf-admin").hidden = t.dataset.tab !== "admin";
                if (t.dataset.tab === "admin") abrirAdmin();
            };
        });
        $("rf-panel").hidden = false;
        pintarCodigo();
        var per = R.periodo(new Date().toISOString());
        return Promise.all([D.misComisiones(), D.misLiquidaciones(), D.rankingPeriodo(per.clave).catch(function () { return null; })]).then(function (a) {
            est.comisiones = a[0]; est.liqs = a[1];
            msg("");
            pintarResumen(); pintarRanking(a[2], per); pintarPaquetes(); pintarVentas(); pintarPagos(); pintarFamiliares(); pintarAnotados();
        });
    }
    /* Quiénes se anotaron con mi código: solo el nombre y la fecha. */
    function pintarAnotados() {
        var box = $("rf-anotados"); if (!box || !est.codigo) return;
        box.textContent = "Cargando…";
        D.misAnotados(est.codigo.codigo).then(function (l) {
            box.textContent = "";
            if (!l.length) { box.appendChild(el("p", "rf-muted", "Todavía nadie se anotó con tu código. Compartí tu link o tu QR.")); return; }
            box.appendChild(el("p", "rf-muted", l.length + (l.length === 1 ? " persona se anotó" : " personas se anotaron") + " con tu código."));
            var ul = el("ul", "rf-anotados-lista");
            l.forEach(function (x) { var li = el("li"); li.appendChild(el("b", "", x.nombre || "—")); li.appendChild(el("span", "rf-muted", " · " + fechaCorta(x.fecha_on))); ul.appendChild(li); });
            box.appendChild(ul);
        }, function () { box.textContent = ""; box.appendChild(el("p", "rf-muted", "No se pudo cargar la lista. Probá de nuevo en un rato.")); });
    }
    function pintarCodigo() {
        var c = est.codigo.codigo, link = linkDe(c);
        $("rf-codigo").textContent = R.mostrarCodigo(c); $("rf-link").textContent = link.replace("https://", ""); $("rf-link").href = link;
        var of = $("rf-oferta"); if (of) { of.textContent = ""; of.appendChild(document.createTextNode("Tus invitados tienen ")); of.appendChild(el("b", "", (R.DESC_CLIENTE || 15) + " % de descuento")); of.appendChild(document.createTextNode(" en su paquete (clientes nuevos y actuales). Contáselo: sale en tu link, en el QR y en el mensaje de WhatsApp. Tu comisión es por cada cliente nuevo que compra.")); }
        var texto = "¡Hola! 💪 Entrená calistenia en Calistenia Company con " + (R.DESC_CLIENTE || 15) + " % de descuento en tu paquete. Anotate con mi código " + R.mostrarCodigo(c) + " antes de pagar en caja: " + link;
        $("rf-wa").href = "https://wa.me/?text=" + encodeURIComponent(texto);
        $("rf-copiar").onclick = function () {
            var hecho = function () { $("rf-copiar").textContent = "¡Copiado!"; setTimeout(function () { $("rf-copiar").textContent = "Copiar link"; }, 1800); };
            if (navigator.clipboard) navigator.clipboard.writeText(link).then(hecho, function () {}); else hecho();
        };
        var q = $("rf-qr"); q.textContent = "";
        if (window.qrcode) {
            var qr = qrcode(0, "M"); qr.addData(link); qr.make();
            q.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
            $("rf-qr-bajar").onclick = function () { var a = document.createElement("a"); a.href = qr.createDataURL(10, 4); a.download = "QR-" + c + ".gif"; a.click(); };
        } else { q.appendChild(el("p", "rf-muted", "No se pudo cargar el QR.")); $("rf-qr-bajar").hidden = true; }
    }
    function kpi(cont, t, v, sub, cls) { var d = el("div", "rf-kpi" + (cls ? " " + cls : "")); d.appendChild(el("span", "rf-kpi-t", t)); d.appendChild(el("strong", "rf-kpi-v", v)); if (sub) d.appendChild(el("span", "rf-kpi-s", sub)); cont.appendChild(d); }
    function pintarResumen() {
        var r = R.resumen(est.comisiones, new Date().toISOString()), k = $("rf-kpis"); k.textContent = "";
        kpi(k, "Cierres hoy", String(r.cierres_dia)); kpi(k, "Esta semana", String(r.cierres_semana)); kpi(k, "Este período", String(r.cierres_periodo), "del " + fechaCorta(r.periodo.desde) + " al " + fechaCorta(r.periodo.hasta));
        kpi(k, "Ganado por cobrar", plata(r.ganada), "se paga al corte del 25", "is-fuerte");
        kpi(k, "Pendiente", plata(r.pendiente), "ventas sin pago todavía");
        kpi(k, "Ya cobrado", plata(r.pagada));
        kpi(k, r.saldo < 0 ? "Saldo en contra" : "Saldo a favor", plata(Math.abs(r.saldo)), r.en_contra ? "descuento por ventas anuladas: " + plata(r.en_contra) : "", r.saldo < 0 ? "is-bad" : "");
        var m = R.metaYBonos(r.cierres_periodo, est.cfg), box = $("rf-meta"); box.textContent = "";
        box.appendChild(el("h2", "", "Tu meta del período"));
        if (!m.meta && !m.proximo) { box.appendChild(el("p", "rf-muted", "Todavía no hay metas ni bonos configurados.")); return; }
        var t = m.proximo ? "Te faltan " + m.proximo.faltan + (m.proximo.faltan === 1 ? " cierre" : " cierres") + " para tu bono de " + plata(m.proximo.monto) + "."
            : "¡Cumpliste todos los bonos del período! 🎉";
        box.appendChild(el("p", "rf-meta-txt", t));
        var barra = el("div", "rf-barra"), i = el("i"); i.style.width = Math.round(m.avance * 100) + "%"; barra.appendChild(i); box.appendChild(barra);
        box.appendChild(el("p", "rf-muted", r.cierres_periodo + " de " + m.meta + " cierres" + (m.bono_ganado ? " · bonos ganados: " + plata(m.bono_ganado) : "")));
        var bonos = (est.cfg.bonos || []).slice().sort(function (a, b) { return a.cierres - b.cierres; });
        if (bonos.length) box.appendChild(el("p", "rf-muted", "Bonos: " + bonos.map(function (b) { return b.cierres + " cierres → " + plata(b.monto); }).join(" · ")));
    }
    function pintarRanking(doc, per) {
        $("rf-rank-per").textContent = "Del " + fechaCorta(per.desde) + " al " + fechaCorta(per.hasta) + " · por cierres";
        var filas = (doc && doc.filas) || [], yo = est.codigo.key_usuario;
        var t = tabla([{ t: "#", v: function (f) { return String(f.puesto); } }, { t: "Compañero", v: function (f) { return f.key === yo ? f.nombre + " (vos)" : f.nombre; } },
            { t: "Cierres", num: 1, v: function (f) { return String(f.cierres); } }], filas.slice(0, 15), "Todavía no hay cierres en este período.");
        $("rf-ranking").textContent = ""; $("rf-ranking").appendChild(t);
        var mio = t.querySelectorAll && Array.prototype.filter.call(t.querySelectorAll("tbody tr"), function (tr) { return /\(vos\)/.test(tr.textContent); })[0];
        if (mio) mio.classList.add("is-yo");
    }
    function pintarPaquetes() {
        var filas = R.tablaPaquetes(est.paquetes, est.cfg);
        $("rf-paquetes").textContent = "";
        $("rf-paquetes").appendChild(tabla([{ t: "Paquete", v: function (f) { return f.nombre; } }, { t: "Precio", num: 1, v: function (f) { return plata(f.precio); } },
            { t: "Ganás", num: 1, v: function (f) { return el("b", "", plata(f.gana)); } }], filas, "La lista de paquetes se carga cuando Administración actualiza el cruce con el ERP."));
    }
    function pintarVentas() {
        var filas = est.comisiones.slice().sort(function (a, b) { return String(b.fecha_venta).localeCompare(String(a.fecha_venta)); });
        $("rf-ventas").textContent = "";
        $("rf-ventas").appendChild(tabla([{ t: "Fecha", v: function (f) { return fechaCorta(f.fecha_venta); } }, { t: "Cliente", v: function (f) { return f.cliente; } },
            { t: "Paquete", v: function (f) { return f.paquete; } }, { t: "Sucursal", v: function (f) { return f.sucursal; } }, { t: "Estado", v: function (f) { return chip(f.estado); } },
            { t: "Comisión", num: 1, v: function (f) { return f.estado === "pendiente" ? "≈ " + plata(f.estimada) : (f.estado === "revertida" ? "− " : "") + plata(f.comision); } }],
            filas, "Todavía no tenés ventas con tu código. ¡Compartilo!"));
    }
    function pintarPagos() {
        var filas = est.liqs.slice().sort(function (a, b) { return String(b.fecha_on).localeCompare(String(a.fecha_on)); });
        $("rf-pagos").textContent = "";
        $("rf-pagos").appendChild(tabla([{ t: "Fecha", v: function (f) { return fechaCorta(f.fecha_on); } }, { t: "Comisiones", num: 1, v: function (f) { return plata(f.bruto); } },
            { t: "Bono", num: 1, v: function (f) { return plata(f.bono); } }, { t: "Descuentos", num: 1, v: function (f) { return f.descuento ? "− " + plata(f.descuento) : "—"; } },
            { t: "Cobrado", num: 1, v: function (f) { return el("b", "", plata(f.neto)); } }], filas, "Todavía no recibiste pagos."));
    }
    function pintarFamiliares() {
        var box = $("rf-fam-edit"); box.textContent = "";
        var cont = el("div"); box.appendChild(cont);
        (est.codigo.familiares || []).forEach(function (f) { filaFamiliar(cont, f); });
        if (!(est.codigo.familiares || []).length) filaFamiliar(cont);
        var acc = el("div", "rf-acciones"), mas = el("button", "rf-btn", "+ Agregar familiar"), g = el("button", "rf-btn is-fuerte", "Guardar"), ok = el("span", "rf-muted");
        mas.type = g.type = "button"; mas.onclick = function () { filaFamiliar(cont); };
        g.onclick = function () { g.disabled = true; D.guardarFamiliares(leerFamiliares(cont)).then(function () { ok.textContent = "Guardado."; }, function (e) { ok.textContent = e.message; }).then(function () { g.disabled = false; }); };
        acc.appendChild(mas); acc.appendChild(g); acc.appendChild(ok); box.appendChild(acc);
    }

    /* ---------- administración ---------- */
    var adm = { abierto: false, comisiones: [], codigos: [], liqs: [] };
    function abrirAdmin() {
        if (adm.abierto) return; adm.abierto = true;
        pintarConfig(); cargarAdmin().then(function () { if (!PY && window.CM && CM.conSesion && CM.conSesion()) sincronizar(); });
        $("rf-sinc").onclick = sincronizar;
        ["rf-f-estado", "rf-f-desde", "rf-f-hasta", "rf-f-trab"].forEach(function (id) { $(id).onchange = pintarComisionesAdmin; });
    }
    function cargarAdmin() {
        return Promise.all([D.comisionesTodas(), D.codigosTodos(), D.liquidacionesTodas(), D.listar("ref_alerta", 200), D.listar("ref_inscripcion", 100)]).then(function (a) {
            adm.comisiones = a[0]; adm.codigos = a[1]; adm.liqs = a[2];
            var sel = $("rf-f-trab"), val = sel.value; sel.length = 1;
            adm.codigos.slice().sort(function (x, y) { return String(x.nombre).localeCompare(String(y.nombre)); }).forEach(function (c) { var o = el("option", "", c.nombre + " · " + c.codigo); o.value = c.key_usuario; sel.appendChild(o); });
            sel.value = val;
            pintarAlertas(a[3]); pintarComisionesAdmin(); pintarLiquidacion(); pintarInscripciones(a[4]); pintarCodigos();
        }).catch(function (e) { msg("No se pudo leer la administración: " + e.message, "bad"); });
    }
    function sincronizar() {
        var b = $("rf-sinc"), t = $("rf-sinc-txt");
        if (!PY && !(window.CM && CM.conSesion && CM.conSesion())) {
            t.textContent = "Para cruzar con el ERP falta conectar los datos de Calistenia (una sola vez, con tu usuario del ERP).";
            b.textContent = "Conectar datos"; b.onclick = function () { CM.iniciarSesion("referidos.html"); }; return;
        }
        b.disabled = true; b.textContent = "Actualizando…";
        D.sincronizar(function (x) { t.textContent = x; }).then(function (r) {
            if (r.aviso) { t.textContent = r.aviso; return; }
            t.textContent = "Listo: " + r.inscripciones + " inscripciones revisadas (" + r.validas + " válidas, " + r.rechazadas + " rechazadas), " + r.comisiones_nuevas + " ventas nuevas y " + r.cambios + " cambios de estado." + (r.errores.length ? " Con " + r.errores.length + " errores: " + r.errores.slice(0, 3).join(" · ") : "");
            return cargarAdmin();
        }, function (e) { t.textContent = "No se pudo actualizar: " + e.message; }).then(function () { b.disabled = false; b.textContent = "Actualizar ahora"; });
    }
    var TIPO_ALERTA = { propio: "Código propio", familiar: "Familiar", existente: "Cliente que ya compraba", duplicado: "Ya tenía otro código", apellido: "Mismos apellidos" };
    function pintarAlertas(lista) {
        var box = $("rf-alertas"); box.textContent = "";
        var nuevas = lista.filter(function (a) { return a.estado === "nueva"; });
        box.appendChild(el("h2", "", "Alertas de fraude" + (nuevas.length ? " · " + nuevas.length + " sin revisar" : "")));
        box.appendChild(tabla([{ t: "Fecha", v: function (f) { return fechaCorta(f.fecha_on); } }, { t: "Tipo", v: function (f) { return el("span", "rf-chip is-alerta", TIPO_ALERTA[f.tipo] || f.tipo); } },
            { t: "Trabajador", v: function (f) { return (f.trabajador || "—") + (f.codigo ? " · " + f.codigo : ""); } }, { t: "Cliente", v: function (f) { return f.cliente + (f.ci ? " · CI " + f.ci : ""); } },
            { t: "Detalle", v: function (f) { return f.detalle; } },
            { t: "", v: function (f) { if (f.estado !== "nueva") return "Revisada"; var b = el("button", "rf-btn", "Marcar revisada"); b.type = "button"; b.onclick = function () { b.disabled = true; D.marcarAlerta(f.id, "revisada").then(cargarAdmin); }; return b; } }],
            lista.slice(0, 60), "Sin alertas."));
    }
    function filtradas() {
        var e = $("rf-f-estado").value, d = $("rf-f-desde").value, h = $("rf-f-hasta").value, t = $("rf-f-trab").value;
        return adm.comisiones.filter(function (c) { var f = String(c.fecha_venta).slice(0, 10); return (!e || c.estado === e) && (!d || f >= d) && (!h || f <= h) && (!t || c.key_trabajador === t); });
    }
    function pintarComisionesAdmin() {
        var f = filtradas(), box = $("rf-a-comisiones"); box.textContent = "";
        var tot = f.reduce(function (s, c) { return s + (c.estado === "revertida" ? 0 : Number(c.comision) || 0); }, 0);
        box.appendChild(el("p", "rf-muted", f.length + " ventas · comisiones (sin revertidas): " + plata(tot)));
        box.appendChild(tabla([{ t: "Fecha", v: function (c) { return fechaCorta(c.fecha_venta); } }, { t: "Trabajador", v: function (c) { return c.trabajador + " · " + c.codigo; } },
            { t: "Cliente", v: function (c) { return c.cliente; } }, { t: "Paquete", v: function (c) { return c.paquete; } }, { t: "Sucursal", v: function (c) { return c.sucursal; } },
            { t: "Cobrado", num: 1, v: function (c) { return plata(c.cobrado); } }, { t: "%", num: 1, v: function (c) { return c.pct != null ? String(c.pct).replace(".", ",") : "—"; } },
            { t: "Comisión", num: 1, v: function (c) { return c.estado === "pendiente" ? "≈ " + plata(c.estimada) : plata(c.comision); } }, { t: "Estado", v: function (c) { return chip(c.estado); } }], f, "No hay comisiones con esos filtros."));
    }
    function pintarLiquidacion() {
        var por = {};
        adm.comisiones.forEach(function (c) { (por[c.key_trabajador] = por[c.key_trabajador] || []).push(c); });
        var filas = Object.keys(por).map(function (k) {
            var cod = adm.codigos.filter(function (x) { return x.key_usuario === k; })[0] || { key_usuario: k, nombre: por[k][0].trabajador, codigo: por[k][0].codigo };
            var r = R.resumen(por[k], new Date().toISOString()), m = R.metaYBonos(r.cierres_periodo, est.cfg);
            return { cod: cod, coms: por[k], liq: R.liquidacion(por[k], 0), bono: m.bono_ganado, cierres: r.cierres_periodo };
        }).filter(function (f) { return f.liq.bruto || f.liq.descuento; }).sort(function (a, b) { return b.liq.neto - a.liq.neto; });
        var box = $("rf-a-liq"); box.textContent = "";
        box.appendChild(tabla([{ t: "Trabajador", v: function (f) { return f.cod.nombre + " · " + f.cod.codigo; } }, { t: "Ganadas", num: 1, v: function (f) { return f.liq.ganadas.length + " · " + plata(f.liq.bruto); } },
            { t: "En contra", num: 1, v: function (f) { return f.liq.descuento ? "− " + plata(f.liq.descuento) : "—"; } },
            { t: "Bono", num: 1, v: function (f) { var i = el("input", "rf-input-num"); i.type = "number"; i.min = "0"; i.step = "1"; i.value = String(f.bono || 0); i.setAttribute("aria-label", "Bono"); f.inputBono = i; return i; } },
            { t: "A pagar", num: 1, v: function (f) { return el("b", "", plata(f.liq.neto + (f.bono || 0))); } },
            { t: "", v: function (f) {
                var b = el("button", "rf-btn is-fuerte", "Pagado"); b.type = "button";
                b.onclick = function () {
                    var bono = Number(f.inputBono.value) || 0;
                    if (!confirm("¿Marcar como pagado a " + f.cod.nombre + " " + plata(R.liquidacion(f.coms, bono).neto) + "?")) return;
                    b.disabled = true; D.liquidar(f.cod, f.coms, bono).then(cargarAdmin, function (e) { alert(e.message); b.disabled = false; });
                };
                return b;
            } }], filas, "No hay nada para liquidar."));
        if (adm.liqs.length) {
            box.appendChild(el("h3", "rf-h3", "Pagos hechos"));
            box.appendChild(tabla([{ t: "Fecha", v: function (l) { return fechaCorta(l.fecha_on); } }, { t: "Trabajador", v: function (l) { return l.nombre + " · " + l.codigo; } },
                { t: "Comisiones", num: 1, v: function (l) { return plata(l.bruto); } }, { t: "Bono", num: 1, v: function (l) { return plata(l.bono); } },
                { t: "Descuentos", num: 1, v: function (l) { return l.descuento ? "− " + plata(l.descuento) : "—"; } }, { t: "Pagado", num: 1, v: function (l) { return plata(l.neto); } }], adm.liqs.slice(0, 50)));
        }
    }
    function pintarInscripciones(lista) {
        var box = $("rf-a-ins"); box.textContent = "";
        box.appendChild(tabla([{ t: "Fecha", v: function (f) { return fechaCorta(f.fecha_on); } }, { t: "Código", v: function (f) { return f.codigo; } }, { t: "Cliente", v: function (f) { return f.nombre; } },
            { t: "CI", v: function (f) { return f.ci; } }, { t: "Celular", v: function (f) { return f.telefono; } },
            { t: "Estado", v: function (f) { return el("span", "rf-chip is-" + (f.estado === "valida" ? "ganada" : f.estado === "rechazada" ? "revertida" : "pendiente"), f.estado === "nueva" ? "Por revisar" : f.estado === "valida" ? "Válida" : "Rechazada"); } },
            { t: "Motivo", v: function (f) { return f.motivo || ""; } }], lista, "Todavía nadie se anotó con un código."));
    }
    function pintarCodigos() {
        var box = $("rf-a-codigos"); box.textContent = "";
        box.appendChild(tabla([{ t: "Código", v: function (c) { return el("b", "", c.codigo); } }, { t: "Trabajador", v: function (c) { return c.nombre; } },
            { t: "Familiares", num: 1, v: function (c) { return String((c.familiares || []).length); } }, { t: "Desde", v: function (c) { return fechaCorta(c.fecha_on); } }],
            adm.codigos.slice().sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); }), "Todavía nadie creó su código."));
    }
    function pintarConfig() {
        var c = est.cfg || {}, box = $("rf-config"); box.textContent = "";
        box.appendChild(el("h2", "", "Configuración"));
        box.appendChild(el("p", "rf-muted", "El porcentaje se aplica sobre lo cobrado. Los cambios valen para las ventas que se paguen desde ahora: lo ya ganado queda congelado. Los trabajadores ven solo montos, nunca el porcentaje."));
        box.appendChild(el("p", "rf-muted", "Oferta para el cliente: " + (R.DESC_CLIENTE || 15) + " % de descuento en su paquete, clientes nuevos y actuales (sale en la página de inscripción y en el mensaje de WhatsApp; Caja lo aplica al cobrar). Comisión sugerida para el equipo: " + R.PCT_DEFECTO + " %."));
        var f = el("form", "rf-form rf-cfg");
        var pct = el("label", "", "Comisión global (%) "), ip = el("input"); ip.type = "number"; ip.step = "0.1"; ip.min = "0"; ip.max = "50"; ip.value = c.pct != null ? c.pct : R.PCT_DEFECTO; pct.appendChild(ip); f.appendChild(pct);
        var meta = el("label", "", "Meta de cierres por período "), im = el("input"); im.type = "number"; im.min = "0"; im.value = c.meta_cierres || 0; meta.appendChild(im); f.appendChild(meta);
        var fb = el("fieldset", "rf-fam"); fb.appendChild(el("legend", "", "Bonos por cierres en el período (26 al 25)"));
        var bonos = el("div"); fb.appendChild(bonos);
        var filaBono = function (b) { var d = el("div", "rf-fam-fila"); var x = el("input"); x.type = "number"; x.min = "1"; x.placeholder = "Cierres"; x.value = b ? b.cierres : ""; var y = el("input"); y.type = "number"; y.min = "1"; y.placeholder = "Bono (" + MON + ")"; y.value = b ? b.monto : ""; var q = el("button", "rf-btn rf-quitar", "Quitar"); q.type = "button"; q.onclick = function () { d.remove(); }; d.appendChild(x); d.appendChild(y); d.appendChild(q); bonos.appendChild(d); };
        (c.bonos || []).forEach(filaBono); if (!(c.bonos || []).length) filaBono();
        var mb = el("button", "rf-btn", "+ Agregar bono"); mb.type = "button"; mb.onclick = function () { filaBono(); }; fb.appendChild(mb); f.appendChild(fb);
        var fp = el("fieldset", "rf-fam"); fp.appendChild(el("legend", "", "Porcentaje por paquete (opcional)"));
        var pps = el("div"); fp.appendChild(pps);
        var dl = el("datalist"); dl.id = "rf-dl-paq"; est.paquetes.forEach(function (p) { var o = el("option"); o.value = p.nombre; dl.appendChild(o); }); fp.appendChild(dl);
        var filaPP = function (n, v) { var d = el("div", "rf-fam-fila"); var x = el("input"); x.placeholder = "Paquete"; x.setAttribute("list", "rf-dl-paq"); x.value = n || ""; var y = el("input"); y.type = "number"; y.step = "0.1"; y.min = "0"; y.placeholder = "%"; y.value = v != null ? v : ""; var q = el("button", "rf-btn rf-quitar", "Quitar"); q.type = "button"; q.onclick = function () { d.remove(); }; d.appendChild(x); d.appendChild(y); d.appendChild(q); pps.appendChild(d); };
        Object.keys(c.pct_paquete || {}).forEach(function (k) { filaPP(k, c.pct_paquete[k]); });
        var mp = el("button", "rf-btn", "+ Agregar paquete"); mp.type = "button"; mp.onclick = function () { filaPP(); }; fp.appendChild(mp); f.appendChild(fp);
        var g = el("button", "rf-btn is-fuerte", "Guardar configuración"), ok = el("span", "rf-muted"); g.type = "submit"; f.appendChild(g); f.appendChild(ok);
        f.onsubmit = function (e) {
            e.preventDefault();
            var bs = Array.prototype.map.call(bonos.querySelectorAll(".rf-fam-fila"), function (d) { var i = d.querySelectorAll("input"); return { cierres: i[0].value, monto: i[1].value }; });
            var pp = {}; Array.prototype.forEach.call(pps.querySelectorAll(".rf-fam-fila"), function (d) { var i = d.querySelectorAll("input"); if (i[0].value.trim() && i[1].value !== "") pp[i[0].value.trim()] = Number(i[1].value); });
            g.disabled = true;
            D.guardarConfig({ pct: ip.value, meta_cierres: im.value, bonos: bs, pct_paquete: pp }).then(function () { ok.textContent = "Guardado."; return D.config(); })
                .then(function (x) { if (x) { est.cfg = x.cfg; pintarResumen(); pintarPaquetes(); } }, function (er) { ok.textContent = er.message; }).then(function () { g.disabled = false; });
        };
        box.appendChild(f);
        box.appendChild(seccionOferta());
    }
    /* Cobro a referidos: los datos de pago (texto y QR) y los paquetes con el descuento que ve el cliente al anotarse. */
    function seccionOferta() {
        var s = el("div", "rf-oferta-cfg"); s.appendChild(el("h2", "", "Cobro a referidos (venta en el momento)"));
        s.appendChild(el("p", "rf-muted", "Al anotarse, el cliente elige su paquete con el descuento, paga por transferencia o QR y sube el comprobante. Cargá acá los datos de cobro de " + (PY ? "Paraguay" : "Bolivia") + " y tocá «Publicar». Los paquetes salen de la lista del ERP (se actualiza con «Actualizar ahora»)."));
        var f = el("form", "rf-form rf-cfg");
        var ld = el("label", "", "Descuento para el cliente (%) "), idd = el("input"); idd.type = "number"; idd.min = "0"; idd.max = "50"; idd.value = R.DESC_CLIENTE; ld.appendChild(idd); f.appendChild(ld);
        var lt = el("label", "", "Datos para pagar (banco, cuenta, titular, CI/NIT, y a qué número mandar dudas)"), ta = el("textarea"); ta.rows = 5; ta.maxLength = 800; lt.appendChild(ta); f.appendChild(lt);
        var lq = el("label", "", "QR de cobro (foto o captura, opcional) "), iq = el("input"); iq.type = "file"; iq.accept = "image/*"; lq.appendChild(iq); f.appendChild(lq);
        var ver = el("img", "rf-qr-cobro"); ver.alt = "QR de cobro"; ver.hidden = true; f.appendChild(ver);
        var quitar = el("button", "rf-btn rf-quitar", "Quitar QR"); quitar.type = "button"; quitar.hidden = true; f.appendChild(quitar);
        var qr = "";
        var mostrar = function () { ver.hidden = !qr; quitar.hidden = !qr; if (qr) ver.src = qr; };
        quitar.onclick = function () { qr = ""; iq.value = ""; mostrar(); };
        iq.onchange = function () {
            var file = iq.files && iq.files[0]; if (!file) return;
            var img = new Image(), url = URL.createObjectURL(file);
            img.onload = function () { var k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); var x = c.getContext("2d"); x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); qr = c.toDataURL("image/png"); if (qr.length > 500000) qr = c.toDataURL("image/jpeg", 0.85); URL.revokeObjectURL(url); mostrar(); };
            img.src = url;
        };
        var lista = el("p", "rf-muted", est.paquetes.length ? est.paquetes.length + " paquetes del ERP se van a publicar con el descuento." : "Todavía no hay lista de paquetes: tocá «Actualizar ahora» en Administración para traerla del ERP.");
        f.appendChild(lista);
        var g = el("button", "rf-btn is-fuerte", "Publicar"), ok = el("span", "rf-muted"); g.type = "submit"; f.appendChild(g); f.appendChild(ok);
        D.oferta().then(function (o) { if (!o) return; if (o.desc != null) idd.value = o.desc; ta.value = o.pago_texto || ""; qr = o.pago_qr || ""; mostrar(); ok.textContent = "Publicado el " + fechaCorta(o.fecha_on) + "."; }, function () {});
        f.onsubmit = function (e) {
            e.preventDefault();
            if (!ta.value.trim() && !qr) { ok.textContent = "Cargá los datos para pagar o el QR."; return; }
            if (!est.paquetes.length) { ok.textContent = "Primero traé la lista de paquetes con «Actualizar ahora»."; return; }
            g.disabled = true; ok.textContent = "Publicando…";
            D.guardarOferta({ desc: idd.value, pago_texto: ta.value.trim(), pago_qr: qr }, est.paquetes).then(function () { ok.textContent = "Publicado: ya lo ven los clientes al anotarse."; }, function (er) { ok.textContent = er.message; }).then(function () { g.disabled = false; });
        };
        s.appendChild(f);
        return s;
    }

    /* ---------- arranque ---------- */
    if (PY) $("rf-eyebrow").textContent = "Calistenia Company · Paraguay · Referidos";
    CMFB.listo.then(function () {
        if (!firebase.auth().currentUser) { mostrarLogin(); return; }
        return iniciar();
    });
})();
