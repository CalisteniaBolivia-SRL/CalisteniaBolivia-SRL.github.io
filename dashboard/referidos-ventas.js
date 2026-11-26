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

    var M = { vista: "llamar", insc: [], pagos: [], confirmados: [], puedeConfirmar: false, uid: "", nombre: "" };

    function cargar() {
        msg("Cargando…");
        var desde = new Date(Date.now() - 14 * 864e5).toISOString();
        var ps = [col("ref_inscripcion").where("fecha_on", ">=", desde).get()];
        if (M.puedeConfirmar) { ps.push(col("ref_pago").where("estado", "==", "por_confirmar").get()); ps.push(col("ref_pago").where("estado", "==", "confirmado").get()); }
        return Promise.all(ps).then(function (a) {
            var dd = function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); };
            M.insc = dd(a[0]).sort(function (x, y) { return String(y.fecha_on).localeCompare(String(x.fecha_on)); });
            M.pagos = a[1] ? dd(a[1]).sort(function (x, y) { return String(x.fecha_on).localeCompare(String(y.fecha_on)); }) : [];
            M.confirmados = a[2] ? dd(a[2]).filter(function (p) { return String(p.fecha_confirmacion || "") >= desde; }).sort(function (x, y) { return String(y.fecha_confirmacion).localeCompare(String(x.fecha_confirmacion)); }) : [];
            msg(""); pintar();
        }, function (e) { msg(errTxt(e), "bad"); });
    }
    function abiertas() { return M.insc.filter(function (i) { return i.seguimiento !== "vendido" && i.seguimiento !== "no_interesado" && i.estado !== "rechazada"; }); }

    function tabs() {
        var t = $("rv-tabs"); t.textContent = "";
        var nuevos = abiertas().filter(function (i) { return !i.seguimiento; }).length;
        [["llamar", "Para llamar", nuevos], M.puedeConfirmar ? ["pagos", "Pagos por confirmar", M.pagos.length] : null, M.puedeConfirmar ? ["hechos", "Confirmados", 0] : null].filter(Boolean).forEach(function (x) {
            var b = el("button", { type: "button", role: "tab", class: M.vista === x[0] ? "is-on" : "", "aria-selected": M.vista === x[0] ? "true" : "false" }, [x[1], x[2] ? el("b", { text: String(x[2]) }) : null]);
            b.addEventListener("click", function () { M.vista = x[0]; pintar(); });
            t.appendChild(b);
        });
    }
    function pintar() {
        tabs();
        var v = $("rv-vista"); v.textContent = "";
        if (M.vista === "pagos") v.appendChild(vistaPagos());
        else if (M.vista === "hechos") v.appendChild(vistaHechos());
        else v.appendChild(vistaLlamar());
    }

    /* ---------- para llamar ---------- */
    function mensaje(i) {
        var n = String(i.nombre || "").split(" ")[0];
        return "¡Hola " + n + "! Te escribo de Calistenia Company 💪 Te anotaste con el código " + i.codigo + ", así que tenés " + DESC + " % de descuento en tu primer paquete. ¿Te ayudo a elegirlo y dejarlo listo hoy?";
    }
    function marcar(i, seg, nota) {
        var cambio = { seguimiento: seg, tomado_por: M.uid, tomado_nombre: M.nombre };
        if (nota != null) cambio.nota_seguimiento = String(nota).slice(0, 300);
        return col("ref_inscripcion").doc(i.id).update(Object.assign({ fecha_seguimiento: new Date().toISOString() }, cambio)).then(function () {
            Object.assign(i, cambio); msg("Listo: " + SEG[seg][0] + ".", "ok"); pintar();
        }, function (e) { msg(errTxt(e), "bad"); });
    }
    function vistaLlamar() {
        var l = abiertas(), wrap = el("div", { class: "rv-lista" });
        if (!l.length) { wrap.appendChild(el("p", { class: "op-vacio", text: "No hay referidos nuevos para llamar. Cuando alguien se anote con un código, aparece acá al instante (recargá la página)." })); return wrap; }
        l.forEach(function (i) {
            var t = tel(i.telefono), s = SEG[i.seguimiento];
            var pago = M.pagos.filter(function (p) { return p.inscripcion === i.id; })[0];
            wrap.appendChild(el("article", { class: "op-card rv-card" + (!i.seguimiento ? " is-rojo" : "") }, [
                el("div", { class: "op-acc" }, [el("b", { class: "rv-nombre", text: i.nombre || "Cliente" }), el("span", { class: "op-muted", text: hace(i.fecha_on) }),
                    s ? chip(s[0] + (i.tomado_nombre ? " · " + String(i.tomado_nombre).split(" ")[0] : ""), s[1]) : chip("Nuevo", "bad"), pago ? chip("Mandó comprobante", "ok") : null]),
                el("p", { class: "op-muted", text: "Código " + (i.codigo || "—") + " · " + (PY ? "Cédula " : "CI ") + (i.ci || "—") + " · " + (i.telefono || "sin celular") + (i.nota_seguimiento ? " · " + i.nota_seguimiento : "") }),
                el("div", { class: "op-acc" }, [
                    t ? el("a", { class: "op-btn is-fuerte", href: "tel:+" + t, onclick: function () { if (!i.seguimiento) marcar(i, "tomado"); } , text: "Llamar" }) : chip("Celular no válido", "warn"),
                    t ? el("a", { class: "op-btn", href: "https://wa.me/" + t + "?text=" + encodeURIComponent(mensaje(i)), target: "_blank", rel: "noopener", onclick: function () { if (!i.seguimiento) marcar(i, "tomado"); }, text: "WhatsApp" }) : null,
                    el("button", { type: "button", class: "op-btn", text: "No contesta", onclick: function () { marcar(i, "no_contesta"); } }),
                    el("button", { type: "button", class: "op-btn", text: "Vendido", onclick: function () { var n = prompt("¿Qué paquete compró? (para la Jefa y Administración)", ""); if (n === null) return; marcar(i, "vendido", "Compró: " + n); } }),
                    el("button", { type: "button", class: "op-link", text: "No le interesa", onclick: function () { var n = prompt("¿Por qué? (opcional)", ""); if (n === null) return; marcar(i, "no_interesado", n); } })
                ])
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
            var sigue = estado === "confirmado" && i ? col("ref_inscripcion").doc(i.id).update({ seguimiento: "vendido", tomado_por: M.uid, tomado_nombre: M.nombre, fecha_seguimiento: new Date().toISOString(), nota_seguimiento: "Pagó por transferencia: " + p.paquete }).then(function () { i.seguimiento = "vendido"; }) : Promise.resolve();
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
        M.uid = CMFB.usuarioKey(); M.nombre = (window.CM_USUARIO && CM_USUARIO.nombre) || CMFB.nombre() || "";
        cargar();
        setInterval(function () { if (!document.hidden) cargar(); }, 120000);
    });
})();
