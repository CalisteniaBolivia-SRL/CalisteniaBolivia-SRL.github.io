/* Panel de ventas del Jefe de ATC: cómo va el día y la semana (de sábado a viernes) de todo el equipo de
   Atención al Cliente. Contactos de hoy, ventas reportadas, comisión estimada, comisiones confirmadas por pagar,
   avance de cada chica y resultados de la semana.
   Se monta desde comercial.js: window.ATC_panel.montar(contenedor, ctx)
   ctx = { equipo, asignaciones, gestiones (desde el sábado), comisiones (confirmadas, últimas semanas), pagos,
           llamar(tool, args), avisar(texto, tono), recargar(), verLista(keyEjecutiva), irAPlan() } */
(function () {
    "use strict";
    function el(tag, attrs, hijos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            var v = attrs[k];
            if (k === "text") e.textContent = v;
            else if (k === "class") e.className = v;
            else if (k.indexOf("on") === 0 && typeof v === "function") e.addEventListener(k.slice(2), v);
            else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
        });
        (hijos || []).forEach(function (h) { if (h != null && h !== false) e.appendChild(typeof h === "string" || typeof h === "number" ? document.createTextNode(String(h)) : h); });
        return e;
    }
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    var hoy = function () { return iso(new Date()); };
    var bs = function (n) { return "Bs " + Math.round(Number(n) || 0).toLocaleString("es-BO"); };
    var COMISION = 5;
    /* La semana de comisiones va de sábado a viernes. */
    function sabadoDe(fechaIso) { var p = String(fechaIso).slice(0, 10).split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return iso(d); }
    function mas(fechaIso, n) { var p = fechaIso.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); }
    function diaCorto(s) { var p = String(s).slice(0, 10).split("-"); if (p.length < 3) return "—"; var d = new Date(+p[0], +p[1] - 1, +p[2]); return d.toLocaleDateString("es-BO", { weekday: "short" }).replace(".", "") + " " + p[2] + "/" + p[1]; }
    function diaLargo(s) { var p = String(s).slice(0, 10).split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]); return d.toLocaleDateString("es-BO", { weekday: "long", day: "numeric" }); }
    function fechaHoy() { var t = new Date().toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); }
    var activa = function (x) { return Number(x.estado == null ? 1 : x.estado) > 0; };
    var turno = function (n) { return Number(n) === 2 ? "tarde" : "mañana"; };

    var RESULTADOS = [
        ["agendado", "Compró o va a pagar"], ["interesado", "Lo va a pensar"], ["no_contesta", "Sin respuesta, le escribí"],
        ["no_interesado", "No le interesa"], ["ya_activo", "Ya estaba activo antes de contactarlo"], ["numero_errado", "No contactar (lo pidió o número equivocado)"]
    ];

    function calcular(ctx) {
        var h = hoy(), sab = sabadoDe(h);
        var eq = (ctx.equipo || []).filter(activa), nom = {}; eq.forEach(function (e) { nom[e.key] = e.nombre; });
        var gest = (ctx.gestiones || []).filter(function (g) { return String(g.fecha_on).slice(0, 10) >= sab; });
        var gHoy = gest.filter(function (g) { return String(g.fecha_on).slice(0, 10) === h; });
        /* Listas activas: una por chica, sucursal y turno (lista 1 = mañana, 2 = tarde). */
        var listas = {};
        (ctx.asignaciones || []).forEach(function (a) {
            if (!a.lote || !a.key_ejecutiva || !activa(a)) return;
            var k = a.key_ejecutiva + "|" + (a.sucursal || "") + "|" + (a.lista_n || 1);
            var l = listas[k] || (listas[k] = { key_ejecutiva: a.key_ejecutiva, sucursal: a.sucursal || "", lista_n: a.lista_n || 1, clientes: {}, n: 0 });
            l.clientes[a.key_cliente] = 1; l.n++;
        });
        var filas = Object.keys(listas).map(function (k) {
            var l = listas[k];
            var deHoy = {}; gHoy.forEach(function (g) { if (g.key_ejecutiva === l.key_ejecutiva && l.clientes[g.key_cliente]) deHoy[g.key_cliente] = 1; });
            var semana = gest.filter(function (g) { return g.key_ejecutiva === l.key_ejecutiva && g.resultado === "agendado"; }).length;
            var ultimo = (ctx.ultimoContacto || {})[l.key_ejecutiva] || null;
            return { key_ejecutiva: l.key_ejecutiva, nombre: nom[l.key_ejecutiva] || "—", sucursal: l.sucursal, turno: turno(l.lista_n), meta: l.n, hoy: Object.keys(deHoy).length, ventas: semana, ultimo: ultimo };
        });
        /* Chicas del equipo sin lista asignada */
        eq.forEach(function (e) { if (!filas.some(function (f) { return f.key_ejecutiva === e.key; })) filas.push({ key_ejecutiva: e.key, nombre: e.nombre, sucursal: (e.sucursales || []).join(", "), turno: "", meta: 0, hoy: 0, ventas: gest.filter(function (g) { return g.key_ejecutiva === e.key && g.resultado === "agendado"; }).length, sinLista: true, ultimo: (ctx.ultimoContacto || {})[e.key] || null }); });
        filas.sort(function (a, b) { return String(a.sucursal).localeCompare(String(b.sucursal)) || (a.turno === "mañana" ? 0 : 1) - (b.turno === "mañana" ? 0 : 1) || String(a.nombre).localeCompare(String(b.nombre)); });
        var totalHoy = filas.reduce(function (s, f) { return s + f.hoy; }, 0), totalMeta = filas.reduce(function (s, f) { return s + f.meta; }, 0);
        var ventasHoy = gHoy.filter(function (g) { return g.resultado === "agendado"; }).length;
        var ventasSemana = gest.filter(function (g) { return g.resultado === "agendado"; }).length;
        var conteo = {}; gest.forEach(function (g) { conteo[g.resultado] = (conteo[g.resultado] || 0) + 1; });
        /* Confirmadas por el registro de ventas */
        var conf = (ctx.comisiones || []).filter(function (c) { return !c.anulada; });
        var confSemana = conf.filter(function (c) { return String(c.fecha_venta).slice(0, 10) >= sab; });
        var despues = confSemana.filter(function (c) { return c.resultado && c.resultado !== "agendado"; }).length;
        /* Por pagar: semanas ya cerradas (antes de este sábado) sin pago registrado */
        var pagado = {}; (ctx.pagos || []).forEach(function (p) { pagado[p.key_ejecutiva + "|" + p.semana] = p; });
        var porPagar = {};
        conf.filter(function (c) { return String(c.fecha_venta).slice(0, 10) < sab; }).forEach(function (c) {
            var s = sabadoDe(c.fecha_venta), k = c.key_ejecutiva + "|" + s;
            if (pagado[k]) return;
            var x = porPagar[k] || (porPagar[k] = { key_ejecutiva: c.key_ejecutiva, nombre: nom[c.key_ejecutiva] || c.ejecutiva || "—", semana: s, ventas: 0, monto: 0 });
            x.ventas++; x.monto += Number(c.comision) || COMISION;
        });
        return { h: h, sab: sab, filas: filas, listas: Object.keys(listas).length, totalHoy: totalHoy, totalMeta: totalMeta, ventasHoy: ventasHoy, ventasSemana: ventasSemana,
            contactosSemana: gest.length, conteo: conteo, despues: despues, confSemana: confSemana.length,
            porPagar: Object.keys(porPagar).map(function (k) { return porPagar[k]; }).sort(function (a, b) { return a.semana.localeCompare(b.semana) || a.nombre.localeCompare(b.nombre); }) };
    }

    function montar(cont, ctx) {
        cont.textContent = "";
        var d = calcular(ctx);
        var pct = d.totalMeta ? Math.min(100, Math.round(d.totalHoy / d.totalMeta * 100)) : 0;
        var p = el("div", { class: "pj" });
        p.appendChild(el("div", { class: "pj-cab" }, [el("h2", { class: "pj-titulo", text: "Panel de ventas" }), el("p", { class: "pj-sub", text: fechaHoy() + ". Se actualiza solo." })]));

        /* Lo grande: contactos de hoy */
        p.appendChild(el("section", { class: "pj-card pj-grande" }, [
            el("p", { class: "pj-num" }, [el("b", { text: String(d.totalHoy) }), " de " + d.totalMeta.toLocaleString("es-BO")]),
            el("p", { class: "pj-lbl", text: "contactos hechos hoy en las " + d.listas + (d.listas === 1 ? " lista" : " listas") + " de sucursal" }),
            el("div", { class: "pj-barra" }, [el("i", { style: "width:" + pct + "%" })])
        ]));
        p.appendChild(el("div", { class: "pj-dos" }, [
            el("section", { class: "pj-card" }, [el("p", { class: "pj-num", text: String(d.ventasHoy) }), el("p", { class: "pj-lbl", text: d.ventasHoy === 1 ? "venta reportada hoy" : "ventas reportadas hoy" })]),
            el("section", { class: "pj-card" }, [el("p", { class: "pj-num", text: bs(d.ventasSemana * COMISION) }), el("p", { class: "pj-lbl", text: d.ventasSemana + (d.ventasSemana === 1 ? " venta" : " ventas") + " en la semana, comisión estimada" })])
        ]));

        /* Chicas sin lista o sin actividad: lo urgente */
        var sinLista = d.filas.filter(function (f) { return f.sinLista; });
        if (sinLista.length) p.appendChild(el("div", { class: "pj-alerta", role: "alert" }, [el("b", { text: sinLista.length + (sinLista.length === 1 ? " chica sin lista: " : " chicas sin lista: ") }),
            sinLista.map(function (f) { return String(f.nombre).split(" ")[0]; }).join(", ") + ". ",
            ctx.irAPlan ? el("button", { type: "button", class: "pj-btn", text: "Asignar listas", onclick: ctx.irAPlan }) : null]));

        /* Comisiones por pagar */
        var cp = el("section", { class: "pj-sec" }, [el("h3", { class: "pj-h3", text: "Comisiones por pagar" })]);
        if (!d.porPagar.length) cp.appendChild(el("p", { class: "pj-muted", text: "No hay comisiones confirmadas pendientes de pago." }));
        else {
            var total = d.porPagar.reduce(function (s, x) { return s + x.monto; }, 0);
            cp.appendChild(el("p", { class: "pj-muted", text: "Confirmadas con el registro de ventas, de semanas ya cerradas. Total: " + bs(total) + "." }));
            cp.appendChild(el("div", { class: "pj-tabla" }, d.porPagar.map(function (x) {
                var b = el("button", { type: "button", class: "pj-btn", text: "Marcar pagado" });
                b.onclick = function () {
                    b.disabled = true;
                    ctx.llamar("comercial_pago_registrar", { key_ejecutiva: x.key_ejecutiva, semana: x.semana, monto: x.monto, ventas: x.ventas })
                        .then(function () { ctx.avisar("Pago registrado: " + x.nombre + " · " + bs(x.monto) + "."); ctx.recargar(); }, function (e) { b.disabled = false; ctx.avisar((e && e.message) || "No se pudo registrar el pago.", "bad"); });
                };
                return el("div", { class: "pj-fila" }, [el("div", { class: "pj-quien" }, [el("b", { text: x.nombre }), el("span", { text: "Semana del " + diaCorto(x.semana) + " al " + diaCorto(mas(x.semana, 6)) })]),
                    el("span", { class: "pj-n", text: x.ventas + (x.ventas === 1 ? " venta" : " ventas") }), el("b", { class: "pj-n", text: bs(x.monto) }), b]);
            })));
        }
        p.appendChild(cp);

        /* Por chica */
        var sec = el("section", { class: "pj-sec" }, [el("h3", { class: "pj-h3", text: "Por chica" }),
            el("p", { class: "pj-muted", text: "Hoy: contactos del día. Ventas y Bs: semana del " + diaLargo(d.sab) + " al " + diaLargo(mas(d.sab, 6)) + ". Son las ventas que marcaron ellas; se confirman con el registro de ventas. La venta queda para quien contactó al cliente." })]);
        var hora = new Date().getHours();
        var tabla = el("div", { class: "pj-tabla pj-chicas" }, [el("div", { class: "pj-fila pj-encab" }, [el("span", { text: "Chica" }), el("span", { class: "pj-n", text: "Hoy" }), el("span", { class: "pj-n", text: "Ventas" }), el("span", { class: "pj-n", text: "Bs" })])]);
        d.filas.forEach(function (f) {
            var sinAct = !f.sinLista && f.hoy === 0 && hora >= 10;
            var detalle = [f.sucursal, f.turno].filter(Boolean).join(", ") + (f.hoy === 0 && f.ultimo ? ". Último contacto: " + diaCorto(f.ultimo) : "");
            var p2 = f.meta ? Math.min(100, Math.round(f.hoy / f.meta * 100)) : 0;
            tabla.appendChild(el("button", { type: "button", class: "pj-fila pj-chica", title: "Ver su lista", onclick: function () { if (ctx.verLista) ctx.verLista(f.key_ejecutiva); } }, [
                el("span", { class: "pj-quien" }, [el("b", { text: f.nombre }), el("span", { text: detalle || "—" }),
                    f.sinLista ? el("span", { class: "pj-rojo", text: "Sin lista asignada" }) : sinAct ? el("span", { class: "pj-rojo", text: "Sin actividad hoy" }) : null]),
                el("span", { class: "pj-n pj-hoy" }, [el("span", { text: f.hoy + "/" + (f.meta || 0) }), el("span", { class: "pj-mini" }, [el("i", { style: "width:" + p2 + "%" })])]),
                el("span", { class: "pj-n", text: String(f.ventas) }), el("span", { class: "pj-n", text: String(f.ventas * COMISION) })
            ]));
        });
        sec.appendChild(tabla);
        p.appendChild(sec);

        /* Resultados de la semana */
        var tot = d.contactosSemana;
        var rs = el("section", { class: "pj-sec" }, [el("h3", { class: "pj-h3", text: "Resultados de la semana" }),
            el("p", { class: "pj-muted", text: tot.toLocaleString("es-BO") + " contactos desde el " + diaLargo(d.sab) + "." + (d.despues ? " Además, " + d.despues + (d.despues === 1 ? " venta llegó" : " ventas llegaron") + " porque el cliente respondió después del contacto." : "") })]);
        rs.appendChild(el("div", { class: "pj-tabla pj-res" }, RESULTADOS.map(function (r, i) {
            var n = d.conteo[r[0]] || 0, pc = tot ? Math.round(n / tot * 100) : 0;
            return el("div", { class: "pj-fila" + (i === 0 ? " is-compra" : "") }, [el("span", { text: r[1] }),
                el("b", { class: "pj-n", text: n.toLocaleString("es-BO") + " (" + pc + "%)" + (i === 0 && d.despues ? " + " + d.despues + " que respondieron después" : "") })]);
        })));
        p.appendChild(rs);
        cont.appendChild(p);
    }

    window.ATC_panel = { montar: montar, _calcular: calcular, sabadoDe: sabadoDe };
})();
