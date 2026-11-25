/* =====================================================================================================
   Denuncias anónimas · bandeja de Recursos Humanos y Dirección (Bolivia y Paraguay, el mismo módulo; cada país con lo suyo).
   - RRHH (permiso «rrhh» en /centro_mando) ve las denuncias que no pidieron «Solo Dirección»; Dirección ve todas.
   - Por denuncia: los datos, la conversación con quien denunció (ve las respuestas con su código), el estado
     (recibida → en revisión → resuelta / cerrada sin acciones) y notas internas que la persona no ve.
   - Link y código QR para que el personal sepa dónde denunciar.
   Firestore (Paraguay con prefijo py_): rh_denuncia/{código} + mensajes (los ve quien denunció) + notas (internas).
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
    function db() { return firebase.firestore(); }
    function col() { return db().collection((PY ? "py_" : "") + "rh_denuncia"); }
    var ahora = function () { return firebase.firestore.FieldValue.serverTimestamp(); };
    function msg(t, tono) { var m = $("op-estado"); m.textContent = t || ""; m.className = "op-msg" + (tono ? " is-" + tono : ""); }
    function errTxt(e) { return e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso para esto en /centro_mando (Recursos Humanos o Dirección). Si te lo dieron hace poco, salí y volvé a entrar." : (e && e.message) || String(e); }
    function chip(t, tono) { return el("span", { class: "op-chip" + (tono ? " is-" + tono : ""), text: t }); }
    function ms(ts) { return ts && ts.toMillis ? ts.toMillis() : 0; }
    function fecha(ts, corta) {
        var d = ts && ts.toDate ? ts.toDate() : null; if (!d) return "—";
        var p = function (n) { return (n < 10 ? "0" : "") + n; };
        return p(d.getDate()) + "/" + p(d.getMonth() + 1) + (corta ? "" : "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()));
    }
    function dias(ts) { return ts && ts.toMillis ? Math.floor((Date.now() - ts.toMillis()) / 86400000) : 0; }

    var CATEGORIAS = { acoso_laboral: "Acoso o maltrato laboral", acoso_sexual: "Acoso sexual", discriminacion: "Discriminación", robo_fraude: "Robo, fraude o mal manejo de dinero",
        seguridad: "Riesgo para la seguridad", clientes: "Mal trato a clientes", incumplimiento: "Incumplimiento de normas", otro: "Otro" };
    var GRAVES = ["acoso_sexual", "acoso_laboral", "robo_fraude", "seguridad", "discriminacion"];
    var ESTADOS = { recibida: ["Recibida", "warn"], en_revision: ["En revisión", ""], resuelta: ["Resuelta", "ok"], descartada: ["Cerrada sin acciones", ""] };
    var ABIERTA = function (d) { return d.estado === "recibida" || d.estado === "en_revision"; };

    var M = { vista: "abiertas", lista: [], dir: false, uid: "", nombre: "", abierta: null };

    function cargar() {
        msg("Cargando…");
        var q = M.dir ? col() : col().where("solo_direccion", "==", false);
        return q.get().then(function (r) {
            M.lista = r.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); })
                .sort(function (a, b) { return ms(b.ultima_actividad) - ms(a.ultima_actividad); });
            msg(""); pintar();
        }, function (e) { msg(errTxt(e), "bad"); });
    }

    /* ---------- pestañas ---------- */
    function tabs() {
        var nuevas = M.lista.filter(function (d) { return ABIERTA(d) && d.de_ultimo === "denunciante"; }).length;
        var t = $("dn-tabs"); t.textContent = "";
        [["abiertas", "Abiertas", nuevas], ["cerradas", "Cerradas", 0], ["compartir", "Link para el personal", 0]].forEach(function (x) {
            var b = el("button", { type: "button", role: "tab", class: M.vista === x[0] ? "is-on" : "", "aria-selected": M.vista === x[0] ? "true" : "false" }, [x[1], x[2] ? el("b", { text: String(x[2]), title: "Esperan respuesta" }) : null]);
            b.addEventListener("click", function () { M.vista = x[0]; M.abierta = null; pintar(); });
            t.appendChild(b);
        });
    }
    function pintar() {
        tabs();
        var v = $("dn-vista"); v.textContent = "";
        if (M.abierta) { v.appendChild(detalle(M.abierta)); return; }
        if (M.vista === "compartir") { v.appendChild(compartir()); return; }
        v.appendChild(bandeja(M.vista === "abiertas"));
    }

    /* ---------- bandeja ---------- */
    function bandeja(abiertas) {
        var l = M.lista.filter(function (d) { return abiertas ? ABIERTA(d) : !ABIERTA(d); });
        var wrap = el("div", { class: "dn-bandeja" });
        if (abiertas) {
            var mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
            var esperan = l.filter(function (d) { return d.de_ultimo === "denunciante"; }).length;
            var graves = l.filter(function (d) { return GRAVES.indexOf(d.categoria) >= 0; }).length;
            var cerradasMes = M.lista.filter(function (d) { return !ABIERTA(d) && ms(d.ultima_actividad) >= mes.getTime(); }).length;
            wrap.appendChild(el("div", { class: "op-kpis" }, [
                el("div", { class: "op-kpi" + (esperan ? " is-warn" : " is-ok") }, [el("span", { text: "Esperan respuesta" }), el("b", { text: String(esperan) }), el("small", { text: "la última palabra la tiene quien denunció" })]),
                el("div", { class: "op-kpi" }, [el("span", { text: "Abiertas" }), el("b", { text: String(l.length) }), el("small", { text: graves + (graves === 1 ? " grave" : " graves") + " (acoso, fraude, seguridad, discriminación)" })]),
                el("div", { class: "op-kpi is-ok" }, [el("span", { text: "Cerradas este mes" }), el("b", { text: String(cerradasMes) }), el("small", { text: "resueltas o sin acciones" })])
            ]));
        }
        if (!l.length) { wrap.appendChild(el("p", { class: "op-vacio", text: abiertas ? "No hay denuncias abiertas." : "Todavía no hay denuncias cerradas." })); return wrap; }
        wrap.appendChild(el("div", { class: "op-scroll" }, [el("table", { class: "op-tabla" }, [
            el("thead", {}, [el("tr", {}, ["Recibida", "Tipo", "Sucursal", "Estado", "Última novedad", ""].map(function (t) { return el("th", { text: t }); }))]),
            el("tbody", {}, l.map(function (d) {
                var e = ESTADOS[d.estado] || [d.estado, ""];
                var grave = GRAVES.indexOf(d.categoria) >= 0;
                return el("tr", { class: "is-clic", onclick: function () { abrir(d); } }, [
                    el("td", { text: fecha(d.fecha) }),
                    el("td", {}, [grave ? el("b", { text: CATEGORIAS[d.categoria] || d.categoria }) : (CATEGORIAS[d.categoria] || d.categoria), d.solo_direccion ? el("small", { class: "dn-solo", text: " · solo Dirección" }) : null]),
                    el("td", { text: d.sucursal || "—" }),
                    el("td", {}, [chip(e[0], e[1])]),
                    el("td", { text: (d.de_ultimo === "denunciante" ? "Escribió quien denunció" : "Respondiste") + " · hace " + dias(d.ultima_actividad) + " d" }),
                    el("td", {}, [ABIERTA(d) && d.de_ultimo === "denunciante" ? chip("Responder", "bad") : null])
                ]);
            }))
        ])]));
        return wrap;
    }

    /* ---------- detalle ---------- */
    function abrir(d) { M.abierta = d; pintar(); window.scrollTo(0, 0); }
    function detalle(d) {
        var ref = col().doc(d.key);
        var wrap = el("div", { class: "dn-detalle" });
        var volver = el("button", { type: "button", class: "op-link", text: "← Volver a la bandeja", onclick: function () { M.abierta = null; cargar(); } });
        var e = ESTADOS[d.estado] || [d.estado, ""];
        var datos = el("section", { class: "op-card" + (GRAVES.indexOf(d.categoria) >= 0 ? " is-rojo" : "") }, [
            el("div", { class: "op-acc dn-cab" }, [chip(e[0], e[1]), el("h2", { text: CATEGORIAS[d.categoria] || d.categoria }), d.solo_direccion ? chip("Solo Dirección") : null]),
            el("dl", { class: "dn-datos" }, [
                el("dt", { text: "Recibida" }), el("dd", { text: fecha(d.fecha) }),
                el("dt", { text: "Sucursal o lugar" }), el("dd", { text: d.sucursal || "—" }),
                el("dt", { text: "Cuándo pasó" }), el("dd", { text: d.cuando || "—" }),
                el("dt", { text: "Involucrados" }), el("dd", { text: d.involucrados || "—" }),
                el("dt", { text: "Testigos o pruebas" }), el("dd", { text: d.pruebas || "—" })
            ]),
            el("p", { class: "dn-texto", text: d.descripcion })
        ]);
        var hilo = el("div", { class: "dn-hilo" }, [el("p", { class: "op-muted", text: "Cargando conversación…" })]);
        var txt = el("textarea", { rows: "4", maxlength: "3000", placeholder: "Respuesta para quien denunció (la ve con su código). Podés pedirle más datos." });
        var btn = el("button", { type: "submit", class: "op-btn is-fuerte", text: "Enviar respuesta" });
        var form = el("form", { class: "dn-responder" }, [txt, el("div", { class: "op-acc" }, [btn, el("small", { class: "op-muted", text: "No se muestra tu nombre: le aparece «" + (d.solo_direccion ? "Dirección" : "Recursos Humanos") + "»." })])]);
        form.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var t = txt.value.trim(); if (t.length < 2) return;
            btn.disabled = true;
            var lote = db().batch();
            lote.set(ref.collection("mensajes").doc(), { de: "rrhh", texto: t, fecha: ahora() });
            var cambio = { ultima_actividad: ahora(), de_ultimo: "rrhh" };
            if (d.estado === "recibida") cambio.estado = "en_revision";
            lote.update(ref, cambio);
            lote.set(ref.collection("notas").doc(), { texto: "Respondió a quien denunció.", tipo: "registro", autor: M.uid, autor_nombre: M.nombre, fecha: ahora() });
            lote.commit().then(function () { Object.assign(d, { de_ultimo: "rrhh", estado: cambio.estado || d.estado }); msg("Respuesta enviada.", "ok"); pintar(); },
                function (err) { btn.disabled = false; msg(errTxt(err), "bad"); });
        });

        var estados = el("div", { class: "op-acc" }, Object.keys(ESTADOS).filter(function (k) { return k !== d.estado; }).map(function (k) {
            return el("button", { type: "button", class: "op-btn" + (k === "resuelta" ? " is-fuerte" : ""), text: k === "recibida" ? "Volver a «Recibida»" : "Pasar a «" + ESTADOS[k][0] + "»", onclick: function () {
                var nota = "";
                if (k === "resuelta" || k === "descartada") { nota = prompt("¿Qué se hizo? (queda en las notas internas; quien denunció no lo ve)", ""); if (nota === null) return; }
                var lote = db().batch();
                lote.update(ref, { estado: k });
                lote.set(ref.collection("notas").doc(), { texto: "Cambió el estado a «" + ESTADOS[k][0] + "»." + (nota ? " " + nota.trim().slice(0, 1500) : ""), tipo: "registro", autor: M.uid, autor_nombre: M.nombre, fecha: ahora() });
                lote.commit().then(function () { d.estado = k; msg("Estado: " + ESTADOS[k][0] + ".", "ok"); pintar(); }, function (err) { msg(errTxt(err), "bad"); });
            } });
        }));

        var notas = el("div", { class: "dn-notas" }, [el("p", { class: "op-muted", text: "Cargando…" })]);
        var nt = el("textarea", { rows: "3", maxlength: "2000", placeholder: "Nota interna: entrevistas, medidas tomadas, decisiones. Quien denunció no la ve." });
        var nform = el("form", { class: "dn-responder" }, [nt, el("div", { class: "op-acc" }, [el("button", { type: "submit", class: "op-btn", text: "Guardar nota" })])]);
        nform.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var t = nt.value.trim(); if (t.length < 2) return;
            ref.collection("notas").add({ texto: t, tipo: "nota", autor: M.uid, autor_nombre: M.nombre, fecha: ahora() }).then(function () { msg("Nota guardada.", "ok"); pintar(); }, function (err) { msg(errTxt(err), "bad"); });
        });

        wrap.appendChild(volver);
        wrap.appendChild(datos);
        wrap.appendChild(el("section", { class: "op-card" }, [el("h2", { text: "Conversación con quien denunció" }), hilo, form]));
        wrap.appendChild(el("section", { class: "op-card" }, [el("h2", { text: "Estado" }), estados]));
        wrap.appendChild(el("section", { class: "op-card" }, [el("h2", { text: "Notas internas" }), notas, nform]));

        Promise.all([ref.collection("mensajes").orderBy("fecha").get(), ref.collection("notas").orderBy("fecha").get()]).then(function (a) {
            hilo.textContent = "";
            hilo.appendChild(el("div", { class: "dn-m is-yo" }, [el("small", { text: "Denuncia · " + fecha(d.fecha) }), el("p", { text: d.descripcion })]));
            a[0].docs.forEach(function (x) {
                var m = x.data();
                hilo.appendChild(el("div", { class: "dn-m" + (m.de === "denunciante" ? " is-yo" : " is-rrhh") }, [el("small", { text: (m.de === "denunciante" ? "Quien denunció" : (d.solo_direccion ? "Dirección" : "Recursos Humanos")) + " · " + fecha(m.fecha) }), el("p", { text: m.texto })]));
            });
            notas.textContent = "";
            if (!a[1].size) notas.appendChild(el("p", { class: "op-vacio", text: "Sin notas todavía." }));
            a[1].docs.forEach(function (x) {
                var n = x.data();
                notas.appendChild(el("div", { class: "dn-nota" + (n.tipo === "registro" ? " is-reg" : "") }, [el("small", { text: (n.autor_nombre || "—") + " · " + fecha(n.fecha) }), el("p", { text: n.texto })]));
            });
        }, function (err) { hilo.textContent = ""; hilo.appendChild(el("p", { class: "op-msg is-bad", text: errTxt(err) })); });
        return wrap;
    }

    /* ---------- link y QR para el personal ---------- */
    function compartir() {
        var url = new URL("denuncia.html" + (PY ? "?pais=paraguay" : ""), location.href).href;
        var wrap = el("div", { class: "dn-compartir" });
        var copiar = el("button", { type: "button", class: "op-btn is-fuerte", text: "Copiar link" });
        copiar.addEventListener("click", function () { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { copiar.textContent = "Copiado"; }, function () { prompt("Copiá el link:", url); }); });
        var texto = "Calistenia" + (PY ? " Paraguay" : "") + " · Si viste o viviste algo que no está bien en el trabajo (maltrato, acoso, robo, riesgos), podés contarlo de forma anónima a Recursos Humanos. No pide usuario ni nombre: " + url;
        var wa = el("a", { class: "op-btn", href: "https://wa.me/?text=" + encodeURIComponent(texto), target: "_blank", rel: "noopener", text: "Compartir por WhatsApp" });
        var qr = el("div", { class: "dn-qr" });
        if (window.qrcode) { var q = qrcode(0, "M"); q.addData(url); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
        var imprimir = el("button", { type: "button", class: "op-btn", text: "Imprimir cartel con QR", onclick: function () {
            var w = window.open("", "_blank"); if (!w) return;
            w.document.write("<!doctype html><meta charset='utf-8'><title>Denuncia anónima</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;color:#000}h1{font-size:34px;margin:0 0 6px;text-transform:uppercase}p{font-size:18px;max-width:560px;margin:10px auto;line-height:1.45}.q svg{width:340px;height:340px}small{font-size:13px;word-break:break-all;color:#444}</style>" +
                "<h1>Denuncia anónima</h1><p><b>¿Viste o viviste algo que no está bien en el trabajo?</b> Maltrato, acoso, robo, riesgos para el personal o los clientes.</p><div class='q'>" + qr.innerHTML + "</div><p>Escaneá el código y contalo a Recursos Humanos. <b>No pide usuario, nombre ni teléfono.</b> Te da un código para ver la respuesta.</p><small>" + url.replace(/</g, "") + "</small><p style='font-size:14px;margin-top:24px'>Calistenia Company" + (PY ? " · Paraguay" : "") + "</p><script>setTimeout(function(){print()},300)<\/script>");
            w.document.close();
        } });
        wrap.appendChild(el("section", { class: "op-card" }, [
            el("h2", { text: "Dónde denuncia el personal" }),
            el("p", { class: "op-muted", text: "Compartí este link con todo el personal" + (PY ? " de Paraguay" : " de Bolivia") + " (grupo de WhatsApp, cartel en cada sucursal). No necesita usuario del ERP y el sistema no guarda quién envía la denuncia." }),
            el("p", { class: "dn-url", text: url }),
            el("div", { class: "op-acc" }, [copiar, wa, imprimir]),
            qr
        ]));
        return wrap;
    }

    /* ---------- arranque ---------- */
    $("op-eyebrow").textContent = "Calistenia Company · " + (PY ? "Paraguay" : "Bolivia") + " · Recursos Humanos";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (!window.CMFB || !CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP para usar este módulo.", "bad"); return; }
        M.dir = CMFB.tieneRolPais("direccion");
        if (!M.dir && !CMFB.tieneRolPais("rrhh")) { msg("Este módulo es de Recursos Humanos y Dirección" + (PY ? " de Paraguay" : "") + ". Tu usuario del ERP no tiene ese permiso en /centro_mando.", "bad"); return; }
        M.uid = CMFB.usuarioKey(); M.nombre = (window.CM_USUARIO && CM_USUARIO.nombre) || CMFB.nombre() || "";
        cargar();
    });
})();
