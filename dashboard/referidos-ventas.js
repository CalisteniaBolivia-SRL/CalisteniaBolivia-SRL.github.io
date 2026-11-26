/* =====================================================================================================
   Referidos nuevos · venta en el momento (Bolivia y Paraguay, el mismo módulo; cada país con lo suyo: py_ref_*).
   - «Para llamar»: inscripciones de los últimos 14 días que todavía no se cerraron. Llamar / WhatsApp con el mensaje
     del descuento; «Lo tomo», «No contesta», «Vendido», «No le interesa». Lo ven las ATC, la Jefa, Administración y Dirección.
   - «Pagos por confirmar»: comprobantes que mandó el cliente desde la página de inscripción. Los confirman la Jefa de ATC,
     Administración o Dirección; al confirmar queda la ficha para registrar la venta en el ERP con el descuento.
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay", MON = PY ? "Gs" : "Bs";
    /* Dentro del tablero de Jefe de ATC (?embebido=1) se muestra sin barra ni encabezado propios. */
    var EMBEBIDO = /[?&]embebido=1\b/.test(location.search) && window.top !== window.self;
    if (EMBEBIDO) document.documentElement.classList.add("embebido");
    var $ = function (id) { return document.getElementById(id); };
    function el(tag, attrs, hijos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            var v = attrs[k];
            if (k === "text") e.textContent = v; else if (k === "class") e.className = v;
            else if (k.indexOf("on") === 0 && typeof v === "function") e.addEventListener(k.slice(2), v);
            else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
        });
        (hijos || []).forEach(function (h) { if (h != null && h !== false) e.appendChild(typeof h === "string" || typeof h === "number" ? document.createTextNode(String(h)) : h); });
        return e;
    }
    function db() { return firebase.firestore(); }
    function col(n) { return db().collection((PY ? "py_" : "") + n); }
    function msg(t, tono) { var m = $("op-estado"); m.textContent = t || ""; m.className = "op-msg" + (tono ? " is-" + tono : ""); }
    function errTxt(e) { return e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso para esto en /centro_mando. Si te lo dieron hace poco, salí y volvé a entrar." : (e && e.message) || String(e); }
    function chip(t, tono) { return el("span", { class: "op-chip" + (tono ? " is-" + tono : ""), text: t }); }
    function plata(n) { return MON + " " + (PY ? Math.round(n).toLocaleString("es-PY") : (Math.round(n * 100) / 100).toLocaleString("es-BO")); }
    function hace(iso) {
        var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
        if (!(m >= 0)) return "—"; if (m < 1) return "recién"; if (m < 60) return "hace " + m + " min"; var h = Math.round(m / 60); if (h < 24) return "hace " + h + " h"; return "hace " + Math.round(h / 24) + " d";
    }
    function tel(t) {
        var d = String(t || "").replace(/\D/g, "");
        if (PY) { if (d.indexOf("595") !== 0) { d = d.replace(/^0+/, ""); if (d.length === 9) d = "595" + d; } return d.length >= 11 ? d : ""; }
        if (d.length === 8) d = "591" + d; return d.length >= 10 ? d : "";
    }
    var DESC = (window.REF_LOGICA && window.REF_LOGICA.DESC_CLIENTE) || 15;
    var SEG = { tomado: ["Lo tiene alguien", ""], no_contesta: ["No contesta", "warn"], vendido: ["Vendido", "ok"], no_interesado: ["No le interesa", ""] };

    var M = { vista: "llamar", insc: [], pagos: [], confirmados: [], puedeConfirmar: false, uid: "", nombre: "", equipo: [], periodo: "mes", nombresCod: {} };
    var ahoraISO = function () { return new Date().toISOString(); };
    function cambio(que) { return firebase.firestore.FieldValue.arrayUnion({ f: ahoraISO(), por: M.nombre || "—", que: String(que).slice(0, 160) }); }
    function inicioMes(d) { var x = new Date(d.getFullYear(), d.getMonth(), 1); return x.toISOString(); }

    function cargar() {
        msg("Cargando…");
        var hoy = new Date(), desde = inicioMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
        var ps = [col("ref_inscripcion").where("fecha_on", ">=", desde).get()];
        if (M.puedeConfirmar) { ps.push(col("ref_pago").where("estado", "==", "por_confirmar").get()); ps.push(col("ref_pago").where("estado", "==", "confirmado").get()); }
        return Promise.all(ps).then(function (a) {
            var dd = function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); };
            M.insc = dd(a[0]).sort(function (x, y) { return String(y.fecha_on).localeCompare(String(x.fecha_on)); });
            nombresReferidores();
            M.pagos = a[1] ? dd(a[1]).sort(function (x, y) { return String(x.fecha_on).localeCompare(String(y.fecha_on)); }) : [];
            M.confirmados = a[2] ? dd(a[2]).filter(function (p) { return String(p.fecha_confirmacion || "") >= desde; }).sort(function (x, y) { return String(y.fecha_confirmacion).localeCompare(String(x.fecha_confirmacion)); }) : [];
            msg(""); pintar();
        }, function (e) { msg(errTxt(e), "bad"); });
    }
    var hace14 = function () { return new Date(Date.now() - 14 * 864e5).toISOString(); };
    function abiertas() { var d = hace14(); return M.insc.filter(function (i) { return i.seguimiento !== "vendido" && i.seguimiento !== "no_interesado" && i.estado !== "rechazada" && String(i.fecha_on) >= d; }); }
    function cerradas() { return M.insc.filter(function (i) { return i.seguimiento === "vendido" || i.seguimiento === "no_interesado"; }); }
    /* Nombre del referidor de cada código (índice público de códigos). */
    function nombresReferidores() {
        var faltan = {}; M.insc.forEach(function (i) { if (i.codigo && M.nombresCod[i.codigo] === undefined) faltan[i.codigo] = 1; });
        Object.keys(faltan).slice(0, 60).forEach(function (c) {
            M.nombresCod[c] = null;
            col("ref_codigo_idx").doc(c).get().then(function (d) { M.nombresCod[c] = d.exists ? d.data().nombre || c : c; if (M.vista === "resumen") pintar(); }, function () {});
        });
    }
    function cargarEquipo() {
        return col("com_ejecutiva").get().then(function (q) { M.equipo = q.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }).filter(function (e) { return Number(e.estado == null ? 1 : e.estado) > 0; }).sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); }); }, function () { M.equipo = []; });
    }

    function tabs() {
        var t = $("rv-tabs"); t.textContent = "";
        var nuevos = abiertas().filter(function (i) { return !i.seguimiento; }).length;
        [M.puedeConfirmar ? ["resumen", "Resumen", 0] : null, ["llamar", "Para llamar", nuevos], M.puedeConfirmar ? ["pagos", "Pagos por confirmar", M.pagos.length] : null, M.puedeConfirmar ? ["hechos", "Pagos confirmados", 0] : null, M.puedeConfirmar ? ["cerrados", "Cerrados", 0] : null].filter(Boolean).forEach(function (x) {
            var b = el("button", { type: "button", role: "tab", class: M.vista === x[0] ? "is-on" : "", "aria-selected": M.vista === x[0] ? "true" : "false" }, [x[1], x[2] ? el("b", { text: String(x[2]) }) : null]);
            b.addEventListener("click", function () { M.vista = x[0]; pintar(); });
            t.appendChild(b);
        });
    }
    function pintar() {
        tabs();
        var v = $("rv-vista"); v.textContent = "";
        if (M.vista === "resumen") v.appendChild(vistaResumen());
        else if (M.vista === "cerrados") v.appendChild(vistaCerrados());
        else if (M.vista === "pagos") v.appendChild(vistaPagos());
        else if (M.vista === "hechos") v.appendChild(vistaHechos());
        else v.appendChild(vistaLlamar());
    }

    /* ---------- para llamar ---------- */
    function mensaje(i) {
        var n = String(i.nombre || "").split(" ")[0];
        return "¡Hola " + n + "! Te escribo de Calistenia Company 💪 Te anotaste con el código " + i.codigo + ", así que tenés " + DESC + " % de descuento en tu paquete. ¿Te ayudo a elegirlo y dejarlo listo hoy?";
    }
    function marcar(i, seg, nota, asignar, texto) {
        var quien = asignar || { key: M.uid, nombre: M.nombre };
        var datos = { seguimiento: seg, tomado_por: quien.key, tomado_nombre: quien.nombre };
        if (nota != null) datos.nota_seguimiento = String(nota).slice(0, 300);
        var que = texto || (asignar ? "Asignado a " + quien.nombre : (SEG[seg] ? SEG[seg][0] : seg) + (nota ? ": " + nota : ""));
        return col("ref_inscripcion").doc(i.id).update(Object.assign({ fecha_seguimiento: ahoraISO(), historial: cambio(que) }, datos)).then(function () {
            Object.assign(i, datos); i.historial = (i.historial || []).concat([{ f: ahoraISO(), por: M.nombre, que: que }]);
            msg("Listo: " + que + ".", "ok"); pintar();
        }, function (e) { msg(errTxt(e), "bad"); });
    }
    function asignador(i) {
        if (!M.puedeConfirmar || !M.equipo.length) return null;
        var sel = el("select", { class: "rv-asignar", "aria-label": "Asignar a una ATC" }, [el("option", { value: "", text: "Asignar a…" })].concat(M.equipo.map(function (e) { return el("option", { value: e.key, text: e.nombre, selected: i.tomado_por === e.key }); })));
        sel.addEventListener("change", function () { var e = M.equipo.filter(function (x) { return x.key === sel.value; })[0]; if (e) marcar(i, "tomado", null, { key: e.key, nombre: e.nombre }); });
        return sel;
    }
    function historial(i) {
        var h = (i.historial || []).slice().sort(function (a, b) { return String(b.f).localeCompare(String(a.f)); });
        if (!h.length) return null;
        return el("details", { class: "rv-hist" }, [el("summary", { text: "Cambios (" + h.length + ")" }), el("ul", {}, h.map(function (x) { return el("li", { text: fechaHora(x.f) + " · " + (x.por || "—") + " · " + x.que }); }))]);
    }
    function fechaHora(iso) { var d = new Date(iso); if (isNaN(d)) return "—"; var p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
    function vistaLlamar() {
        var l = abiertas(), wrap = el("div", { class: "rv-lista" });
        if (!l.length) { wrap.appendChild(el("p", { class: "op-vacio", text: "No hay referidos nuevos para llamar. Cuando alguien se anote con un código, aparece acá al instante (recargá la página)." })); return wrap; }
        l.forEach(function (i) {
            var t = tel(i.telefono), s = SEG[i.seguimiento];
            var pago = M.pagos.filter(function (p) { return p.inscripcion === i.id; })[0];
            wrap.appendChild(el("article", { class: "op-card rv-card" + (!i.seguimiento ? " is-rojo" : "") }, [
                el("div", { class: "op-acc" }, [el("b", { class: "rv-nombre", text: i.nombre || "Cliente" }), el("span", { class: "op-muted", text: hace(i.fecha_on) }),
                    s ? chip(s[0] + (i.tomado_nombre ? " · " + String(i.tomado_nombre).split(" ")[0] : ""), s[1]) : chip("Nuevo", "bad"), pago ? chip("Mandó comprobante", "ok") : null]),
                el("p", { class: "op-muted", text: "Código " + String(i.codigo || "—").replace(/-CAL$/, "") + " · " + (PY ? "Cédula " : "CI ") + (i.ci || "—") + " · " + (i.telefono || "sin celular") + (i.nota_seguimiento ? " · " + i.nota_seguimiento : "") }),
                el("div", { class: "op-acc" }, [
                    t ? el("a", { class: "op-btn is-fuerte", href: "tel:+" + t, onclick: function () { if (!i.seguimiento) marcar(i, "tomado"); } , text: "Llamar" }) : chip("Celular no válido", "warn"),
                    t ? el("a", { class: "op-btn", href: "https://wa.me/" + t + "?text=" + encodeURIComponent(mensaje(i)), target: "_blank", rel: "noopener", onclick: function () { if (!i.seguimiento) marcar(i, "tomado"); }, text: "WhatsApp" }) : null,
                    el("button", { type: "button", class: "op-btn", text: "No contesta", onclick: function () { marcar(i, "no_contesta"); } }),
                    el("button", { type: "button", class: "op-btn", text: "Vendido", onclick: function () { var n = prompt("¿Qué paquete compró? (para la Jefa y Administración)", ""); if (n === null) return; marcar(i, "vendido", "Compró: " + n); } }),
                    el("button", { type: "button", class: "op-link", text: "No le interesa", onclick: function () { var n = prompt("¿Por qué? (opcional)", ""); if (n === null) return; marcar(i, "no_interesado", n); } }),
                    asignador(i)
                ]),
                historial(i)
            ]));
        });
        return wrap;
    }

    /* ---------- resumen (Jefe de ATC, Administración, Dirección) ---------- */
    function enPeriodo(i) {
        var hoy = new Date(), f = String(i.fecha_on || "");
        if (M.periodo === "30") return f >= new Date(Date.now() - 30 * 864e5).toISOString();
        if (M.periodo === "ant") return f >= inicioMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)) && f < inicioMes(hoy);
        return f >= inicioMes(hoy);
    }
    function pct(a, b) { return b ? Math.round(a / b * 100) + " %" : "—"; }
    function vistaResumen() {
        var l = M.insc.filter(enPeriodo), wrap = el("div", { class: "rv-lista" });
        var vend = l.filter(function (i) { return i.seguimiento === "vendido"; }).length, cont = l.filter(function (i) { return i.seguimiento; }).length;
        var sin = l.filter(function (i) { return !i.seguimiento; }).length, noInt = l.filter(function (i) { return i.seguimiento === "no_interesado"; }).length;
        var sel = el("select", { "aria-label": "Período" }, [["mes", "Este mes"], ["30", "Últimos 30 días"], ["ant", "Mes anterior"]].map(function (o) { return el("option", { value: o[0], text: o[1], selected: M.periodo === o[0] }); }));
        sel.addEventListener("change", function () { M.periodo = sel.value; pintar(); });
        wrap.appendChild(el("div", { class: "op-acc" }, [el("label", { class: "op-campo" }, ["Período", sel]), el("span", { class: "op-muted", text: "Quienes se anotaron con un código de referido (15 % de descuento en su paquete)." })]));
        wrap.appendChild(el("div", { class: "op-kpis" }, [
            el("div", { class: "op-kpi" }, [el("span", { text: "Se anotaron" }), el("b", { text: String(l.length) })]),
            el("div", { class: "op-kpi" + (sin ? " is-warn" : " is-ok") }, [el("span", { text: "Sin contactar" }), el("b", { text: String(sin) }), el("small", { text: sin ? "Llamalos o asignalos en «Para llamar»" : "Todos contactados" })]),
            el("div", { class: "op-kpi" }, [el("span", { text: "Contactados" }), el("b", { text: String(cont) }), el("small", { text: pct(cont, l.length) + " de los anotados" })]),
            el("div", { class: "op-kpi is-ok" }, [el("span", { text: "Compraron" }), el("b", { text: String(vend) }), el("small", { text: "Conversión " + pct(vend, l.length) })]),
            el("div", { class: "op-kpi" + (M.pagos.length ? " is-warn" : "") }, [el("span", { text: "Pagos por confirmar" }), el("b", { text: String(M.pagos.length) })]),
            el("div", { class: "op-kpi" }, [el("span", { text: "No les interesó" }), el("b", { text: String(noInt) })])
        ]));
        var porCod = {}, porAtc = {};
        l.forEach(function (i) {
            var c = porCod[i.codigo || "—"] = porCod[i.codigo || "—"] || { anot: 0, vend: 0 }; c.anot++; if (i.seguimiento === "vendido") c.vend++;
            if (i.tomado_nombre) { var a = porAtc[i.tomado_nombre] = porAtc[i.tomado_nombre] || { tom: 0, vend: 0, noc: 0, noi: 0 }; a.tom++; if (i.seguimiento === "vendido") a.vend++; if (i.seguimiento === "no_contesta") a.noc++; if (i.seguimiento === "no_interesado") a.noi++; }
        });
        var tabla = function (cab, filas, vacio) { return filas.length ? el("div", { class: "op-scroll" }, [el("table", { class: "op-tabla" }, [el("thead", {}, [el("tr", {}, cab.map(function (h, k) { return el("th", { class: k ? "is-n" : "", text: h }); }))]), el("tbody", {}, filas.map(function (f) { return el("tr", {}, f.map(function (v, k) { return el("td", { class: k ? "is-n" : "", text: v }); })); }))])]) : el("p", { class: "op-vacio", text: vacio }); };
        wrap.appendChild(el("section", { class: "op-card" }, [el("h2", { text: "Por referidor" }), tabla(["Quién invitó (código)", "Anotados", "Compraron", "Conversión"],
            Object.keys(porCod).sort(function (a, b) { return porCod[b].anot - porCod[a].anot; }).map(function (k) { var c = porCod[k], n = M.nombresCod[k]; return [(n && n !== k ? n + " · " : "") + k.replace(/-CAL$/, ""), c.anot, c.vend, pct(c.vend, c.anot)]; }), "Nadie se anotó en este período.")]));
        wrap.appendChild(el("section", { class: "op-card" }, [el("h2", { text: "Por ATC" }), tabla(["ATC", "Atendidos", "Compraron", "No contestan", "No les interesó"],
            Object.keys(porAtc).sort(function (a, b) { return porAtc[b].vend - porAtc[a].vend; }).map(function (k) { var a = porAtc[k]; return [k, a.tom, a.vend, a.noc, a.noi]; }), "Todavía nadie tomó un referido en este período.")]));
        var cambios = [];
        M.insc.forEach(function (i) { (i.historial || []).forEach(function (h) { cambios.push({ f: h.f, por: h.por, que: h.que, cliente: i.nombre }); }); });
        cambios.sort(function (a, b) { return String(b.f).localeCompare(String(a.f)); });
        wrap.appendChild(el("section", { class: "op-card" }, [el("h2", { text: "Últimos cambios" }), cambios.length ? el("ul", { class: "rv-cambios" }, cambios.slice(0, 40).map(function (c) { return el("li", {}, [el("b", { text: fechaHora(c.f) }), " · " + (c.por || "—") + " · " + (c.cliente || "") + ": " + c.que]); })) : el("p", { class: "op-vacio", text: "Todavía no hay cambios registrados." })]));
        return wrap;
    }
    /* ---------- cerrados: vendidos y no interesados, con «Reabrir» ---------- */
    function vistaCerrados() {
        var l = cerradas(), wrap = el("div", { class: "rv-lista" });
        if (!l.length) { wrap.appendChild(el("p", { class: "op-vacio", text: "No hay referidos cerrados en los últimos dos meses." })); return wrap; }
        l.forEach(function (i) {
            var s2 = SEG[i.seguimiento];
            wrap.appendChild(el("article", { class: "op-card rv-card" }, [
                el("div", { class: "op-acc" }, [el("b", { class: "rv-nombre", text: i.nombre || "Cliente" }), chip(s2 ? s2[0] : i.seguimiento, s2 ? s2[1] : ""), el("span", { class: "op-muted", text: (i.tomado_nombre ? "por " + i.tomado_nombre + " · " : "") + hace(i.fecha_seguimiento || i.fecha_on) })]),
                el("p", { class: "op-muted", text: "Código " + String(i.codigo || "—").replace(/-CAL$/, "") + " · " + (i.telefono || "") + (i.nota_seguimiento ? " · " + i.nota_seguimiento : "") }),
                el("div", { class: "op-acc" }, [el("button", { type: "button", class: "op-btn", text: "Reabrir", onclick: function () { var n = prompt("¿Por qué se reabre? (queda en los cambios)", ""); if (n === null) return; marcar(i, "tomado", n || null, null, "Reabierto" + (n ? ": " + n : "")); } }), asignador(i)]),
                historial(i)
            ]));
        });
        return wrap;
    }

    /* ---------- pagos por confirmar ---------- */
    function fichaERP(p) {
        return "Venta para registrar en el ERP:\nCliente: " + p.nombre + " (" + (PY ? "Cédula " : "CI ") + p.ci + ", cel. " + p.telefono + ")\nPaquete: " + p.paquete +
            "\nPrecio de lista: " + plata(p.precio_lista) + "\nDescuento por referido: " + p.desc + " %\nCobrado por transferencia: " + plata(p.precio_final) + "\nCódigo de referido: " + p.codigo;
    }
    function resolver(p, estado) {
        var nota = estado === "rechazado" ? prompt("¿Por qué se rechaza? (por ejemplo: no llegó la transferencia). El cliente no lo ve.", "") : "";
        if (nota === null) return;
        col("ref_pago").doc(p.id).update({ estado: estado, confirmado_por: M.uid, confirmado_nombre: M.nombre, fecha_confirmacion: new Date().toISOString(), nota: String(nota || "").slice(0, 500) }).then(function () {
            var i = M.insc.filter(function (x) { return x.id === p.inscripcion; })[0];
            var sigue = i ? col("ref_inscripcion").doc(i.id).update(estado === "confirmado"
                ? { seguimiento: "vendido", tomado_por: M.uid, tomado_nombre: M.nombre, fecha_seguimiento: ahoraISO(), nota_seguimiento: "Pagó por transferencia: " + p.paquete, historial: cambio("Pago confirmado: " + p.paquete + " " + plata(p.precio_final)) }
                : { fecha_seguimiento: ahoraISO(), historial: cambio("Pago rechazado" + (nota ? ": " + nota : "")) }).then(function () { if (estado === "confirmado") i.seguimiento = "vendido"; }) : Promise.resolve();
            return sigue.then(function () {
                p.estado = estado; p.fecha_confirmacion = new Date().toISOString(); p.confirmado_nombre = M.nombre;
                M.pagos = M.pagos.filter(function (x) { return x.id !== p.id; });
                if (estado === "confirmado") { M.confirmados.unshift(p); M.vista = "hechos"; msg("Pago confirmado. Registrá la venta en el ERP y avisale al cliente por WhatsApp.", "ok"); }
                else msg("Pago rechazado.", "ok");
                pintar();
            });
        }).catch(function (e) { msg(errTxt(e), "bad"); });
    }
    function vistaPagos() {
        var wrap = el("div", { class: "rv-lista" });
        if (!M.pagos.length) { wrap.appendChild(el("p", { class: "op-vacio", text: "No hay comprobantes por confirmar." })); return wrap; }
        M.pagos.forEach(function (p) {
            var img = el("img", { class: "rv-comp", src: p.comprobante, alt: "Comprobante de " + p.nombre, onclick: function () { var w = window.open(""); if (w) w.document.write('<img src="' + p.comprobante + '" style="max-width:100%">'); } });
            wrap.appendChild(el("article", { class: "op-card rv-pago" }, [
                el("div", { class: "rv-pago-txt" }, [
                    el("div", { class: "op-acc" }, [el("b", { class: "rv-nombre", text: p.nombre }), el("span", { class: "op-muted", text: hace(p.fecha_on) })]),
                    el("p", { text: p.paquete }),
                    el("p", { class: "rv-monto" }, [el("s", { text: plata(p.precio_lista) }), " ", el("b", { text: plata(p.precio_final) }), el("span", { class: "op-muted", text: " (" + p.desc + " % de descuento)" })]),
                    el("p", { class: "op-muted", text: (PY ? "Cédula " : "CI ") + p.ci + " · " + p.telefono + " · código " + p.codigo }),
                    el("p", { class: "op-muted", text: "Revisá que la transferencia haya llegado a la cuenta por ese monto antes de confirmar." }),
                    el("div", { class: "op-acc" }, [el("button", { type: "button", class: "op-btn is-fuerte", text: "Confirmar pago", onclick: function () { resolver(p, "confirmado"); } }),
                        el("button", { type: "button", class: "op-btn", text: "Rechazar", onclick: function () { resolver(p, "rechazado"); } })])
                ]), img
            ]));
        });
        return wrap;
    }
    function vistaHechos() {
        var wrap = el("div", { class: "rv-lista" });
        if (!M.confirmados.length) { wrap.appendChild(el("p", { class: "op-vacio", text: "Todavía no hay pagos confirmados en los últimos 14 días." })); return wrap; }
        M.confirmados.forEach(function (p) {
            var t = tel(p.telefono);
            var aviso = "¡Hola " + String(p.nombre || "").split(" ")[0] + "! Confirmamos tu pago de " + plata(p.precio_final) + " por " + p.paquete + " ✅ Ya podés venir a entrenar a Calistenia Company: presentá tu carnet en recepción. ¡Te esperamos! 💪";
            var copiar = el("button", { type: "button", class: "op-btn", text: "Copiar datos para el ERP" });
            copiar.addEventListener("click", function () { var tx = fichaERP(p); (navigator.clipboard ? navigator.clipboard.writeText(tx) : Promise.reject()).then(function () { copiar.textContent = "Copiado"; }, function () { prompt("Copiá los datos:", tx); }); });
            wrap.appendChild(el("article", { class: "op-card" }, [
                el("div", { class: "op-acc" }, [el("b", { class: "rv-nombre", text: p.nombre }), chip("Confirmado", "ok"), el("span", { class: "op-muted", text: "por " + (p.confirmado_nombre || "—") + " · " + hace(p.fecha_confirmacion) })]),
                el("pre", { class: "rv-ficha", text: fichaERP(p) }),
                el("div", { class: "op-acc" }, [copiar, t ? el("a", { class: "op-btn is-fuerte", href: "https://wa.me/" + t + "?text=" + encodeURIComponent(aviso), target: "_blank", rel: "noopener", text: "Avisarle por WhatsApp" }) : null])
            ]));
        });
        return wrap;
    }

    /* ---------- arranque ---------- */
    $("op-eyebrow").textContent = "Calistenia Company · " + (PY ? "Paraguay" : "Bolivia") + " · Referidos";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (!window.CMFB || !CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP para usar este módulo.", "bad"); return; }
        var r = function (x) { return CMFB.tieneRolPais(x); };
        if (!["atencion", "atc", "jefe_atc", "administracion", "direccion"].some(r)) { msg("Este módulo es de Atención al Cliente, Administración y Dirección" + (PY ? " de Paraguay" : "") + ".", "bad"); return; }
        M.puedeConfirmar = r("jefe_atc") || r("administracion") || r("direccion");
        if (M.puedeConfirmar) { M.vista = "resumen"; cargarEquipo().then(function () { if (M.vista === "llamar") pintar(); }); }
        M.uid = CMFB.usuarioKey(); M.nombre = (window.CM_USUARIO && CM_USUARIO.nombre) || CMFB.nombre() || "";
        cargar();
        setInterval(function () { if (!document.hidden) cargar(); }, 120000);
    });
})();
