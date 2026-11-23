/* Reemplazo de profesores (Supervisión).
   Registro en Firestore (sup_reemplazo): fecha, sucursal, horario, clases, profesor que faltó, quién lo cubrió,
   motivo, aviso y nota. Supervisión registra y anula; Dirección, RRHH y Administración consultan.
   Nombres de profesores: los que ya se registraron + los entrenadores del ERP (si hay sesión de datos). */
(function () {
    "use strict";
    var MOTIVOS = { enfermedad: "Enfermedad", permiso: "Permiso", vacaciones: "Vacaciones", emergencia: "Emergencia", falta_sin_aviso: "Faltó sin avisar", cambio_turno: "Cambio de turno", otro: "Otro" };
    var AVISOS = { anticipado: "Con anticipación", mismo_dia: "El mismo día", sin_aviso: "Sin aviso" };
    var R = { lista: [], sucursales: [], profes: [], mes: null, suc: "", editar: false, puede: false, pais: window.CM_PAIS || "bolivia" };
    /* Cada país tiene su propio registro (los anteriores a esta separación son de Bolivia). */
    function delPais(x) { return (x.pais || "bolivia") === R.pais; }
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
    function corta(s) { var p = String(s || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] : "—"; }
    function db() { return firebase.firestore(); }
    function col() { return db().collection("sup_reemplazo"); }
    function msg(t, tono) { var m = $("rp-estado"); m.textContent = t || ""; m.className = "rp-msg" + (tono ? " is-" + tono : ""); }
    function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
    function bonito(s) { return String(s || "").trim().replace(/\s+/g, " ").split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(" "); }

    /* ---------- datos ---------- */
    function rangoMes() { var p = R.mes.split("-"), fin = new Date(+p[0], +p[1], 0); return { desde: R.mes + "-01", hasta: iso(fin) }; }
    function cargar() {
        msg("Cargando…");
        var r = rangoMes();
        return col().where("fecha", ">=", r.desde).where("fecha", "<=", r.hasta).get().then(function (q) {
            R.lista = q.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }).filter(function (x) { return Number(x.estado == null ? 1 : x.estado) > 0 && delPais(x); })
                .sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)) || String(b.hora_inicio).localeCompare(String(a.hora_inicio)); });
            msg(""); pintar();
        }).catch(function (e) {
            msg(e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso para este registro (Supervisión, Dirección, RRHH o Administración en /centro_mando). Probá Salir y volver a entrar." : "No se pudo cargar: " + ((e && e.message) || e), "bad");
        });
    }
    function profesoresERP() {
        if (R.pais !== "bolivia") return Promise.resolve([]);
        if (!window.CM || !CM.conSesion || !CM.conSesion()) return Promise.resolve([]);
        var h = new Date(), d = new Date(h); d.setDate(d.getDate() - 60);
        return CM.llamar("asistencia_por_instructor", { desde: iso(d), hasta: iso(h) }).then(function (r) {
            if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { r = {}; } }
            return ((r && (r.entrenadores || (r.result && r.result.entrenadores))) || []).map(function (x) { return bonito(x.entrenador); }).filter(Boolean);
        }).catch(function () { return []; });
    }
    function cargarNombres() {
        var hist = col().orderBy("fecha", "desc").limit(300).get().then(function (q) {
            var n = []; q.docs.forEach(function (d) { var x = d.data(); if (delPais(x)) n.push(x.titular, x.reemplazo); }); return n;
        }).catch(function () { return []; });
        return Promise.all([hist, profesoresERP()]).then(function (a) {
            var v = {}; a[0].concat(a[1]).forEach(function (n) { var t = bonito(n); if (t) v[norm(t)] = t; });
            R.profes = Object.keys(v).map(function (k) { return v[k]; }).sort(function (x, y) { return x.localeCompare(y); });
            var dl = $("rp-profes"); dl.textContent = ""; R.profes.forEach(function (p) { dl.appendChild(el("option", { value: p })); });
        });
    }

    /* ---------- formulario ---------- */
    function formulario(x) {
        x = x || {};
        var f = $("rp-form"); f.textContent = ""; f.hidden = false;
        var campos = {
            fecha: el("input", { type: "date", value: x.fecha || hoy(), max: hoy(), required: true }),
            /* Si no se pudo leer la lista de sucursales, se escribe a mano. */
            sucursal: R.sucursales.length ? el("select", { required: true }, [el("option", { value: "", text: "Elegí la sucursal" })].concat(R.sucursales.map(function (s) { return el("option", { value: s, text: s, selected: s === x.sucursal }); })))
                : el("input", { value: x.sucursal || "", placeholder: "Sucursal", required: true, maxlength: "120" }),
            hora_inicio: el("input", { type: "time", value: x.hora_inicio || "", required: true }),
            hora_fin: el("input", { type: "time", value: x.hora_fin || "" }),
            clases: el("input", { type: "number", min: "1", max: "12", value: String(x.clases || 1), required: true }),
            titular: el("input", { list: "rp-profes", value: x.titular || "", placeholder: "Nombre y apellido", required: true, maxlength: "120" }),
            reemplazo: el("input", { list: "rp-profes", value: x.reemplazo || "", placeholder: "Nombre y apellido", required: true, maxlength: "120" }),
            motivo: el("select", {}, Object.keys(MOTIVOS).map(function (k) { return el("option", { value: k, text: MOTIVOS[k], selected: k === (x.motivo || "enfermedad") }); })),
            aviso: el("select", {}, Object.keys(AVISOS).map(function (k) { return el("option", { value: k, text: AVISOS[k], selected: k === (x.aviso || "anticipado") }); })),
            nota: el("input", { value: x.nota || "", placeholder: "Opcional: detalle, quién autorizó, etc.", maxlength: "300" })
        };
        if (x.sucursal && R.sucursales.length && R.sucursales.indexOf(x.sucursal) < 0) campos.sucursal.appendChild(el("option", { value: x.sucursal, text: x.sucursal, selected: true }));
        campos.motivo.addEventListener("change", function () { if (campos.motivo.value === "falta_sin_aviso") campos.aviso.value = "sin_aviso"; });
        var aviso = el("p", { class: "rp-msg" });
        var lbl = function (t, c, cls) { return el("label", { class: cls || "" }, [t, c]); };
        f.appendChild(el("h2", { text: x.key ? "Editar reemplazo" : "Registrar reemplazo" }));
        f.appendChild(el("div", { class: "rp-grid" }, [
            lbl("Fecha", campos.fecha), lbl("Sucursal", campos.sucursal), lbl("Desde", campos.hora_inicio), lbl("Hasta", campos.hora_fin), lbl("Clases cubiertas", campos.clases),
            lbl("Profesor que faltó", campos.titular, "is-ancho"), lbl("Lo reemplazó", campos.reemplazo, "is-ancho"),
            lbl("Motivo", campos.motivo), lbl("Aviso", campos.aviso), lbl("Nota", campos.nota, "is-todo")
        ]));
        f.appendChild(el("div", { class: "rp-acc" }, [
            el("button", { type: "button", class: "rp-btn is-fuerte", text: "Guardar", onclick: function (ev) {
                var d = {
                    fecha: campos.fecha.value, sucursal: bonito(campos.sucursal.value), hora_inicio: campos.hora_inicio.value, hora_fin: campos.hora_fin.value || null,
                    clases: Math.max(1, Math.min(12, parseInt(campos.clases.value, 10) || 1)), titular: bonito(campos.titular.value), reemplazo: bonito(campos.reemplazo.value),
                    motivo: campos.motivo.value, aviso: campos.aviso.value, nota: campos.nota.value.trim() || null
                };
                if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || !d.sucursal || !d.hora_inicio || !d.titular || !d.reemplazo) { aviso.textContent = "Completá fecha, sucursal, horario, quién faltó y quién lo reemplazó."; aviso.className = "rp-msg is-bad"; return; }
                if (norm(d.titular) === norm(d.reemplazo)) { aviso.textContent = "El profesor que faltó y el que lo reemplazó no pueden ser la misma persona."; aviso.className = "rp-msg is-bad"; return; }
                ev.currentTarget.disabled = true;
                var u = window.CMFB ? CMFB.usuarioKey() : "", nombre = (window.CM_USUARIO && CM_USUARIO.nombre) || "";
                var p = x.key ? col().doc(x.key).update(Object.assign(d, { editado_por: u, fecha_edicion: new Date().toISOString() }))
                    : col().add(Object.assign(d, { pais: R.pais, estado: 1, registrado_por: u, registrado_nombre: nombre, fecha_on: new Date().toISOString() }));
                p.then(function () {
                    f.hidden = true; msg("Reemplazo guardado: " + d.titular + " → " + d.reemplazo + " (" + corta(d.fecha) + ").", "ok");
                    if (d.fecha.slice(0, 7) !== R.mes) { R.mes = d.fecha.slice(0, 7); $("rp-mes").value = R.mes; }
                    cargar(); cargarNombres();
                }, function (e) { ev.currentTarget.disabled = false; aviso.textContent = "No se pudo guardar: " + ((e && e.message) || e); aviso.className = "rp-msg is-bad"; });
            } }),
            el("button", { type: "button", class: "rp-btn", text: "Cancelar", onclick: function () { f.hidden = true; } }), aviso
        ]));
        f.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* ---------- dibujo ---------- */
    function filtrada() { return R.lista.filter(function (x) { return !R.suc || x.sucursal === R.suc; }); }
    function tabla(cols, filas, vacio) {
        if (!filas.length) return el("p", { class: "rp-muted", text: vacio });
        return el("table", { class: "rp-tabla" }, [
            el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { class: c.n ? "is-n" : "", text: c.t }); }))]),
            el("tbody", {}, filas.map(function (f) { return el("tr", {}, cols.map(function (c) { var v = c.v(f); return el("td", { class: c.n ? "is-n" : "" }, [v == null ? "—" : v]); })); }))
        ]);
    }
    function agrupar(l, k) {
        var m = {};
        l.forEach(function (x) { var n = x[k] || "—", o = m[norm(n)] || (m[norm(n)] = { nombre: n, veces: 0, clases: 0, sin: 0, suc: {} }); o.veces++; o.clases += Number(x.clases) || 1; if (x.aviso === "sin_aviso") o.sin++; o.suc[x.sucursal] = 1; });
        return Object.keys(m).map(function (q) { return m[q]; });
    }
    function chip(t, tono) { return el("span", { class: "rp-chip" + (tono ? " is-" + tono : ""), text: t }); }
    function pintar() {
        var l = filtrada();
        var clases = l.reduce(function (s, x) { return s + (Number(x.clases) || 1); }, 0), sin = l.filter(function (x) { return x.aviso === "sin_aviso"; }).length;
        var tit = agrupar(l, "titular").sort(function (a, b) { return b.sin - a.sin || b.veces - a.veces; }), rem = agrupar(l, "reemplazo").sort(function (a, b) { return b.clases - a.clases; });
        var k = $("rp-kpis"); k.textContent = "";
        [["Reemplazos", String(l.length), "en el mes"], ["Clases cubiertas", String(clases), "por otro profesor"], ["Sin aviso", String(sin), l.length ? Math.round(sin / l.length * 100) + "% de los reemplazos" : "", sin ? "bad" : "ok"],
            ["Profesor con más faltas", tit[0] ? tit[0].nombre : "—", tit[0] ? tit[0].veces + (tit[0].veces === 1 ? " vez" : " veces") : "", tit[0] && tit[0].veces >= 3 ? "warn" : ""]].forEach(function (x) {
            k.appendChild(el("div", { class: "rp-kpi" + (x[3] ? " is-" + x[3] : "") }, [el("span", { text: x[0] }), el("b", { text: x[1] }), el("small", { text: x[2] })]));
        });
        var t = $("rp-titulares"); t.textContent = "";
        t.appendChild(tabla([{ t: "Profesor", v: function (f) { return f.nombre; } }, { t: "Veces", n: 1, v: function (f) { return f.veces; } }, { t: "Clases", n: 1, v: function (f) { return f.clases; } },
            { t: "Sin aviso", n: 1, v: function (f) { return f.sin ? chip(String(f.sin), "bad") : "0"; } }], tit, "Sin reemplazos en el mes."));
        var r = $("rp-reemplazos"); r.textContent = "";
        r.appendChild(tabla([{ t: "Profesor", v: function (f) { return f.nombre; } }, { t: "Reemplazos", n: 1, v: function (f) { return f.veces; } }, { t: "Clases cubiertas", n: 1, v: function (f) { return f.clases; } },
            { t: "Sucursales", v: function (f) { return Object.keys(f.suc).join(", "); } }], rem, "Sin reemplazos en el mes."));
        var li = $("rp-lista"); li.textContent = "";
        li.appendChild(tabla([
            { t: "Fecha", v: function (f) { return corta(f.fecha); } }, { t: "Sucursal", v: function (f) { return f.sucursal; } },
            { t: "Horario", v: function (f) { return (f.hora_inicio || "") + (f.hora_fin ? "–" + f.hora_fin : ""); } }, { t: "Clases", n: 1, v: function (f) { return f.clases || 1; } },
            { t: "Faltó", v: function (f) { return f.titular; } }, { t: "Lo cubrió", v: function (f) { return f.reemplazo; } },
            { t: "Motivo", v: function (f) { return MOTIVOS[f.motivo] || f.motivo; } },
            { t: "Aviso", v: function (f) { return chip(AVISOS[f.aviso] || f.aviso || "—", f.aviso === "sin_aviso" ? "bad" : f.aviso === "mismo_dia" ? "warn" : ""); } },
            { t: "Nota", v: function (f) { return f.nota; } }, { t: "Registró", v: function (f) { return f.registrado_nombre; } },
            { t: "", v: function (f) { return R.puede ? el("span", { class: "rp-acc" }, [
                el("button", { type: "button", class: "rp-link", text: "Editar", onclick: function () { formulario(f); } }),
                el("button", { type: "button", class: "rp-link", text: "Anular", onclick: function () { if (!confirm("¿Anular el reemplazo del " + corta(f.fecha) + " (" + f.titular + " → " + f.reemplazo + ")?")) return; col().doc(f.key).update({ estado: 0, anulado_por: CMFB.usuarioKey(), fecha_anulacion: new Date().toISOString() }).then(function () { msg("Reemplazo anulado.", "ok"); cargar(); }, function (e) { msg("No se pudo anular: " + ((e && e.message) || e), "bad"); }); } })
            ]) : null; } }
        ], l, "Todavía no hay reemplazos registrados en este mes."));
    }
    function csv() {
        var l = filtrada(), q = function (v) { v = v == null ? "" : String(v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var filas = [["Fecha", "Sucursal", "Desde", "Hasta", "Clases", "Profesor que faltó", "Lo reemplazó", "Motivo", "Aviso", "Nota", "Registró"]].concat(l.map(function (f) {
            return [f.fecha, f.sucursal, f.hora_inicio, f.hora_fin, f.clases, f.titular, f.reemplazo, MOTIVOS[f.motivo] || f.motivo, AVISOS[f.aviso] || f.aviso, f.nota, f.registrado_nombre];
        }));
        var blob = new Blob(["﻿" + filas.map(function (r) { return r.map(q).join(";"); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = el("a", { href: URL.createObjectURL(blob), download: "reemplazos-" + R.pais + "-" + R.mes + (R.suc ? "-" + R.suc : "") + ".csv" });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    /* ---------- arranque ---------- */
    document.querySelector(".rp-eyebrow").textContent = "Calistenia Company · " + (R.pais === "paraguay" ? "Paraguay" : "Bolivia") + " · Supervisores";
    R.mes = hoy().slice(0, 7); $("rp-mes").value = R.mes; $("rp-mes").max = R.mes;
    $("rp-mes").addEventListener("change", function () { if (/^\d{4}-\d{2}$/.test(this.value)) { R.mes = this.value; cargar(); } });
    $("rp-suc").addEventListener("change", function () { R.suc = this.value; pintar(); });
    $("rp-csv").addEventListener("click", csv);
    $("rp-nuevo").addEventListener("click", function () { formulario(); });
    var q = $("cm-quien"); if (q && window.CM_USUARIO) q.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (!window.CMFB || !CMFB.sesionVigente()) { msg("Sal del centro de mando y volvé a entrar con tu usuario del ERP para usar este registro.", "bad"); return; }
        R.puede = CMFB.tieneRol("supervision");
        $("rp-nuevo").hidden = !R.puede;
        if (!R.puede) msg("Solo lectura: los reemplazos los registran los supervisores.");
        (R.pais === "paraguay" ? Promise.resolve([]) : CMFB.util.sucursales()).then(function (l) {
            R.sucursales = l; var s = $("rp-suc");
            l.forEach(function (x) { s.appendChild(el("option", { value: x, text: x })); });
        });
        cargarNombres();
        cargar();
    });
})();
