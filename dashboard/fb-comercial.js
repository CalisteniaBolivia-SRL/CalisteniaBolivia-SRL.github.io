/* Herramientas comercial_* sobre Firestore (mismas reglas que el componente "comercial" del servidor).
   - Cada ATC se identifica por su usuario del ERP (id del documento en com_ejecutiva = key del usuario).
     La primera vez que un ATC entra queda registrado solo; ATC Central le asigna sucursales y meta.
   - Comisión: Bs 5 por venta (monto > 0) de un cliente cuyo último contacto registrado por una ejecutiva fue
     dentro de los 15 días anteriores a la compra. Las ventas salen de listar_ventas (MCP); el cliente se
     reconoce por su clave si la venta la trae, o por su nombre. */
(function () {
    "use strict";
    if (!window.CMFB) return;
    var U = CMFB.util;
    var COMISION_BS = 5, VENTANA_DIAS = 15;
    var CANALES = ["whatsapp", "llamada", "presencial", "otro"];
    var RESULTADOS = ["no_contesta", "interesado", "agendado", "no_interesado", "numero_errado", "otro"];
    var col = function (n) { return U.db().collection(n); };
    var hoy = function () { return new Date().toISOString().slice(0, 10); };
    var norm = function (s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); };
    var clave = function (s) { var k = String(s || "").trim(); if (k && !/^[A-Za-z0-9_-]{1,64}$/.test(k)) throw U.err("Usuario no válido."); return k; };
    function rango(a) {
        var h = hoy(), d = a.desde || h.slice(0, 8) + "01", f = a.hasta || h;
        if (f < d) throw U.err("hasta no puede ser anterior a desde.");
        return { desde: d, hasta: f };
    }
    function menosDias(iso, n) { var d = new Date(iso.slice(0, 10) + "T00:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

    function equipo() { return U.docs(col("com_ejecutiva")).then(function (l) { return U.vigentes(l); }); }
    /* El ATC que está usando la página. Si es la primera vez, se registra solo (sin sucursales todavía). */
    function yo() {
        var ref = col("com_ejecutiva").doc(CMFB.usuarioKey());
        return ref.get().then(function (x) {
            if (x.exists) {
                if (Number(x.data().estado) <= 0) throw U.err("Tu usuario está dado de baja en el equipo ATC. Habla con ATC Central.");
                return Object.assign({ key: x.id }, x.data());
            }
            var d = { nombre: CMFB.nombre() || "ATC", key_usuario: CMFB.usuarioKey(), sucursales: [], meta_mensual: 0, estado: 1, fecha_on: U.ahora(), autoregistro: true };
            return ref.set(d).then(function () { return Object.assign({ key: ref.id }, d); });
        });
    }
    function asignaciones() {
        return U.docs(col("com_asignacion")).then(function (l) { return l.filter(function (a) { return Number(a.estado == null ? 1 : a.estado) > 0; }).map(function (a) { return { key_cliente: a.key, key_ejecutiva: a.key_ejecutiva || null, motivo: a.motivo || null, fecha_on: a.fecha_on }; }); });
    }
    function gestionesDesde(desde) {
        return U.docs(col("com_gestion").where("fecha_on", ">=", desde)).then(function (l) { return U.vigentes(l).sort(function (a, b) { return String(b.fecha_on).localeCompare(String(a.fecha_on)); }); });
    }
    function ultimas(lista, nombres) {
        var u = {}, cont = {};
        lista.forEach(function (g) { cont[g.key_cliente] = (cont[g.key_cliente] || 0) + 1; if (!u[g.key_cliente]) u[g.key_cliente] = g; });
        return Object.keys(u).map(function (k) { var g = u[k]; return { key_cliente: k, key_gestion: g.key, key_ejecutiva: g.key_ejecutiva, ejecutiva: nombres[g.key_ejecutiva] || g.key_ejecutiva, fecha_on: g.fecha_on, canal: g.canal, resultado: g.resultado, nota: g.nota || null, proximo_seguimiento: g.proximo_seguimiento || null, contactos: cont[k] }; });
    }
    function nombresEquipo(eq) { var n = {}; eq.forEach(function (e) { n[e.key] = e.nombre; }); return n; }
    function tareas(keyEj) {
        return U.docs(col("com_tarea")).then(function (l) {
            return U.vigentes(l).filter(function (t) { return !keyEj || !t.key_ejecutiva || t.key_ejecutiva === keyEj; })
                .sort(function (a, b) { return (a.hecha ? 1 : 0) - (b.hecha ? 1 : 0) || String(a.fecha_limite || "9").localeCompare(String(b.fecha_limite || "9")) || String(b.fecha_on).localeCompare(String(a.fecha_on)); });
        });
    }
    function guiones() { return U.docs(col("com_guion")).then(function (l) { return U.vigentes(l).sort(function (a, b) { return (a.orden || 0) - (b.orden || 0) || String(a.titulo).localeCompare(String(b.titulo)); }); }); }

    /* Ventas del período (MCP listar_ventas, paginado hasta 3.000). */
    function ventas(desde, hasta) {
        var acc = [];
        function pag(off, n) {
            return window.CM.llamar("listar_ventas", { desde: desde, hasta: hasta, limite: 200, offset: off }).then(function (r) {
                if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { r = {}; } }
                if (r && r.result && !r.filas) r = r.result;
                acc = acc.concat((r && r.filas) || []);
                return r && r.siguiente_offset != null && n < 14 ? pag(r.siguiente_offset, n + 1) : acc;
            });
        }
        return pag(0, 0);
    }
    /* Clientes de una venta: claves y nombres normalizados. */
    function clientesDeVenta(v) {
        var claves = [], nombres = [];
        (v.clientes || []).forEach(function (c) {
            if (c && typeof c === "object") { if (c.key_usuario || c.key) claves.push(String(c.key_usuario || c.key)); if (c.cliente || c.nombre) nombres.push(norm(c.cliente || c.nombre)); }
            else if (c) { var s = String(c); if (/^[0-9a-f-]{20,}$/i.test(s)) claves.push(s); else nombres.push(norm(s)); }
        });
        if (v.key_usuario) claves.push(String(v.key_usuario));
        if (v.cliente) nombres.push(norm(v.cliente));
        return { claves: claves, nombres: nombres };
    }
    function comisiones(desde, hasta, keyEj) {
        return Promise.all([ventas(desde, hasta), gestionesDesde(menosDias(desde, VENTANA_DIAS)), equipo(), U.docs(col("com_comision_anulada"))]).then(function (a) {
            var gest = a[1], nom = nombresEquipo(a[2]), anul = {};
            a[3].forEach(function (x) { if (Number(x.estado == null ? 1 : x.estado) > 0) anul[x.key] = x; });
            var porClave = {}, porNombre = {};
            gest.forEach(function (g) {
                (porClave[g.key_cliente] = porClave[g.key_cliente] || []).push(g);
                if (g.cliente) (porNombre[norm(g.cliente)] = porNombre[norm(g.cliente)] || []).push(g);
            });
            var out = [];
            a[0].forEach(function (v) {
                var monto = Number(v.precio != null ? v.precio : v.monto) || 0;
                if (monto <= 0) return;
                var fv = String(v.fecha || v.fecha_on || "").replace(" ", "T"), cl = clientesDeVenta(v), cand = [];
                cl.claves.forEach(function (k) { cand = cand.concat(porClave[k] || []); });
                if (!cand.length) cl.nombres.forEach(function (n) { cand = cand.concat(porNombre[n] || []); });
                var lim = menosDias(fv, VENTANA_DIAS);
                var g = cand.filter(function (x) { return x.fecha_on <= fv + (fv.length <= 10 ? "T23:59:59" : "") && x.fecha_on.slice(0, 10) >= lim; })
                    .sort(function (x, y) { return String(y.fecha_on).localeCompare(String(x.fecha_on)); })[0];
                if (!g || (keyEj && g.key_ejecutiva !== keyEj)) return;
                var key = String(v.key_paquete_venta || v.key || fv + g.key_cliente), an = anul[key];
                out.push({ key_paquete_venta_usuario: key, fecha_venta: fv, key_cliente: g.key_cliente, cliente: g.cliente || null, paquete: v.paquete, sucursal: v.sucursal, monto: monto,
                    key_ejecutiva: g.key_ejecutiva, ejecutiva: nom[g.key_ejecutiva] || g.key_ejecutiva, fecha_contacto: g.fecha_on, canal: g.canal, resultado: g.resultado,
                    anulada: !!an, motivo_anulacion: an ? an.motivo : null, comision: an ? 0 : COMISION_BS });
            });
            return out.sort(function (x, y) { return String(y.fecha_venta).localeCompare(String(x.fecha_venta)); });
        });
    }

    /* ---------- lectura ---------- */
    CMFB.registrar("comercial_equipo", function () { return equipo().then(function (l) { return { filas: l }; }); });
    CMFB.registrar("comercial_sucursales", function () { return U.sucursales().then(function (l) { return { filas: l.map(function (s) { return { descripcion: s }; }) }; }); });
    CMFB.registrar("comercial_asignaciones", function () { return asignaciones().then(function (l) { return { filas: l }; }); });
    CMFB.registrar("comercial_ultimas_gestiones", function () {
        return Promise.all([gestionesDesde(menosDias(hoy(), 366)), equipo()]).then(function (a) { return { filas: ultimas(a[0], nombresEquipo(a[1])) }; });
    });
    CMFB.registrar("comercial_gestiones", function (a) {
        var r = rango(a);
        return Promise.all([gestionesDesde(r.desde), equipo()]).then(function (x) {
            var nom = nombresEquipo(x[1]);
            return { filas: x[0].filter(function (g) { return g.fecha_on.slice(0, 10) <= r.hasta && (!a.key_ejecutiva || g.key_ejecutiva === a.key_ejecutiva) && (!a.key_cliente || g.key_cliente === a.key_cliente); })
                .map(function (g) { return Object.assign({}, g, { ejecutiva: nom[g.key_ejecutiva] || g.key_ejecutiva }); }) };
        });
    });
    CMFB.registrar("comercial_tareas", function (a) {
        return Promise.all([tareas(a.key_ejecutiva || ""), equipo()]).then(function (x) {
            var nom = nombresEquipo(x[1]);
            return { filas: x[0].filter(function (t) { return a.incluir_hechas !== false || !t.hecha; }).map(function (t) { return Object.assign({}, t, { ejecutiva: t.key_ejecutiva ? nom[t.key_ejecutiva] || t.key_ejecutiva : null }); }) };
        });
    });
    CMFB.registrar("comercial_guiones", function () { return guiones().then(function (l) { return { filas: l }; }); });
    CMFB.registrar("comercial_comisiones", function (a) { var r = rango(a); return comisiones(r.desde, r.hasta, a.key_ejecutiva).then(function (l) { return { filas: l, comision_por_venta: COMISION_BS, ventana_dias: VENTANA_DIAS }; }); });
    CMFB.registrar("comercial_resumen", function (a) {
        var r = rango(a), h = hoy();
        return Promise.all([equipo(), gestionesDesde(menosDias(h, 366)), tareas(""), comisiones(r.desde, r.hasta)]).then(function (x) {
            var eq = x[0], gest = x[1], ult = ultimas(gest, {}), ts = x[2], com = x[3];
            return { filas: eq.map(function (e) {
                var g = gest.filter(function (y) { return y.key_ejecutiva === e.key && y.fecha_on.slice(0, 10) >= r.desde && y.fecha_on.slice(0, 10) <= r.hasta; });
                var cl = {}; g.forEach(function (y) { cl[y.key_cliente] = 1; });
                var c = com.filter(function (y) { return y.key_ejecutiva === e.key; });
                return { key_ejecutiva: e.key, nombre: e.nombre, sucursales: e.sucursales || [], meta_mensual: e.meta_mensual || 0,
                    gestiones: g.length, contactados: Object.keys(cl).length,
                    interesados: g.filter(function (y) { return y.resultado === "interesado" || y.resultado === "agendado"; }).length,
                    no_contesta: g.filter(function (y) { return y.resultado === "no_contesta"; }).length,
                    seguimientos_vencidos: ult.filter(function (u) { return u.key_ejecutiva === e.key && u.proximo_seguimiento && u.proximo_seguimiento < h; }).length,
                    tareas_pendientes: ts.filter(function (t) { return !t.hecha && (!t.key_ejecutiva || t.key_ejecutiva === e.key); }).length,
                    ventas: c.filter(function (y) { return !y.anulada; }).length, comision: c.reduce(function (s, y) { return s + y.comision; }, 0), comisiones_anuladas: c.filter(function (y) { return y.anulada; }).length };
            }), comision_por_venta: COMISION_BS, ventana_dias: VENTANA_DIAS };
        });
    });
    CMFB.registrar("comercial_mi_trabajo", function (a) {
        var r = rango(a);
        return yo().then(function (e) {
            return Promise.all([equipo(), asignaciones(), gestionesDesde(menosDias(hoy(), 366)), tareas(e.key), guiones(), comisiones(r.desde, r.hasta, e.key)]).then(function (x) {
                var nom = nombresEquipo(x[0]);
                return { data: { ejecutiva: e, equipo: x[0], asignaciones: x[1], ultimas_gestiones: ultimas(x[2], nom),
                    tareas: x[3].map(function (t) { return Object.assign({}, t, { ejecutiva: t.key_ejecutiva ? nom[t.key_ejecutiva] : null }); }),
                    guiones: x[4], comisiones: x[5], comision_por_venta: COMISION_BS, ventana_dias: VENTANA_DIAS } };
            });
        });
    });

    /* ---------- escritura: Atención al Cliente ---------- */
    CMFB.registrar("comercial_ejecutiva_guardar", function (a) {
        var d = a.data || {}, k = clave(d.key || d.key_usuario);
        if (!k) throw U.err("Falta el ATC.");
        var suc = (Array.isArray(d.sucursales) ? d.sucursales : []).map(function (s) { return String(s).trim(); }).filter(Boolean);
        if (suc.some(function (s) { return s.length > 120; })) throw U.err("Nombre de sucursal no válido.");
        var ej = { nombre: U.txt(d, "nombre", 120, true), telefono: U.txt(d, "telefono", 40, false), sucursales: suc,
            meta_mensual: Math.max(0, Math.min(10000, parseInt(d.meta_mensual, 10) || 0)), estado: Number(d.estado) === 0 ? 0 : 1, key_usuario: k,
            fecha_edicion: U.ahora(), key_usuario_registro: CMFB.usuarioKey() };
        var ref = col("com_ejecutiva").doc(k);
        return ref.get().then(function (x) {
            if (!x.exists) throw U.err("Ese ATC todavía no ingresó al centro de mando.");
            return ref.set(ej, { merge: true });
        }).then(function () { return { estado: "exito", data: Object.assign({ key: k }, ej) }; });
    });
    CMFB.registrar("comercial_asignar", function (a) {
        var k = U.txt(a, "key_cliente", 120, true), ej = a.key_ejecutiva ? clave(a.key_ejecutiva) : null;
        if (/[/]/.test(k)) throw U.err("El cliente no es válido.");
        var previo = ej ? col("com_ejecutiva").doc(ej).get().then(function (x) { if (!x.exists || Number(x.data().estado) <= 0) throw U.err("Ese ATC no existe o está dado de baja."); }) : Promise.resolve();
        return previo.then(function () { return col("com_asignacion").doc(k).set({ key_ejecutiva: ej, motivo: U.txt(a, "motivo", 300, false), estado: 1, fecha_on: U.ahora(), key_usuario_registro: CMFB.usuarioKey() }); })
            .then(function () { return { estado: "exito" }; });
    });
    CMFB.registrar("comercial_tarea_guardar", function (a) {
        var d = a.data || {}, ej = d.key_ejecutiva ? clave(d.key_ejecutiva) : null;
        var t = { titulo: U.txt(d, "titulo", 200, true), indicaciones: U.txt(d, "indicaciones", 4000, false), prioridad: U.opcion(d, "prioridad", ["alta", "normal", "baja"], "normal"),
            fecha_limite: U.fecha(d, "fecha_limite", false), key_ejecutiva: ej };
        if (d.key) return col("com_tarea").doc(String(d.key)).update(Object.assign(t, { fecha_edicion: U.ahora() })).then(function () { return { estado: "exito", data: { key: d.key } }; });
        var ref = col("com_tarea").doc();
        return ref.set(Object.assign(t, { hecha: false, fecha_hecha: null, comentario_cierre: null, estado: 1, fecha_on: U.ahora(), key_usuario_registro: CMFB.usuarioKey() })).then(function () { return { estado: "exito", data: { key: ref.id } }; });
    });
    CMFB.registrar("comercial_tarea_eliminar", function (a) { return col("com_tarea").doc(U.txt(a, "key", 64, true)).update({ estado: 0 }).then(function () { return { estado: "exito" }; }); });
    CMFB.registrar("comercial_guion_guardar", function (a) {
        var d = a.data || {};
        var g = { lista: U.opcion(d, "lista", ["antiguos", "vencidos", "por_vencer", "en_riesgo", "otro"], "antiguos"), titulo: U.txt(d, "titulo", 200, true),
            guion_llamada: U.txt(d, "guion_llamada", 4000, false), mensaje_whatsapp: U.txt(d, "mensaje_whatsapp", 1000, false), oferta: U.txt(d, "oferta", 300, false), orden: parseInt(d.orden, 10) || 0 };
        if (d.key) return col("com_guion").doc(String(d.key)).update(g).then(function () { return { estado: "exito", data: { key: d.key } }; });
        var ref = col("com_guion").doc();
        return ref.set(Object.assign(g, { estado: 1, fecha_on: U.ahora(), key_usuario_registro: CMFB.usuarioKey() })).then(function () { return { estado: "exito", data: { key: ref.id } }; });
    });
    CMFB.registrar("comercial_guion_eliminar", function (a) { return col("com_guion").doc(U.txt(a, "key", 64, true)).update({ estado: 0 }).then(function () { return { estado: "exito" }; }); });
    CMFB.registrar("comercial_comision_anular", function (a) {
        var k = U.txt(a, "key_paquete_venta_usuario", 120, true), ref = col("com_comision_anulada").doc(k);
        return ref.get().then(function (x) {
            if (x.exists && Number(x.data().estado) > 0) throw U.err("Esa comisión ya está anulada.");
            return ref.set({ motivo: U.txt(a, "motivo", 300, true), estado: 1, fecha_on: U.ahora(), key_usuario_registro: CMFB.usuarioKey() });
        }).then(function () { return { estado: "exito" }; });
    });
    CMFB.registrar("comercial_comision_restaurar", function (a) { return col("com_comision_anulada").doc(U.txt(a, "key_paquete_venta_usuario", 120, true)).update({ estado: 0 }).then(function () { return { estado: "exito" }; }); });

    /* ---------- escritura: ejecutiva ---------- */
    CMFB.registrar("comercial_gestion_registrar", function (a) {
        return yo().then(function (e) {
            var prox = U.fecha(a, "proximo_seguimiento", false);
            if (prox && prox < hoy()) throw U.err("El próximo seguimiento no puede ser en el pasado.");
            var g = { key_ejecutiva: e.key, key_cliente: U.txt(a, "key_cliente", 120, true), cliente: U.txt(a, "cliente", 200, false), sucursal: U.txt(a, "sucursal", 120, false),
                lista: U.opcion(a, "lista", ["antiguos", "vencidos", "por_vencer", "en_riesgo", "otro"], "antiguos"), canal: U.opcion(a, "canal", CANALES, null, true),
                resultado: U.opcion(a, "resultado", RESULTADOS, null, true), nota: U.txt(a, "nota", 2000, false), proximo_seguimiento: prox, estado: 1, fecha_on: U.ahora() };
            var ref = col("com_gestion").doc();
            return ref.set(g).then(function () { return { estado: "exito", data: Object.assign({ key: ref.id }, g) }; });
        });
    });
    CMFB.registrar("comercial_tarea_completar", function (a) {
        var k = U.txt(a, "key", 64, true), hecha = a.hecha !== false;
        return yo().then(function (e) {
            var ref = col("com_tarea").doc(k);
            return ref.get().then(function (x) {
                if (!x.exists || Number(x.data().estado) <= 0 || (x.data().key_ejecutiva && x.data().key_ejecutiva !== e.key)) throw U.err("La tarea no existe o no es tuya.");
                return ref.update({ hecha: hecha, fecha_hecha: hecha ? U.ahora() : null, comentario_cierre: U.txt(a, "comentario", 2000, false) });
            });
        }).then(function () { return { estado: "exito" }; });
    });
})();
