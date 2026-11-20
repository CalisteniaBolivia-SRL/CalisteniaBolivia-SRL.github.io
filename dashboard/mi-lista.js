/* «Mi lista» de cada ATC: los clientes que le asignó la Jefa de Atención al Cliente en el Plan de hoy.
   Por cliente: llamar, abrir WhatsApp con el mensaje ya escrito y anotar cómo le fue (queda en el CRM:
   seguimientos, avance que ve ATC Central y comisión). Se monta desde comercial.js:
   window.ATC_milista.montar(contenedor, { yo, asignaciones, ultimas, llamar(tool, args), avisar(texto, tono) }). */
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
    function hora(s) { var t = String(s || ""); var d = new Date(t); return isNaN(d) ? "" : pad(d.getHours()) + ":" + pad(d.getMinutes()); }
    function digitos(t) { var d = String(t || "").replace(/\D/g, ""); if (d.length === 8) d = "591" + d; return d.length >= 10 ? d : ""; }

    /* Botones de resultado → resultado del CRM y cuándo volver a intentar. */
    var RES = [
        { id: "agendado", texto: "Vuelve / compra", tono: "ok", final: true },
        { id: "interesado", texto: "Lo va a pensar", tono: "ok", seguir: 2 },
        { id: "no_contesta", texto: "No contesta", tono: "warn", seguir: 1 },
        { id: "no_interesado", texto: "No le interesa", tono: "muted", final: true },
        { id: "numero_errado", texto: "Número equivocado", tono: "bad", final: true }
    ];
    var RESX = {}; RES.forEach(function (r) { RESX[r.id] = r; });
    var LISTA_CRM = { vencen: "por_vencer", nunca: "en_riesgo", riesgo: "en_riesgo", v1: "vencidos", v16: "vencidos", v46: "vencidos", v91: "vencidos", pases: "vencidos", cumple: "otro" };

    var M = { cont: null, ctx: null, canal: {}, abierto: {}, filtro: "pendientes", guardando: {} };

    function misClientes() {
        var ctx = M.ctx, yo = ctx.yo && ctx.yo.key, ult = {};
        (ctx.ultimas || []).forEach(function (g) { ult[g.key_cliente] = g; });
        return (ctx.asignaciones || []).filter(function (a) { return a.lote && a.key_ejecutiva === yo; }).map(function (a) {
            var g = ult[a.key_cliente], tocado = g && String(g.fecha_on) >= String(a.fecha_on);
            var r = tocado ? RESX[g.resultado] : null, estado = "pendiente";
            if (tocado) {
                if (r && r.final) estado = "hecho";
                else if (g.proximo_seguimiento && g.proximo_seguimiento <= hoy()) estado = "seguir";
                else if (g.proximo_seguimiento) estado = "espera";
                else estado = "hecho";
            }
            return Object.assign({}, a, { ultima: tocado ? g : null, estado: estado });
        }).sort(function (x, y) { return (x.orden || 0) - (y.orden || 0); });
    }

    function registrar(c, res, nota) {
        if (M.guardando[c.key_cliente]) return;
        M.guardando[c.key_cliente] = true;
        var r = RESX[res], canal = M.canal[c.key_cliente] || "llamada";
        var args = { key_cliente: c.key_cliente, cliente: c.cliente, sucursal: c.sucursal, lista: LISTA_CRM[c.grupo] || "otro", canal: canal, resultado: res,
            nota: nota || (r.id === "agendado" ? "Vuelve o compra" : null), proximo_seguimiento: r.seguir ? masDias(r.seguir) : null };
        pintar();
        M.ctx.llamar("comercial_gestion_registrar", args).then(function (x) {
            var g = Object.assign({ key_cliente: c.key_cliente, fecha_on: new Date().toISOString(), contactos: 1 }, (x && x.data) || args);
            /* Se cambia la misma lista que usa comercial.js, así el resultado no se pierde al repintar. */
            var arr = M.ctx.ultimas || (M.ctx.ultimas = []);
            for (var i = arr.length - 1; i >= 0; i--) if (arr[i].key_cliente === c.key_cliente) arr.splice(i, 1);
            arr.push(g);
            M.abierto[c.key_cliente] = false;
            M.ctx.avisar(r.id === "agendado" ? "¡Bien! " + c.cliente + " vuelve. Apenas se cobre en caja, suman Bs 5 a tu contador 💰"
                : c.cliente + ": " + r.texto + (r.seguir ? ". Vuelve a aparecer el " + corta(masDias(r.seguir)) + "." : "."), "ok");
        }).catch(function (e) {
            M.ctx.avisar("No se guardó (" + c.cliente + "): " + ((e && e.message) || e), "bad");
        }).then(function () { M.guardando[c.key_cliente] = false; pintar(); });
    }

    function tarjeta(c, i) {
        var tel = digitos(c.telefono), wa = tel ? "https://wa.me/" + tel : "", g = c.ultima;
        var marcarCanal = function (canal) { return function () { M.canal[c.key_cliente] = canal; M.abierto[c.key_cliente] = true; setTimeout(pintar, 300); }; };
        var guardando = M.guardando[c.key_cliente];
        var nota = el("input", { type: "text", maxlength: "300", placeholder: "Nota (opcional): horario que prefiere, qué le frena…" });
        return el("article", { class: "ml-cli is-" + c.estado }, [
            el("div", { class: "ml-cab" }, [
                el("span", { class: "ml-n", text: String(i + 1) }),
                el("div", { class: "ml-quien" }, [el("h3", { text: c.cliente || "Cliente" }), el("p", { class: "co-muted", text: (c.grupo_titulo || "") + (c.dato ? " · " + c.dato : "") })]),
                g ? el("span", { class: "co-chip co-" + ((RESX[g.resultado] || {}).tono || "muted"), text: (RESX[g.resultado] || { texto: g.resultado }).texto + " · " + corta(g.fecha_on) + " " + hora(g.fecha_on) }) : el("span", { class: "co-chip co-warn", text: "Por contactar" })
            ]),
            c.promo ? el("p", { class: "ml-promo" }, [el("b", { text: "Ofrecé: " }), c.promo]) : null,
            c.paquete_nombre ? el("p", { class: "ml-exclusivo" }, [el("b", { text: "Paquete exclusivo: " }), c.paquete_nombre, el("span", { text: " · solo para los clientes de esta lista" })]) : null,
            /* Dos botones: llamada normal y WhatsApp con el mensaje ya escrito (con su nombre). */
            el("div", { class: "ml-acc" }, [
                tel ? el("a", { class: "ml-btn ml-llamar", href: "tel:+" + tel, onclick: marcarCanal("llamada") }, ["📞 Llamar"]) : el("span", { class: "co-muted", text: "Sin teléfono válido" }),
                wa ? el("a", { class: "ml-btn ml-wa", href: wa + "?text=" + encodeURIComponent(c.mensaje || ""), target: "_blank", rel: "noopener", onclick: marcarCanal("whatsapp") }, ["💬 WhatsApp"]) : null
            ]),
            c.mensaje ? el("details", { class: "ml-msj" }, [el("summary", { text: "Ver el mensaje" }), el("p", { text: c.mensaje })]) : null,
            el("div", { class: "ml-res" + (M.abierto[c.key_cliente] || c.estado === "seguir" ? " is-destacado" : "") }, [
                el("p", { class: "ml-res-t", text: "¿Cómo te fue?" + (M.canal[c.key_cliente] ? " (" + (M.canal[c.key_cliente] === "whatsapp" ? "por mensaje" : "por llamada") + ")" : "") }),
                el("div", { class: "ml-res-b" }, RES.map(function (r) {
                    return el("button", { type: "button", class: "co-btn ml-r is-" + r.tono, disabled: guardando, onclick: function () { registrar(c, r.id, nota.value.trim()); } }, [r.texto]);
                })),
                nota
            ])
        ]);
    }

    function pintar() {
        var cont = M.cont; if (!cont) return;
        var y = window.scrollY;
        cont.textContent = "";
        var todos = misClientes();
        var cuenta = { pendiente: 0, seguir: 0, espera: 0, hecho: 0 }; todos.forEach(function (c) { cuenta[c.estado]++; });
        var contactados = todos.length - cuenta.pendiente, pct = todos.length ? Math.round(contactados / todos.length * 100) : 0;
        var vuelven = todos.filter(function (c) { return c.ultima && c.ultima.resultado === "agendado"; }).length;
        var notaJefa = todos.map(function (c) { return c.nota_jefa; }).filter(Boolean)[0];
        cont.appendChild(el("section", { class: "ml-intro" }, [
            el("div", {}, [el("h2", { class: "co-h2", text: "Mi lista" }),
                el("p", { class: "co-muted", text: todos.length ? "Clientes que te asignó Atención al Cliente" + (todos[0] && todos[0].sucursal ? " para " + todos[0].sucursal : "") + ". Empieza por arriba: ya están ordenados por prioridad." : "" })]),
            todos.length ? el("div", { class: "ml-prog" }, [el("span", {}, [el("b", { text: contactados + " de " + todos.length }), " contactados · " + vuelven + " vuelven"]), el("span", { class: "co-meta" }, [el("span", { style: "width:" + pct + "%" })])]) : null
        ]));
        if (notaJefa) cont.appendChild(el("div", { class: "co-aviso ml-nota" }, [el("strong", { text: "Mensaje de Atención al Cliente" }), el("p", { text: notaJefa })]));
        if (!todos.length) {
            cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "⚠ No tienes lista para hoy." }), " Avísale ya a ATC Central (Eliana): cada cliente que vuelve son Bs 5 para ti. La lista aparece aquí apenas te la asignen."]));
            return;
        }
        cont.appendChild(el("ol", { class: "ml-como" }, [
            el("li", {}, [el("b", { text: "Llamá" }), " con el botón 📞 o por WhatsApp."]),
            el("li", {}, [el("b", { text: "Si no atiende, mandá el mensaje" }), ": se abre WhatsApp con el texto ya escrito."]),
            el("li", {}, [el("b", { text: "Anotá cómo te fue" }), ". «No contesta» lo vuelve a poner mañana; «Lo va a pensar», en 2 días."])
        ]));
        /* Lista por terminarse o de otro día: aviso urgente para pedir más (la idea es que nunca quede vacía). */
        var vieja = todos.some(function (c) { return c.lote; }) && todos.map(function (c) { return String(c.lote || ""); }).sort().pop().slice(0, 10) < new Date().toISOString().slice(0, 10);
        if (!cuenta.pendiente && !cuenta.seguir) cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "¡Terminaste tu lista!" }), " Pídele más clientes a ATC Central ahora mismo: mientras más contactos, más comisión."]));
        else if (cuenta.pendiente + cuenta.seguir < 5) cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "Te quedan " + (cuenta.pendiente + cuenta.seguir) + " clientes." }), " Avísale a ATC Central para que te cargue más."]));
        else if (vieja) cont.appendChild(el("div", { class: "co-urgente", role: "alert" }, [el("b", { text: "Esta lista no es de hoy." }), " Termínala y pide la de hoy a ATC Central."]));
        var FILTROS = [["pendientes", "Por contactar (" + cuenta.pendiente + ")"], ["seguir", "Volver a intentar hoy (" + cuenta.seguir + ")"], ["espera", "Más adelante (" + cuenta.espera + ")"], ["hecho", "Terminados (" + cuenta.hecho + ")"]];
        if (M.filtro === "pendientes" && !cuenta.pendiente && cuenta.seguir) M.filtro = "seguir";
        cont.appendChild(el("div", { class: "co-tabs ml-filtros", role: "tablist" }, FILTROS.map(function (f) {
            return el("button", { type: "button", role: "tab", class: "co-tab" + (M.filtro === f[0] ? " is-on" : ""), "aria-selected": M.filtro === f[0] ? "true" : "false", text: f[1], onclick: function () { M.filtro = f[0]; pintar(); } });
        })));
        var est = M.filtro === "pendientes" ? "pendiente" : M.filtro;
        var lista = todos.filter(function (c) { return c.estado === est; });
        if (!lista.length) cont.appendChild(el("p", { class: "co-vacio", text: est === "pendiente" ? "¡Contactaste a todos! Revisa «Volver a intentar hoy»." : "No hay clientes aquí." }));
        var ul = el("div", { class: "ml-lista" });
        lista.forEach(function (c) { ul.appendChild(tarjeta(c, todos.indexOf(c))); });
        cont.appendChild(ul);
        window.scrollTo(0, y);
    }

    window.ATC_milista = {
        montar: function (cont, ctx) { M.cont = cont; M.ctx = ctx; pintar(); },
        _interno: { M: M, misClientes: misClientes, registrar: registrar }
    };
})();
