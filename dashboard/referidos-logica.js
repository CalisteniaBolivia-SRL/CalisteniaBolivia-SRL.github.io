/* =====================================================================================================
   Códigos de referido · reglas de negocio (sin interfaz ni datos: se prueban solas con Node).
   Bolivia y Paraguay usan exactamente estas reglas; solo cambia la moneda.
   - Código único por trabajador (JUAN-CAL), con link y QR.
   - Solo clientes nuevos (sin compras antes de anotarse). Un cliente queda con el primer código que usó.
   - Anti-fraude: ni el propio código ni el de un familiar declarado (alerta, además, si comparte apellidos).
   - Comisión = % del monto realmente cobrado (2,5 % por defecto; configurable global y por paquete).
   - Se genera solo al pagar y queda congelada; si se anula la venta, «Revertida» (y saldo en contra si ya se pagó).
   - Estados: pendiente (venta sin pago) → ganada (pagada) → pagada (al trabajador) | revertida.
   ===================================================================================================== */
(function (raiz) {
    "use strict";

    var ESTADOS = ["pendiente", "ganada", "pagada", "revertida"];
    var PCT_DEFECTO = 2.5;

    function sinAcentos(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, ""); }
    function redondear(n) { return Math.round(Number(((Number(n) || 0) * 100).toFixed(6))) / 100; }   /* 4,975 → 4,98 */

    /* ---------- código ---------- */
    function normCodigo(s) { return sinAcentos(s).toUpperCase().replace(/[^A-Z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 20); }
    /* JUAN-CAL con el primer nombre; si ya existe, JUAN2-CAL, JUAN3-CAL… (existe(codigo) → bool). */
    function generarCodigo(nombre, existe) {
        var base = sinAcentos(nombre).toUpperCase().replace(/[^A-Z ]/g, " ").trim().split(/\s+/)[0] || "CAL";
        base = base.slice(0, 12);
        for (var i = 1; i < 1000; i++) {
            var c = base + (i === 1 ? "" : String(i)) + "-CAL";
            if (!existe || !existe(c)) return c;
        }
        return base + Date.now().toString(36).toUpperCase() + "-CAL";
    }

    /* ---------- personas ---------- */
    function normCI(s) { return sinAcentos(s).toUpperCase().replace(/[^0-9A-Z]/g, ""); }
    /* Celular: los últimos 8 dígitos (Bolivia) o 9 (Paraguay); se compara por los últimos 8. */
    function normTel(s) { var d = String(s == null ? "" : s).replace(/\D/g, ""); return d.length >= 7 ? d.slice(-8) : ""; }
    function palabras(nombre) { return sinAcentos(nombre).toLowerCase().replace(/[^a-zñ ]/g, " ").split(/\s+/).filter(function (p) { return p.length > 2; }); }
    /* Los dos apellidos (las dos últimas palabras del nombre completo). */
    function apellidos(nombre) { var p = palabras(nombre); return p.length >= 3 ? p.slice(-2) : p.length === 2 ? [p[1]] : []; }
    function mismaPersona(a, b) {
        if (!a || !b) return false;
        var ca = normCI(a.ci), cb = normCI(b.ci), ta = normTel(a.telefono), tb = normTel(b.telefono);
        return !!((ca && ca === cb) || (ta && ta === tb) || (a.key_usuario && a.key_usuario === b.key_usuario));
    }

    /* ---------- validación de una inscripción (cliente que se anota con el código de un trabajador) ----------
       ins: { codigo, ci, telefono, nombre, fecha }            (lo que dejó el cliente en el link/QR)
       trabajador: ref_codigo del dueño del código { key_usuario, nombre, ci, telefono, familiares:[{ci,telefono,nombre}] }
       clienteERP: ficha del ERP si ya existe { key_usuario, nombre, ci, telefono, compras, primera_compra } o null
       yaAsociado: ref_cliente existente para ese carnet/celular (o null)
       → { ok, estado: "valido"|"rechazado", motivo, alertas:[{tipo, detalle}] } */
    function validarInscripcion(ins, trabajador, clienteERP, yaAsociado) {
        var alertas = [], r = function (motivo, tipo, detalle) {
            if (tipo) alertas.push({ tipo: tipo, detalle: detalle || motivo });
            return { ok: false, estado: "rechazado", motivo: motivo, alertas: alertas };
        };
        if (!trabajador || trabajador.estado === 0) return r("El código no existe o está desactivado.", null);
        if (!normCI(ins.ci) && !normTel(ins.telefono)) return r("Falta el carnet o el celular del cliente.", null);
        var cli = { ci: ins.ci, telefono: ins.telefono, key_usuario: clienteERP && clienteERP.key_usuario };
        if (mismaPersona(cli, trabajador)) return r("Intentó usar su propio código.", "propio", "El cliente es el mismo trabajador (" + (trabajador.nombre || "") + ").");
        var fam = (trabajador.familiares || []).filter(function (f) { return mismaPersona(cli, f); })[0];
        if (fam) return r("Es familiar declarado del trabajador.", "familiar", "Familiar declarado: " + (fam.nombre || fam.ci || ""));
        if (yaAsociado) {
            if (yaAsociado.codigo === normCodigo(ins.codigo)) return r("Ya estaba anotado con este código.", null);
            return r("El cliente ya usó otro código (" + yaAsociado.codigo + "): vale el primero.", "duplicado", "Ya asociado a " + yaAsociado.codigo);
        }
        if (clienteERP && esClienteExistente(clienteERP, ins.fecha))
            return r("El cliente ya tenía compras antes de anotarse (no es cliente nuevo).", "existente", "Primera compra: " + (clienteERP.primera_compra || "—") + " · compras: " + (clienteERP.compras || 0));
        var ap = apellidos(trabajador.nombre), apc = apellidos(ins.nombre || (clienteERP && clienteERP.nombre));
        if (ap.length === 2 && apc.length === 2 && ap[0] === apc[0] && ap[1] === apc[1])
            alertas.push({ tipo: "apellido", detalle: "Comparte los dos apellidos con el trabajador: revisar si es familiar." });
        return { ok: true, estado: "valido", motivo: "", alertas: alertas };
    }
    /* Cliente existente = tiene alguna compra antes del día en que se anotó. Registrado sin compras = nuevo. */
    function esClienteExistente(clienteERP, fechaInscripcion) {
        if (!clienteERP || !(Number(clienteERP.compras) > 0)) return false;
        if (!clienteERP.primera_compra) return true;
        return String(clienteERP.primera_compra).slice(0, 10) < String(fechaInscripcion || "9999").slice(0, 10);
    }

    /* ---------- venta que genera la comisión ----------
       historial: compras del cliente [{ key_paquete_venta, fecha_venta, paquete, sucursal, precio, anulada }]
       → la primera compra (no anulada) desde el día en que se anotó; null si todavía no compró.
       Si hubo una compra anterior (no anulada), el cliente no es nuevo: { existente: true }. */
    function ventaDelReferido(historial, fechaInscripcion) {
        var dia = String(fechaInscripcion || "").slice(0, 10);
        var filas = (historial || []).slice().sort(function (a, b) { return String(a.fecha_venta).localeCompare(String(b.fecha_venta)); });
        var previa = filas.filter(function (v) { return !v.anulada && String(v.fecha_venta).slice(0, 10) < dia; })[0];
        if (previa) return { existente: true, venta: null };
        return { existente: false, venta: filas.filter(function (v) { return !v.anulada && String(v.fecha_venta).slice(0, 10) >= dia; })[0] || null };
    }

    /* Lo realmente cobrado: suma de los pagos positivos no anulados del recibo (las transferencias aparecen
       como +X y −X porque el dinero pasa al banco: el −X no es una devolución). */
    function cobrado(pagos) {
        return redondear((pagos || []).reduce(function (s, p) { var m = Number(p.monto) || 0; return s + (!p.anulado && m > 0 ? m : 0); }, 0));
    }

    /* % que corresponde: por paquete si está configurado; si no, el global. */
    function pctPara(cfg, paquete) {
        var pp = (cfg && cfg.pct_paquete) || {}, k = sinAcentos(paquete).toLowerCase().trim();
        for (var n in pp) if (sinAcentos(n).toLowerCase().trim() === k && Number(pp[n]) >= 0) return Number(pp[n]);
        var g = cfg && Number(cfg.pct);
        return g >= 0 && cfg.pct != null ? g : PCT_DEFECTO;
    }
    function calcularComision(montoCobrado, pct) { return redondear((Number(montoCobrado) || 0) * (Number(pct) || 0) / 100); }

    /* ---------- estado de una comisión ----------
       com: lo guardado (o null si es nueva). venta: { anulada, cobrado, precio, paquete, ... } leída del ERP hoy.
       Devuelve los campos a guardar (o null si no cambia). Una vez «ganada», el monto ya no cambia. */
    function actualizar(com, venta, cfg, ahora) {
        ahora = ahora || new Date().toISOString();
        var e = com ? com.estado : null;
        if (e === "revertida") return null;
        if (venta.anulada) {
            if (!com) return null;   // nunca generó nada
            return { estado: "revertida", fecha_revertida: ahora, revertida_tras_pago: e === "pagada", saldo: e === "pagada" ? -redondear(com.comision) : 0 };
        }
        if (e === "ganada" || e === "pagada") return null;   // congelada
        var pct = pctPara(cfg, venta.paquete);
        if (venta.cobrado > 0) return { estado: "ganada", cobrado: redondear(venta.cobrado), pct: pct, comision: calcularComision(venta.cobrado, pct), fecha_ganada: ahora, saldo: 0 };
        if (!com) return { estado: "pendiente", cobrado: 0, pct: pct, comision: 0, estimada: calcularComision(venta.precio, pct), saldo: 0 };
        return null;
    }

    /* ---------- período de pago: del 26 al 25 (igual que las comisiones de las ATC) ---------- */
    function periodo(fechaIso) {
        var d = new Date(String(fechaIso).slice(0, 10) + "T12:00:00Z"), y = d.getUTCFullYear(), m = d.getUTCMonth();
        if (d.getUTCDate() >= 26) m += 1;
        var fin = new Date(Date.UTC(y, m, 25)), ini = new Date(Date.UTC(y, m - 1, 26));
        return { clave: fin.toISOString().slice(0, 7), desde: ini.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
    }

    /* ---------- resumen del trabajador (todo en montos) ---------- */
    function resumen(comisiones, hoyIso) {
        var hoy = String(hoyIso).slice(0, 10), p = periodo(hoy), d0 = new Date(hoy + "T12:00:00Z");
        var lunes = new Date(d0); lunes.setUTCDate(d0.getUTCDate() - ((d0.getUTCDay() + 6) % 7));
        var semana = lunes.toISOString().slice(0, 10);
        var r = { cierres_dia: 0, cierres_semana: 0, cierres_periodo: 0, ganada: 0, pendiente: 0, pagada: 0, en_contra: 0, saldo: 0, periodo: p };
        (comisiones || []).forEach(function (c) {
            var f = String(c.fecha_ganada || "").slice(0, 10);
            if (c.estado === "ganada" || c.estado === "pagada") {
                if (f === hoy) r.cierres_dia++;
                if (f >= semana && f <= hoy) r.cierres_semana++;
                if (f >= p.desde && f <= p.hasta) r.cierres_periodo++;
            }
            if (c.estado === "ganada") r.ganada += Number(c.comision) || 0;
            if (c.estado === "pendiente") r.pendiente += Number(c.estimada) || 0;
            if (c.estado === "pagada") r.pagada += Number(c.comision) || 0;
            if (c.estado === "revertida" && c.revertida_tras_pago && !c.descontada_en) r.en_contra += Number(c.comision) || 0;
        });
        ["ganada", "pendiente", "pagada", "en_contra"].forEach(function (k) { r[k] = redondear(r[k]); });
        r.saldo = redondear(r.ganada - r.en_contra);   // a favor (+) o en contra (−) para la próxima liquidación
        return r;
    }

    /* Meta y bonos del período. cfg: { meta_cierres, bonos:[{cierres, monto}] } */
    function metaYBonos(cierres, cfg) {
        var bonos = ((cfg && cfg.bonos) || []).filter(function (b) { return b.cierres > 0 && b.monto > 0; })
            .sort(function (a, b) { return a.cierres - b.cierres; });
        var ganados = bonos.filter(function (b) { return cierres >= b.cierres; });
        var prox = bonos.filter(function (b) { return cierres < b.cierres; })[0] || null;
        var meta = Number(cfg && cfg.meta_cierres) || (prox ? prox.cierres : (bonos.length ? bonos[bonos.length - 1].cierres : 0));
        return {
            meta: meta, avance: meta ? Math.min(1, cierres / meta) : 0, faltan_meta: Math.max(0, meta - cierres),
            bono_ganado: redondear(ganados.reduce(function (s, b) { return s + b.monto; }, 0)),
            proximo: prox ? { cierres: prox.cierres, monto: prox.monto, faltan: prox.cierres - cierres } : null
        };
    }

    /* ---------- liquidación ----------
       Toma las «ganadas» y descuenta las revertidas después de pagarse (saldo en contra). Solo se liquida si el neto es positivo. */
    function liquidacion(comisiones, bono) {
        var gan = (comisiones || []).filter(function (c) { return c.estado === "ganada"; });
        var neg = (comisiones || []).filter(function (c) { return c.estado === "revertida" && c.revertida_tras_pago && !c.descontada_en; });
        var bruto = redondear(gan.reduce(function (s, c) { return s + (Number(c.comision) || 0); }, 0));
        var descuento = redondear(neg.reduce(function (s, c) { return s + (Number(c.comision) || 0); }, 0));
        var neto = redondear(bruto + (Number(bono) || 0) - descuento);
        return { ganadas: gan.map(function (c) { return c.id; }), descuentos: neg.map(function (c) { return c.id; }), bruto: bruto, bono: redondear(bono), descuento: descuento, neto: neto, se_puede: neto > 0 };
    }

    /* «Si vendés este paquete, ganás X» */
    function tablaPaquetes(paquetes, cfg) {
        return (paquetes || []).filter(function (p) { return Number(p.precio) > 0; }).map(function (p) {
            var pct = pctPara(cfg, p.nombre);
            return { nombre: p.nombre, precio: Number(p.precio), gana: calcularComision(p.precio, pct) };
        }).sort(function (a, b) { return b.gana - a.gana; });
    }

    /* Ranking por cierres del período (desempate por comisión). */
    function ranking(filas) {
        return (filas || []).slice().sort(function (a, b) { return (b.cierres - a.cierres) || (b.comision - a.comision) || String(a.nombre).localeCompare(String(b.nombre)); })
            .map(function (f, i) { return Object.assign({ puesto: i + 1 }, f); });
    }

    var API = {
        ESTADOS: ESTADOS, PCT_DEFECTO: PCT_DEFECTO, normCodigo: normCodigo, generarCodigo: generarCodigo, normCI: normCI, normTel: normTel,
        apellidos: apellidos, mismaPersona: mismaPersona, validarInscripcion: validarInscripcion, esClienteExistente: esClienteExistente,
        ventaDelReferido: ventaDelReferido, cobrado: cobrado, pctPara: pctPara, calcularComision: calcularComision, actualizar: actualizar,
        periodo: periodo, resumen: resumen, metaYBonos: metaYBonos, liquidacion: liquidacion, tablaPaquetes: tablaPaquetes, ranking: ranking, redondear: redondear
    };
    if (typeof module === "object" && module.exports) module.exports = API; else raiz.REF_LOGICA = API;
})(this);
