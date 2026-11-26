/* =====================================================================================================
   Códigos de referido · datos (Firestore) y cruce con las ventas del ERP.
   - Trabajador (cualquier usuario del ERP): su código, sus familiares, sus comisiones y liquidaciones.
   - Dirección / Administración: configuración, sincronización con el ERP, alertas y liquidación.
   - Bolivia lee el ERP con el MCP de Calistenia (window.CM.llamar); Paraguay usa sus propias colecciones (py_ref_*).
   Reglas de negocio en referidos-logica.js. Seguridad real: firestore.rules.
   ===================================================================================================== */
(function () {
    "use strict";
    var R = window.REF_LOGICA;
    var PY = window.CM_PAIS === "paraguay";
    function col(n) { return (PY ? "py_" : "") + n; }
    function db() { return firebase.firestore(); }
    function ahora() { return new Date().toISOString(); }
    function uid() { var u = firebase.auth().currentUser; return u ? u.uid : ""; }
    function docs(q) { return q.get().then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }); }
    function uno(ref) { return ref.get().then(function (d) { return d.exists ? Object.assign({ id: d.id }, d.data()) : null; }); }
    function erp(nombre, args) {
        if (!window.CM || !CM.llamar) return Promise.reject(new Error("Falta la conexión con los datos de Calistenia."));
        return CM.llamar(nombre, args).then(function (r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) {} } return r; });
    }

    /* ---------- trabajador ---------- */
    function miCodigo() { return uno(db().collection(col("ref_codigo")).doc(uid())); }
    /* Crea el código (único) y la ficha del trabajador. datos: { nombre, ci, telefono, familiares:[{nombre, ci, telefono, parentesco}] } */
    function crearCodigo(datos) {
        var yo = uid(), nombre = String(datos.nombre || "").trim();
        if (!yo) return Promise.reject(new Error("Sin sesión."));
        if (!R.normCI(datos.ci)) return Promise.reject(new Error("Escribí tu carnet de identidad."));
        var fam = limpiarFamiliares(datos.familiares);
        var propio = R.normCodigo(datos.codigo || "").replace(/-/g, "");
        if (propio && !R.codigoValido(propio)) return Promise.reject(new Error("El código debe tener de 3 a 14 letras o números, sin espacios."));
        var intento = function (n) {
            var codigo = propio || R.generarCodigo(nombre, function () { return false; });
            if (!propio && n > 1) codigo = codigo + n;
            /* No puede repetirse ni con un código viejo «-CAL» (se muestran igual). */
            var idx = db().collection(col("ref_codigo_idx")).doc(codigo), viejo = db().collection(col("ref_codigo_idx")).doc(codigo + "-CAL"), mio = db().collection(col("ref_codigo")).doc(yo);
            return db().runTransaction(function (tx) {
                return Promise.all([tx.get(idx), tx.get(viejo)]).then(function (a) {
                    var d = a[0]; if (d.exists || a[1].exists) throw Object.assign(new Error("ocupado"), { ocupado: true });
                    tx.set(idx, { key_usuario: yo, nombre: nombre.split(/\s+/)[0].slice(0, 40), estado: 1, fecha_on: ahora() });
                    tx.set(mio, { codigo: codigo, key_usuario: yo, nombre: nombre.slice(0, 120), ci: String(datos.ci).trim().slice(0, 20),
                        telefono: String(datos.telefono || "").trim().slice(0, 20), familiares: fam, estado: 1, fecha_on: ahora() });
                });
            }).then(function () { return codigo; }, function (e) { if (e && e.ocupado && propio) throw new Error("El código «" + propio + "» ya lo tiene otra persona. Probá con otro."); if (e && e.ocupado && n < 50) return intento(n + 1); throw e; });
        };
        return intento(1);
    }
    function limpiarFamiliares(lista) {
        return (lista || []).map(function (f) {
            return { nombre: String(f.nombre || "").trim().slice(0, 80), parentesco: String(f.parentesco || "").trim().slice(0, 30),
                ci: String(f.ci || "").trim().slice(0, 20), telefono: String(f.telefono || "").trim().slice(0, 20) };
        }).filter(function (f) { return f.nombre && (R.normCI(f.ci) || R.normTel(f.telefono)); }).slice(0, 30);
    }
    function guardarFamiliares(familiares, telefono) {
        var d = { familiares: limpiarFamiliares(familiares), fecha_edicion: ahora() };
        if (telefono != null) d.telefono = String(telefono).trim().slice(0, 20);
        return db().collection(col("ref_codigo")).doc(uid()).update(d);
    }
    function misComisiones() { return docs(db().collection(col("ref_comision")).where("key_trabajador", "==", uid())); }
    function misLiquidaciones() { return docs(db().collection(col("ref_liquidacion")).where("key_trabajador", "==", uid())); }
    function config() {
        return Promise.all([uno(db().collection(col("ref_config")).doc("global")), uno(db().collection(col("ref_config")).doc("paquetes"))])
            .then(function (a) { return { cfg: a[0] || { pct: R.PCT_DEFECTO, bonos: [], meta_cierres: 0 }, paquetes: (a[1] && a[1].lista) || [] }; });
    }
    function rankingPeriodo(clave) { return uno(db().collection(col("ref_resumen")).doc(clave)); }

    /* ---------- público: el cliente se anota desde el link/QR (sin sesión) ---------- */
    function codigoPublico(codigo) { return uno(db().collection(col("ref_codigo_idx")).doc(R.normCodigo(codigo))); }
    function inscribir(ins) {
        return db().collection(col("ref_inscripcion")).add({
            codigo: R.normCodigo(ins.codigo), ci: String(ins.ci || "").trim().slice(0, 20), telefono: String(ins.telefono || "").trim().slice(0, 20),
            nombre: String(ins.nombre || "").trim().slice(0, 80), fecha_on: ahora(), estado: "nueva"
        });
    }

    /* ---------- administración ---------- */
    function guardarConfig(cfg) {
        var pct = Number(cfg.pct);
        if (!(pct >= 0 && pct <= 50)) return Promise.reject(new Error("El porcentaje debe estar entre 0 y 50."));
        var bonos = (cfg.bonos || []).map(function (b) { return { cierres: Math.round(Number(b.cierres)), monto: Number(b.monto) }; })
            .filter(function (b) { return b.cierres > 0 && b.monto > 0; });
        var pp = {}; Object.keys(cfg.pct_paquete || {}).forEach(function (k) { var v = Number(cfg.pct_paquete[k]); if (k && v >= 0 && v <= 50) pp[k] = v; });
        return db().collection(col("ref_config")).doc("global").set({ pct: pct, pct_paquete: pp, meta_cierres: Math.max(0, Math.round(Number(cfg.meta_cierres) || 0)),
            bonos: bonos, fecha_edicion: ahora(), editado_por: uid() });
    }
    function listar(nombre, max) { return docs(db().collection(col(nombre)).orderBy("fecha_on", "desc").limit(max || 500)); }
    function comisionesTodas() { return docs(db().collection(col("ref_comision")).orderBy("fecha_venta", "desc").limit(2000)); }
    function codigosTodos() { return docs(db().collection(col("ref_codigo"))); }
    function liquidacionesTodas() { return docs(db().collection(col("ref_liquidacion")).orderBy("fecha_on", "desc").limit(500)); }
    function marcarAlerta(id, estado) { return db().collection(col("ref_alerta")).doc(id).update({ estado: estado, revisada_por: uid(), fecha_revision: ahora() }); }

    /* Liquidar a un trabajador: sus «ganadas» pasan a «pagada» y se descuentan las revertidas después de pagarse. */
    function liquidar(trabajador, comisiones, bono) {
        var liq = R.liquidacion(comisiones, bono || 0);
        if (!liq.se_puede) return Promise.reject(new Error(liq.neto < 0 ? "El saldo está en contra: se descuenta cuando gane más." : "No hay comisiones ganadas para liquidar."));
        var ref = db().collection(col("ref_liquidacion")).doc(), f = ahora(), b = db().batch();
        b.set(ref, { key_trabajador: trabajador.key_usuario, nombre: trabajador.nombre || "", codigo: trabajador.codigo || "", comisiones: liq.ganadas, descuentos: liq.descuentos,
            bruto: liq.bruto, bono: liq.bono, descuento: liq.descuento, neto: liq.neto, periodo: R.periodo(f).clave, pagado_por: uid(), fecha_on: f });
        liq.ganadas.forEach(function (id) { b.update(db().collection(col("ref_comision")).doc(id), { estado: "pagada", fecha_pagada: f, liquidacion: ref.id }); });
        liq.descuentos.forEach(function (id) { b.update(db().collection(col("ref_comision")).doc(id), { descontada_en: ref.id }); });
        return b.commit().then(function () { return Object.assign({ id: ref.id }, liq); });
    }

    /* ---------- sincronización con el ERP (la corre Dirección/Administración al abrir su vista) ----------
       1) valida las inscripciones nuevas; 2) busca la primera compra de cada referido válido y su pago;
       3) revisa anulaciones y pagos de lo ya registrado; 4) actualiza el ranking y la tabla de paquetes. */
    function buscarClienteERP(ci, tel) {
        var porCi = R.normCI(ci) ? erp("buscar_cliente", { ci: String(ci).trim() }) : Promise.resolve(null);
        return porCi.then(function (r) {
            var c = r && r.clientes && r.clientes[0];
            if (c || !R.normTel(tel)) return c || null;
            return erp("buscar_cliente", { telefono: String(tel).trim() }).then(function (t) { return (t && t.clientes && t.clientes[0]) || null; });
        }).then(function (c) {
            if (!c) return null;
            return erp("ver_cliente", { key_usuario: c.key }).then(function (f) {
                var cl = (f && f.cliente) || c, co = (f && f.compras) || {};
                return { key_usuario: cl.key || c.key, nombre: cl.nombre, ci: cl.ci, telefono: cl.telefono, compras: Number(co.compras) || 0, primera_compra: co.primera_compra || null };
            });
        }, function () { return null; });
    }
    function idCliente(ci, tel) { var c = R.normCI(ci); return c ? "ci_" + c : "tel_" + R.normTel(tel); }
    function alerta(tipo, detalle, ins, trabajador) {
        return db().collection(col("ref_alerta")).add({ tipo: tipo, detalle: String(detalle || "").slice(0, 300), codigo: ins.codigo || "", key_trabajador: (trabajador && trabajador.key_usuario) || "",
            trabajador: (trabajador && trabajador.nombre) || "", cliente: ins.nombre || "", ci: ins.ci || "", telefono: ins.telefono || "", estado: "nueva", fecha_on: ahora() });
    }

    function sincronizar(avance) {
        avance = avance || function () {};
        if (PY) return Promise.resolve({ aviso: "Paraguay: falta que el ERP de Calistenia Paraguay permita buscar clientes por carnet y ver el recibo de cada venta. El módulo ya está listo y se activa apenas esté ese dato." });
        var res = { inscripciones: 0, validas: 0, rechazadas: 0, comisiones_nuevas: 0, cambios: 0, errores: [] };
        var cfgP = config();
        return cfgP.then(function (C) {
            /* 1) inscripciones nuevas */
            return docs(db().collection(col("ref_inscripcion")).where("estado", "==", "nueva").limit(100)).then(function (lista) {
                avance("Revisando " + lista.length + " inscripciones nuevas…");
                return lista.reduce(function (p, ins) { return p.then(function () { return procesarInscripcion(ins, res); }); }, Promise.resolve());
            }).then(function () {
                /* 2) referidos válidos sin comisión todavía */
                return docs(db().collection(col("ref_cliente")).where("estado", "==", "valido").where("con_venta", "==", false).limit(200));
            }).then(function (cls) {
                avance("Buscando la primera compra de " + cls.length + " referidos…");
                return cls.reduce(function (p, c) { return p.then(function () { return buscarVenta(c, C.cfg, res); }); }, Promise.resolve());
            }).then(function () {
                /* 3) lo ya registrado: pagos de las pendientes y anulaciones (últimos 120 días) */
                var desde = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
                return docs(db().collection(col("ref_comision")).where("fecha_venta", ">=", desde));
            }).then(function (coms) {
                var vivas = coms.filter(function (c) { return c.estado !== "revertida"; });
                avance("Revisando pagos y anulaciones de " + vivas.length + " ventas…");
                return vivas.reduce(function (p, c) { return p.then(function () { return revisarComision(c, C.cfg, res); }); }, Promise.resolve());
            }).then(function () { avance("Actualizando ranking y paquetes…"); return Promise.all([actualizarRanking(), actualizarPaquetes()]); })
              .then(function () { return res; });
        });
    }
    function procesarInscripcion(ins, res) {
        res.inscripciones++;
        var codigo = R.normCodigo(ins.codigo);
        return codigoPublico(codigo).then(function (idx) {
            return idx ? uno(db().collection(col("ref_codigo")).doc(idx.key_usuario)) : null;
        }).then(function (trab) {
            var id = idCliente(ins.ci, ins.telefono);
            return Promise.all([buscarClienteERP(ins.ci, ins.telefono), uno(db().collection(col("ref_cliente")).doc(id)),
                R.normTel(ins.telefono) && R.normCI(ins.ci) ? uno(db().collection(col("ref_cliente")).doc("tel_" + R.normTel(ins.telefono))) : null])
                .then(function (a) {
                    var ya = a[1] || a[2];
                    var v = R.validarInscripcion({ codigo: codigo, ci: ins.ci, telefono: ins.telefono, nombre: ins.nombre, fecha: ins.fecha_on }, trab, a[0], ya);
                    var ps = v.alertas.map(function (al) { return alerta(al.tipo, al.detalle, ins, trab); });
                    if (v.ok) {
                        res.validas++;
                        ps.push(db().collection(col("ref_cliente")).doc(id).set({ codigo: codigo, key_trabajador: trab.key_usuario, trabajador: trab.nombre || "", ci: ins.ci, telefono: ins.telefono,
                            nombre: ins.nombre, key_cliente: (a[0] && a[0].key_usuario) || null, fecha_inscripcion: ins.fecha_on, estado: "valido", con_venta: false, inscripcion: ins.id, fecha_on: ahora() }));
                    } else res.rechazadas++;
                    ps.push(db().collection(col("ref_inscripcion")).doc(ins.id).update({ estado: v.ok ? "valida" : "rechazada", motivo: v.motivo || "", fecha_proceso: ahora() }));
                    return Promise.all(ps);
                });
        }).catch(function (e) { res.errores.push("Inscripción " + (ins.nombre || ins.id) + ": " + e.message); });
    }
    function buscarVenta(cli, cfg, res) {
        var key = cli.key_cliente ? Promise.resolve(cli.key_cliente) : buscarClienteERP(cli.ci, cli.telefono).then(function (c) { return c && c.key_usuario; });
        return key.then(function (k) {
            if (!k) return null;   // todavía no se registró en el ERP
            return erp("historial_paquetes_cliente", { key_usuario: k, limite: 50 }).then(function (h) {
                var r = R.ventaDelReferido((h && h.filas) || [], cli.fecha_inscripcion);
                var refCli = db().collection(col("ref_cliente")).doc(cli.id);
                if (r.existente) {
                    res.rechazadas++;
                    return Promise.all([refCli.update({ estado: "rechazado", motivo: "Tenía compras antes de anotarse.", key_cliente: k }),
                        alerta("existente", "Al buscar su compra se vio que ya era cliente antes de anotarse.", cli, { key_usuario: cli.key_trabajador, nombre: cli.trabajador })]);
                }
                if (!r.venta) return cli.key_cliente ? null : refCli.update({ key_cliente: k });
                return erp("ver_venta", { key_paquete_venta: r.venta.key_paquete_venta }).then(function (vv) {
                    var v = (vv && vv.venta) || {};
                    var datos = { anulada: !!v.anulada, cobrado: R.cobrado(vv && vv.pagos), precio: Number(v.precio) || Number(r.venta.precio) || 0, paquete: v.paquete || r.venta.paquete };
                    var cambios = R.actualizar(null, datos, cfg);
                    if (!cambios) return null;
                    res.comisiones_nuevas++;
                    var doc = Object.assign({ key_trabajador: cli.key_trabajador, trabajador: cli.trabajador, codigo: cli.codigo, key_cliente: k, cliente: cli.nombre,
                        key_paquete_venta: r.venta.key_paquete_venta, paquete: datos.paquete, sucursal: r.venta.sucursal || "", precio: datos.precio,
                        fecha_venta: String(r.venta.fecha_venta || v.fecha || "").slice(0, 10), fecha_on: ahora() }, cambios);
                    return Promise.all([db().collection(col("ref_comision")).doc(r.venta.key_paquete_venta).set(doc), refCli.update({ con_venta: true, key_cliente: k })]);
                });
            });
        }).catch(function (e) { res.errores.push("Referido " + (cli.nombre || cli.id) + ": " + e.message); });
    }
    function revisarComision(c, cfg, res) {
        return erp("ver_venta", { key_paquete_venta: c.key_paquete_venta || c.id }).then(function (vv) {
            var v = (vv && vv.venta) || {};
            var cambios = R.actualizar(c, { anulada: !!v.anulada, cobrado: R.cobrado(vv && vv.pagos), precio: Number(v.precio) || c.precio, paquete: v.paquete || c.paquete }, cfg);
            if (!cambios) return null;
            res.cambios++;
            return db().collection(col("ref_comision")).doc(c.id).update(cambios);
        }).catch(function (e) { res.errores.push("Venta " + c.id + ": " + e.message); });
    }
    function actualizarRanking() {
        var p = R.periodo(ahora());
        return docs(db().collection(col("ref_comision")).where("fecha_ganada", ">=", p.desde)).then(function (coms) {
            var por = {};
            coms.forEach(function (c) {
                var f = String(c.fecha_ganada).slice(0, 10);
                if (f > p.hasta || (c.estado !== "ganada" && c.estado !== "pagada")) return;
                var x = por[c.key_trabajador] || (por[c.key_trabajador] = { key: c.key_trabajador, nombre: String(c.trabajador || "").split(/\s+/).slice(0, 2).join(" "), cierres: 0, comision: 0 });
                x.cierres++; x.comision = R.redondear(x.comision + (Number(c.comision) || 0));
            });
            return db().collection(col("ref_resumen")).doc(p.clave).set({ filas: R.ranking(Object.keys(por).map(function (k) { return por[k]; })), periodo: p, fecha_on: ahora() });
        });
    }
    function actualizarPaquetes() {
        return erp("listar_paquetes", {}).then(function (r) {
            var lista = ((r && r.result) || r || []);
            if (!Array.isArray(lista)) lista = lista.paquetes || [];
            var vis = {}, out = [];
            lista.forEach(function (p) {
                var n = String(p.descripcion || p.nombre || "").trim();
                if (!n || !(Number(p.precio) > 0) || !(Number(p.dias) > 0) || p.vendible_en_caja === false || p.usa_molinete === false || vis[n.toLowerCase()]) return;
                vis[n.toLowerCase()] = 1; out.push({ nombre: n, precio: Number(p.precio) });
            });
            return db().collection(col("ref_config")).doc("paquetes").set({ lista: out.slice(0, 80), fecha_on: ahora() });
        }).catch(function () { return null; });
    }

    /* Oferta pública para la venta en el momento (la lee la página de inscripción sin sesión). */
    function oferta() { return uno(db().collection(col("ref_publico")).doc("oferta")); }
    function guardarOferta(o, paquetes) {
        var lista = (paquetes || []).filter(function (p) { return p && p.nombre && Number(p.precio) > 0; }).slice(0, 60).map(function (p) { return { nombre: String(p.nombre).slice(0, 120), precio: Number(p.precio) }; });
        var desc = Number(o.desc); if (!(desc >= 0 && desc <= 50)) return Promise.reject(new Error("El descuento debe estar entre 0 y 50 %."));
        if (o.pago_qr && o.pago_qr.length > 600000) return Promise.reject(new Error("La imagen del QR es muy pesada. Probá con una captura más chica."));
        return db().collection(col("ref_publico")).doc("oferta").set({ desc: desc, paquetes: lista, pago_texto: String(o.pago_texto || "").slice(0, 800), pago_qr: o.pago_qr || "", fecha_on: ahora(), editado_por: uid() });
    }
    /* Seguimiento: inscripciones de los últimos días y pagos por confirmar. */
    function inscripcionesRecientes(dias) { var d = new Date(Date.now() - (dias || 14) * 864e5).toISOString(); return docs(db().collection(col("ref_inscripcion")).where("fecha_on", ">=", d)); }
    function pagos(estado) { return docs(db().collection(col("ref_pago")).where("estado", "==", estado || "por_confirmar")); }
    function seguir(id, cambio) { return db().collection(col("ref_inscripcion")).doc(id).update(Object.assign({ fecha_seguimiento: ahora() }, cambio)); }
    function resolverPago(id, estado, nombre, nota) { return db().collection(col("ref_pago")).doc(id).update({ estado: estado, confirmado_por: uid(), confirmado_nombre: String(nombre || "").slice(0, 120), fecha_confirmacion: ahora(), nota: String(nota || "").slice(0, 500) }); }
    /* Quiénes se anotaron con mi código: solo el nombre y la fecha (ref_anotado; los datos completos no se le muestran). */
    function misAnotados(codigo) { return docs(db().collection(col("ref_anotado")).where("codigo", "==", codigo)).then(function (l) { return l.sort(function (a, b) { return String(b.fecha_on).localeCompare(String(a.fecha_on)); }); }); }
    window.REF_DATOS = {
        misAnotados: misAnotados,
        oferta: oferta, guardarOferta: guardarOferta, inscripcionesRecientes: inscripcionesRecientes, pagos: pagos, seguir: seguir, resolverPago: resolverPago,
        PY: PY, col: col, miCodigo: miCodigo, crearCodigo: crearCodigo, guardarFamiliares: guardarFamiliares, misComisiones: misComisiones, misLiquidaciones: misLiquidaciones,
        config: config, rankingPeriodo: rankingPeriodo, codigoPublico: codigoPublico, inscribir: inscribir,
        guardarConfig: guardarConfig, listar: listar, comisionesTodas: comisionesTodas, codigosTodos: codigosTodos, liquidacionesTodas: liquidacionesTodas,
        marcarAlerta: marcarAlerta, liquidar: liquidar, sincronizar: sincronizar
    };
})();
