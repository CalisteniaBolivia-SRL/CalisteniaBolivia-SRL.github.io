/* Herramientas cuentas_por_pagar_* sobre Firestore (mismas reglas que los componentes cuenta_pagar y
   cuenta_pagar_pago del servidor). Cada cuenta guarda "pagado"; cada pago se registra en una transacción
   que vuelve a leer la cuenta, así nunca se paga más que el saldo. */
(function () {
    "use strict";
    if (!window.CMFB) return;
    var U = CMFB.util;
    var CATEGORIAS = ["alquiler", "servicios_basicos", "sueldos", "mercaderia", "impuestos", "mantenimiento", "marketing", "otros"];
    var FORMAS = ["efectivo", "transferencia", "cheque", "qr", "tarjeta", "otro"];
    var C = function () { return U.db().collection("cxp_cuenta"); }, P = function () { return U.db().collection("cxp_pago"); };
    var hoy = function () { return new Date().toISOString().slice(0, 10); };
    var r2 = function (n) { return Math.round(n * 100) / 100; };

    function enriquecer(c) {
        var pagado = r2(Number(c.pagado) || 0), saldo = r2((Number(c.monto) || 0) - pagado);
        return Object.assign({}, c, {
            key_sucursal: c.sucursal || null, sucursal: c.sucursal || "General", pagado: pagado, saldo: saldo,
            estado_pago: saldo <= 0 ? "pagada" : c.fecha_vencimiento < hoy() ? "vencida" : "pendiente"
        });
    }

    CMFB.registrar("cuentas_por_pagar_sucursales", function () {
        return U.sucursales().then(function (l) { return { filas: l.map(function (s) { return { key: s, descripcion: s }; }) }; });
    });
    CMFB.registrar("cuentas_por_pagar_listar", function (a) {
        var q = C().where("estado", "==", 1);
        return U.docs(q).then(function (l) {
            var out = l.map(enriquecer).filter(function (c) {
                if (a.desde && c.fecha_emision < a.desde) return false;
                if (a.hasta && c.fecha_emision > a.hasta) return false;
                if (a.key_sucursal && c.key_sucursal !== a.key_sucursal) return false;
                var ep = a.estado_pago || "todas";
                if (ep === "pendiente") return c.saldo > 0;
                if (ep === "vencida") return c.estado_pago === "vencida";
                if (ep === "pagada") return c.estado_pago === "pagada";
                return true;
            }).sort(function (x, y) { return String(x.fecha_vencimiento).localeCompare(String(y.fecha_vencimiento)) || String(x.proveedor).localeCompare(String(y.proveedor)); });
            return { filas: out };
        });
    });
    CMFB.registrar("cuentas_por_pagar_registrar", function (a) {
        var d = {
            proveedor: U.txt(a, "proveedor", 200, true), concepto: U.txt(a, "concepto", 300, true),
            categoria: U.opcion(a, "categoria", CATEGORIAS, null, true), tipo_costo: U.opcion(a, "tipo_costo", ["fijo", "variable"], null, true),
            recurrencia: U.opcion(a, "recurrencia", ["unica", "mensual"], "unica"), monto: U.monto(a, "monto", true, true),
            fecha_emision: U.fecha(a, "fecha_emision", true), fecha_vencimiento: U.fecha(a, "fecha_vencimiento", true),
            nit: U.txt(a, "nit", 40, false), nro_documento: U.txt(a, "nro_documento", 60, false), observacion: U.txt(a, "observacion", 1000, false),
            sucursal: U.txt(a, "key_sucursal", 120, false)
        };
        if (d.fecha_vencimiento < d.fecha_emision) throw U.err("La fecha de vencimiento no puede ser anterior a la de emisión.");
        var ref = C().doc();
        return ref.set(Object.assign(d, { pagado: 0, estado: 1, fecha_on: U.ahora(), key_usuario: CMFB.usuarioKey() }))
            .then(function () { return { estado: "exito", data: Object.assign({ key: ref.id }, d) }; });
    });
    CMFB.registrar("cuentas_por_pagar_pagar", function (a) {
        var key = U.txt(a, "key_cuenta_pagar", 64, true), m = U.monto(a, "monto", true, true);
        var pago = { key_cuenta_pagar: key, monto: m, fecha: U.fecha(a, "fecha", true), forma_pago: U.opcion(a, "forma_pago", FORMAS, null, true), observacion: U.txt(a, "observacion", 1000, false), estado: 1, fecha_on: U.ahora(), key_usuario: CMFB.usuarioKey() };
        var refC = C().doc(key), refP = P().doc();
        return U.db().runTransaction(function (tx) {
            return tx.get(refC).then(function (x) {
                if (!x.exists || Number(x.data().estado) <= 0) throw U.err("La cuenta por pagar no existe o está anulada.");
                var saldo = r2((Number(x.data().monto) || 0) - (Number(x.data().pagado) || 0));
                if (saldo <= 0) throw U.err("La cuenta ya está pagada.");
                if (m > saldo + 1e-9) throw U.err("El pago (" + m + ") supera el saldo pendiente (" + saldo + ").");
                tx.set(refP, pago);
                tx.update(refC, { pagado: r2((Number(x.data().pagado) || 0) + m), ultimo_pago: pago.fecha });
                return r2(saldo - m);
            });
        }).then(function (saldo) { return { estado: "exito", saldo: saldo, data: Object.assign({ key: refP.id }, pago) }; });
    });
    CMFB.registrar("cuentas_por_pagar_anular", function (a) {
        var key = U.txt(a, "key", 64, true), motivo = U.txt(a, "motivo", 500, true), ref = C().doc(key);
        return ref.get().then(function (x) {
            if (!x.exists || Number(x.data().estado) <= 0) throw U.err("La cuenta por pagar no existe o ya está anulada.");
            if ((Number(x.data().pagado) || 0) > 0) throw U.err("La cuenta tiene pagos registrados: no se puede anular.");
            var obs = x.data().observacion ? x.data().observacion + "\n" : "";
            return ref.update({ estado: 0, observacion: obs + "Anulada " + U.ahora() + " por " + (CMFB.nombre() || CMFB.usuarioKey()) + ": " + motivo });
        }).then(function () { return { estado: "exito", data: { key: key } }; });
    });
})();
