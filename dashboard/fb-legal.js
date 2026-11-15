/* Herramientas legal_* sobre Firestore (mismas fichas y reglas que el componente "legal" del servidor). */
(function () {
    "use strict";
    if (!window.CMFB) return;
    var U = CMFB.util;
    var COL = { contrato: "legal_contrato", permiso: "legal_permiso", caso: "legal_caso", evento: "legal_caso_evento", plazo: "legal_plazo" };
    var t = function (max, req) { return { t: "texto", max: max, req: req }; };
    var o = function (ops, def) { return { t: "opcion", ops: ops, def: def }; };
    var F = {
        contrato: {
            tipo: { t: "opcion", ops: ["alquiler", "personal", "proveedor", "convenio", "servicio", "otro"], req: true },
            titulo: t(200, true), contraparte: t(200, true), documento_identidad: t(40), sucursal: t(120),
            monto: { t: "monto" }, moneda: o(["BOB", "USD"], "BOB"), periodicidad: o(["mensual", "anual", "unico"]),
            fecha_inicio: { t: "fecha" }, fecha_fin: { t: "fecha" }, renovacion_automatica: { t: "bool" }, aviso_dias: { t: "entero", def: 30 },
            situacion: o(["vigente", "en_negociacion", "rescindido", "finalizado"], "vigente"),
            responsable: t(120), documento_url: { t: "url" }, observacion: t(4000)
        },
        permiso: {
            tipo: { t: "opcion", ops: ["licencia_funcionamiento", "permiso_municipal", "seprec", "impuestos", "seguro", "bomberos", "sanitario", "publicidad", "otro"], req: true },
            nombre: t(200, true), sucursal: t(120), entidad: t(200), numero: t(80), fecha_emision: { t: "fecha" }, fecha_vencimiento: { t: "fecha" },
            aviso_dias: { t: "entero", def: 30 }, en_tramite: { t: "bool" }, costo: { t: "monto" }, responsable: t(120), documento_url: { t: "url" }, observacion: t(4000)
        },
        caso: {
            tipo: { t: "opcion", ops: ["laboral", "civil", "penal", "administrativo", "reclamo_cliente", "multa", "otro"], req: true },
            titulo: t(200, true), contraparte: t(200), rol: o(["demandante", "demandado", "otro"]), entidad: t(200), expediente: t(80), abogado: t(120),
            sucursal: t(120), monto_en_juego: { t: "monto" }, situacion: o(["abierto", "en_proceso", "suspendido", "conciliado", "cerrado_favorable", "cerrado_desfavorable"], "abierto"),
            prioridad: o(["alta", "normal", "baja"], "normal"), fecha_apertura: { t: "fecha" }, fecha_cierre: { t: "fecha" }, proxima_fecha: { t: "fecha" },
            proxima_actuacion: t(300), descripcion: t(8000), documento_url: { t: "url" }
        },
        evento: {
            key_caso: { t: "key", req: true }, fecha: { t: "fecha", req: true }, tipo: { t: "opcion", ops: ["audiencia", "presentacion", "notificacion", "pago", "nota"], req: true },
            descripcion: t(4000, true), costo: { t: "monto" }, documento_url: { t: "url" }
        },
        plazo: {
            titulo: t(200, true), fecha: { t: "fecha", req: true }, tipo: o(["obligacion", "presentacion", "pago", "renovacion", "reunion", "otro"], "obligacion"),
            sucursal: t(120), responsable: t(120), aviso_dias: { t: "entero", def: 7 }, hecho: { t: "bool" }, observacion: t(4000)
        }
    };
    function entidad(a) { if (!COL[a.entidad]) throw U.err("entidad debe ser una de: " + Object.keys(COL).join(", ") + "."); return a.entidad; }
    function validar(d, nombre, c, alta) {
        var v;
        switch (c.t) {
            case "texto": v = U.txt(d, nombre, c.max, c.req); break;
            case "opcion": v = U.opcion(d, nombre, c.ops, alta ? c.def : null, c.req); break;
            case "fecha": v = U.fecha(d, nombre, c.req); break;
            case "monto": v = U.monto(d, nombre, c.req, false); break;
            case "entero": v = U.entero(d, nombre, 0, 3650, alta ? c.def : null); break;
            case "bool": v = U.bool(d, nombre); break;
            case "url": v = U.url(d, nombre); break;
            case "key": v = U.txt(d, nombre, 64, true); if (!/^[A-Za-z0-9_-]+$/.test(v)) throw U.err("El campo " + nombre + " no es válido."); break;
        }
        return v === undefined ? null : v;
    }
    function orden(a, b, x, y, msg) { if (a[x] && a[y] && a[y] < a[x]) throw U.err(msg); }

    CMFB.registrar("legal_sucursales", function () { return U.sucursales().then(function (l) { return { filas: l }; }); });
    CMFB.registrar("legal_listar", function (a) {
        var e = entidad(a), q = U.db().collection(COL[e]);
        if (e === "evento" && a.key_caso) q = q.where("key_caso", "==", String(a.key_caso));
        return U.docs(q).then(function (l) { return { filas: U.vigentes(l) }; });
    });
    CMFB.registrar("legal_guardar", function (a) {
        var e = entidad(a), d = a.data || {}, alta = !d.key, ficha = F[e], out = {};
        Object.keys(ficha).forEach(function (k) {
            if (!alta && !(k in d)) return;
            out[k] = validar(d, k, ficha[k], alta);
        });
        var fus = Object.assign({}, out);
        orden(fus, d, "fecha_inicio", "fecha_fin", "La fecha de fin no puede ser anterior a la de inicio.");
        orden(fus, d, "fecha_emision", "fecha_vencimiento", "El vencimiento no puede ser anterior a la emisión.");
        orden(fus, d, "fecha_apertura", "fecha_cierre", "El cierre no puede ser anterior a la apertura.");
        var col = U.db().collection(COL[e]), quien = CMFB.correo();
        var previo = e === "evento" ? U.db().collection("legal_caso").doc(out.key_caso || "-").get().then(function (c) {
            if (!c.exists || Number(c.data().estado) <= 0) throw U.err("El caso no existe o fue eliminado.");
        }) : Promise.resolve();
        return previo.then(function () {
            if (e === "plazo" && "hecho" in out) out.fecha_hecho = out.hecho ? U.ahora() : null;
            if (alta) {
                var ref = col.doc();
                return ref.set(Object.assign(out, { estado: 1, fecha_on: U.ahora(), key_usuario: quien })).then(function () { return ref; });
            }
            var ref2 = col.doc(String(d.key));
            return ref2.get().then(function (x) {
                if (!x.exists || Number(x.data().estado) <= 0) throw U.err("El registro no existe o fue eliminado.");
                if (e === "plazo" && out.hecho && x.data().fecha_hecho) out.fecha_hecho = x.data().fecha_hecho;
                var final = Object.assign({}, x.data(), out);
                orden(final, final, "fecha_inicio", "fecha_fin", "La fecha de fin no puede ser anterior a la de inicio.");
                orden(final, final, "fecha_emision", "fecha_vencimiento", "El vencimiento no puede ser anterior a la emisión.");
                orden(final, final, "fecha_apertura", "fecha_cierre", "El cierre no puede ser anterior a la apertura.");
                return ref2.update(Object.assign(out, { key_usuario: quien, fecha_edicion: U.ahora() })).then(function () { return ref2; });
            });
        }).then(function (ref) { return ref.get(); }).then(function (x) { return { estado: "exito", data: Object.assign({ key: x.id }, x.data()) }; });
    });
    CMFB.registrar("legal_eliminar", function (a) {
        var e = entidad(a), k = U.txt(a, "key", 64, true), ref = U.db().collection(COL[e]).doc(k);
        return ref.get().then(function (x) {
            if (!x.exists || Number(x.data().estado) <= 0) throw U.err("El registro no existe o ya fue eliminado.");
            var lote = U.db().batch();
            lote.update(ref, { estado: 0, key_usuario: CMFB.correo(), fecha_edicion: U.ahora() });
            if (e !== "caso") return lote.commit();
            return U.db().collection("legal_caso_evento").where("key_caso", "==", k).get().then(function (s) {
                s.docs.forEach(function (d) { lote.update(d.ref, { estado: 0 }); });
                return lote.commit();
            });
        }).then(function () { return { estado: "exito", data: { key: k } }; });
    });
})();
