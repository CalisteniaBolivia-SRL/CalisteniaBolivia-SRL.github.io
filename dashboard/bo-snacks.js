/* =====================================================================================================
   Snacks de Bolivia · lo común. En Bolivia, los paquetes se venden en el sistema de Calistenia y los snacks
   (bebidas, proteínas, tienda) y alquileres en el ERP S-ERP, empresa «Calistenia Bolivia». Este módulo lee esas
   ventas del ERP venta por venta (como «Ingresos en vivo») y las guarda en el equipo; comparte la misma memoria
   que «Ingresos en vivo» (bo_acc_snack_v1), así lo que una pantalla ya leyó no se vuelve a leer.
   - Muro, Dirección y Administración: suma una línea «+ Snacks» y el total en las tarjetas «Ingresos del mes» y
     «Ingresos de hoy».
   - El asistente Capital lo usa para responder con paquetes + snacks.
   En Paraguay no hace nada: allí el ERP ya trae paquetes, snacks y alquileres juntos.
   ===================================================================================================== */
(function () {
    "use strict";
    if (window.CM_PAIS === "paraguay") return;
    var KEY_EMPRESA = "d4118f82-0b0a-44e3-8525-73df48be69db";   // Calistenia Bolivia en el ERP
    var K_CACHE = "bo_acc_snack_v1", K_MOD = "bo_snack_modelos_v1";
    var ALQ = { "e98fbe7f-96d2-4e30-b734-b672783eaa9f": 1, "636e04ae-4600-4def-a3f3-ec7e053f67ce": 1, "04f24377-8dd9-464a-900c-714dc7f206d8": 1, "23bd81e3-ba2a-4fd2-91a4-a1ba9687925f": 1, "1074a23a-41d3-466b-b9f5-79627eef118c": 1 };
    function hoy() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 10); }
    var INICIO = (function () { var h = hoy(), y = +h.slice(0, 4), m = +h.slice(5, 7); var p = m === 1 ? (y - 1) + "-12" : y + "-" + String(m - 1).padStart(2, "0"); return p + "-01"; })();
    function leer(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
    function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    var ventas = leer(K_CACHE) || {}, modelos = (leer(K_MOD) || {}).m || null, oyentes = [], ocupado = false, ultimoCompleto = 0, primera = null;

    /* ---------- conexión con el ERP (la misma de «Ingresos en vivo», con la empresa de Bolivia) ---------- */
    function cargarERP() {
        if (window.ERP && window.ERP.KEY_EMPRESA === KEY_EMPRESA) return Promise.resolve(window.ERP);
        if (window.ERP) return Promise.reject(new Error("otra_empresa"));
        window.ERP_KEY_EMPRESA = KEY_EMPRESA;
        var base = /accionistas-py\//.test(location.pathname) ? "" : "../accionistas-py/";
        return new Promise(function (ok, mal) { var s = document.createElement("script"); s.src = base + "erp.js?v=3"; s.onload = function () { ok(window.ERP); }; s.onerror = mal; document.head.appendChild(s); });
    }
    function claveUsuario() { try { return (JSON.parse(localStorage.getItem("cb_centro_mando") || "{}").key_usuario) || ""; } catch (e) { return ""; } }
    function resumen(v, previo) {
        var r = { v: 3, f: String(v.fecha_on || "").slice(0, 10), membresias: 0, snacks: 0, alquileres: 0, otros: 0 };
        (v.detalle || v.detalles || []).forEach(function (d) {
            if (d.estado === 0) return;
            r[ALQ[(modelos || {})[d.key_modelo]] ? "alquileres" : "snacks"] += (Number(d.precio_unitario) || 0) * (Number(d.cantidad) || 0);
        });
        var desc = Number(v.descuento) || 0, t = r.snacks + r.alquileres;
        if (desc > 0 && t > 0) { r.snacks -= r.snacks / t * desc; r.alquileres -= r.alquileres / t * desc; }
        if (v.state !== "vendido" || v.estado === 0 || (previo && previo.anul)) r.anul = 1;
        return r;
    }
    function avisar() { oyentes.forEach(function (fn) { try { fn(); } catch (e) {} }); }
    /* Pone al día: hoy en cada vuelta; todo desde el mes anterior la primera vez y cada 10 minutos (anulaciones). */
    function actualizar(completo) {
        if (ocupado) return Promise.resolve(); ocupado = true;
        var h = hoy(), erp;
        return cargarERP().then(function (e) {
            erp = e;
            if (modelos) return modelos;
            return erp.modelos(claveUsuario()).then(function (m) { modelos = m; guardar(K_MOD, { m: m, f: Date.now() }); return m; });
        }).then(function () { return erp.movimientos(completo ? INICIO : h, h); }).then(function (movs) {
            var nuevas = {};
            movs.forEach(function (mv) {
                var k = mv.key_compra_venta, t = String(mv.tipo || ""); if (!k) return;
                if (t.indexOf("anulacion") === 0) { ventas[k] = ventas[k] || {}; ventas[k].anul = 1; }
                else if ((t === "venta" || t === "amortizacion") && !(ventas[k] && ventas[k].f && ventas[k].v === 3)) nuevas[k] = 1;
            });
            var keys = Object.keys(nuevas), i = 0, hechas = 0;
            function una() {
                if (i >= keys.length) return Promise.resolve();
                var k = keys[i++];
                return erp.venta(k).then(function (v) { if (v && v.key) { ventas[k] = resumen(v, ventas[k]); hechas++; } }, function () {})
                    .then(function () { if (hechas && hechas % 50 === 0) { guardar(K_CACHE, ventas); avisar(); } return una(); });
            }
            return Promise.all([una(), una(), una(), una()]);
        }).then(function () {
            if (completo) ultimoCompleto = Date.now();
            guardar(K_CACHE, ventas); ocupado = false; avisar();
        }, function (e) { ocupado = false; throw e; });
    }
    /* Totales de un rango (fechas AAAA-MM-DD, inclusive). */
    function totales(desde, hasta) {
        var r = { snacks: 0, alquileres: 0, ventas: 0, desde_datos: INICIO };
        Object.keys(ventas).forEach(function (k) { var v = ventas[k]; if (!v || !v.f || v.anul || v.f < desde || v.f > hasta) return; r.snacks += v.snacks || 0; r.alquileres += v.alquileres || 0; r.ventas++; });
        r.snacks = Math.round(r.snacks); r.alquileres = Math.round(r.alquileres);
        r.completo = desde >= INICIO;   // antes de INICIO no hay snacks leídos
        return r;
    }
    function porDia(desde, hasta) {
        var m = {};
        Object.keys(ventas).forEach(function (k) { var v = ventas[k]; if (!v || !v.f || v.anul || v.f < desde || v.f > hasta) return; var d = m[v.f] || (m[v.f] = { snacks: 0, alquileres: 0, ventas: 0 }); d.snacks += v.snacks || 0; d.alquileres += v.alquileres || 0; d.ventas++; });
        return m;
    }
    function arrancar() {
        if (primera) return primera;
        primera = actualizar(true).catch(function () {});
        setInterval(function () { if (document.hidden) return; actualizar(Date.now() - ultimoCompleto > 10 * 60000).catch(function () {}); }, 60000);
        return primera;
    }

    /* ---------- tarjetas «Ingresos del mes» / «Ingresos de hoy» ---------- */
    function plata(n) { return "Bs " + Math.round(n).toLocaleString("es-BO"); }
    var paquetes = { mes: null, hoy: null, leido: 0 };
    function leerPaquetes() {
        if (!window.CM || !CM.llamar || (Date.now() - paquetes.leido < 60000)) return Promise.resolve();
        var h = hoy(), ini = h.slice(0, 8) + "01";
        var tot = function (r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { return null; } } r = r && r.result && !r.totales ? r.result : r; return r && r.totales ? Number(r.totales.total) || 0 : null; };
        return Promise.all([CM.llamar("reporte_ventas", { desde: ini, hasta: h, agrupar_por: "dia" }).then(tot, function () { return null; }), CM.llamar("reporte_ventas", { desde: h, hasta: h, agrupar_por: "dia" }).then(tot, function () { return null; })])
            .then(function (a) { paquetes.mes = a[0]; paquetes.hoy = a[1]; paquetes.leido = Date.now(); });
    }
    function linea(card, t, paq) {
        var p = card.querySelector(".bo-snack"), sn = t.snacks + t.alquileres;
        if (!p) { p = document.createElement("p"); p.className = "cb-kpi-s bo-snack"; card.appendChild(p); }
        p.textContent = "+ " + (t.alquileres ? "Snacks y alquileres " : "Snacks ") + plata(sn) + (paq != null ? " · Total " + plata(paq + sn) : "");
    }
    function pintar() {
        var h = hoy(), ini = h.slice(0, 8) + "01", mes = totales(ini, h), dia = totales(h, h);
        Array.prototype.forEach.call(document.querySelectorAll(".cb-kpi"), function (card) {
            var t = (card.querySelector(".cb-kpi-l") || {}).textContent || "";
            if (/^Ingresos del mes$/i.test(t.trim())) linea(card, mes, paquetes.mes);
            else if (/^Ingresos de hoy$/i.test(t.trim())) linea(card, dia, paquetes.hoy);
        });
    }
    function enTablero() {
        if (!document.querySelector(".cb-kpi")) return;
        var css = document.createElement("style"); css.textContent = ".bo-snack{color:#C4C8CE;margin-top:4px}"; document.head.appendChild(css);
        oyentes.push(function () { leerPaquetes().then(pintar); });
        leerPaquetes().then(pintar); arrancar();
        setInterval(function () { if (!document.hidden) leerPaquetes().then(pintar); }, 60000);
    }

    window.BO_SNACKS = { arrancar: arrancar, actualizar: actualizar, totales: totales, porDia: porDia, alCambiar: function (fn) { oyentes.push(fn); }, INICIO: INICIO };
    if (!/accionistas-py\//.test(location.pathname)) {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enTablero); else enTablero();
    }
})();
