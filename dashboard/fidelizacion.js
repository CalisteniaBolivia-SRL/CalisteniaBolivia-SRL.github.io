/* =====================================================================================================
   Seguimiento de clientes activos · lo trabaja SOLO la Jefa de ATC (área «Mi atención directa»).
   Son clientes que todavía tienen plan: no se reparten a las ATC. La idea es que se sientan atendidos:
   que renueven, contar su experiencia y saber por qué dejaron de venir.
   - 4 listas: vencen hoy o mañana · vencen en 2 a 7 días · pagaron y no vinieron · 14+ días sin venir.
   - Cada lista tiene su mensaje de WhatsApp (editable, se guarda para todos) y un paquete exclusivo
     (los clientes quedan habilitados en «Campañas», con el control de caja).
   - Cada contacto se registra con su resultado y, si no renueva, el motivo y lo que contó.
   - «Cómo nos fue»: quién renovó después del contacto (ventas del ERP), con qué paquete y por qué no.
   Bolivia y Paraguay: el mismo módulo; cada país con sus datos (Paraguay todavía no tiene asistencias).
   Se monta desde comercial.js: window.ATC_fidel.montar(contenedor, { llamar, avisar, lista }).
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay";
    var MONEDA = window.CM_MONEDA || (PY ? "Gs" : "Bs");
    var POR_TANDA = 10;

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
    function hoy() { return iso(new Date()); }
    function sumar(f, n) { var d = new Date(f + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); }
    function dif(a, b) { return Math.round((new Date(String(a).slice(0, 10) + "T00:00:00") - new Date(String(b).slice(0, 10) + "T00:00:00")) / 86400000); }
    var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    function fechaLinda(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? Number(p[2]) + " de " + MESES[Number(p[1]) - 1] : "—"; }
    function corta(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : "—"; }
    function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
    function bonito(s) { s = String(s || "").trim().toLowerCase().replace(/\s+/g, " "); return s.replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); }
    function primerNombre(s) { return bonito(String(s || "").split(" ")[0]); }
    function miles(n) { return Math.round(Number(n) || 0).toLocaleString("es-BO"); }
    function plata(n) { return MONEDA + " " + miles(n); }
    function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : "—"; }
    function telWa(t) {
        var d = String(t || "").replace(/\D/g, "");
        if (PY) { if (/^0\d{9}$/.test(d)) d = "595" + d.slice(1); else if (/^9\d{8}$/.test(d)) d = "595" + d; }
        else if (d.length === 8) d = "591" + d;
        return d.length >= 10 ? d : "";
    }
    function ico(n) { return window.CMI ? window.CMI(n) : null; }

    /* ---------- las listas ---------- */
    var LISTAS = [
        { id: "renovar_hoy", titulo: "Vencen hoy o mañana", sub: "Todavía no renovaron", fuente: "porVencer", tono: "rojo",
          filtro: function (c, h) { var d = dif(c.fecha_fin, h); return d >= 0 && d <= 1; },
          dato: function (c, h) { var d = dif(c.fecha_fin, h); return "Vence " + (d === 0 ? "hoy" : "mañana") + " · " + bonito(c.paquete); },
          orden: function (c) { return String(c.fecha_fin || ""); },
          positivo: "Renueva",
          mensaje: "¡Hola {nombre}! 👋 Te escribe {jefa}, de Atención al Cliente de Calistenia {sucursal}. Tu plan vence el {fecha} y antes quería preguntarte: ¿cómo te sentiste entrenando este tiempo? Tu opinión nos ayuda mucho 🙏 Para que no cortes la racha te guardé {promo} ¿Te lo dejo listo hoy?" },
        { id: "renovar_semana", titulo: "Vencen en 2 a 7 días", sub: "Todavía no renovaron", fuente: "porVencer", tono: "ambar",
          filtro: function (c, h) { var d = dif(c.fecha_fin, h); return d >= 2 && d <= 7; },
          dato: function (c, h) { return "Vence el " + corta(c.fecha_fin) + " (en " + dif(c.fecha_fin, h) + " días) · " + bonito(c.paquete); },
          orden: function (c) { return String(c.fecha_fin || ""); },
          positivo: "Renueva",
          mensaje: "¡Hola {nombre}! 👋 Te escribe {jefa}, de Atención al Cliente de Calistenia {sucursal}. Quería saber cómo te está yendo con los entrenamientos 💪 ¿Hay algo que podamos mejorar para vos? Tu plan vence el {fecha}: si renovás antes, te guardo {promo} ¿Te parece?" },
        { id: "nunca", titulo: "Pagaron y no vinieron", sub: "Plan activo, ninguna visita", fuente: "sinAsistir", tono: "rojo",
          filtro: function (c, h) { return c.no_vino_con_este_paquete === true && c.fecha_inicio && dif(h, c.fecha_inicio) >= 2; },
          dato: function (c) { return "Pagó el " + corta(c.fecha_inicio) + " y todavía no vino · plan hasta " + corta(c.fecha_fin); },
          orden: function (c) { return String(c.fecha_inicio || ""); },
          positivo: "Viene esta semana",
          mensaje: "¡Hola {nombre}! 👋 Te escribe {jefa}, de Atención al Cliente de Calistenia {sucursal}. Tu plan está activo hasta el {fecha} y todavía no pudimos verte 🙌 ¿Pasó algo? Contame y te ayudo: te busco el horario que mejor te quede y el coach te recibe personalmente en tu primera clase. ¿Mañana o tarde?" },
        { id: "riesgo", titulo: "14 días o más sin venir", sub: "Tienen plan, dejaron de venir", fuente: "sinAsistir", tono: "",
          filtro: function (c) { return c.no_vino_con_este_paquete !== true; },
          dato: function (c) { return "No viene hace " + (c.dias_sin_venir || "14+") + " días · plan hasta " + corta(c.fecha_fin); },
          orden: function (c) { return pad(Math.min(99, Number(c.dias_sin_venir) || 0)); },
          positivo: "Vuelve",
          mensaje: "¡Hola {nombre}! 👋 Te escribe {jefa}, de Atención al Cliente de Calistenia {sucursal}. Hace {dias} días que no te vemos y quería saber cómo estás 😊 ¿Cómo fue tu experiencia hasta ahora? Si algo no te gustó o se te complicó el horario, contame y lo resolvemos. Tu plan sigue activo hasta el {fecha}." }
    ];
    var LISTA = {}; LISTAS.forEach(function (l) { LISTA[l.id] = l; });
    var RESULTADOS = [["renueva", null], ["lo_piensa", "Lo va a pensar"], ["no_contesta", "No contesta"], ["no_renueva", "No renueva"], ["numero_errado", "Número equivocado"]];
    var MOTIVOS = [["horario", "Horario"], ["precio", "Precio"], ["salud", "Lesión o salud"], ["viaje_trabajo", "Viaje o trabajo"], ["experiencia", "No le gustó la clase o la atención"],
        ["se_mudo", "Se mudó"], ["otro_gimnasio", "Se fue a otro gimnasio"], ["motivacion", "Falta de motivación"], ["otro", "Otro"]];
    var MOTIVO = {}; MOTIVOS.forEach(function (m) { MOTIVO[m[0]] = m[1]; });
    function textoRes(r, l) { if (r === "renueva") return (LISTA[l] && LISTA[l].positivo) || "Renueva"; var x = RESULTADOS.filter(function (q) { return q[0] === r; })[0]; return x ? x[1] : r; }
    var CIERRA = { renueva: 1, no_renueva: 1, numero_errado: 1 };   // con estos el cliente pasa a «Hechos»

    /* ---------- estado ---------- */
    var F = { cont: null, ctx: null, vista: "listas", lista: null, filtro: "pendientes", ver: POR_TANDA, cargando: false, cargado: false, errores: {}, sinDatos: {},
        datos: { porVencer: [], sinAsistir: [] }, paquetes: [], config: {}, contactos: [], abierto: {}, borrador: {}, guardando: {}, canal: {},
        periodo: 30, res: null, resCargando: false, resError: null, verRes: POR_TANDA };

    function llamar(tool, args) {
        return (F.ctx && F.ctx.llamar ? F.ctx.llamar(tool, args || {}) : window.CM.llamar(tool, args || {})).then(function (r) {
            if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { r = {}; } }
            if (r && r.estado === "error") throw new Error(r.error || "error del servidor");
            return r || {};
        });
    }
    function filas(r) { return Array.isArray(r) ? r : (r && (r.filas || (Array.isArray(r.data) ? r.data : null) || r.result)) || []; }
    function avisar(t, tono) { if (F.ctx && F.ctx.avisar) F.ctx.avisar(t, tono); }
    function todas(tool, args) {
        return llamar(tool, Object.assign({}, args, { limite: 200, offset: 0 })).then(function (r) {
            if (r && r.sin_datos_paraguay) { F.sinDatos[tool] = true; return []; }
            var acc = filas(r).slice(), total = Number(r.total) || acc.length, offs = [];
            for (var o = acc.length; o < Math.min(total, 4000); o += 200) offs.push(o);
            var i = 0;
            function sig() { if (i >= offs.length) return Promise.resolve(); var off = offs[i++]; return llamar(tool, Object.assign({}, args, { limite: 200, offset: off })).then(function (x) { acc = acc.concat(filas(x)); return sig(); }); }
            return Promise.all([sig(), sig(), sig()]).then(function () { return acc; });
        });
    }
    function cargar() {
        if (F.cargando) return;
        F.cargando = true; F.errores = {}; pintar();
        var fuentes = [["porVencer", "clientes_por_vencer", { dias: 7 }], ["sinAsistir", "clientes_sin_asistir", { dias: 14 }]];
        var p = fuentes.map(function (f) {
            return todas(f[1], f[2]).then(function (l) { F.datos[f[0]] = l; }).catch(function (e) {
                if (e && e.sinSesion) { var av = document.getElementById("cm-sesion"); if (av) av.hidden = false; }
                F.errores[f[0]] = (e && e.message) || String(e); F.datos[f[0]] = [];
            });
        });
        p.push(llamar("listar_paquetes", {}).then(function (r) {
            F.paquetes = filas(r).filter(function (q) { return Number(q.precio) > 0 && !/prueba|borrar|no tocar/i.test(q.descripcion || ""); })
                .map(function (q) { return { key: q.key || q.key_paquete || null, nombre: String(q.descripcion || "").trim(), precio: Number(q.precio) }; })
                .filter(function (q) { return q.key; }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
        }).catch(function () { F.paquetes = []; }));
        p.push(leerFirestore());
        Promise.all(p).then(function () { F.cargando = false; F.cargado = true; pintar(); });
    }
    function leerFirestore() {
        return Promise.all([
            llamar("comercial_fid_config", {}).then(function (r) { F.config = {}; filas(r).forEach(function (c) { F.config[c.key] = c; }); }),
            llamar("comercial_fid_contactos", { desde: sumar(hoy(), -60) }).then(function (r) { F.contactos = filas(r); })
        ]).catch(function (e) { F.errores.firestore = (e && e.message) || String(e); });
    }

    /* ---------- armado ---------- */
    function clientesDe(l) {
        var h = hoy(), vistos = {}, out = [];
        (F.datos[l.fuente] || []).forEach(function (c) {
            if (!l.filtro(c, h)) return;
            var k = String(c.key_usuario || c.key_cliente || (c.cliente + "|" + c.telefono));
            if (vistos[k]) return; vistos[k] = 1;
            out.push({ key: k, cliente: bonito(c.cliente), telefono: String(c.telefono || "").trim(), sucursal: bonito(c.sucursal), paquete: bonito(c.paquete),
                fecha_fin: String(c.fecha_fin || "").slice(0, 10), dias: c.dias_sin_venir || null, dato: l.dato(c, h), orden: l.orden(c, h), lista: l.id });
        });
        return out.sort(function (a, b) { return a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : a.cliente.localeCompare(b.cliente); });
    }
    /* Último contacto de cada cliente en esta lista (de este ciclo: desde 30 días antes de hoy). */
    function ultimoDe(listaId, key) {
        var lim = sumar(hoy(), -30), u = null;
        F.contactos.forEach(function (g) { if (g.lista === listaId && g.key_cliente === key && String(g.fecha_on).slice(0, 10) >= lim && (!u || String(g.fecha_on) > String(u.fecha_on))) u = g; });
        return u;
    }
    function estadoDe(c) { var u = ultimoDe(c.lista, c.key); return !u ? "pendiente" : CIERRA[u.resultado] ? "hecho" : "seguir"; }
    function config(l) { var c = F.config[l.id] || {}; return { mensaje: c.mensaje || l.mensaje, promo: c.promo || "", paquete_key: c.paquete_key || "", paquete_nombre: c.paquete_nombre || "", editado_por: c.editado_por || null, fecha_edicion: c.fecha_edicion || null, guardado: !!F.config[l.id] }; }
    function jefa() { var n = ""; try { n = (JSON.parse(localStorage.getItem("cb_centro_mando") || "null") || {}).nombre || ""; } catch (e) {} return primerNombre(n) || "la Jefa"; }
    function mensajePara(c, l) {
        var cf = config(l), t = cf.mensaje;
        var promo = cf.promo || (cf.paquete_nombre ? "el paquete " + bonito(cf.paquete_nombre) + ", exclusivo para vos" : "");
        if (!promo) t = (t.match(/[^.!?]+[.!?]*\s*/g) || [t]).filter(function (o) { return o.indexOf("{promo}") < 0; }).join("");
        var v = { nombre: primerNombre(c.cliente), jefa: jefa(), sucursal: c.sucursal || "", fecha: fechaLinda(c.fecha_fin), paquete: c.paquete || "", promo: promo, dias: c.dias || "unos" };
        return t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }).replace(/\s{2,}/g, " ").trim();
    }

    /* ---------- pintar ---------- */
    function pintar() {
        var c = F.cont; if (!c) return;
        var y = window.scrollY;
        c.textContent = "";
        c.appendChild(el("header", { class: "fd-top" }, [
            el("p", { class: "fd-eyebrow", text: "Mi atención directa · solo la Jefa de ATC" }),
            el("h2", { class: "fd-h", text: "Seguimiento de clientes" }),
            el("p", { class: "fd-lede", text: "Clientes que todavía tienen plan. No se reparten a las ATC: los atiende la Jefa para que renueven, contar su experiencia y saber por qué dejaron de venir." }),
            el("div", { class: "fd-vistas", role: "tablist" }, [["listas", "Listas de hoy"], ["resultados", "Cómo nos fue"]].map(function (v) {
                var on = F.vista === v[0];
                return el("button", { type: "button", role: "tab", class: on ? "is-on" : "", "aria-selected": on ? "true" : "false", text: v[1], onclick: function () { F.vista = v[0]; if (v[0] === "listas") F.lista = null; if (v[0] === "resultados" && !F.res) cargarResultados(); pintar(); } });
            }))
        ]));
        if (F.errores.firestore) c.appendChild(el("div", { class: "co-aviso is-bad" }, [el("strong", { text: "No se pudo leer el seguimiento guardado" }), el("p", { text: F.errores.firestore })]));
        if (F.vista === "resultados") { c.appendChild(vistaResultados()); window.scrollTo(0, y); return; }
        if (!F.cargado) { c.appendChild(el("p", { class: "fd-cargando", text: F.cargando ? "Leyendo los clientes del sistema…" : "" })); return; }
        if (F.lista) { c.appendChild(vistaLista(LISTA[F.lista])); window.scrollTo(0, y); return; }
        c.appendChild(vistaListas());
        window.scrollTo(0, y);
    }

    function vistaListas() {
        var grid = el("div", { class: "fd-cards" });
        LISTAS.forEach(function (l) {
            var cl = clientesDe(l), pend = cl.filter(function (x) { return estadoDe(x) !== "hecho"; }).length, cf = config(l);
            var sin = l.fuente === "sinAsistir" && F.sinDatos.clientes_sin_asistir, err = F.errores[l.fuente];
            grid.appendChild(el("article", { class: "fd-card" + (l.tono && pend ? " is-" + l.tono : "") }, [
                el("div", { class: "fd-card-n", text: sin ? "—" : miles(cl.length) }),
                el("h3", { class: "fd-card-t", text: l.titulo }),
                el("p", { class: "fd-card-s", text: sin ? "En " + (PY ? "Paraguay" : "este país") + " todavía no llegan las asistencias del ERP. La lista ya está lista: se llena sola cuando llegue ese dato." : err ? "No se pudo leer: " + err : l.sub + " · " + (pend ? pend + " por atender" : cl.length ? "todos atendidos" : "nadie hoy") }),
                el("p", { class: "fd-card-p", text: cf.paquete_nombre ? "Paquete exclusivo: " + bonito(cf.paquete_nombre) : cf.promo ? "Promo: " + cf.promo : "Sin promo cargada" }),
                el("button", { type: "button", class: "fd-btn", disabled: sin || !cl.length ? true : null, text: "Abrir lista", onclick: function () { abrir(l.id); } })
            ]));
        });
        return grid;
    }
    function abrir(id) { F.lista = id; F.vista = "listas"; F.filtro = "pendientes"; F.ver = POR_TANDA; pintar(); window.scrollTo(0, F.cont.getBoundingClientRect().top + window.scrollY - 10); habilitarSiCorresponde(LISTA[id]); }

    /* Paquete exclusivo: los clientes de la lista quedan habilitados para comprarlo (Campañas, con el control de caja). */
    function habilitarSiCorresponde(l, forzar) {
        var cf = config(l); if (!cf.paquete_key) return Promise.resolve();
        var marca = "fid_hab_" + (PY ? "py_" : "") + l.id + "_" + cf.paquete_key + "_" + hoy();
        try { if (!forzar && localStorage.getItem(marca)) return Promise.resolve(); } catch (e) {}
        var cl = clientesDe(l); if (!cl.length) return Promise.resolve();
        return llamar("comercial_fid_habilitar", { lista: l.id, titulo: l.titulo, paquete_key: cf.paquete_key, paquete_nombre: cf.paquete_nombre, promo: cf.promo, clientes: cl.map(function (c) { return { key_cliente: c.key, cliente: c.cliente }; }) })
            .then(function () { try { localStorage.setItem(marca, "1"); } catch (e) {} })
            .catch(function (e) { avisar("No se pudo habilitar el paquete exclusivo: " + ((e && e.message) || e), "bad"); });
    }

    function vistaLista(l) {
        var box = el("section", { class: "fd-lista" });
        box.appendChild(el("button", { type: "button", class: "fd-volver", onclick: function () { F.lista = null; pintar(); } }, ["← Todas las listas"]));
        box.appendChild(el("h3", { class: "fd-h3", text: l.titulo }));
        box.appendChild(formConfig(l));
        var todos = clientesDe(l), pend = [], hechos = [];
        todos.forEach(function (c) { (estadoDe(c) === "hecho" ? hechos : pend).push(c); });
        /* Primero los que nunca se contactaron; después «volver a escribir». */
        pend.sort(function (a, b) { return (estadoDe(a) === "seguir" ? 1 : 0) - (estadoDe(b) === "seguir" ? 1 : 0); });
        box.appendChild(el("div", { class: "fd-tabs", role: "tablist" }, [["pendientes", "Por atender (" + pend.length + ")"], ["hechos", "Atendidos (" + hechos.length + ")"]].map(function (f) {
            return el("button", { type: "button", role: "tab", class: F.filtro === f[0] ? "is-on" : "", "aria-selected": F.filtro === f[0] ? "true" : "false", text: f[1], onclick: function () { F.filtro = f[0]; F.ver = POR_TANDA; pintar(); } });
        })));
        var lista = F.filtro === "hechos" ? hechos : pend;
        if (!lista.length) box.appendChild(el("p", { class: "fd-vacio", text: F.filtro === "hechos" ? "Todavía no atendiste a nadie de esta lista." : "¡Listo! No quedan clientes por atender en esta lista." }));
        var ul = el("div", { class: "fd-filas" });
        lista.slice(0, F.ver).forEach(function (c) { ul.appendChild(fila(c, l)); });
        box.appendChild(ul);
        if (lista.length > F.ver) {
            var mas = el("button", { type: "button", class: "fd-mas", onclick: verMas }, ["Ver " + Math.min(POR_TANDA, lista.length - F.ver) + " más ", el("span", { text: "(" + F.ver + " de " + lista.length + ")" })]);
            box.appendChild(mas);
            if (window.IntersectionObserver) { if (F.obs) F.obs.disconnect(); F.obs = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { F.obs.disconnect(); verMas(); } }, { rootMargin: "200px" }); F.obs.observe(mas); }
        }
        return box;
    }
    function verMas() { F.ver += POR_TANDA; pintar(); }

    function formConfig(l) {
        var cf = config(l);
        var msj = el("textarea", { rows: "5", maxlength: "1200", "aria-label": "Mensaje de WhatsApp de esta lista" }); msj.value = cf.mensaje;
        var promo = el("input", { type: "text", maxlength: "300", placeholder: PY ? "Ej.: la PROMO 2 MESES a Gs 499.000" : "Ej.: el PLAN TRIMESTRAL a Bs 690 (sale Bs 230 por mes)", "aria-label": "Promo que se ofrece" }); promo.value = cf.promo;
        var sel = el("select", { "aria-label": "Paquete exclusivo" }, [el("option", { value: "", text: "Sin paquete exclusivo" })].concat(F.paquetes.map(function (p) {
            return el("option", { value: p.key, text: p.nombre + " · " + plata(p.precio), selected: p.key === cf.paquete_key });
        })));
        var ejemplo = el("p", { class: "fd-ejemplo" });
        var muestra = clientesDe(l)[0] || { cliente: "María Pérez", sucursal: PY ? "Asunción" : "Equipetrol", fecha_fin: sumar(hoy(), 1), paquete: "Plan mensual", dias: 18, lista: l.id };
        function previa() {
            var tmp = F.config[l.id]; var pk = sel.value, pn = pk ? (F.paquetes.filter(function (p) { return p.key === pk; })[0] || {}).nombre : "";
            F.config[l.id] = { mensaje: msj.value, promo: promo.value.trim(), paquete_key: pk, paquete_nombre: pn || "" };
            ejemplo.textContent = mensajePara(muestra, l);
            F.config[l.id] = tmp; if (!tmp) delete F.config[l.id];
        }
        [msj, promo].forEach(function (x) { x.addEventListener("input", previa); }); sel.addEventListener("change", previa); previa();
        var guardar = el("button", { type: "button", class: "fd-btn", text: "Guardar mensaje y promo", onclick: function () {
            var pk = sel.value, pn = pk ? (F.paquetes.filter(function (p) { return p.key === pk; })[0] || {}).nombre : null;
            if (!msj.value.trim()) { avisar("El mensaje no puede quedar vacío.", "bad"); return; }
            guardar.disabled = true;
            llamar("comercial_fid_config_guardar", { lista: l.id, mensaje: msj.value.trim(), promo: promo.value.trim(), paquete_key: pk || null, paquete_nombre: pn || null }).then(function (r) {
                F.config[l.id] = (r && r.data) || { mensaje: msj.value.trim(), promo: promo.value.trim(), paquete_key: pk, paquete_nombre: pn };
                return habilitarSiCorresponde(l, true);
            }).then(function () {
                avisar(pk ? "Guardado. Los clientes de esta lista quedaron habilitados para el paquete exclusivo (se ve en Campañas)." : "Mensaje y promo guardados.");
                pintar();
            }, function (e) { avisar("No se pudo guardar: " + ((e && e.message) || e), "bad"); guardar.disabled = false; });
        } });
        var abiertoCfg = !!F.abierto["cfg_" + l.id];
        return el("details", { class: "fd-config", open: abiertoCfg ? true : null, ontoggle: function (e) { F.abierto["cfg_" + l.id] = e.target.open; } }, [
            el("summary", {}, [el("b", { text: "Mensaje, promo y paquete exclusivo" }), el("span", { text: cf.guardado ? "Guardado" + (cf.editado_por ? " por " + cf.editado_por : "") + (cf.fecha_edicion ? " el " + corta(cf.fecha_edicion) : "") : "Mensaje sugerido (todavía sin guardar)" })]),
            el("label", { class: "fd-campo" }, [el("span", { text: "Mensaje de WhatsApp" }), msj, el("small", { text: "Se completan solos: {nombre} {jefa} {sucursal} {fecha} {paquete} {promo} {dias}. Si no hay promo, la frase con {promo} no se envía." })]),
            el("div", { class: "fd-dos" }, [
                el("label", { class: "fd-campo" }, [el("span", { text: "Promo que se ofrece" }), promo]),
                el("label", { class: "fd-campo" }, [el("span", { text: "Paquete exclusivo del ERP" }), sel, el("small", { text: "Los clientes de la lista quedan habilitados: lo pueden comprar en la sucursal y se controla en Campañas. El paquete tiene que existir en el ERP." })])
            ]),
            el("div", { class: "fd-previa" }, [el("span", { text: "Así le llega a " + primerNombre(muestra.cliente) + ":" }), ejemplo]),
            guardar
        ]);
    }

    function fila(c, l) {
        var u = ultimoDe(l.id, c.key), k = c.key, abierto = !!F.abierto[k], guardando = !!F.guardando[k], b = F.borrador[k] || {};
        var wa = telWa(c.telefono);
        var hist = u ? el("p", { class: "fd-hist" + (u.resultado === "renueva" ? " is-ok" : "") }, [ico("reloj"), " " + textoRes(u.resultado, l.id) + " · " + corta(u.fecha_on) + (u.motivo ? " · " + MOTIVO[u.motivo] : "") + (u.nota ? " · «" + u.nota.slice(0, 120) + "»" : "")]) : null;
        var acciones = el("div", { class: "fd-acc" }, [
            wa ? el("a", { class: "fd-wa", href: "https://wa.me/" + wa + "?text=" + encodeURIComponent(mensajePara(c, l)), target: "_blank", rel: "noopener", onclick: function () { F.canal[k] = "whatsapp"; if (!abierto) { F.abierto[k] = true; setTimeout(pintar, 300); } } }, [ico("whatsapp"), " WhatsApp"]) : el("span", { class: "fd-sintel", text: "Sin teléfono válido" }),
            c.telefono ? el("a", { class: "fd-tel", href: "tel:" + String(c.telefono).replace(/[^\d+]/g, ""), onclick: function () { F.canal[k] = "llamada"; if (!abierto) { F.abierto[k] = true; setTimeout(pintar, 300); } } }, [ico("telefono"), " Llamar"]) : null,
            !abierto ? el("button", { type: "button", class: "fd-link", text: u ? "Registrar otro contacto" : "Registrar cómo fue", onclick: function () { F.abierto[k] = true; pintar(); } }) : null
        ]);
        var art = el("article", { class: "fd-fila" + (u && u.resultado === "renueva" ? " is-ok" : "") }, [
            el("div", { class: "fd-fila-top" }, [el("b", { class: "fd-nombre", text: c.cliente }), el("span", { class: "fd-suc", text: c.sucursal })]),
            el("p", { class: "fd-dato", text: c.dato }),
            hist, acciones
        ]);
        if (abierto) art.appendChild(registro(c, l, b, guardando));
        return art;
    }
    function registro(c, l, b, guardando) {
        var k = c.key, pideMotivo = b.resultado === "no_renueva" || b.resultado === "lo_piensa";
        var nota = el("textarea", { rows: "2", maxlength: "2000", placeholder: "¿Qué te contó? (su experiencia, qué le gustó, qué no)", "aria-label": "Lo que contó el cliente" }); nota.value = b.nota || "";
        nota.addEventListener("input", function () { (F.borrador[k] = F.borrador[k] || {}).nota = nota.value; });
        var res = el("div", { class: "fd-res" }, RESULTADOS.map(function (r) {
            return el("button", { type: "button", class: "fd-r" + (b.resultado === r[0] ? " is-on" : "") + (r[0] === "renueva" ? " is-pos" : ""), disabled: guardando ? true : null, text: textoRes(r[0], l.id), onclick: function () {
                var d = F.borrador[k] = F.borrador[k] || {}; d.resultado = r[0]; d.nota = nota.value;
                if (r[0] === "no_renueva" || r[0] === "lo_piensa") pintar(); else guardar(c, l);
            } });
        }));
        var mot = pideMotivo ? el("div", { class: "fd-motivos" }, [el("span", { text: "¿Por qué? (lo más importante)" })].concat(MOTIVOS.map(function (m) {
            return el("button", { type: "button", class: "fd-m" + (b.motivo === m[0] ? " is-on" : ""), text: m[1], onclick: function () { (F.borrador[k] = F.borrador[k] || {}).motivo = m[0]; F.borrador[k].nota = nota.value; pintar(); } });
        }))) : null;
        return el("div", { class: "fd-reg" }, [
            el("span", { class: "fd-reg-t", text: "¿Cómo te fue?" }), res, mot, nota,
            el("div", { class: "fd-reg-pie" }, [
                pideMotivo ? el("button", { type: "button", class: "fd-btn", disabled: guardando || !b.motivo ? true : null, text: guardando ? "Guardando…" : "Guardar", onclick: function () { guardar(c, l); } }) : null,
                el("button", { type: "button", class: "fd-link", text: "Cancelar", onclick: function () { F.abierto[k] = false; delete F.borrador[k]; pintar(); } })
            ])
        ]);
    }
    function guardar(c, l) {
        var k = c.key, b = F.borrador[k] || {};
        if (!b.resultado || F.guardando[k]) return;
        F.guardando[k] = true; pintar();
        var cf = config(l);
        llamar("comercial_fid_registrar", { lista: l.id, key_cliente: k, cliente: c.cliente, telefono: c.telefono, sucursal: c.sucursal, paquete_actual: c.paquete, fecha_fin: c.fecha_fin || null,
            canal: F.canal[k] || "whatsapp", resultado: b.resultado, motivo: b.motivo || null, nota: (b.nota || "").trim() || null, paquete_ofrecido: cf.paquete_nombre || cf.promo || null }).then(function (r) {
            F.contactos.unshift((r && r.data) || { lista: l.id, key_cliente: k, resultado: b.resultado, motivo: b.motivo, nota: b.nota, fecha_on: new Date().toISOString() });
            F.abierto[k] = false; delete F.borrador[k];
            avisar(c.cliente + ": " + textoRes(b.resultado, l.id).toLowerCase() + ".");
        }, function (e) { avisar("No se pudo guardar: " + ((e && e.message) || e), "bad"); }).then(function () { F.guardando[k] = false; F.res = null; pintar(); });
    }

    /* ---------- Cómo nos fue ---------- */
    function cargarResultados() {
        F.resCargando = true; F.resError = null; F.verRes = POR_TANDA;
        llamar("comercial_fid_resultados", { desde: sumar(hoy(), -F.periodo), hasta: hoy() }).then(function (r) { F.res = filas(r); }, function (e) { F.resError = (e && e.message) || String(e); F.res = null; })
            .then(function () { F.resCargando = false; pintar(); });
    }
    function vistaResultados() {
        var box = el("section", { class: "fd-resultados" });
        box.appendChild(el("div", { class: "fd-periodo" }, [el("span", { text: "Contactos de los últimos" })].concat([7, 30, 90].map(function (d) {
            return el("button", { type: "button", class: F.periodo === d ? "is-on" : "", text: d + " días", onclick: function () { F.periodo = d; cargarResultados(); pintar(); } });
        }))));
        if (F.resCargando || (!F.res && !F.resError)) { box.appendChild(el("p", { class: "fd-cargando", text: "Cruzando los contactos con las ventas del sistema…" })); return box; }
        if (F.resError) { box.appendChild(el("div", { class: "co-aviso is-bad" }, [el("strong", { text: "No se pudo calcular" }), el("p", { text: F.resError })])); return box; }
        var res = F.res;
        if (!res.length) { box.appendChild(el("p", { class: "fd-vacio", text: "Todavía no hay contactos registrados en este período." })); return box; }
        /* Por cliente y lista: el primer contacto del período y si compró dentro de los 30 días. */
        var porCliente = {};
        res.forEach(function (g) { var kk = g.lista + "|" + g.key_cliente, p = porCliente[kk]; if (!p) p = porCliente[kk] = { lista: g.lista, compro: false, monto: 0, exclusivo: false, respondio: false, ultimo: g };
            if (g.compro) { p.compro = true; p.monto = Math.max(p.monto, g.monto_compra || 0); if (g.con_exclusivo) p.exclusivo = true; }
            if (g.resultado !== "no_contesta" && g.resultado !== "numero_errado") p.respondio = true;
            if (String(g.fecha_on) > String(p.ultimo.fecha_on)) p.ultimo = g; });
        var cl = Object.keys(porCliente).map(function (k) { return porCliente[k]; });
        var tot = { n: cl.length, resp: 0, compro: 0, monto: 0, excl: 0 };
        cl.forEach(function (p) { if (p.respondio) tot.resp++; if (p.compro) { tot.compro++; tot.monto += p.monto; } if (p.exclusivo) tot.excl++; });
        box.appendChild(el("div", { class: "fd-kpis" }, [
            kpi(miles(tot.n), "clientes atendidos"), kpi(pct(tot.resp, tot.n), "respondieron (" + tot.resp + ")"),
            kpi(pct(tot.compro, tot.n), "renovaron o volvieron a comprar (" + tot.compro + ")", true), kpi(plata(tot.monto), "en ventas de esos clientes"),
            kpi(miles(tot.excl), "con el paquete exclusivo")
        ]));
        /* Por lista */
        var tb = el("tbody");
        LISTAS.forEach(function (l) {
            var x = cl.filter(function (p) { return p.lista === l.id; }); if (!x.length) return;
            var c2 = x.filter(function (p) { return p.compro; });
            tb.appendChild(el("tr", {}, [el("td", { text: l.titulo }), el("td", { class: "co-num", text: miles(x.length) }), el("td", { class: "co-num", text: pct(x.filter(function (p) { return p.respondio; }).length, x.length) }),
                el("td", { class: "co-num", text: c2.length + " (" + pct(c2.length, x.length) + ")" }), el("td", { class: "co-num", text: plata(c2.reduce(function (a, p) { return a + p.monto; }, 0)) })]));
        });
        box.appendChild(el("h3", { class: "fd-h3", text: "Por lista" }));
        box.appendChild(el("div", { class: "fd-tablewrap" }, [el("table", { class: "fd-tabla" }, [el("thead", {}, [el("tr", {}, ["Lista", "Atendidos", "Respondieron", "Compraron", "Ventas"].map(function (t, i) { return el("th", { class: i ? "co-num" : null, text: t }); }))]), tb])]));
        /* Por qué no renuevan / no vienen */
        var mot = {}, nMot = 0;
        res.forEach(function (g) { if (g.motivo) { mot[g.motivo] = (mot[g.motivo] || 0) + 1; nMot++; } });
        if (nMot) {
            var max = Math.max.apply(null, Object.keys(mot).map(function (k) { return mot[k]; }));
            box.appendChild(el("h3", { class: "fd-h3", text: "Por qué no renuevan o no vienen" }));
            box.appendChild(el("div", { class: "fd-barras" }, Object.keys(mot).sort(function (a, b) { return mot[b] - mot[a]; }).map(function (k) {
                return el("div", { class: "fd-barra" }, [el("span", { class: "fd-barra-t", text: MOTIVO[k] || k }), el("span", { class: "fd-barra-b" }, [el("i", { style: "width:" + Math.max(4, Math.round(mot[k] / max * 100)) + "%" })]), el("b", { text: mot[k] + " · " + pct(mot[k], nMot) })]);
            })));
        }
        /* Lo que cuentan los clientes */
        var notas = res.filter(function (g) { return g.nota; }).slice(0, 8);
        if (notas.length) {
            box.appendChild(el("h3", { class: "fd-h3", text: "Lo que cuentan los clientes" }));
            box.appendChild(el("ul", { class: "fd-notas" }, notas.map(function (g) { return el("li", {}, [el("q", { text: g.nota }), el("span", { text: (g.cliente || "Cliente") + " · " + (LISTA[g.lista] ? LISTA[g.lista].titulo : "") + " · " + corta(g.fecha_on) + (g.motivo ? " · " + MOTIVO[g.motivo] : "") })]); })));
        }
        /* Detalle */
        box.appendChild(el("h3", { class: "fd-h3", text: "Cada contacto" }));
        var dt = el("tbody");
        res.slice(0, F.verRes).forEach(function (g) {
            dt.appendChild(el("tr", { class: g.compro ? "is-ok" : null }, [el("td", { text: corta(g.fecha_on) }), el("td", { text: g.cliente || "—" }), el("td", { text: LISTA[g.lista] ? LISTA[g.lista].titulo : g.lista }),
                el("td", { text: textoRes(g.resultado, g.lista) + (g.motivo ? " · " + MOTIVO[g.motivo] : "") }),
                el("td", { text: g.compro ? bonito(g.paquete_comprado) + " · " + corta(g.fecha_compra) + " · " + plata(g.monto_compra) + (g.con_exclusivo ? " (exclusivo)" : "") : "—" }), el("td", { text: g.registrado_por || "—" })]));
        });
        box.appendChild(el("div", { class: "fd-tablewrap" }, [el("table", { class: "fd-tabla" }, [el("thead", {}, [el("tr", {}, ["Fecha", "Cliente", "Lista", "Resultado", "Compró", "Atendió"].map(function (t) { return el("th", { text: t }); }))]), dt])]));
        if (res.length > F.verRes) box.appendChild(el("button", { type: "button", class: "fd-mas", onclick: function () { F.verRes += POR_TANDA; pintar(); } }, ["Ver " + Math.min(POR_TANDA, res.length - F.verRes) + " más ", el("span", { text: "(" + F.verRes + " de " + res.length + ")" })]));
        box.appendChild(el("p", { class: "fd-nota", text: "«Compraron»: el cliente compró un paquete en el ERP dentro de los 30 días después del primer contacto. Las ventas son las del sistema de " + (PY ? "Paraguay" : "Bolivia") + "." }));
        return box;
    }
    function kpi(v, t, fuerte) { return el("div", { class: "fd-kpi" + (fuerte ? " is-fuerte" : "") }, [el("b", { text: v }), el("span", { text: t })]); }

    window.ATC_fidel = {
        montar: function (cont, ctx) {
            F.cont = cont; F.ctx = ctx || {};
            if (ctx && ctx.lista && LISTA[ctx.lista]) { F.lista = ctx.lista; F.vista = "listas"; F.filtro = "pendientes"; F.ver = POR_TANDA; ctx.lista = null; }
            if (!F.cargado && !F.cargando) cargar(); else pintar();
            if (F.lista && F.cargado) habilitarSiCorresponde(LISTA[F.lista]);
        },
        _interno: { F: F, LISTAS: LISTAS, mensajePara: mensajePara, clientesDe: clientesDe }
    };
})();
