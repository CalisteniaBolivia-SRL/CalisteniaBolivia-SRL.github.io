/* Buzón de sugerencias (Recursos Humanos).
   Los clientes escriben desde la app (Perfil → Buzón de sugerencias). La app crea el documento en Firestore
   sin sesión: las reglas solo le permiten CREAR (rh_sugerencia en Bolivia, py_rh_sugerencia en Paraguay).
   Aquí RRHH y Dirección leen, filtran, anotan qué se hizo y cambian el estado. No se borra nada.
   Seguridad: todo el texto del cliente se pinta con textContent (nunca como HTML). */
(function () {
    "use strict";
    var CATEGORIAS = { atencion: "Atención en sucursal", entrenadores: "Entrenadores", clases: "Clases y horarios", instalaciones: "Instalaciones y equipos", limpieza: "Limpieza", app: "La app", precios: "Precios y pagos", felicitacion: "Felicitación", otro: "Otro" };
    var ESTADOS = { nueva: "Nueva", revision: "En revisión", resuelta: "Resuelta", archivada: "Archivada" };
    var TONO = { nueva: "rojo", revision: "warn", resuelta: "ok", archivada: "" };
    var R = { lista: [], pais: window.CM_PAIS || "bolivia", puede: false, f: { periodo: 30, estado: "", cat: "", suc: "", q: "" } };
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
    function col() { return firebase.firestore().collection(R.pais === "paraguay" ? "py_rh_sugerencia" : "rh_sugerencia"); }
    function msg(t, tono) { var m = $("sg-msg"); m.textContent = t || ""; m.className = "rp-msg" + (tono ? " is-" + tono : ""); }
    function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
    function fecha(iso) {
        var d = new Date(iso); if (isNaN(d)) return "—";
        var p = function (n) { return (n < 10 ? "0" : "") + n; };
        return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    }
    function chip(t, tono) { return el("span", { class: "rp-chip" + (tono ? " is-" + tono : ""), text: t }); }

    /* ---------- datos ---------- */
    function cargar() {
        msg("Cargando…");
        return col().orderBy("fecha_on", "desc").limit(1000).get().then(function (q) {
            R.lista = q.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); });
            llenarSucursales(); msg(""); pintar();
        }).catch(function (e) {
            msg(e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso para el buzón (RRHH o Dirección en /centro_mando). Probá Salir y volver a entrar." : "No se pudo cargar: " + ((e && e.message) || e), "bad");
        });
    }
    function llenarSucursales() {
        var s = $("sg-suc"), v = s.value, vistas = {};
        R.lista.forEach(function (x) { if (x.sucursal) vistas[x.sucursal] = 1; });
        s.textContent = ""; s.appendChild(el("option", { value: "", text: "Todas" }));
        Object.keys(vistas).sort().forEach(function (n) { s.appendChild(el("option", { value: n, text: n, selected: n === v })); });
    }
    function enPeriodo(x) {
        if (!R.f.periodo) return true;
        return new Date(x.fecha_on).getTime() >= Date.now() - R.f.periodo * 86400000;
    }
    function filtrada() {
        var q = norm(R.f.q);
        return R.lista.filter(function (x) {
            if (!enPeriodo(x)) return false;
            if (R.f.estado && (x.estado || "nueva") !== R.f.estado) return false;
            if (R.f.cat && x.categoria !== R.f.cat) return false;
            if (R.f.suc && x.sucursal !== R.f.suc) return false;
            if (q && norm([x.mensaje, x.nombre, x.telefono, x.correo, x.sucursal, x.nota].join(" ")).indexOf(q) < 0) return false;
            return true;
        });
    }

    /* ---------- pintar ---------- */
    function kpis() {
        var l = R.lista.filter(enPeriodo), cuenta = function (e) { return l.filter(function (x) { return (x.estado || "nueva") === e; }).length; };
        var nuevas = R.lista.filter(function (x) { return (x.estado || "nueva") === "nueva"; }).length; /* las nuevas, de cualquier fecha */
        var k = $("sg-kpis"); k.textContent = "";
        [["Sin atender", nuevas, "Nuevas, de cualquier fecha", nuevas ? "bad" : "ok"],
            ["En revisión", cuenta("revision"), "En el período", cuenta("revision") ? "warn" : ""],
            ["Resueltas", cuenta("resuelta"), "En el período", "ok"],
            ["Recibidas", l.length, (R.f.periodo ? "Últimos " + R.f.periodo + " días" : "Desde el inicio"), ""]].forEach(function (x) {
            k.appendChild(el("div", { class: "rp-kpi" + (x[3] ? " is-" + x[3] : "") }, [el("span", { text: x[0] }), el("b", { text: String(x[1]) }), el("small", { text: x[2] })]));
        });
    }
    function temas() {
        var l = R.lista.filter(enPeriodo), m = {};
        l.forEach(function (x) { var o = m[x.categoria] || (m[x.categoria] = { n: 0, pend: 0 }); o.n++; if ((x.estado || "nueva") === "nueva" || x.estado === "revision") o.pend++; });
        var filas = Object.keys(m).sort(function (a, b) { return m[b].n - m[a].n; });
        var t = $("sg-temas"); t.textContent = "";
        if (!filas.length) { t.appendChild(el("p", { class: "sg-vacio", text: "Todavía no llegaron sugerencias en este período." })); return; }
        t.appendChild(el("table", { class: "rp-tabla" }, [
            el("thead", {}, [el("tr", {}, [el("th", { text: "Tema" }), el("th", { class: "is-n", text: "Recibidas" }), el("th", { class: "is-n", text: "Sin resolver" })])]),
            el("tbody", {}, filas.map(function (c) {
                return el("tr", {}, [el("td", { text: CATEGORIAS[c] || c }), el("td", { class: "is-n", text: String(m[c].n) }), el("td", { class: "is-n" }, [m[c].pend ? chip(String(m[c].pend), "warn") : "0"])]);
            }))
        ]));
    }
    function contacto(x) {
        if (x.anonimo) return el("p", { class: "sg-quien" }, [el("span", { text: "Anónima" })]);
        var tel = String(x.telefono || "").replace(/[^0-9]/g, "");
        var wa = tel ? (tel.length <= 8 ? (R.pais === "paraguay" ? "595" : "591") + tel : tel) : "";
        return el("p", { class: "sg-quien" }, [
            el("span", { text: x.nombre || "Cliente sin nombre" }),
            tel ? el("a", { href: "https://wa.me/" + wa, target: "_blank", rel: "noopener", text: "WhatsApp " + x.telefono }) : null,
            x.correo ? el("span", { text: x.correo }) : null
        ]);
    }
    function item(x) {
        var est = x.estado || "nueva";
        var nota = el("textarea", { maxlength: "2000", placeholder: "Qué se hizo o se va a hacer (solo lo ve el equipo)", "aria-label": "Nota interna" });
        nota.value = x.nota || "";
        var sel = el("select", { "aria-label": "Estado" }, Object.keys(ESTADOS).map(function (k) { return el("option", { value: k, text: ESTADOS[k], selected: k === est }); }));
        var aviso = el("span", { class: "rp-msg" });
        var guardar = el("button", { type: "button", class: "rp-btn is-fuerte", text: "Guardar", onclick: function () {
            guardar.disabled = true; aviso.textContent = "Guardando…"; aviso.className = "rp-msg";
            var cambio = { estado: sel.value, nota: nota.value.trim(), atendido_por: CMFB.usuarioKey(), atendido_nombre: ((window.CM_USUARIO && CM_USUARIO.nombre) || "").slice(0, 120), fecha_atencion: new Date().toISOString() };
            col().doc(x.key).update(cambio).then(function () {
                Object.assign(x, cambio); aviso.textContent = "Guardado."; aviso.className = "rp-msg is-ok"; guardar.disabled = false;
                kpis(); temas(); setTimeout(pintarLista, 600);
            }, function (e) { guardar.disabled = false; aviso.textContent = "No se pudo guardar: " + ((e && e.message) || e); aviso.className = "rp-msg is-bad"; });
        } });
        if (!R.puede) { nota.disabled = true; sel.disabled = true; guardar.hidden = true; }
        return el("article", { class: "sg-item is-" + est }, [
            el("div", {}, [
                el("div", { class: "sg-cab" }, [chip(ESTADOS[est] || est, TONO[est]), chip(CATEGORIAS[x.categoria] || x.categoria || "—"), el("span", { text: x.sucursal || "Sin sucursal" }), el("span", { text: fecha(x.fecha_on) })]),
                el("p", { class: "sg-texto", text: x.mensaje || "" }),
                contacto(x)
            ]),
            el("div", { class: "sg-gestion" }, [
                el("label", {}, ["Estado", sel]),
                el("label", {}, ["Nota interna", nota]),
                el("div", { class: "rp-acc" }, [guardar, aviso]),
                x.atendido_nombre ? el("span", { class: "sg-pie", text: "Última gestión: " + x.atendido_nombre + " · " + fecha(x.fecha_atencion) }) : null
            ])
        ]);
    }
    function pintarLista() {
        var l = filtrada(), c = $("sg-lista"); c.textContent = "";
        if (!l.length) { c.appendChild(el("p", { class: "sg-vacio", text: R.lista.length ? "No hay sugerencias con estos filtros." : "Todavía no llegó ninguna sugerencia desde la app." })); return; }
        l.forEach(function (x) { c.appendChild(item(x)); });
    }
    function pintar() { kpis(); temas(); pintarLista(); }
    function csv() {
        var q = function (v) { v = v == null ? "" : String(v); return /[",;\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var filas = [["Fecha", "Estado", "Tema", "Sucursal", "Mensaje", "Anónima", "Cliente", "Teléfono", "Correo", "Nota interna", "Atendió"]].concat(filtrada().map(function (x) {
            return [fecha(x.fecha_on), ESTADOS[x.estado || "nueva"], CATEGORIAS[x.categoria] || x.categoria, x.sucursal, x.mensaje, x.anonimo ? "Sí" : "No", x.nombre, x.telefono, x.correo, x.nota, x.atendido_nombre];
        }));
        var blob = new Blob(["﻿" + filas.map(function (r) { return r.map(q).join(";"); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = el("a", { href: URL.createObjectURL(blob), download: "sugerencias-" + R.pais + ".csv" });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    /* ---------- arranque ---------- */
    var pais = R.pais === "paraguay" ? "Paraguay" : "Bolivia";
    document.querySelector(".rp-eyebrow").textContent = "Calistenia Company · " + pais + " · Recursos Humanos";
    if (R.pais === "paraguay") $("sg-volver").href = "rrhh.html?pais=paraguay";
    Object.keys(ESTADOS).forEach(function (k) { $("sg-estado").appendChild(el("option", { value: k, text: ESTADOS[k] })); });
    Object.keys(CATEGORIAS).forEach(function (k) { $("sg-cat").appendChild(el("option", { value: k, text: CATEGORIAS[k] })); });
    $("sg-periodo").addEventListener("change", function () { R.f.periodo = Number(this.value) || 0; pintar(); });
    $("sg-estado").addEventListener("change", function () { R.f.estado = this.value; pintarLista(); });
    $("sg-cat").addEventListener("change", function () { R.f.cat = this.value; pintarLista(); });
    $("sg-suc").addEventListener("change", function () { R.f.suc = this.value; pintarLista(); });
    $("sg-buscar").addEventListener("input", function () { R.f.q = this.value; pintarLista(); });
    $("sg-csv").addEventListener("click", csv);
    var quien = $("cm-quien"); if (quien && window.CM_USUARIO) quien.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (!window.CMFB || !CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP para usar el buzón.", "bad"); return; }
        R.puede = CMFB.tieneRolPais("rrhh") || CMFB.tieneRolPais("direccion");
        cargar();
    });
})();
