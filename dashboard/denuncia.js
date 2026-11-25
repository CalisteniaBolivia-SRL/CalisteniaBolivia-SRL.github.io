/* =====================================================================================================
   Denuncia anónima del personal → Recursos Humanos (Bolivia y Paraguay, la misma página; Paraguay con ?pais=paraguay).
   - Sin usuario ni sesión: la página no carga el inicio de sesión de Firebase, así que la denuncia nunca viaja con
     la identidad de quien la hace. No se guarda nombre, usuario, teléfono ni dirección IP.
   - Al enviarla se genera un código al azar (es el identificador de la denuncia). Con ese código, y solo con él,
     se ve el estado, las respuestas de RRHH y se puede agregar información. No se puede recuperar.
   - La reciben RRHH y Dirección; si la persona elige «Solo Dirección» (por ejemplo, si involucra a alguien de RRHH),
     RRHH no la ve.
   Firestore (Paraguay con prefijo py_): rh_denuncia/{código}, rh_denuncia/{código}/mensajes.
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
    function msg(t, tono) { var m = $("op-estado"); m.textContent = t || ""; m.className = "op-msg" + (tono ? " is-" + tono : ""); }

    var CATEGORIAS = [
        ["acoso_laboral", "Acoso o maltrato laboral"],
        ["acoso_sexual", "Acoso sexual"],
        ["discriminacion", "Discriminación"],
        ["robo_fraude", "Robo, fraude o mal manejo de dinero"],
        ["seguridad", "Riesgo para la seguridad del personal o de los clientes"],
        ["clientes", "Mal trato a clientes"],
        ["incumplimiento", "Incumplimiento de normas o del reglamento"],
        ["otro", "Otro"]
    ];
    var ESTADOS = { recibida: "Recibida: todavía no la revisaron", en_revision: "En revisión", resuelta: "Resuelta", descartada: "Cerrada sin acciones" };
    function nombreCat(c) { var x = CATEGORIAS.filter(function (y) { return y[0] === c; })[0]; return x ? x[1] : c; }

    if (!window.firebase || !window.CM_FIREBASE_CONFIG) { msg("No se pudo cargar el sistema. Probá de nuevo en un rato.", "bad"); return; }
    var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.CM_FIREBASE_CONFIG);
    var db = app.firestore();
    if (window.CM_FIREBASE_EMULADOR && CM_FIREBASE_EMULADOR.firestore) { var h = CM_FIREBASE_EMULADOR.firestore.split(":"); db.useEmulator(h[0], Number(h[1])); }
    var COL = (PY ? "py_" : "") + "rh_denuncia";
    var ahora = function () { return firebase.firestore.FieldValue.serverTimestamp(); };

    /* Código al azar: 20 letras y números sin los que se confunden (0/O, 1/I). */
    var ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    function nuevoCodigo() {
        var b = new Uint8Array(20); crypto.getRandomValues(b);
        var s = ""; for (var i = 0; i < 20; i++) { s += ABC[b[i] % 32]; if (i % 5 === 4 && i < 19) s += "-"; }
        return s;
    }
    function limpiarCodigo(t) {
        var s = String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!/^[A-HJ-NP-Z2-9]*$/.test(s)) return "";
        if (s.length !== 20) return "";
        return s.match(/.{5}/g).join("-");
    }
    function fecha(ts) {
        var d = ts && ts.toDate ? ts.toDate() : null; if (!d) return "recién";
        var p = function (n) { return (n < 10 ? "0" : "") + n; };
        return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    }

    /* ---------- pestañas ---------- */
    var vista = "nueva";
    $("dn-tabs").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-v]"); if (!b) return;
        vista = b.getAttribute("data-v"); msg("");
        Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) { var on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-selected", on ? "true" : "false"); });
        pintar();
    });
    function pintar(codigo) { var v = $("dn-vista"); v.textContent = ""; v.appendChild(vista === "nueva" ? formNueva() : formSeguir(codigo)); }

    /* ---------- nueva denuncia ---------- */
    function formNueva() {
        var cat = el("select", { required: true, id: "dn-cat" }, [el("option", { value: "", text: "Elegí una opción" })].concat(CATEGORIAS.map(function (c) { return el("option", { value: c[0], text: c[1] }); })));
        var suc = el("input", { type: "text", maxlength: "120", placeholder: "Opcional", id: "dn-suc", autocomplete: "off" });
        var cuando = el("input", { type: "text", maxlength: "120", placeholder: "Ej.: el lunes 20/11 a la tarde, o desde hace un mes", id: "dn-cuando", autocomplete: "off" });
        var quienes = el("input", { type: "text", maxlength: "300", placeholder: "Nombre o puesto (opcional)", id: "dn-quienes", autocomplete: "off" });
        var desc = el("textarea", { rows: "8", maxlength: "5000", required: true, id: "dn-desc", placeholder: "Contá qué pasó con el mayor detalle posible: qué, dónde, cuándo, quiénes estaban. Mínimo 20 letras." });
        var pruebas = el("textarea", { rows: "3", maxlength: "1000", id: "dn-pruebas", placeholder: "¿Hubo testigos, mensajes, fotos o algo que RRHH pueda revisar? Contalo acá (opcional)." });
        var cuenta = el("small", { class: "op-muted", text: "0 / 5000" });
        desc.addEventListener("input", function () { cuenta.textContent = desc.value.length + " / 5000"; });
        var dest = el("fieldset", { class: "dn-dest" }, [
            el("legend", { text: "¿Quién la recibe?" }),
            el("label", {}, [el("input", { type: "radio", name: "dn-dest", value: "rrhh", checked: true }), " Recursos Humanos y Dirección"]),
            el("label", {}, [el("input", { type: "radio", name: "dn-dest", value: "direccion" }), " Solo Dirección (si involucra a alguien de Recursos Humanos)"])
        ]);
        var btn = el("button", { type: "submit", class: "op-btn is-rojo", text: "Enviar denuncia anónima" });
        var f = el("form", { class: "op-card dn-form", novalidate: true }, [
            el("label", { class: "op-campo" }, ["Tipo de situación *", cat]),
            el("div", { class: "dn-2" }, [el("label", { class: "op-campo" }, ["Sucursal o lugar", suc]), el("label", { class: "op-campo" }, ["¿Cuándo pasó?", cuando])]),
            el("label", { class: "op-campo" }, ["Personas involucradas", quienes]),
            el("label", { class: "op-campo" }, ["¿Qué pasó? *", desc, cuenta]),
            el("label", { class: "op-campo" }, ["Testigos o pruebas", pruebas]),
            dest,
            el("p", { class: "op-muted dn-aviso", text: "Para cuidar tu anonimato: no pongas tu nombre ni datos que te identifiquen (salvo que quieras). Si la escribís desde la computadora del trabajo, cerrá la página al terminar." }),
            el("div", { class: "op-acc" }, [btn])
        ]);
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            var d = desc.value.trim();
            if (!cat.value) { msg("Elegí el tipo de situación.", "bad"); cat.focus(); return; }
            if (d.length < 20) { msg("Contá un poco más qué pasó (mínimo 20 letras).", "bad"); desc.focus(); return; }
            var soloDir = (f.querySelector("input[name=dn-dest]:checked") || {}).value === "direccion";
            var codigo = nuevoCodigo();
            var doc = {
                pais: PY ? "paraguay" : "bolivia", categoria: cat.value, sucursal: suc.value.trim() || null, cuando: cuando.value.trim() || null,
                involucrados: quienes.value.trim() || null, descripcion: d, pruebas: pruebas.value.trim() || null, solo_direccion: soloDir,
                estado: "recibida", fecha: ahora(), ultima_actividad: ahora(), de_ultimo: "denunciante"
            };
            btn.disabled = true; msg("Enviando…");
            db.collection(COL).doc(codigo).set(doc).then(function () { msg(""); mostrarCodigo(codigo); },
                function (err) { btn.disabled = false; msg("No se pudo enviar (" + ((err && err.code) || "error") + "). Revisá tu conexión y probá de nuevo.", "bad"); });
        });
        return f;
    }
    function mostrarCodigo(codigo) {
        var v = $("dn-vista"); v.textContent = "";
        var copiar = el("button", { type: "button", class: "op-btn", text: "Copiar código" });
        copiar.addEventListener("click", function () {
            (navigator.clipboard ? navigator.clipboard.writeText(codigo) : Promise.reject()).then(function () { copiar.textContent = "Copiado"; }, function () { copiar.textContent = "Copialo a mano"; });
        });
        var bajar = el("button", { type: "button", class: "op-btn", text: "Descargar código" });
        bajar.addEventListener("click", function () {
            var txt = "Código de tu denuncia anónima (Calistenia Company" + (PY ? " · Paraguay" : "") + "):\n\n" + codigo + "\n\nPara ver la respuesta de Recursos Humanos, entrá a la página de denuncias → «Ver mi denuncia».\n";
            var a = el("a", { href: URL.createObjectURL(new Blob([txt], { type: "text/plain" })), download: "codigo-denuncia.txt" });
            document.body.appendChild(a); a.click(); a.remove();
        });
        var ver = el("button", { type: "button", class: "op-btn is-fuerte", text: "Ver mi denuncia" });
        ver.addEventListener("click", function () { vista = "seguir"; marcarTab(); pintar(codigo); });
        v.appendChild(el("section", { class: "op-card is-rojo dn-ok" }, [
            el("h2", { text: "Denuncia enviada" }),
            el("p", { class: "op-muted", text: "Este es tu código. Es la única forma de ver la respuesta de Recursos Humanos y de agregar información. Guardalo en un lugar seguro: no se puede recuperar y nadie más lo tiene." }),
            el("p", { class: "dn-codigo", text: codigo }),
            el("div", { class: "op-acc" }, [copiar, bajar, ver])
        ]));
    }
    function marcarTab() { Array.prototype.forEach.call($("dn-tabs").querySelectorAll("button"), function (x) { var on = x.getAttribute("data-v") === vista; x.classList.toggle("is-on", on); x.setAttribute("aria-selected", on ? "true" : "false"); }); }

    /* ---------- seguimiento con el código ---------- */
    function formSeguir(codigoInicial) {
        var inp = el("input", { type: "text", maxlength: "30", placeholder: "XXXXX-XXXXX-XXXXX-XXXXX", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", class: "dn-input-codigo", value: codigoInicial || "" });
        var res = el("div", { class: "dn-res" });
        var f = el("form", { class: "op-card" }, [
            el("label", { class: "op-campo" }, ["Código de tu denuncia", inp]),
            el("div", { class: "op-acc" }, [el("button", { type: "submit", class: "op-btn is-fuerte", text: "Ver" })])
        ]);
        f.addEventListener("submit", function (e) { e.preventDefault(); abrir(limpiarCodigo(inp.value), res); });
        var cont = el("div", { class: "dn-seguir" }, [f, res]);
        if (codigoInicial) setTimeout(function () { abrir(codigoInicial, res); }, 0);
        return cont;
    }
    function abrir(codigo, res) {
        res.textContent = "";
        if (!codigo) { msg("El código tiene 20 letras y números (podés escribirlo con o sin guiones).", "bad"); return; }
        msg("Buscando…");
        var ref = db.collection(COL).doc(codigo);
        Promise.all([ref.get(), ref.collection("mensajes").orderBy("fecha").get()]).then(function (a) {
            if (!a[0].exists) { msg("No hay ninguna denuncia con ese código. Revisalo letra por letra.", "bad"); return; }
            msg("");
            var d = a[0].data(), mens = a[1].docs.map(function (x) { return x.data(); });
            var hilo = el("div", { class: "dn-hilo" }, [
                el("div", { class: "dn-m is-yo" }, [el("small", { text: "Tu denuncia · " + fecha(d.fecha) }), el("p", { text: d.descripcion })])
            ].concat(mens.map(function (m) {
                return el("div", { class: "dn-m" + (m.de === "denunciante" ? " is-yo" : "") }, [el("small", { text: (m.de === "denunciante" ? "Vos" : (d.solo_direccion ? "Dirección" : "Recursos Humanos")) + " · " + fecha(m.fecha) }), el("p", { text: m.texto })]);
            })));
            var txt = el("textarea", { rows: "4", maxlength: "3000", placeholder: "Agregá información o contestá a Recursos Humanos (sigue siendo anónimo)." });
            var btn = el("button", { type: "submit", class: "op-btn is-fuerte", text: "Enviar" });
            var f = el("form", { class: "dn-responder" }, [txt, el("div", { class: "op-acc" }, [btn])]);
            f.addEventListener("submit", function (e) {
                e.preventDefault();
                var t = txt.value.trim(); if (t.length < 2) return;
                btn.disabled = true;
                var lote = db.batch();
                lote.set(ref.collection("mensajes").doc(), { de: "denunciante", texto: t, fecha: ahora() });
                lote.update(ref, { ultima_actividad: ahora(), de_ultimo: "denunciante" });
                lote.commit().then(function () { msg("Enviado.", "ok"); abrir(codigo, res); }, function (err) { btn.disabled = false; msg("No se pudo enviar (" + ((err && err.code) || "error") + ").", "bad"); });
            });
            res.appendChild(el("section", { class: "op-card" }, [
                el("div", { class: "op-acc dn-cab" }, [el("span", { class: "op-chip" + (d.estado === "resuelta" ? " is-ok" : ""), text: ESTADOS[d.estado] || d.estado }), el("span", { class: "op-muted", text: nombreCat(d.categoria) + (d.sucursal ? " · " + d.sucursal : "") })]),
                hilo,
                d.estado === "resuelta" || d.estado === "descartada" ? el("p", { class: "op-muted", text: "Esta denuncia está cerrada. Si pasó algo nuevo, podés escribir igual o hacer una denuncia nueva." }) : null,
                f
            ]));
        }, function (err) { msg("No se pudo abrir (" + ((err && err.code) || "error") + "). Revisá tu conexión.", "bad"); });
    }

    pintar();
})();
