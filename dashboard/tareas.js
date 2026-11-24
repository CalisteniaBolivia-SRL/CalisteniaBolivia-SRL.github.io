/* =====================================================================================================
   Tareas de Administración (Bolivia y Paraguay, el mismo módulo; cada país con sus datos).
   - Cuatro prioridades: Urgente y tres más bajas (Alta, Media, Baja).
   - Cada tarea: título, detalle, sucursal, responsable, fecha límite, pasos con su check y «Hecha / no hecha».
   - Administración las carga y las marca; Dirección las ve, comenta, cambia la prioridad y decide.
   Firestore: adm_tarea (Paraguay: py_adm_tarea).
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay";
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
    function dif(a, b) { return Math.round((new Date(String(a).slice(0, 10) + "T00:00:00") - new Date(String(b).slice(0, 10) + "T00:00:00")) / 86400000); }
    function corta(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : "—"; }
    function cuando(s) { var d = new Date(s); return isNaN(d) ? "" : corta(s) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
    function db() { return firebase.firestore(); }
    function col() { return db().collection((PY ? "py_" : "") + "adm_tarea"); }
    function msg(t, tono) { var m = $("op-estado"); m.textContent = t || ""; m.className = "op-msg" + (tono ? " is-" + tono : ""); }
    function errTxt(e) { return e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso para esto en /centro_mando (Administración o Dirección). Si te lo dieron hace poco, salí y volvé a entrar." : (e && e.message) || String(e); }
    function chip(t, tono) { return el("span", { class: "op-chip" + (tono ? " is-" + tono : ""), text: t }); }

    var PRIO = [
        { id: "urgente", nombre: "Urgente", sub: "Hoy o lo antes posible" },
        { id: "alta", nombre: "Alta", sub: "Esta semana" },
        { id: "media", nombre: "Media", sub: "Este mes" },
        { id: "baja", nombre: "Baja", sub: "Cuando se pueda" }
    ];
    var NOMBRE_PRIO = {}; PRIO.forEach(function (p) { NOMBRE_PRIO[p.id] = p.nombre; });
    var T = { lista: [], filtro: "pendientes", suc: "", abierta: {}, editar: null, uid: "", nombre: "", esDir: false, sucursales: [] };

    function cargar() {
        return col().get().then(function (q) {
            T.lista = q.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }).filter(function (x) { return Number(x.activa == null ? 1 : x.activa) > 0; });
            if ($("op-estado").textContent === "Cargando…") msg("");
            pintar();
        }).catch(function (e) { msg("No se pudo cargar: " + errTxt(e), "bad"); });
    }
    function vencida(t) { return t.estado !== "hecha" && t.fecha_limite && t.fecha_limite < hoy(); }
    function filtradas() {
        var lim = iso(new Date(Date.now() - 30 * 86400000));
        return T.lista.filter(function (t) {
            if (T.suc && t.sucursal !== T.suc) return false;
            if (T.filtro === "pendientes") return t.estado !== "hecha";
            if (T.filtro === "hechas") return t.estado === "hecha" && String(t.fecha_hecha || "").slice(0, 10) >= lim;
            return true;
        });
    }

    /* ---------- pintar ---------- */
    function pintar() {
        var pend = T.lista.filter(function (t) { return t.estado !== "hecha"; });
        var mes = hoy().slice(0, 7);
        var k = $("tk-kpis"); k.textContent = "";
        var urg = pend.filter(function (t) { return t.prioridad === "urgente"; }).length, venc = pend.filter(vencida).length;
        var hechasMes = T.lista.filter(function (t) { return t.estado === "hecha" && String(t.fecha_hecha || "").slice(0, 7) === mes; }).length;
        var sinDecidir = pend.filter(function (t) { return t.espera_direccion; }).length;
        [["Urgentes", String(urg), "pendientes", urg ? "bad" : "ok"], ["Pendientes", String(pend.length), "en total"], ["Vencidas", String(venc), "pasó la fecha límite", venc ? "bad" : "ok"],
            ["Esperan a Dirección", String(sinDecidir), "para decidir", sinDecidir ? "warn" : ""], ["Hechas este mes", String(hechasMes), "", "ok"]].forEach(function (x) {
            k.appendChild(el("div", { class: "op-kpi" + (x[3] ? " is-" + x[3] : "") }, [el("span", { text: x[0] }), el("b", { text: x[1] }), el("small", { text: x[2] })]));
        });
        var f = $("tk-filtros"); f.textContent = "";
        var tabs = el("div", { class: "op-tabs", role: "tablist", style: "flex:1" }, [["pendientes", "Por hacer (" + pend.length + ")"], ["hechas", "Hechas (últimos 30 días)"], ["todas", "Todas"]].map(function (x) {
            return el("button", { type: "button", role: "tab", class: T.filtro === x[0] ? "is-on" : "", "aria-selected": T.filtro === x[0] ? "true" : "false", text: x[1], onclick: function () { T.filtro = x[0]; pintar(); } });
        }));
        var sucs = {}; T.lista.forEach(function (t) { if (t.sucursal) sucs[t.sucursal] = 1; });
        var sel = el("select", { "aria-label": "Sucursal", onchange: function (e) { T.suc = e.target.value; pintar(); } }, [el("option", { value: "", text: "Todas las sucursales" })].concat(Object.keys(sucs).sort().map(function (s) { return el("option", { value: s, text: s, selected: s === T.suc }); })));
        f.appendChild(tabs); f.appendChild(sel);
        var tb = $("tk-tablero"); tb.textContent = "";
        var l = filtradas();
        PRIO.forEach(function (p) {
            var de = l.filter(function (t) { return (t.prioridad || "media") === p.id; }).sort(function (a, b) {
                return (a.estado === "hecha" ? 1 : 0) - (b.estado === "hecha" ? 1 : 0) || String(a.fecha_limite || "9999").localeCompare(String(b.fecha_limite || "9999")) || String(a.fecha_on).localeCompare(String(b.fecha_on));
            });
            tb.appendChild(el("section", { class: "tk-col is-" + p.id, "aria-label": p.nombre }, [
                el("header", { class: "tk-col-top" }, [el("b", { text: p.nombre }), el("span", { text: p.sub + " · " + de.length })]),
                de.length ? el("div", { class: "tk-lista" }, de.map(tarjeta)) : el("p", { class: "op-vacio", text: T.filtro === "pendientes" ? "Nada pendiente." : "—" })
            ]));
        });
    }
    function tarjeta(t) {
        var abierta = !!T.abierta[t.key], hecha = t.estado === "hecha", pasos = t.pasos || [], pasosOk = pasos.filter(function (p) { return p.hecho; }).length;
        var check = el("input", { type: "checkbox", "aria-label": "Marcar como hecha" }); check.checked = hecha;
        check.addEventListener("change", function () { marcar(t, check.checked); });
        var dl = t.fecha_limite ? dif(t.fecha_limite, hoy()) : null;
        var meta = [t.sucursal, t.responsable ? "Responsable: " + t.responsable : null].filter(Boolean).join(" · ");
        var card = el("article", { class: "tk-card" + (hecha ? " is-hecha" : "") + (vencida(t) ? " is-vencida" : "") }, [
            el("div", { class: "tk-card-top" }, [el("label", { class: "tk-check" }, [check]),
                el("button", { type: "button", class: "tk-titulo", "aria-expanded": abierta ? "true" : "false", onclick: function () { T.abierta[t.key] = !abierta; pintar(); } }, [t.titulo])]),
            el("div", { class: "tk-meta" }, [
                meta ? el("span", { text: meta }) : null,
                t.fecha_limite && !hecha ? chip(dl < 0 ? "Venció hace " + (-dl) + (dl === -1 ? " día" : " días") : dl === 0 ? "Vence hoy" : "Vence el " + corta(t.fecha_limite), dl < 0 ? "bad" : dl <= 2 ? "warn" : "") : null,
                hecha ? chip("Hecha el " + corta(t.fecha_hecha) + (t.hecha_nombre ? " · " + t.hecha_nombre : ""), "ok") : null,
                pasos.length ? chip(pasosOk + "/" + pasos.length + " pasos", pasosOk === pasos.length ? "ok" : "") : null,
                t.espera_direccion && !hecha ? chip("Espera decisión de Dirección", "warn") : null,
                (t.notas || []).length ? chip((t.notas || []).length + ((t.notas || []).length === 1 ? " comentario" : " comentarios")) : null
            ])
        ]);
        if (abierta) card.appendChild(detalle(t));
        return card;
    }
    function detalle(t) {
        var box = el("div", { class: "tk-det" });
        if (t.detalle) box.appendChild(el("p", { class: "tk-texto", text: t.detalle }));
        /* Pasos (checklist) */
        var pasos = t.pasos || [];
        if (pasos.length) box.appendChild(el("div", { class: "tk-pasos" }, pasos.map(function (p, i) {
            var c = el("input", { type: "checkbox" }); c.checked = !!p.hecho;
            c.addEventListener("change", function () { var np = pasos.map(function (x, j) { return j === i ? Object.assign({}, x, { hecho: c.checked }) : x; }); guardarCampos(t, { pasos: np }); });
            return el("label", { class: "tk-paso" + (p.hecho ? " is-hecho" : "") }, [c, " ", p.texto]);
        })));
        /* Prioridad rápida y espera de Dirección */
        var prio = el("select", { "aria-label": "Prioridad" }, PRIO.map(function (p) { return el("option", { value: p.id, text: p.nombre, selected: p.id === (t.prioridad || "media") }); }));
        prio.addEventListener("change", function () { guardarCampos(t, { prioridad: prio.value }); });
        var espera = el("input", { type: "checkbox" }); espera.checked = !!t.espera_direccion;
        espera.addEventListener("change", function () { guardarCampos(t, { espera_direccion: espera.checked }); });
        box.appendChild(el("div", { class: "op-acc" }, [el("label", { class: "op-campo" }, ["Prioridad", prio]),
            el("label", { class: "op-acc", style: "font-size:13px;color:#D6D8DC;align-self:flex-end" }, [espera, "Espera decisión de Dirección"])]));
        /* Comentarios y decisiones */
        var notas = t.notas || [];
        box.appendChild(el("div", { class: "tk-notas" }, [el("b", { text: "Comentarios y decisiones" })].concat(notas.length ? notas.map(function (n) {
            return el("div", { class: "tk-nota" + (n.direccion ? " is-dir" : "") }, [el("span", { text: (n.quien || "") + (n.direccion ? " · Dirección" : "") + " · " + cuando(n.fecha) }), el("p", { text: n.texto })]);
        }) : [el("p", { class: "op-vacio", text: "Todavía sin comentarios." })])));
        var nueva = el("textarea", { rows: "2", maxlength: "1000", placeholder: T.esDir ? "Tu comentario o decisión (ej.: aprobado, comprar la de Bs 1.200)" : "Avance o comentario" });
        box.appendChild(nueva);
        box.appendChild(el("div", { class: "op-acc" }, [
            el("button", { type: "button", class: "op-btn", text: "Agregar comentario", onclick: function () {
                var txt = nueva.value.trim(); if (!txt) return;
                var n = { quien: T.nombre, uid: T.uid, texto: txt.slice(0, 1000), fecha: new Date().toISOString(), direccion: T.esDir };
                var cambios = { notas: firebase.firestore.FieldValue.arrayUnion(n) }; if (T.esDir && t.espera_direccion) cambios.espera_direccion = false;
                guardarCampos(t, cambios, "Comentario agregado.");
            } }),
            el("button", { type: "button", class: "op-link", text: "Editar tarea", onclick: function () { formulario(t); } }),
            el("button", { type: "button", class: "op-link", text: "Archivar", onclick: function () { if (confirm("¿Archivar «" + t.titulo + "»? Deja de verse en la lista.")) guardarCampos(t, { activa: 0 }, "Tarea archivada."); } }),
            el("span", { class: "op-muted", text: "Creada por " + (t.creado_nombre || "—") + " el " + corta(t.fecha_on) })
        ]));
        return box;
    }

    /* ---------- escritura ---------- */
    function sello() { return { fecha_edicion: new Date().toISOString(), editado_por: T.uid }; }
    function guardarCampos(t, cambios, aviso) {
        return col().doc(t.key).update(Object.assign({}, cambios, sello())).then(function () { if (aviso) msg(aviso, "ok"); return cargar(); }, function (e) { msg("No se pudo guardar: " + errTxt(e), "bad"); pintar(); });
    }
    function marcar(t, hecha) {
        var c = hecha ? { estado: "hecha", fecha_hecha: new Date().toISOString(), hecha_por: T.uid, hecha_nombre: T.nombre } : { estado: "pendiente", fecha_hecha: null, hecha_por: null, hecha_nombre: null };
        guardarCampos(t, c, hecha ? "«" + t.titulo + "» marcada como hecha." : "«" + t.titulo + "» volvió a pendiente.");
    }
    function formulario(t) {
        t = t || {};
        var f = $("tk-form"); f.textContent = ""; f.hidden = false;
        var c = {
            titulo: el("input", { value: t.titulo || "", maxlength: "160", placeholder: "Qué hay que hacer (ej.: cambiar el aire acondicionado de Berea)" }),
            prioridad: el("select", {}, PRIO.map(function (p) { return el("option", { value: p.id, text: p.nombre + " · " + p.sub, selected: p.id === (t.prioridad || "alta") }); })),
            sucursal: el("input", { value: t.sucursal || "", maxlength: "120", list: "tk-sucs", placeholder: "Todas o una sucursal" }),
            responsable: el("input", { value: t.responsable || "", maxlength: "120", placeholder: "Quién se encarga" }),
            fecha_limite: el("input", { type: "date", value: t.fecha_limite || "" }),
            detalle: el("textarea", { rows: "3", maxlength: "2000", placeholder: "Detalle (opcional)" }),
            pasos: el("textarea", { rows: "3", maxlength: "2000", placeholder: "Pasos, uno por línea (opcional). Ej.:\nPedir 3 cotizaciones\nAprobar con Dirección\nInstalar" })
        };
        c.detalle.value = t.detalle || ""; c.pasos.value = (t.pasos || []).map(function (p) { return p.texto; }).join("\n");
        var espera = el("input", { type: "checkbox" }); espera.checked = !!t.espera_direccion;
        var dl = el("datalist", { id: "tk-sucs" }, T.sucursales.map(function (s) { return el("option", { value: s }); }));
        var lbl = function (txt, x, cls) { return el("label", { class: "op-campo" + (cls ? " " + cls : "") }, [txt, x]); };
        f.appendChild(el("h2", { text: t.key ? "Editar tarea" : "Nueva tarea" }));
        f.appendChild(dl);
        f.appendChild(el("div", { class: "op-grid" }, [lbl("Tarea", c.titulo, "is-todo"), lbl("Prioridad", c.prioridad), lbl("Sucursal", c.sucursal), lbl("Responsable", c.responsable), lbl("Fecha límite", c.fecha_limite),
            lbl("Detalle", c.detalle, "is-ancho"), lbl("Pasos (checklist)", c.pasos, "is-ancho")]));
        f.appendChild(el("label", { class: "op-acc", style: "font-size:13px;color:#D6D8DC" }, [espera, "Necesita una decisión de Dirección"]));
        f.appendChild(el("div", { class: "op-acc" }, [
            el("button", { type: "button", class: "op-btn is-fuerte", text: "Guardar", onclick: function (ev) {
                var titulo = c.titulo.value.trim(); if (!titulo) { msg("Escribí qué hay que hacer.", "bad"); return; }
                var previos = {}; (t.pasos || []).forEach(function (p) { previos[p.texto] = p.hecho; });
                var d = { titulo: titulo.slice(0, 160), prioridad: c.prioridad.value, sucursal: c.sucursal.value.trim() || null, responsable: c.responsable.value.trim() || null,
                    fecha_limite: c.fecha_limite.value || null, detalle: c.detalle.value.trim() || null, espera_direccion: espera.checked,
                    pasos: c.pasos.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 30).map(function (x) { return { texto: x.slice(0, 200), hecho: !!previos[x] }; }) };
                ev.currentTarget.disabled = true;
                var p = t.key ? col().doc(t.key).update(Object.assign(d, sello()))
                    : col().add(Object.assign(d, { estado: "pendiente", activa: 1, notas: [], creado_por: T.uid, creado_nombre: T.nombre, fecha_on: new Date().toISOString() }));
                p.then(function () { f.hidden = true; msg(t.key ? "Tarea actualizada." : "Tarea creada: " + d.titulo + " (" + NOMBRE_PRIO[d.prioridad] + ").", "ok"); T.filtro = "pendientes"; return cargar(); },
                    function (e) { ev.currentTarget.disabled = false; msg("No se pudo guardar: " + errTxt(e), "bad"); });
            } }),
            el("button", { type: "button", class: "op-btn", text: "Cancelar", onclick: function () { f.hidden = true; } })
        ]));
        f.scrollIntoView({ behavior: "smooth", block: "start" }); c.titulo.focus();
    }

    /* ---------- arranque ---------- */
    $("op-eyebrow").textContent = "Calistenia Company · " + (PY ? "Paraguay" : "Bolivia") + " · Administración y Dirección";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    $("tk-nueva").addEventListener("click", function () { formulario(); });
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (!window.CMFB || !CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP para usar las tareas.", "bad"); return; }
        T.uid = CMFB.usuarioKey(); T.nombre = (window.CM_USUARIO && CM_USUARIO.nombre) || CMFB.nombre() || "";
        T.esDir = CMFB.tieneRolPais("direccion");
        CMFB.util.sucursales().then(function (l) { T.sucursales = l; }, function () {});
        cargar();
        setInterval(function () { var ae = document.activeElement; if (!document.hidden && $("tk-form").hidden && !(ae && /TEXTAREA|INPUT|SELECT/.test(ae.tagName))) cargar(); }, 60000);   // se actualiza solo cada minuto
    });
})();
