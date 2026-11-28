/* =====================================================================================================
   Snacks de Bolivia · lo común para el muro, Dirección, Administración, Contabilidad, Marketing, el asistente e
   «Ingresos en vivo». En Bolivia los paquetes se venden en el sistema de Calistenia y los snacks (bebidas,
   proteínas, tienda) y alquileres en el ERP S-ERP, empresa «Calistenia Bolivia» (desde el 7 de abril de 2026).
   Las ventas las lee el SERVIDOR (función snacksSync) y las guarda por mes en la base:
     snk_bo/AAAA-MM (cada venta) · bo_snack_mes/AAAA-MM (totales del mes)
   Acá solo se leen esos documentos (rápido, nada se guarda en el navegador) y se le pide al servidor que se ponga al
   día (como mucho cada 3 minutos). En Paraguay no hace nada: allí el ERP ya trae paquetes y snacks juntos.
   ===================================================================================================== */
(function () {
    "use strict";
    if (window.CM_PAIS === "paraguay") return;
    var INICIO = "2026-04-07";   // primera venta de snacks en el ERP de Bolivia
    /* Limpieza: las memorias viejas de snacks llenaban el navegador. */
    ["bo_acc_snack_v1", "bo_snack_modelos_v1", "snk_bo_v1", "snk_py_v1"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    function hoy() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 10); }
    function mesAnterior(m) { var y = +m.slice(0, 4), mm = +m.slice(5, 7) - 1; if (mm < 1) { mm = 12; y--; } return y + "-" + String(mm).padStart(2, "0"); }
    function mesesEntre(desde, hasta) { var l = [], m = hasta.slice(0, 7), ini = desde.slice(0, 7); while (m >= ini && l.length < 24) { l.push(m); m = mesAnterior(m); } return l; }
    var CFG = window.CM_FIREBASE_CONFIG || {};
    var SYNC = window.CM_SNACKS_SYNC || ("https://southamerica-east1-" + (CFG.projectId || "centro-de-comando-a57cf") + ".cloudfunctions.net/snacksSync");
    var docs = {}, cargando = {}, totalesMes = {}, oyentes = [];

    function db() { return window.firebase && firebase.apps.length && firebase.auth().currentUser ? firebase.firestore() : null; }
    function listo() { return window.CMFB && CMFB.listo ? CMFB.listo : Promise.resolve(); }
    function avisar() { oyentes.forEach(function (fn) { try { fn(); } catch (e) {} }); }
    /* Lee los meses pedidos (los del mes en curso se vuelven a leer si pasaron 2 minutos). */
    function cargarMeses(meses, forzar) {
        return listo().then(function () {
            var d = db(); if (!d) return;
            return Promise.all(meses.map(function (m) {
                if (!forzar && docs[m] && (m < hoy().slice(0, 7) || Date.now() - docs[m].t < 120000)) return null;
                if (cargando[m]) return cargando[m];
                return (cargando[m] = d.collection("snk_bo").doc(m).get().then(function (x) { docs[m] = { t: Date.now(), ventas: x.exists ? (x.data().ventas || {}) : {} }; }, function () {}).then(function () { delete cargando[m]; }));
            }));
        });
    }
    function leerTotalesMes() {
        return listo().then(function () { var d = db(); if (!d) return; return d.collection("bo_snack_mes").get().then(function (q) { q.forEach(function (x) { totalesMes[x.id] = x.data(); }); }, function () {}); });
    }
    /* Le pide al servidor que lea lo nuevo del ERP (no espera: si ya está al día, no hace nada). */
    var ultimoPedido = 0;
    function pedirSync() {
        if (Date.now() - ultimoPedido < 180000) return Promise.resolve(); ultimoPedido = Date.now();
        return fetch(SYNC + "?pais=bolivia", { method: "POST" }).then(function (r) { return r.json(); }).catch(function () { return null; });
    }
    /* Productos de una venta: el servidor los guarda como texto "key_modelo,cantidad,precio[,1 si es alquiler];…". */
    function lineas(it) { if (Array.isArray(it)) return it; return String(it || "").split(";").filter(Boolean).map(function (x) { var p = x.split(","); return [p[0], Number(p[1]) || 0, Number(p[2]) || 0, p[3] ? 1 : 0]; }); }
    function esAlquiler(l) { return l[3] === 1; }   // el servidor marca las líneas de alquiler
    function recorrer(desde, hasta, fn) {
        Object.keys(docs).forEach(function (m) {
            var vs = docs[m].ventas;
            Object.keys(vs).forEach(function (k) { var v = vs[k]; if (!v || v.a || !v.f) return; var d = v.f.slice(0, 10); if (d >= desde && d <= hasta) fn(v, d); });
        });
    }
    /* Totales de un rango (fechas AAAA-MM-DD, inclusive), con lo leído. */
    function totales(desde, hasta) {
        var r = { snacks: 0, alquileres: 0, ventas: 0 };
        recorrer(desde, hasta, function (v) { r.ventas++; lineas(v.it).forEach(function (l) { var m = l[1] * l[2]; if (esAlquiler(l)) r.alquileres += m; else r.snacks += m; }); });
        r.snacks = Math.round(r.snacks); r.alquileres = Math.round(r.alquileres); r.completo = desde >= INICIO;
        return r;
    }
    function porDia(desde, hasta) {
        var m = {};
        recorrer(desde, hasta, function (v, d) { var x = m[d] || (m[d] = { snacks: 0, alquileres: 0, ventas: 0 }); x.ventas++; lineas(v.it).forEach(function (l) { var s = l[1] * l[2]; if (esAlquiler(l)) x.alquileres += s; else x.snacks += s; }); });
        return m;
    }
    /* Snacks + alquileres de un mes completo (totales que guarda el servidor). */
    function delMes(m) { var g = totalesMes[m]; return g ? (Number(g.snacks) || 0) + (Number(g.alquileres) || 0) : null; }
    /* Deja listos los meses de un rango (por defecto, el mes en curso y el anterior). */
    function arrancar(desde, hasta) {
        var h = hoy(); hasta = hasta || h; desde = desde || mesAnterior(h.slice(0, 7)) + "-01";
        if (desde < INICIO) desde = INICIO;
        return cargarMeses(mesesEntre(desde, hasta)).then(function () { avisar(); });
    }

    /* ---------- tarjetas «Ingresos del mes» / «Ingresos de hoy» ---------- */
    function plata(n) { return "Bs " + Math.round(n).toLocaleString("es-BO"); }
    var paquetes = { mes: null, hoy: null, leido: 0, clave: "" };
    /* Período del tablero (selector de año/mes); en vivo: hoy y el mes en curso. */
    function rango() { var p = window.dash && dash.params ? dash.params() : {}; var h = p.hoy || hoy(); return { hoy: h, ini: p.ini_mes || h.slice(0, 8) + "01" }; }
    function leerPaquetes() {
        var r = rango(), clave = r.ini + r.hoy;
        if (!window.CM || !CM.llamar || (clave === paquetes.clave && Date.now() - paquetes.leido < 60000)) return Promise.resolve();
        var h = r.hoy, ini = r.ini; paquetes.clave = clave;
        var llamar = window.dash && dash.llamar ? dash.llamar : function (t, x) { return CM.llamar(t, x); };
        var tot = function (r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { return null; } } r = r && r.result && !r.totales ? r.result : r; return r && r.totales ? Number(r.totales.total) || 0 : null; };
        return Promise.all([llamar("reporte_ventas", { desde: ini, hasta: h, agrupar_por: "dia" }).then(tot, function () { return null; }), llamar("reporte_ventas", { desde: h, hasta: h, agrupar_por: "dia" }).then(tot, function () { return null; })])
            .then(function (a) { paquetes.mes = a[0]; paquetes.hoy = a[1]; paquetes.leido = Date.now(); });
    }
    function linea(card, t, paq) {
        var p = card.querySelector(".bo-snack"), sn = t.snacks + t.alquileres;
        if (!p) { p = document.createElement("p"); p.className = "cb-kpi-s bo-snack"; card.appendChild(p); }
        p.textContent = "+ " + (t.alquileres ? "Snacks y alquileres " : "Snacks ") + plata(sn) + (paq != null ? " · Total " + plata(paq + sn) : "");
    }
    function pintar() {
        var r = rango(), h = r.hoy, ini = r.ini, mes = totales(ini, h), dia = totales(h, h);
        Array.prototype.forEach.call(document.querySelectorAll(".cb-kpi"), function (card) {
            var t = ((card.querySelector(".cb-kpi-l") || {}).textContent || "").trim();
            if (/^Ingresos del mes$/i.test(t)) linea(card, mes, paquetes.mes);
            else if (/^Ingresos de hoy$/i.test(t)) linea(card, dia, paquetes.hoy);
        });
    }
    /* Gráficos «Ingresos por mes»: a cada mes se le suman los snacks del servidor (el detalle queda en el globo). */
    function enGraficos() {
        if (!window.dash || !dash.loader) return;
        dash.loader("ventas_12m", { fn: function (o) {
            var a = o && o.answer; if (a && a.error) throw new Error(typeof a.error === "string" ? a.error : a.error.message);
            return ((a && a.filas) || []).map(function (f) {
                var m = String(f.grupo).slice(0, 7), sn = delMes(m), paq = Number(f.total) || 0;
                return Object.assign({}, f, { paquetes: paq, snacks: sn || 0, total: paq + (sn || 0) });
            });
        } });
        var refrescar = function () { try { dash.refresh("ventas_12m"); } catch (e) {} };
        leerTotalesMes().then(refrescar);
        setInterval(function () { if (!document.hidden) leerTotalesMes().then(refrescar); }, 10 * 60000);
    }
    function vuelta() {
        if (document.hidden) return;
        pedirSync().then(function () { return Promise.all([cargarMeses([hoy().slice(0, 7)], true), leerPaquetes()]); }).then(function () { avisar(); });
    }
    function enTablero() {
        var hayKpi = !!document.querySelector(".cb-kpi");
        if (hayKpi) {
            var css = document.createElement("style"); css.textContent = ".bo-snack{color:#C4C8CE;margin-top:4px}"; document.head.appendChild(css);
            oyentes.push(pintar);
        }
        enGraficos();
        if (!hayKpi && !window.dash) return;
        var r0 = rango(), conPeriodo = window.CM_PERIODO && CM_PERIODO.elegido();
        Promise.all([conPeriodo ? arrancar(r0.ini, r0.hoy) : arrancar(), leerPaquetes()]).then(function () { avisar(); vuelta(); });
        setInterval(vuelta, 120000);
        /* Al cambiar el período: se leen los meses de ese período (los snacks están desde el 7 de abril de 2026). */
        window.addEventListener("cm-periodo", function () { var r = rango(); Promise.all([arrancar(r.ini, r.hoy), leerPaquetes()]).then(function () { avisar(); }); });
    }

    window.BO_SNACKS = { arrancar: arrancar, totales: totales, porDia: porDia, delMes: delMes, pedirSync: pedirSync, alCambiar: function (fn) { oyentes.push(fn); }, INICIO: INICIO };
    if (!/accionistas-py\//.test(location.pathname)) {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enTablero); else enTablero();
    }
})();
