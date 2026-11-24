/* =====================================================================================================
   Mantenimiento · Calistenia Company (Bolivia y Paraguay, el mismo módulo; cada país con sus datos).
   - La persona de mantenimiento (permiso «mantenimiento» en /centro_mando del ERP), Supervisión o Administración
     elige la sucursal y recorre el checklist: cada punto «Bien», «Falla» o «No aplica»; las fallas con urgencia y nota.
   - Al guardar, la revisión queda para el administrador y cada falla abre un pendiente que se sigue hasta que se
     arregla. Además se puede mandar el reporte por WhatsApp al número que cargue Administración.
   - Administración y Dirección: reportes, fallas pendientes, sucursales sin revisar y el checklist editable.
   Firestore (Paraguay con prefijo py_): mant_config/{checklist|aviso}, mant_revision, mant_falla.
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
    function dif(a, b) { return Math.round((new Date(String(a).slice(0, 10) + "T00:00:00") - new Date(String(b).slice(0, 10) + "T00:00:00")) / 86400000); }
    function corta(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : "—"; }
    function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
    function bonito(s) { return String(s || "").trim().replace(/\s+/g, " ").split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(" "); }
    function idDe(s) { return norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || ("p" + Date.now()); }
    function db() { return firebase.firestore(); }
    function col(n) { return db().collection((PY ? "py_" : "") + n); }
    function msg(t, tono) { var m = $("op-estado"); m.textContent = t || ""; m.className = "op-msg" + (tono ? " is-" + tono : ""); }
    function errTxt(e) { return e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso para esto en /centro_mando (Mantenimiento, Supervisión o Administración). Si te lo dieron hace poco, salí y volvé a entrar." : (e && e.message) || String(e); }
    function chip(t, tono) { return el("span", { class: "op-chip" + (tono ? " is-" + tono : ""), text: t }); }
    function tabla(cols, filas, vacio, alClic) {
        if (!filas.length) return el("p", { class: "op-vacio", text: vacio });
        return el("div", { class: "op-scroll" }, [el("table", { class: "op-tabla" }, [
            el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { class: c.n ? "is-n" : "", text: c.t }); }))]),
            el("tbody", {}, filas.map(function (f) { return el("tr", { class: alClic ? "is-clic" : null, onclick: alClic ? function () { alClic(f); } : null }, cols.map(function (c) { var v = c.v(f); return el("td", { class: c.n ? "is-n" : "" }, [v == null || v === "" ? "—" : v]); })); }))
        ])]);
    }

    /* ---------- checklist por defecto (Administración lo puede editar) ---------- */
    var DEF = [
        { id: "sala", nombre: "Sala de entrenamiento", items: ["Barras de dominadas: firmes y bien fijadas", "Paralelas y barras de fondos", "Anillas, correas y ganchos", "Espalderas", "Cajones pliométricos", "Colchonetas y tapetes", "Bandas elásticas", "Pesas, discos y kettlebells", "Piso de goma (sin roturas ni partes sueltas)", "Espejos"] },
        { id: "instalaciones", nombre: "Instalaciones", items: ["Iluminación", "Ventiladores y aire acondicionado", "Enchufes y cables a la vista", "Equipo de música y parlantes", "Paredes, pintura y techo (humedad o goteras)", "Puertas y cerraduras", "Ventanas y vidrios"] },
        { id: "banos", nombre: "Baños y vestuarios", items: ["Inodoros", "Lavamanos y grifería", "Duchas y agua caliente", "Papel, jabón y toallas", "Desagües (sin tapones ni olores)", "Casilleros"] },
        { id: "recepcion", nombre: "Recepción y control", items: ["Molinete", "Lector de huella", "Computadora de caja", "Internet y WiFi", "Cámaras de seguridad", "Impresora y facturación"] },
        { id: "seguridad", nombre: "Seguridad", items: ["Extintor cargado y vigente", "Botiquín completo", "Salida de emergencia libre y señalizada", "Luces de emergencia"] },
        { id: "limpieza", nombre: "Limpieza y orden", items: ["Limpieza general de la sala", "Basureros", "Equipos ordenados en su lugar", "Bebedero o dispensador de agua"] }
    ].map(function (a) { return { id: a.id, nombre: a.nombre, items: a.items.map(function (n) { return { id: idDe(n), nombre: n }; }) }; });
    var URG = { urgente: "Urgente: no se puede usar", pronto: "Arreglar esta semana", puede_esperar: "Puede esperar" };

    /* ---------- estado ---------- */
    var M = { vista: null, checklist: DEF, aviso: {}, sucursales: [], puedeCargar: false, admin: false, nombre: "", uid: "",
        borrador: null, guardada: null, abiertas: [], resueltas: [], revisiones: [], mes: hoy().slice(0, 7), sucFiltro: "", detalle: null, areaAbierta: {} };
    var CLAVE_BORRADOR = "mant_borrador_" + PAIS;
    function guardarBorrador() { try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(M.borrador)); } catch (e) {} }
    function leerBorrador() { try { return JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null"); } catch (e) { return null; } }

    /* ---------- datos ---------- */
    function cargarConfig() {
        return Promise.all([col("mant_config").doc("checklist").get(), col("mant_config").doc("aviso").get()]).then(function (a) {
            var c = a[0].exists && a[0].data().areas;
            if (Array.isArray(c) && c.length) M.checklist = c;
            M.aviso = a[1].exists ? a[1].data() : {};
        }).catch(function () {});
    }
    function cargarFallas() {
        return Promise.all([col("mant_falla").where("estado", "==", "abierta").get(), col("mant_falla").where("estado", "==", "resuelta").get()]).then(function (a) {
            var dd = function (q) { return q.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }); };
            var orden = { urgente: 0, pronto: 1, puede_esperar: 2 };
            M.abiertas = dd(a[0]).sort(function (x, y) { return (orden[x.urgencia] || 9) - (orden[y.urgencia] || 9) || String(x.fecha).localeCompare(String(y.fecha)); });
            var lim = sumar(hoy(), -60);
            M.resueltas = dd(a[1]).filter(function (f) { return String(f.fecha_resuelta || "").slice(0, 10) >= lim; }).sort(function (x, y) { return String(y.fecha_resuelta).localeCompare(String(x.fecha_resuelta)); });
        });
    }
    function cargarRevisiones() {
        var desde = sumar(hoy(), -120) < M.mes + "-01" ? sumar(hoy(), -120) : M.mes + "-01";
        return col("mant_revision").where("fecha", ">=", desde).get().then(function (q) {
            M.revisiones = q.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }).filter(function (r) { return Number(r.estado == null ? 1 : r.estado) > 0; })
                .sort(function (x, y) { return String(y.fecha_on).localeCompare(String(x.fecha_on)); });
        });
    }
    function recargar() { return Promise.all([cargarFallas(), cargarRevisiones()]).then(function () { if ($("op-estado").textContent === "Cargando…") msg(""); pintar(); }, function (e) { msg(errTxt(e), "bad"); pintar(); }); }

    /* ---------- pestañas ---------- */
    function pestanas() {
        var t = [];
        if (M.puedeCargar) t.push(["nueva", "Nueva revisión"]);
        t.push(["fallas", "Fallas pendientes", M.abiertas.length]);
        t.push(["reportes", "Reportes"]);
        if (M.admin) t.push(["config", "Checklist y aviso"]);
        return t;
    }
    function pintar() {
        var y = window.scrollY, tabs = pestanas();
        if (!M.vista || !tabs.some(function (t) { return t[0] === M.vista; })) M.vista = tabs[0][0];
        var nav = $("mt-tabs"); nav.textContent = "";
        tabs.forEach(function (t) {
            nav.appendChild(el("button", { type: "button", role: "tab", class: M.vista === t[0] ? "is-on" : "", "aria-selected": M.vista === t[0] ? "true" : "false", onclick: function () { M.vista = t[0]; M.detalle = null; pintar(); } },
                [t[1], t[2] ? el("b", { text: String(t[2]) }) : null]));
        });
        var v = $("mt-vista"); v.textContent = "";
        if (M.vista === "nueva") v.appendChild(M.guardada ? vistaGuardada() : vistaNueva());
        else if (M.vista === "fallas") v.appendChild(vistaFallas());
        else if (M.vista === "reportes") v.appendChild(M.detalle ? vistaDetalle(M.detalle) : vistaReportes());
        else if (M.vista === "config") v.appendChild(vistaConfig());
        window.scrollTo(0, y);
    }

    /* ---------- nueva revisión ---------- */
    function nuevoBorrador(suc) { return { sucursal: suc || "", fecha: hoy(), hora_inicio: hora(), estados: {}, observaciones: "" }; }
    function contar(b) {
        var t = { total: 0, ok: 0, falla: 0, na: 0, urgentes: 0, hechos: 0 };
        M.checklist.forEach(function (a) { a.items.forEach(function (it) { t.total++; var e = b.estados[a.id + "/" + it.id]; if (!e || !e.estado) return; t.hechos++; t[e.estado]++; if (e.estado === "falla" && e.urgencia === "urgente") t.urgentes++; }); });
        return t;
    }
    function vistaNueva() {
        var box = el("div", { class: "op-card is-rojo" });
        var b = M.borrador;
        var selSuc = M.sucursales.length ? el("select", { required: true }, [el("option", { value: "", text: "Elegí la sucursal" })].concat(M.sucursales.map(function (s) { return el("option", { value: s, text: s, selected: b && s === b.sucursal }); })))
            : el("input", { placeholder: "Sucursal", maxlength: "120", value: (b && b.sucursal) || "" });
        if (!b || !b.sucursal) {
            box.appendChild(el("h2", { text: "Empezar una revisión" }));
            box.appendChild(el("p", { class: "op-muted", text: "Elegí la sucursal que vas a revisar. El avance se guarda en este equipo mientras recorrés la sucursal: si se corta el internet no se pierde." }));
            box.appendChild(el("div", { class: "op-acc" }, [el("label", { class: "op-campo" }, ["Sucursal", selSuc]),
                el("button", { type: "button", class: "op-btn is-fuerte", text: "Empezar", onclick: function () {
                    var s = bonito(selSuc.value); if (!s) { msg("Elegí la sucursal.", "bad"); return; }
                    M.borrador = nuevoBorrador(s); guardarBorrador(); msg(""); pintar(); window.scrollTo(0, 0);
                } })]));
            return box;
        }
        var t = contar(b);
        box.appendChild(el("div", { class: "op-acc", style: "justify-content:space-between" }, [
            el("h2", { text: "Revisión de " + b.sucursal + " · " + corta(b.fecha) }),
            el("button", { type: "button", class: "op-link", text: "Cambiar de sucursal o empezar de nuevo", onclick: function () { if (!confirm("¿Descartar esta revisión sin guardar?")) return; M.borrador = null; guardarBorrador(); pintar(); } })
        ]));
        var prog = el("div", { class: "mt-progreso" }, [el("span", { text: t.hechos + " de " + t.total + " revisados" }), el("i", { style: "--p:" + Math.round(t.hechos / Math.max(1, t.total) * 100) + "%" }),
            el("span", { text: t.falla ? t.falla + (t.falla === 1 ? " falla" : " fallas") : "sin fallas" })]);
        box.appendChild(prog);
        M.checklist.forEach(function (a, ia) {
            var hechosA = 0, fallasA = 0;
            a.items.forEach(function (it) { var e = b.estados[a.id + "/" + it.id]; if (e && e.estado) { hechosA++; if (e.estado === "falla") fallasA++; } });
            var abierta = M.areaAbierta[a.id] != null ? M.areaAbierta[a.id] : (ia === 0 || hechosA < a.items.length);
            var det = el("details", { class: "mt-area", open: abierta ? true : null, ontoggle: function (e) { M.areaAbierta[a.id] = e.target.open; } }, [
                el("summary", {}, [a.nombre, el("span", { class: fallasA ? "is-bad" : hechosA === a.items.length ? "is-ok" : "", text: hechosA + "/" + a.items.length + (fallasA ? " · " + fallasA + (fallasA === 1 ? " falla" : " fallas") : hechosA === a.items.length ? " · todo bien" : "") })])
            ]);
            var lista = el("div", { class: "mt-items" });
            a.items.forEach(function (it) { lista.appendChild(itemRevision(a, it)); });
            det.appendChild(lista);
            box.appendChild(det);
        });
        var obs = el("textarea", { rows: "3", maxlength: "2000", placeholder: "Observaciones generales (opcional): lo que viste, qué hace falta comprar, etc." }); obs.value = b.observaciones || "";
        obs.addEventListener("input", function () { b.observaciones = obs.value; guardarBorrador(); });
        box.appendChild(el("label", { class: "op-campo" }, ["Observaciones", obs]));
        var faltan = t.total - t.hechos;
        box.appendChild(el("div", { class: "mt-barra-fija" }, [
            el("span", { class: "op-muted", text: faltan ? "Faltan " + faltan + " puntos. Con «Marcar como Bien lo que falta» de cada área vas más rápido; después cambiás lo que tenga falla." : "Listo para guardar: " + t.ok + " bien, " + t.falla + " con falla, " + t.na + " no aplica." }),
            el("button", { type: "button", class: "op-btn is-fuerte", disabled: faltan ? true : null, text: "Guardar y enviar al administrador", onclick: function (ev) { guardarRevision(ev.currentTarget); } })
        ]));
        /* Atajo: marcar un área entera como «Bien» */
        Array.prototype.forEach.call(box.querySelectorAll(".mt-area"), function (d, i) {
            var a = M.checklist[i];
            d.appendChild(el("div", { class: "mt-item" }, [el("button", { type: "button", class: "op-link", text: "Marcar como «Bien» lo que falta de " + a.nombre.toLowerCase(), onclick: function () {
                a.items.forEach(function (it) { var k = a.id + "/" + it.id; if (!b.estados[k] || !b.estados[k].estado) b.estados[k] = { estado: "ok" }; }); guardarBorrador(); pintar();
            } })]));
        });
        return box;
    }
    function itemRevision(a, it) {
        var b = M.borrador, k = a.id + "/" + it.id, e = b.estados[k] || {};
        var poner = function (est) { var x = b.estados[k] = b.estados[k] || {}; x.estado = est; if (est === "falla" && !x.urgencia) x.urgencia = "pronto"; guardarBorrador(); pintar(); };
        var nodo = el("div", { class: "mt-item" }, [
            el("div", { class: "mt-item-top" }, [el("b", { text: it.nombre }), el("div", { class: "mt-est", role: "group", "aria-label": it.nombre }, [
                el("button", { type: "button", class: e.estado === "ok" ? "is-ok" : "", "aria-pressed": e.estado === "ok" ? "true" : "false", text: "Bien", onclick: function () { poner("ok"); } }),
                el("button", { type: "button", class: e.estado === "falla" ? "is-falla" : "", "aria-pressed": e.estado === "falla" ? "true" : "false", text: "Falla", onclick: function () { poner("falla"); } }),
                el("button", { type: "button", class: e.estado === "na" ? "is-na" : "", "aria-pressed": e.estado === "na" ? "true" : "false", text: "No aplica", onclick: function () { poner("na"); } })
            ])])
        ]);
        if (e.estado === "falla") {
            var urg = el("select", { "aria-label": "Urgencia" }, Object.keys(URG).map(function (u) { return el("option", { value: u, text: URG[u], selected: u === e.urgencia }); }));
            urg.addEventListener("change", function () { e.urgencia = urg.value; guardarBorrador(); });
            var nota = el("input", { maxlength: "500", placeholder: "¿Qué pasa? (ej.: la barra 3 se mueve, falta un tornillo)", value: e.nota || "" });
            nota.addEventListener("input", function () { e.nota = nota.value; guardarBorrador(); });
            nodo.appendChild(el("div", { class: "mt-falla" }, [urg, nota]));
        }
        return nodo;
    }
    function guardarRevision(btn) {
        var b = M.borrador, t = contar(b);
        var sinNota = [];
        M.checklist.forEach(function (a) { a.items.forEach(function (it) { var e = b.estados[a.id + "/" + it.id]; if (e && e.estado === "falla" && !String(e.nota || "").trim()) sinNota.push(it.nombre); }); });
        if (sinNota.length) { msg("Escribí qué pasa en cada falla: " + sinNota.slice(0, 3).join(", ") + (sinNota.length > 3 ? "…" : "") + ".", "bad"); return; }
        btn.disabled = true; msg("Guardando…");
        var items = [], ahora = new Date().toISOString();
        M.checklist.forEach(function (a) { a.items.forEach(function (it) { var e = b.estados[a.id + "/" + it.id] || {};
            items.push({ area: a.nombre, item: it.nombre, estado: e.estado || "na", urgencia: e.estado === "falla" ? (e.urgencia || "pronto") : null, nota: e.estado === "falla" ? String(e.nota || "").trim().slice(0, 500) : null }); }); });
        var ref = col("mant_revision").doc(), lote = db().batch();
        var rev = { pais: PAIS, sucursal: b.sucursal, fecha: b.fecha, hora_inicio: b.hora_inicio, hora_fin: hora(), items: items, total: t.total, ok: t.ok, fallas: t.falla, na: t.na, urgentes: t.urgentes,
            observaciones: String(b.observaciones || "").trim().slice(0, 2000) || null, estado: 1, registrado_por: M.uid, registrado_nombre: M.nombre, fecha_on: ahora };
        lote.set(ref, rev);
        items.filter(function (x) { return x.estado === "falla"; }).forEach(function (x) {
            lote.set(col("mant_falla").doc(), { pais: PAIS, revision: ref.id, sucursal: b.sucursal, area: x.area, item: x.item, urgencia: x.urgencia, nota: x.nota, estado: "abierta", fecha: b.fecha,
                registrado_por: M.uid, registrado_nombre: M.nombre, fecha_on: ahora });
        });
        lote.commit().then(function () {
            M.guardada = Object.assign({ key: ref.id }, rev); M.borrador = null; guardarBorrador();
            msg("Revisión guardada. Ya la ve el administrador.", "ok");
            return recargar();
        }, function (e) { btn.disabled = false; msg("No se pudo guardar: " + errTxt(e), "bad"); });
    }
    function textoReporte(r) {
        var f = (r.items || []).filter(function (x) { return x.estado === "falla"; });
        var orden = { urgente: 0, pronto: 1, puede_esperar: 2 };
        f.sort(function (a, b) { return (orden[a.urgencia] || 9) - (orden[b.urgencia] || 9); });
        var l = ["*Mantenimiento · " + r.sucursal + "*", "Revisión del " + corta(r.fecha) + " (" + (r.hora_inicio || "") + (r.hora_fin ? "–" + r.hora_fin : "") + ") · " + (r.registrado_nombre || ""),
            r.ok + " bien · " + r.fallas + (r.fallas === 1 ? " falla" : " fallas") + (r.urgentes ? " (" + r.urgentes + " urgente" + (r.urgentes === 1 ? "" : "s") + ")" : "")];
        if (f.length) { l.push(""); l.push("*Fallas:*"); f.forEach(function (x) { l.push((x.urgencia === "urgente" ? "🔴 " : x.urgencia === "pronto" ? "🟠 " : "⚪ ") + x.item + " (" + x.area + "): " + (x.nota || "")); }); }
        else { l.push(""); l.push("Todo en orden ✅"); }
        if (r.observaciones) { l.push(""); l.push("Observaciones: " + r.observaciones); }
        return l.join("\n");
    }
    function telWa(t) { var d = String(t || "").replace(/\D/g, ""); if (PY) { if (/^0\d{9}$/.test(d)) d = "595" + d.slice(1); else if (/^9\d{8}$/.test(d)) d = "595" + d; } else if (d.length === 8) d = "591" + d; return d.length >= 10 ? d : ""; }
    function botonesEnvio(r) {
        var txt = textoReporte(r), tel = telWa(M.aviso.telefono);
        return el("div", { class: "op-acc" }, [
            el("a", { class: "op-btn is-fuerte", href: "https://wa.me/" + tel + "?text=" + encodeURIComponent(txt), target: "_blank", rel: "noopener", style: "text-decoration:none" }, [tel ? "Enviar por WhatsApp a " + (M.aviso.nombre || "el administrador") : "Enviar por WhatsApp"]),
            el("button", { type: "button", class: "op-btn", text: "Copiar el reporte", onclick: function (ev) { var b = ev.currentTarget; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { b.textContent = "Copiado ✓"; }, function () { prompt("Copiá el reporte:", txt); }); } }),
            !tel ? el("span", { class: "op-muted", text: "Administración todavía no cargó su número: WhatsApp se abre para que elijas el chat." }) : null
        ]);
    }
    function vistaGuardada() {
        var r = M.guardada;
        return el("div", { class: "op-card is-rojo" }, [
            el("h2", { text: "Revisión guardada · " + r.sucursal }),
            el("p", { class: "op-muted", text: "El administrador ya la ve en «Reportes» y cada falla quedó en «Fallas pendientes» hasta que se arregle. Si querés, mandale también el resumen por WhatsApp:" }),
            el("pre", { class: "mt-resumen", text: textoReporte(r) }),
            botonesEnvio(r),
            el("div", { class: "op-acc" }, [el("button", { type: "button", class: "op-btn", text: "Revisar otra sucursal", onclick: function () { M.guardada = null; pintar(); } })])
        ]);
    }

    /* ---------- fallas pendientes ---------- */
    function puedeCerrar() { return M.admin || M.puedeCargar; }
    function vistaFallas() {
        var box = el("div", { class: "op-card" });
        var sucs = {}; M.abiertas.forEach(function (f) { sucs[f.sucursal] = (sucs[f.sucursal] || 0) + 1; });
        var sel = el("select", { onchange: function (e) { M.sucFiltro = e.target.value; pintar(); } }, [el("option", { value: "", text: "Todas las sucursales (" + M.abiertas.length + ")" })].concat(Object.keys(sucs).sort().map(function (s) { return el("option", { value: s, text: s + " (" + sucs[s] + ")", selected: s === M.sucFiltro }); })));
        box.appendChild(el("div", { class: "op-acc", style: "justify-content:space-between" }, [el("h2", { text: "Fallas pendientes" }), el("label", { class: "op-campo" }, ["Sucursal", sel])]));
        var l = M.abiertas.filter(function (f) { return !M.sucFiltro || f.sucursal === M.sucFiltro; });
        box.appendChild(tabla([
            { t: "Urgencia", v: function (f) { return chip(URG[f.urgencia] ? URG[f.urgencia].split(":")[0] : f.urgencia, f.urgencia === "urgente" ? "bad" : f.urgencia === "pronto" ? "warn" : ""); } },
            { t: "Sucursal", v: function (f) { return f.sucursal; } }, { t: "Qué", v: function (f) { return el("span", {}, [el("b", { text: f.item }), el("br"), el("small", { class: "op-muted", text: f.area })]); } },
            { t: "Detalle", v: function (f) { return f.nota; } },
            { t: "Abierta hace", n: 1, v: function (f) { var d = dif(hoy(), f.fecha); return chip(d === 0 ? "hoy" : d + (d === 1 ? " día" : " días"), d > 14 ? "bad" : d > 7 ? "warn" : ""); } },
            { t: "Reportó", v: function (f) { return f.registrado_nombre; } },
            { t: "", v: function (f) { return puedeCerrar() ? el("button", { type: "button", class: "op-btn", text: "Marcar arreglada", onclick: function (ev) { ev.stopPropagation(); cerrarFalla(f); } }) : null; } }
        ], l, "No hay fallas pendientes. 👍"));
        if (M.resueltas.length) {
            box.appendChild(el("h2", { text: "Arregladas en los últimos 60 días", style: "margin-top:10px" }));
            box.appendChild(tabla([
                { t: "Sucursal", v: function (f) { return f.sucursal; } }, { t: "Qué", v: function (f) { return f.item; } },
                { t: "Cómo se arregló", v: function (f) { return f.nota_resolucion; } },
                { t: "Tardó", n: 1, v: function (f) { var d = dif(String(f.fecha_resuelta).slice(0, 10), f.fecha); return d + (d === 1 ? " día" : " días"); } },
                { t: "Arregló", v: function (f) { return f.resuelta_nombre; } }
            ], M.resueltas.slice(0, 30), ""));
        }
        return box;
    }
    function cerrarFalla(f) {
        var n = prompt("¿Cómo se arregló «" + f.item + "» en " + f.sucursal + "? (ej.: se cambió el tornillo, vino el técnico)");
        if (n == null) return;
        col("mant_falla").doc(f.key).update({ estado: "resuelta", nota_resolucion: String(n).trim().slice(0, 500) || null, resuelta_por: M.uid, resuelta_nombre: M.nombre, fecha_resuelta: new Date().toISOString() })
            .then(function () { msg("Falla marcada como arreglada.", "ok"); return recargar(); }, function (e) { msg("No se pudo guardar: " + errTxt(e), "bad"); });
    }

    /* ---------- reportes ---------- */
    function vistaReportes() {
        var wrap = el("div", { style: "display:flex;flex-direction:column;gap:14px" });
        var rm = M.revisiones.filter(function (r) { return String(r.fecha).slice(0, 7) === M.mes; });
        var sucRevisadas = {}; rm.forEach(function (r) { sucRevisadas[r.sucursal] = 1; });
        var urgAb = M.abiertas.filter(function (f) { return f.urgencia === "urgente"; }).length;
        var tiempos = M.resueltas.map(function (f) { return dif(String(f.fecha_resuelta).slice(0, 10), f.fecha); });
        var prom = tiempos.length ? Math.round(tiempos.reduce(function (a, b) { return a + b; }, 0) / tiempos.length * 10) / 10 : null;
        var mesInp = el("input", { type: "month", value: M.mes, max: hoy().slice(0, 7) });
        mesInp.addEventListener("change", function () { if (/^\d{4}-\d{2}$/.test(mesInp.value)) { M.mes = mesInp.value; cargarRevisiones().then(pintar); } });
        wrap.appendChild(el("div", { class: "op-acc" }, [el("label", { class: "op-campo" }, ["Mes", mesInp]), el("button", { type: "button", class: "op-btn", text: "Descargar Excel (CSV)", onclick: function () { csv(rm); } })]));
        var totalSuc = M.sucursales.length || Object.keys(sucRevisadas).length;
        var k = el("div", { class: "op-kpis" });
        [["Revisiones del mes", String(rm.length), ""], ["Sucursales revisadas", Object.keys(sucRevisadas).length + (totalSuc ? " de " + totalSuc : ""), "en el mes", totalSuc && Object.keys(sucRevisadas).length < totalSuc ? "warn" : "ok"],
            ["Fallas abiertas", String(M.abiertas.length), "en todas las sucursales", M.abiertas.length ? "warn" : "ok"], ["Urgentes abiertas", String(urgAb), "no se pueden usar", urgAb ? "bad" : "ok"],
            ["Tiempo para arreglar", prom == null ? "—" : prom + " días", "promedio, últimos 60 días"]].forEach(function (x) {
            k.appendChild(el("div", { class: "op-kpi" + (x[3] ? " is-" + x[3] : "") }, [el("span", { text: x[0] }), el("b", { text: x[1] }), el("small", { text: x[2] })]));
        });
        wrap.appendChild(k);
        /* Última revisión por sucursal */
        var ult = {}; M.revisiones.forEach(function (r) { if (!ult[r.sucursal] || String(r.fecha_on) > String(ult[r.sucursal].fecha_on)) ult[r.sucursal] = r; });
        var todas = M.sucursales.slice(); Object.keys(ult).forEach(function (s) { if (todas.indexOf(s) < 0) todas.push(s); });
        var abPorSuc = {}; M.abiertas.forEach(function (f) { abPorSuc[f.sucursal] = (abPorSuc[f.sucursal] || 0) + 1; });
        var filasSuc = todas.map(function (s) { return { sucursal: s, ult: ult[s] || null, ab: abPorSuc[s] || 0 }; }).sort(function (a, b) { return (a.ult ? dif(hoy(), a.ult.fecha) : 999) < (b.ult ? dif(hoy(), b.ult.fecha) : 999) ? 1 : -1; });
        wrap.appendChild(el("div", { class: "op-card" }, [el("h2", { text: "Última revisión por sucursal" }), el("p", { class: "op-muted", text: "Lo ideal es revisar cada sucursal al menos una vez por semana." }),
            tabla([{ t: "Sucursal", v: function (f) { return f.sucursal; } },
                { t: "Última revisión", v: function (f) { if (!f.ult) return chip("Sin revisar (120 días)", "bad"); var d = dif(hoy(), f.ult.fecha); return el("span", {}, [corta(f.ult.fecha) + " ", chip(d === 0 ? "hoy" : "hace " + d + (d === 1 ? " día" : " días"), d > 14 ? "bad" : d > 7 ? "warn" : "ok")]); } },
                { t: "Revisó", v: function (f) { return f.ult ? f.ult.registrado_nombre : ""; } },
                { t: "Fallas abiertas", n: 1, v: function (f) { return f.ab ? chip(String(f.ab), "warn") : "0"; } }], filasSuc, "Todavía no hay sucursales cargadas.")]));
        wrap.appendChild(el("div", { class: "op-card" }, [el("h2", { text: "Revisiones del mes" }), el("p", { class: "op-muted", text: "Tocá una revisión para ver el detalle." }),
            tabla([{ t: "Fecha", v: function (r) { return corta(r.fecha) + " " + (r.hora_inicio || ""); } }, { t: "Sucursal", v: function (r) { return r.sucursal; } }, { t: "Revisó", v: function (r) { return r.registrado_nombre; } },
                { t: "Bien", n: 1, v: function (r) { return r.ok; } }, { t: "Fallas", n: 1, v: function (r) { return r.fallas ? chip(String(r.fallas), r.urgentes ? "bad" : "warn") : "0"; } },
                { t: "Urgentes", n: 1, v: function (r) { return r.urgentes || 0; } }], rm, "Todavía no hay revisiones en este mes.", function (r) { M.detalle = r; pintar(); window.scrollTo(0, 0); })]));
        return wrap;
    }
    function vistaDetalle(r) {
        var f = (r.items || []).filter(function (x) { return x.estado === "falla"; });
        return el("div", { class: "op-card" }, [
            el("button", { type: "button", class: "op-link", text: "← Volver a los reportes", onclick: function () { M.detalle = null; pintar(); } }),
            el("h2", { text: r.sucursal + " · " + corta(r.fecha) + " · " + (r.registrado_nombre || "") }),
            el("p", { class: "op-muted", text: r.ok + " bien · " + r.fallas + " con falla · " + r.na + " no aplica · de " + (r.hora_inicio || "") + " a " + (r.hora_fin || "") }),
            tabla([{ t: "Urgencia", v: function (x) { return chip(URG[x.urgencia] ? URG[x.urgencia].split(":")[0] : "", x.urgencia === "urgente" ? "bad" : "warn"); } }, { t: "Área", v: function (x) { return x.area; } },
                { t: "Qué", v: function (x) { return x.item; } }, { t: "Detalle", v: function (x) { return x.nota; } }], f, "Sin fallas en esta revisión."),
            r.observaciones ? el("p", { class: "op-muted", text: "Observaciones: " + r.observaciones }) : null,
            el("details", {}, [el("summary", { text: "Ver todos los puntos revisados" }), tabla([{ t: "Área", v: function (x) { return x.area; } }, { t: "Punto", v: function (x) { return x.item; } },
                { t: "Estado", v: function (x) { return chip(x.estado === "ok" ? "Bien" : x.estado === "falla" ? "Falla" : "No aplica", x.estado === "ok" ? "ok" : x.estado === "falla" ? "bad" : ""); } }], r.items || [], "")]),
            botonesEnvio(r)
        ]);
    }
    function csv(lista) {
        var q = function (v) { v = v == null ? "" : String(v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var filas = [["Fecha", "Hora", "Sucursal", "Revisó", "Área", "Punto", "Estado", "Urgencia", "Detalle"]];
        lista.forEach(function (r) { (r.items || []).forEach(function (x) { filas.push([r.fecha, r.hora_inicio, r.sucursal, r.registrado_nombre, x.area, x.item, x.estado === "ok" ? "Bien" : x.estado === "falla" ? "Falla" : "No aplica", x.urgencia ? URG[x.urgencia] : "", x.nota]); }); });
        var blob = new Blob(["﻿" + filas.map(function (r) { return r.map(q).join(";"); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = el("a", { href: URL.createObjectURL(blob), download: "mantenimiento-" + PAIS + "-" + M.mes + ".csv" });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    /* ---------- configuración (Administración) ---------- */
    function vistaConfig() {
        var wrap = el("div", { style: "display:flex;flex-direction:column;gap:14px" });
        var tel = el("input", { value: M.aviso.telefono || "", placeholder: PY ? "Ej.: 0981 123456" : "Ej.: 70012345", maxlength: "20" });
        var nom = el("input", { value: M.aviso.nombre || "", placeholder: "Ej.: Luis (administración)", maxlength: "80" });
        wrap.appendChild(el("div", { class: "op-card" }, [el("h2", { text: "A quién le llega el reporte por WhatsApp" }),
            el("p", { class: "op-muted", text: "Al terminar cada revisión aparece el botón para mandar el resumen a este número. En el centro de mando el reporte llega siempre a Administración, aunque no se mande el WhatsApp." }),
            el("div", { class: "op-grid" }, [el("label", { class: "op-campo" }, ["WhatsApp del administrador", tel]), el("label", { class: "op-campo" }, ["Nombre", nom])]),
            el("div", { class: "op-acc" }, [el("button", { type: "button", class: "op-btn is-fuerte", text: "Guardar", onclick: function () {
                var d = { telefono: tel.value.trim() || null, nombre: nom.value.trim() || null, fecha_edicion: new Date().toISOString(), editado_por: M.uid };
                col("mant_config").doc("aviso").set(d).then(function () { M.aviso = d; msg("Número guardado.", "ok"); }, function (e) { msg(errTxt(e), "bad"); });
            } })])]));
        /* Checklist editable */
        var areas = JSON.parse(JSON.stringify(M.checklist));
        var cont = el("div", { style: "display:flex;flex-direction:column;gap:10px" });
        function pintarEd() {
            cont.textContent = "";
            areas.forEach(function (a, ia) {
                var bloque = el("div", { class: "mt-edit-area" });
                var nA = el("input", { value: a.nombre, maxlength: "60", "aria-label": "Nombre del área" }); nA.addEventListener("input", function () { a.nombre = nA.value; });
                bloque.appendChild(el("div", { class: "mt-edit-item" }, [nA, el("button", { type: "button", class: "op-link", text: "Quitar área", onclick: function () { if (confirm("¿Quitar el área «" + a.nombre + "» con sus " + a.items.length + " puntos?")) { areas.splice(ia, 1); pintarEd(); } } })]));
                a.items.forEach(function (it, ii) {
                    var n = el("input", { value: it.nombre, maxlength: "120", "aria-label": "Punto a revisar" }); n.addEventListener("input", function () { it.nombre = n.value; });
                    bloque.appendChild(el("div", { class: "mt-edit-item" }, [el("span", { class: "op-muted", text: "·" }), n, el("button", { type: "button", class: "op-link", text: "Quitar", onclick: function () { a.items.splice(ii, 1); pintarEd(); } })]));
                });
                bloque.appendChild(el("button", { type: "button", class: "op-link", text: "+ Agregar punto", style: "align-self:flex-start", onclick: function () { a.items.push({ id: "p" + Date.now().toString(36), nombre: "" }); pintarEd(); var ins = bloque.parentNode && cont.querySelectorAll(".mt-edit-area")[ia].querySelectorAll("input"); if (ins && ins.length) ins[ins.length - 1].focus(); } }));
                cont.appendChild(bloque);
            });
        }
        pintarEd();
        wrap.appendChild(el("div", { class: "op-card" }, [el("h2", { text: "Checklist de mantenimiento" }),
            el("p", { class: "op-muted", text: "Los puntos que se revisan en cada sucursal. Los cambios valen para las revisiones nuevas; las ya guardadas no cambian." }), cont,
            el("div", { class: "op-acc" }, [
                el("button", { type: "button", class: "op-btn", text: "+ Agregar área", onclick: function () { areas.push({ id: "a" + Date.now().toString(36), nombre: "Nueva área", items: [] }); pintarEd(); } }),
                el("button", { type: "button", class: "op-btn is-fuerte", text: "Guardar checklist", onclick: function () {
                    var limpio = areas.map(function (a) { return { id: a.id || idDe(a.nombre), nombre: String(a.nombre || "").trim().slice(0, 60), items: a.items.filter(function (it) { return String(it.nombre || "").trim(); }).map(function (it) { return { id: it.id || idDe(it.nombre), nombre: String(it.nombre).trim().slice(0, 120) }; }) }; })
                        .filter(function (a) { return a.nombre && a.items.length; });
                    if (!limpio.length) { msg("El checklist no puede quedar vacío.", "bad"); return; }
                    col("mant_config").doc("checklist").set({ areas: limpio, fecha_edicion: new Date().toISOString(), editado_por: M.uid }).then(function () { M.checklist = limpio; msg("Checklist guardado.", "ok"); pintar(); }, function (e) { msg(errTxt(e), "bad"); });
                } }),
                el("button", { type: "button", class: "op-link", text: "Volver al checklist sugerido", onclick: function () { if (confirm("¿Volver al checklist sugerido? Se pierden los cambios que no guardaste.")) { areas = JSON.parse(JSON.stringify(DEF)); pintarEd(); } } })
            ])]));
        return wrap;
    }

    /* ---------- arranque ---------- */
    $("op-eyebrow").textContent = "Calistenia Company · " + (PY ? "Paraguay" : "Bolivia") + " · Mantenimiento";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (!window.CMFB || !CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP para usar este módulo.", "bad"); return; }
        var r = function (x) { return CMFB.tieneRolPais(x); };
        M.admin = r("administracion") || r("direccion");
        M.puedeCargar = r("mantenimiento") || r("administracion") || r("supervision");
        M.uid = CMFB.usuarioKey(); M.nombre = (window.CM_USUARIO && CM_USUARIO.nombre) || CMFB.nombre() || "";
        M.borrador = leerBorrador();
        msg("Cargando…");
        Promise.all([cargarConfig(), CMFB.util.sucursales().then(function (l) { M.sucursales = l; }, function () {})]).then(recargar);
    });
})();
