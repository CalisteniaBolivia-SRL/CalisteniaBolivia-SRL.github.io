/* Lógica del sistema comercial (sin DOM): reparto de clientes, estado en el CRM, prioridad y comisiones.
   La usan las dos vistas de comercial.html y se puede probar aparte (window.COM_logica). */
(function () {
    "use strict";

    var DIA = 86400000;
    var RESULTADOS = {
        no_contesta: { texto: "No contesta", tono: "warn" },
        interesado: { texto: "Interesado", tono: "ok" },
        agendado: { texto: "Agendó su regreso", tono: "ok" },
        no_interesado: { texto: "No le interesa", tono: "muted" },
        numero_errado: { texto: "Número equivocado", tono: "bad" },
        otro: { texto: "Otro", tono: "muted" }
    };
    var CANALES = { whatsapp: "WhatsApp", llamada: "Llamada", presencial: "Presencial", otro: "Otro" };

    function texto(v) { return v == null ? "" : String(v).trim(); }
    function norm(s) { return texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " "); }
    function iso(d) { var p = function (n) { return String(n).padStart(2, "0"); }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
    function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h); }
    function diasEntre(a, b) { return Math.round((new Date(texto(b).slice(0, 10) + "T00:00:00") - new Date(texto(a).slice(0, 10) + "T00:00:00")) / DIA); }

    /* Clave del cliente: key_usuario si el MCP la trae (necesaria para el CRM y las comisiones). */
    function claveCliente(c) { return texto(c.key_usuario || c.key_cliente); }

    /* Clientes antiguos: vencidos hace más de "minDias" días (por defecto 30), uno por cliente (el vencimiento más reciente). */
    function antiguos(vencidos, hoyIso, minDias) {
        var limite = minDias == null ? 30 : minDias, porCliente = {};
        vencidos.forEach(function (v) {
            var k = claveCliente(v) || ("venta:" + texto(v.key_paquete_venta));
            var fin = texto(v.fecha_fin).slice(0, 10);
            if (!fin) return;
            var actual = porCliente[k];
            if (!actual || fin > actual.fecha_fin) porCliente[k] = Object.assign({}, v, { key_cliente: k, fecha_fin: fin, sucursal: texto(v.sucursal), cliente: texto(v.cliente) });
        });
        return Object.keys(porCliente).map(function (k) { var c = porCliente[k]; c.dias_vencido = diasEntre(c.fecha_fin, hoyIso); return c; })
            .filter(function (c) { return c.dias_vencido > limite; });
    }

    /* Dueño de cada cliente: asignación manual vigente; si no, la ejecutiva que cubre su sucursal
       (si varias la cubren, se reparte en partes iguales y siempre igual según el cliente). */
    function repartir(clientes, equipo, asignaciones) {
        var activas = equipo.filter(function (e) { return Number(e.estado == null ? 1 : e.estado) > 0; });
        var porKey = {}; activas.forEach(function (e) { porKey[e.key] = e; });
        var manual = {}; (asignaciones || []).forEach(function (a) { manual[a.key_cliente] = a; });
        var cobertura = {};
        activas.slice().sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); }).forEach(function (e) {
            (e.sucursales || []).forEach(function (s) { var k = norm(s); (cobertura[k] = cobertura[k] || []).push(e); });
        });
        return clientes.map(function (c) {
            var a = manual[c.key_cliente], due = null, origen = "sin_asignar";
            if (a && a.key_ejecutiva && porKey[a.key_ejecutiva]) { due = porKey[a.key_ejecutiva]; origen = "manual"; }
            else {
                var lista = cobertura[norm(c.sucursal)] || [];
                if (lista.length) { due = lista[hash(c.key_cliente) % lista.length]; origen = "sucursal"; }
            }
            return Object.assign({}, c, { key_ejecutiva: due ? due.key : null, ejecutiva: due ? due.nombre : "", asignacion: origen, motivo_asignacion: a && a.motivo });
        });
    }

    /* Estado del cliente en el CRM a partir de su último contacto. */
    function estadoCrm(c, ultima, hoyIso) {
        if (!ultima) return { clave: "sin_contactar", texto: "Sin contactar", tono: "muted", orden: 3 };
        var seg = texto(ultima.proximo_seguimiento).slice(0, 10);
        var r = RESULTADOS[ultima.resultado] || RESULTADOS.otro;
        var e = { clave: ultima.resultado, texto: r.texto, tono: r.tono, contactos: Number(ultima.contactos) || 1, ultimo: ultima.fecha_on, seguimiento: seg || null };
        if (seg && seg < hoyIso) { e.seguimiento_estado = "vencido"; e.orden = 0; }
        else if (seg && seg === hoyIso) { e.seguimiento_estado = "hoy"; e.orden = 1; }
        else if (ultima.resultado === "interesado" || ultima.resultado === "agendado") e.orden = 2;
        else if (ultima.resultado === "no_contesta" && e.contactos < 3 && diasEntre(ultima.fecha_on, hoyIso) >= 2) e.orden = 4;
        else if (ultima.resultado === "no_contesta") e.orden = 6;
        else e.orden = 8; /* no interesado / número errado / otro: al final */
        return e;
    }

    /* Une clientes + últimas gestiones y ordena por prioridad de atención. */
    function cartera(clientes, ultimas, hoyIso) {
        var u = {}; (ultimas || []).forEach(function (g) { u[g.key_cliente] = g; });
        return clientes.map(function (c) { return Object.assign({}, c, { crm: estadoCrm(c, u[c.key_cliente], hoyIso), ultima: u[c.key_cliente] || null }); })
            .sort(function (a, b) {
                return a.crm.orden - b.crm.orden
                    || (a.crm.seguimiento || "").localeCompare(b.crm.seguimiento || "")
                    || a.dias_vencido - b.dias_vencido; /* los que vencieron hace menos, primero: son más fáciles de recuperar */
            });
    }

    /* Totales de comisión por ejecutiva (excluye anuladas). */
    function totalesComision(comisiones) {
        var t = {};
        (comisiones || []).forEach(function (c) {
            var k = c.key_ejecutiva || "?";
            var f = t[k] || (t[k] = { key_ejecutiva: k, ejecutiva: c.ejecutiva, ventas: 0, comision: 0, anuladas: 0, monto_vendido: 0 });
            if (c.anulada) { f.anuladas++; return; }
            f.ventas++; f.comision += Number(c.comision) || 0; f.monto_vendido += Number(c.monto) || 0;
        });
        return t;
    }

    /* Rellena un guion con los datos del cliente. */
    function rellenar(plantilla, datos) {
        return texto(plantilla).replace(/\{(nombre|ejecutiva|sucursal|paquete)\}/g, function (_, k) {
            var v = texto(datos[k]);
            if (k === "nombre") v = v.split(/\s+/)[0] || v;
            return v || (k === "nombre" ? "" : "");
        }).replace(/\s+([,!?.])/g, "$1").replace(/ {2,}/g, " ").trim();
    }

    function linkWhatsApp(tel, mensaje) {
        var d = texto(tel).replace(/\D/g, "");
        if (d.length < 8) return null;
        if (typeof window !== "undefined" && window.CM_PAIS === "paraguay") { if (d.indexOf("595") !== 0) { d = d.replace(/^0+/, ""); if (d.length === 9) d = "595" + d; } }
        else if (d.length === 8) d = "591" + d;
        return "https://wa.me/" + d + "?text=" + encodeURIComponent(mensaje || "");
    }

    window.COM_logica = {
        RESULTADOS: RESULTADOS, CANALES: CANALES, norm: norm, iso: iso, diasEntre: diasEntre,
        antiguos: antiguos, repartir: repartir, estadoCrm: estadoCrm, cartera: cartera,
        totalesComision: totalesComision, rellenar: rellenar, linkWhatsApp: linkWhatsApp
    };
})();
