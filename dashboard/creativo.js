/* =====================================================================================================
   Estudio creativo · Marketing (Bolivia y Paraguay, el mismo módulo; cada país con su marca, moneda e historial).
   - El equipo escribe el pedido (y si quiere: formato, plataforma, duración, objetivo, oferta, público).
   - La función «creativo» (Claude como Director Creativo Senior) devuelve el paquete completo; se muestra acá con
     un botón «Copiar» en cada prompt, «Generar imagen» en los de imagen, «Pedir cambios» y descarga en texto.
   - Historial: cada paquete queda en Firestore (mkt_creativo / py_mkt_creativo) para volver a abrirlo.
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay";
    var CFG = window.CM_FIREBASE_CONFIG;
    var URL_FN = window.CM_CREATIVO_URL || (CFG ? "https://southamerica-east1-" + CFG.projectId + ".cloudfunctions.net/creativo" : null);
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
    function col() { return firebase.firestore().collection((PY ? "py_" : "") + "mkt_creativo"); }
    function fecha(ts) { var d = ts && ts.toDate ? ts.toDate() : null; if (!d) return "—"; var p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
    function copiar(texto, btn) {
        var ok = function () { var t = btn.textContent; btn.textContent = "Copiado"; setTimeout(function () { btn.textContent = t; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(texto).then(ok, function () { prompt("Copiá el texto:", texto); }); else prompt("Copiá el texto:", texto);
    }
    function btnCopiar(texto, etiqueta) { var b = el("button", { type: "button", class: "op-btn cr-copiar", text: etiqueta || "Copiar" }); b.addEventListener("click", function () { copiar(texto, b); }); return b; }

    var FORMATOS = [["", "Elegí (o que lo proponga)"], ["reel", "Reel / TikTok / Short"], ["post", "Post de feed"], ["carrusel", "Carrusel"], ["historia", "Historias"], ["campana", "Campaña completa (video + gráficas)"], ["anuncio", "Anuncio pago"], ["impreso", "Impreso (cartel, flyer, banner)"]];
    var PLATAFORMAS = [["", "Elegí (o que lo proponga)"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["facebook", "Facebook"], ["youtube", "YouTube Shorts"], ["whatsapp", "WhatsApp (estados y difusión)"], ["impreso", "Impreso en sucursal"], ["varias", "Varias redes"]];
    var IDEAS = [
        ["Recuperar clientes", "Reel de 20 segundos para recuperar a los clientes que dejaron de venir o no renovaron: que vuelvan esta semana.", "reel", "instagram"],
        ["Promo del mes", "Campaña para la promo del mes, con video corto y 3 piezas gráficas para feed e historias.", "campana", "instagram"],
        ["Primera clase", "Post y reel para que gente que nunca hizo calistenia se anime a la primera clase de prueba.", "reel", "tiktok"],
        ["Logro de un alumno", "Reel contando el progreso real de un alumno (su primera dominada) para mostrar que cualquiera puede.", "reel", "instagram"],
        ["Cartel en sucursal", "Cartel para la recepción de las sucursales con la promo y un QR para escribir por WhatsApp.", "impreso", "impreso"]
    ];
    var TIPOS = { texto: "Texto / guion (ChatGPT, Claude, Gemini)", imagen: "Imagen (Midjourney, Firefly, Gemini, Canva)", video: "Video (Runway, Kling, Veo)", voz: "Voz (ElevenLabs)", musica: "Música (Suno, Udio, librería)", edicion: "Edición (CapCut, Descript)" };

    var M = { vista: "nuevo", actual: null, form: null, cargando: false, historial: null };

    /* ---------- pestañas ---------- */
    function tabs() {
        var t = $("cr-tabs"); t.textContent = "";
        [["nuevo", "Nuevo pedido"], ["resultado", "Resultado"], ["historial", "Historial"]].forEach(function (x) {
            if (x[0] === "resultado" && !M.actual) return;
            var b = el("button", { type: "button", role: "tab", class: M.vista === x[0] ? "is-on" : "", "aria-selected": M.vista === x[0] ? "true" : "false", text: x[1] });
            b.addEventListener("click", function () { M.vista = x[0]; pintar(); });
            t.appendChild(b);
        });
    }
    function pintar() {
        tabs();
        var v = $("cr-vista"); v.textContent = "";
        if (M.vista === "historial") v.appendChild(historial());
        else if (M.vista === "resultado" && M.actual) v.appendChild(resultado(M.actual));
        else v.appendChild(formulario());
    }

    /* ---------- pedido ---------- */
    function formulario() {
        var f0 = M.form || {};
        var ped = el("textarea", { rows: "5", maxlength: "3000", placeholder: "Ej.: Reel para que los clientes que no renovaron vuelvan esta semana. Tono motivador, nada de culpa. Promo: 2x1 en el plan mensual.", id: "cr-pedido" });
        ped.value = f0.pedido || "";
        var sel = function (ops, v) { return el("select", {}, ops.map(function (o) { return el("option", { value: o[0], text: o[1], selected: o[0] === (v || "") }); })); };
        var formato = sel(FORMATOS, f0.formato), plataforma = sel(PLATAFORMAS, f0.plataforma);
        var inp = function (v, ph, max) { var i = el("input", { type: "text", maxlength: String(max), placeholder: ph }); i.value = v || ""; return i; };
        var duracion = inp(f0.duracion, "Ej.: 20 s", 40), objetivo = inp(f0.objetivo, "Ej.: que escriban por WhatsApp / que vengan a la clase de prueba", 300);
        var oferta = inp(f0.oferta, "Ej.: 2x1 plan mensual hasta el 30/11 (" + (PY ? "Gs" : "Bs") + " …)", 500), publico = inp(f0.publico, "Ej.: ex clientes de 20 a 35 años", 300);
        var extra = el("textarea", { rows: "3", maxlength: "1500", placeholder: "Cualquier otra indicación: sucursal, entrenador o alumno que aparece, qué evitar, referencias…" }); extra.value = f0.extra || "";
        var btn = el("button", { type: "submit", class: "op-btn is-rojo", text: "Crear el paquete" });
        var ideas = el("div", { class: "cr-ideas" }, [el("span", { class: "op-muted", text: "Ideas rápidas:" })].concat(IDEAS.map(function (i) {
            return el("button", { type: "button", class: "op-btn", text: i[0], onclick: function () { ped.value = i[1]; formato.value = i[2]; plataforma.value = i[3]; ped.focus(); } });
        })));
        var f = el("form", { class: "op-card cr-form" }, [
            ideas,
            el("label", { class: "op-campo" }, ["¿Qué necesitás? *", ped]),
            el("div", { class: "cr-grid" }, [
                el("label", { class: "op-campo" }, ["Formato", formato]), el("label", { class: "op-campo" }, ["Plataforma", plataforma]),
                el("label", { class: "op-campo" }, ["Duración", duracion]), el("label", { class: "op-campo" }, ["Objetivo", objetivo]),
                el("label", { class: "op-campo" }, ["Oferta / precio", oferta]), el("label", { class: "op-campo" }, ["Público", publico])
            ]),
            el("label", { class: "op-campo" }, ["Indicaciones extra", extra]),
            el("p", { class: "op-muted", text: "Lo que no completes, el Director Creativo lo asume y te dice qué asumió. Tarda entre 1 y 3 minutos." }),
            el("div", { class: "op-acc" }, [btn])
        ]);
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            var datos = { pedido: ped.value.trim(), formato: formato.value, plataforma: plataforma.value, duracion: duracion.value.trim(), objetivo: objetivo.value.trim(), oferta: oferta.value.trim(), publico: publico.value.trim(), extra: extra.value.trim() };
            if (datos.pedido.length < 5) { msg("Escribí qué necesitás.", "bad"); ped.focus(); return; }
            M.form = datos;
            pedir(datos, btn);
        });
        return f;
    }
    var FRASES = ["Pensando el concepto…", "Buscando el gancho de los primeros 3 segundos…", "Armando la dirección de arte…", "Escribiendo el guion por segundos…", "Preparando los prompts para cada IA…", "Revisando el checklist y las pruebas A/B…"];
    function pedir(datos, btn) {
        if (M.cargando) return;
        if (!URL_FN) { msg("Falta configurar Firebase.", "bad"); return; }
        M.cargando = true; if (btn) btn.disabled = true;
        var t0 = Date.now(), i = 0;
        var reloj = setInterval(function () { var s = Math.round((Date.now() - t0) / 1000); msg(FRASES[Math.min(Math.floor(s / 20), FRASES.length - 1)] + " (" + s + " s)"); i++; }, 1000);
        msg(FRASES[0]);
        firebase.auth().currentUser.getIdToken().then(function (tk) {
            return fetch(URL_FN, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk }, body: JSON.stringify(Object.assign({ pais: PY ? "paraguay" : "bolivia" }, datos)) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.paquete) throw new Error(d.error || "El estudio no respondió (" + r.status + ")."); return d; }); })
            .then(function (d) {
                M.actual = { id: d.id, datos: datos, paquete: d.paquete, modelo: d.modelo };
                M.historial = null; M.vista = "resultado"; msg("Listo. Revisalo y copiá cada prompt en su herramienta.", "ok"); pintar(); window.scrollTo(0, 0);
            }, function (e) { msg(e.message || String(e), "bad"); })
            .then(function () { clearInterval(reloj); M.cargando = false; if (btn) btn.disabled = false; });
    }

    /* ---------- resultado ---------- */
    function seccion(titulo, hijos, extra) { return el("section", { class: "op-card cr-sec" + (extra ? " " + extra : "") }, [el("h2", { text: titulo })].concat(hijos)); }
    function lista(items) { return items && items.length ? el("ul", { class: "cr-lista" }, items.map(function (x) { return el("li", { text: x }); })) : el("p", { class: "op-vacio", text: "—" }); }
    function dato(t, v) { return v ? el("p", { class: "cr-dato" }, [el("b", { text: t + ": " }), v]) : null; }
    function aspectoDe(s) { var m = /(\d+)\s*[:x×]\s*(\d+)/.exec(String(s || "")); if (!m) return "4:5"; var a = Number(m[1]), b = Number(m[2]); if (a > 50) { var r = a / b; return r > 1.6 ? "16:9" : r > 1.1 ? "4:3" : r > 0.95 ? "1:1" : r > 0.7 ? "4:5" : "9:16"; } return a + ":" + b; }
    function generarImagen(prompt, aspecto, caja, btn) {
        btn.disabled = true; var t = btn.textContent; btn.textContent = "Generando…";
        firebase.auth().currentUser.getIdToken().then(function (tk) {
            return fetch(URL_FN, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk }, body: JSON.stringify({ pais: PY ? "paraguay" : "bolivia", accion: "imagen", prompt: prompt, aspecto: aspectoDe(aspecto) }) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.datos) throw new Error(d.error || "No se pudo generar (" + r.status + ")."); return d; }); })
            .then(function (d) {
                var src = "data:" + d.mime + ";base64," + d.datos;
                var n = caja.querySelectorAll("figure").length + 1;
                caja.appendChild(el("figure", { class: "cr-img" }, [el("img", { src: src, alt: "Imagen generada " + n }), el("figcaption", {}, [el("a", { href: src, download: "estudio-creativo-" + n + "." + (d.mime.split("/")[1] || "png"), class: "op-link", text: "Descargar" })])]));
            }, function (e) { caja.appendChild(el("p", { class: "op-msg is-bad", text: e.message })); })
            .then(function () { btn.disabled = false; btn.textContent = t; });
    }
    function resultado(a) {
        var p = a.paquete || {};
        var wrap = el("div", { class: "cr-res" });
        var c = p.concepto || {}, d = p.direccion_arte || {}, co = p.copies || {};
        wrap.appendChild(el("div", { class: "op-acc cr-cab" }, [
            el("h2", { class: "cr-titulo", text: p.titulo || "Paquete creativo" }),
            el("button", { type: "button", class: "op-btn", text: "Descargar todo (.txt)", onclick: function () { descargar(a); } }),
            btnCopiar(aTexto(a), "Copiar todo")
        ]));
        wrap.appendChild(produccion(a));
        if (p.supuestos && p.supuestos.length) wrap.appendChild(seccion("Lo que asumí", [lista(p.supuestos)], "is-aviso"));
        wrap.appendChild(seccion("1. Concepto creativo y ángulo", [el("p", { class: "cr-idea", text: c.idea || "" }), dato("Ángulo", c.angulo), dato("Emoción / tensión", c.emocion), dato("Por qué funciona", c.por_que_funciona)]));
        var paleta = el("div", { class: "cr-paleta" }, (d.paleta || []).map(function (x) { var m = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.exec(x); return el("span", {}, [m ? el("i", { style: "background:" + m[0] }) : null, x]); }));
        wrap.appendChild(seccion("2. Dirección de arte", [paleta, dato("Tipografía", d.tipografia), dato("Luz", d.luz), dato("Cámara y encuadre", d.camara_y_encuadre), dato("Textura y estilo", d.textura_y_estilo), dato("Casting y vestuario", d.casting_y_vestuario), d.evitar && d.evitar.length ? el("div", {}, [el("b", { text: "Evitar:" }), lista(d.evitar)]) : null]));
        if (p.guion && p.guion.length) {
            wrap.appendChild(seccion("Guion del video", [el("div", { class: "op-scroll" }, [el("table", { class: "op-tabla cr-guion" }, [
                el("thead", {}, [el("tr", {}, ["Tiempo", "Parte", "Plano", "Acción", "Texto en pantalla", "Voz", "Audio"].map(function (t) { return el("th", { text: t }); }))]),
                el("tbody", {}, p.guion.map(function (g) { return el("tr", {}, [g.tiempo, g.parte, g.plano, g.accion, g.texto_pantalla, g.voz, g.audio].map(function (x) { return el("td", { text: x || "—" }); })); }))
            ])])]));
        }
        if (p.piezas_graficas && p.piezas_graficas.length) {
            wrap.appendChild(seccion("Piezas gráficas", [el("div", { class: "cr-piezas" }, p.piezas_graficas.map(function (g) {
                return el("div", { class: "cr-pieza" }, [el("small", { text: (g.formato || "") }), el("b", { text: g.nombre || "" }), el("p", { class: "cr-tit", text: g.titular || "" }), el("p", { text: g.texto_apoyo || "" }), g.cta ? el("p", { class: "cr-cta", text: g.cta }) : null, el("p", { class: "op-muted", text: g.idea || "" })]);
            }))]));
        }
        var bloqueCopies = el("div", { class: "cr-copies" }, [
            el("div", { class: "cr-prompt" }, [el("div", { class: "op-acc" }, [el("b", { text: "Texto de la publicación" }), btnCopiar(co.texto_principal || "")]), el("pre", { text: co.texto_principal || "" })]),
            el("div", { class: "cr-dos" }, [
                el("div", {}, [el("b", { text: "Titulares" }), lista(co.titulares)]), el("div", {}, [el("b", { text: "Hooks alternativos" }), lista(co.hooks)]),
                el("div", {}, [el("b", { text: "CTA" }), lista(co.ctas)]), el("div", {}, [el("b", { text: "Hashtags" }), el("p", { text: (co.hashtags || []).join(" ") }), co.hashtags && co.hashtags.length ? btnCopiar((co.hashtags || []).join(" ")) : null])
            ])
        ]);
        wrap.appendChild(seccion("Copies", [bloqueCopies]));
        var grupos = {};
        (p.prompts || []).forEach(function (x) { (grupos[x.tipo] = grupos[x.tipo] || []).push(x); });
        var orden = ["texto", "imagen", "video", "voz", "musica", "edicion"];
        wrap.appendChild(seccion("3. Prompts listos para cada IA", orden.filter(function (k) { return grupos[k]; }).map(function (k) {
            return el("div", { class: "cr-grupo" }, [el("h3", { text: TIPOS[k] || k })].concat(grupos[k].map(function (x) {
                var caja = el("div", { class: "cr-imgs" });
                var gen = k === "imagen" ? el("button", { type: "button", class: "op-btn is-fuerte", text: "Generar imagen acá" }) : null;
                if (gen) gen.addEventListener("click", function () { generarImagen(x.prompt, x.relacion_aspecto, caja, gen); });
                return el("div", { class: "cr-prompt" }, [
                    el("div", { class: "op-acc" }, [el("b", { text: x.herramienta || "" }), x.relacion_aspecto ? el("span", { class: "op-chip", text: x.relacion_aspecto }) : null, el("span", { class: "op-muted", text: x.para_que || "" })]),
                    el("pre", { text: x.prompt || "" }),
                    el("div", { class: "op-acc" }, [btnCopiar(x.prompt || ""), gen]),
                    caja
                ]);
            })));
        })));
        wrap.appendChild(seccion("4. Checklist antes de publicar", [el("ul", { class: "cr-check" }, (p.checklist || []).map(function (x) { return el("li", {}, [el("label", {}, [el("input", { type: "checkbox" }), " " + x])]); }))]));
        if (p.pruebas_ab && p.pruebas_ab.length) {
            wrap.appendChild(seccion("Pruebas A/B para escalar", [el("div", { class: "op-scroll" }, [el("table", { class: "op-tabla" }, [
                el("thead", {}, [el("tr", {}, ["Qué se prueba", "Versión A", "Versión B", "Métrica"].map(function (t) { return el("th", { text: t }); }))]),
                el("tbody", {}, p.pruebas_ab.map(function (g) { return el("tr", {}, [g.variable, g.version_a, g.version_b, g.metrica].map(function (x) { return el("td", { text: x || "—" }); })); }))
            ])])]));
        }
        var cambios = el("textarea", { rows: "3", maxlength: "2000", placeholder: "Ej.: el gancho más fuerte y sin texto al principio; cambiá la música por algo más urbano; agregá una versión para historias." });
        var bc = el("button", { type: "submit", class: "op-btn is-rojo", text: "Rehacer con estos cambios" });
        var fc = el("form", { class: "cr-cambios" }, [cambios, el("div", { class: "op-acc" }, [bc])]);
        fc.addEventListener("submit", function (e) {
            e.preventDefault();
            if (cambios.value.trim().length < 3) { msg("Escribí qué querés cambiar.", "bad"); return; }
            pedir(Object.assign({}, a.datos, { anterior: a.paquete, cambios: cambios.value.trim(), base: a.id || null }), bc);
        });
        wrap.appendChild(seccion("¿Querés cambios?", [fc]));
        if (a.modelo || a.autor_nombre) wrap.appendChild(el("p", { class: "op-muted cr-pie", text: [a.autor_nombre ? "Pedido por " + a.autor_nombre : "", a.fecha ? fecha(a.fecha) : ""].filter(Boolean).join(" · ") }));
        return wrap;
    }

    /* ---------- producción: el contenido se fabrica acá (imágenes, voz, música, escenas o video IA y el reel) ---------- */
    var PRECIO = { imagen: 0.04, musica: 0.06, veo_seg: 0.10 };
    function durGuion(p) { return (p.guion || []).map(function (g) { var n = String(g.tiempo || "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) || []; var d = n.length >= 2 ? Number(n[1]) - Number(n[0]) : 3; return Math.min(10, Math.max(1.5, d > 0 ? d : 3)); }); }
    function estimar(p, op) {
        var g = (p.guion || []).slice(0, 8), usd = 0, items = [];
        var nImg = op.imagenes ? ((p.piezas_graficas || []).length ? Math.min(4, p.piezas_graficas.length) : Math.min(3, (p.prompts || []).filter(function (x) { return x.tipo === "imagen"; }).length)) : 0;
        if (nImg) { usd += nImg * PRECIO.imagen; items.push(nImg + (nImg === 1 ? " imagen terminada" : " imágenes terminadas")); }
        if (op.voz && g.some(function (x) { return String(x.voz || "").trim().length > 1; })) items.push("voz en off");
        if (op.musica && g.length) { usd += PRECIO.musica; items.push("música"); }
        if (g.length && op.video === "imagenes") { usd += g.length * PRECIO.imagen; items.push(g.length + " escenas + reel armado"); }
        if (g.length && op.video === "ia") { var seg = durGuion(p).slice(0, 8).reduce(function (a, d) { return a + (d <= 4 ? 4 : d <= 6 ? 6 : 8); }, 0); usd += seg * PRECIO.veo_seg; items.push(g.length + " videos IA (" + seg + " s) + reel armado"); }
        return { usd: usd, items: items };
    }
    function produccion(a) {
        var p = a.paquete || {}, cont = el("section", { class: "op-card cr-sec cr-prod is-rojo" }, [el("h2", { text: "Producir el contenido acá" })]);
        if (!a.id) { cont.appendChild(el("p", { class: "op-muted", text: "Este paquete no quedó guardado; volvé a crearlo para poder producirlo." })); return cont; }
        var hayGuion = (p.guion || []).length > 0, hayVoz = (p.guion || []).some(function (g) { return String(g.voz || "").trim().length > 1; });
        var chk = function (txt, on, dis) { var i = el("input", { type: "checkbox", checked: on && !dis, disabled: dis }); return { i: i, l: el("label", { class: "cr-op" + (dis ? " is-off" : "") }, [i, " " + txt]) }; };
        var cImg = chk("Imágenes terminadas de las piezas (con titular y CTA)", true, !((p.piezas_graficas || []).length || (p.prompts || []).some(function (x) { return x.tipo === "imagen"; })));
        var cVoz = chk("Voz en off del guion", true, !hayVoz), cMus = chk("Música instrumental", true, !hayGuion);
        var radio = function (v, txt, on) { var i = el("input", { type: "radio", name: "cr-video-" + a.id, value: v, checked: on, disabled: !hayGuion && v !== "no" }); return el("label", { class: "cr-op" + (!hayGuion && v !== "no" ? " is-off" : "") }, [i, " " + txt]); };
        var vids = el("fieldset", { class: "cr-video" }, [el("legend", { text: "Video" }), radio("imagenes", "Reel armado con escenas generadas y animadas (económico)", hayGuion), radio("ia", "Reel con video generado por IA (Veo: más real, más caro)", false), radio("no", "Sin video", !hayGuion)]);
        var costo = el("p", { class: "op-muted cr-costo" });
        var op = function () { var r = vids.querySelector("input:checked"); return { imagenes: cImg.i.checked, voz: cVoz.i.checked, musica: cMus.i.checked, video: r ? r.value : "no" }; };
        var recalcular = function () { var e = estimar(p, op()); costo.textContent = e.items.length ? "Se va a crear: " + e.items.join(", ") + ". Costo aproximado: US$ " + e.usd.toFixed(2) + " (se cobra al proyecto de Google Cloud)." : "Elegí qué producir."; btn.disabled = !e.items.length; };
        var btn = el("button", { type: "button", class: "op-btn is-rojo", text: "Producir" });
        [cImg.i, cVoz.i, cMus.i].forEach(function (i) { i.addEventListener("change", recalcular); }); vids.addEventListener("change", recalcular);
        var estado = el("div", { class: "cr-estado" });
        /* Datos que quedaron como [MARCADOR]: se completan acá para que no aparezcan corchetes en las imágenes ni en el reel. */
        var marcas = [], vistos = {};
        (JSON.stringify(p).match(/\[[A-ZÁÉÍÓÚÑÜ0-9][A-ZÁÉÍÓÚÑÜ0-9 _\/\-.,:$]{1,40}\]/g) || []).forEach(function (m) { if (!vistos[m]) { vistos[m] = 1; marcas.push(m); } });
        var campos = marcas.slice(0, 20).map(function (m) { var i = el("input", { type: "text", maxlength: "160", placeholder: "Ej.: " + ejemplo(m) }); return { m: m, i: i, l: el("label", { class: "op-campo" }, [m.replace(/[\[\]]/g, ""), i]) }; });
        btn.addEventListener("click", function () {
            var o = op(), e = estimar(p, o), reemplazos = {}, vacios = [];
            campos.forEach(function (c) { var v = c.i.value.trim(); if (v) reemplazos[c.m] = v; else vacios.push(c.m); });
            if (vacios.length && !confirm("Faltan completar: " + vacios.join(", ") + ".\nSi seguís, se quitan del contenido y alguna frase puede quedar incompleta. ¿Seguimos igual?")) { (campos.filter(function (c) { return !c.i.value.trim(); })[0] || {}).i.focus(); return; }
            o.reemplazos = reemplazos;
            if (!confirm("Se va a crear: " + e.items.join(", ") + ".\nCosto aproximado: US$ " + e.usd.toFixed(2) + ".\nTarda de 2 a 15 minutos según lo elegido (el video IA es lo más lento). ¿Seguimos?")) return;
            btn.disabled = true; msg("Arrancando la producción…");
            firebase.auth().currentUser.getIdToken().then(function (tk) {
                return fetch(URL_FN, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk }, body: JSON.stringify({ pais: PY ? "paraguay" : "bolivia", accion: "producir", id: a.id, opciones: o, reemplazos: o.reemplazos }) });
            }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.produccion_id) throw new Error(d.error || "No se pudo arrancar (" + r.status + ")."); return d; }); })
                .then(function (d) { msg("Produciendo. Podés quedarte acá o volver más tarde: queda guardado.", "ok"); seguir(d.produccion_id, estado); }, function (err) { msg(err.message, "bad"); btn.disabled = false; });
        });
        cont.appendChild(el("p", { class: "op-muted", text: "Lo fabrica acá mismo, con las herramientas de Google: las imágenes finales con su texto, la voz, la música y el reel armado con texto en pantalla, listo para subir." }));
        if (campos.length) cont.appendChild(el("div", { class: "cr-marcas" }, [el("b", { text: "Completá estos datos antes de producir (van tal cual en las imágenes y en el reel):" }), el("div", { class: "cr-grid" }, campos.map(function (c) { return c.l; }))]));
        [cImg.l, cVoz.l, cMus.l].forEach(function (x) { cont.appendChild(x); });
        cont.appendChild(vids); cont.appendChild(costo); cont.appendChild(el("div", { class: "op-acc" }, [btn])); cont.appendChild(estado);
        recalcular();
        firebase.firestore().collection("mkt_produccion").where("pais", "==", PY ? "paraguay" : "bolivia").where("creativo_id", "==", a.id).get().then(function (q) {
            var l = q.docs.map(function (x) { return { id: x.id, f: (x.data().fecha && x.data().fecha.toMillis && x.data().fecha.toMillis()) || 0 }; }).sort(function (x, y) { return y.f - x.f; });
            if (l.length) seguir(l[0].id, estado);
        }, function () {});
        return cont;
    }
    function ejemplo(m) {
        var x = m.toLowerCase();
        if (/precio|monto|costo/.test(x)) return PY ? "250.000 Gs" : "210 Bs";
        if (/fecha|d[ií]a|hasta/.test(x)) return "30/11";
        if (/hora/.test(x)) return "18:00";
        if (/whats|n[uú]mero|tel/.test(x)) return PY ? "0981 000 000" : "7000 0000";
        if (/sede|sucursal/.test(x)) return PY ? "Multiplaza" : "Equipetrol";
        if (/link|enlace/.test(x)) return "wa.me/591…";
        if (/incluye/.test(x)) return "12 clases + evaluación";
        return "el dato real";
    }
    var escucha = null;
    function seguir(id, caja) {
        if (escucha) { escucha(); escucha = null; }
        escucha = firebase.firestore().collection("mkt_produccion").doc(id).onSnapshot(function (s) { if (s.exists) pintarProduccion(s.data(), caja); }, function (e) { caja.textContent = ""; caja.appendChild(el("p", { class: "op-msg is-bad", text: String(e.message || e) })); });
    }
    function bajarBtn(f, nombre) { return el("a", { class: "op-btn cr-copiar", href: f.url, download: nombre || "", target: "_blank", rel: "noopener", text: "Descargar" }); }
    function pintarProduccion(d, caja) {
        caja.textContent = "";
        var total = (d.pasos || []).length, hechos = Math.min(d.paso_i || 0, total), R = d.resultados || {};
        var listo = d.estado === "listo";
        caja.appendChild(el("div", { class: "cr-prog" }, [el("i", { style: "width:" + (total ? Math.round(hechos / total * 100) : 0) + "%" })]));
        caja.appendChild(el("p", { class: "op-msg" + (listo ? " is-ok" : ""), text: listo ? "¡Listo! Todo el contenido está abajo para ver y descargar." : "Produciendo (" + hechos + " de " + total + "): " + (d.avance || "…") }));
        (d.errores || []).forEach(function (e) { caja.appendChild(el("p", { class: "op-msg is-warn", text: "No salió: " + e })); });
        if (R.reel) caja.appendChild(el("div", { class: "cr-out" }, [el("h3", { text: "Reel final (" + (R.reel.segundos || "") + " s)" }), el("video", { src: R.reel.url, controls: true, playsinline: true, preload: "metadata", class: "cr-video-out" }), el("div", { class: "op-acc" }, [bajarBtn(R.reel, "reel.mp4")])]));
        var imgs = (R.imagenes || []).slice().sort(function (x, y) { return x.i - y.i; });
        if (imgs.length) caja.appendChild(el("div", { class: "cr-out" }, [el("h3", { text: "Imágenes terminadas" }), el("div", { class: "cr-imgs" }, imgs.map(function (f) { return el("figure", { class: "cr-img" }, [el("img", { src: f.url, alt: f.nombre || "Imagen", loading: "lazy" }), el("figcaption", {}, [el("span", { text: (f.nombre || "") + " · " + (f.aspecto || "") }), " ", bajarBtn(f)])]); }))]));
        if (R.voz) caja.appendChild(el("div", { class: "cr-out" }, [el("h3", { text: "Voz en off" }), el("audio", { src: R.voz.url, controls: true, preload: "none" }), el("div", { class: "op-acc" }, [bajarBtn(R.voz, "voz.mp3")])]));
        if (R.musica) caja.appendChild(el("div", { class: "cr-out" }, [el("h3", { text: "Música" }), el("audio", { src: R.musica.url, controls: true, preload: "none" }), el("div", { class: "op-acc" }, [bajarBtn(R.musica)])]));
        var esc = Object.keys(R.escenas || {}).sort(function (x, y) { return x - y; }).map(function (k) { return R.escenas[k]; });
        if (esc.length) caja.appendChild(el("div", { class: "cr-out" }, [el("h3", { text: "Escenas" }), el("div", { class: "cr-imgs is-chicas" }, esc.map(function (f, i) { return el("figure", { class: "cr-img" }, [el("img", { src: f.url, alt: "Escena " + (i + 1), loading: "lazy" }), el("figcaption", {}, [bajarBtn(f)])]); }))]));
        var clips = Object.keys(R.clips || {}).sort(function (x, y) { return x - y; }).map(function (k) { return R.clips[k]; });
        if (clips.length) caja.appendChild(el("div", { class: "cr-out" }, [el("h3", { text: "Videos de cada escena" }), el("div", { class: "cr-imgs is-chicas" }, clips.map(function (f) { return el("figure", { class: "cr-img" }, [el("video", { src: f.url, controls: true, playsinline: true, preload: "metadata" }), el("figcaption", {}, [bajarBtn(f)])]); }))]));
    }

    /* ---------- texto plano (copiar / descargar) ---------- */
    function aTexto(a) {
        var p = a.paquete || {}, c = p.concepto || {}, d = p.direccion_arte || {}, co = p.copies || {}, L = [];
        var li = function (arr) { (arr || []).forEach(function (x) { L.push("- " + x); }); };
        L.push("# " + (p.titulo || "Paquete creativo"), "", "Pedido: " + ((a.datos && a.datos.pedido) || ""), "");
        if (p.supuestos && p.supuestos.length) { L.push("## Lo que asumí"); li(p.supuestos); L.push(""); }
        L.push("## 1. Concepto", c.idea || "", "Ángulo: " + (c.angulo || ""), "Emoción: " + (c.emocion || ""), "Por qué funciona: " + (c.por_que_funciona || ""), "");
        L.push("## 2. Dirección de arte", "Paleta: " + (d.paleta || []).join(", "), "Tipografía: " + (d.tipografia || ""), "Luz: " + (d.luz || ""), "Cámara y encuadre: " + (d.camara_y_encuadre || ""), "Textura y estilo: " + (d.textura_y_estilo || ""), "Casting y vestuario: " + (d.casting_y_vestuario || ""), "Evitar:"); li(d.evitar); L.push("");
        if (p.guion && p.guion.length) { L.push("## Guion"); p.guion.forEach(function (g) { L.push("[" + g.tiempo + "] " + g.parte + " · " + g.plano, "  Acción: " + g.accion, "  Texto en pantalla: " + g.texto_pantalla, "  Voz: " + g.voz, "  Audio: " + g.audio); }); L.push(""); }
        if (p.piezas_graficas && p.piezas_graficas.length) { L.push("## Piezas gráficas"); p.piezas_graficas.forEach(function (g) { L.push("* " + g.nombre + " (" + g.formato + ")", "  Titular: " + g.titular, "  Texto: " + g.texto_apoyo, "  CTA: " + g.cta, "  Idea: " + g.idea); }); L.push(""); }
        L.push("## Copies", co.texto_principal || "", "", "Titulares:"); li(co.titulares); L.push("Hooks:"); li(co.hooks); L.push("CTA:"); li(co.ctas); L.push("Hashtags: " + (co.hashtags || []).join(" "), "");
        L.push("## 3. Prompts"); (p.prompts || []).forEach(function (x) { L.push("### " + (x.herramienta || "") + " · " + (x.tipo || "") + (x.relacion_aspecto ? " · " + x.relacion_aspecto : ""), x.para_que || "", "", x.prompt || "", ""); });
        L.push("## 4. Checklist"); li(p.checklist); L.push("");
        if (p.pruebas_ab && p.pruebas_ab.length) { L.push("## Pruebas A/B"); p.pruebas_ab.forEach(function (g) { L.push("- " + g.variable + ": A) " + g.version_a + " / B) " + g.version_b + " → " + g.metrica); }); }
        return L.join("\n");
    }
    function descargar(a) {
        var nombre = String((a.paquete && a.paquete.titulo) || "paquete").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "paquete";
        var link = el("a", { href: URL.createObjectURL(new Blob([aTexto(a)], { type: "text/plain;charset=utf-8" })), download: "estudio-creativo-" + nombre + ".txt" });
        document.body.appendChild(link); link.click(); link.remove();
    }

    /* ---------- historial ---------- */
    function historial() {
        var wrap = el("div", { class: "cr-hist" });
        if (!M.historial) {
            wrap.appendChild(el("p", { class: "op-muted", text: "Cargando…" }));
            col().orderBy("fecha", "desc").limit(40).get().then(function (q) {
                M.historial = q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); if (M.vista === "historial") pintar();
            }, function (e) { wrap.textContent = ""; wrap.appendChild(el("p", { class: "op-msg is-bad", text: e && e.code === "permission-denied" ? "Tu usuario no tiene permiso de Marketing o Dirección para ver el historial." : String(e && e.message || e) })); });
            return wrap;
        }
        if (!M.historial.length) { wrap.appendChild(el("p", { class: "op-vacio", text: "Todavía no hay paquetes." })); return wrap; }
        wrap.appendChild(el("div", { class: "op-scroll" }, [el("table", { class: "op-tabla" }, [
            el("thead", {}, [el("tr", {}, ["Fecha", "Título", "Pedido", "Por"].map(function (t) { return el("th", { text: t }); }))]),
            el("tbody", {}, M.historial.map(function (h) {
                return el("tr", { class: "is-clic", onclick: function () {
                    M.actual = { id: h.id, datos: { pedido: h.pedido, formato: h.formato || "", plataforma: h.plataforma || "", duracion: h.duracion || "", objetivo: h.objetivo || "", oferta: h.oferta || "", publico: h.publico || "", extra: h.extra || "" }, paquete: h.paquete, modelo: h.modelo, autor_nombre: h.autor_nombre, fecha: h.fecha };
                    M.vista = "resultado"; msg(""); pintar(); window.scrollTo(0, 0);
                } }, [el("td", { text: fecha(h.fecha) }), el("td", { text: (h.paquete && h.paquete.titulo) || "—" }), el("td", { text: (h.cambios ? "Cambios: " + h.cambios : h.pedido || "").slice(0, 110) }), el("td", { text: h.autor_nombre || "—" })]);
            }))
        ])]));
        return wrap;
    }

    /* ---------- arranque ---------- */
    $("op-eyebrow").textContent = "Calistenia Company · " + (PY ? "Paraguay" : "Bolivia") + " · Marketing";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (!window.CMFB || !CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP para usar este módulo.", "bad"); return; }
        if (!CMFB.tieneRolPais("marketing") && !CMFB.tieneRolPais("direccion")) { msg("Este módulo es de Marketing y Dirección" + (PY ? " de Paraguay" : "") + ". Tu usuario del ERP no tiene ese permiso en /centro_mando.", "bad"); return; }
        msg(""); pintar();
    });
})();
