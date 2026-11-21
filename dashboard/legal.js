/* Tablero Legal del centro de mando: contratos, permisos y licencias, procesos y casos (con bitácora)
   y calendario de plazos. Datos: herramientas legal_* del MCP de Calistenia (servidor: componente "legal").
   Los documentos se guardan como enlaces (Google Drive u otro, siempre https://). */
(function () {
    "use strict";
    var L = window.LEG_logica;
    var raiz = document.getElementById("legal");
    if (!raiz || !window.CM || !L) return;
    var T = { listar: "legal_listar", guardar: "legal_guardar", eliminar: "legal_eliminar", sucursales: "legal_sucursales" };

    /* ---------- utilidades ---------- */
    var $ = function (s) { return raiz.querySelector(s); };
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
    var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
    var dinero = function (v, mon) { return v == null || v === "" ? "—" : (mon === "USD" ? "US$ " : "Bs ") + num(v).toLocaleString("es-BO", { maximumFractionDigits: 2 }); };
    var fecha = function (s) { if (!s) return "—"; var p = String(s).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(s); };
    var hoy = function () { return L.iso(new Date()); };
    var chip = function (tono, t) { return el("span", { class: "lg-chip lg-" + tono, text: t }); };
    function mensaje(n, tono, t) { n.textContent = t || ""; n.className = "lg-msg" + (tono ? " is-" + tono : ""); }
    function avisar(t, tono) { var m = $("#lg-aviso"); mensaje(m, tono || "ok", t); clearTimeout(avisar.t); avisar.t = setTimeout(function () { m.textContent = ""; }, 8000); }
    function kpis(lista) {
        return el("div", { class: "lg-kpis" }, lista.map(function (k) {
            return el("article", { class: "lg-kpi" + (k[3] ? " is-" + k[3] : "") }, [el("h3", { text: k[0] }), el("p", { class: "lg-kpi-v", text: k[1] }), k[2] ? el("p", { class: "lg-kpi-s", text: k[2] }) : null]);
        }));
    }
    function tabla(cols, filas, vacio, claseFila) {
        var tb = el("tbody");
        if (!filas.length) tb.appendChild(el("tr", {}, [el("td", { colspan: cols.length, class: "lg-vacio", text: vacio })]));
        filas.forEach(function (f) {
            var tr = el("tr", { class: claseFila ? claseFila(f) : null });
            cols.forEach(function (c) { var v = c.v(f, tr); var td = el("td", { class: c.num ? "lg-num" : null }); if (v instanceof Node) td.appendChild(v); else td.textContent = v == null || v === "" ? "—" : String(v); tr.appendChild(td); });
            tb.appendChild(tr);
        });
        return el("div", { class: "lg-tablewrap" }, [el("table", { class: "lg-table" }, [el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { scope: "col", class: c.num ? "lg-num" : null, text: c.t }); }))]), tb])]);
    }
    function doc(url) { return url ? el("a", { class: "lg-doc", href: url, target: "_blank", rel: "noopener noreferrer", text: "Abrir documento" }) : null; }
    function textoError(e) { return e && e.sinSesion ? "Tu sesión de datos venció: vuelve a ingresar." : (e && e.message) || String(e); }
    function llamar(tool, args) {
        return window.CM.llamar(tool, args || {}).then(function (r) {
            if (r && r.estado === "error") throw new Error(r.error || "error del servidor");
            if (r && typeof r.error === "string") throw new Error(r.error);
            return r;
        }).catch(function (e) {
            if (e && e.sinSesion) { var av = document.getElementById("cm-sesion"); if (av) av.hidden = false; }
            if (/unknown tool|tool not found|not found|desconocid|no encontrad|-32601/i.test(String(e && e.message))) e.noDisponible = true;
            throw e;
        });
    }
    function filas(r) { if (Array.isArray(r)) return r; if (r && Array.isArray(r.filas)) return r.filas; if (r && Array.isArray(r.data)) return r.data; return []; }

    /* ---------- fichas de formulario (mismas reglas que el servidor) ---------- */
    var op = function (mapa) { return Object.keys(mapa).map(function (k) { return [k, mapa[k]]; }); };
    var FICHAS = {
        contrato: [
            ["titulo", "Título", "texto", { req: 1, max: 200, ancho: 1, ph: "Ej.: Alquiler local sucursal Berea" }], ["tipo", "Tipo", "opcion", { req: 1, ops: op(L.TIPOS.contrato) }],
            ["contraparte", "Contraparte", "texto", { req: 1, max: 200 }], ["documento_identidad", "NIT / CI", "texto", { max: 40 }], ["sucursal", "Sucursal", "sucursal"],
            ["monto", "Monto", "numero"], ["moneda", "Moneda", "opcion", { ops: [["BOB", "Bolivianos"], ["USD", "Dólares"]] }], ["periodicidad", "Periodicidad", "opcion", { ops: [["", "—"], ["mensual", "Mensual"], ["anual", "Anual"], ["unico", "Pago único"]] }],
            ["fecha_inicio", "Inicio", "fecha"], ["fecha_fin", "Fin (vacío = indefinido)", "fecha"], ["aviso_dias", "Avisar días antes", "entero", { def: 30 }],
            ["renovacion_automatica", "Se renueva automáticamente", "bool"], ["situacion", "Situación", "opcion", { ops: op(L.SITUACION_CONTRATO) }],
            ["responsable", "Responsable", "texto", { max: 120 }], ["documento_url", "Enlace al documento (Drive)", "url", { ancho: 1 }], ["observacion", "Observaciones", "area", { max: 4000, ancho: 1 }]
        ],
        permiso: [
            ["nombre", "Nombre", "texto", { req: 1, max: 200, ancho: 1, ph: "Ej.: Licencia de funcionamiento Berea" }], ["tipo", "Tipo", "opcion", { req: 1, ops: op(L.TIPOS.permiso) }],
            ["sucursal", "Sucursal", "sucursal"], ["entidad", "Entidad que lo emite", "texto", { max: 200, ph: "GAMSCZ, SEPREC, SIN, aseguradora…" }], ["numero", "Número", "texto", { max: 80 }],
            ["fecha_emision", "Emisión", "fecha"], ["fecha_vencimiento", "Vencimiento (vacío = no vence)", "fecha"], ["aviso_dias", "Avisar días antes", "entero", { def: 30 }],
            ["en_tramite", "En trámite", "bool"], ["costo", "Costo (Bs)", "numero"], ["responsable", "Responsable", "texto", { max: 120 }],
            ["documento_url", "Enlace al documento (Drive)", "url", { ancho: 1 }], ["observacion", "Observaciones", "area", { max: 4000, ancho: 1 }]
        ],
        caso: [
            ["titulo", "Título", "texto", { req: 1, max: 200, ancho: 1, ph: "Ej.: Demanda laboral de ex entrenador" }], ["tipo", "Tipo", "opcion", { req: 1, ops: op(L.TIPOS.caso) }],
            ["situacion", "Situación", "opcion", { ops: op(L.SITUACION_CASO) }], ["prioridad", "Prioridad", "opcion", { ops: [["normal", "Normal"], ["alta", "Alta"], ["baja", "Baja"]] }],
            ["contraparte", "Contraparte", "texto", { max: 200 }], ["rol", "Calistenia es", "opcion", { ops: [["", "—"], ["demandado", "Demandada"], ["demandante", "Demandante"], ["otro", "Otro"]] }],
            ["entidad", "Juzgado / entidad", "texto", { max: 200 }], ["expediente", "N.º de expediente", "texto", { max: 80 }], ["abogado", "Abogado", "texto", { max: 120 }], ["sucursal", "Sucursal", "sucursal"],
            ["monto_en_juego", "Monto en juego (Bs)", "numero"], ["fecha_apertura", "Apertura", "fecha"], ["fecha_cierre", "Cierre", "fecha"],
            ["proxima_fecha", "Próxima actuación (fecha)", "fecha"], ["proxima_actuacion", "Próxima actuación", "texto", { max: 300, ph: "Ej.: Audiencia de conciliación" }],
            ["documento_url", "Enlace a la carpeta del caso", "url", { ancho: 1 }], ["descripcion", "Descripción", "area", { max: 8000, ancho: 1 }]
        ],
        evento: [
            ["fecha", "Fecha", "fecha", { req: 1 }], ["tipo", "Tipo", "opcion", { req: 1, ops: op(L.TIPOS.evento) }], ["costo", "Costo (Bs)", "numero"],
            ["descripcion", "Descripción", "texto", { req: 1, max: 4000, ancho: 1 }], ["documento_url", "Enlace al documento", "url", { ancho: 1 }]
        ],
        plazo: [
            ["titulo", "Qué hay que hacer", "texto", { req: 1, max: 200, ancho: 1 }], ["fecha", "Fecha límite", "fecha", { req: 1 }], ["tipo", "Tipo", "opcion", { ops: op(L.TIPOS.plazo) }],
            ["sucursal", "Sucursal", "sucursal"], ["responsable", "Responsable", "texto", { max: 120 }], ["aviso_dias", "Avisar días antes", "entero", { def: 7 }],
            ["observacion", "Observaciones", "area", { max: 4000, ancho: 1 }]
        ]
    };
    var NOMBRE = { contrato: "contrato", permiso: "permiso o licencia", caso: "caso", evento: "movimiento", plazo: "plazo" };

    /* Formulario genérico: crea o edita un registro de la entidad. */
    function formulario(entidad, registro, extra, alGuardar, alCancelar) {
        var r = registro || {}, inputs = {}, msg = el("p", { class: "lg-msg", role: "status" });
        var campos = FICHAS[entidad].map(function (c) {
            var nombre = c[0], tipo = c[2], o = c[3] || {}, valor = r[nombre], inp;
            if (tipo === "opcion") inp = el("select", { class: "dash-select" }, o.ops.map(function (x) { return el("option", { value: x[0], text: x[1], selected: String(valor == null ? (o.ops[0][0]) : valor) === x[0] }); }));
            else if (tipo === "sucursal") inp = el("select", { class: "dash-select" }, [["", "Toda la empresa"]].concat(S.sucursales.map(function (s) { return [s, s]; })).concat(valor && S.sucursales.indexOf(valor) < 0 ? [[valor, valor]] : []).map(function (x) { return el("option", { value: x[0], text: x[1], selected: (valor || "") === x[0] }); }));
            else if (tipo === "bool") inp = el("input", { type: "checkbox", checked: !!valor });
            else if (tipo === "area") { inp = el("textarea", { rows: "3", maxlength: String(o.max) }); inp.value = valor || ""; }
            else inp = el("input", {
                type: tipo === "fecha" ? "date" : tipo === "numero" ? "number" : tipo === "entero" ? "number" : tipo === "url" ? "url" : "text",
                step: tipo === "numero" ? "0.01" : tipo === "entero" ? "1" : null, min: tipo === "numero" || tipo === "entero" ? "0" : null,
                maxlength: o.max ? String(o.max) : null, placeholder: tipo === "url" ? "https://drive.google.com/…" : o.ph || null,
                value: valor != null ? (tipo === "fecha" ? String(valor).slice(0, 10) : String(valor)) : (o.def != null && !registro ? String(o.def) : "")
            });
            inputs[nombre] = { inp: inp, tipo: tipo, o: o, etiqueta: c[1] };
            return tipo === "bool" ? el("label", { class: "lg-check" + (o.ancho ? " lg-ancho" : "") }, [inp, c[1]])
                : el("label", { class: o.ancho ? "lg-ancho" : null }, [c[1] + (o.req ? " *" : ""), inp]);
        });
        var btn = el("button", { type: "submit", class: "lg-primario", text: registro ? "Guardar cambios" : "Guardar" });
        var f = el("form", { class: "lg-card lg-form", novalidate: true }, [el("h3", { class: "lg-h3", text: (registro ? "Editar " : "Nuevo ") + NOMBRE[entidad] })].concat(campos).concat([
            el("div", { class: "lg-acciones lg-ancho" }, [btn, el("button", { type: "button", class: "lg-btn", text: "Cancelar", onclick: alCancelar }), msg])]));
        f.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var data = Object.assign({}, extra || {});
            if (registro) data.key = registro.key;
            for (var k in inputs) {
                var x = inputs[k], v;
                if (x.tipo === "bool") v = x.inp.checked;
                else v = x.inp.value.trim();
                if (x.o.req && (v === "" || v == null)) { mensaje(msg, "bad", "Completa «" + x.etiqueta + "»."); x.inp.focus(); return; }
                if (x.tipo === "url" && v && !/^https:\/\/\S+$/.test(v)) { mensaje(msg, "bad", "El enlace debe empezar con https:// (copia el enlace de Google Drive)."); x.inp.focus(); return; }
                if ((x.tipo === "numero" || x.tipo === "entero") && v !== "" && !(Number(v) >= 0)) { mensaje(msg, "bad", "«" + x.etiqueta + "» debe ser un número positivo."); x.inp.focus(); return; }
                data[k] = x.tipo === "bool" ? v : v === "" ? null : v;
            }
            var pares = [["fecha_inicio", "fecha_fin"], ["fecha_emision", "fecha_vencimiento"], ["fecha_apertura", "fecha_cierre"]];
            for (var i = 0; i < pares.length; i++) if (data[pares[i][0]] && data[pares[i][1]] && data[pares[i][1]] < data[pares[i][0]]) { mensaje(msg, "bad", "La fecha final no puede ser anterior a la inicial."); return; }
            btn.disabled = true; mensaje(msg, "", "Guardando…");
            llamar(T.guardar, { entidad: entidad, data: data }).then(function () { avisar((registro ? "Cambios guardados" : "Registro creado") + "."); alGuardar(); })
                .catch(function (e) { btn.disabled = false; mensaje(msg, "bad", "No se guardó: " + textoError(e)); });
        });
        setTimeout(function () { var p = f.querySelector("input, select, textarea"); if (p) p.focus(); }, 0);
        return f;
    }
    function eliminar(entidad, r, titulo) {
        if (!confirm("¿Eliminar " + NOMBRE[entidad] + " «" + titulo + "»?" + (entidad === "caso" ? " También se ocultará su bitácora." : ""))) return;
        llamar(T.eliminar, { entidad: entidad, key: r.key }).then(function () { avisar("Eliminado."); cargar(); }).catch(function (e) { avisar("No se pudo eliminar: " + textoError(e), "bad"); });
    }
    function abrirForm(contenedor, entidad, registro, extra) {
        contenedor.textContent = "";
        contenedor.appendChild(formulario(entidad, registro, extra, function () { contenedor.textContent = ""; cargar(); }, function () { contenedor.textContent = ""; }));
        contenedor.scrollIntoView({ block: "nearest" });
    }

    /* ---------- estado y carga ---------- */
    var S = { tab: null, contratos: [], permisos: [], casos: [], eventos: [], plazos: [], sucursales: [], pendiente: false, buscar: "", filtro: "" };
    function cargar() {
        mensaje($("#lg-estado"), "", "Cargando…");
        var ents = [["contratos", "contrato"], ["permisos", "permiso"], ["casos", "caso"], ["eventos", "evento"], ["plazos", "plazo"]];
        return Promise.all(ents.map(function (e) { return llamar(T.listar, { entidad: e[1] }).then(function (r) { S[e[0]] = filas(r); }); })
            .concat([S.sucursales.length ? null : llamar(T.sucursales).then(function (r) { S.sucursales = filas(r).map(function (s) { return String(typeof s === "string" ? s : s.descripcion || "").trim(); }).filter(Boolean); })]))
            .then(function () { S.pendiente = false; mensaje($("#lg-estado"), "", "Actualizado a las " + new Date().toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })); pintar(); })
            .catch(function (e) {
                if (e.noDisponible) { S.pendiente = true; mensaje($("#lg-estado"), "warn", "El módulo legal está listo, pero el MCP de Calistenia todavía no tiene sus herramientas (legal_*). Cuando se activen, aquí se cargan contratos, permisos, casos y plazos."); }
                else mensaje($("#lg-estado"), "bad", "No se pudo cargar: " + textoError(e));
                pintar();
            });
    }

    /* ---------- vistas ---------- */
    var TABS = [["resumen", "Resumen"], ["calendario", "Calendario de plazos"], ["contratos", "Contratos"], ["permisos", "Permisos y licencias"], ["casos", "Procesos y casos"]];
    window.addEventListener("popstate", function () { var h = location.hash.slice(1); var t = TABS.some(function (x) { return x[0] === h; }) ? h : "resumen"; if (t !== S.tab) { S.tab = t; S.buscar = ""; S.filtro = ""; pintar(); } });
    function pintar() {
        if (!S.tab) { var h = location.hash.slice(1); S.tab = TABS.some(function (t) { return t[0] === h; }) ? h : "resumen"; }
        var nav = $("#lg-tabs"); nav.textContent = "";
        TABS.forEach(function (t) {
            nav.appendChild(el("button", { type: "button", role: "tab", class: "lg-tab" + (S.tab === t[0] ? " is-on" : ""), "aria-selected": S.tab === t[0] ? "true" : "false", text: t[1],
                onclick: function () { if (S.tab !== t[0]) { try { history.pushState(null, "", "#" + t[0]); } catch (e) {} } S.tab = t[0]; S.buscar = ""; S.filtro = ""; pintar(); } }));
        });
        var c = $("#lg-contenido"); c.textContent = "";
        if (S.pendiente) { c.appendChild(el("div", { class: "lg-aviso is-warn" }, [el("strong", { text: "Pendiente de activación" }), el("p", { text: "Falta que Capital Corp agregue las herramientas legal_listar, legal_guardar, legal_eliminar y legal_sucursales al MCP, e instalar el servidor. Los pasos están en docs/modulo-legal.md del repositorio server." })])); return; }
        VISTAS[S.tab](c);
    }
    function buscador(placeholder, filtros, alCambiar) {
        var hijos = [el("label", { class: "lg-buscar" }, ["Buscar", el("input", { type: "search", value: S.buscar, placeholder: placeholder, oninput: function (e) { S.buscar = e.target.value; alCambiar(); } })])];
        if (filtros) hijos.push(el("label", {}, ["Mostrar", el("select", { class: "dash-select", onchange: function (e) { S.filtro = e.target.value; alCambiar(); } }, filtros.map(function (x) { return el("option", { value: x[0], text: x[1], selected: S.filtro === x[0] }); }))]));
        return el("div", { class: "lg-filtros" }, hijos);
    }
    function coincide(r, campos) {
        var q = S.buscar.trim().toLowerCase(); if (!q) return true;
        return campos.some(function (k) { return String(r[k] || "").toLowerCase().indexOf(q) >= 0; });
    }
    function iconoTipo(t) { return { contrato: "Contrato", permiso: "Permiso", caso: "Caso", audiencia: "Audiencia", plazo: "Plazo" }[t] || t; }

    var VISTAS = {
        resumen: function (c) {
            var h = hoy();
            var ec = S.contratos.map(function (x) { return L.estadoContrato(x, h); }), ep = S.permisos.map(function (x) { return L.estadoPermiso(x, h); });
            var activos = S.casos.filter(L.casoActivo), cal = L.calendario(S, h, 60);
            var enJuego = activos.reduce(function (a, k) { return a + num(k.monto_en_juego); }, 0);
            var gastos = S.eventos.filter(function (e) { return activos.some(function (k) { return k.key === e.key_caso; }); }).reduce(function (a, e) { return a + num(e.costo); }, 0);
            var cuenta = function (lista, clave) { return lista.filter(function (e) { return e.clave === clave; }).length; };
            var atrasados = cal.filter(function (i) { return i.grupo === "atrasado"; }).length;
            c.appendChild(kpis([
                ["Atrasados", String(atrasados), "Vencimientos y actuaciones con fecha pasada", atrasados ? "bad" : "ok"],
                ["Contratos", String(S.contratos.length), cuenta(ec, "por_vencer") + " por vencer · " + cuenta(ec, "vencido") + " vencidos", cuenta(ec, "vencido") ? "bad" : cuenta(ec, "por_vencer") ? "warn" : null],
                ["Permisos y licencias", String(S.permisos.length), cuenta(ep, "por_vencer") + " por vencer · " + cuenta(ep, "vencido") + " vencidos · " + cuenta(ep, "tramite") + " en trámite", cuenta(ep, "vencido") ? "bad" : cuenta(ep, "por_vencer") ? "warn" : null],
                ["Casos abiertos", String(activos.length), activos.filter(function (k) { return k.prioridad === "alta"; }).length + " de prioridad alta"],
                ["Monto en juego", dinero(enJuego), "Gastos registrados: " + dinero(gastos)]
            ]));
            var alertas = cal.filter(function (i) { return i.alerta; });
            c.appendChild(el("div", { class: "lg-card" }, [el("h3", { class: "lg-h3", text: "Requiere atención" }),
                alertas.length ? listaCalendario(alertas.slice(0, 25)) : el("p", { class: "lg-muted", text: "Nada atrasado ni por vencer dentro de sus plazos de aviso." })]));
            var m = L.matrizPermisos(S.permisos, S.sucursales, h);
            var porSucursal = {}; S.permisos.forEach(function (x) { if (String(x.sucursal || "").trim()) porSucursal[x.tipo] = true; }); /* tipos que se sacan por sucursal */
            if (m.tipos.length) c.appendChild(el("div", { class: "lg-card" }, [el("h3", { class: "lg-h3", text: "Permisos por sucursal" }), tabla(
                [{ t: "Sucursal", v: function (f) { return f.sucursal; } }].concat(m.tipos.map(function (t) { return { t: L.TIPOS.permiso[t] || t, v: function (f) { var e = f.estados[t]; return e ? chip(e.tono, e.texto) : f.sucursal === "Toda la empresa" || !porSucursal[t] ? "—" : chip("bad", "Falta"); } }; })),
                m.filas, "Sin permisos cargados.")]));
        },
        calendario: function (c) {
            var cal = L.calendario(S, hoy(), 365);
            c.appendChild(el("div", { class: "lg-fila" }, [el("p", { class: "lg-muted", text: "Vencimientos de contratos y permisos, próximas actuaciones y audiencias de los casos, y los plazos que cargues aquí. Se marca en rojo lo atrasado y en amarillo lo que entra en su plazo de aviso." }),
                el("button", { type: "button", class: "lg-primario", text: "Nuevo plazo", onclick: function () { abrirForm($("#lg-form-plazo"), "plazo"); } })]));
            c.appendChild(el("div", { id: "lg-form-plazo" }));
            var grupos = [["atrasado", "Atrasado"], ["semana", "Próximos 7 días"], ["mes", "Próximos 30 días"], ["despues", "Más adelante"]];
            grupos.forEach(function (g) {
                var items = cal.filter(function (i) { return i.grupo === g[0]; });
                if (!items.length && g[0] !== "semana") return;
                c.appendChild(el("div", { class: "lg-card" }, [el("h3", { class: "lg-h3", text: g[1] + " (" + items.length + ")" }), items.length ? listaCalendario(items) : el("p", { class: "lg-muted", text: "Nada para esta semana." })]));
            });
            var hechos = S.plazos.filter(function (p) { return p.hecho; }).slice(0, 30);
            if (hechos.length) c.appendChild(el("details", { class: "lg-card" }, [el("summary", { class: "lg-h3", text: "Plazos cumplidos (" + hechos.length + ")" }),
                el("ul", { class: "lg-cal" }, hechos.map(function (p) { return el("li", { class: "lg-cal-item is-hecho" }, [el("span", { class: "lg-cal-fecha", text: fecha(p.fecha) }), el("div", {}, [el("b", { text: p.titulo }), el("div", { class: "lg-muted", text: "Hecho " + fecha(p.fecha_hecho) })]),
                    el("button", { type: "button", class: "lg-btn", text: "Reabrir", onclick: function () { marcarPlazo(p, false); } })]); }))]));
        },
        contratos: function (c) {
            var filtros = [["", "Todos"], ["alerta", "Vencidos o por vencer"], ["vigente", "Vigentes"], ["terminado", "Rescindidos o finalizados"]].concat(op(L.TIPOS.contrato).map(function (x) { return ["tipo:" + x[0], "Tipo: " + x[1]]; }));
            var lista = el("div"), form = el("div", { id: "lg-form-contrato" });
            c.appendChild(el("div", { class: "lg-fila" }, [buscador("Título, contraparte, sucursal…", filtros, pintarLista), el("button", { type: "button", class: "lg-primario", text: "Nuevo contrato", onclick: function () { abrirForm(form, "contrato"); } })]));
            c.appendChild(form); c.appendChild(lista);
            function pintarLista() {
                var h = hoy();
                var l = S.contratos.map(function (x) { return Object.assign({}, x, { _e: L.estadoContrato(x, h) }); }).filter(function (x) {
                    if (!coincide(x, ["titulo", "contraparte", "sucursal", "documento_identidad", "responsable"])) return false;
                    if (S.filtro === "alerta") return x._e.clave === "vencido" || x._e.clave === "por_vencer";
                    if (S.filtro === "vigente") return x._e.tono === "ok";
                    if (S.filtro === "terminado") return x._e.clave === "terminado";
                    if (S.filtro.indexOf("tipo:") === 0) return x.tipo === S.filtro.slice(5);
                    return true;
                });
                lista.textContent = "";
                var mensual = l.filter(function (x) { return x._e.clave !== "terminado" && x.periodicidad === "mensual" && x.moneda !== "USD"; }).reduce(function (a, x) { return a + num(x.monto); }, 0);
                lista.appendChild(el("p", { class: "lg-muted", text: l.length + " contratos · compromiso mensual (Bs, vigentes): " + dinero(mensual) }));
                lista.appendChild(el("div", { class: "lg-card" }, [tabla([
                    { t: "Contrato", v: function (x) { return el("div", {}, [el("b", { text: x.titulo }), el("div", { class: "lg-muted", text: (L.TIPOS.contrato[x.tipo] || x.tipo) + (x.sucursal ? " · " + x.sucursal : "") })]); } },
                    { t: "Contraparte", v: function (x) { return el("div", {}, [x.contraparte, x.documento_identidad ? el("div", { class: "lg-muted", text: "NIT/CI " + x.documento_identidad }) : null]); } },
                    { t: "Monto", num: 1, v: function (x) { return el("div", {}, [dinero(x.monto, x.moneda), x.periodicidad ? el("div", { class: "lg-muted", text: { mensual: "mensual", anual: "anual", unico: "único" }[x.periodicidad] }) : null]); } },
                    { t: "Vigencia", v: function (x) { return fecha(x.fecha_inicio) + " – " + (x.fecha_fin ? fecha(x.fecha_fin) : "indefinido"); } },
                    { t: "Estado", v: function (x) { return chip(x._e.tono, x._e.texto); } },
                    { t: "", v: function (x) { return el("div", { class: "lg-acciones" }, [doc(x.documento_url), el("button", { type: "button", class: "lg-btn", text: "Editar", onclick: function () { abrirForm(form, "contrato", x); } }), el("button", { type: "button", class: "lg-btn", text: "Eliminar", onclick: function () { eliminar("contrato", x, x.titulo); } })]); } }
                ], l, S.buscar || S.filtro ? "Nada coincide con el filtro." : "Todavía no hay contratos cargados.", function (x) { return x._e.tono === "bad" ? "is-mal" : null; })]));
            }
            pintarLista();
        },
        permisos: function (c) {
            var filtros = [["", "Todos"], ["alerta", "Vencidos o por vencer"], ["tramite", "En trámite"]].concat(S.sucursales.map(function (s) { return ["suc:" + s, "Sucursal: " + s]; }));
            var lista = el("div"), form = el("div", { id: "lg-form-permiso" });
            c.appendChild(el("div", { class: "lg-fila" }, [buscador("Nombre, entidad, número, sucursal…", filtros, pintarLista), el("button", { type: "button", class: "lg-primario", text: "Nuevo permiso o licencia", onclick: function () { abrirForm(form, "permiso"); } })]));
            c.appendChild(form); c.appendChild(lista);
            function pintarLista() {
                var h = hoy();
                var l = S.permisos.map(function (x) { return Object.assign({}, x, { _e: L.estadoPermiso(x, h) }); }).filter(function (x) {
                    if (!coincide(x, ["nombre", "entidad", "numero", "sucursal", "responsable"])) return false;
                    if (S.filtro === "alerta") return x._e.clave === "vencido" || x._e.clave === "por_vencer";
                    if (S.filtro === "tramite") return x._e.clave === "tramite";
                    if (S.filtro.indexOf("suc:") === 0) return (x.sucursal || "") === S.filtro.slice(4);
                    return true;
                });
                lista.textContent = "";
                lista.appendChild(el("div", { class: "lg-card" }, [tabla([
                    { t: "Permiso", v: function (x) { return el("div", {}, [el("b", { text: x.nombre }), el("div", { class: "lg-muted", text: L.TIPOS.permiso[x.tipo] || x.tipo })]); } },
                    { t: "Sucursal", v: function (x) { return x.sucursal || "Toda la empresa"; } },
                    { t: "Entidad / número", v: function (x) { return [x.entidad, x.numero ? "N.º " + x.numero : ""].filter(Boolean).join(" · "); } },
                    { t: "Vence", v: function (x) { return x.fecha_vencimiento ? fecha(x.fecha_vencimiento) : "No vence"; } },
                    { t: "Costo", num: 1, v: function (x) { return dinero(x.costo); } },
                    { t: "Estado", v: function (x) { return chip(x._e.tono, x._e.texto); } },
                    { t: "", v: function (x) { return el("div", { class: "lg-acciones" }, [doc(x.documento_url), el("button", { type: "button", class: "lg-btn", text: "Editar", onclick: function () { abrirForm(form, "permiso", x); } }), el("button", { type: "button", class: "lg-btn", text: "Eliminar", onclick: function () { eliminar("permiso", x, x.nombre); } })]); } }
                ], l, S.buscar || S.filtro ? "Nada coincide con el filtro." : "Todavía no hay permisos cargados.", function (x) { return x._e.tono === "bad" ? "is-mal" : null; })]));
            }
            pintarLista();
        },
        casos: function (c) {
            var filtros = [["", "Abiertos"], ["todos", "Todos"], ["cerrados", "Cerrados"], ["alta", "Prioridad alta"]].concat(op(L.TIPOS.caso).map(function (x) { return ["tipo:" + x[0], "Tipo: " + x[1]]; }));
            var lista = el("div"), form = el("div", { id: "lg-form-caso" });
            c.appendChild(el("div", { class: "lg-fila" }, [buscador("Título, contraparte, expediente, abogado…", filtros, pintarLista), el("button", { type: "button", class: "lg-primario", text: "Nuevo caso", onclick: function () { abrirForm(form, "caso"); } })]));
            c.appendChild(form); c.appendChild(lista);
            function pintarLista() {
                var h = hoy();
                var l = S.casos.map(function (x) { return Object.assign({}, x, { _e: L.estadoCaso(x, h) }); }).filter(function (x) {
                    if (!coincide(x, ["titulo", "contraparte", "expediente", "abogado", "entidad", "sucursal"])) return false;
                    var act = L.casoActivo(x);
                    if (S.filtro === "") return act;
                    if (S.filtro === "cerrados") return !act;
                    if (S.filtro === "alta") return act && x.prioridad === "alta";
                    if (S.filtro.indexOf("tipo:") === 0) return x.tipo === S.filtro.slice(5);
                    return true;
                });
                lista.textContent = "";
                var cols = [
                    { t: "Caso", v: function (x) { return el("div", {}, [el("b", { text: x.titulo }), el("div", { class: "lg-muted", text: (L.TIPOS.caso[x.tipo] || x.tipo) + (x.rol ? " · Calistenia " + (x.rol === "demandado" ? "demandada" : x.rol) : "") + (x.prioridad === "alta" ? " · prioridad alta" : "") })]); } },
                    { t: "Contraparte", v: function (x) { return x.contraparte; } },
                    { t: "Juzgado / expediente", v: function (x) { return [x.entidad, x.expediente ? "Exp. " + x.expediente : ""].filter(Boolean).join(" · "); } },
                    { t: "Abogado", v: function (x) { return x.abogado; } },
                    { t: "Monto", num: 1, v: function (x) { return dinero(x.monto_en_juego); } },
                    { t: "Próxima actuación", v: function (x) { return x.proxima_fecha ? el("div", {}, [fecha(x.proxima_fecha), el("div", { class: "lg-muted", text: x.proxima_actuacion || "" })]) : "—"; } },
                    { t: "Estado", v: function (x) { return chip(x._e.tono, x._e.texto); } }
                ];
                cols.push({ t: "", v: function (x, tr) {
                    var n = S.eventos.filter(function (e) { return e.key_caso === x.key; }).length;
                    return el("div", { class: "lg-acciones" }, [doc(x.documento_url),
                        el("button", { type: "button", class: "lg-btn lg-btn-fuerte", text: "Bitácora (" + n + ")", onclick: function () { bitacora(x, tr, cols.length); } }),
                        el("button", { type: "button", class: "lg-btn", text: "Editar", onclick: function () { abrirForm(form, "caso", x); } }),
                        el("button", { type: "button", class: "lg-btn", text: "Eliminar", onclick: function () { eliminar("caso", x, x.titulo); } })]);
                } });
                lista.appendChild(el("div", { class: "lg-card" }, [tabla(cols, l, S.buscar || S.filtro ? "Nada coincide con el filtro." : "No hay casos abiertos.", function (x) { return x._e.tono === "bad" ? "is-mal" : null; })]));
            }
            pintarLista();
        }
    };

    function bitacora(k, tr, columnas) {
        var sig = tr.nextSibling;
        if (sig && sig.classList && sig.classList.contains("lg-subfila")) { sig.remove(); return; }
        var ev = S.eventos.filter(function (e) { return e.key_caso === k.key; }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
        var total = ev.reduce(function (a, e) { return a + num(e.costo); }, 0);
        var formCont = el("div");
        var caja = el("div", { class: "lg-bitacora" }, [
            el("div", { class: "lg-fila" }, [el("b", { text: "Bitácora de «" + k.titulo + "»" }), el("span", { class: "lg-muted", text: ev.length + " movimientos · gastos " + dinero(total) }),
                el("button", { type: "button", class: "lg-primario", text: "Agregar movimiento", onclick: function () { abrirForm(formCont, "evento", null, { key_caso: k.key }); } })]),
            k.descripcion ? el("p", { class: "lg-desc", text: k.descripcion }) : null,
            formCont,
            ev.length ? el("ul", { class: "lg-cal" }, ev.map(function (e) {
                return el("li", { class: "lg-cal-item" }, [el("span", { class: "lg-cal-fecha", text: fecha(e.fecha) }),
                    el("div", {}, [chip(e.tipo === "audiencia" ? "warn" : e.tipo === "pago" ? "muted" : "ok", L.TIPOS.evento[e.tipo] || e.tipo), " ", e.descripcion, e.costo ? el("div", { class: "lg-muted", text: "Costo " + dinero(e.costo) }) : null]),
                    el("div", { class: "lg-acciones" }, [doc(e.documento_url), el("button", { type: "button", class: "lg-btn", text: "Eliminar", onclick: function () { eliminar("evento", e, (L.TIPOS.evento[e.tipo] || e.tipo) + " del " + fecha(e.fecha)); } })])]);
            })) : el("p", { class: "lg-muted", text: "Sin movimientos todavía." })
        ]);
        tr.parentNode.insertBefore(el("tr", { class: "lg-subfila" }, [el("td", { colspan: columnas }, [caja])]), tr.nextSibling);
    }

    function marcarPlazo(p, hecho) {
        llamar(T.guardar, { entidad: "plazo", data: { key: p.key, hecho: hecho } }).then(function () { avisar(hecho ? "Plazo marcado como cumplido." : "Plazo reabierto."); cargar(); })
            .catch(function (e) { avisar("No se pudo actualizar: " + textoError(e), "bad"); });
    }
    function listaCalendario(items) {
        return el("ul", { class: "lg-cal" }, items.map(function (i) {
            var tono = i.faltan < 0 ? "bad" : i.alerta ? "warn" : "muted";
            var cuando = i.faltan === 0 ? "Hoy" : i.faltan < 0 ? "Hace " + (-i.faltan) + (i.faltan === -1 ? " día" : " días") : "En " + i.faltan + (i.faltan === 1 ? " día" : " días");
            return el("li", { class: "lg-cal-item is-" + tono }, [
                el("span", { class: "lg-cal-fecha", text: fecha(i.fecha) }),
                el("div", {}, [chip(tono, iconoTipo(i.tipo)), " ", el("b", { text: i.titulo }), el("div", { class: "lg-muted", text: cuando + (i.detalle ? " · " + i.detalle : "") })]),
                i.plazo ? el("div", { class: "lg-acciones" }, [el("button", { type: "button", class: "lg-btn lg-btn-fuerte", text: "Cumplido", onclick: function () { marcarPlazo(i.plazo, true); } }),
                    el("button", { type: "button", class: "lg-btn", text: "Eliminar", onclick: function () { eliminar("plazo", i.plazo, i.plazo.titulo); } })])
                    : el("button", { type: "button", class: "lg-btn", text: "Ver", onclick: function () { S.tab = i.tipo === "contrato" ? "contratos" : i.tipo === "permiso" ? "permisos" : "casos"; S.buscar = i.ref.titulo || i.ref.nombre || ""; S.filtro = i.tipo === "caso" || i.tipo === "audiencia" ? "todos" : ""; pintar(); } })
            ]);
        }));
    }

    $("#lg-actualizar").addEventListener("click", cargar);
    cargar();
    setInterval(function () { if (!document.hidden && !raiz.querySelector(".lg-form")) cargar(); }, 10 * 60000);
})();
