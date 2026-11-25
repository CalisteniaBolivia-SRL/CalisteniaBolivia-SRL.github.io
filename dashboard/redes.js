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
    var TEMA = { precios_planes: "Precios y planes", horarios: "Horarios", inscripcion_prueba: "Inscripción / prueba", ubicacion_sucursales: "Ubicación",
        clases_entrenamiento: "Clases y entrenamiento", pagos_cobros: "Pagos y cobros", quejas: "Quejas", lesiones_salud: "Lesiones y salud",
        felicitaciones: "Felicitaciones", empleo: "Empleo", alianzas_publicidad: "Alianzas y publicidad", otro: "Otro" };
    var ATENCION = { por_atender: "Por atender", en_curso: "En curso", bot: "Respondió el bot", atendido: "Atendida", no_requiere: "No requiere" };
    var TONO_AT = { por_atender: "bad", en_curso: "warn", bot: "ok", atendido: "ok", no_requiere: "muted" };
    var RED_DM = { messenger: "Messenger", instagram_dm: "Instagram" };
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

    var estado = { pestana: "conversaciones", pais: "", comentarios: [], historial: [], config: {}, cuentas: [], escuchas: [], meta: {},
        convs: [], sel: null, mensajes: [], escuchaSel: null, f: { estado: "abiertas", tema: "", red: "", mias: false, q: "" }, temaHist: "", borradores: {} };
    try { estado.pestana = localStorage.getItem("rs_pestana") || "conversaciones"; } catch (e) {}
    /* Desde el portal de un país (Capital Corp → Calistenia Company → país) se abre filtrado por ese país. */
    var mPais = /[?&]pais=(bolivia|paraguay)\b/.exec(location.search);
    if (mPais) estado.pais = mPais[1];
    /* Vuelta desde Instagram (conexión directa): se muestra el resultado en Configuración. */
    var mIg = /[?&]ig=(ok|error|sin_avisos|sin_ig)\b/.exec(location.search);
    if (mIg) {
        var qp = new URLSearchParams(location.search);
        estado.pestana = "config";
        estado.igAviso = mIg[1] === "ok" ? ["ok", "Instagram conectado: " + (qp.get("cuenta") || "") + ". Desde ahora se responden solos sus comentarios y mensajes."]
            : mIg[1] === "sin_ig" ? ["warn", "Se conectó " + (qp.get("cuenta") || "la página") + ", pero no tiene un Instagram profesional vinculado. En Instagram: Configuración → Cuenta → Compartir en otras apps / Página vinculada, vinculá la página y volvé a tocar «Conectar Instagram»."]
            : mIg[1] === "sin_avisos" ? ["warn", "Instagram " + (qp.get("cuenta") || "") + " quedó conectado, pero Instagram no aceptó la suscripción a los avisos. Revisá que en la app de Meta estén configurados los Webhooks de Instagram y volvé a tocar «Conectar Instagram»."]
            : ["bad", "No se pudo conectar Instagram: " + (qp.get("motivo") || "error")];
        try { history.replaceState(null, "", location.pathname + (estado.pais ? "?pais=" + estado.pais : "") + "#config"); } catch (e) {}
    }

    /* ---------- pestañas ---------- */
    var PESTANAS = [["conversaciones", "Conversaciones"], ["aprobar", "Comentarios por aprobar"], ["tiktok", "TikTok"], ["historial", "Historial de comentarios"], ["config", "Configuración"]];
    function pintarPestanas() {
        var nav = $("#rs-tabs"); nav.textContent = "";
        PESTANAS.forEach(function (p) {
            var n = p[0] === "conversaciones" ? estado.convs.filter(function (c) { return c.estado_atencion === "por_atender"; }).length : p[0] === "aprobar" ? estado.comentarios.filter(function (c) { return c.plataforma !== "tiktok" && (c.estado === "pendiente" || c.estado === "error"); }).length
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
                c.categoria ? chip(c.categoria === "delicado" || c.categoria === "critica" ? "bad" : "ok", CAT[c.categoria] || c.categoria) : null, c.tema ? chip("muted", TEMA[c.tema] || c.tema) : null, el("span", { class: "lg-muted rs-fecha", text: fechaHora(c.fecha_on) })]),
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
        cont.appendChild(el("div", { class: "rs-barra" }, [filtroPais(), el("label", {}, ["Tema", el("select", { onchange: function (e) { estado.temaHist = e.target.value; pintar(); } },
            [["", "Todos"]].concat(Object.keys(TEMA).map(function (k) { return [k, TEMA[k]]; })).map(function (o) { return el("option", { value: o[0], selected: estado.temaHist === o[0] }, [o[1]]); }))])]));
        var l = estado.historial.filter(delPais).filter(function (c) { return !estado.temaHist || c.tema === estado.temaHist; });
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
                el("td", {}, [el("b", { text: (c.autor || "—") + ": " }), c.texto || ""]), el("td", { text: (CAT[c.categoria] || "—") + (c.tema ? " · " + (TEMA[c.tema] || c.tema) : "") }),
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
            el("label", { class: "rs-check" }, [auto, " Responder solos comentarios y mensajes directos (lo delicado siempre espera a una persona)"]),
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
        cont.appendChild(seccionInstagram());
        cont.appendChild(el("details", { class: "rs-form" }, [el("summary", { text: "Facebook (necesita la página y su portafolio comercial)" }), seccionConectar()]));
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
            tb.appendChild(el("tr", {}, [el("td", { text: c.nombre || c.key }), el("td", { text: (REDES[c.plataforma] || c.plataforma) + (c.conexion === "instagram_directo" ? " (directo)" : "") }), el("td", { text: PAISES[c.pais] || c.pais }),
                el("td", {}, [interruptor("activa", "Recibir comentarios y mensajes")]), el("td", {}, [interruptor("auto", "Responder sola")])]));
        });
        cont.appendChild(el("section", { class: "rs-form" }, [el("h3", { class: "lg-h3", text: "Cuentas conectadas" }),
            el("div", { class: "lg-tablewrap" }, [el("table", { class: "lg-table" }, [el("thead", {}, [el("tr", {}, ["Cuenta", "Red", "País", "", ""].map(function (t) { return el("th", { scope: "col", text: t }); }))]), tb])])]));
        cont.appendChild(el("details", { class: "rs-form" }, [el("summary", { text: "Avanzado: cargar una cuenta a mano con su token" }), formCuenta()]));
    }

    /* ---------- Conectar con Facebook (páginas e Instagram) ---------- */
    var PERMISOS_META = "pages_show_list,pages_read_engagement,pages_manage_engagement,pages_read_user_content,pages_manage_metadata,pages_messaging,instagram_basic,instagram_manage_comments,instagram_manage_messages,business_management";
    function cargarSdkFacebook(appId) {
        if (window.FB) return Promise.resolve(window.FB);
        return new Promise(function (ok, mal) {
            window.fbAsyncInit = function () { window.FB.init({ appId: appId, version: "v21.0", xfbml: false, cookie: false }); ok(window.FB); };
            var sc = document.createElement("script"); sc.src = "https://connect.facebook.net/es_LA/sdk.js"; sc.async = true; sc.crossOrigin = "anonymous";
            sc.onerror = function () { mal(new Error("No se pudo cargar el inicio de sesión de Facebook (revisa la conexión o un bloqueador de anuncios).")); };
            document.head.appendChild(sc);
        });
    }
    /* ---------- Conectar Instagram directo (sin página de Facebook ni portafolio) ---------- */
    var PUENTE_IG = window.CM_IG_PUENTE || ("https://southamerica-east1-" + ((window.CM_FIREBASE_CONFIG && window.CM_FIREBASE_CONFIG.projectId) || "centro-de-comando-a57cf") + ".cloudfunctions.net/igConectar");
    function seccionInstagram() {
        var pais = el("select", {}, [el("option", { value: "bolivia" }, ["Bolivia"]), el("option", { value: "paraguay" }, ["Paraguay"])]);
        if (estado.pais) pais.value = estado.pais;
        var res = el("p", { class: "lg-muted", "aria-live": "polite" });
        var btn = el("button", { type: "button", class: "rs-ig" }, ["Conectar Instagram"]);
        btn.onclick = function () {
            btn.disabled = true; res.textContent = "Abriendo Facebook…";
            var u = window.firebase && firebase.auth().currentUser;
            (u ? u.getIdToken() : Promise.reject(new Error("Tu sesión venció: salí y volvé a entrar con tu usuario del ERP."))).then(function (t) {
                return fetch(PUENTE_IG, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ pais: pais.value }) });
            }).then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.url) throw new Error(j.error || "No se pudo abrir la conexión (" + r.status + ")."); return j.url; }); })
                .then(function (url) { location.href = url; })
                .catch(function (e) { res.textContent = textoError(e); btn.disabled = false; });
        };
        /* Webhooks de Meta: los registra el servidor con sus claves (el token de verificación no pasa por el navegador). */
        var resAv = el("p", { class: "lg-muted", "aria-live": "polite" });
        var btnAv = el("button", { type: "button", class: "lg-btn" }, ["Activar avisos de Meta"]);
        btnAv.onclick = function () {
            btnAv.disabled = true; resAv.textContent = "Registrando los avisos en Meta…";
            var u = window.firebase && firebase.auth().currentUser;
            (u ? u.getIdToken() : Promise.reject(new Error("Tu sesión venció: salí y volvé a entrar con tu usuario del ERP."))).then(function (t) {
                return fetch(PUENTE_IG, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ accion: "avisos", pais: pais.value }) });
            }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; }); }).then(function (j) {
                var nom = { instagram: "Instagram", page: "Página de Facebook" };
                resAv.textContent = (j.resultados || []).map(function (x) { return (nom[x.objeto] || x.objeto) + ": " + (x.ok ? "activo (" + x.campos + ")" : "no se pudo — " + x.error); }).join(" · ");
            }).catch(function (e) { resAv.textContent = textoError(e); }).then(function () { btnAv.disabled = false; });
        };
        var directas = estado.cuentas.filter(function (c) { return c.plataforma === "instagram"; });
        return el("section", { class: "rs-form rs-conectar is-ig" }, [
            el("h3", { class: "lg-h3", text: "Conectar Instagram" }),
            el("p", { class: "lg-muted", text: "Tocá el botón, entrá con el usuario de Facebook que administra la página vinculada al Instagram de la empresa y aceptá los permisos (elegí la página y su Instagram). Desde ese momento se responden solos los comentarios y mensajes directos. No hace falta portafolio comercial." }),
            el("div", { class: "rs-fila" }, [el("label", {}, ["País de esta cuenta", pais]), el("div", { class: "rs-fb-wrap" }, [btn])]),
            res,
            el("div", { class: "rs-fila" }, [el("p", { class: "lg-muted", text: "Una sola vez (o si Meta deja de avisar): registra en Meta la dirección donde llegan los comentarios y mensajes." }), el("div", { class: "rs-fb-wrap" }, [btnAv])]),
            resAv,
            directas.length ? el("p", { class: "lg-muted", text: "Instagram conectados: " + directas.map(function (c) { return c.nombre + " (" + (PAISES[c.pais] || c.pais) + ")"; }).join(", ") + ". Si cambian la contraseña de Facebook o quitan los permisos, vuelvan a tocar «Conectar Instagram»." }) : null
        ]);
    }
    function seccionConectar() {
        var appId = estado.meta.app_id || "";
        var pais = el("select", {}, [el("option", { value: "bolivia" }, ["Bolivia"]), el("option", { value: "paraguay" }, ["Paraguay"])]);
        if (estado.pais) pais.value = estado.pais;
        var res = el("p", { class: "lg-muted", "aria-live": "polite" });
        var btn = el("button", { type: "button", class: "rs-fb", disabled: !appId }, ["Conectar con Facebook"]);
        btn.onclick = function () {
            btn.disabled = true; res.textContent = "Abriendo Facebook…";
            cargarSdkFacebook(appId).then(function (FB) {
                return new Promise(function (ok, mal) {
                    FB.login(function (r) { if (r && r.authResponse && r.authResponse.accessToken) ok(r.authResponse.accessToken); else mal(new Error("Se canceló el ingreso a Facebook.")); },
                        { scope: PERMISOS_META, auth_type: "rerequest", return_scopes: true });
                });
            }).then(function (tok) {
                res.textContent = "Conectando las páginas…";
                var ref = db().collection("rs_vinculo").doc();
                return ref.set({ user_token: tok, pais: pais.value, paginas: [], creado_por: yo(), fecha: ahora(), estado: "nuevo" }).then(function () {
                    return new Promise(function (ok) {
                        var fin = setTimeout(function () { quitar(); ok({ estado: "espera" }); }, 60000);
                        var quitar = ref.onSnapshot(function (d) { var v = d.data() || {}; if (v.estado && v.estado !== "nuevo") { clearTimeout(fin); quitar(); ok(v); } });
                    });
                });
            }).then(function (v) {
                if (v.estado === "conectado") { res.textContent = "Conectadas: " + v.cuentas.map(function (c) { return c.nombre + " (" + (REDES[c.red] || c.red) + ")"; }).join(", ") + "."; avisar("Cuentas conectadas."); cargarCuentas(); }
                else if (v.estado === "espera") res.textContent = "Facebook respondió, pero el servidor todavía no terminó: revisa en un minuto la lista de cuentas.";
                else res.textContent = "No se pudo conectar: " + (v.error || "error");
            }).catch(function (e) { res.textContent = textoError(e); }).then(function () { btn.disabled = !appId; });
        };
        var inApp = el("input", { type: "text", inputmode: "numeric", maxlength: 25, value: appId, placeholder: "Id de la app de Meta" });
        var guardar = el("button", { type: "button", class: "lg-btn" }, ["Guardar"]);
        guardar.onclick = function () {
            var v = inApp.value.trim();
            if (!/^[0-9]{5,25}$/.test(v)) { avisar("El id de la app de Meta es un número (developers.facebook.com → tu app → Configuración básica).", "warn"); return; }
            db().collection("rs_config").doc("meta").set({ app_id: v, fecha_mod: ahora(), mod_por: yo() }).then(function () { estado.meta.app_id = v; avisar("App de Meta guardada."); pintar(); }).catch(function (e) { avisar(textoError(e), "bad"); });
        };
        return el("section", { class: "rs-form rs-conectar" }, [
            el("h3", { class: "lg-h3", text: "Conectar Facebook e Instagram" }),
            el("p", { class: "lg-muted", text: "Entra con el usuario de Facebook que administra las páginas. Se conectan las páginas que elijas y sus cuentas de Instagram profesionales: desde ese momento se responden solos los comentarios y los mensajes directos." }),
            el("div", { class: "rs-fila" }, [el("label", {}, ["País de estas cuentas", pais]), el("div", { class: "rs-fb-wrap" }, [btn])]),
            res,
            el("details", {}, [el("summary", { text: appId ? "App de Meta: " + appId : "Falta la app de Meta (una sola vez)" }),
                el("p", { class: "lg-muted", text: "En developers.facebook.com crea una app de tipo «Empresa», agrega «Inicio de sesión con Facebook para empresas», «Messenger», «Instagram» y «Webhooks», y pon aquí su id. Los pasos completos están en el documento del módulo." }),
                el("div", { class: "rs-fila" }, [el("label", {}, ["Id de la app", inApp]), el("div", { class: "rs-fb-wrap" }, [guardar])])])
        ]);
    }

    /* ================= CRM de conversaciones ================= */
    function abiertas(c) { return c.estado_atencion === "por_atender" || c.estado_atencion === "en_curso"; }
    function pasaFiltro(c, sinTema) {
        var f = estado.f;
        if (!delPais(c)) return false;
        if (f.estado === "abiertas" && !abiertas(c)) return false;
        if (f.estado && f.estado !== "abiertas" && f.estado !== "todas" && c.estado_atencion !== f.estado) return false;
        if (!sinTema && f.tema && c.tema !== f.tema && (c.temas || []).indexOf(f.tema) < 0) return false;
        if (f.red && c.plataforma !== f.red) return false;
        if (f.mias && c.asignado_a !== yo()) return false;
        if (f.q) { var q = f.q.toLowerCase(); if (String(c.usuario_nombre || "").toLowerCase().indexOf(q) < 0 && String(c.ultimo_texto || "").toLowerCase().indexOf(q) < 0) return false; }
        return true;
    }
    function actualizarConv(c, cambios, ok) {
        var d = Object.assign({ mod_por: yo(), fecha_mod: ahora() }, cambios);
        return db().collection("rs_conversacion").doc(c.key).update(d).then(function () { if (ok) avisar(ok); }).catch(function (e) { avisar(textoError(e), "bad"); });
    }
    function abrirConv(c) {
        estado.sel = c.key; estado.mensajes = [];
        if (estado.escuchaSel) estado.escuchaSel();
        estado.escuchaSel = db().collection("rs_mensaje").where("conversacion", "==", c.key).onSnapshot(function (s) {
            estado.mensajes = s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
            if (estado.pestana === "conversaciones") pintarDetalle();
        }, function (e) { avisar(textoError(e), "bad"); });
        if (c.no_leidos) actualizarConv(c, { no_leidos: 0 });
        pintar();
    }
    function vistaConversaciones(cont) {
        var l = estado.convs.filter(function (c) { return pasaFiltro(c); });
        var hoy = new Date(Date.now() - 864e5).toISOString();
        var todas = estado.convs.filter(delPais);
        cont.appendChild(el("div", { class: "lg-kpis" }, [
            ["Por atender", todas.filter(function (c) { return c.estado_atencion === "por_atender"; }).length, "esperan a una persona", "bad"],
            ["En curso", todas.filter(function (c) { return c.estado_atencion === "en_curso"; }).length, "las atiende alguien del equipo"],
            ["Respondió el bot", todas.filter(function (c) { return c.estado_atencion === "bot" && String(c.fecha_ultimo) >= hoy; }).length, "últimas 24 horas"],
            ["Conversaciones", todas.length, "últimas 300"]
        ].map(function (k) { return el("article", { class: "lg-kpi" + (k[3] && k[1] ? " is-" + k[3] : "") }, [el("h3", { text: k[0] }), el("p", { class: "lg-kpi-v", text: String(k[1]) }), el("p", { class: "lg-kpi-s", text: k[2] })]); })));
        var f = estado.f;
        var sel = function (etq, campo, ops) { return el("label", {}, [etq, el("select", { onchange: function (e) { f[campo] = e.target.value; pintar(); } }, ops.map(function (o) { return el("option", { value: o[0], selected: f[campo] === o[0] }, [o[1]]); }))]); };
        var buscar = el("input", { type: "search", id: "rs-buscar", placeholder: "Nombre o texto", value: f.q });
        buscar.addEventListener("input", function () {
            f.q = buscar.value.trim(); clearTimeout(estado.tBuscar);
            estado.tBuscar = setTimeout(function () { pintar(); var b = document.getElementById("rs-buscar"); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }, 300);
        });
        cont.appendChild(el("div", { class: "rs-barra" }, [
            sel("Estado", "estado", [["abiertas", "Abiertas (por atender y en curso)"], ["por_atender", "Por atender"], ["en_curso", "En curso"], ["bot", "Respondió el bot"], ["atendido", "Atendidas"], ["no_requiere", "No requiere"], ["todas", "Todas"]]),
            sel("Red", "red", [["", "Todas"], ["messenger", "Messenger"], ["instagram_dm", "Instagram"]]), filtroPais(),
            el("label", {}, ["Buscar", buscar]),
            el("label", { class: "rs-check" }, [el("input", { type: "checkbox", checked: f.mias, onchange: function (e) { f.mias = e.target.checked; pintar(); } }), " Solo las mías"])
        ]));
        /* Temas con su cantidad (según los demás filtros) para ver de un vistazo de qué se habla. */
        var cuenta = {}; estado.convs.filter(function (c) { return pasaFiltro(c, true); }).forEach(function (c) { var t = c.tema || "otro"; cuenta[t] = (cuenta[t] || 0) + 1; });
        cont.appendChild(el("div", { class: "rs-temas", role: "group", "aria-label": "Filtrar por tema" }, [el("button", { type: "button", class: "rs-tema" + (!f.tema ? " is-on" : ""), onclick: function () { f.tema = ""; pintar(); } }, ["Todos los temas"])]
            .concat(Object.keys(TEMA).filter(function (k) { return cuenta[k]; }).map(function (k) {
                return el("button", { type: "button", class: "rs-tema" + (f.tema === k ? " is-on" : "") + (k === "quejas" || k === "lesiones_salud" || k === "pagos_cobros" ? " is-alerta" : ""), onclick: function () { f.tema = f.tema === k ? "" : k; pintar(); } }, [TEMA[k] + " · " + cuenta[k]]);
            }))));
        var lista = el("div", { class: "rs-lista-conv", role: "list" });
        if (!l.length) lista.appendChild(el("p", { class: "lg-vacio rs-vacio", text: estado.convs.length ? "No hay conversaciones con estos filtros." : "Todavía no hay conversaciones. Aparecen aquí cuando alguien escribe por Messenger o Instagram a una cuenta conectada." }));
        l.sort(function (a, b) { var pa = a.estado_atencion === "por_atender" ? 0 : a.estado_atencion === "en_curso" ? 1 : 2, pb = b.estado_atencion === "por_atender" ? 0 : b.estado_atencion === "en_curso" ? 1 : 2; return pa - pb || String(b.fecha_ultimo).localeCompare(String(a.fecha_ultimo)); });
        l.forEach(function (c) {
            lista.appendChild(el("button", { type: "button", role: "listitem", class: "rs-conv" + (estado.sel === c.key ? " is-sel" : "") + (c.estado_atencion === "por_atender" ? " is-urgente" : ""), onclick: function () { abrirConv(c); } }, [
                el("span", { class: "rs-conv-cab" }, [el("b", { text: c.usuario_nombre || "Cliente" }), c.no_leidos ? el("span", { class: "rs-badge", text: String(c.no_leidos) }) : null, el("span", { class: "lg-muted rs-fecha", text: fechaHora(c.fecha_ultimo) })]),
                el("span", { class: "rs-conv-txt", text: (c.ultimo_de === "cliente" ? "" : c.ultimo_de === "bot" ? "Bot: " : "Equipo: ") + (c.ultimo_texto || "") }),
                el("span", { class: "rs-cab" }, [chip(TONO_AT[c.estado_atencion] || "muted", ATENCION[c.estado_atencion] || c.estado_atencion), chip("muted", TEMA[c.tema] || "Otro"), chip("muted", RED_DM[c.plataforma] || c.plataforma),
                    c.asignado_nombre ? el("span", { class: "lg-muted", text: "→ " + c.asignado_nombre }) : null, c.bot === "pausado" ? el("span", { class: "lg-muted", text: "bot en pausa" }) : null])
            ]));
        });
        cont.appendChild(el("div", { class: "rs-crm" }, [lista, el("section", { class: "rs-detalle", id: "rs-detalle", "aria-live": "polite" })]));
        pintarDetalle();
    }
    function pintarDetalle() {
        var box = document.getElementById("rs-detalle"); if (!box) return;
        box.textContent = "";
        var c = estado.convs.filter(function (x) { return x.key === estado.sel; })[0];
        if (!c) { box.appendChild(el("p", { class: "lg-muted rs-vacio", text: "Elige una conversación para ver los mensajes y responder." })); return; }
        var temaSel = el("select", { "aria-label": "Tema", onchange: function (e) { actualizarConv(c, { tema: e.target.value }, "Tema cambiado."); } },
            Object.keys(TEMA).map(function (k) { return el("option", { value: k, selected: c.tema === k }, [TEMA[k]]); }));
        var acc = [];
        if (c.asignado_a !== yo() || c.estado_atencion !== "en_curso") acc.push(el("button", { type: "button", class: "lg-primario", onclick: function () { actualizarConv(c, { asignado_a: yo(), asignado_nombre: CMFB.nombre() || "Yo", estado_atencion: "en_curso", bot: "pausado" }, "La tomaste: el bot queda en pausa en esta conversación."); } }, ["Tomar conversación"]));
        if (c.estado_atencion !== "atendido") acc.push(el("button", { type: "button", class: "lg-btn lg-btn-fuerte", onclick: function () { actualizarConv(c, { estado_atencion: "atendido", no_leidos: 0 }, "Marcada como atendida."); } }, ["Marcar atendida"]));
        if (c.estado_atencion !== "no_requiere") acc.push(el("button", { type: "button", class: "lg-btn", onclick: function () { actualizarConv(c, { estado_atencion: "no_requiere", no_leidos: 0 }, "Marcada: no requiere atención."); } }, ["No requiere"]));
        acc.push(c.bot === "pausado"
            ? el("button", { type: "button", class: "lg-btn", onclick: function () { actualizarConv(c, { bot: "activo", estado_atencion: "bot", asignado_a: null, asignado_nombre: null }, "El bot vuelve a responder esta conversación."); } }, ["Devolver al bot"])
            : el("button", { type: "button", class: "lg-btn", onclick: function () { actualizarConv(c, { bot: "pausado" }, "Bot en pausa en esta conversación."); } }, ["Pausar bot"]));
        box.appendChild(el("div", { class: "rs-det-cab" }, [
            el("div", {}, [el("h3", { class: "lg-h3", text: c.usuario_nombre || "Cliente" }), el("p", { class: "lg-muted", text: [RED_DM[c.plataforma], c.cuenta_nombre, PAISES[c.pais]].filter(Boolean).join(" · ") })]),
            el("label", {}, ["Tema", temaSel])
        ]));
        box.appendChild(el("div", { class: "rs-cab" }, [chip(TONO_AT[c.estado_atencion] || "muted", ATENCION[c.estado_atencion] || ""), c.asignado_nombre ? el("span", { class: "lg-muted", text: "Asignada a " + c.asignado_nombre }) : null, el("span", { class: "lg-muted", text: c.bot === "pausado" ? "Bot en pausa" : "Bot activo" })]));
        if (c.motivo && c.estado_atencion === "por_atender") box.appendChild(el("p", { class: "rs-nota-det", text: "Por qué necesita a una persona: " + c.motivo }));
        box.appendChild(el("div", { class: "rs-acc" }, acc));
        var hilo = el("div", { class: "rs-hilo" });
        estado.mensajes.forEach(function (m) {
            hilo.appendChild(el("div", { class: "rs-msj rs-msj-" + (m.de || "cliente") }, [
                el("span", { class: "rs-msj-quien", text: (m.de === "cliente" ? (c.usuario_nombre || "Cliente") : m.de === "bot" ? "Bot" : (m.autor_nombre || "Equipo")) + " · " + fechaHora(m.fecha) }),
                el("span", { class: "rs-msj-txt", text: m.texto || "" }),
                m.estado_envio === "pendiente" ? el("span", { class: "lg-muted", text: "Enviando…" }) : null,
                m.estado_envio === "error" ? el("span", { class: "rs-msj-error", text: "No se envió: " + (m.error || "error") }) : null
            ]));
        });
        box.appendChild(hilo);
        setTimeout(function () { hilo.scrollTop = hilo.scrollHeight; }, 0);
        var area = el("textarea", { rows: 3, maxlength: 1000, placeholder: "Escribe tu respuesta (al enviar, el bot queda en pausa en esta conversación)", "aria-label": "Respuesta" });
        area.value = estado.borradores[c.key] || "";
        area.addEventListener("input", function () { estado.borradores[c.key] = area.value; });
        var enviar = el("button", { type: "submit", class: "lg-primario" }, ["Enviar"]);
        var form = el("form", { class: "rs-responder", onsubmit: function (e) {
            e.preventDefault();
            var t = area.value.trim(); if (!t) return;
            enviar.disabled = true;
            db().collection("rs_mensaje").add({ conversacion: c.key, de: "personal", texto: t, fecha: ahora(), autor: yo(), autor_nombre: CMFB.nombre() || null, estado_envio: "pendiente" })
                .then(function () {
                    area.value = ""; delete estado.borradores[c.key];
                    if (!c.asignado_a) return actualizarConv(c, { asignado_a: yo(), asignado_nombre: CMFB.nombre() || "Yo", estado_atencion: "en_curso", bot: "pausado" });
                }).catch(function (er) { avisar(textoError(er), "bad"); }).then(function () { enviar.disabled = false; });
        } }, [area, el("div", { class: "rs-acc" }, [enviar,
            c.sugerencia ? el("button", { type: "button", class: "lg-btn", onclick: function () { area.value = c.sugerencia; area.focus(); } }, ["Usar la sugerencia del bot"]) : null])]);
        box.appendChild(form);
        var nota = el("textarea", { rows: 2, maxlength: 2000, placeholder: "Nota interna para el equipo (el cliente no la ve)" }); nota.value = c.nota || "";
        box.appendChild(el("div", { class: "rs-nota-int" }, [el("label", {}, ["Nota interna", nota]), el("button", { type: "button", class: "lg-btn", onclick: function () { actualizarConv(c, { nota: nota.value.trim() || null }, "Nota guardada."); } }, ["Guardar nota"])]));
    }

    function pintar() {
        pintarPestanas();
        var cont = $("#rs-contenido"); cont.textContent = "";
        ({ conversaciones: vistaConversaciones, aprobar: vistaAprobar, tiktok: vistaTikTok, historial: vistaHistorial, config: vistaConfig }[estado.pestana] || vistaConversaciones)(cont);
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
        estado.escuchas.push(db().collection("rs_conversacion").orderBy("fecha_ultimo", "desc").limit(300).onSnapshot(function (s) {
            estado.convs = s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); });
            /* No se repinta mientras alguien escribe una respuesta o una nota (para no borrarle el texto). */
            var escribiendo = document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName) && raiz.contains(document.activeElement);
            if (estado.pestana === "conversaciones" && !escribiendo) pintar(); else pintarPestanas();
        }, falla));
        estado.escuchas.push(db().collection("rs_comentario").orderBy("fecha_on", "desc").limit(200)
            .onSnapshot(function (s) { estado.historial = s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }); if (estado.pestana === "historial") pintar(); }, falla));
    }
    function cargar() {
        mensaje($("#rs-estado"), "", "Cargando…");
        return CMFB.listo.then(function () {
            if (!CMFB.tieneRol("marketing")) throw new Error("Para usar este tablero, sal del centro de mando y vuelve a ingresar con un usuario del ERP que tenga el permiso «marketing».");
            return Promise.all(["bolivia", "paraguay", "meta"].map(function (p) { return db().collection("rs_config").doc(p).get().then(function (d) { if (p === "meta") estado.meta = d.exists ? d.data() : {}; else estado.config[p] = d.exists ? d.data() : {}; }); })).then(cargarCuentas);
        }).then(function () { pintar(); escuchar(); if (estado.igAviso) { var a = estado.igAviso; estado.igAviso = null; mensaje($("#rs-aviso"), a[0], a[1]); } }).catch(function (e) { mensaje($("#rs-estado"), "bad", textoError(e)); });
    }
    $("#rs-actualizar").addEventListener("click", cargar);
    cargar();
})();
