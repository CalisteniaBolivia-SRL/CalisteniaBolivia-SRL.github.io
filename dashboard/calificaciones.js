/* =====================================================================================================
   Calificación de entrenadores · Supervisores (Bolivia y Paraguay, el mismo módulo; cada país con sus datos).
   - Supervisión, en cada visita, elige sucursal y entrenador y lo califica del 1 al 5 en 8 aspectos, con
     fortalezas, qué mejorar y lo que acordaron (devolución al entrenador).
   - Ranking por entrenador (promedio general y por aspecto, tendencia), por sucursal, entrenadores sin evaluar
     y el detalle de cada visita. Dirección, RRHH y Administración consultan.
   Firestore: sup_calificacion (Paraguay: py_sup_calificacion).
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay";
    var PAIS = PY ? "paraguay" : "bolivia";
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
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    var hoy = function () { return iso(new Date()); };
    function hora() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
    function sumar(f, n) { var d = new Date(f + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); }
    function corta(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : "—"; }
    function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
    function bonito(s) { return String(s || "").trim().replace(/\s+/g, " ").split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(" "); }
    function db() { return firebase.firestore(); }
    function col() { return db().collection((PY ? "py_" : "") + "sup_calificacion"); }
    function msg(t, tono) { var m = $("op-estado"); m.textContent = t || ""; m.className = "op-msg" + (tono ? " is-" + tono : ""); }
    function errTxt(e) { return e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso para esto en /centro_mando (Supervisión, Dirección, RRHH o Administración). Si te lo dieron hace poco, salí y volvé a entrar." : (e && e.message) || String(e); }
    function chip(t, tono) { return el("span", { class: "op-chip" + (tono ? " is-" + tono : ""), text: t }); }
    function uno(n) { return n == null || isNaN(n) ? "—" : (Math.round(n * 10) / 10).toFixed(1); }
    function tono(n) { return n == null ? "" : n >= 4 ? "ok" : n >= 3 ? "warn" : "bad"; }
    function nota(n) { return el("b", { class: "cf-nota is-" + tono(n), text: uno(n) }); }
    function tabla(cols, filas, vacio, alClic) {
        if (!filas.length) return el("p", { class: "op-vacio", text: vacio });
        return el("div", { class: "op-scroll" }, [el("table", { class: "op-tabla" }, [
            el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { class: c.n ? "is-n" : "", text: c.t, title: c.title || null }); }))]),
            el("tbody", {}, filas.map(function (f) { return el("tr", { class: alClic ? "is-clic" : null, onclick: alClic ? function () { alClic(f); } : null }, cols.map(function (c) { var v = c.v(f); return el("td", { class: c.n ? "is-n" : "" }, [v == null || v === "" ? "—" : v]); })); }))
        ])]);
    }

    /* ---------- qué se califica ---------- */
    var ASPECTOS = [
        { id: "estructura", corto: "Clase", nombre: "Estructura de la clase", ayuda: "Calentamiento, parte principal y vuelta a la calma; respeta los tiempos y empieza y termina a la hora." },
        { id: "metodologia", corto: "Entrenamiento", nombre: "Tipo de entrenamiento", ayuda: "Ejercicios adecuados al nivel de cada alumno, progresiones y variantes para principiantes y avanzados." },
        { id: "tecnica", corto: "Técnica", nombre: "Calidad técnica", ayuda: "Explica bien, demuestra y corrige la postura y la ejecución de cada alumno." },
        { id: "atencion", corto: "Atención", nombre: "Atención al cliente", ayuda: "Saluda por el nombre, recibe a los nuevos, responde dudas y trata a todos con amabilidad." },
        { id: "seguridad", corto: "Seguridad", nombre: "Seguridad", ayuda: "Supervisa todo el tiempo, cuida a quien tiene lesiones y controla el uso correcto de los equipos." },
        { id: "energia", corto: "Energía", nombre: "Energía y motivación", ayuda: "Contagia ganas, buen ambiente, música adecuada; los alumnos terminan motivados." },
        { id: "presentacion", corto: "Presentación", nombre: "Puntualidad y presentación", ayuda: "Llegó a tiempo, uniforme e imagen personal, no usa el celular durante la clase." },
        { id: "orden", corto: "Orden", nombre: "Orden de la sala", ayuda: "Equipos ordenados y limpios al empezar y al terminar; la sala queda lista para la siguiente clase." }
    ];
    var ESCALA = { 1: "Muy mal", 2: "Mal", 3: "Regular", 4: "Bien", 5: "Excelente" };
    var TIPOS = ["Calistenia general", "Principiantes", "Intermedio / avanzado", "Funcional", "Movilidad y flexibilidad", "Personalizado", "Otro"];

    /* ---------- estado ---------- */
    var C = { vista: null, puede: false, uid: "", nombre: "", lista: [], sucursales: [], profes: [], profesERP: [], periodo: "mes", suc: "", detalle: null, entrenador: null, editar: null, borrador: null, verVis: 20 };
    function rango() {
        var h = hoy();
        if (C.periodo === "mes") return { desde: h.slice(0, 8) + "01", hasta: h };
        if (C.periodo === "mesAnt") { var d = new Date(h.slice(0, 8) + "01T00:00:00"); d.setDate(0); var f = iso(d); return { desde: f.slice(0, 8) + "01", hasta: f }; }
        return { desde: sumar(h, -Number(C.periodo)), hasta: h };
    }

    /* ---------- datos ---------- */
    function cargar() {
        return col().where("fecha", ">=", sumar(hoy(), -400)).get().then(function (q) {
            C.lista = q.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }).filter(function (x) { return Number(x.estado == null ? 1 : x.estado) > 0; })
                .sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)) || String(b.fecha_on).localeCompare(String(a.fecha_on)); });
            armarNombres(); if ($("op-estado").textContent === "Cargando…") msg(""); pintar();
        }).catch(function (e) { msg("No se pudo cargar: " + errTxt(e), "bad"); pintar(); });
    }
    function profesoresERP() {
        if (PY || !window.CM || !CM.conSesion || !CM.conSesion()) return Promise.resolve([]);
        var h = new Date(), d = new Date(h); d.setDate(d.getDate() - 60);
        return CM.llamar("asistencia_por_instructor", { desde: iso(d), hasta: iso(h) }).then(function (r) {
            if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { r = {}; } }
            return ((r && (r.entrenadores || (r.result && r.result.entrenadores))) || []).map(function (x) { return bonito(x.entrenador); }).filter(Boolean);
        }).catch(function () { return []; });
    }
    function deReemplazos() {
        return db().collection("sup_reemplazo").orderBy("fecha", "desc").limit(300).get().then(function (q) {
            var n = []; q.docs.forEach(function (d) { var x = d.data(); if ((x.pais || "bolivia") === PAIS) n.push(x.titular, x.reemplazo); }); return n;
        }).catch(function () { return []; });
    }
    function armarNombres(extra) {
        if (extra) C.extra = extra;
        var v = {};
        (C.extra || []).concat(C.profesERP, C.lista.map(function (x) { return x.entrenador; })).forEach(function (n) { var t = bonito(n); if (t) v[norm(t)] = t; });
        C.profes = Object.keys(v).map(function (k) { return v[k]; }).sort(function (a, b) { return a.localeCompare(b); });
        var dl = $("cf-profes"); dl.textContent = ""; C.profes.forEach(function (p) { dl.appendChild(el("option", { value: p })); });
    }

    /* ---------- pestañas ---------- */
    function pestanas() { var t = []; if (C.puede) t.push(["calificar", "Calificar una clase"]); t.push(["ranking", "Ranking de entrenadores"]); t.push(["visitas", "Visitas"]); return t; }
    function pintar() {
        var y = window.scrollY, tabs = pestanas();
        if (!C.vista || !tabs.some(function (t) { return t[0] === C.vista; })) C.vista = tabs[0][0];
        var nav = $("cf-tabs"); nav.textContent = "";
        tabs.forEach(function (t) { nav.appendChild(el("button", { type: "button", role: "tab", class: C.vista === t[0] ? "is-on" : "", "aria-selected": C.vista === t[0] ? "true" : "false", text: t[1], onclick: function () { C.vista = t[0]; C.detalle = null; C.entrenador = null; pintar(); } })); });
        var v = $("cf-vista"); v.textContent = "";
        if (C.vista === "calificar") v.appendChild(formulario());
        else if (C.detalle) v.appendChild(vistaVisita(C.detalle));
        else if (C.entrenador) v.appendChild(vistaEntrenador(C.entrenador));
        else if (C.vista === "ranking") v.appendChild(vistaRanking());
        else v.appendChild(vistaVisitas());
        window.scrollTo(0, y);
    }

    /* ---------- calificar ---------- */
    function nuevo() { return { fecha: hoy(), sucursal: "", entrenador: "", hora: hora(), tipo_clase: TIPOS[0], alumnos: "", notas: {}, fortalezas: "", mejorar: "", acuerdo: "", devolucion: true }; }
    function promedio(n) { var v = ASPECTOS.map(function (a) { return Number(n[a.id]); }).filter(function (x) { return x >= 1 && x <= 5; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }
    function formulario() {
        var b = C.borrador || (C.borrador = nuevo());
        var box = el("div", { class: "op-card is-rojo" });
        box.appendChild(el("h2", { text: C.editar ? "Editar calificación" : "Calificar una clase" }));
        var f = {
            fecha: el("input", { type: "date", value: b.fecha, max: hoy() }),
            sucursal: C.sucursales.length ? el("select", {}, [el("option", { value: "", text: "Elegí la sucursal" })].concat(C.sucursales.map(function (s) { return el("option", { value: s, text: s, selected: s === b.sucursal }); })))
                : el("input", { value: b.sucursal, placeholder: "Sucursal", maxlength: "120" }),
            entrenador: el("input", { list: "cf-profes", value: b.entrenador, placeholder: "Nombre y apellido", maxlength: "120", autocomplete: "off" }),
            hora: el("input", { type: "time", value: b.hora }),
            tipo: el("select", {}, TIPOS.map(function (t) { return el("option", { value: t, text: t, selected: t === b.tipo_clase }); })),
            alumnos: el("input", { type: "number", min: "0", max: "200", value: b.alumnos, placeholder: "Cuántos" })
        };
        if (b.sucursal && C.sucursales.length && C.sucursales.indexOf(b.sucursal) < 0) f.sucursal.appendChild(el("option", { value: b.sucursal, text: b.sucursal, selected: true }));
        var sync = function () { b.fecha = f.fecha.value; b.sucursal = f.sucursal.value; b.entrenador = f.entrenador.value; b.hora = f.hora.value; b.tipo_clase = f.tipo.value; b.alumnos = f.alumnos.value; };
        Object.keys(f).forEach(function (k) { f[k].addEventListener("input", sync); f[k].addEventListener("change", sync); });
        var lbl = function (t, c, cls) { return el("label", { class: "op-campo" + (cls ? " " + cls : "") }, [t, c]); };
        box.appendChild(el("div", { class: "op-grid" }, [lbl("Fecha", f.fecha), lbl("Sucursal", f.sucursal), lbl("Entrenador que estás viendo", f.entrenador, "is-ancho"),
            lbl("Hora de la clase", f.hora), lbl("Tipo de clase", f.tipo), lbl("Alumnos en la clase", f.alumnos)]));
        /* Aspectos */
        var total = el("div", { class: "cf-total" });
        var pintarTotal = function () { var p = promedio(b.notas), n = ASPECTOS.filter(function (a) { return b.notas[a.id]; }).length; total.textContent = ""; total.appendChild(el("b", { class: "cf-nota is-" + tono(p), text: uno(p) })); total.appendChild(el("span", { class: "op-muted", text: "promedio · " + n + " de " + ASPECTOS.length + " aspectos calificados" })); };
        var asp = el("div", { class: "cf-aspectos" });
        ASPECTOS.forEach(function (a) {
            var grupo = el("div", { class: "cf-notas", role: "radiogroup", "aria-label": a.nombre });
            [1, 2, 3, 4, 5].forEach(function (n) {
                grupo.appendChild(el("button", { type: "button", role: "radio", class: (b.notas[a.id] === n ? "is-on" : "") + (n <= 2 ? " is-bajo" : ""), "aria-checked": b.notas[a.id] === n ? "true" : "false", title: n + " · " + ESCALA[n], text: String(n), onclick: function () {
                    b.notas[a.id] = n; Array.prototype.forEach.call(grupo.children, function (x, i) { x.classList.toggle("is-on", i + 1 === n); x.setAttribute("aria-checked", i + 1 === n ? "true" : "false"); }); pintarTotal();
                } }));
            });
            asp.appendChild(el("div", { class: "cf-asp" }, [el("div", {}, [el("b", { text: a.nombre }), el("small", { text: a.ayuda })]), grupo]));
        });
        box.appendChild(el("p", { class: "cf-escala", text: "1 Muy mal · 2 Mal · 3 Regular · 4 Bien · 5 Excelente" }));
        box.appendChild(asp);
        pintarTotal(); box.appendChild(total);
        var txt = function (campo, ph) { var t = el("textarea", { rows: "2", maxlength: "1000", placeholder: ph }); t.value = b[campo] || ""; t.addEventListener("input", function () { b[campo] = t.value; }); return t; };
        box.appendChild(el("div", { class: "op-grid" }, [
            lbl("Lo que hace bien", txt("fortalezas", "Ej.: corrige a cada alumno, muy buena energía"), "is-ancho"),
            lbl("Lo que tiene que mejorar", txt("mejorar", "Ej.: empezó 10 minutos tarde, no hizo vuelta a la calma"), "is-ancho"),
            lbl("Lo que acordaron", txt("acuerdo", "Ej.: llegar 10 minutos antes; revisar en la próxima visita"), "is-todo")
        ]));
        var dev = el("input", { type: "checkbox" }); dev.checked = b.devolucion !== false; dev.addEventListener("change", function () { b.devolucion = dev.checked; });
        box.appendChild(el("label", { class: "op-acc", style: "font-size:13px;color:#D6D8DC" }, [dev, "Le di la devolución al entrenador al terminar la clase"]));
        box.appendChild(el("div", { class: "op-acc" }, [
            el("button", { type: "button", class: "op-btn is-fuerte", text: C.editar ? "Guardar cambios" : "Guardar calificación", onclick: function (ev) { sync(); guardar(ev.currentTarget); } }),
            el("button", { type: "button", class: "op-link", text: C.editar ? "Cancelar" : "Limpiar", onclick: function () { C.borrador = null; C.editar = null; pintar(); } })
        ]));
        return box;
    }
    function guardar(btn) {
        var b = C.borrador, faltan = ASPECTOS.filter(function (a) { return !b.notas[a.id]; });
        var d = { fecha: b.fecha, sucursal: bonito(b.sucursal), entrenador: bonito(b.entrenador), hora: b.hora || null, tipo_clase: b.tipo_clase || null,
            alumnos: b.alumnos === "" ? null : Math.max(0, Math.min(200, parseInt(b.alumnos, 10) || 0)), notas: {}, fortalezas: String(b.fortalezas || "").trim().slice(0, 1000) || null,
            mejorar: String(b.mejorar || "").trim().slice(0, 1000) || null, acuerdo: String(b.acuerdo || "").trim().slice(0, 1000) || null, devolucion: b.devolucion !== false };
        ASPECTOS.forEach(function (a) { d.notas[a.id] = b.notas[a.id]; });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || !d.sucursal || !d.entrenador) { msg("Completá la fecha, la sucursal y el entrenador.", "bad"); return; }
        if (faltan.length) { msg("Falta calificar: " + faltan.map(function (a) { return a.nombre.toLowerCase(); }).join(", ") + ".", "bad"); return; }
        d.promedio = Math.round(promedio(d.notas) * 100) / 100;
        if (d.promedio < 3 && !d.mejorar) { msg("Con un promedio bajo, escribí qué tiene que mejorar: es lo que le sirve al entrenador.", "bad"); return; }
        btn.disabled = true;
        var ahora = new Date().toISOString();
        var p = C.editar ? col().doc(C.editar).update(Object.assign(d, { editado_por: C.uid, fecha_edicion: ahora }))
            : col().add(Object.assign(d, { pais: PAIS, estado: 1, registrado_por: C.uid, registrado_nombre: C.nombre, fecha_on: ahora }));
        p.then(function () {
            msg("Calificación guardada: " + d.entrenador + " · " + uno(d.promedio) + " (" + corta(d.fecha) + ").", "ok");
            C.borrador = null; C.editar = null; C.vista = "ranking"; return cargar();
        }, function (e) { btn.disabled = false; msg("No se pudo guardar: " + errTxt(e), "bad"); });
    }

    /* ---------- ranking ---------- */
    function enPeriodo() { var r = rango(); return C.lista.filter(function (x) { return x.fecha >= r.desde && x.fecha <= r.hasta && (!C.suc || x.sucursal === C.suc); }); }
    function porEntrenador(l) {
        var m = {};
        l.forEach(function (x) {
            var k = norm(x.entrenador), o = m[k] || (m[k] = { nombre: x.entrenador, visitas: [], suma: {}, n: {}, sucs: {} });
            o.visitas.push(x); o.sucs[x.sucursal] = 1;
            ASPECTOS.forEach(function (a) { var v = Number(x.notas && x.notas[a.id]); if (v) { o.suma[a.id] = (o.suma[a.id] || 0) + v; o.n[a.id] = (o.n[a.id] || 0) + 1; } });
        });
        return Object.keys(m).map(function (k) {
            var o = m[k]; o.prom = {}; ASPECTOS.forEach(function (a) { o.prom[a.id] = o.n[a.id] ? o.suma[a.id] / o.n[a.id] : null; });
            o.general = o.visitas.reduce(function (s, x) { return s + Number(x.promedio || 0); }, 0) / o.visitas.length;
            o.visitas.sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
            o.ultima = o.visitas[0]; o.anterior = o.visitas[1] || null;
            return o;
        });
    }
    function filtros() {
        var per = el("select", { onchange: function (e) { C.periodo = e.target.value; pintar(); } }, [["mes", "Este mes"], ["mesAnt", "Mes anterior"], ["90", "Últimos 3 meses"], ["180", "Últimos 6 meses"], ["365", "Último año"]].map(function (p) { return el("option", { value: p[0], text: p[1], selected: String(C.periodo) === p[0] }); }));
        var sucs = {}; C.lista.forEach(function (x) { sucs[x.sucursal] = 1; }); C.sucursales.forEach(function (s) { sucs[s] = 1; });
        var suc = el("select", { onchange: function (e) { C.suc = e.target.value; pintar(); } }, [el("option", { value: "", text: "Todas las sucursales" })].concat(Object.keys(sucs).sort().map(function (s) { return el("option", { value: s, text: s, selected: s === C.suc }); })));
        return el("div", { class: "op-acc" }, [el("label", { class: "op-campo" }, ["Período", per]), el("label", { class: "op-campo" }, ["Sucursal", suc]),
            el("button", { type: "button", class: "op-btn", text: "Descargar Excel (CSV)", style: "align-self:flex-end", onclick: csv })]);
    }
    function vistaRanking() {
        var wrap = el("div", { style: "display:flex;flex-direction:column;gap:14px" });
        wrap.appendChild(filtros());
        var l = enPeriodo(), ent = porEntrenador(l).sort(function (a, b) { return b.general - a.general; });
        var gen = l.length ? l.reduce(function (s, x) { return s + Number(x.promedio || 0); }, 0) / l.length : null;
        var eq = {}; ASPECTOS.forEach(function (a) { var v = l.map(function (x) { return Number(x.notas && x.notas[a.id]); }).filter(Boolean); eq[a.id] = v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; });
        var ord = ASPECTOS.filter(function (a) { return eq[a.id] != null; }).sort(function (a, b) { return eq[b.id] - eq[a.id]; });
        var apoyo = ent.filter(function (o) { return o.general < 3; }).length;
        var k = el("div", { class: "op-kpis" });
        [["Visitas", String(l.length), "clases calificadas"], ["Entrenadores evaluados", String(ent.length), C.profesERP.length ? "de " + C.profesERP.length + " que dieron clases" : ""],
            ["Promedio del equipo", uno(gen), "sobre 5", tono(gen)], ["Lo más fuerte", ord[0] ? ord[0].corto : "—", ord[0] ? uno(eq[ord[0].id]) + " de promedio" : "", ord[0] ? "ok" : ""],
            ["Lo más débil", ord.length ? ord[ord.length - 1].corto : "—", ord.length ? uno(eq[ord[ord.length - 1].id]) + " de promedio" : "", ord.length ? tono(eq[ord[ord.length - 1].id]) : ""],
            ["Necesitan apoyo", String(apoyo), "promedio menor a 3", apoyo ? "bad" : "ok"]].forEach(function (x) {
            k.appendChild(el("div", { class: "op-kpi" + (x[3] ? " is-" + x[3] : "") }, [el("span", { text: x[0] }), el("b", { text: x[1] }), el("small", { text: x[2] })]));
        });
        wrap.appendChild(k);
        var cols = [{ t: "#", v: function (o) { return String(ent.indexOf(o) + 1); } }, { t: "Entrenador", v: function (o) { return el("span", {}, [el("b", { text: o.nombre }), el("br"), el("small", { class: "op-muted", text: Object.keys(o.sucs).join(", ") })]); } },
            { t: "Visitas", n: 1, v: function (o) { return o.visitas.length; } }, { t: "General", n: 1, v: function (o) { return nota(o.general); } }]
            .concat(ASPECTOS.map(function (a) { return { t: a.corto, title: a.nombre, n: 1, v: function (o) { return nota(o.prom[a.id]); } }; }))
            .concat([{ t: "Tendencia", v: function (o) { if (!o.anterior) return "—"; var d = Number(o.ultima.promedio) - Number(o.anterior.promedio); return chip(d > 0.05 ? "▲ " + uno(d) : d < -0.05 ? "▼ " + uno(-d) : "=", d > 0.05 ? "ok" : d < -0.05 ? "bad" : ""); } },
                { t: "Última visita", v: function (o) { return corta(o.ultima.fecha); } }]);
        wrap.appendChild(el("div", { class: "op-card" }, [el("h2", { text: "Ranking de entrenadores" }), el("p", { class: "op-muted", text: "Promedio de cada visita en el período. Tocá un entrenador para ver todas sus visitas y lo que tiene que mejorar." }),
            tabla(cols, ent, "Todavía no hay clases calificadas en este período.", function (o) { C.entrenador = o.nombre; pintar(); window.scrollTo(0, 0); })]));
        /* Por sucursal */
        var ps = {}; l.forEach(function (x) { var o = ps[x.sucursal] || (ps[x.sucursal] = { sucursal: x.sucursal, n: 0, s: 0, ent: {} }); o.n++; o.s += Number(x.promedio || 0); o.ent[norm(x.entrenador)] = 1; });
        var filasS = Object.keys(ps).map(function (k) { var o = ps[k]; o.p = o.s / o.n; return o; }).sort(function (a, b) { return b.p - a.p; });
        /* Sin evaluar en el período (entrenadores del ERP de los últimos 60 días) */
        var evaluados = {}; l.forEach(function (x) { evaluados[norm(x.entrenador)] = 1; });
        var sin = C.profesERP.filter(function (n) { return !evaluados[norm(n)]; });
        wrap.appendChild(el("div", { class: "op-fila" }, [
            el("div", { class: "op-card" }, [el("h2", { text: "Por sucursal" }), tabla([{ t: "Sucursal", v: function (o) { return o.sucursal; } }, { t: "Visitas", n: 1, v: function (o) { return o.n; } },
                { t: "Entrenadores", n: 1, v: function (o) { return Object.keys(o.ent).length; } }, { t: "Promedio", n: 1, v: function (o) { return nota(o.p); } }], filasS, "Sin visitas en el período.")]),
            el("div", { class: "op-card" }, [el("h2", { text: "Sin evaluar en el período" }),
                el("p", { class: "op-muted", text: PY ? "En Paraguay todavía no llega del ERP la lista de entrenadores con clases; se completa con los ya evaluados." : C.profesERP.length ? "Entrenadores que dieron clases en los últimos 60 días (según el ERP) y no tienen calificación en el período." : "Para ver esta lista, conectá la sesión de datos del ERP (botón «Conectar» del centro de mando)." }),
                sin.length ? el("div", { class: "op-acc" }, sin.map(function (n) { return chip(n); })) : null])
        ]));
        return wrap;
    }
    function vistaEntrenador(nombre) {
        var vis = C.lista.filter(function (x) { return norm(x.entrenador) === norm(nombre); });
        var o = porEntrenador(vis)[0];
        var box = el("div", { class: "op-card" }, [el("button", { type: "button", class: "op-link", text: "← Volver al ranking", style: "align-self:flex-start", onclick: function () { C.entrenador = null; pintar(); } }),
            el("h2", { text: nombre + " · " + vis.length + (vis.length === 1 ? " visita" : " visitas") + " en el último año" })]);
        if (!o) return box;
        box.appendChild(el("div", { class: "cf-total" }, [nota(o.general), el("span", { class: "op-muted", text: "promedio general · " + Object.keys(o.sucs).join(", ") })]));
        box.appendChild(el("div", { class: "cf-aspectos" }, ASPECTOS.map(function (a) {
            var v = o.prom[a.id];
            return el("div", { class: "cf-asp" }, [el("div", {}, [el("b", { text: a.nombre }), el("small", { text: a.ayuda })]),
                el("div", { class: "mt-progreso", style: "min-width:220px" }, [el("i", { style: "--p:" + Math.round((v || 0) / 5 * 100) + "%" }), nota(v)])]);
        })));
        box.appendChild(el("h2", { text: "Visitas", style: "margin-top:8px" }));
        vis.forEach(function (x) { box.appendChild(tarjetaVisita(x)); });
        return box;
    }
    function tarjetaVisita(x) {
        return el("div", { class: "cf-detalle" }, [
            el("p", {}, [el("b", { text: corta(x.fecha) + " · " + x.sucursal + (x.hora ? " · " + x.hora : "") + (x.tipo_clase ? " · " + x.tipo_clase : "") + " · " }), nota(x.promedio), " · " + (x.registrado_nombre || "")]),
            el("p", { class: "op-muted", text: ASPECTOS.map(function (a) { return a.corto + " " + (x.notas && x.notas[a.id] || "—"); }).join(" · ") + (x.alumnos != null ? " · " + x.alumnos + " alumnos" : "") }),
            x.fortalezas ? el("p", { text: "Bien: " + x.fortalezas }) : null, x.mejorar ? el("p", { text: "A mejorar: " + x.mejorar }) : null,
            x.acuerdo ? el("p", { text: "Acordaron: " + x.acuerdo }) : null,
            el("p", { class: "op-muted", text: x.devolucion ? "Se le dio la devolución al entrenador." : "Todavía no se le dio la devolución." }),
            C.puede ? el("div", { class: "op-acc" }, [
                el("button", { type: "button", class: "op-link", text: "Editar", onclick: function () { C.editar = x.key; C.borrador = { fecha: x.fecha, sucursal: x.sucursal, entrenador: x.entrenador, hora: x.hora || "", tipo_clase: x.tipo_clase || TIPOS[0], alumnos: x.alumnos == null ? "" : String(x.alumnos), notas: Object.assign({}, x.notas), fortalezas: x.fortalezas || "", mejorar: x.mejorar || "", acuerdo: x.acuerdo || "", devolucion: x.devolucion !== false }; C.vista = "calificar"; C.entrenador = null; C.detalle = null; pintar(); window.scrollTo(0, 0); } }),
                el("button", { type: "button", class: "op-link", text: "Anular", onclick: function () { if (!confirm("¿Anular la calificación de " + x.entrenador + " del " + corta(x.fecha) + "?")) return; col().doc(x.key).update({ estado: 0, anulado_por: C.uid, fecha_anulacion: new Date().toISOString() }).then(function () { msg("Calificación anulada.", "ok"); C.detalle = null; cargar(); }, function (e) { msg(errTxt(e), "bad"); }); } })
            ]) : null
        ]);
    }
    function vistaVisita(x) {
        return el("div", { class: "op-card" }, [el("button", { type: "button", class: "op-link", text: "← Volver", style: "align-self:flex-start", onclick: function () { C.detalle = null; pintar(); } }), tarjetaVisita(x)]);
    }
    function vistaVisitas() {
        var wrap = el("div", { style: "display:flex;flex-direction:column;gap:14px" });
        wrap.appendChild(filtros());
        var l = enPeriodo();
        wrap.appendChild(el("div", { class: "op-card" }, [el("h2", { text: "Visitas del período (" + l.length + ")" }),
            tabla([{ t: "Fecha", v: function (x) { return corta(x.fecha) + (x.hora ? " " + x.hora : ""); } }, { t: "Sucursal", v: function (x) { return x.sucursal; } }, { t: "Entrenador", v: function (x) { return x.entrenador; } },
                { t: "Clase", v: function (x) { return x.tipo_clase; } }, { t: "Promedio", n: 1, v: function (x) { return nota(x.promedio); } },
                { t: "Devolución", v: function (x) { return x.devolucion ? chip("Sí", "ok") : chip("Pendiente", "warn"); } }, { t: "Supervisor", v: function (x) { return x.registrado_nombre; } }],
                l.slice(0, C.verVis), "Todavía no hay visitas en este período.", function (x) { C.detalle = x; pintar(); window.scrollTo(0, 0); }),
            l.length > C.verVis ? el("button", { type: "button", class: "op-btn", text: "Ver " + Math.min(20, l.length - C.verVis) + " más (" + C.verVis + " de " + l.length + ")", onclick: function () { C.verVis += 20; pintar(); } }) : null]));
        return wrap;
    }
    function csv() {
        var l = enPeriodo(), q = function (v) { v = v == null ? "" : String(v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var filas = [["Fecha", "Hora", "Sucursal", "Entrenador", "Tipo de clase", "Alumnos"].concat(ASPECTOS.map(function (a) { return a.nombre; }), ["Promedio", "Lo que hace bien", "A mejorar", "Acordaron", "Devolución", "Supervisor"])]
            .concat(l.map(function (x) { return [x.fecha, x.hora, x.sucursal, x.entrenador, x.tipo_clase, x.alumnos].concat(ASPECTOS.map(function (a) { return x.notas && x.notas[a.id]; }), [String(uno(x.promedio)).replace(".", ","), x.fortalezas, x.mejorar, x.acuerdo, x.devolucion ? "Sí" : "No", x.registrado_nombre]); }));
        var r = rango(), blob = new Blob(["﻿" + filas.map(function (f) { return f.map(q).join(";"); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = el("a", { href: URL.createObjectURL(blob), download: "calificaciones-entrenadores-" + PAIS + "-" + r.desde + "-al-" + r.hasta + ".csv" });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    /* ---------- arranque ---------- */
    $("op-eyebrow").textContent = "Calistenia Company · " + (PY ? "Paraguay" : "Bolivia") + " · Supervisores";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (!window.CMFB || !CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP para usar este módulo.", "bad"); return; }
        C.puede = CMFB.tieneRolPais("supervision");
        C.uid = CMFB.usuarioKey(); C.nombre = (window.CM_USUARIO && CM_USUARIO.nombre) || CMFB.nombre() || "";
        if (!C.puede) msg("Solo lectura: las calificaciones las cargan los supervisores.");
        CMFB.util.sucursales().then(function (l) { C.sucursales = l; if (C.vista === "calificar") pintar(); }, function () {});
        Promise.all([profesoresERP(), deReemplazos()]).then(function (a) { C.profesERP = a[0]; armarNombres(a[1]); if (C.vista === "ranking") pintar(); });
        cargar();
    });
})();
