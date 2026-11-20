/* Lista de clientes de cada ATC (Atención al Cliente): los que le asignó el Jefe de ATC en el Plan de hoy.
   Pantalla simple, pensada para el celular: avance del día, lo que reportó en el mes, y por cliente
   Llamar, Mandar mensaje (WhatsApp con el texto y su nombre), guion, y «¿Cómo te fue?».
   Se monta desde comercial.js: window.ATC_milista.montar(contenedor, ctx)
   ctx = { yo, asignaciones, ultimas, gestiones, guiones, tareas, comisiones, llamar(tool, args), avisar(texto, tono), soloVer } */
(function () {
    "use strict";
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
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function masDias(n) { var d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
    var hoy = function () { return iso(new Date()); };
    function corta(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : "—"; }
    function hora(s) { var d = new Date(String(s || "")); return isNaN(d) ? "" : pad(d.getHours()) + ":" + pad(d.getMinutes()); }
    function digitos(t) { var d = String(t || "").replace(/\D/g, ""); if (d.length === 8) d = "591" + d; return d.length >= 10 ? d : ""; }
    function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
    function fechaLarga() { var t = new Date().toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); }
    var bs = function (n) { return "Bs " + Math.round(Number(n) || 0).toLocaleString("es-BO"); };

    /* «¿Cómo te fue?» → resultado del CRM y cuándo vuelve a aparecer. */
    var RES = [
        { id: "agendado", texto: "Compró o va a pagar", final: true, grande: true },
        { id: "interesado", texto: "Lo va a pensar", seguir: 2 },
        { id: "no_contesta", texto: "Sin respuesta, le escribí", seguir: 1 },
        { id: "no_interesado", texto: "No le interesa", final: true },
        { id: "ya_activo", texto: "Ya estaba activo antes de contactarlo", final: true },
        { id: "numero_errado", texto: "No contactar (lo pidió o número equivocado)", final: true, ancho: true }
    ];
    var RESX = {}; RES.forEach(function (r) { RESX[r.id] = r; });
    var LISTA_CRM = { vencen: "por_vencer", nunca: "en_riesgo", riesgo: "en_riesgo", v1: "vencidos", v16: "vencidos", v46: "vencidos", v91: "vencidos", pases: "vencidos", cumple: "otro" };
    var INTENTO = ["Primer contacto", "Segundo contacto", "Tercer contacto", "Cuarto contacto"];

    var M = { cont: null, ctx: null, canal: {}, filtro: "pendientes", guardando: {}, buscar: "", abierto: {} };

    function misClientes() {
        var ctx = M.ctx, yo = ctx.yo && ctx.yo.key, ult = {};
        (ctx.ultimas || []).forEach(function (g) { ult[g.key_cliente] = g; });
        return (ctx.asignaciones || []).filter(function (a) { return a.lote && a.key_ejecutiva === yo && Number(a.estado == null ? 1 : a.estado) > 0; }).map(function (a) {
            var g = ult[a.key_cliente], tocado = g && String(g.fecha_on) >= String(a.fecha_on);
            var r = tocado ? RESX[g.resultado] : null, estado = "pendiente";
            if (tocado) {
                if (r && r.final) estado = "hecho";
                else if (g.proximo_seguimiento && g.proximo_seguimiento <= hoy()) estado = "seguir";
                else if (g.proximo_seguimiento) estado = "espera";
                else estado = "hecho";
            }
            return Object.assign({}, a, { ultima: tocado ? g : null, estado: estado, intentos: tocado ? (g.contactos || 1) : 0 });
        }).sort(function (x, y) { return (x.estado === "seguir" ? 0 : 1) - (y.estado === "seguir" ? 0 : 1) || (x.orden || 0) - (y.orden || 0); });
    }

    function registrar(c, res) {
        if (M.guardando[c.key_cliente] || M.ctx.soloVer) return;
        M.guardando[c.key_cliente] = true;
        var r = RESX[res], canal = M.canal[c.key_cliente] || "llamada";
        var args = { key_cliente: c.key_cliente, cliente: c.cliente, sucursal: c.sucursal, lista: LISTA_CRM[c.grupo] || "otro", canal: canal, resultado: res,
            nota: res === "agendado" ? "Compró o va a pagar" : null, proximo_seguimiento: r.seguir ? masDias(r.seguir) : null };
        pintar();
        M.ctx.llamar("comercial_gestion_registrar", args).then(function (x) {
            var g = Object.assign({ key_cliente: c.key_cliente, fecha_on: new Date().toISOString(), contactos: (c.intentos || 0) + 1, key_ejecutiva: M.ctx.yo.key }, (x && x.data) || args);
            var arr = M.ctx.ultimas || (M.ctx.ultimas = []);
            for (var i = arr.length - 1; i >= 0; i--) if (arr[i].key_cliente === c.key_cliente) arr.splice(i, 1);
            arr.push(g);
            (M.ctx.gestiones || (M.ctx.gestiones = [])).push(g);
            M.ctx.avisar(res === "agendado" ? "¡Bien! " + c.cliente + " compra. Cuando se registre la venta, suman Bs 5 a tu comisión 💰"
                : c.cliente + ": " + r.texto + (r.seguir ? ". Vuelve a aparecer el " + corta(masDias(r.seguir)) + "." : "."), "ok");
        }).catch(function (e) {
            M.ctx.avisar("No se guardó (" + c.cliente + "): " + ((e && e.message) || e), "bad");
        }).then(function () { M.guardando[c.key_cliente] = false; pintar(); });
    }

    function rellenar(t, c) {
        var nombre = String(c.cliente || "").trim().split(/\s+/)[0] || "";
        nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
        return String(t || "").replace(/\{nombre\}/g, nombre).replace(/\{sucursal\}/g, c.sucursal || "").replace(/\{promo\}/g, c.promo || "").replace(/\{atc\}/g, String((M.ctx.yo && M.ctx.yo.nombre) || "").split(" ")[0]);
    }
    function guionPara(c) {
        var gs = M.ctx.guiones || [], lista = LISTA_CRM[c.grupo] || "antiguos";
        var g = gs.filter(function (x) { return (x.lista || "antiguos") === lista; })[0] || gs[0];
        return g && g.guion_llamada ? rellenar(g.guion_llamada, c) : "";
    }

    function tarjeta(c) {
        var tel = digitos(c.telefono), wa = tel ? "https://wa.me/" + tel : "", g = c.ultima, guardando = M.guardando[c.key_cliente];
        var marcar = function (canal) { return function () { M.canal[c.key_cliente] = canal; }; };
        var guion = guionPara(c);
        var hecho = c.estado === "hecho" || c.estado === "espera";
        var cuerpo = [
            el("div", { class: "ml-cab" }, [el("span", { class: "ml-intento" + (c.intentos ? " is-repite" : ""), text: INTENTO[Math.min(c.intentos, 3)] }), el("span", { class: "ml-suc", text: c.sucursal || "" })]),
            el("h3", { class: "ml-nombre", text: c.cliente || "Cliente" }),
            el("p", { class: "ml-dato", text: [c.dato ? c.dato.charAt(0).toUpperCase() + c.dato.slice(1) : null, c.grupo_titulo].filter(Boolean).join(" · ") }),
            c.promo ? el("p", { class: "ml-ofrece" }, [el("b", { text: "Ofrecé: " }), c.promo]) : null,
            c.paquete_nombre ? el("p", { class: "ml-exclusivo" }, [el("b", { text: "Paquete exclusivo: " }), c.paquete_nombre]) : null
        ];
        if (hecho && !M.abierto[c.key_cliente]) {
            cuerpo.push(el("div", { class: "ml-hecho" }, [
                el("span", { class: "ml-res-chip is-" + (g && g.resultado === "agendado" ? "ok" : "muted"), text: (g ? (RESX[g.resultado] || { texto: g.resultado }).texto : "") + (g ? " · " + corta(g.fecha_on) + " " + hora(g.fecha_on) : "") }),
                c.estado === "espera" && g && g.proximo_seguimiento ? el("span", { class: "ml-dato", text: "Vuelve a aparecer el " + corta(g.proximo_seguimiento) }) : null,
                !M.ctx.soloVer ? el("button", { type: "button", class: "ml-link", text: "Cambiar", onclick: function () { M.abierto[c.key_cliente] = true; pintar(); } }) : null
            ]));
            return el("article", { class: "ml-cli is-hecho" }, cuerpo);
        }
        cuerpo.push(
            el("p", { class: "ml-paso", text: "Llamá. Si no atiende, mandá el mensaje por WhatsApp." }),
            el("div", { class: "ml-acc" }, [
                tel ? el("a", { class: "ml-btn ml-llamar", href: "tel:+" + tel, onclick: marcar("llamada") }, ["📞 Llamar"]) : el("span", { class: "ml-dato", text: "Sin teléfono válido" }),
                wa ? el("a", { class: "ml-btn ml-wa", href: wa + "?text=" + encodeURIComponent(c.mensaje || ""), target: "_blank", rel: "noopener", onclick: marcar("whatsapp") }, ["💬 Mandar mensaje"]) : null
            ]),
            guion ? el("details", { class: "ml-det" }, [el("summary", { text: "Guion de la llamada" }), el("p", { text: guion })]) : null,
            c.mensaje ? el("details", { class: "ml-det" }, [el("summary", { text: "Ver mensaje de WhatsApp" }), el("p", { text: c.mensaje })]) : null
        );
        if (!M.ctx.soloVer) cuerpo.push(el("div", { class: "ml-res" }, [
            el("p", { class: "ml-res-t", text: "¿Cómo te fue?" }),
            el("div", { class: "ml-res-b" }, RES.map(function (r) {
                return el("button", { type: "button", class: "ml-r" + (r.grande ? " is-compra" : "") + (r.ancho ? " is-ancho" : ""), disabled: guardando, onclick: function () { M.abierto[c.key_cliente] = false; registrar(c, r.id); } }, [r.texto]);
            }))
        ]));
        return el("article", { class: "ml-cli" + (c.intentos ? " is-repite" : "") }, cuerpo);
    }

    function pintar() {
        var cont = M.cont; if (!cont) return;
        var ctx = M.ctx, y = window.scrollY;
        cont.textContent = "";
        var todos = misClientes(), h = hoy();
        var pend = todos.filter(function (c) { return c.estado === "pendiente" || c.estado === "seguir"; });
        var hechos = todos.filter(function (c) { return c.estado === "hecho" || c.estado === "espera"; });
        var mias = (ctx.gestiones || []).filter(function (g) { return g.key_ejecutiva === ctx.yo.key; });
        var hoyG = mias.filter(function (g) { return String(g.fecha_on).slice(0, 10) === h; });
        var clientesHoy = {}; hoyG.forEach(function (g) { clientesHoy[g.key_cliente] = 1; });
        var contactosHoy = Object.keys(clientesHoy).length, ventasHoy = hoyG.filter(function (g) { return g.resultado === "agendado"; }).length;
        var mes = h.slice(0, 7), ventasMes = mias.filter(function (g) { return g.resultado === "agendado" && String(g.fecha_on).slice(0, 7) === mes; }).length;
        var confirmadas = (ctx.comisiones || []).filter(function (x) { return !x.anulada && x.key_ejecutiva === ctx.yo.key; });
        var meta = todos.length || 40;
        var lista0 = todos[0] || {};

        /* Encabezado: quién, qué día y cómo va */
        cont.appendChild(el("header", { class: "ml-top" }, [
            el("div", { class: "ml-quien" }, [el("b", { text: "Calistenia" }), el("span", { text: [String(ctx.yo.nombre || "").toUpperCase(), lista0.sucursal, lista0.lista_n ? (lista0.lista_n === 2 ? "tarde" : "mañana") : null].filter(Boolean).join(", ") })]),
            el("h2", { class: "ml-fecha", text: fechaLarga() }),
            el("div", { class: "ml-segs", "aria-hidden": "true" }, Array.from({ length: Math.min(meta, 60) }, function (_, i) { return el("i", { class: i < Math.round(Math.min(contactosHoy, meta) / meta * Math.min(meta, 60)) ? "is-on" : "" }); })),
            el("div", { class: "ml-cuenta" }, [el("span", {}, [el("b", { text: String(contactosHoy) }), " de " + meta + " contactos hechos hoy"]), el("span", { text: ventasHoy + (ventasHoy === 1 ? " venta hoy" : " ventas hoy") })]),
            el("p", { class: "ml-mes" }, ["Este mes reportaste ", el("b", { text: ventasMes + (ventasMes === 1 ? " venta" : " ventas") }), ": " + bs(ventasMes * 5) + ". ",
                confirmadas.length ? el("span", { class: "ml-ok", text: "Confirmadas por el registro de ventas: " + confirmadas.length + " (" + bs(confirmadas.length * 5) + ")." }) : "La comisión se confirma con el registro de ventas."])
        ]));

        var nota = todos.map(function (c) { return c.nota_jefa; }).filter(Boolean)[0];
        if (nota) cont.appendChild(el("div", { class: "ml-nota" }, [el("b", { text: "Del Jefe de ATC: " }), nota]));
        var tareas = (ctx.tareas || []).filter(function (t) { return !t.hecha; });
        tareas.forEach(function (t) {
            cont.appendChild(el("div", { class: "ml-nota is-tarea" }, [el("b", { text: "Tarea: " }), t.titulo + (t.indicaciones ? " — " + t.indicaciones : ""),
                !ctx.soloVer ? el("button", { type: "button", class: "ml-link", text: "Marcar hecha", onclick: function () { ctx.llamar("comercial_tarea_completar", { key: t.key }).then(function () { t.hecha = true; pintar(); ctx.avisar("Tarea hecha."); }, function (e) { ctx.avisar((e && e.message) || "No se pudo", "bad"); }); } }) : null]));
        });
        if (!todos.length) {
            cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "No tienes lista para hoy." }), " Avísale al Jefe de ATC: cada cliente que compra son Bs 5 para ti."]));
            return;
        }
        if (!pend.length) cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "¡Terminaste tu lista!" }), " Pídele más clientes al Jefe de ATC: más contactos, más comisión."]));
        else if (pend.length < 5) cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "Te quedan " + pend.length + " clientes." }), " Avísale al Jefe de ATC para que te cargue más."]));

        var F = [["pendientes", "Pendientes (" + pend.length + ")"], ["hechos", "Hechos (" + hechos.length + ")"], ["buscar", "Buscar"]];
        cont.appendChild(el("div", { class: "ml-tabs", role: "tablist" }, F.map(function (f) {
            return el("button", { type: "button", role: "tab", class: M.filtro === f[0] ? "is-on" : "", "aria-selected": M.filtro === f[0] ? "true" : "false", text: f[1], onclick: function () { M.filtro = f[0]; pintar(); } });
        })));
        var lista = M.filtro === "pendientes" ? pend : M.filtro === "hechos" ? hechos : [];
        if (M.filtro === "buscar") {
            var inp = el("input", { type: "search", class: "ml-buscar", placeholder: "Nombre o teléfono", value: M.buscar, "aria-label": "Buscar cliente" });
            inp.addEventListener("input", function () { M.buscar = inp.value; clearTimeout(M.t); M.t = setTimeout(function () { pintar(); var b = M.cont.querySelector(".ml-buscar"); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }, 250); });
            cont.appendChild(inp);
            var q = norm(M.buscar).trim();
            lista = q ? todos.filter(function (c) { return norm(c.cliente + " " + c.telefono).indexOf(q) >= 0; }) : [];
        }
        if (!lista.length) cont.appendChild(el("p", { class: "ml-vacio", text: M.filtro === "pendientes" ? "No te quedan clientes pendientes." : M.filtro === "hechos" ? "Todavía no contactaste a nadie de esta lista." : (M.buscar ? "No hay clientes con ese nombre o teléfono." : "Escribe un nombre o un teléfono.") }));
        var ul = el("div", { class: "ml-lista" });
        lista.forEach(function (c) { ul.appendChild(tarjeta(c)); });
        cont.appendChild(ul);
        window.scrollTo(0, y);
    }

    window.ATC_milista = {
        montar: function (cont, ctx) { M.cont = cont; M.ctx = ctx; pintar(); },
        RES: RES,
        _interno: { M: M, misClientes: misClientes, registrar: registrar }
    };
})();
