/* Plan de hoy de la Jefa de Atención al Cliente.
   - Propone grupos de clientes para recuperar o cuidar (vencen pronto, vencidos por rango de fechas,
     pases diarios, en riesgo, pagaron y no vinieron, cumpleañeros sin plan), cada uno con su promoción
     y su mensaje de WhatsApp.
   - Ella elige qué grupos trabajar y, por cada sucursal, descarga 2 listas en Excel (una por cada ATC).
   - Datos: MCP de Calistenia (clientes_por_vencer, clientes_vencidos, clientes_sin_asistir,
     clientes_cumpleanos, listar_paquetes). Sus elecciones se recuerdan en este navegador.
   Se monta desde comercial.js: window.ATC_plan.montar(contenedor). */
(function () {
    "use strict";

    /* ---------- utilidades ---------- */
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
    function aFecha(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
    function sumar(s, dias) { var d = aFecha(s); d.setDate(d.getDate() + dias); return iso(d); }
    function dif(a, b) { var x = aFecha(a), y = aFecha(b); return x && y ? Math.round((x - y) / 86400000) : null; }
    function corta(s) { var d = aFecha(s); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) : "—"; }
    function larga(s) { var d = aFecha(s); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() : "—"; }
    var hoy = function () { return iso(new Date()); };
    var miles = function (n) { return Number(n || 0).toLocaleString("es-BO"); };
    function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
    function primerNombre(n) { var w = String(n || "").trim().split(/\s+/)[0] || ""; return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }
    function nombreBonito(n) { return String(n || "").toLowerCase().replace(/(^|\s)\S/g, function (m) { return m.toUpperCase(); }).trim(); }
    function sucursalDe(s) { var t = String(s || "").trim(); return t || "Sin sucursal"; }
    function telefonoWa(t) {
        var d = String(t || "").replace(/\D/g, "");
        if (d.length === 8) d = "591" + d;
        return d.length >= 10 ? d : "";
    }
    var esPase = function (p) { return /\b(plan\s+)?(diari|semanal|pase)/i.test(String(p || "")); };

    /* ---------- lo que la página recuerda en este navegador ---------- */
    var CLAVE = "atc_plan_v1";
    function leerPrefs() { try { return JSON.parse(localStorage.getItem(CLAVE) || "null") || {}; } catch (e) { return {}; } }
    function guardarPrefs() { try { localStorage.setItem(CLAVE, JSON.stringify(P.prefs)); } catch (e) {} }

    /* ---------- grupos que se proponen (en orden de prioridad) ---------- */
    var PRIORIDAD = { urgente: ["Urgente", "is-urgente"], alta: ["Alta", "is-alta"], media: ["Media", "is-media"], baja: ["Baja", "is-baja"] };
    var SEGS = [
        { id: "vencen", fuente: "porVencer", prioridad: "urgente", titulo: "Vencen en los próximos 7 días",
          porque: "Siguen entrenando: es la renovación más fácil. Hay que hablarles antes de que se les termine el plan.",
          rango: function (h) { return "Vencen entre el " + corta(h) + " y el " + corta(sumar(h, 7)); },
          promo: "renovación anticipada con el PLAN TRIMESTRAL a Bs 690 (sale Bs 230 por mes) o la PROMO DE LOCURA 2 MESES a Bs 380.",
          mensaje: "Hola {nombre} 😊 Te escribimos de Calistenia {sucursal}. Tu plan vence el {fecha}. Si renovás antes, tenemos para vos una {promo} ¿Te lo dejamos listo?",
          filtro: function () { return true; },
          fecha: function (c) { return c.fecha_fin; },
          dato: function (c, h) { var d = dif(c.fecha_fin, h); return "Vence el " + corta(c.fecha_fin) + (d === 0 ? " (hoy)" : d === 1 ? " (mañana)" : " (en " + d + " días)"); },
          orden: function (c) { return c.fecha_fin || ""; } },
        { id: "nunca", fuente: "sinAsistir", prioridad: "urgente", titulo: "Pagaron y todavía no vinieron",
          porque: "Ya pagaron, pero no vinieron ni una vez con este plan. Si no los traemos esta semana, no renuevan.",
          rango: function () { return "Plan vigente, ninguna visita desde que lo compraron"; },
          promo: "",
          mensaje: "Hola {nombre}, ¡bienvenido a Calistenia {sucursal}! 😊 Vimos que todavía no pudiste venir con tu plan, que está activo hasta el {fecha}. ¿Qué día y horario te queda mejor? Te esperamos.",
          filtro: function (c, h) { return c.no_vino_con_este_paquete === true && c.fecha_inicio && dif(h, c.fecha_inicio) >= 2; },
          fecha: function (c) { return c.fecha_fin; },
          dato: function (c) { return "Pagó el plan del " + corta(c.fecha_inicio) + " y no vino"; },
          orden: function (c) { return c.fecha_inicio || ""; } },
        { id: "v1", fuente: "vencidos", prioridad: "alta", titulo: "Vencieron hace 1 a 15 días",
          porque: "Recién dejaron de venir y todavía tienen el hábito. Es el grupo que más vuelve.",
          rango: function (h) { return "Vencieron entre el " + corta(sumar(h, -15)) + " y el " + corta(sumar(h, -1)); },
          desde: 1, hasta: 15,
          promo: "PROMO DE LOCURA 2 MESES a Bs 380 (sale Bs 190 por mes), o el PLAN MENSUAL a Bs 250.",
          mensaje: "Hola {nombre}, ¿cómo estás? Te escribimos de Calistenia {sucursal}. Tu plan terminó el {fecha} y queremos que sigas con tu progreso 💪 Para volver esta semana tenemos la {promo} ¿Te reservamos tu lugar?" },
        { id: "pases", fuente: "vencidos", prioridad: "alta", titulo: "Vinieron con pase diario o semanal",
          porque: "Probaron el gimnasio pagando por día o por semana. Se les ofrece pasar a un plan mensual.",
          rango: function (h) { return "Su pase terminó entre el " + corta(sumar(h, -60)) + " y el " + corta(sumar(h, -1)); },
          desde: 1, hasta: 60, pases: true,
          promo: "PLAN MENSUAL a Bs 250: un mes entero por poco más de lo que cuestan 6 pases diarios.",
          mensaje: "Hola {nombre}, gracias por entrenar con nosotros en Calistenia {sucursal} 💪 Si te gustó, te conviene más el {promo} ¿Te lo activamos?" },
        { id: "v16", fuente: "vencidos", prioridad: "alta", titulo: "Vencieron hace 16 a 45 días",
          porque: "Ya perdieron el ritmo, pero todavía se acuerdan de nosotros. Una promo de regreso los mueve. Ojo: la Promo Reactívate hoy está cargada solo en Berea, Chonta, Guaracachi, Industrial y Pirai.",
          rango: function (h) { return "Vencieron entre el " + corta(sumar(h, -45)) + " y el " + corta(sumar(h, -16)); },
          desde: 16, hasta: 45,
          promo: "Promo Reactívate: 30 días a Bs 219.",
          mensaje: "Hola {nombre}, te extrañamos en Calistenia {sucursal} 💪 Tenemos una promo para quienes ya entrenaron con nosotros: {promo} ¿Te paso los detalles?" },
        { id: "riesgo", fuente: "sinAsistir", prioridad: "media", titulo: "Con plan vigente y 14 días o más sin venir",
          porque: "Todavía tienen plan, pero dejaron de venir. Si no los llamamos, no renuevan. No se les vende nada: se les ayuda a volver.",
          rango: function () { return "Última visita hace 14 días o más"; },
          promo: "",
          mensaje: "Hola {nombre}, ¿todo bien? Te escribimos de Calistenia {sucursal}: hace unos días que no te vemos y tu plan sigue activo hasta el {fecha}. ¿Te ayudamos a encontrar un horario que te quede cómodo? 💪",
          filtro: function (c) { return c.no_vino_con_este_paquete !== true; },
          fecha: function (c) { return c.fecha_fin; },
          dato: function (c) { return "No viene hace " + (c.dias_sin_venir || "14+") + " días · plan hasta " + corta(c.fecha_fin); },
          orden: function (c) { return pad(Math.min(99, Number(c.dias_sin_venir) || 0)); } },
        { id: "cumple", fuente: "cumple", prioridad: "media", titulo: "Cumplen años este mes y no tienen plan",
          porque: "Un saludo de cumpleaños abre la conversación. Solo entran clientes cuyo último plan terminó hace menos de un año.",
          rango: function (h) { var d = aFecha(h); return "Cumpleaños del 1 al " + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() + " de " + d.toLocaleDateString("es-BO", { month: "long" }); },
          promo: "Promo Fidelidad: 30 días a Bs 199.",
          mensaje: "¡Feliz cumpleaños, {nombre}! 🎉 Te saluda todo el equipo de Calistenia {sucursal}. Como regalo, te esperamos de vuelta con la {promo} ¡Que tengas un gran día!",
          filtro: function (c, h) { return c.activo === false && c.fecha_fin && dif(h, c.fecha_fin) <= 365; },
          fecha: function (c, h) { return h.slice(0, 8) + String(c.fecha_nacimiento || "").slice(8, 10); },
          dato: function (c, h) { var f = h.slice(0, 8) + String(c.fecha_nacimiento || "").slice(8, 10), d = dif(f, h); return "Cumple el " + corta(f) + (d === 0 ? " (hoy)" : d < 0 ? " (ya pasó)" : "") + " · último plan hasta " + corta(c.fecha_fin); },
          orden: function (c, h) { var d = dif(h.slice(0, 8) + String(c.fecha_nacimiento || "").slice(8, 10), h); return d < 0 ? "9" + pad(99 + d) : "0" + pad(d); } },
        { id: "v46", fuente: "vencidos", prioridad: "media", titulo: "Vencieron hace 46 a 90 días",
          porque: "Hace uno a tres meses que no vienen. Conviene ofrecerles venir acompañados.",
          rango: function (h) { return "Vencieron entre el " + corta(sumar(h, -90)) + " y el " + corta(sumar(h, -46)); },
          desde: 46, hasta: 90,
          promo: "Promo Reactívate: 30 días a Bs 219, o el PLAN AMIGOS X3: 3 personas por Bs 500.",
          mensaje: "Hola {nombre}, ¡hace rato no te vemos en Calistenia {sucursal}! Si querés retomar, tenemos esto para vos: {promo} Contame y te ayudo a volver." },
        { id: "v91", fuente: "vencidos", prioridad: "baja", titulo: "Vencieron hace 91 a 180 días",
          porque: "Hace más de 3 meses que no vienen. Es el grupo más difícil: conviene trabajarlo cuando sobre tiempo.",
          rango: function (h) { return "Vencieron entre el " + corta(sumar(h, -180)) + " y el " + corta(sumar(h, -91)); },
          desde: 91, hasta: 180,
          promo: "PLAN AMIGOS X3: 3 personas por Bs 500 (dos que ya entrenaron y uno nuevo).",
          mensaje: "Hola {nombre}, te escribimos de Calistenia {sucursal} 😊 Estamos invitando a quienes ya entrenaron con nosotros a volver: {promo} ¿Te interesa?" }
    ];
    /* Grupos de vencidos: mismo filtro, fecha y orden. */
    SEGS.forEach(function (s, i) {
        s.n = i + 1;
        if (s.fuente !== "vencidos") return;
        s.filtro = function (c, h) { var d = dif(h, c.fecha_fin); return d >= s.desde && d <= s.hasta && (s.pases ? esPase(c.paquete) : !esPase(c.paquete)); };
        s.fecha = function (c) { return c.fecha_fin; };
        s.dato = function (c, h) { return (s.pases ? "Su pase terminó el " : "Venció el ") + corta(c.fecha_fin) + " (hace " + dif(h, c.fecha_fin) + " días) · " + nombreBonito(c.paquete); };
        s.orden = function (c, h) { return ("00000" + dif(h, c.fecha_fin)).slice(-5); };   // los que vencieron hace menos, primero
    });
    var SEG = {}; SEGS.forEach(function (s) { SEG[s.id] = s; });
    var POR_DEFECTO = ["vencen", "nunca", "v1", "pases"];

    /* ---------- estado ---------- */
    var P = {
        prefs: leerPrefs(), cargando: false, cargado: false, avance: "", errores: {},
        datos: { porVencer: [], vencidos: [], sinAsistir: [], cumple: [] }, paquetes: [], fecha: null,
        editando: null, viendo: null, cont: null
    };
    if (!Array.isArray(P.prefs.sel)) P.prefs.sel = POR_DEFECTO.slice();
    if (!P.prefs.textos) P.prefs.textos = {};
    if (!P.prefs.bajadas) P.prefs.bajadas = {};
    if (P.prefs.max == null) P.prefs.max = 40;

    function texto(seg, campo) { var t = P.prefs.textos[seg.id]; return t && t[campo] != null ? t[campo] : seg[campo]; }
    /* La promoción va en minúscula dentro del mensaje («tenemos para vos una renovación…»), pero en la tarjeta y el Excel empieza en mayúscula. */
    function promoVisible(s) { var p = texto(s, "promo"); return p ? p.charAt(0).toUpperCase() + p.slice(1) : ""; }
    function elegido(id) { return P.prefs.sel.indexOf(id) >= 0; }

    /* ---------- datos del MCP ---------- */
    function llamar(tool, args) {
        return window.CM.llamar(tool, args || {}).then(function (r) {
            if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { r = {}; } }
            if (r && r.estado === "error") throw new Error(r.error || "error del servidor");
            return r || {};
        });
    }
    function filas(r) { return Array.isArray(r) ? r : (r && (r.filas || r.result || r.data)) || []; }
    /* Trae todas las páginas (200 por página), de a 4 pedidos a la vez. */
    function todas(tool, args, nombre) {
        return llamar(tool, Object.assign({}, args, { limite: 200, offset: 0 })).then(function (r) {
            var acc = filas(r).slice(), total = Number(r.total) || acc.length, offsets = [];
            for (var o = acc.length; o < Math.min(total, 6000); o += 200) offsets.push(o);
            var i = 0;
            function avisar() { P.avance = "Leyendo " + nombre + ": " + miles(Math.min(acc.length, total)) + " de " + miles(total) + "…"; pintarAvance(); }
            avisar();
            function siguiente() {
                if (i >= offsets.length) return Promise.resolve();
                var off = offsets[i++];
                return llamar(tool, Object.assign({}, args, { limite: 200, offset: off })).then(function (x) { acc = acc.concat(filas(x)); avisar(); return siguiente(); });
            }
            return Promise.all([siguiente(), siguiente(), siguiente(), siguiente()]).then(function () { return acc; });
        });
    }
    function cargar() {
        if (P.cargando) return;
        P.cargando = true; P.errores = {}; P.fecha = hoy();
        pintar();
        var h = P.fecha;
        var tareas = [
            ["porVencer", function () { return todas("clientes_por_vencer", { dias: 7 }, "clientes por vencer"); }],
            ["sinAsistir", function () { return todas("clientes_sin_asistir", { dias: 14 }, "clientes sin venir"); }],
            ["vencidos", function () { return todas("clientes_vencidos", { dias: 180 }, "clientes vencidos"); }],
            ["cumple", function () { return todas("clientes_cumpleanos", { mes: h.slice(0, 7) }, "cumpleaños del mes"); }]
        ];
        var pPaq = llamar("listar_paquetes", {}).then(function (r) {
            P.paquetes = filas(r).filter(function (p) { return p.usa_molinete && Number(p.precio) > 0 && Number(p.dias) > 0 && !/prueba|borrar|no tocar/i.test(p.descripcion || ""); })
                .map(function (p) { return { nombre: String(p.descripcion || "").trim(), precio: Number(p.precio), dias: Number(p.dias), caja: p.vendible_en_caja === true, sucursales: (p.sucursales || []).map(function (s) { return String(s).trim(); }) }; })
                .sort(function (a, b) { return a.precio - b.precio; });
        }).catch(function () { P.paquetes = []; });
        /* Una fuente a la vez: el servidor responde mejor y el avance se entiende. */
        var cadena = Promise.resolve();
        tareas.forEach(function (t) {
            cadena = cadena.then(function () {
                return t[1]().then(function (l) { P.datos[t[0]] = l; }).catch(function (e) {
                    if (e && e.sinSesion) { var av = document.getElementById("cm-sesion"); if (av) av.hidden = false; }
                    P.errores[t[0]] = (e && e.message) || String(e); P.datos[t[0]] = [];
                });
            });
        });
        Promise.all([cadena, pPaq]).then(function () { P.cargando = false; P.cargado = true; P.avance = ""; calcular(); pintar(); });
    }

    /* ---------- armado de grupos y listas ---------- */
    var GRUPOS = {};   // id -> [{key, cliente, telefono, sucursal, paquete, fecha, dato, orden, seg}]
    function calcular() {
        var h = P.fecha || hoy();
        GRUPOS = {};
        SEGS.forEach(function (s) {
            var vistos = {}, l = [];
            (P.datos[s.fuente] || []).forEach(function (c) {
                if (!s.filtro(c, h)) return;
                var k = String(c.key_usuario || c.key_cliente || (c.cliente + "|" + c.telefono));
                if (vistos[k]) return; vistos[k] = 1;
                l.push({ key: k, cliente: nombreBonito(c.cliente), telefono: String(c.telefono || "").trim(), sucursal: sucursalDe(c.sucursal),
                    paquete: nombreBonito(c.paquete), fecha: s.fecha(c, h), dato: s.dato(c, h), orden: s.orden(c, h), seg: s.id });
            });
            l.sort(function (a, b) { return a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : a.cliente.localeCompare(b.cliente); });
            GRUPOS[s.id] = l;
        });
    }
    /* Clientes de los grupos elegidos, por sucursal, sin repetir (queda el grupo más prioritario),
       repartidos en 2 listas alternando para que las dos reciban clientes igual de buenos. */
    function listasPorSucursal() {
        var porSuc = {};
        SEGS.forEach(function (s) {
            if (!elegido(s.id)) return;
            (GRUPOS[s.id] || []).forEach(function (c) {
                var x = porSuc[c.sucursal] || (porSuc[c.sucursal] = { sucursal: c.sucursal, todos: [], vistos: {}, porSeg: {} });
                if (x.vistos[c.key]) return;
                x.vistos[c.key] = 1; x.todos.push(c); x.porSeg[s.id] = (x.porSeg[s.id] || 0) + 1;
            });
        });
        var max = Number(P.prefs.max) || 0;
        return Object.keys(porSuc).sort(function (a, b) { return a === "Sin sucursal" ? 1 : b === "Sin sucursal" ? -1 : a.localeCompare(b); }).map(function (k) {
            var x = porSuc[k], l1 = [], l2 = [];
            x.todos.forEach(function (c, i) { (i % 2 ? l2 : l1).push(c); });
            if (max > 0) { l1 = l1.slice(0, max); l2 = l2.slice(0, max); }
            x.listas = [l1, l2];
            x.quedan = x.todos.length - l1.length - l2.length;
            return x;
        });
    }
    function mensajePara(c) {
        var s = SEG[c.seg], promo = texto(s, "promo");
        return texto(s, "mensaje").replace(/\{nombre\}/g, primerNombre(c.cliente)).replace(/\{sucursal\}/g, c.sucursal === "Sin sucursal" ? "" : c.sucursal)
            .replace(/\{fecha\}/g, corta(c.fecha)).replace(/\{promo\}/g, promo).replace(/\s+([,.?!])/g, "$1").replace(/\s{2,}/g, " ").trim();
    }
    function linkWa(c) { var t = telefonoWa(c.telefono); return t ? "https://wa.me/" + t + "?text=" + encodeURIComponent(mensajePara(c)) : ""; }

    /* ---------- Excel ---------- */
    var cargaXlsx = null;
    function xlsx() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (cargaXlsx) return cargaXlsx;
        cargaXlsx = new Promise(function (ok, mal) {
            var s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
            s.onload = function () { window.XLSX ? ok(window.XLSX) : mal(new Error("sin XLSX")); };
            s.onerror = function () { cargaXlsx = null; mal(new Error("No se pudo cargar el generador de Excel.")); };
            document.head.appendChild(s);
        });
        return cargaXlsx;
    }
    var COLS = ["N°", "Grupo", "Cliente", "Teléfono", "WhatsApp", "Dato", "Promoción a ofrecer", "Mensaje sugerido", "Resultado", "Observaciones"];
    function hojaLista(X, lista, titulo) {
        var filasHoja = [[titulo], ["Preparada por Atención al Cliente el " + larga(P.fecha) + ". Resultado: Compró · Lo va a pensar · No contesta · No le interesa · Número equivocado."], [], COLS];
        lista.forEach(function (c, i) {
            var s = SEG[c.seg];
            filasHoja.push([i + 1, s.n + ". " + s.titulo, c.cliente, c.telefono, linkWa(c) ? "Abrir chat" : "Sin número válido", c.dato, promoVisible(s) || "Sin promoción (seguimiento)", mensajePara(c), "", ""]);
        });
        var ws = X.utils.aoa_to_sheet(filasHoja);
        lista.forEach(function (c, i) {
            var url = linkWa(c), ref = X.utils.encode_cell({ r: 4 + i, c: 4 });
            if (url && ws[ref]) ws[ref].l = { Target: url, Tooltip: "Abre WhatsApp con el mensaje escrito" };
        });
        ws["!cols"] = [{ wch: 4 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 40 }, { wch: 40 }, { wch: 70 }, { wch: 18 }, { wch: 30 }];
        ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }];
        if (lista.length) ws["!autofilter"] = { ref: "A4:J" + (4 + lista.length) };
        return ws;
    }
    function hojasComunes(X, wb) {
        var promos = [["Grupo", "Por qué", "Promoción", "Mensaje (plantilla)"]];
        SEGS.forEach(function (s) { if (elegido(s.id)) promos.push([s.n + ". " + s.titulo, s.porque, promoVisible(s) || "Sin promoción (seguimiento)", texto(s, "mensaje")]); });
        var wp = X.utils.aoa_to_sheet(promos); wp["!cols"] = [{ wch: 40 }, { wch: 60 }, { wch: 50 }, { wch: 90 }];
        X.utils.book_append_sheet(wb, wp, "Promociones");
        var como = [["Cómo trabajar tu lista"], [],
            ["1. Empezá por arriba: la lista ya está ordenada por prioridad."],
            ["2. Tocá «Abrir chat» en la columna WhatsApp: se abre el chat con el mensaje escrito. Revisalo y envialo."],
            ["3. Si podés, llamá primero por WhatsApp; si no atiende, mandá el mensaje."],
            ["4. Anotá el resultado en la columna Resultado: Compró · Lo va a pensar · No contesta · No le interesa · Número equivocado."],
            ["5. Si compra, registrá la venta en caja como siempre y anotalo aquí."],
            ["6. Al terminar el día, devolvé esta planilla a Atención al Cliente."]];
        var wc = X.utils.aoa_to_sheet(como); wc["!cols"] = [{ wch: 110 }];
        X.utils.book_append_sheet(wb, wc, "Cómo trabajar");
    }
    function nombreHoja(s) { return String(s).replace(/[\\\/\?\*\[\]:]/g, "").slice(0, 31); }
    function bajar(wb, X, archivo) { X.writeFile(wb, archivo, { compression: true }); }
    function marcarBajada(suc, n) {
        P.prefs.bajadas[P.fecha + "|" + suc + "|" + n] = new Date().toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
        Object.keys(P.prefs.bajadas).forEach(function (k) { if (k.slice(0, 10) < sumar(P.fecha, -7)) delete P.prefs.bajadas[k]; });
        guardarPrefs();
    }
    function descargarLista(x, n, boton) {
        var lista = x.listas[n - 1];
        if (!lista.length) return;
        boton.disabled = true;
        xlsx().then(function (X) {
            var wb = X.utils.book_new();
            X.utils.book_append_sheet(wb, hojaLista(X, lista, "Calistenia " + x.sucursal + " · Lista " + n + " (ATC " + n + ") · " + lista.length + " clientes"), "Lista " + n);
            hojasComunes(X, wb);
            bajar(wb, X, "ATC-" + norm(x.sucursal).replace(/\s+/g, "-") + "-lista" + n + "-" + P.fecha + ".xlsx");
            marcarBajada(x.sucursal, n); pintar();
        }).catch(function (e) { descargarCsv(lista, x.sucursal, n); avisar("No se pudo armar el Excel (" + e.message + "): se descargó en CSV.", "warn"); })
          .then(function () { boton.disabled = false; });
    }
    function descargarTodas(listas, boton) {
        boton.disabled = true;
        xlsx().then(function (X) {
            var wb = X.utils.book_new();
            listas.forEach(function (x) {
                [1, 2].forEach(function (n) {
                    if (!x.listas[n - 1].length) return;
                    X.utils.book_append_sheet(wb, hojaLista(X, x.listas[n - 1], "Calistenia " + x.sucursal + " · Lista " + n + " (ATC " + n + ")"), nombreHoja(x.sucursal + " L" + n));
                    marcarBajada(x.sucursal, n);
                });
            });
            hojasComunes(X, wb);
            bajar(wb, X, "ATC-todas-las-sucursales-" + P.fecha + ".xlsx");
            pintar();
        }).catch(function (e) { avisar("No se pudo armar el Excel: " + e.message, "bad"); }).then(function () { boton.disabled = false; });
    }
    function descargarCsv(lista, suc, n) {
        var esc = function (v) { var s = v == null ? "" : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        var out = [COLS.slice(0, 4).concat(["WhatsApp (link)"], COLS.slice(5))].concat(lista.map(function (c, i) {
            var s = SEG[c.seg]; return [i + 1, s.n + ". " + s.titulo, c.cliente, c.telefono, linkWa(c), c.dato, promoVisible(s), mensajePara(c), "", ""];
        }));
        var blob = new Blob(["﻿" + out.map(function (f) { return f.map(esc).join(";"); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = el("a", { href: URL.createObjectURL(blob), download: "ATC-" + norm(suc).replace(/\s+/g, "-") + "-lista" + n + "-" + P.fecha + ".csv" });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        marcarBajada(suc, n);
    }

    /* ---------- pintar ---------- */
    function avisar(t, tono) { var m = document.getElementById("co-aviso"); if (!m) return; m.textContent = t; m.className = "co-msg is-" + (tono || "ok"); clearTimeout(avisar.t); avisar.t = setTimeout(function () { m.textContent = ""; }, 9000); }
    function pintarAvance() { var n = P.cont && P.cont.querySelector(".pl-avance"); if (n) n.textContent = P.avance || "Cargando…"; }
    function chipPrioridad(s) { var p = PRIORIDAD[s.prioridad]; return el("span", { class: "pl-prio " + p[1], text: p[0] }); }

    function emergencias() {
        var h = P.fecha, pv = GRUPOS.vencen || [], nunca = GRUPOS.nunca || [], cumple = (P.datos.cumple || []);
        var vencenYa = pv.filter(function (c) { return dif(c.fecha, h) <= 1; }).length;
        var ayer = (P.datos.vencidos || []).filter(function (c) { return dif(h, c.fecha_fin) === 1 && !esPase(c.paquete); }).length;
        var cumpleHoy = cumple.filter(function (c) { return String(c.fecha_nacimiento || "").slice(5, 10) === h.slice(5, 10); }).length;
        var item = function (n, titulo, sub, tono, seg) {
            return el("button", { type: "button", class: "pl-emerg" + (tono ? " is-" + tono : ""), onclick: seg ? function () { var t = P.cont.querySelector("#pl-seg-" + seg); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("is-flash"); setTimeout(function () { t.classList.remove("is-flash"); }, 1600); } } : null },
                [el("span", { class: "pl-emerg-v", text: miles(n) }), el("span", { class: "pl-emerg-t", text: titulo }), el("span", { class: "pl-emerg-s", text: sub })]);
        };
        return el("section", { class: "pl-bloque", "aria-labelledby": "pl-h-urg" }, [
            el("h2", { class: "co-h2", id: "pl-h-urg", text: "Lo urgente de hoy" }),
            el("div", { class: "pl-emergs" }, [
                item(vencenYa, "Vencen hoy o mañana", "Llamarlos hoy para que renueven", vencenYa ? "rojo" : null, "vencen"),
                item(nunca.length, "Pagaron y no vinieron", "Agendarles su primera clase", nunca.length ? "rojo" : null, "nunca"),
                item(ayer, "Vencieron ayer", "Todavía tienen el hábito", ayer ? "ambar" : null, "v1"),
                item(cumpleHoy, "Cumplen años hoy", "Clientes y exclientes: saludarlos", cumpleHoy ? "ambar" : null, "cumple")
            ])
        ]);
    }

    function formularioTextos(s) {
        var promo = el("textarea", { rows: "2", maxlength: "300" }); promo.value = texto(s, "promo");
        var msj = el("textarea", { rows: "4", maxlength: "700" }); msj.value = texto(s, "mensaje");
        var ejemplo = el("p", { class: "pl-ejemplo" });
        var muestra = (GRUPOS[s.id] || [])[0] || { cliente: "María Pérez", sucursal: "Berea", fecha: P.fecha, seg: s.id };
        function previa() {
            var guardado = P.prefs.textos[s.id];
            P.prefs.textos[s.id] = { promo: promo.value.trim(), mensaje: msj.value.trim() };
            ejemplo.textContent = mensajePara(muestra);
            if (guardado) P.prefs.textos[s.id] = guardado; else delete P.prefs.textos[s.id];
        }
        promo.addEventListener("input", previa); msj.addEventListener("input", previa); previa();
        var chips = P.paquetes.length ? el("div", { class: "pl-paqs" }, [el("span", { class: "co-muted", text: "Paquetes cargados hoy (tocá uno para agregarlo a la promoción):" })].concat(
            P.paquetes.filter(function (p) { return /promo|plan|fidelidad|reactiv|amigos|black|trimestral|mensual/i.test(p.nombre); }).map(function (p) {
                return el("button", { type: "button", class: "co-btn pl-paq", title: (p.caja ? "Se vende en caja" : "No figura como vendible en caja") + " · " + (p.sucursales.length >= 11 ? "todas las sucursales" : p.sucursales.join(", ")),
                    text: p.nombre + " · Bs " + miles(p.precio) + " · " + p.dias + " días", onclick: function () { promo.value = (promo.value ? promo.value.replace(/\.?\s*$/, ". ") : "") + p.nombre + ": " + p.dias + " días a Bs " + miles(p.precio) + "."; previa(); promo.focus(); } });
            }))) : null;
        var f = el("form", { class: "co-card co-form pl-form", novalidate: true }, [
            el("h3", { class: "co-h3 co-ancho", text: "Promoción y mensaje del grupo " + s.n }),
            el("label", { class: "co-ancho" }, ["Promoción que se ofrece (va dentro del mensaje donde dice {promo})", promo]),
            chips ? el("div", { class: "co-ancho" }, [chips]) : null,
            el("label", { class: "co-ancho" }, ["Mensaje de WhatsApp. Se completan solos: {nombre} {sucursal} {fecha} {promo}", msj]),
            el("div", { class: "co-ancho pl-ejemplo-box" }, [el("span", { class: "co-muted", text: "Así le llega a " + (muestra.cliente || "un cliente") + ":" }), ejemplo]),
            el("div", { class: "co-ancho co-acciones" }, [
                el("button", { type: "submit", class: "co-primario", text: "Guardar" }),
                el("button", { type: "button", class: "co-btn", text: "Volver a la propuesta", onclick: function () { delete P.prefs.textos[s.id]; guardarPrefs(); P.editando = null; pintar(); avisar("Se volvió a la propuesta original del grupo " + s.n + "."); } }),
                el("button", { type: "button", class: "co-btn", text: "Cancelar", onclick: function () { P.editando = null; pintar(); } })
            ])
        ]);
        f.addEventListener("submit", function (ev) {
            ev.preventDefault();
            if (!msj.value.trim()) { msj.focus(); return; }
            P.prefs.textos[s.id] = { promo: promo.value.trim(), mensaje: msj.value.trim() };
            guardarPrefs(); P.editando = null; pintar(); avisar("Guardado: el grupo " + s.n + " usa tu promoción y tu mensaje.");
        });
        return f;
    }

    function tarjeta(s) {
        var l = GRUPOS[s.id] || [], on = elegido(s.id), err = P.errores[s.fuente];
        var sucs = {}; l.forEach(function (c) { sucs[c.sucursal] = 1; });
        var promo = promoVisible(s);
        var t = el("article", { class: "pl-seg" + (on ? " is-on" : "") + (l.length ? "" : " is-vacio"), id: "pl-seg-" + s.id }, [
            el("div", { class: "pl-seg-cab" }, [el("span", { class: "pl-num", text: String(s.n) }), chipPrioridad(s),
                el("label", { class: "pl-incluir" }, [el("input", { type: "checkbox", checked: on, disabled: !l.length, onchange: function (e) {
                    var i = P.prefs.sel.indexOf(s.id); if (e.target.checked && i < 0) P.prefs.sel.push(s.id); if (!e.target.checked && i >= 0) P.prefs.sel.splice(i, 1);
                    guardarPrefs(); pintar();
                } }), on ? "En las listas" : "Agregar a las listas"])]),
            el("h3", { class: "pl-seg-t", text: s.titulo }),
            el("p", { class: "pl-seg-v" }, [el("b", { text: err ? "—" : miles(l.length) }), err ? " no se pudo leer" : l.length === 1 ? " cliente" : " clientes", !err && l.length ? el("span", { class: "co-muted", text: " en " + Object.keys(sucs).length + " sucursales" }) : null]),
            el("p", { class: "pl-rango", text: s.rango(P.fecha) }),
            el("p", { class: "pl-porque", text: s.porque }),
            el("div", { class: "pl-promo" }, [el("span", { class: "pl-promo-k", text: promo ? "Promoción propuesta" : "Qué hacer" }), el("span", { text: promo || "Sin promoción: llamar y ayudarlo a volver a entrenar." }),
                P.prefs.textos[s.id] ? el("span", { class: "co-chip co-ok", text: "editada" }) : null]),
            el("button", { type: "button", class: "co-btn pl-editar", text: "Cambiar promoción y mensaje", onclick: function () { P.editando = P.editando === s.id ? null : s.id; pintar(); var f = P.cont.querySelector(".pl-form textarea"); if (f) f.focus(); } })
        ]);
        if (err) t.appendChild(el("p", { class: "co-msg is-bad", text: err }));
        return t;
    }

    /* ---------- asignar listas a las ATC (necesita el rol de Jefa de Atención al Cliente) ---------- */
    function activa(e) { return Number(e.estado == null ? 1 : e.estado) > 0; }
    function equipoDe(suc) {
        var act = ((P.ctx && P.ctx.equipo) || []).filter(activa), k = norm(suc);
        var de = act.filter(function (e) { return (e.sucursales || []).some(function (s) { return norm(s) === k; }); });
        return { de: de, otras: act.filter(function (e) { return de.indexOf(e) < 0; }) };
    }
    function nombreAtc(key) { var e = ((P.ctx && P.ctx.equipo) || []).filter(function (x) { return x.key === key; })[0]; return e ? e.nombre : key; }
    /* Lo que ya está asignado en una sucursal: por ATC, cuántos clientes y cuántos ya contactó. */
    function asignadoEn(suc) {
        var ult = {}; ((P.ctx && P.ctx.ultimas) || []).forEach(function (g) { ult[g.key_cliente] = g; });
        var por = {};
        ((P.ctx && P.ctx.asignaciones) || []).forEach(function (a) {
            if (!a.lote || a.sucursal !== suc || !a.key_ejecutiva) return;
            var x = por[a.key_ejecutiva] || (por[a.key_ejecutiva] = { key: a.key_ejecutiva, n: 0, contactados: 0, lote: a.lote, lista_n: a.lista_n });
            x.n++; if (a.lote > x.lote) x.lote = a.lote;
            var g = ult[a.key_cliente]; if (g && String(g.fecha_on) >= String(a.fecha_on)) x.contactados++;
        });
        return por;
    }
    function elegidaPara(suc, n) {
        var k = suc + "|" + n, p = P.prefs.atc && P.prefs.atc[k];
        var eq = equipoDe(suc), todas = eq.de.concat(eq.otras);
        if (p && todas.some(function (e) { return e.key === p; })) return p;
        var ya = asignadoEn(suc), previa = Object.keys(ya).filter(function (key) { return ya[key].lista_n === n; })[0];
        if (previa && todas.some(function (e) { return e.key === previa; })) return previa;
        return eq.de[n - 1] ? eq.de[n - 1].key : "";
    }
    function paquete(lista, base) {
        return lista.map(function (c, i) {
            var s = SEG[c.seg];
            return { key_cliente: String(c.key).replace(/\//g, "-"), cliente: c.cliente, telefono: c.telefono, sucursal: c.sucursal, grupo: s.id, grupo_n: s.n,
                grupo_titulo: s.titulo, dato: c.dato, promo: promoVisible(s), mensaje: mensajePara(c), orden: base + i };
        });
    }
    /* Asigna las 2 listas de una sucursal. Si la misma ATC tiene las dos, se le asignan juntas. */
    function asignarSucursal(x) {
        var a1 = elegidaPara(x.sucursal, 1), a2 = elegidaPara(x.sucursal, 2), pedidos = [];
        if (a1 && a1 === a2) pedidos.push({ ej: a1, n: 1, clientes: paquete(x.listas[0].concat(x.listas[1]), 0) });
        else {
            if (a1 && x.listas[0].length) pedidos.push({ ej: a1, n: 1, clientes: paquete(x.listas[0], 0) });
            if (a2 && x.listas[1].length) pedidos.push({ ej: a2, n: 2, clientes: paquete(x.listas[1], 0) });
        }
        var hechos = [];
        return pedidos.reduce(function (p, q) {
            return p.then(function () {
                return P.ctx.llamar("comercial_plan_asignar", { key_ejecutiva: q.ej, sucursal: x.sucursal, lista_n: q.n, clientes: q.clientes, nota: P.prefs.nota || "", reemplazar: P.prefs.reemplazar !== false })
                    .then(function () { hechos.push(nombreAtc(q.ej) + " (" + q.clientes.length + ")"); });
            });
        }, Promise.resolve()).then(function () { return hechos; });
    }
    function asignarVarias(listas, boton) {
        var conAtc = listas.filter(function (x) { return elegidaPara(x.sucursal, 1) || elegidaPara(x.sucursal, 2); });
        if (!conAtc.length) { avisar("Elige al menos una ATC en la tabla.", "warn"); return; }
        boton.disabled = true;
        var hechos = [], i = 0;
        function sig() {
            if (i >= conAtc.length) return Promise.resolve();
            var x = conAtc[i++];
            boton.textContent = "Asignando " + x.sucursal + " (" + i + " de " + conAtc.length + ")…";
            return asignarSucursal(x).then(function (h) { hechos = hechos.concat(h); }).then(sig);
        }
        sig().then(function () {
            avisar("Listo: " + hechos.length + " listas asignadas. Cada ATC ya la ve en «Mi lista».");
            return P.ctx.recargar();
        }).catch(function (e) { avisar("Se cortó la asignación: " + ((e && e.message) || e) + ". Lo asignado hasta ahí quedó guardado.", "bad"); boton.disabled = false; });
    }

    function celdaAtc(x, n) {
        var eq = equipoDe(x.sucursal), val = elegidaPara(x.sucursal, n);
        var sel = el("select", { class: "dash-select pl-atc", "aria-label": "ATC para la lista " + n + " de " + x.sucursal, onchange: function (e) {
            P.prefs.atc = P.prefs.atc || {}; P.prefs.atc[x.sucursal + "|" + n] = e.target.value; guardarPrefs(); pintar();
        } }, [el("option", { value: "", text: "— Sin asignar —" })]
            .concat(eq.de.length ? [el("optgroup", { label: "De " + x.sucursal }, eq.de.map(function (e) { return el("option", { value: e.key, text: e.nombre, selected: e.key === val }); }))] : [])
            .concat(eq.otras.length ? [el("optgroup", { label: "Otras sucursales" }, eq.otras.map(function (e) { return el("option", { value: e.key, text: e.nombre, selected: e.key === val }); }))] : []));
        return el("div", { class: "pl-atc-celda" }, [sel, el("span", { class: "co-muted pl-atc-n", text: x.listas[n - 1].length + " clientes" })]);
    }
    function celdaAvance(x) {
        var ya = asignadoEn(x.sucursal), keys = Object.keys(ya);
        if (!keys.length) return el("span", { class: "co-muted", text: "Sin listas asignadas" });
        return el("div", { class: "pl-avances" }, keys.map(function (k) {
            var a = ya[k], pct = a.n ? Math.round(a.contactados / a.n * 100) : 0, d = aFecha(String(a.lote).slice(0, 10));
            return el("div", { class: "pl-avance-atc" }, [
                el("span", {}, [el("b", { text: nombreAtc(k) }), " · " + a.contactados + " de " + a.n + " contactados"]),
                el("span", { class: "co-meta", title: pct + "%" }, [el("span", { style: "width:" + pct + "%" })]),
                el("span", { class: "co-muted", text: "Asignada el " + (d ? corta(iso(d)) : "—") + (String(a.lote).slice(0, 10) === P.fecha ? " (hoy)" : "") })
            ]);
        }));
    }

    function bloqueListas() {
        var listas = listasPorSucursal(), elegidos = SEGS.filter(function (s) { return elegido(s.id); });
        var total = listas.reduce(function (a, x) { return a + x.listas[0].length + x.listas[1].length; }, 0);
        var quedan = listas.reduce(function (a, x) { return a + x.quedan; }, 0);
        var conEquipo = P.ctx && ((P.ctx.equipo || []).filter(activa).length > 0);
        var max = el("input", { type: "number", min: "0", max: "500", step: "5", value: String(P.prefs.max || 0), class: "pl-max", onchange: function (e) {
            P.prefs.max = Math.max(0, Math.min(500, parseInt(e.target.value, 10) || 0)); guardarPrefs(); pintar();
        } });
        var partes = [];
        if (!P.ctx) partes.push(el("div", { class: "co-aviso is-warn" }, [el("strong", { text: "Solo descarga en Excel" }), el("p", { text: "Para asignar las listas dentro del sistema, sal del centro de mando y vuelve a ingresar con el usuario de ATC Central del ERP (permiso «atencion»). Mientras tanto puedes descargarlas en Excel." })]));
        else if (!conEquipo) partes.push(el("div", { class: "co-aviso is-warn" }, [el("strong", { text: "Primero agrega a las ATC" }),
            el("p", { text: "Todavía no hay ATC en tu equipo. Cada ATC aparece en la pestaña Equipo la primera vez que entra al centro de mando con su usuario del ERP (permiso «atc» en /centro_mando); ahí le asignas su sucursal y después aparece aquí para darle su lista." }),
            el("button", { type: "button", class: "co-btn co-btn-fuerte", text: "Ir a Equipo", onclick: function () { P.ctx.irA("equipo"); } })]));
        if (P.ctx && conEquipo) {
            var nota = el("textarea", { rows: "2", maxlength: "600", placeholder: "Ej.: Hoy prioricen los que vencen mañana. Si no atienden, manden el mensaje y anoten «No contesta»." });
            nota.value = P.prefs.nota || "";
            nota.addEventListener("change", function () { P.prefs.nota = nota.value.trim(); guardarPrefs(); });
            var reemp = el("input", { type: "checkbox", checked: P.prefs.reemplazar !== false, onchange: function (e) { P.prefs.reemplazar = e.target.checked; guardarPrefs(); } });
            partes.push(el("div", { class: "co-card pl-nota" }, [
                el("label", {}, ["Mensaje para las ATC (lo ven arriba de su lista)", nota]),
                el("label", { class: "co-check" }, [reemp, "Al asignar, reemplazar la lista anterior de cada ATC en esa sucursal (lo que ya contactaron queda registrado)"])
            ]));
        }
        partes.push(el("div", { class: "pl-listas-cab" }, [
            el("label", {}, ["Clientes por lista (0 = todos)", max]),
            el("p", { class: "co-muted pl-resumen" }, [elegidos.length ? (miles(total) + " clientes en " + listas.length + " sucursales, en 2 listas por sucursal" + (quedan ? ". Quedan " + miles(quedan) + " para otro día (sube el número si quieres darles más)." : ".")) : "Elige al menos un grupo arriba para armar las listas."]),
            P.ctx && conEquipo ? el("button", { type: "button", class: "co-primario", text: "Asignar todas las sucursales", disabled: !total, onclick: function (e) { asignarVarias(listas, e.currentTarget); } }) : null,
            el("button", { type: "button", class: P.ctx && conEquipo ? "co-btn" : "co-primario", text: "Descargar todo en Excel", disabled: !total, onclick: function (e) { descargarTodas(listas, e.currentTarget); } })
        ]));
        var asignar = P.ctx && conEquipo;
        var cols = ["Sucursal"].concat(elegidos.map(function (s) { return String(s.n); }), ["Total"], asignar ? ["Lista 1 → ATC", "Lista 2 → ATC", "", "Avance de las ATC"] : ["Lista 1", "Lista 2", ""]);
        var tb = el("tbody");
        if (!listas.length) tb.appendChild(el("tr", {}, [el("td", { colspan: cols.length, class: "co-vacio", text: elegidos.length ? "Ningún cliente en los grupos elegidos." : "Todavía no elegiste grupos." })]));
        listas.forEach(function (x) {
            var excel = function (n) {
                var l = x.listas[n - 1], bajada = P.prefs.bajadas[P.fecha + "|" + x.sucursal + "|" + n];
                return el("span", { class: "pl-bajar" }, [el("button", { type: "button", class: "co-btn", disabled: !l.length, text: asignar ? "Excel " + n : "Descargar " + l.length, title: "Lista " + n + " de " + x.sucursal + " en Excel",
                    onclick: function (e) { descargarLista(x, n, e.currentTarget); } }), bajada && !asignar ? el("span", { class: "co-chip co-ok", text: "bajada " + bajada }) : null]);
            };
            var acciones = el("div", { class: "co-acciones" }, [
                asignar ? el("button", { type: "button", class: "co-btn co-btn-fuerte", text: "Asignar", disabled: !(elegidaPara(x.sucursal, 1) || elegidaPara(x.sucursal, 2)) || !x.todos.length, onclick: function (e) {
                    var b = e.currentTarget; b.disabled = true; b.textContent = "Asignando…";
                    asignarSucursal(x).then(function (h) { avisar(x.sucursal + ": " + (h.length ? "lista asignada a " + h.join(" y ") + "." : "elige las ATC.")); return P.ctx.recargar(); })
                        .catch(function (err) { avisar(x.sucursal + ": no se pudo asignar. " + ((err && err.message) || err), "bad"); b.disabled = false; b.textContent = "Asignar"; });
                } }) : null,
                asignar ? excel(1) : null, asignar ? excel(2) : null,
                el("button", { type: "button", class: "co-btn", text: P.viendo === x.sucursal ? "Ocultar" : "Ver", "aria-expanded": P.viendo === x.sucursal ? "true" : "false", onclick: function () { P.viendo = P.viendo === x.sucursal ? null : x.sucursal; pintar(); } })
            ]);
            var celdas = [el("td", { class: "pl-suc" }, [el("b", { text: x.sucursal })])].concat(
                elegidos.map(function (s) { return el("td", { class: "co-num", text: x.porSeg[s.id] ? miles(x.porSeg[s.id]) : "·" }); }),
                [el("td", { class: "co-num" }, [el("b", { text: miles(x.todos.length) })])]);
            if (asignar) celdas = celdas.concat([el("td", {}, [celdaAtc(x, 1)]), el("td", {}, [celdaAtc(x, 2)]), el("td", {}, [acciones]), el("td", {}, [celdaAvance(x)])]);
            else celdas = celdas.concat([el("td", {}, [excel(1)]), el("td", {}, [excel(2)]), el("td", {}, [acciones])]);
            tb.appendChild(el("tr", {}, celdas));
            if (P.viendo === x.sucursal) {
                var col = function (n) {
                    var l = x.listas[n - 1], quien = asignar ? elegidaPara(x.sucursal, n) : "";
                    return el("div", { class: "pl-prev-col" }, [el("h4", { text: "Lista " + n + (quien ? " · " + nombreAtc(quien) : "") + " · " + l.length + " clientes" }), el("ol", { class: "pl-prev" }, l.slice(0, 60).map(function (c) {
                        var url = linkWa(c);
                        return el("li", {}, [el("span", { class: "pl-prev-n", text: c.cliente }), el("span", { class: "pl-prev-g", text: SEG[c.seg].n + " · " + c.dato }),
                            url ? el("a", { class: "co-btn co-wa", href: url, target: "_blank", rel: "noopener", text: "WhatsApp" }) : null]);
                    })), l.length > 60 ? el("p", { class: "co-muted", text: "… y " + (l.length - 60) + " más." }) : null]);
                };
                tb.appendChild(el("tr", { class: "co-subfila" }, [el("td", { colspan: cols.length }, [el("div", { class: "pl-prev-grid" }, [col(1), col(2)])])]));
            }
        });
        partes.push(el("div", { class: "co-tablewrap pl-tabla" }, [el("table", { class: "co-table" }, [
            el("thead", {}, [el("tr", {}, cols.map(function (c, i) { return el("th", { scope: "col", class: i > 0 && i <= elegidos.length + 1 ? "co-num" : null, text: c, title: i > 0 && i <= elegidos.length ? SEG[elegidos[i - 1].id].titulo : null }); }))]), tb])]));
        return el("section", { class: "pl-bloque", "aria-labelledby": "pl-h-2" }, [
            el("h2", { class: "co-h2", id: "pl-h-2" }, [el("span", { class: "pl-paso", text: "2" }), asignar ? "Asigna las 2 listas de cada sucursal a sus ATC" : "Descarga las 2 listas de cada sucursal"]),
            el("p", { class: "co-muted", text: asignar
                ? "Elige qué ATC atiende cada lista y presiona Asignar. Cada ATC la ve en su pestaña «Mi lista», con botones para llamar, mandar el WhatsApp ya escrito y anotar cómo le fue. Los clientes se reparten alternando, así las dos listas son igual de buenas; un cliente aparece una sola vez, en su grupo más urgente."
                : "Cada sucursal tiene 2 listas, una para cada ATC. Los clientes se reparten alternando, así las dos reciben clientes igual de prioritarios. Un cliente aparece una sola vez, en su grupo más urgente. Las columnas con número son los grupos de arriba." })
        ].concat(partes));
    }

    function pintar() {
        var c = P.cont;
        if (!c) return;
        c.textContent = "";
        var asignar = !!P.ctx;
        c.appendChild(el("section", { class: "pl-intro" }, [
            el("div", {}, [el("h2", { class: "co-h2", text: "Tu plan de hoy" }), el("p", { class: "co-muted", text: "Clientes para recuperar y cuidar, con datos de hoy " + larga(P.fecha || hoy()) + ". El sistema propone los grupos y la promoción; tú eliges qué se trabaja y le das a cada ATC su lista." })]),
            el("ol", { class: "pl-pasos" }, [
                el("li", {}, [el("b", { text: "Elige los grupos" }), " que se trabajan hoy (vienen marcados los más urgentes)."]),
                el("li", {}, [el("b", { text: "Revisa la promoción y el mensaje" }), " de cada grupo: es el WhatsApp que les llega ya escrito a las ATC."]),
                el("li", {}, asignar ? [el("b", { text: "Asigna las 2 listas de cada sucursal" }), " a sus ATC. Ellas las ven en «Mi lista» y tú ves su avance aquí."]
                    : [el("b", { text: "Descarga 2 listas por sucursal" }), " y mándalas a sus 2 ATC."])
            ]),
            el("button", { type: "button", class: "co-btn", text: P.cargando ? "Actualizando…" : "Actualizar datos", disabled: P.cargando, onclick: cargar })
        ]));
        if (P.cargando || !P.cargado) { c.appendChild(el("div", { class: "co-card pl-cargando" }, [el("span", { class: "pl-spin", "aria-hidden": "true" }), el("p", { class: "pl-avance", role: "status", text: P.avance || "Cargando…" })])); return; }
        var faltan = Object.keys(P.errores);
        if (faltan.length) c.appendChild(el("div", { class: "co-aviso is-warn", role: "status" }, [el("strong", { text: "Algunos datos no se pudieron leer" }), el("p", { text: "Los grupos afectados dicen «no se pudo leer». Prueba «Actualizar datos» en un momento." })]));
        c.appendChild(emergencias());
        var grid = el("div", { class: "pl-segs" });
        SEGS.forEach(function (s) { grid.appendChild(tarjeta(s)); if (P.editando === s.id) grid.appendChild(formularioTextos(s)); });
        c.appendChild(el("section", { class: "pl-bloque", "aria-labelledby": "pl-h-1" }, [
            el("h2", { class: "co-h2", id: "pl-h-1" }, [el("span", { class: "pl-paso", text: "1" }), "Elige qué se trabaja hoy"]),
            el("p", { class: "co-muted", text: "Grupos ordenados de más a menos urgente. Marca los que quieres en las listas de hoy. Lo que elijas queda guardado en este navegador para mañana." }),
            grid
        ]));
        c.appendChild(bloqueListas());
    }

    window.ATC_plan = {
        /* ctx (opcional, solo con el rol de Jefa): { equipo, asignaciones, ultimas, llamar(tool, args), recargar(), irA(pestaña) } */
        montar: function (cont, ctx) {
            P.cont = cont; P.ctx = ctx || null;
            if (!P.cargado && !P.cargando) cargar(); else pintar();
        },
        /* para pruebas */
        _interno: { SEGS: SEGS, P: P, calcular: calcular, listasPorSucursal: listasPorSucursal, mensajePara: mensajePara, linkWa: linkWa, GRUPOS: function () { return GRUPOS; }, asignarSucursal: asignarSucursal }
    };
})();
