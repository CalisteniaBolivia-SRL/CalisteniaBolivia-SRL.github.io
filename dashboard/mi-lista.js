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
    /* Ícono (iconos.js); si no cargó, nada. */
    function ico(n, c) { return window.CMI ? window.CMI(n, c) : null; }
    /* Período de pago de comisiones: del 26 del mes anterior al 25 (se cobra lo confirmado hasta el 25). */
    var COMISION = window.CM_COMISION || 5;
    function periodoPago(base) {
        var d = base ? new Date(base + "T12:00:00") : new Date(), y = d.getFullYear(), m = d.getMonth();
        var ini = d.getDate() <= 25 ? new Date(y, m - 1, 26) : new Date(y, m, 26), fin = d.getDate() <= 25 ? new Date(y, m, 25) : new Date(y, m + 1, 25);
        return { desde: iso(ini), hasta: iso(fin) };
    }
    var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    function fechaCorta(s) { var p = String(s).split("-"); return Number(p[2]) + " de " + MESES[Number(p[1]) - 1]; }
    /* El monto ganado sube contando (como un marcador) cuando aumenta. */
    function contar(nodo, hasta) {
        var desde = M.mostrado == null ? hasta : M.mostrado; M.mostrado = hasta;
        if (desde === hasta || window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { nodo.textContent = (window.CM_MONEDA || "Bs") + " " + hasta.toLocaleString("es-BO"); return; }
        var t0 = null, dur = 1200;
        (function paso(t) { t0 = t0 || t; var k = Math.min(1, (t - t0) / dur), v = Math.round(desde + (hasta - desde) * (1 - Math.pow(1 - k, 3)));
            nodo.textContent = (window.CM_MONEDA || "Bs") + " " + v.toLocaleString("es-BO"); if (k < 1) requestAnimationFrame(paso); else if (hasta > desde) { nodo.classList.add("is-sube"); setTimeout(function () { nodo.classList.remove("is-sube"); }, 900); } })(performance.now());
    }
    var bs = function (n) { return (window.CM_MONEDA || "Bs") + " " + Math.round(Number(n) || 0).toLocaleString("es-BO"); };

    /* «¿Cómo te fue?» → resultado del CRM y cuándo vuelve a aparecer. */
    var RES = [
        { id: "agendado", texto: "Compró o va a pagar · +" + bs(COMISION) + " para vos", final: true, grande: true, ico: "check" },
        { id: "interesado", texto: "Lo va a pensar", seguir: 2, ico: "reloj" },
        { id: "no_contesta", texto: "Sin respuesta, le escribí", seguir: 1, ico: "mensaje" },
        { id: "no_interesado", texto: "No le interesa", final: true, ico: "x" },
        { id: "ya_activo", texto: "Ya estaba activo antes de contactarlo", final: true, ico: "usuarioOk" },
        { id: "numero_errado", texto: "No contactar (lo pidió o número equivocado)", final: true, ancho: true, ico: "prohibido" }
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
            M.ctx.avisar(res === "agendado" ? "¡Bien! " + c.cliente + " compra. Cuando se registre la venta, suman " + bs(COMISION) + " a tu comisión."
                : c.cliente + ": " + r.texto + (r.seguir ? ". Vuelve a aparecer el " + corta(masDias(r.seguir)) + "." : "."), "ok");
        }).catch(function (e) {
            M.ctx.avisar("No se guardó (" + c.cliente + "): " + ((e && e.message) || e), "bad");
        }).then(function () { M.guardando[c.key_cliente] = false; pintar(); });
    }

    function rellenar(t, c) {
        var nombre = String(c.cliente || "").trim().split(/\s+/)[0] || "";
        nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
        return String(t || "").replace(/\{nombre\}/g, nombre).replace(/\{sucursal\}/g, c.sucursal || "").replace(/\{promo\}/g, promoEnFrase(c.promo)).replace(/\{atc\}/g, nombreAtc());
    }
    /* «Promo Reactívate…» dentro de una frase va en minúscula; «PLAN MENSUAL…» queda igual. */
    function promoEnFrase(p) { p = String(p || ""); return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(p) && !/^(Promo|Plan)\b/.test(p) ? p.charAt(0).toLowerCase() + p.slice(1) : p; }
    function nombreAtc() {
        var n = String((M.ctx.yo && M.ctx.yo.nombre) || "").trim().split(/\s+/)[0] || "";
        return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "el equipo";
    }
    /* Guion de llamada de cada grupo (vendedor de primera: saludo con energía, conexión, oferta, cierre con dos opciones
       y respuestas a las objeciones típicas). Si el Jefe de ATC escribió un guion propio, se muestra además. */
    var CIERRE = "\n\nSi dice «lo voy a pensar»: «¡Claro! ¿Qué es lo que te hace dudar: el precio o el horario?» Resolvé eso y volvé a cerrar.\nSi dice «no tengo tiempo»: «Justamente por eso tenemos clases de una hora en varios horarios. ¿Cuál te queda mejor?»\n{caro}Cerrá siempre con dos opciones (¿hoy o mañana?, ¿mañana o tarde?), nunca con un «¿sí o no?».";
    var GUIONES = {
        vencen: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}, ¿cómo estás? ¿Tenés un minutito?»\n2. «Te llamo porque tu plan vence pronto y me encanta cómo venís entrenando. ¿Cómo te sentís con tus avances?» (Escuchá y felicitá su avance.)\n3. «Para que no cortes el ritmo, si renovás antes tenés {promo}»\n4. Cierre: «¿Te lo dejo listo hoy o preferís pasar mañana por caja?»",
        nunca: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}. ¡Qué bueno tenerte con nosotros! ¿Cómo estás?»\n2. «Vi que tu plan ya está activo y todavía no pudiste venir. ¿Qué te complicó?» (Escuchá: horario, miedo a no poder, trabajo.)\n3. «Tranqui, a todos nos pasa al principio. Las clases son para todos los niveles y el coach te acompaña desde cero.»\n4. Cierre: «¿Te anoto para mañana en la mañana o en la tarde?»",
        v1: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}. ¡Te extrañamos!»\n2. «Tu plan terminó hace poquito y sería una pena perder lo que avanzaste. ¿Qué te gustó más de entrenar con nosotros?»\n3. «Para que vuelvas esta semana te guardé {promo}»\n4. Cierre: «¿Te reservo tu lugar para mañana o pasado?»",
        pases: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}. ¡Gracias por venir a entrenar con nosotros!»\n2. «¿Qué te pareció la clase?» (Escuchá y reforzá lo bueno.)\n3. «Te cuento algo que te conviene: con {promo} Entrenás todo el mes sin pagar cada día.»\n4. Cierre: «¿Te lo activo hoy para que arranques esta semana?»",
        v16: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}. ¡Hace rato no te vemos!»\n2. «¿Cómo estás? ¿Seguís entrenando por tu cuenta?» (Escuchá.)\n3. «Tenemos una promo solo para quienes ya entrenaron con nosotros: {promo} Es por pocos días.»\n4. Cierre: «¿Te la reservo a tu nombre para que pases esta semana?»",
        riesgo: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}. ¿Cómo estás?»\n2. «Hace unos días que no te vemos y queríamos saber si está todo bien.» (Escuchá con interés de verdad.)\n3. «Tu plan sigue activo, ¡aprovechémoslo! Si el horario se te complicó, te busco uno que te acomode.»\n4. Cierre: «¿Te anoto esta semana en la mañana o en la tarde?»",
        cumple: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}. ¡Feliz cumpleaños!» (Con mucha alegría.)\n2. «Todo el equipo te manda un abrazo. ¿Lo vas a celebrar?»\n3. «Queremos regalarte algo: {promo}»\n4. Cierre: «¿Te lo activo para que lo estrenes esta semana?»",
        v46: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}. ¡Cuánto tiempo!»\n2. «¿Cómo estás? ¿Qué te hizo dejar de venir?» (Escuchá y no discutas.)\n3. «Para que la vuelta sea más fácil tenemos {promo} Si venís con alguien, mejor todavía.»\n4. Cierre: «¿Te animás a venir esta semana? ¿Con alguien o te anoto primero a vos?»",
        v91: "1. «¡Hola {nombre}! Te habla {atc} de Calistenia {sucursal}. Estamos invitando a quienes ya entrenaron con nosotros a volver y me acordé de vos.»\n2. «¿Seguís haciendo ejercicio?» (Escuchá.)\n3. «Tenemos {promo} Es ideal para volver con alguien y motivarse juntos.»\n4. Cierre: «¿Con quién te animarías a venir?»"
    };
    function guionPara(c) {
        var base = GUIONES[c.grupo] || GUIONES.v1, yaPago = c.grupo === "nunca" || c.grupo === "riesgo";
        var cierre = CIERRE.replace("{caro}", yaPago ? "" : "Si dice «está caro»: «Sale menos de " + (window.CM_PAIS === "paraguay" ? "Gs 14.000" : "Bs 9") + " por día, menos que un refresco. Y la promo es solo por estos días.»\n");
        return rellenar(base + cierre, c).replace(/\s+([,.?!])/g, "$1");
    }
    function guionJefe(c) {
        var g = (M.ctx.guiones || [])[0];
        return g && g.guion_llamada ? rellenar(g.guion_llamada, c) : "";
    }
    function mensajeDe(c) { return rellenar(c.mensaje || "", c); }

    function tarjeta(c) {
        var tel = digitos(c.telefono), wa = tel ? "https://wa.me/" + tel : "", g = c.ultima, guardando = M.guardando[c.key_cliente];
        var marcar = function (canal) { return function () { M.canal[c.key_cliente] = canal; }; };
        var guion = guionPara(c), propio = guionJefe(c), msj = mensajeDe(c);
        var hecho = c.estado === "hecho" || c.estado === "espera";
        var cuerpo = [
            el("div", { class: "ml-cab" }, [el("span", { class: "ml-intento" + (c.intentos ? " is-repite" : ""), text: INTENTO[Math.min(c.intentos, 3)] }), c.sucursal ? el("span", { class: "ml-suc" }, [ico("lugar"), c.sucursal]) : null]),
            el("h3", { class: "ml-nombre", text: c.cliente || "Cliente" }),
            el("p", { class: "ml-dato", text: [c.dato ? c.dato.charAt(0).toUpperCase() + c.dato.slice(1) : null, c.grupo_titulo].filter(Boolean).join(" · ") }),
            c.promo || c.paquete_nombre ? el("div", { class: "ml-oferta" }, [
                c.promo ? el("p", { class: "ml-ofrece" }, [ico("etiqueta"), el("span", {}, [el("b", { text: "Ofrecé " }), c.promo])]) : null,
                c.paquete_nombre ? el("p", { class: "ml-exclusivo" }, [ico("candado"), el("span", {}, [el("b", { text: "Paquete exclusivo " }), c.paquete_nombre])]) : null
            ]) : null
        ];
        if (hecho && !M.abierto[c.key_cliente]) {
            cuerpo.push(el("div", { class: "ml-hecho" }, [
                el("span", { class: "ml-res-chip is-" + (g && g.resultado === "agendado" ? "ok" : "muted") }, [ico(g && RESX[g.resultado] ? RESX[g.resultado].ico : "check"), (g ? (RESX[g.resultado] || { texto: g.resultado }).texto : "") + (g ? " · " + corta(g.fecha_on) + " " + hora(g.fecha_on) : "")]),
                c.estado === "espera" && g && g.proximo_seguimiento ? el("span", { class: "ml-dato", text: "Vuelve a aparecer el " + corta(g.proximo_seguimiento) }) : null,
                !M.ctx.soloVer ? el("button", { type: "button", class: "ml-link", text: "Cambiar", onclick: function () { M.abierto[c.key_cliente] = true; pintar(); } }) : null
            ]));
            if (M.ctx.gestionar) cuerpo.push(barraJefe(c));
            return el("article", { class: "ml-cli is-hecho" }, cuerpo);
        }
        cuerpo.push(
            el("p", { class: "ml-paso", text: "Llamá primero. Si no atiende, mandá el mensaje por WhatsApp." }),
            el("div", { class: "ml-acc" }, [
                tel ? el("a", { class: "ml-btn ml-llamar", href: "tel:+" + tel, onclick: marcar("llamada") }, [ico("telefono"), "Llamar"]) : el("span", { class: "ml-dato", text: "Sin teléfono válido" }),
                wa ? el("a", { class: "ml-btn ml-wa", href: wa + "?text=" + encodeURIComponent(msj), target: "_blank", rel: "noopener", onclick: marcar("whatsapp") }, [ico("whatsapp", "cmi-wa"), "WhatsApp"]) : null
            ]),
            guion ? el("details", { class: "ml-det" }, [el("summary", {}, [ico("guion"), "Guion de la llamada", ico("flecha", "ml-chev")]), el("p", { text: guion })]) : null,
            propio ? el("details", { class: "ml-det" }, [el("summary", {}, [ico("nota"), "Guion del Jefe de ATC", ico("flecha", "ml-chev")]), el("p", { text: propio })]) : null,
            msj ? el("details", { class: "ml-det ml-det-wa" }, [el("summary", {}, [ico("whatsapp"), "Mensaje que se envía", ico("flecha", "ml-chev")]), el("p", { class: "ml-burbuja", text: msj })]) : null
        );
        if (!M.ctx.soloVer) cuerpo.push(el("div", { class: "ml-res" }, [
            el("p", { class: "ml-res-t", text: "¿Cómo te fue?" }),
            el("div", { class: "ml-res-b" }, RES.map(function (r) {
                return el("button", { type: "button", class: "ml-r" + (r.grande ? " is-compra" : "") + (r.ancho ? " is-ancho" : ""), disabled: guardando, onclick: function () { M.abierto[c.key_cliente] = false; registrar(c, r.id); } }, [ico(r.ico), el("span", { text: r.texto })]);
            }))
        ]));
        if (M.ctx.gestionar) cuerpo.push(barraJefe(c));
        return el("article", { class: "ml-cli" + (c.intentos ? " is-repite" : "") }, cuerpo);
    }

    /* Tarjeta de incentivo: lo que lleva ganado hasta el corte del 25, lo que falta confirmar, su meta y los días que quedan. */
    function incentivo(ctx, per, reportadas, conf, confHoy) {
        var ganado = conf * COMISION, porConf = Math.max(0, reportadas - conf), metaV = Math.max(0, Number(ctx.yo.meta_mensual) || 0);
        var dias = Math.max(0, Math.round((new Date(per.hasta + "T12:00:00") - new Date(hoy() + "T12:00:00")) / 864e5));
        var monto = el("b", { class: "ml-inc-monto" }); contar(monto, ganado);
        var partes = [
            el("div", { class: "ml-inc-top" }, [
                el("div", {}, [el("span", { class: "ml-inc-lbl", text: ctx.soloVer ? "Lleva ganado" : "Llevás ganado" }), monto,
                    el("span", { class: "ml-inc-sub", text: conf + (conf === 1 ? " venta confirmada" : " ventas confirmadas") + (confHoy ? " · +" + bs(confHoy * COMISION) + " hoy" : "") })]),
                el("div", { class: "ml-inc-corte" }, [el("span", { text: "Corte" }), el("b", { text: fechaCorta(per.hasta) }), el("small", { text: dias === 0 ? "es hoy" : dias === 1 ? "falta 1 día" : "faltan " + dias + " días" })])
            ]),
            el("p", { class: "ml-inc-regla" }, [el("b", { text: "Cada venta: +" + bs(COMISION) + ". " }), "Se cobra todo lo confirmado del " + fechaCorta(per.desde) + " al " + fechaCorta(per.hasta) + ". Sin tope: cuanto más vendés, más acumulás."])
        ];
        if (porConf) partes.push(el("p", { class: "ml-inc-pend" }, ["Por confirmar: ", el("b", { text: "+" + bs(porConf * COMISION) }), " (" + porConf + (porConf === 1 ? " venta reportada: se suma cuando se cobre en caja)." : " ventas reportadas: se suman cuando se cobren en caja).")]));
        if (metaV) {
            var p = Math.min(100, Math.round(conf / metaV * 100)), falta = Math.max(0, metaV - conf);
            partes.push(el("div", { class: "ml-inc-meta" }, [
                el("div", { class: "ml-inc-meta-t" }, [el("span", { text: "Meta: " + metaV + " ventas" }), el("b", { text: falta ? "Te faltan " + falta : "¡Meta cumplida!" })]),
                el("span", { class: "ml-inc-barra" }, [el("i", { style: "width:" + p + "%" })]),
                el("small", { text: falta ? (dias > 0 ? "Son unas " + Math.ceil(falta / Math.max(1, dias)) + " por día hasta el corte. " : "") + "Con la meta llegás a " + bs(metaV * COMISION) + "." : "Todo lo que vendas de acá al corte sigue sumando." })
            ]));
        }
        return el("section", { class: "ml-inc" + (metaV && conf >= metaV ? " is-meta" : "") }, partes);
    }

    /* Solo para el Jefe de ATC en «Ver una lista»: quitar al cliente o pasarlo a otra chica. */
    function barraJefe(c) {
        var g = M.ctx.gestionar, otras = (g.equipo || []).filter(function (e) { return e.key !== M.ctx.yo.key; });
        var sel = el("select", { class: "ml-pasar", "aria-label": "Pasar a otra ATC", onchange: function (e) {
            var k = e.target.value; if (!k) return;
            var quien = otras.filter(function (x) { return x.key === k; })[0];
            if (!confirm("¿Pasar a " + c.cliente + " a la lista de " + quien.nombre + "?")) { e.target.value = ""; return; }
            g.pasar(c, k);
        } }, [el("option", { value: "", text: "Pasar a otra ATC…" })].concat(otras.map(function (e) { return el("option", { value: e.key, text: e.nombre + ((e.sucursales || []).length ? " · " + e.sucursales.join(", ") : "") }); })));
        return el("div", { class: "ml-jefe" }, [
            el("button", { type: "button", class: "ml-quitar", onclick: function () { if (confirm("¿Quitar a " + c.cliente + " de la lista de " + M.ctx.yo.nombre + "?")) g.quitar(c); } }, [ico("x"), "Quitar de la lista"]),
            otras.length ? sel : null
        ]);
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
        var per = periodoPago(), hastaHoy = h < per.hasta ? h : per.hasta;
        var reportadas = mias.filter(function (g) { return g.resultado === "agendado" && String(g.fecha_on).slice(0, 10) >= per.desde && String(g.fecha_on).slice(0, 10) <= hastaHoy; }).length;
        var confirmadas = (ctx.comisiones || []).filter(function (x) { return !x.anulada && x.key_ejecutiva === ctx.yo.key && String(x.fecha_venta).slice(0, 10) >= per.desde && String(x.fecha_venta).slice(0, 10) <= per.hasta; });
        var confHoy = confirmadas.filter(function (x) { return String(x.fecha_venta).slice(0, 10) === h; }).length;
        var meta = todos.length || 40;
        var lista0 = todos[0] || {};

        /* Encabezado: quién, qué día y cómo va */
        cont.appendChild(el("header", { class: "ml-top" }, [
            el("div", { class: "ml-quien" }, [el("b", { text: "Calistenia · Atención al Cliente" }), el("span", { text: [String(ctx.yo.nombre || "").toUpperCase(), lista0.sucursal, lista0.lista_n ? (lista0.lista_n === 2 ? "tarde" : "mañana") : null].filter(Boolean).join(", ") })]),
            el("h2", { class: "ml-fecha", text: fechaLarga() }),
            el("div", { class: "ml-segs", "aria-hidden": "true" }, Array.from({ length: Math.min(meta, 60) }, function (_, i) { return el("i", { class: i < Math.round(Math.min(contactosHoy, meta) / meta * Math.min(meta, 60)) ? "is-on" : "" }); })),
            el("div", { class: "ml-cuenta" }, [el("span", {}, [el("b", { text: String(contactosHoy) }), " de " + meta + " contactos hechos hoy"]), el("span", { text: ventasHoy + (ventasHoy === 1 ? " venta hoy" : " ventas hoy") })]),
            incentivo(ctx, per, reportadas, confirmadas.length, confHoy)
        ]));

        var nota = todos.map(function (c) { return c.nota_jefa; }).filter(Boolean)[0];
        if (nota) cont.appendChild(el("div", { class: "ml-nota" }, [ico("nota"), el("div", {}, [el("b", { text: "Del Jefe de ATC" }), el("span", { text: nota })])]));
        var tareas = (ctx.tareas || []).filter(function (t) { return !t.hecha; });
        tareas.forEach(function (t) {
            cont.appendChild(el("div", { class: "ml-nota is-tarea" }, [ico("lista"), el("div", {}, [el("b", { text: "Tarea" }), el("span", { text: t.titulo + (t.indicaciones ? " — " + t.indicaciones : "") })]),
                !ctx.soloVer ? el("button", { type: "button", class: "ml-tarea-ok", text: "Marcar hecha", onclick: function () { ctx.llamar("comercial_tarea_completar", { key: t.key }).then(function () { t.hecha = true; pintar(); ctx.avisar("Tarea hecha."); }, function (e) { ctx.avisar((e && e.message) || "No se pudo", "bad"); }); } }) : null]));
        });
        if (!todos.length) {
            cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "No tienes lista para hoy." }), " Avísale al Jefe de ATC: cada cliente que compra son " + bs(COMISION) + " para ti."]));
            return;
        }
        if (!pend.length) cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "¡Terminaste tu lista!" }), " Pídele más clientes al Jefe de ATC: más contactos, más comisión."]));
        else if (pend.length < 5) cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "Te quedan " + pend.length + " clientes." }), " Avísale al Jefe de ATC para que te cargue más."]));

        var F = [["pendientes", "Pendientes (" + pend.length + ")"], ["hechos", "Hechos (" + hechos.length + ")"], ["ventas", "Mis ventas (" + confirmadas.length + ")"], ["buscar", "Buscar"]];
        cont.appendChild(el("div", { class: "ml-tabs", role: "tablist" }, F.map(function (f) {
            return el("button", { type: "button", role: "tab", class: M.filtro === f[0] ? "is-on" : "", "aria-selected": M.filtro === f[0] ? "true" : "false", text: f[1], onclick: function () { M.filtro = f[0]; pintar(); } });
        })));
        if (M.filtro === "ventas") { cont.appendChild(misVentas(ctx, per, mias)); window.scrollTo(0, y); return; }
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

    /* Mis ventas: quién compró (cliente y paquete), cuándo y quién lo cobró en caja; y lo reportado que todavía no se cobró. */
    function misVentas(ctx, per, mias) {
        var conf = (ctx.comisiones || []).filter(function (x) { var f = String(x.fecha_venta).slice(0, 10); return x.key_ejecutiva === ctx.yo.key && f >= per.desde && f <= per.hasta; })
            .sort(function (a, b) { return String(b.fecha_venta).localeCompare(String(a.fecha_venta)); });
        var ya = {}; conf.forEach(function (c) { ya[c.key_cliente] = 1; });
        var pend = mias.filter(function (g) { var f = String(g.fecha_on).slice(0, 10); return g.resultado === "agendado" && f >= per.desde && !ya[g.key_cliente]; })
            .sort(function (a, b) { return String(b.fecha_on).localeCompare(String(a.fecha_on)); });
        var tabla = function (cols, filas) {
            return el("div", { class: "ml-ventas-scroll" }, [el("table", { class: "ml-ventas" }, [el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { text: c }); }))]),
                el("tbody", {}, filas.map(function (f) { return el("tr", {}, f.map(function (v) { return el("td", { text: String(v) }); })); }))])]);
        };
        var box = el("div", { class: "ml-ventas-box" });
        box.appendChild(el("p", { class: "ml-vacio", text: "Ventas confirmadas del " + fechaCorta(per.desde) + " al " + fechaCorta(per.hasta) + ": " + conf.filter(function (c) { return !c.anulada; }).length + "." }));
        if (conf.length) box.appendChild(tabla(["Fecha", "Cliente", "Paquete", "Sucursal", "Cobró en caja", "Comisión"], conf.map(function (c) {
            return [fechaCorta(String(c.fecha_venta).slice(0, 10)), c.cliente || "—", c.paquete || "—", c.sucursal || "—", c.cajero || "—", c.anulada ? "Anulada" : bs(c.comision || COMISION)];
        })));
        if (pend.length) {
            box.appendChild(el("p", { class: "ml-vacio", text: "Reportadas por vos, esperando el cobro en caja (" + pend.length + "):" }));
            /* Los contactos traen solo la clave del cliente: el nombre y la sucursal salen de la lista asignada. */
            var asig = {}; (ctx.asignaciones || []).forEach(function (a) { asig[a.key_cliente || a.key] = a; });
            box.appendChild(tabla(["Reportada", "Cliente", "Sucursal", "Canal"], pend.map(function (g) { var a = asig[g.key_cliente] || {};
                return [fechaCorta(String(g.fecha_on).slice(0, 10)), g.cliente || a.cliente || "—", g.sucursal || a.sucursal || "—", g.canal || "—"]; })));
        }
        if (!conf.length && !pend.length) box.appendChild(el("p", { class: "ml-vacio", text: "Todavía no tenés ventas en este período. ¡Cada cliente que compra suma " + bs(COMISION) + "!" }));
        return box;
    }

    window.ATC_milista = {
        montar: function (cont, ctx) { M.cont = cont; M.ctx = ctx; pintar(); },
        RES: RES,
        periodoPago: periodoPago,
        _interno: { M: M, misClientes: misClientes, registrar: registrar }
    };
})();
