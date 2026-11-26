/* =====================================================================================================
   Cobros QR · tablero (Administración y Dirección). Bolivia y Paraguay (?pais=paraguay), cada uno con lo suyo.
   Cargar, cambiar o pausar el QR general, el de cada canal y el de cada sucursal; abrir la pantalla de caja.
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay", Q = window.COBRO_QR;
    var $ = function (id) { return document.getElementById(id); };
    function el(tag, attrs, hijos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            var v = attrs[k];
            if (k === "text") e.textContent = v; else if (k === "class") e.className = v;
            else if (k.indexOf("on") === 0 && typeof v === "function") e.addEventListener(k.slice(2), v);
            else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
        });
        (hijos || []).forEach(function (h) { if (h != null && h !== false) e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
        return e;
    }
    function msg(t, tono) { var m = $("op-estado"); m.textContent = t || ""; m.className = "op-msg" + (tono ? " is-" + tono : ""); }
    function errTxt(e) { return e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso de Administración o Dirección" + (PY ? " de Paraguay" : "") + "." : (e && e.message) || String(e); }
    function db() { return firebase.firestore(); }
    function col() { return db().collection(Q.col(PY ? "paraguay" : "bolivia")); }
    function fecha(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(PY ? "es-PY" : "es-BO", { day: "numeric", month: "short", year: "numeric" }); }
    var BASE = location.href.replace(/dashboard\/cobros-qr\.html.*$/, "");
    function linkPantalla(o) { return BASE + "qr/?" + (o.sucursal ? "s=" + encodeURIComponent(o.sucursal) : "c=" + encodeURIComponent(o.canal || "general")) + (PY ? "&p=py" : ""); }

    var M = { docs: {}, sucursales: [], tiendas: [] };

    /* ---------- tarjetas ---------- */
    function vigente(id) { var d = M.docs[id]; return d && d.activo !== false && d.imagen ? d : null; }
    function tarjeta(o) {
        var propio = M.docs[o.id], activo = vigente(o.id);
        var hereda = !activo ? (o.sucursal ? vigente("general") : o.id !== "general" ? vigente("general") : null) : null;
        var caja = el("div", { class: "qr-img" + (activo ? "" : hereda ? " is-hereda" : " is-vacio") });
        if (activo) caja.appendChild(el("img", { src: activo.imagen, alt: "QR de " + o.nombre }));
        else if (hereda) { caja.appendChild(el("img", { src: hereda.imagen, alt: "" })); }
        else caja.appendChild(el("span", { text: o.id === "general" ? "Sin QR general todavía. Cargalo primero: es el que se usa donde no haya otro." : "Sin QR propio." }));
        var estado = activo ? el("span", { class: "op-chip is-ok", text: "Propio" }) : propio && propio.imagen ? el("span", { class: "op-chip is-warn", text: "Pausado" }) : hereda ? el("span", { class: "op-chip", text: "Usa el general" }) : el("span", { class: "op-chip is-bad", text: "Sin QR" });
        var acc = el("div", { class: "op-acc" }, [
            el("button", { type: "button", class: "op-btn is-fuerte", text: propio && propio.imagen ? "Cambiar" : "Cargar QR", onclick: function () { editar(o); } }),
            propio && propio.imagen ? el("button", { type: "button", class: "op-btn", text: propio.activo === false ? "Reactivar" : "Pausar", onclick: function () { pausar(o, propio.activo === false); } }) : null,
            (activo || hereda) ? el("a", { class: "op-btn", href: linkPantalla(o), target: "_blank", rel: "noopener", text: "Pantalla de caja" }) : null
        ]);
        return el("article", { class: "op-card qr-card" }, [
            el("div", { class: "op-acc" }, [el("h3", { text: o.nombre }), estado]),
            o.que ? el("p", { class: "op-muted", text: o.que }) : null,
            caja,
            el("p", { class: "qr-datos", text: Q.datosTexto(activo || hereda) }),
            propio && propio.fecha_mod ? el("p", { class: "qr-hist", text: "Último cambio: " + fecha(propio.fecha_mod) + (propio.por ? " · " + propio.por : "") }) : null,
            acc
        ]);
    }
    /* La Jefa de ATC (sin Administración ni Dirección) ve y carga solo los QR de Referidos y de Atención al Cliente. */
    function soloATC() { var r = function (x) { return CMFB.tieneRolPais(x); }; return !r("administracion") && !r("direccion"); }
    function pintar() {
        var c = $("qr-canales"); c.textContent = "";
        var atc = window.CMFB && CMFB.sesionVigente() && soloATC();
        Q.CANALES.filter(function (x) { return !atc || x.id === "referidos" || x.id === "atc"; }).forEach(function (x) { c.appendChild(tarjeta({ id: x.id, canal: x.id, nombre: x.nombre, que: x.que })); });
        document.querySelectorAll(".qr-sec")[1].hidden = atc; $("qr-sucursales").hidden = atc; $("qr-agregar").hidden = atc;
        if (atc) { $("qr-tiendas-box").hidden = true; return; }
        var s = $("qr-sucursales"); s.textContent = "";
        if (!M.sucursales.length) s.appendChild(el("p", { class: "op-vacio", text: PY ? "Todavía no hay sucursales cargadas: agregá la sucursal de Asunción abajo." : "Cargando sucursales del sistema…" }));
        M.sucursales.forEach(function (x) { s.appendChild(tarjeta({ id: Q.idSucursal(x.key), sucursal: x.key, nombre: x.nombre })); });
        var t = $("qr-tiendas"); t.textContent = "";
        M.tiendas.forEach(function (x) { t.appendChild(tarjeta({ id: Q.idSucursal(x.key), sucursal: x.key, nombre: x.nombre })); });
        $("qr-tiendas-box").hidden = !M.tiendas.length;
        pintarAgregar();
    }
    /* En Paraguay (y para sucursales nuevas) se puede agregar una sucursal a mano. */
    function pintarAgregar() {
        var box = $("qr-agregar"); box.textContent = "";
        var nombre = el("input", { type: "text", maxlength: "60", placeholder: "Nombre de la sucursal (ej. Asunción Centro)" });
        var b = el("button", { type: "button", class: "op-btn", text: "Agregar sucursal" });
        b.addEventListener("click", function () {
            var n = nombre.value.trim(); if (n.length < 3) { msg("Escribí el nombre de la sucursal.", "warn"); return; }
            var key = "manual-" + n.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
            if (M.sucursales.some(function (x) { return x.key === key; })) { msg("Esa sucursal ya está.", "warn"); return; }
            M.sucursales.push({ key: key, nombre: n }); pintar(); editar({ id: Q.idSucursal(key), sucursal: key, nombre: n });
        });
        box.appendChild(el("div", { class: "op-acc", style: "margin-top:12px" }, [nombre, b]));
    }

    /* ---------- cargar / cambiar ---------- */
    function editar(o) {
        var ed = $("qr-editor"), prev = M.docs[o.id] || {}, imagen = prev.imagen || "";
        var archivo = el("input", { type: "file", accept: "image/*" });
        var ver = el("img", { class: "qr-prev", alt: "QR", hidden: !imagen }); if (imagen) ver.src = imagen;
        var campos = {};
        var campo = function (k, et, ph, ancho) { campos[k] = el("input", { type: "text", maxlength: k === "nota" ? "200" : "80", placeholder: ph || "" }); campos[k].value = prev[k] || ""; return el("label", { class: "op-campo" + (ancho ? " is-ancho" : "") }, [et, campos[k]]); };
        archivo.addEventListener("change", function () {
            var f = archivo.files && archivo.files[0]; if (!f) return;
            var img = new Image(), url = URL.createObjectURL(f);
            img.onload = function () {
                var k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement("canvas");
                c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                var x = c.getContext("2d"); x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
                imagen = c.toDataURL("image/jpeg", 0.9); URL.revokeObjectURL(url); ver.src = imagen; ver.hidden = false;
            };
            img.onerror = function () { msg("No se pudo leer esa imagen. Probá con otra foto o captura.", "bad"); };
            img.src = url;
        });
        var guardar = el("button", { type: "button", class: "op-btn is-fuerte", text: "Guardar" });
        var cerrar = el("button", { type: "button", class: "op-btn", text: "Cancelar", onclick: function () { ed.textContent = ""; } });
        guardar.addEventListener("click", function () {
            if (!imagen) { msg("Subí la foto o captura del QR.", "warn"); return; }
            if (imagen.length > 700000) { msg("La imagen es muy pesada. Probá con una captura más chica.", "warn"); return; }
            guardar.disabled = true; msg("Guardando…");
            var d = { uso: o.sucursal ? "sucursal" : o.canal, nombre: o.nombre, key_sucursal: o.sucursal || null, imagen: imagen, activo: true, fecha_mod: new Date().toISOString(), por: (window.CM_USUARIO && CM_USUARIO.nombre) || "" };
            ["banco", "cuenta", "titular", "nit", "nota"].forEach(function (k) { d[k] = campos[k].value.trim(); });
            col().doc(o.id).set(d).then(function () { M.docs[o.id] = d; ed.textContent = ""; msg("Guardado: " + o.nombre + ". Ya lo ven la caja y las demás pantallas.", "ok"); pintar(); },
                function (e) { msg(errTxt(e), "bad"); guardar.disabled = false; });
        });
        ed.textContent = "";
        ed.appendChild(el("section", { class: "op-card" }, [
            el("h2", { text: "QR · " + o.nombre }),
            el("div", { class: "qr-form" }, [
                el("label", { class: "op-campo is-ancho" }, ["Foto o captura del QR", archivo]), ver,
                campo("banco", "Banco", "Ej. Banco Unión"), campo("cuenta", "Número de cuenta", ""),
                campo("titular", "Titular", "Ej. Calistenia Bolivia SRL"), campo("nit", PY ? "RUC" : "NIT", ""),
                campo("nota", "Nota para el cliente (opcional)", "Ej. Mandá el comprobante al 7…", true)
            ]),
            el("div", { class: "op-acc" }, [guardar, cerrar])
        ]));
        ed.scrollIntoView({ behavior: "smooth" });
    }
    function pausar(o, reactivar) {
        var d = M.docs[o.id]; if (!d) return;
        if (!reactivar && !confirm("¿Pausar el QR de «" + o.nombre + "»? Mientras esté pausado se usa el general.")) return;
        col().doc(o.id).update({ activo: !!reactivar, fecha_mod: new Date().toISOString(), por: (window.CM_USUARIO && CM_USUARIO.nombre) || "" })
            .then(function () { d.activo = !!reactivar; msg(reactivar ? "Reactivado." : "Pausado: se usa el general.", "ok"); pintar(); }, function (e) { msg(errTxt(e), "bad"); });
    }

    /* ---------- datos ---------- */
    function cargar() {
        msg("Cargando…");
        return col().get().then(function (q) {
            M.docs = {}; q.docs.forEach(function (d) { M.docs[d.id] = d.data(); });
            /* Sucursales cargadas a mano (o de Paraguay) que todavía no vienen del sistema. */
            Object.keys(M.docs).forEach(function (id) { var d = M.docs[id]; if (d.uso === "sucursal" && d.key_sucursal && !M.sucursales.concat(M.tiendas).some(function (x) { return x.key === d.key_sucursal; })) M.sucursales.push({ key: d.key_sucursal, nombre: d.nombre || d.key_sucursal }); });
            msg(""); pintar();
        }, function (e) { msg(errTxt(e), "bad"); pintar(); });
    }
    function sucursalesSistema() {
        if (PY || !window.CM || !CM.llamar) return Promise.resolve();
        return CM.llamar("listar_sucursales", {}).then(function (r) {
            if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { r = {}; } }
            var l = (r && (r.result || r.filas)) || [];
            M.sucursales = l.filter(function (s) { return !s.tipo_tienda && !/oficina/i.test(s.descripcion || ""); }).map(function (s) { return { key: s.key, nombre: String(s.descripcion || "").trim() }; }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
            M.tiendas = l.filter(function (s) { return s.tipo_tienda; }).map(function (s) { return { key: s.key, nombre: String(s.descripcion || "").trim() }; }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
        }).catch(function () {});
    }

    /* ---------- arranque ---------- */
    if (PY) $("qr-eyebrow").textContent = "Calistenia Company · Paraguay · Administración";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    pintar();
    CMFB.listo.then(function () {
        if (!CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP.", "bad"); return; }
        return sucursalesSistema().then(cargar);
    });
})();
