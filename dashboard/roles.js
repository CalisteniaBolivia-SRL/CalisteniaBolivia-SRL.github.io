/* Administración de roles (Dirección): correo de Google → módulos que puede usar. También la lista de sucursales. */
(function () {
    "use strict";
    var raiz = document.getElementById("roles");
    if (!raiz || !window.CMFB) return;
    var $ = function (s) { return raiz.querySelector(s); };
    var ROLES = [["admin", "Dirección (administra roles)"], ["legal", "Legal"], ["administracion", "Administración · cuentas por pagar"], ["comercial", "Jefa de Atención al Cliente"], ["ventas", "ATC de sucursal (su lista de clientes)"], ["reportes", "Reportes"]];
    function el(tag, attrs, hijos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) { var v = attrs[k]; if (k === "text") e.textContent = v; else if (k === "class") e.className = v; else if (k.indexOf("on") === 0 && typeof v === "function") e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v); });
        (hijos || []).forEach(function (h) { if (h != null && h !== false) e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
        return e;
    }
    function msg(n, tono, t) { n.textContent = t || ""; n.className = "lg-msg" + (tono ? " is-" + tono : ""); }
    function avisar(t, tono) { msg($("#rl-aviso"), tono || "ok", t); }
    var db = function () { return firebase.firestore(); };

    function cargar() {
        var c = $("#rl-contenido"); c.textContent = "";
        if (!CMFB.estado.configurado) { msg($("#rl-estado"), "warn", "Falta configurar Firebase (dashboard/firebase-config.js). Pasos en dashboard/FIREBASE.md."); return; }
        if (!CMFB.estado.usuario) { msg($("#rl-estado"), "warn", "Ingresa con tu cuenta de Google (barra de arriba)."); return; }
        if (!CMFB.estado.roles.admin) { msg($("#rl-estado"), "bad", "Tu cuenta " + CMFB.correo() + " no es de Dirección: no puede administrar roles."); return; }
        msg($("#rl-estado"), "", "Cargando…");
        Promise.all([db().collection("roles").get(), db().collection("config").doc("sucursales").get()]).then(function (r) {
            var lista = r[0].docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }).sort(function (a, b) { return a.key.localeCompare(b.key); });
            var sucs = r[1].exists ? r[1].data().lista || [] : [];
            msg($("#rl-estado"), "", lista.length + " personas con acceso.");
            pintar(lista, sucs);
        }).catch(function (e) { msg($("#rl-estado"), "bad", "No se pudo cargar: " + e.message); });
    }

    function formulario(p) {
        var email = el("input", { type: "email", value: p ? p.key : "", placeholder: "nombre@empresa.com", required: true, disabled: !!p });
        var nombre = el("input", { type: "text", value: p ? p.nombre || "" : "", maxlength: "120" });
        var tel = el("input", { type: "tel", value: p ? p.telefono || "" : "", maxlength: "40" });
        var checks = ROLES.map(function (r) { return el("label", { class: "lg-check" }, [el("input", { type: "checkbox", value: r[0], checked: !!(p && p[r[0]]) }), r[1]]); });
        var m = el("p", { class: "lg-msg" });
        var f = el("form", { class: "lg-card lg-form", novalidate: true }, [el("h3", { class: "lg-h3", text: p ? "Editar a " + (p.nombre || p.key) : "Agregar persona" }),
            el("label", {}, ["Correo de Google", email]), el("label", {}, ["Nombre", nombre]), el("label", {}, ["Teléfono", tel]),
            el("fieldset", { class: "lg-ancho lg-checks" }, [el("legend", { text: "Módulos" })].concat(checks)),
            el("div", { class: "lg-acciones lg-ancho" }, [el("button", { type: "submit", class: "lg-primario", text: "Guardar" }), el("button", { type: "button", class: "lg-btn", text: "Cancelar", onclick: function () { f.remove(); } }), m])]);
        f.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var e = email.value.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { msg(m, "bad", "Escribe un correo válido."); return; }
            if (p && p.key === CMFB.correo() && !checks[0].querySelector("input").checked) { msg(m, "bad", "No puedes quitarte el rol de Dirección a ti mismo."); return; }
            var d = { nombre: nombre.value.trim() || null, telefono: tel.value.trim() || null, estado: 1, fecha_edicion: new Date().toISOString(), editado_por: CMFB.correo() };
            checks.forEach(function (l) { var i = l.querySelector("input"); d[i.value] = i.checked; });
            db().collection("roles").doc(e).set(d).then(function () { avisar("Guardado. " + e + " debe volver a cargar la página para ver los cambios."); cargar(); })
                .catch(function (err) { msg(m, "bad", "No se guardó: " + err.message); });
        });
        return f;
    }

    function pintar(lista, sucs) {
        var c = $("#rl-contenido"), zona = el("div");
        c.appendChild(el("div", { class: "lg-fila" }, [el("button", { type: "button", class: "lg-primario", text: "Agregar persona", onclick: function () { zona.textContent = ""; zona.appendChild(formulario(null)); } })]));
        c.appendChild(zona);
        var tb = el("tbody");
        lista.forEach(function (p) {
            var activo = Number(p.estado == null ? 1 : p.estado) > 0;
            tb.appendChild(el("tr", { class: activo ? null : "is-mal" }, [
                el("td", {}, [el("b", { text: p.nombre || "—" }), el("div", { class: "lg-muted", text: p.key })]),
                el("td", {}, [ROLES.filter(function (r) { return p[r[0]]; }).map(function (r) { return r[1]; }).join(" · ") || "Sin módulos"]),
                el("td", {}, [activo ? "Activo" : "Sin acceso"]),
                el("td", {}, [el("div", { class: "lg-acciones" }, [
                    el("button", { type: "button", class: "lg-btn", text: "Editar", onclick: function () { zona.textContent = ""; zona.appendChild(formulario(p)); } }),
                    p.key === CMFB.correo() ? null : el("button", { type: "button", class: "lg-btn", text: activo ? "Quitar acceso" : "Devolver acceso", onclick: function () {
                        db().collection("roles").doc(p.key).set({ estado: activo ? 0 : 1, fecha_edicion: new Date().toISOString(), editado_por: CMFB.correo() }, { merge: true }).then(cargar).catch(function (e) { avisar(e.message, "bad"); });
                    } })])])
            ]));
        });
        c.appendChild(el("div", { class: "lg-card" }, [el("div", { class: "lg-tablewrap" }, [el("table", { class: "lg-table" }, [el("thead", {}, [el("tr", {}, ["Persona", "Módulos", "Estado", ""].map(function (t) { return el("th", { text: t }); }))]), tb])])]));
        var area = el("textarea", { rows: "6" }); area.value = sucs.join("\n");
        var m = el("p", { class: "lg-msg" });
        c.appendChild(el("div", { class: "lg-card" }, [el("h3", { class: "lg-h3", text: "Sucursales" }),
            el("p", { class: "lg-muted", text: "Una por línea. Se suman a las que aparecen en las ventas; sirven para los formularios de Legal, Cuentas por pagar y el reparto del Sistema comercial." }), area,
            el("div", { class: "lg-acciones" }, [el("button", { type: "button", class: "lg-primario", text: "Guardar sucursales", onclick: function () {
                var l = area.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).filter(function (s, i, a) { return a.indexOf(s) === i; });
                db().collection("config").doc("sucursales").set({ lista: l }).then(function () { msg(m, "ok", "Sucursales guardadas."); }).catch(function (e) { msg(m, "bad", e.message); });
            } }), m])]));
    }

    CMFB.listo.then(cargar);
})();
