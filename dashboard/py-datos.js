/* Datos de Paraguay para los módulos compartidos del centro de mando.
   Regla del proyecto: los módulos son los mismos para todos los países; cada país lee SUS datos. En Paraguay
   (window.CM_PAIS === "paraguay") este adaptador responde las mismas consultas que el MCP de Calistenia Bolivia
   (reporte_ventas, clientes_por_vencer, clientes_vencidos, listar_clientes_activos…) pero con el ERP de Calistenia
   Paraguay. Lo que Paraguay todavía no tiene (asistencia, molinetes…) responde vacío: NUNCA datos de Bolivia.
   Memoria: el resumen de cada venta se comparte con «Ingresos en vivo» (localStorage py_acc_ventas_v1 y
   Firestore py_ventas/AAAA-MM). Versión 2 del resumen: total, productos, cajero, cliente y días de membresía. */
(function () {
    "use strict";
    var INICIO = "2026-04-01", SUCURSAL = "Multiplaza", K_CACHE = "py_acc_ventas_v1";
    var TIPOS = { "cdb00245-a58c-4149-9c3a-abe76cc5a28a": "membresias", "1bf01e71-083c-446d-b09a-d7dc61a3d6e2": "snacks", "1d233c1e-c81d-429f-8510-4bb52eda4aa9": "alquileres" };

    /* Días que dura un paquete, según su nombre (Paquete Mensual, Trimestral, de 6 Meses, Anual, Promo 2 Meses…). */
    function duracion(nombre) {
        var n = String(nombre || "").toLowerCase();
        if (/anual|12 meses/.test(n)) return 365;
        if (/semestral|6 meses/.test(n)) return 180;
        if (/trimestral|3 meses/.test(n)) return 90;
        if (/2 meses|bimestral/.test(n)) return 60;
        if (/semanal|semana/.test(n)) return 7;
        return 30;
    }
    /* Resumen de una venta del ERP (lo usan este adaptador y «Ingresos en vivo»). */
    function resumenVenta(v, modelos, previo) {
        var r = { v: 2, f: String(v.fecha_on || "").slice(0, 10), membresias: 0, snacks: 0, alquileres: 0, otros: 0, p: {}, dm: 0,
            u: v.key_usuario || null, cl: v.key_cliente || null, cn: (v.cliente && v.cliente.razon_social) || null };
        (v.detalle || v.detalles || []).forEach(function (d) {
            if (d.estado === 0) return;
            var c = TIPOS[(modelos || {})[d.key_modelo]] || "otros", m = (Number(d.precio_unitario) || 0) * (Number(d.cantidad) || 0), nom = String(d.descripcion || "Otro").trim();
            r[c] += m; r.p[nom] = (r.p[nom] || 0) + m;
            if (c === "membresias") r.dm = Math.max(r.dm, duracion(nom) * (Number(d.cantidad) || 1));
        });
        var desc = Number(v.descuento) || 0, t = r.membresias + r.snacks + r.alquileres + r.otros;
        if (desc > 0 && t > 0) { ["membresias", "snacks", "alquileres", "otros"].forEach(function (k) { r[k] -= r[k] / t * desc; }); Object.keys(r.p).forEach(function (k) { r.p[k] -= r.p[k] / t * desc; }); }
        r.t = r.membresias + r.snacks + r.alquileres + r.otros;
        if (v.state !== "vendido" || v.estado === 0 || (previo && previo.anul)) r.anul = 1;
        return r;
    }
    window.PY_VENTAS = { resumenVenta: resumenVenta, duracion: duracion, INICIO: INICIO, TIPOS: TIPOS, K_CACHE: K_CACHE };

    if (window.CM_PAIS !== "paraguay") return;

    /* ---------- memoria y actualización ---------- */
    var ventas = {}, modelos = null, ocupado = false, ultimo = 0, firmas = {}, listaPromesa = null;
    function leerLocal() { try { return JSON.parse(localStorage.getItem(K_CACHE) || "null") || {}; } catch (e) { return {}; } }
    function guardarLocal() { try { localStorage.setItem(K_CACHE, JSON.stringify(ventas)); } catch (e) {} }
    function hoy() { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
    function fs() { return window.firebase && firebase.apps.length && firebase.auth().currentUser ? firebase.firestore() : null; }
    function leerCompartida() {
        var listo = window.CMFB && CMFB.listo ? CMFB.listo : Promise.resolve();
        return listo.then(function () {
            var d = fs(); if (!d) return;
            return d.collection("py_ventas").get().then(function (q) {
                q.forEach(function (doc) {
                    var vs = (doc.data() || {}).ventas || {}; firmas[doc.id] = JSON.stringify(vs);
                    Object.keys(vs).forEach(function (k) { var a = ventas[k], b = vs[k]; if (!a || !a.f || (b.v === 2 && a.v !== 2) || b.anul) ventas[k] = b; });
                });
            });
        }).catch(function () {});
    }
    function guardarCompartida() {
        var d = fs(); if (!d || !(window.CMFB && CMFB.tieneRol("direccion"))) return;
        var m = {}; Object.keys(ventas).forEach(function (k) { var v = ventas[k]; if (v && v.f) (m[v.f.slice(0, 7)] = m[v.f.slice(0, 7)] || {})[k] = v; });
        Object.keys(m).forEach(function (mes) {
            var f = JSON.stringify(m[mes]); if (firmas[mes] === f) return; firmas[mes] = f;
            d.collection("py_ventas").doc(mes).set({ ventas: m[mes], actualizado: new Date().toISOString() }).catch(function () { delete firmas[mes]; });
        });
    }
    function claveUsuario() { try { return (JSON.parse(localStorage.getItem("cb_centro_mando") || "{}").key_usuario) || ""; } catch (e) { return ""; } }
    function cargarERP() { return window.ERP ? Promise.resolve() : new Promise(function (ok, mal) { var s = document.createElement("script"); s.src = "../accionistas-py/erp.js?v=1"; s.onload = ok; s.onerror = mal; document.head.appendChild(s); }); }
    /* Pone al día: ventas nuevas o anuladas y las del resumen viejo (sin versión 2). */
    function actualizar() {
        if (ocupado) return Promise.resolve(); ocupado = true;
        var completo = Date.now() - ultimo > 10 * 60000;
        return cargarERP().then(function () {
            return modelos ? modelos : ERP.modelos(claveUsuario()).then(function (m) { modelos = m; return m; });
        }).then(function () { return ERP.movimientos(completo ? INICIO : hoy(), hoy()); }).then(function (movs) {
            if (completo) ultimo = Date.now();
            var leer = {};
            movs.forEach(function (mv) {
                var k = mv.key_compra_venta, t = String(mv.tipo || ""); if (!k) return;
                if (t.indexOf("anulacion") === 0) { ventas[k] = ventas[k] || {}; ventas[k].anul = 1; }
                else if ((t === "venta" || t === "amortizacion") && !(ventas[k] && ventas[k].f && ventas[k].v === 2)) leer[k] = 1;
            });
            var keys = Object.keys(leer), i = 0, hechas = 0;
            function una() { if (i >= keys.length) return Promise.resolve(); var k = keys[i++];
                return ERP.venta(k).then(function (v) { if (v && v.key) { ventas[k] = resumenVenta(v, modelos, ventas[k]); hechas++; } }, function () {}).then(function () { if (hechas && hechas % 40 === 0) guardarLocal(); return una(); }); }
            return Promise.all([una(), una(), una(), una()]).then(function () { if (keys.length) { guardarLocal(); guardarCompartida(); } });
        }).catch(function () {}).then(function () { ocupado = false; });
    }
    function listo() {
        if (!listaPromesa) {
            ventas = leerLocal();
            /* Sin nada guardado (primera vez en este equipo y sin memoria compartida), espera la primera lectura del ERP. */
            listaPromesa = leerCompartida().then(function () {
                var hay = Object.keys(ventas).some(function (k) { return ventas[k] && ventas[k].f; });
                setInterval(function () { if (!document.hidden) actualizar(); }, 8000);
                return hay ? (actualizar(), null) : actualizar();
            });
        }
        return listaPromesa;
    }

    /* ---------- consultas con el mismo formato que Bolivia ---------- */
    function vigentes() { return Object.keys(ventas).map(function (k) { return ventas[k]; }).filter(function (v) { return v && v.f && !v.anul; }); }
    function entre(v, a) { return v.f >= String(a.desde || INICIO) && v.f <= String(a.hasta || hoy()); }
    function grupoDe(v, por) {
        if (por === "mes") return [v.f.slice(0, 7)];
        if (por === "sucursal") return [SUCURSAL];
        if (por === "cajero") return [v.u ? "Cajero " + String(v.u).slice(0, 4).toUpperCase() : "Sin cajero"];
        if (por === "paquete") return Object.keys(v.p || {}).length ? Object.keys(v.p) : ["Sin detalle"];
        return [v.f];
    }
    function reporteVentas(a) {
        var por = a.agrupar_por || "dia", g = {}, tot = { total: 0, ventas: 0 };
        vigentes().filter(function (v) { return entre(v, a); }).forEach(function (v) {
            var total = v.t != null ? v.t : (v.membresias + v.snacks + v.alquileres + (v.otros || 0));
            tot.total += total; tot.ventas++;
            grupoDe(v, por).forEach(function (k) {
                var x = g[k] || (g[k] = { grupo: k, ventas: 0, total: 0, efectivo: 0, tarjeta: 0, transferencia: 0, cheque: 0, qr: 0 });
                x.ventas++; x.total += por === "paquete" ? (v.p[k] || 0) : total;
            });
        });
        var filas = Object.keys(g).map(function (k) { var x = g[k]; x.total = Math.round(x.total); return x; });
        filas.sort(function (x, y) { return por === "dia" || por === "mes" ? String(x.grupo).localeCompare(String(y.grupo)) : y.total - x.total; });
        return { desde: a.desde, hasta: a.hasta, agrupado_por: por, moneda: "Gs", totales: { total: Math.round(tot.total), ventas: tot.ventas }, filas: filas };
    }
    /* Membresías: la última de cada cliente, con su vencimiento según el paquete. */
    function membresias() {
        var por = {};
        vigentes().forEach(function (v) {
            if (!v.cl || !(v.dm > 0)) return;
            var p = Object.keys(v.p || {}).filter(function (k) { return v.p[k] > 0; })[0] || "Paquete";
            var fin = new Date(v.f + "T12:00:00"); fin.setDate(fin.getDate() + v.dm);
            var x = { key_usuario: v.cl, cliente: v.cn || "Cliente", sucursal: SUCURSAL, paquete: p, fecha_inicio: v.f, fecha_fin: fin.toISOString().slice(0, 10), telefono: null };
            if (!por[v.cl] || por[v.cl].fecha_fin < x.fecha_fin) por[v.cl] = x;
        });
        return Object.keys(por).map(function (k) { return por[k]; });
    }
    function dif(a, b) { return Math.round((new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 864e5); }
    function pagina(lista, a) { var off = Number(a.offset) || 0, lim = Number(a.limite) || 50; var f = lista.slice(off, off + lim); return { total: lista.length, filas: f, siguiente_offset: off + lim < lista.length ? off + lim : null }; }
    var HERR = {
        reporte_ventas: reporteVentas,
        listar_clientes_activos: function () { var h = hoy(), n = membresias().filter(function (m) { return m.fecha_fin >= h; }).length; return { total: n, clientes_por_sucursal: [{ sucursal: SUCURSAL, clientes: n }], filas: [] }; },
        clientes_por_vencer: function (a) { var h = hoy(), d = Number(a.dias) || 7; return pagina(membresias().filter(function (m) { var x = dif(m.fecha_fin, h); return x >= 0 && x <= d; }).map(function (m) { return Object.assign({ dias_para_vencer: dif(m.fecha_fin, h) }, m); }).sort(function (x, y) { return x.fecha_fin.localeCompare(y.fecha_fin); }), a); },
        clientes_vencidos: function (a) { var h = hoy(), d = Number(a.dias) || 30; return pagina(membresias().filter(function (m) { var x = dif(h, m.fecha_fin); return x > 0 && x <= d; }).map(function (m) { return Object.assign({ dias_vencido: dif(h, m.fecha_fin) }, m); }).sort(function (x, y) { return y.fecha_fin.localeCompare(x.fecha_fin); }), a); }
    };
    /* Todo lo demás que pediría al MCP de Bolivia: en Paraguay, vacío (sin datos todavía). */
    function vacio(t) { return { filas: [], total: 0, sin_datos_paraguay: true, herramienta: t }; }

    function instalar() {
        var CM = window.CM; if (!CM || CM.__py) return;
        var original = CM.llamar;
        CM.llamar = function (nombre, args) {
            if (/^comercial_|^legal_|^cuentas_por_pagar_/.test(nombre)) return original.call(CM, nombre, args);   // datos propios (Firestore)
            var h = HERR[nombre];
            if (!h) return Promise.resolve(vacio(nombre));
            return listo().then(function () { return h(args || {}); });
        };
        CM.conSesion = function () { return true; };      // Paraguay no usa la sesión del MCP de Bolivia
        CM.iniciarSesion = function () {};
        CM.__py = true;
    }
    instalar();
    /* cm-firebase reemplaza CM.llamar después: se reinstala encima cuando cargue la página. */
    document.addEventListener("DOMContentLoaded", function () { if (window.CM && !window.CM.__py) instalar(); });
    window.PY_DATOS = { listo: listo, actualizar: actualizar, membresias: membresias, reporteVentas: reporteVentas };
})();
