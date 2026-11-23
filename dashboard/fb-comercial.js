/* Herramientas comercial_* sobre Firestore (mismas reglas que el componente "comercial" del servidor).
   - Cada ATC se identifica por su usuario del ERP (id del documento en com_ejecutiva = key del usuario).
     La primera vez que un ATC entra queda registrado solo; Jefe de ATC le asigna sucursales y meta.
   - Comisión: Bs 5 por venta (monto > 0) de un cliente cuyo último contacto registrado por una ejecutiva fue
     dentro de los 15 días anteriores a la compra. Las ventas salen de listar_ventas (MCP); el cliente se
     reconoce por su clave si la venta la trae, o por su nombre. */
(function () {
    "use strict";
    if (!window.CMFB) return;
    /* Memoria corta de lecturas: en una misma carga varias herramientas piden el equipo, las gestiones y las
       comisiones anuladas; se leen una sola vez. Cualquier escritura la borra. */
    var CMFB = Object.create(window.CMFB);
    var MEMO = {};
    function memo(k, fn, ms) {
        var c = MEMO[k], t = Date.now();
        if (!c || t - c.t > (ms || 30000)) {
            var p = fn(); c = MEMO[k] = { t: t, p: p };
            p.catch(function () { if (MEMO[k] && MEMO[k].p === p) delete MEMO[k]; });
        }
        return c.p.then(function (l) { return Array.isArray(l) ? l.slice() : l; });
    }
    var LECTURA = /^comercial_(confirmadas|roster|equipo|sucursales|asignaciones|ultimas_gestiones|gestiones|tareas|guiones|comisiones|resumen|mi_trabajo|campanas|pagos)$/;
    CMFB.registrar = function (nombre, fn) {
        window.CMFB.registrar(nombre, LECTURA.test(nombre) ? fn : function (a, n) {
            MEMO = {};
            return Promise.resolve().then(function () { return fn(a, n); }).then(function (r) { MEMO = {}; return r; }, function (e) { MEMO = {}; throw e; });
        });
    };
    var U = CMFB.util;
    var COMISION_BS = window.CM_COMISION || 5, VENTANA_DIAS = 15;
    var CANALES = ["whatsapp", "llamada", "presencial", "otro"];
    var RESULTADOS = ["no_contesta", "interesado", "agendado", "no_interesado", "numero_errado", "ya_activo", "otro"];
    /* Cada país con sus datos: Paraguay usa las colecciones py_com_* (mismas reglas, permisos del ERP de Paraguay). */
    var col = function (n) { return U.db().collection((window.CM_PAIS === "paraguay" ? "py_" : "") + n); };
    var hoy = function () { return new Date().toISOString().slice(0, 10); };
    var norm = function (s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); };
    var clave = function (s) { var k = String(s || "").trim(); if (k && !/^[A-Za-z0-9_-]{1,64}$/.test(k)) throw U.err("Usuario no válido."); return k; };
    function rango(a) {
        var h = hoy(), d = a.desde || h.slice(0, 8) + "01", f = a.hasta || h;
        if (f < d) throw U.err("hasta no puede ser anterior a desde.");
        return { desde: d, hasta: f };
    }
    function menosDias(iso, n) { var d = new Date(iso.slice(0, 10) + "T00:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

    function equipo() { return memo("equipo", function () { return U.docs(col("com_ejecutiva")).then(function (l) { return U.vigentes(l); }); }); }
    /* El ATC que está usando la página. Si es la primera vez, se registra solo (sin sucursales todavía). */
    function yo() {
        var ref = col("com_ejecutiva").doc(CMFB.usuarioKey());
        return ref.get().then(function (x) {
            if (x.exists) {
                if (Number(x.data().estado) <= 0) throw U.err("Tu usuario está dado de baja en el equipo ATC. Habla con Jefe de ATC.");
                return Object.assign({ key: x.id }, x.data());
            }
            var d = { nombre: CMFB.nombre() || "ATC", key_usuario: CMFB.usuarioKey(), sucursales: [], meta_mensual: 0, estado: 1, fecha_on: U.ahora(), autoregistro: true };
            return ref.set(d).then(function () { return Object.assign({ key: ref.id }, d); });
        });
    }
    function asignaciones(keyEj) {
        /* Las asignaciones del «Plan de hoy» traen además la foto del cliente (nombre, teléfono, grupo, mensaje).
           Con keyEj (vista de la ATC) se leen solo las suyas; sin keyEj (Jefe de ATC), todas. */
        var q = keyEj ? col("com_asignacion").where("key_ejecutiva", "==", keyEj) : col("com_asignacion");
        return U.docs(q).then(function (l) { return l.filter(function (a) { return Number(a.estado == null ? 1 : a.estado) > 0; }).map(function (a) { return Object.assign({}, a, { key_cliente: a.key, key_ejecutiva: a.key_ejecutiva || null, motivo: a.motivo || null, fecha_on: a.fecha_on }); }); });
    }
    function gestionesDesde(desde) {
        return memo("gest:" + desde, function () { return U.docs(col("com_gestion").where("fecha_on", ">=", desde)).then(function (l) { return U.vigentes(l).sort(function (a, b) { return String(b.fecha_on).localeCompare(String(a.fecha_on)); }); }); });
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
        return Promise.all([ventas(desde, hasta), gestionesDesde(menosDias(desde, VENTANA_DIAS)), equipo(), memo("anuladas", function () { return U.docs(col("com_comision_anulada")); })]).then(function (a) {
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
                out.push({ key_paquete_venta_usuario: key, fecha_venta: fv, key_cliente: g.key_cliente, cliente: g.cliente || null, paquete: v.paquete, sucursal: v.sucursal, monto: monto, cajero: v.cajero || null,
                    key_ejecutiva: g.key_ejecutiva, ejecutiva: nom[g.key_ejecutiva] || g.key_ejecutiva, fecha_contacto: g.fecha_on, canal: g.canal, resultado: g.resultado,
                    anulada: !!an, motivo_anulacion: an ? an.motivo : null, comision: an ? 0 : COMISION_BS });
            });
            out.sort(function (x, y) { return String(y.fecha_venta).localeCompare(String(x.fecha_venta)); });
            if (!keyEj) sincronizar(out, desde);
            return out;
        });
    }
    /* ---------- Comisiones confirmadas, guardadas para que cada ATC las vea sin conexión al ERP ----------
       Quien tiene las ventas del ERP (Jefe de ATC o Administración) deja confirmadas en com_comision_conf las
       comisiones que calculó; cada ATC lee solo las suyas desde ahí (aviso «¡Se cerró!» y «Confirmadas»). */
    var CAMPOS_CONF = ["fecha_venta", "key_cliente", "cliente", "paquete", "sucursal", "monto", "key_ejecutiva", "ejecutiva", "fecha_contacto", "canal", "anulada", "motivo_anulacion", "comision", "cajero"];
    function idConf(k) { return String(k).replace(/\//g, "-").slice(0, 300); }
    function sincronizar(lista, desde) {
        if (!lista.length || !(CMFB.tieneRolPais("jefe_atc") || CMFB.tieneRolPais("administracion"))) return;
        U.docs(col("com_comision_conf").where("fecha_venta", ">=", String(desde).slice(0, 10))).then(function (ya) {
            var previo = {}; ya.forEach(function (d) { previo[d.key] = d; });
            var cambios = lista.filter(function (c) {
                var p = previo[idConf(c.key_paquete_venta_usuario)];
                return !p || p.anulada !== c.anulada || p.comision !== c.comision || p.key_ejecutiva !== c.key_ejecutiva || (c.cajero && p.cajero !== c.cajero);
            });
            for (var i = 0; i < cambios.length; i += 400) {
                var lote = U.db().batch();
                cambios.slice(i, i + 400).forEach(function (c) {
                    var d = { key_paquete_venta_usuario: String(c.key_paquete_venta_usuario), fecha_confirmacion: U.ahora(), key_usuario_registro: CMFB.usuarioKey() };
                    CAMPOS_CONF.forEach(function (k) { d[k] = c[k] == null ? null : c[k]; });
                    lote.set(col("com_comision_conf").doc(idConf(c.key_paquete_venta_usuario)), d);
                });
                lote.commit().catch(function () {});
            }
        }).catch(function () {});
    }
    function comisionesConfirmadas(keyEj, desde, hasta) {
        return U.docs(col("com_comision_conf").where("key_ejecutiva", "==", keyEj)).then(function (l) {
            return l.filter(function (c) { var f = String(c.fecha_venta || "").slice(0, 10); return f >= desde && f <= hasta; })
                .sort(function (x, y) { return String(y.fecha_venta).localeCompare(String(x.fecha_venta)); });
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
            /* Las comisiones de la ATC salen de las confirmadas (las deja el tablero del Jefe de ATC con las ventas
               del ERP): la ATC no necesita conexión con Calistenia. */
            var com = comisionesConfirmadas(e.key, r.desde, r.hasta).catch(function () { return null; });
            return Promise.all([equipo(), asignaciones(e.key), gestionesDesde(menosDias(hoy(), 366)), tareas(e.key), guiones(), com]).then(function (x) {
                var nom = nombresEquipo(x[0]), todas = x[5];
                var mias = todas ? todas.filter(function (c) { return c.key_ejecutiva === e.key; }) : null;
                var ranking = null;   // el puesto en el equipo ya no se muestra a la ATC
                x[5] = mias;
                return { data: { ejecutiva: e, ranking: ranking, equipo: x[0], asignaciones: x[1].filter(function (a) { return a.key_ejecutiva === e.key; }), ultimas_gestiones: ultimas(x[2], nom),
                    tareas: x[3].map(function (t) { return Object.assign({}, t, { ejecutiva: t.key_ejecutiva ? nom[t.key_ejecutiva] : null }); }),
                    guiones: x[4], comisiones: x[5] || [], comisiones_sin_datos: x[5] === null, comision_por_venta: COMISION_BS, ventana_dias: VENTANA_DIAS } };
            });
        });
    });

    /* ---------- escritura: Atención al Cliente ---------- */
    /* Planilla de ATC por sucursal (la carga el Jefe de ATC): con ella, cada ATC queda en su sucursal sola
       la primera vez que entra. Se guarda en Firestore (no en el código, que es público). */
    /* Ventas confirmadas (comisiones) desde una fecha: para el tablero del CRM (muro, Dirección, Jefe de ATC). */
    CMFB.registrar("comercial_confirmadas", function (a) {
        var d = String(a.desde || menosDias(hoy(), 30)).slice(0, 10);
        return U.docs(col("com_comision_conf").where("fecha_venta", ">=", d)).then(function (l) { return { filas: l }; });
    });
    CMFB.registrar("comercial_roster", function () {
        return col("com_config").doc("atc_sucursales").get().then(function (x) { return { filas: (x.exists && x.data().filas) || [] }; });
    });
    CMFB.registrar("comercial_roster_guardar", function (a) {
        var filas = (Array.isArray(a.filas) ? a.filas : []).slice(0, 300).map(function (f) {
            return { sucursal: String(f.sucursal || "").trim().slice(0, 120), nombre: String(f.nombre || "").trim().slice(0, 120) };
        }).filter(function (f) { return f.sucursal && f.nombre; });
        return col("com_config").doc("atc_sucursales").set({ filas: filas, fecha_edicion: U.ahora(), key_usuario_registro: CMFB.usuarioKey() })
            .then(function () { return { estado: "exito", n: filas.length }; });
    });
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
    /* Plan de hoy: asigna una lista completa a una ATC (una sucursal, lista 1 o 2). Cada cliente queda con su foto
       (nombre, teléfono, grupo, dato, promoción y mensaje de WhatsApp) para que la ATC trabaje sin depender del MCP.
       Con reemplazar, la lista anterior de esa ATC en esa sucursal se da de baja (sus contactos registrados quedan). */
    CMFB.registrar("comercial_plan_asignar", function (a) {
        var ej = clave(a.key_ejecutiva), suc = U.txt(a, "sucursal", 120, true), n = Math.min(30, Math.max(1, parseInt(a.lista_n, 10) || 1));   // una lista por ATC de la sucursal
        var nota = U.txt(a, "nota", 600, false), lote = U.ahora(), clientes = Array.isArray(a.clientes) ? a.clientes : [];
        if (!ej) throw U.err("Elige la ATC.");
        if (!clientes.length) throw U.err("La lista está vacía.");
        /* Hasta 1000: las dos listas de una sucursal pueden ir juntas a la misma ATC. */
        if (clientes.length > 1000) throw U.err("Una asignación admite hasta 1000 clientes.");
        /* La foto de cada cliente se RECORTA (no se rechaza): un teléfono con varios números o un mensaje largo
           no puede tirar abajo la lista entera de la sucursal. */
        function rec(c, campo, max) { var v = c[campo]; if (v == null) return null; var s = String(v).trim(); return s ? s.slice(0, max) : null; }
        var vistos = {}, docs = [];
        clientes.forEach(function (c) {
            var k = String(c.key_cliente == null ? "" : c.key_cliente).trim().replace(/\//g, "-").slice(0, 120);
            if (!k) throw U.err("Hay un cliente sin identificador en la lista (" + (rec(c, "cliente", 80) || "sin nombre") + ").");
            if (k === "." || k === ".." || /^__.*__$/.test(k)) throw U.err("Cliente no válido: " + k);
            if (vistos[k]) return;   // repetido en la lista: una sola vez
            vistos[k] = 1;
            docs.push({ id: k, d: { key_ejecutiva: ej, motivo: "Plan de hoy · " + (rec(c, "grupo_titulo", 120) || ""), estado: 1, fecha_on: lote, key_usuario_registro: CMFB.usuarioKey(),
                lote: lote, lista_n: n, sucursal: suc, orden: Number(c.orden) || 0, nota_jefa: nota,
                cliente: rec(c, "cliente", 200), telefono: rec(c, "telefono", 40), grupo: rec(c, "grupo", 20), grupo_n: Number(c.grupo_n) || null,
                grupo_titulo: rec(c, "grupo_titulo", 120), dato: rec(c, "dato", 200), promo: rec(c, "promo", 300), mensaje: rec(c, "mensaje", 1000),
                campana_id: rec(c, "campana_id", 80), paquete_key: rec(c, "paquete_key", 120), paquete_nombre: rec(c, "paquete_nombre", 200) } });
        });
        var nuevos = {}; docs.forEach(function (x) { nuevos[x.id] = 1; });
        return col("com_ejecutiva").doc(ej).get().then(function (x) {
            if (!x.exists || Number(x.data().estado) <= 0) throw U.err("Esa ATC no está en el equipo o está dada de baja.");
            if (a.reemplazar === false) return [];
            return col("com_asignacion").where("key_ejecutiva", "==", ej).get().then(function (s) {
                return s.docs.filter(function (d) { var v = d.data(); return v.lote && Number(v.estado) > 0 && v.sucursal === suc && !nuevos[d.id]; }).map(function (d) { return d.id; });
            });
        }).then(function (viejos) {
            var ops = viejos.map(function (id) { return { id: id, baja: true }; }).concat(docs), i = 0;
            function escribir(b, o) { var r = col("com_asignacion").doc(o.id); if (o.baja) b.set(r, { estado: 0, fecha_edicion: lote }, { merge: true }); else b.set(r, o.d); }
            /* Si Firebase rechaza la tanda (límite de verificaciones de reglas por tanda), se escribe de a uno, 8 a la vez. */
            function deAUno(lista) {
                var j = 0;
                function sig() { if (j >= lista.length) return Promise.resolve(); var o = lista[j++], b = U.db().batch(); escribir(b, o); return b.commit().then(sig); }
                return Promise.all([sig(), sig(), sig(), sig(), sig(), sig(), sig(), sig()]);
            }
            function tanda() {
                if (i >= ops.length) return Promise.resolve();
                var parte = ops.slice(i, i + 400), b = U.db().batch();
                parte.forEach(function (o) { escribir(b, o); });
                i += 400;
                return b.commit().catch(function (e) { if (parte.length > 1 && e && e.code === "permission-denied") return deAUno(parte); throw e; }).then(tanda);
            }
            /* Campañas con paquete exclusivo: se guarda quiénes quedan habilitados para comprarlo (para el control de caja). */
            var camp = {};
            docs.forEach(function (x) { var d = x.d; if (!d.campana_id || !d.paquete_key) return;
                var c = camp[d.campana_id] || (camp[d.campana_id] = { grupo: d.grupo, titulo: d.grupo_titulo, paquete_key: d.paquete_key, paquete_nombre: d.paquete_nombre, promo: d.promo, claves: [], nombres: [] });
                c.claves.push(x.id); if (d.cliente) c.nombres.push(norm(d.cliente)); });
            var FV = firebase.firestore.FieldValue;
            var pc = Object.keys(camp).reduce(function (p, id) {
                var c = camp[id];
                return p.then(function () { return col("com_campana").doc(id).set({ grupo: c.grupo, titulo: c.titulo, paquete_key: c.paquete_key, paquete_nombre: c.paquete_nombre, promo: c.promo,
                    fecha: id.slice(0, 10), estado: 1, fecha_edicion: lote, key_usuario_registro: CMFB.usuarioKey(),
                    clientes: FV.arrayUnion.apply(FV, c.claves), nombres: c.nombres.length ? FV.arrayUnion.apply(FV, c.nombres) : FV.arrayUnion("") }, { merge: true }); });
            }, Promise.resolve());
            return tanda().then(function () { return pc; }).then(function () { return { estado: "exito", data: { asignados: docs.length, dados_de_baja: viejos.length, lote: lote } }; });
        });
    });
    /* Plan de hoy: quita a una ATC su lista de una sucursal. */
    /* Sacar un cliente de la lista de una ATC, o pasarlo a otra ATC (solo Jefe de ATC). */
    CMFB.registrar("comercial_lista_quitar", function (a) {
        var k = U.txt(a, "key_cliente", 120, true);
        if (/[/]/.test(k)) throw U.err("El cliente no es válido.");
        return col("com_asignacion").doc(k).set({ estado: 0, fecha_edicion: U.ahora(), key_usuario_edicion: CMFB.usuarioKey() }, { merge: true }).then(function () { return { estado: "exito" }; });
    });
    CMFB.registrar("comercial_lista_pasar", function (a) {
        var k = U.txt(a, "key_cliente", 120, true), ej = clave(a.key_ejecutiva);
        if (/[/]/.test(k) || !ej) throw U.err("Datos no válidos.");
        return col("com_ejecutiva").doc(ej).get().then(function (x) {
            if (!x.exists || Number(x.data().estado) <= 0) throw U.err("Esa ATC no existe o está dada de baja.");
            return col("com_asignacion").doc(k).set({ key_ejecutiva: ej, fecha_edicion: U.ahora(), key_usuario_edicion: CMFB.usuarioKey() }, { merge: true });
        }).then(function () { return { estado: "exito" }; });
    });
    CMFB.registrar("comercial_plan_quitar", function (a) {
        var ej = clave(a.key_ejecutiva), suc = U.txt(a, "sucursal", 120, true), ahora = U.ahora();
        return col("com_asignacion").where("key_ejecutiva", "==", ej).get().then(function (s) {
            var ids = s.docs.filter(function (d) { var v = d.data(); return v.lote && Number(v.estado) > 0 && v.sucursal === suc; }).map(function (d) { return d.id; });
            var b = U.db().batch(); ids.slice(0, 450).forEach(function (id) { b.set(col("com_asignacion").doc(id), { estado: 0, fecha_edicion: ahora }, { merge: true }); });
            return (ids.length ? b.commit() : Promise.resolve()).then(function () { return { estado: "exito", data: { quitados: Math.min(ids.length, 450) } }; });
        });
    });
    /* Campañas con paquete exclusivo y control de caja: ventas del paquete a clientes de la lista (bien)
       y a personas que NO estaban en ninguna lista habilitada (alerta). */
    CMFB.registrar("comercial_campanas", function (a) {
        var r = rango(a);
        return Promise.all([U.docs(col("com_campana")), U.docs(col("com_asignacion")), ventas(r.desde, r.hasta), equipo()]).then(function (x) {
            var camps = x[0].filter(function (c) { return Number(c.estado == null ? 1 : c.estado) > 0 && c.paquete_key; });
            var nom = nombresEquipo(x[3]), asig = {};
            x[1].forEach(function (s0) { if (s0.campana_id) (asig[s0.campana_id] = asig[s0.campana_id] || []).push(s0); });
            var porPaquete = {};
            camps.forEach(function (c) {
                var k = c.paquete_key, pp = porPaquete[k] || (porPaquete[k] = { claves: {}, nombres: {}, nombre: norm(c.paquete_nombre) });
                (c.clientes || []).forEach(function (q) { pp.claves[q] = c.key; }); (c.nombres || []).forEach(function (q) { pp.nombres[q] = c.key; });
            });
            var nombrePaq = {}; Object.keys(porPaquete).forEach(function (k) { nombrePaq[porPaquete[k].nombre] = k; });
            var vendidas = {}, alertas = [];
            x[2].forEach(function (v) {
                var k = v.key_paquete && porPaquete[v.key_paquete] ? v.key_paquete : nombrePaq[norm(v.paquete)];
                if (!k) return;
                var pp = porPaquete[k], cl = clientesDeVenta(v), campana = null;
                cl.claves.forEach(function (q) { if (pp.claves[q]) campana = pp.claves[q]; });
                if (!campana) cl.nombres.forEach(function (q) { if (pp.nombres[q]) campana = pp.nombres[q]; });
                var fila = { fecha: String(v.fecha || v.fecha_on || "").slice(0, 16), paquete: v.paquete, sucursal: v.sucursal, monto: Number(v.precio != null ? v.precio : v.monto) || 0,
                    cliente: (v.clientes || []).map(function (q) { return typeof q === "string" ? q : q.cliente; }).filter(Boolean).join(", "),
                    cajero: v.cajero || v.usuario || v.vendedor || null };
                if (campana) (vendidas[campana] = vendidas[campana] || []).push(fila); else alertas.push(fila);
            });
            var filas = camps.map(function (c) {
                var l = asig[c.key] || [], porEj = {};
                l.forEach(function (q) { var e = porEj[q.key_ejecutiva] || (porEj[q.key_ejecutiva] = { ejecutiva: nom[q.key_ejecutiva] || q.key_ejecutiva || "—", clientes: 0 }); e.clientes++; });
                return { key: c.key, fecha: c.fecha, titulo: c.titulo, paquete: c.paquete_nombre, promo: c.promo, habilitados: (c.clientes || []).length,
                    vendidas: (vendidas[c.key] || []).length, ventas: vendidas[c.key] || [], atc: Object.keys(porEj).map(function (k) { return porEj[k]; }) };
            }).sort(function (p, q) { return String(q.fecha).localeCompare(String(p.fecha)); });
            return { filas: filas, alertas: alertas.sort(function (p, q) { return String(q.fecha).localeCompare(String(p.fecha)); }) };
        });
    });
    /* Pagos de comisiones: el Jefe de ATC (o Administración) marca como pagada la comisión confirmada de una semana. */
    CMFB.registrar("comercial_pagos", function () { return U.docs(col("com_pago")).then(function (l) { return { filas: U.vigentes(l) }; }); });
    CMFB.registrar("comercial_pago_registrar", function (a) {
        var ej = clave(a.key_ejecutiva), semana = U.txt(a, "semana", 10, true), monto = Number(a.monto), ventas = parseInt(a.ventas, 10) || 0;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) throw U.err("Semana no válida.");
        if (!(monto > 0)) throw U.err("Monto no válido.");
        return col("com_pago").doc(ej + "_" + semana).set({ key_ejecutiva: ej, semana: semana, monto: monto, ventas: ventas, estado: 1, fecha_on: U.ahora(), pagado_por: CMFB.usuarioKey() })
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
