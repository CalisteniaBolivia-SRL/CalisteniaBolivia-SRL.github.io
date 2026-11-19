/* Tablero Redes sociales: respuestas automáticas a comentarios de Facebook e Instagram (Bolivia y Paraguay)
   y borradores para TikTok. Las respuestas las redacta y publica la función de Firebase (functions/redes.js);
   aquí Marketing aprueba los casos delicados, revisa el historial y configura lo que la marca puede decir. */
(function () {
    "use strict";
    var raiz = document.getElementById("redes");
    if (!raiz || !window.CMFB) return;
    var PAISES = { bolivia: "Bolivia", paraguay: "Paraguay" };
    var REDES = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
    var CAT = { elogio: "Elogio", pregunta: "Pregunta", precio_horario: "Precio u horario", critica: "Crítica", delicado: "Delicado", spam: "Spam", otro: "Otro" };
    var EST = { nuevo: "Generando…", generando: "Generando…", regenerar: "Generando…", pendiente: "Por aprobar", aprobado: "Publicando…", respondido: "Respondido",
        error: "Error al publicar", descartado: "Descartado", ignorado: "Spam (sin respuesta)", borrador: "Borrador", publicado_manual: "Publicado a mano" };
    var TONO = { respondido: "ok", publicado_manual: "ok", pendiente: "warn", borrador: "warn", error: "bad", descartado: "muted", ignorado: "muted" };

    var $ = function (s) { return raiz.querySelector(s); };
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
    var chip = function (tono, t) { return el("span", { class: "lg-chip lg-" + tono, text: t }); };
    function mensaje(n, tono, t) { n.textContent = t || ""; n.className = "lg-msg" + (tono ? " is-" + tono : ""); }
    function avisar(t, tono) { var m = $("#rs-aviso"); mensaje(m, tono || "ok", t); clearTimeout(avisar.t); avisar.t = setTimeout(function () { m.textContent = ""; }, 8000); }
    function fechaHora(s) { if (!s) return "—"; var d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    function textoError(e) { return e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene el permiso «marketing» en /centro_mando, o tu sesión venció: vuelve a ingresar." : (e && e.message) || String(e); }
    var db = function () { return CMFB.util.db(); };
    var yo = function () { return CMFB.usuarioKey(); };
    var ahora = function () { return new Date().toISOString(); };

    var estado = { pestana: "aprobar", pais: "", comentarios: [], historial: [], config: {}, cuentas: [], escuchas: [] };
    try { estado.pestana = localStorage.getItem("rs_pestana") || "aprobar"; } catch (e) {}
    /* Desde el portal de un país (Capital Corp → Calistenia Company → país) se abre filtrado por ese país. */
    var mPais = /[?&]pais=(bolivia|paraguay)\b/.exec(location.search);
    if (mPais) estado.pais = mPais[1];

    /* ---------- pestañas ---------- */
    var PESTANAS = [["aprobar", "Por aprobar"], ["tiktok", "TikTok"], ["historial", "Historial"], ["config", "Configuración"]];
    function pintarPestanas() {
        var nav = $("#rs-tabs"); nav.textContent = "";
        PESTANAS.forEach(function (p) {
            var n = p[0] === "aprobar" ? estado.comentarios.filter(function (c) { return c.plataforma !== "tiktok" && (c.estado === "pendiente" || c.estado === "error"); }).length
                : p[0] === "tiktok" ? estado.comentarios.filter(function (c) { return c.plataforma === "tiktok" && c.estado === "borrador"; }).length : 0;
            nav.appendChild(el("button", { type: "button", role: "tab", class: "lg-tab" + (estado.pestana === p[0] ? " is-on" : ""), "aria-selected": estado.pestana === p[0] ? "true" : "false",
                onclick: function () { estado.pestana = p[0]; try { localStorage.setItem("rs_pestana", p[0]); } catch (e) {} pintar(); } }, [p[1] + (n ? " (" + n + ")" : "")]));
        });
    }
    function filtroPais() {
        return el("label", {}, ["País", el("select", { onchange: function (e) { estado.pais = e.target.value; pintar(); } },
            [["", "Todos"], ["bolivia", "Bolivia"], ["paraguay", "Paraguay"]].map(function (o) { return el("option", { value: o[0], selected: estado.pais === o[0] }, [o[1]]); }))]);
    }
    var delPais = function (c) { return !estado.pais || c.pais === estado.pais; };

    /* ---------- acciones sobre un comentario ---------- */
    function cambiar(c, datos, ok) {
        var d = Object.assign({ revisado_por: yo(), fecha_revision: ahora() }, datos);
        return db().collection("rs_comentario").doc(c.key).update(d).then(function () { if (ok) avisar(ok); }).catch(function (e) { avisar(textoError(e), "bad"); });
    }
    function tarjeta(c) {
        var area = el("textarea", { rows: 3, maxlength: 1000, "aria-label": "Respuesta" }); area.value = c.respuesta_final || c.respuesta || "";
        var indic = el("input", { type: "text", maxlength: 300, placeholder: "Opcional: más corta, más seria, sin emojis…", "aria-label": "Indicación para otra versión" });
        var esTT = c.plataforma === "tiktok", botones = [];
        var bloquear = function () { botones.forEach(function (b) { b.disabled = true; }); };
        if (esTT) {
            botones.push(el("button", { type: "button", class: "lg-primario", onclick: function () {
                var t = area.value.trim();
                (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { avisar("Copiada. Pégala como respuesta en TikTok y luego márcala como publicada."); },
                    function () { area.select(); avisar("Selecciona y copia el texto.", "warn"); });
            } }, ["Copiar respuesta"]));
            botones.push(el("button", { type: "button", class: "lg-btn lg-btn-fuerte", onclick: function () { bloquear(); cambiar(c, { estado: "publicado_manual", respuesta_final: area.value.trim() }, "Marcada como publicada."); } }, ["Ya la publiqué"]));
        } else {
            botones.push(el("button", { type: "button", class: "lg-primario", onclick: function () {
                var t = area.value.trim(); if (!t) { avisar("La respuesta está vacía.", "warn"); return; }
                bloquear(); cambiar(c, { estado: "aprobado", respuesta_final: t }, "Aprobada: se publica en unos segundos.");
            } }, [c.estado === "error" ? "Reintentar publicar" : "Aprobar y publicar"]));
        }
        botones.push(el("button", { type: "button", class: "lg-btn", onclick: function () { bloquear(); cambiar(c, { estado: "regenerar", indicacion: indic.value.trim() || null }, "Pidiendo otra versión…"); } }, ["Otra versión"]));
        botones.push(el("button", { type: "button", class: "lg-btn", onclick: function () { bloquear(); cambiar(c, { estado: "descartado" }, "Descartado: no se responde."); } }, ["No responder"]));
        var nota = c.estado === "error" ? "No se pudo publicar: " + (c.detalle_error || "error de Meta") : (c.espera || c.motivo || "");
        return el("article", { class: "rs-card" + (c.categoria === "delicado" ? " is-delicado" : "") }, [
            el("div", { class: "rs-cab" }, [chip("muted", REDES[c.plataforma] || c.plataforma), chip("muted", PAISES[c.pais] || "—"), c.cuenta_nombre ? el("span", { class: "lg-muted", text: c.cuenta_nombre }) : null,
                c.categoria ? chip(c.categoria === "delicado" || c.categoria === "critica" ? "bad" : "ok", CAT[c.categoria] || c.categoria) : null, el("span", { class: "lg-muted rs-fecha", text: fechaHora(c.fecha_on) })]),
            c.publicacion_texto ? el("p", { class: "rs-pub" }, [el("b", { text: "Publicación: " }), c.publicacion_texto.slice(0, 220) + (c.publicacion_texto.length > 220 ? "…" : "")]) : null,
            el("blockquote", { class: "rs-com" }, [el("b", { text: (c.autor || "Alguien") + ": " }), c.texto || ""]),
            nota ? el("p", { class: "lg-muted rs-nota", text: nota }) : null,
            el("label", {}, ["Respuesta", area]),
            el("label", {}, ["Indicación para otra versión", indic]),
            el("div", { class: "rs-acc" }, botones)
        ]);
    }

    /* ---------- vistas ---------- */
    function vistaAprobar(cont) {
        var l = estado.comentarios.filter(function (c) { return c.plataforma !== "tiktok" && (c.estado === "pendiente" || c.estado === "error") && delPais(c); });
        cont.appendChild(el("div", { class: "rs-barra" }, [filtroPais(), el("p", { class: "lg-muted", text: "Casos delicados (lesiones, cobros, denuncias, insultos), respuestas con las automáticas apagadas y errores de publicación. Lo demás se responde solo." })]));
        if (!l.length) { cont.appendChild(el("p", { class: "lg-vacio rs-vacio", text: "Nada por aprobar. 💪" })); return; }
        l.sort(function (a, b) { return (a.categoria === "delicado" ? 0 : 1) - (b.categoria === "delicado" ? 0 : 1) || String(a.fecha_on).localeCompare(String(b.fecha_on)); });
        cont.appendChild(el("div", { class: "rs-lista" }, l.map(tarjeta)));
    }
    function vistaTikTok(cont) {
        var pais = el("select", {}, [el("option", { value: "bolivia" }, ["Bolivia"]), el("option", { value: "paraguay" }, ["Paraguay"])]);
        if (estado.pais) pais.value = estado.pais;
        var autor = el("input", { type: "text", maxlength: 80, placeholder: "@usuario" });
        var texto = el("textarea", { rows: 3, maxlength: 4000, required: true, placeholder: "Pega aquí el comentario" });
        var pub = el("textarea", { rows: 2, maxlength: 1500, placeholder: "Opcional: de qué trata el video" });
        var btn = el("button", { type: "submit", class: "lg-primario" }, ["Generar respuesta"]);
        var form = el("form", { class: "rs-form", onsubmit: function (e) {
            e.preventDefault();
            if (!texto.value.trim()) { avisar("Pega el comentario.", "warn"); return; }
            btn.disabled = true;
            var ref = db().collection("rs_comentario").doc();
            ref.set({ plataforma: "tiktok", pais: pais.value, texto: texto.value.trim(), autor: autor.value.trim() || null, publicacion_texto: pub.value.trim() || null,
                estado: "nuevo", fecha_on: ahora(), creado_por: yo(), id: ref.id, cuenta: "tiktok_" + pais.value })
                .then(function () { texto.value = ""; autor.value = ""; avisar("Generando la respuesta: aparece abajo en unos segundos."); })
                .catch(function (er) { avisar(textoError(er), "bad"); }).then(function () { btn.disabled = false; });
        } }, [el("h3", { class: "lg-h3", text: "Comentario de TikTok" }),
            el("p", { class: "lg-muted", text: "TikTok no deja responder comentarios por sistema: pega el comentario, copia la respuesta y publícala desde la app." }),
            el("div", { class: "rs-fila" }, [el("label", {}, ["País", pais]), el("label", {}, ["Autor", autor])]),
            el("label", {}, ["Comentario", texto]), el("label", {}, ["Video", pub]), el("div", {}, [btn])]);
        cont.appendChild(form);
        var l = estado.comentarios.filter(function (c) { return c.plataforma === "tiktok" && ["borrador", "nuevo", "generando", "regenerar"].indexOf(c.estado) >= 0 && delPais(c); });
        l.sort(function (a, b) { return String(b.fecha_on).localeCompare(String(a.fecha_on)); });
        cont.appendChild(el("div", { class: "rs-lista" }, l.map(function (c) {
            return c.estado === "borrador" ? tarjeta(c) : el("article", { class: "rs-card" }, [el("blockquote", { class: "rs-com" }, [c.texto]), el("p", { class: "lg-muted", text: "Generando respuesta…" })]);
        })));
    }
    function vistaHistorial(cont) {
        cont.appendChild(el("div", { class: "rs-barra" }, [filtroPais()]));
        var l = estado.historial.filter(delPais);
        var cuenta = function (f) { return l.filter(f).length; };
        cont.appendChild(el("div", { class: "lg-kpis" }, [
            ["Comentarios", l.length, "últimos 200"], ["Respondidos solos", cuenta(function (c) { return c.publicado_por === "automatico"; })],
            ["Aprobados por una persona", cuenta(function (c) { return c.estado === "respondido" && c.publicado_por !== "automatico"; })],
            ["Críticas", cuenta(function (c) { return c.categoria === "critica"; })], ["Delicados", cuenta(function (c) { return c.categoria === "delicado"; })]
        ].map(function (k) { return el("article", { class: "lg-kpi" }, [el("h3", { text: k[0] }), el("p", { class: "lg-kpi-v", text: String(k[1]) }), k[2] ? el("p", { class: "lg-kpi-s", text: k[2] }) : null]); })));
        var tb = el("tbody");
        if (!l.length) tb.appendChild(el("tr", {}, [el("td", { colspan: 6, class: "lg-vacio", text: "Todavía no hay comentarios." })]));
        l.forEach(function (c) {
            tb.appendChild(el("tr", {}, [el("td", { text: fechaHora(c.fecha_on) }), el("td", { text: (REDES[c.plataforma] || "") + " · " + (PAISES[c.pais] || "") }),
                el("td", {}, [el("b", { text: (c.autor || "—") + ": " }), c.texto || ""]), el("td", { text: CAT[c.categoria] || "—" }),
                el("td", { text: c.respuesta_final || c.respuesta || "—" }), el("td", {}, [chip(TONO[c.estado] || "muted", EST[c.estado] || c.estado)])]));
        });
        cont.appendChild(el("div", { class: "lg-tablewrap" }, [el("table", { class: "lg-table" }, [el("thead", {}, [el("tr", {}, ["Fecha", "Red", "Comentario", "Tipo", "Respuesta", "Estado"].map(function (t) { return el("th", { scope: "col", text: t }); }))]), tb])]));
    }

    function formConfig(p) {
        var c = estado.config[p] || {};
        var auto = el("input", { type: "checkbox", checked: c.auto_activo === true });
        var max = el("input", { type: "number", min: 1, max: 300, step: 1, value: c.max_por_hora || 60 });
        var wa = el("input", { type: "text", maxlength: 40, value: c.whatsapp || "", placeholder: p === "paraguay" ? "+595 9…" : "+591 7…" });
        var datos = el("textarea", { rows: 9, maxlength: 12000, placeholder: "Sucursales y direcciones, horarios, precios de los planes, promociones vigentes, clase de prueba, qué llevar, cómo inscribirse…" }); datos.value = c.datos || "";
        var tono = el("textarea", { rows: 3, maxlength: 2000, placeholder: "Ej.: no mencionar a la competencia; esta semana promocionar el plan trimestral." }); tono.value = c.tono_extra || "";
        var btn = el("button", { type: "submit", class: "lg-primario" }, ["Guardar " + PAISES[p]]);
        return el("form", { class: "rs-form", onsubmit: function (e) {
            e.preventDefault();
            var n = parseInt(max.value, 10);
            if (!(n >= 1 && n <= 300)) { avisar("El máximo por hora va de 1 a 300.", "warn"); return; }
            btn.disabled = true;
            var d = { auto_activo: auto.checked, max_por_hora: n, whatsapp: wa.value.trim() || null, datos: datos.value.trim() || null, tono_extra: tono.value.trim() || null, fecha_mod: ahora(), mod_por: yo() };
            db().collection("rs_config").doc(p).set(d).then(function () { estado.config[p] = d; avisar("Guardado: " + PAISES[p] + "."); })
                .catch(function (er) { avisar(textoError(er), "bad"); }).then(function () { btn.disabled = false; });
        } }, [el("h3", { class: "lg-h3", text: PAISES[p] }),
            el("label", { class: "rs-check" }, [auto, " Responder solos los comentarios comunes y las críticas (los delicados siempre esperan aprobación)"]),
            el("div", { class: "rs-fila" }, [el("label", {}, ["Máximo de respuestas automáticas por hora y cuenta", max]), el("label", {}, ["WhatsApp de atención", wa])]),
            el("label", {}, ["Lo que la marca puede decir (precios, sucursales, horarios, promociones)", datos]),
            el("label", {}, ["Indicaciones extra de tono", tono]), el("div", {}, [btn])]);
    }
    function formCuenta() {
        var id = el("input", { type: "text", inputmode: "numeric", maxlength: 25, required: true, placeholder: "Id de la página o de la cuenta de Instagram" });
        var red = el("select", {}, [el("option", { value: "facebook" }, ["Facebook (página)"]), el("option", { value: "instagram" }, ["Instagram (cuenta profesional)"])]);
        var pais = el("select", {}, [el("option", { value: "bolivia" }, ["Bolivia"]), el("option", { value: "paraguay" }, ["Paraguay"])]);
        var nombre = el("input", { type: "text", maxlength: 120, placeholder: "Calistenia Bolivia" });
        var token = el("input", { type: "password", maxlength: 1000, autocomplete: "off", placeholder: "Token de la página (no se vuelve a mostrar)" });
        var btn = el("button", { type: "submit", class: "lg-primario" }, ["Guardar cuenta"]);
        return el("form", { class: "rs-form", onsubmit: function (e) {
            e.preventDefault();
            var k = id.value.trim();
            if (!/^[0-9]{5,25}$/.test(k)) { avisar("El id es un número (lo da Meta en la configuración de la página o de la cuenta).", "warn"); return; }
            var previa = estado.cuentas.filter(function (c) { return c.key === k; })[0];
            if (!previa && token.value.trim().length < 20) { avisar("Para una cuenta nueva hace falta su token.", "warn"); return; }
            btn.disabled = true;
            var d = { plataforma: red.value, pais: pais.value, nombre: nombre.value.trim() || null, activa: previa ? previa.activa === true : true, auto: previa ? previa.auto === true : true, fecha_mod: ahora(), mod_por: yo() };
            var b = db().batch();
            b.set(db().collection("rs_cuenta").doc(k), d);
            if (token.value.trim()) b.set(db().collection("rs_token").doc(k), { token: token.value.trim(), fecha_mod: ahora(), mod_por: yo() });
            b.commit().then(function () { token.value = ""; id.value = ""; avisar("Cuenta guardada."); cargarCuentas(); })
                .catch(function (er) { avisar(textoError(er), "bad"); }).then(function () { btn.disabled = false; });
        } }, [el("h3", { class: "lg-h3", text: "Agregar o actualizar una cuenta" }),
            el("div", { class: "rs-fila" }, [el("label", {}, ["Id", id]), el("label", {}, ["Red", red]), el("label", {}, ["País", pais])]),
            el("div", { class: "rs-fila" }, [el("label", {}, ["Nombre", nombre]), el("label", {}, ["Token", token])]), el("div", {}, [btn])]);
    }
    function vistaConfig(cont) {
        cont.appendChild(el("div", { class: "rs-grid" }, [formConfig("bolivia"), formConfig("paraguay")]));
        var tb = el("tbody");
        if (!estado.cuentas.length) tb.appendChild(el("tr", {}, [el("td", { colspan: 5, class: "lg-vacio", text: "Sin cuentas conectadas." })]));
        estado.cuentas.forEach(function (c) {
            var interruptor = function (campo, etiqueta) {
                return el("label", { class: "rs-check" }, [el("input", { type: "checkbox", checked: c[campo] === true, onchange: function (e) {
                    var d = { plataforma: c.plataforma, pais: c.pais, nombre: c.nombre || null, activa: c.activa === true, auto: c.auto === true, fecha_mod: ahora(), mod_por: yo() };
                    d[campo] = e.target.checked;
                    db().collection("rs_cuenta").doc(c.key).set(d).then(function () { c[campo] = d[campo]; avisar("Cuenta actualizada."); }).catch(function (er) { e.target.checked = !e.target.checked; avisar(textoError(er), "bad"); });
                } }), " " + etiqueta]);
            };
            tb.appendChild(el("tr", {}, [el("td", { text: c.nombre || c.key }), el("td", { text: REDES[c.plataforma] || c.plataforma }), el("td", { text: PAISES[c.pais] || c.pais }),
                el("td", {}, [interruptor("activa", "Recibir comentarios")]), el("td", {}, [interruptor("auto", "Responder sola")])]));
        });
        cont.appendChild(el("section", { class: "rs-form" }, [el("h3", { class: "lg-h3", text: "Cuentas conectadas" }),
            el("div", { class: "lg-tablewrap" }, [el("table", { class: "lg-table" }, [el("thead", {}, [el("tr", {}, ["Cuenta", "Red", "País", "", ""].map(function (t) { return el("th", { scope: "col", text: t }); }))]), tb])])]));
        cont.appendChild(formCuenta());
    }

    function pintar() {
        pintarPestanas();
        var cont = $("#rs-contenido"); cont.textContent = "";
        ({ aprobar: vistaAprobar, tiktok: vistaTikTok, historial: vistaHistorial, config: vistaConfig }[estado.pestana] || vistaAprobar)(cont);
    }

    /* ---------- datos ---------- */
    function cargarCuentas() {
        return CMFB.util.docs(db().collection("rs_cuenta")).then(function (l) { estado.cuentas = l; if (estado.pestana === "config") pintar(); });
    }
    function escuchar() {
        estado.escuchas.forEach(function (f) { f(); }); estado.escuchas = [];
        var falla = function (e) { mensaje($("#rs-estado"), "bad", textoError(e)); };
        estado.escuchas.push(db().collection("rs_comentario").where("estado", "in", ["pendiente", "error", "borrador", "nuevo", "generando", "regenerar", "aprobado"])
            .onSnapshot(function (s) {
                estado.comentarios = s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); });
                mensaje($("#rs-estado"), "", ""); if (estado.pestana === "aprobar" || estado.pestana === "tiktok") pintar(); else pintarPestanas();
            }, falla));
        estado.escuchas.push(db().collection("rs_comentario").orderBy("fecha_on", "desc").limit(200)
            .onSnapshot(function (s) { estado.historial = s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }); if (estado.pestana === "historial") pintar(); }, falla));
    }
    function cargar() {
        mensaje($("#rs-estado"), "", "Cargando…");
        return CMFB.listo.then(function () {
            if (!CMFB.tieneRol("marketing")) throw new Error("Para usar este tablero, sal del centro de mando y vuelve a ingresar con un usuario del ERP que tenga el permiso «marketing».");
            return Promise.all(["bolivia", "paraguay"].map(function (p) { return db().collection("rs_config").doc(p).get().then(function (d) { estado.config[p] = d.exists ? d.data() : {}; }); })).then(cargarCuentas);
        }).then(function () { pintar(); escuchar(); }).catch(function (e) { mensaje($("#rs-estado"), "bad", textoError(e)); });
    }
    $("#rs-actualizar").addEventListener("click", cargar);
    cargar();
})();
