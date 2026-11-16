/* Sistema comercial del centro de mando.
   - Perfil "comercial" (Atención al Cliente, master): equipo de ejecutivas, reparto por sucursal,
     reasignación de clientes, tareas, guiones, comisiones y actividad.
   - Perfil "ventas" (ejecutiva): su CRM con los clientes antiguos asignados, agenda del día,
     registro de gestiones y seguimientos, tareas, guiones y comisiones.
   Datos: MCP de Calistenia. Clientes antiguos = clientes_vencidos (ya existe); el resto, herramientas
   comercial_* nuevas (servidor: componente "comercial"). Sin ellas, la página lo avisa. */
(function () {
    "use strict";
    var L = window.COM_logica;
    var raiz = document.getElementById("comercial");
    if (!raiz || !window.CM || !L) return;

    var T = {
        vencidos: "clientes_vencidos",
        equipo: "comercial_equipo", sucursales: "comercial_sucursales", asignaciones: "comercial_asignaciones",
        ultimas: "comercial_ultimas_gestiones", gestiones: "comercial_gestiones", tareas: "comercial_tareas",
        guiones: "comercial_guiones", comisiones: "comercial_comisiones", resumen: "comercial_resumen",
        ejecutivaGuardar: "comercial_ejecutiva_guardar", asignar: "comercial_asignar", buscarUsuario: "comercial_buscar_usuario",
        tareaGuardar: "comercial_tarea_guardar", tareaEliminar: "comercial_tarea_eliminar",
        guionGuardar: "comercial_guion_guardar", guionEliminar: "comercial_guion_eliminar",
        comisionAnular: "comercial_comision_anular", comisionRestaurar: "comercial_comision_restaurar",
        miTrabajo: "comercial_mi_trabajo", gestionRegistrar: "comercial_gestion_registrar", tareaCompletar: "comercial_tarea_completar"
    };
    /* Perfil: rol de Firebase "comercial" (Atención al Cliente) o "ventas" (ejecutiva). */
    var MASTER = false;

    /* ---------- utilidades de interfaz ---------- */
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
    function opciones(lista, valor) { return lista.map(function (o) { return el("option", { value: o[0], text: o[1], selected: String(o[0]) === String(valor == null ? "" : valor) }); }); }
    var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
    var bs = function (v) { return "Bs " + Math.round(num(v)).toLocaleString("es-BO"); };
    var fecha = function (s) { if (!s) return "—"; var p = String(s).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0].slice(2) : String(s); };
    var hoy = function () { return L.iso(new Date()); };
    var mesActual = function () { var h = new Date(); return { desde: L.iso(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: hoy() }; };
    function chip(tono, t) { return el("span", { class: "co-chip co-" + tono, text: t }); }
    function aviso(tono, titulo, txt) { return el("div", { class: "co-aviso is-" + tono, role: "status" }, [titulo ? el("strong", { text: titulo }) : null, el("p", { text: txt })]); }
    function mensaje(nodo, tono, t) { nodo.textContent = t || ""; nodo.className = "co-msg" + (tono ? " is-" + tono : ""); }
    function kpis(lista) {
        return el("div", { class: "co-kpis" }, lista.map(function (k) {
            return el("article", { class: "co-kpi" + (k[3] ? " is-" + k[3] : "") }, [el("h3", { text: k[0] }), el("p", { class: "co-kpi-v", text: k[1] }), k[2] ? el("p", { class: "co-kpi-s", text: k[2] }) : null]);
        }));
    }
    function tabla(cols, filas, vacio, claseFila) {
        var tb = el("tbody");
        if (!filas.length) tb.appendChild(el("tr", {}, [el("td", { colspan: cols.length, class: "co-vacio", text: vacio })]));
        filas.forEach(function (f) {
            var tr = el("tr", { class: claseFila ? claseFila(f) : null });
            cols.forEach(function (c) {
                var v = c.v(f, tr);
                var td = el("td", { class: c.num ? "co-num" : null });
                if (v instanceof Node) td.appendChild(v); else td.textContent = v == null || v === "" ? "—" : String(v);
                tr.appendChild(td);
            });
            tb.appendChild(tr);
        });
        return el("div", { class: "co-tablewrap" }, [el("table", { class: "co-table" }, [
            el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { scope: "col", class: c.num ? "co-num" : null, text: c.t }); }))]), tb])]);
    }
    function subfila(tr, contenido, columnas) {
        var sig = tr.nextSibling;
        if (sig && sig.classList && sig.classList.contains("co-subfila")) { sig.remove(); return null; }
        var f = el("tr", { class: "co-subfila" }, [el("td", { colspan: columnas }, [contenido])]);
        tr.parentNode.insertBefore(f, tr.nextSibling);
        var p = f.querySelector("input, select, textarea"); if (p) p.focus();
        return f;
    }

    /* ---------- MCP ---------- */
    function noDisponible(e) { return /unknown tool|tool not found|not found|no existe la herramienta|desconocid|no encontrad|-32601/i.test(String((e && e.message) || e)); }
    function llamar(tool, args) {
        return window.CM.llamar(tool, args || {}).then(function (r) {
            if (r && r.estado === "error") throw new Error(r.error || "error del servidor");
            if (r && typeof r.error === "string") throw new Error(r.error);
            return r;
        }).catch(function (e) {
            if (e && e.sinSesion) { var av = document.getElementById("cm-sesion"); if (av) av.hidden = false; }
            if (noDisponible(e)) e.noDisponible = true;
            throw e;
        });
    }
    function filas(r) {
        if (Array.isArray(r)) return r;
        if (r && Array.isArray(r.filas)) return r.filas;
        if (r && Array.isArray(r.data)) return r.data;
        return [];
    }
    function datos(r) { return r && r.data && !Array.isArray(r.data) ? r.data : r; }
    /* Clientes vencidos en los últimos 180 días (el máximo que acepta clientes_vencidos), en páginas (hasta 5.000). */
    function cargarVencidos() {
        var acc = [];
        function pag(offset, n) {
            return llamar(T.vencidos, { dias: 180, limite: 200, offset: offset }).then(function (r) {
                acc = acc.concat(filas(r));
                var sig = r && r.siguiente_offset;
                return sig != null && n < 24 ? pag(sig, n + 1) : { filas: acc, cortado: sig != null };
            });
        }
        return pag(0, 0);
    }
    function textoError(e) { return e && e.sinSesion ? "Tu sesión de datos venció: vuelve a ingresar." : (e && e.message) || String(e); }

    /* ---------- estado ---------- */
    var S = { tab: null, vencidos: [], cortado: false, equipo: [], asignaciones: [], ultimas: [], tareas: [], guiones: [], comisiones: [], resumen: [], gestiones: [], sucursales: [], yo: null, sinHerramientas: false, errorVencidos: null, sinKeys: false, buscar: "", filtroEstado: "", filtroSuc: "", filtroEj: "", periodo: mesActual() };
    function clientesBase() { return L.antiguos(S.vencidos, hoy()); }

    /* ================= Carga ================= */
    function cargar() {
        mensaje($("#co-estado"), "", "Cargando…");
        var pV = cargarVencidos().then(function (v) {
            S.vencidos = v.filas; S.cortado = v.cortado; S.errorVencidos = null;
            S.sinKeys = v.filas.length > 0 && !v.filas.some(function (c) { return c.key_usuario || c.key_cliente; });
        }).catch(function (e) { if (e.sinSesion) throw e; S.errorVencidos = e; S.vencidos = []; });
        var pC = MASTER ? cargarMaster() : cargarEjecutiva();
        return Promise.all([pV, pC]).then(function () {
            mensaje($("#co-estado"), S.sinHerramientas ? "warn" : "", S.sinHerramientas
                ? "El sistema comercial está listo, pero todavía no está activo: por ahora solo se ven los clientes antiguos por sucursal."
                : "Actualizado a las " + new Date().toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" }));
            pintar();
        }).catch(function (e) { mensaje($("#co-estado"), "bad", "No se pudo cargar: " + textoError(e)); pintar(); });
    }
    function sinHerr(e) { if (e && e.noDisponible) { S.sinHerramientas = true; return; } throw e; }
    function cargarMaster() {
        var p = S.periodo;
        return Promise.all([
            llamar(T.equipo).then(function (r) { S.equipo = filas(r); }),
            llamar(T.asignaciones).then(function (r) { S.asignaciones = filas(r); }),
            llamar(T.ultimas).then(function (r) { S.ultimas = filas(r); }),
            llamar(T.tareas, { incluir_hechas: true }).then(function (r) { S.tareas = filas(r); }),
            llamar(T.guiones).then(function (r) { S.guiones = filas(r); }),
            llamar(T.comisiones, p).then(function (r) { S.comisiones = filas(r); }),
            llamar(T.resumen, p).then(function (r) { S.resumen = filas(r); }),
            llamar(T.gestiones, { desde: p.desde, hasta: p.hasta }).then(function (r) { S.gestiones = filas(r); }),
            S.sucursales.length ? null : llamar(T.sucursales).then(function (r) { S.sucursales = filas(r).map(function (s) { return String(s.descripcion || s).trim(); }); })
        ]).then(function () { S.sinHerramientas = false; }).catch(sinHerr);
    }
    function cargarEjecutiva() {
        return llamar(T.miTrabajo, S.periodo).then(function (r) {
            var d = datos(r) || {};
            S.yo = d.ejecutiva || null; S.equipo = d.equipo || []; S.asignaciones = d.asignaciones || [];
            S.ultimas = d.ultimas_gestiones || []; S.tareas = d.tareas || []; S.guiones = d.guiones || []; S.comisiones = d.comisiones || [];
            S.sinHerramientas = false; S.errorYo = null;
        }).catch(function (e) {
            if (e.noDisponible) { S.sinHerramientas = true; return; }
            if (/equipo comercial/i.test(e.message)) { S.errorYo = e.message; return; }
            throw e;
        });
    }

    /* ================= Pintar ================= */
    var TABS_MASTER = [["resumen", "Resumen"], ["equipo", "Equipo"], ["reparto", "Reparto por sucursal"], ["clientes", "Clientes"], ["tareas", "Tareas"], ["guiones", "Guiones"], ["comisiones", "Comisiones"], ["actividad", "Actividad"]];
    var TABS_EJ = [["hoy", "Mi día"], ["clientes", "Mis clientes"], ["tareas", "Tareas"], ["guiones", "Guiones"], ["comisiones", "Mis comisiones"]];
    function pintar() {
        var tabs = MASTER ? TABS_MASTER : TABS_EJ;
        if (!S.tab) { var h = location.hash.slice(1); S.tab = tabs.some(function (t) { return t[0] === h; }) ? h : tabs[0][0]; }
        var nav = $("#co-tabs"); nav.textContent = "";
        tabs.forEach(function (t) {
            nav.appendChild(el("button", { type: "button", role: "tab", class: "co-tab" + (S.tab === t[0] ? " is-on" : ""), "aria-selected": S.tab === t[0] ? "true" : "false", text: t[1],
                onclick: function () { S.tab = t[0]; try { history.replaceState(null, "", "#" + t[0]); } catch (e) {} pintar(); } }));
        });
        var c = $("#co-contenido"); c.textContent = "";
        if (S.errorVencidos) c.appendChild(aviso("bad", "No se pudieron leer los clientes antiguos", textoError(S.errorVencidos)));
        if (S.sinKeys) c.appendChild(aviso("warn", "Faltan datos de los clientes", "La lista de clientes vencidos no trae el identificador de cada cliente (key_usuario). Sin él no se pueden asignar ni registrar gestiones: hay que pedirlo en el MCP."));
        if (S.cortado) c.appendChild(aviso("warn", null, "Hay más de 5.000 clientes vencidos en los últimos 6 meses: se muestran los primeros 5.000."));
        var fn = (MASTER ? VISTAS_MASTER : VISTAS_EJ)[S.tab];
        if (fn) fn(c);
    }

    /* ---------- piezas compartidas ---------- */
    function carteraDe(keyEjecutiva) {
        var rep = L.repartir(clientesBase(), S.equipo, S.asignaciones);
        if (keyEjecutiva !== undefined) rep = rep.filter(function (c) { return c.key_ejecutiva === keyEjecutiva; });
        return L.cartera(rep, S.ultimas, hoy());
    }
    function guionPara(lista) { return S.guiones.filter(function (g) { return (g.lista || "antiguos") === (lista || "antiguos"); })[0] || S.guiones[0] || null; }
    function filtrosClientes(lista, conEjecutiva) {
        var q = L.norm(S.buscar);
        return lista.filter(function (c) {
            if (S.filtroEstado === "seguimiento" ? !c.crm.seguimiento : (S.filtroEstado && c.crm.clave !== S.filtroEstado)) return false;
            if (S.filtroSuc && L.norm(c.sucursal) !== L.norm(S.filtroSuc)) return false;
            if (conEjecutiva && S.filtroEj && (S.filtroEj === "_sin" ? c.key_ejecutiva : c.key_ejecutiva !== S.filtroEj)) return false;
            if (q && L.norm([c.cliente, c.telefono, c.sucursal, c.paquete, c.ejecutiva].join(" ")).indexOf(q) < 0) return false;
            return true;
        });
    }
    function barraFiltros(lista, conEjecutiva) {
        var sucs = {}; lista.forEach(function (c) { if (c.sucursal) sucs[c.sucursal] = 1; });
        var estados = [["", "Todos los estados"], ["seguimiento", "Con seguimiento programado"], ["sin_contactar", "Sin contactar"]].concat(Object.keys(L.RESULTADOS).map(function (k) { return [k, L.RESULTADOS[k].texto]; }));
        var hijos = [
            el("label", { class: "co-buscar" }, ["Buscar", el("input", { type: "search", value: S.buscar, placeholder: "Nombre, teléfono, sucursal…", oninput: function (e) { S.buscar = e.target.value; repintarLista(); } })]),
            el("label", {}, ["Estado", el("select", { class: "dash-select", onchange: function (e) { S.filtroEstado = e.target.value; repintarLista(); } }, opciones(estados, S.filtroEstado))]),
            el("label", {}, ["Sucursal", el("select", { class: "dash-select", onchange: function (e) { S.filtroSuc = e.target.value; repintarLista(); } }, opciones([["", "Todas"]].concat(Object.keys(sucs).sort().map(function (s) { return [s, s]; })), S.filtroSuc))])
        ];
        if (conEjecutiva) hijos.push(el("label", {}, ["Ejecutiva", el("select", { class: "dash-select", onchange: function (e) { S.filtroEj = e.target.value; repintarLista(); } },
            opciones([["", "Todas"], ["_sin", "Sin asignar"]].concat(S.equipo.filter(activa).map(function (e) { return [e.key, e.nombre]; })), S.filtroEj))]));
        return el("div", { class: "co-filtros" }, hijos);
    }
    var repintarLista = function () {};
    function activa(e) { return Number(e.estado == null ? 1 : e.estado) > 0; }
    function estadoChip(c) {
        var e = c.crm, nodos = [chip(e.tono, e.texto)];
        if (e.seguimiento_estado === "vencido") nodos.push(chip("bad", "Seguimiento atrasado " + fecha(e.seguimiento)));
        else if (e.seguimiento_estado === "hoy") nodos.push(chip("warn", "Seguimiento hoy"));
        else if (e.seguimiento) nodos.push(el("div", { class: "co-muted", text: "Seguimiento " + fecha(e.seguimiento) }));
        if (e.contactos) nodos.push(el("div", { class: "co-muted", text: e.contactos + (e.contactos === 1 ? " contacto" : " contactos") + " · último " + fecha(e.ultimo) }));
        return el("div", { class: "co-estado-crm" }, nodos);
    }

    /* ================= Vista ejecutiva ================= */
    function formularioGestion(c, alGuardar) {
        var msg = el("p", { class: "co-msg", role: "status" });
        var canal = el("select", { name: "canal", class: "dash-select" }, opciones(Object.keys(L.CANALES).map(function (k) { return [k, L.CANALES[k]]; }), "whatsapp"));
        var resultado = el("select", { name: "resultado", class: "dash-select" }, opciones(Object.keys(L.RESULTADOS).map(function (k) { return [k, L.RESULTADOS[k].texto]; }), "interesado"));
        var prox = el("input", { type: "date", name: "proximo_seguimiento", min: hoy() });
        var nota = el("input", { type: "text", name: "nota", maxlength: "2000", placeholder: "Qué dijo, qué le ofreciste…" });
        var rapidos = el("div", { class: "co-rapidos" }, [["Mañana", 1], ["En 3 días", 3], ["En 1 semana", 7]].map(function (r) {
            return el("button", { type: "button", class: "co-btn", text: r[0], onclick: function () { var d = new Date(); d.setDate(d.getDate() + r[1]); prox.value = L.iso(d); } });
        }));
        var btn = el("button", { type: "submit", class: "co-primario", text: "Guardar gestión" });
        var f = el("form", { class: "co-inline", novalidate: true }, [
            el("strong", { text: "Registrar contacto con " + (c.cliente || "el cliente") }),
            el("label", {}, ["Canal", canal]), el("label", {}, ["Resultado", resultado]),
            el("label", {}, ["Próximo seguimiento", prox, rapidos]), el("label", { class: "co-ancho" }, ["Nota", nota]),
            btn, msg
        ]);
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            if (prox.value && prox.value < hoy()) { mensaje(msg, "bad", "El seguimiento no puede ser en el pasado."); return; }
            if (!c.key_cliente || /^venta:/.test(c.key_cliente)) { mensaje(msg, "bad", "Este cliente no tiene identificador: no se puede registrar."); return; }
            btn.disabled = true; mensaje(msg, "", "Guardando…");
            llamar(T.gestionRegistrar, { key_cliente: c.key_cliente, cliente: c.cliente, sucursal: c.sucursal, lista: "antiguos", canal: canal.value, resultado: resultado.value, nota: nota.value.trim() || undefined, proximo_seguimiento: prox.value || undefined })
                .then(function () { avisar("Gestión con " + (c.cliente || "el cliente") + " guardada."); alGuardar(); })
                .catch(function (err) { btn.disabled = false; mensaje(msg, "bad", "No se guardó: " + textoError(err)); });
        });
        return f;
    }
    function accionesCliente(c, tr, columnas, yo) {
        var g = guionPara("antiguos");
        var datosG = { nombre: c.cliente, ejecutiva: (yo && yo.nombre) || "", sucursal: c.sucursal, paquete: c.paquete };
        var wa = L.linkWhatsApp(c.telefono, g ? L.rellenar(g.mensaje_whatsapp, datosG) : "");
        var cont = el("div", { class: "co-acciones" }, [
            wa ? el("a", { class: "co-btn co-wa", href: wa, target: "_blank", rel: "noopener", text: "WhatsApp" }) : null,
            c.telefono ? el("a", { class: "co-btn", href: "tel:" + String(c.telefono).replace(/[^\d+]/g, ""), text: "Llamar" }) : null
        ]);
        if (!MASTER && !S.sinHerramientas) cont.appendChild(el("button", { type: "button", class: "co-btn co-btn-fuerte", text: "Registrar", onclick: function () {
            var caja = el("div", { class: "co-gestion" }, [
                g && g.guion_llamada ? el("details", { class: "co-guion-mini" }, [el("summary", { text: "Ver guion de llamada" }), el("p", { text: L.rellenar(g.guion_llamada, datosG) })]) : null,
                c.ultima && c.ultima.nota ? el("p", { class: "co-muted", text: "Última nota: " + c.ultima.nota }) : null,
                formularioGestion(c, function () { cargar(); })
            ]);
            subfila(tr, caja, columnas);
        } }));
        return cont;
    }
    function tablaClientes(lista, opts) {
        var cols = [
            { t: "Cliente", v: function (c) { return el("div", {}, [el("b", { text: c.cliente || "—" }), el("div", { class: "co-muted", text: (c.telefono || "sin teléfono") + (c.paquete ? " · " + c.paquete : "") })]); } },
            { t: "Sucursal", v: function (c) { return c.sucursal; } },
            { t: "Vencido hace", num: 1, v: function (c) { return c.dias_vencido + " días"; } }
        ];
        if (opts.ejecutiva) cols.push({ t: "Ejecutiva", v: function (c) { return opts.ejecutiva(c); } });
        cols.push({ t: "Estado", v: function (c) { return estadoChip(c); } });
        cols.push({ t: "Acciones", v: function (c, tr) { return accionesCliente(c, tr, cols.length, S.yo); } });
        var LIM = 400;
        var t = tabla(cols, lista.slice(0, LIM), opts.vacio, function (c) { return c.crm.seguimiento_estado === "vencido" ? "is-atrasado" : null; });
        if (lista.length > LIM) t.appendChild(el("p", { class: "co-muted", text: "Se muestran " + LIM + " de " + lista.length + ": usa la búsqueda o los filtros para encontrar al resto." }));
        return t;
    }

    var VISTAS_EJ = {
        hoy: function (c) {
            if (!yoListo(c)) return;
            var mia = carteraDe(S.yo.key), h = hoy();
            var tot = L.totalesComision(S.comisiones)[S.yo.key] || { ventas: 0, comision: 0 };
            var contactadosMes = mia.filter(function (x) { return x.crm.ultimo && String(x.crm.ultimo).slice(0, 7) === h.slice(0, 7); }).length;
            var seg = mia.filter(function (x) { return x.crm.seguimiento_estado; });
            var meta = num(S.yo.meta_mensual);
            c.appendChild(el("h2", { class: "co-h2", text: "Hola, " + String(S.yo.nombre).split(" ")[0] }));
            c.appendChild(el("p", { class: "co-muted", text: "Tus sucursales: " + ((S.yo.sucursales || []).join(", ") || "ninguna asignada todavía") + ". Comisión: " + bs(5) + " por cada cliente que vuelve a comprar dentro de los 15 días de tu contacto." }));
            c.appendChild(kpis([
                ["Mis clientes por recuperar", mia.length.toLocaleString("es-BO"), mia.filter(function (x) { return x.crm.clave === "sin_contactar"; }).length + " sin contactar"],
                ["Seguimientos para hoy", String(seg.length), seg.filter(function (x) { return x.crm.seguimiento_estado === "vencido"; }).length + " atrasados", seg.length ? "warn" : null],
                ["Contactados este mes", String(contactadosMes)],
                ["Clientes recuperados", String(tot.ventas), meta ? "Meta del mes: " + meta + " (" + Math.round(tot.ventas / meta * 100) + "%)" : "Este mes", tot.ventas ? "ok" : null],
                ["Mi comisión del mes", bs(tot.comision), "Bs 5 por cliente recuperado", tot.comision ? "ok" : null]
            ]));
            var pend = S.tareas.filter(function (t) { return !t.hecha; });
            if (pend.length) {
                c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "Tareas de Atención al Cliente" }), listaTareas(pend, true)]));
            }
            var agenda = mia.filter(function (x) { return x.crm.orden <= 2; }).slice(0, 60);
            var siguientes = mia.filter(function (x) { return x.crm.clave === "sin_contactar"; }).slice(0, 20);
            c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "Para hoy: seguimientos e interesados" }),
                tablaClientes(agenda, { vacio: "No tienes seguimientos pendientes. Sigue con los clientes sin contactar." })]));
            c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "Siguientes a contactar" }), el("p", { class: "co-muted", text: "Primero los que vencieron hace menos tiempo: son los más fáciles de recuperar." }),
                tablaClientes(siguientes, { vacio: "Ya contactaste a todos tus clientes." })]));
        },
        clientes: function (c) {
            if (!yoListo(c)) return;
            var mia = carteraDe(S.yo.key);
            c.appendChild(el("h2", { class: "co-h2", text: "Mis clientes" }));
            c.appendChild(barraFiltros(mia, false));
            var cont = el("div"); c.appendChild(cont);
            repintarLista = function () { cont.textContent = ""; var l = filtrosClientes(mia, false); cont.appendChild(el("p", { class: "co-muted", text: l.length + " de " + mia.length + " clientes" })); cont.appendChild(tablaClientes(l, { vacio: "Nada coincide con los filtros." })); };
            repintarLista();
        },
        tareas: function (c) {
            if (!yoListo(c)) return;
            c.appendChild(el("h2", { class: "co-h2", text: "Tareas e indicaciones" }));
            c.appendChild(listaTareas(S.tareas, true));
        },
        guiones: function (c) { c.appendChild(el("h2", { class: "co-h2", text: "Guiones" })); c.appendChild(listaGuiones(false)); },
        comisiones: function (c) {
            if (!yoListo(c)) return;
            var tot = L.totalesComision(S.comisiones)[S.yo.key] || { ventas: 0, comision: 0, anuladas: 0 };
            c.appendChild(el("h2", { class: "co-h2", text: "Mis comisiones · " + fecha(S.periodo.desde) + " al " + fecha(S.periodo.hasta) }));
            c.appendChild(kpis([["Clientes recuperados", String(tot.ventas)], ["Comisión", bs(tot.comision)], ["Anuladas por Atención al Cliente", String(tot.anuladas || 0)]]));
            c.appendChild(tablaComisiones(S.comisiones, false));
        }
    };
    function yoListo(c) {
        if (S.sinHerramientas) { c.appendChild(aviso("warn", "Pendiente de activación", "Tu CRM está listo, pero todavía no está activo. Cuando se activen, aquí verás tus clientes asignados.")); return false; }
        if (S.errorYo) { c.appendChild(aviso("warn", "Todavía no estás en el equipo", S.errorYo)); return false; }
        if (!S.yo) { c.appendChild(el("p", { class: "co-msg", text: "Cargando…" })); return false; }
        return true;
    }

    function listaTareas(lista, comoEjecutiva) {
        if (!lista.length) return el("p", { class: "co-muted", text: "No hay tareas." });
        return el("ul", { class: "co-tareas" }, lista.map(function (t) {
            var vencida = !t.hecha && t.fecha_limite && String(t.fecha_limite).slice(0, 10) < hoy();
            var li = el("li", { class: "co-tarea" + (t.hecha ? " is-hecha" : "") + (vencida ? " is-vencida" : "") }, [
                el("div", { class: "co-tarea-cab" }, [chip(t.prioridad === "alta" ? "bad" : t.prioridad === "baja" ? "muted" : "warn", "Prioridad " + (t.prioridad || "normal")),
                    el("b", { text: t.titulo }),
                    el("span", { class: "co-muted", text: (t.key_ejecutiva ? "Para " + (t.ejecutiva || "ti") : "Para todo el equipo") + (t.fecha_limite ? " · hasta " + fecha(t.fecha_limite) : "") + (vencida ? " · atrasada" : "") })]),
                t.indicaciones ? el("p", { class: "co-tarea-txt", text: t.indicaciones }) : null,
                t.hecha ? el("p", { class: "co-muted", text: "Hecha " + fecha(t.fecha_hecha) + (t.comentario_cierre ? ": " + t.comentario_cierre : "") }) : null
            ]);
            if (comoEjecutiva && !MASTER && !S.sinHerramientas) {
                var com = el("input", { type: "text", maxlength: "2000", placeholder: "Comentario (opcional)", "aria-label": "Comentario" });
                var msg = el("span", { class: "co-msg" });
                var eraHecha = !!t.hecha;
                var b = el("button", { type: "button", class: eraHecha ? "co-btn" : "co-primario", text: eraHecha ? "Reabrir" : "Marcar como hecha", onclick: function () {
                    b.disabled = true;
                    llamar(T.tareaCompletar, { key: t.key, hecha: !eraHecha, comentario: com.value.trim() || undefined })
                        .then(function () { avisar(eraHecha ? "Tarea reabierta." : "Tarea marcada como hecha."); cargar(); })
                        .catch(function (e) { b.disabled = false; mensaje(msg, "bad", textoError(e)); });
                } });
                li.appendChild(el("div", { class: "co-tarea-acc" }, [t.hecha ? null : com, b, msg]));
            }
            if (MASTER) li.appendChild(el("div", { class: "co-tarea-acc" }, [
                el("button", { type: "button", class: "co-btn", text: "Editar", onclick: function () { editarTarea(t); } }),
                el("button", { type: "button", class: "co-btn", text: "Eliminar", onclick: function () { if (confirm("¿Eliminar la tarea «" + t.titulo + "»?")) llamar(T.tareaEliminar, { key: t.key }).then(function () { avisar("Tarea eliminada."); cargar(); }).catch(function (e) { avisar("No se pudo eliminar: " + textoError(e), "bad"); }); } })
            ]));
            return li;
        }));
    }
    function listaGuiones(editable) {
        if (!S.guiones.length) return el("p", { class: "co-muted", text: S.sinHerramientas ? "Los guiones aparecerán cuando se active el sistema comercial." : "Todavía no hay guiones." });
        var ej = S.yo ? S.yo.nombre : "{ejecutiva}";
        return el("div", { class: "co-guiones" }, S.guiones.map(function (g) {
            var ejemplo = { nombre: "María", ejecutiva: ej, sucursal: "Berea", paquete: "Mensual" };
            return el("article", { class: "co-card co-guion" }, [
                el("div", { class: "co-tarea-cab" }, [el("b", { text: g.titulo }), g.oferta ? chip("ok", "Oferta: " + g.oferta) : null]),
                g.guion_llamada ? el("div", {}, [el("h4", { text: "Llamada" }), el("p", { text: editable ? g.guion_llamada : L.rellenar(g.guion_llamada, ejemplo) })]) : null,
                g.mensaje_whatsapp ? el("div", {}, [el("h4", { text: "WhatsApp" }), el("p", { class: "co-wa-txt", text: editable ? g.mensaje_whatsapp : L.rellenar(g.mensaje_whatsapp, ejemplo) })]) : null,
                editable ? el("div", { class: "co-tarea-acc" }, [
                    el("button", { type: "button", class: "co-btn", text: "Editar", onclick: function () { editarGuion(g); } }),
                    el("button", { type: "button", class: "co-btn", text: "Eliminar", onclick: function () { if (confirm("¿Eliminar el guion «" + g.titulo + "»?")) llamar(T.guionEliminar, { key: g.key }).then(function () { avisar("Guion eliminado."); cargar(); }).catch(function (e) { avisar(textoError(e), "bad"); }); } })
                ]) : el("p", { class: "co-muted", text: "Al tocar WhatsApp en un cliente, el mensaje ya sale con su nombre." })
            ]);
        }));
    }
    function tablaComisiones(lista, conAcciones) {
        var cols = [
            { t: "Venta", v: function (x) { return fecha(x.fecha_venta); } },
            { t: "Cliente", v: function (x) { return x.cliente || nombreCliente(x.key_cliente) || ("Cliente " + String(x.key_cliente || "").slice(0, 8)); } },
            { t: "Paquete", v: function (x) { return x.paquete; } },
            { t: "Sucursal", v: function (x) { return x.sucursal; } },
            { t: "Monto", num: 1, v: function (x) { return bs(x.monto); } },
            { t: "Contacto", v: function (x) { return fecha(x.fecha_contacto) + " · " + (L.CANALES[x.canal] || x.canal || ""); } }
        ];
        if (conAcciones) cols.splice(1, 0, { t: "Ejecutiva", v: function (x) { return x.ejecutiva; } });
        cols.push({ t: "Comisión", num: 1, v: function (x) { return x.anulada ? el("span", {}, [chip("muted", "Anulada"), el("div", { class: "co-muted", text: x.motivo_anulacion || "" })]) : bs(x.comision); } });
        if (conAcciones) cols.push({ t: "", v: function (x, tr) {
            return x.anulada
                ? el("button", { type: "button", class: "co-btn", text: "Restaurar", onclick: function () { llamar(T.comisionRestaurar, { key_paquete_venta_usuario: x.key_paquete_venta_usuario }).then(function () { avisar("Comisión restaurada."); cargar(); }).catch(function (e) { avisar(textoError(e), "bad"); }); } })
                : el("button", { type: "button", class: "co-btn", text: "Anular", onclick: function () {
                    var motivo = el("input", { type: "text", maxlength: "300", placeholder: "Ej.: el cliente ya había reservado solo", "aria-label": "Motivo" });
                    var msg = el("span", { class: "co-msg" });
                    var f = el("form", { class: "co-inline", novalidate: true }, [el("label", { class: "co-ancho" }, ["Motivo de la anulación", motivo]), el("button", { type: "submit", class: "co-peligro", text: "Anular comisión" }), msg]);
                    f.addEventListener("submit", function (e) {
                        e.preventDefault();
                        if (!motivo.value.trim()) { mensaje(msg, "bad", "Escribe el motivo."); return; }
                        llamar(T.comisionAnular, { key_paquete_venta_usuario: x.key_paquete_venta_usuario, motivo: motivo.value.trim() }).then(function () { avisar("Comisión anulada."); cargar(); }).catch(function (err) { mensaje(msg, "bad", textoError(err)); });
                    });
                    subfila(tr, f, cols.length);
                } });
        } });
        return tabla(cols, lista, "No hay ventas atribuidas en este período.");
    }

    function nombreCliente(k) {
        if (!k) return "";
        for (var i = 0; i < S.vencidos.length; i++) if ((S.vencidos[i].key_usuario || S.vencidos[i].key_cliente) === k) return String(S.vencidos[i].cliente || "").trim();
        return "";
    }

    /* ================= Vista master (Atención al Cliente) ================= */
    function pendienteMaster(c) {
        if (!S.sinHerramientas) return false;
        c.appendChild(aviso("warn", "Pendiente de activación", "El sistema comercial está listo, pero todavía no está activo. Mientras tanto puedes ver los clientes antiguos por sucursal en «Reparto por sucursal»."));
        return true;
    }
    var VISTAS_MASTER = {
        resumen: function (c) {
            var todos = carteraDe(), sin = todos.filter(function (x) { return !x.key_ejecutiva; }).length;
            var com = L.totalesComision(S.comisiones), totalCom = 0, totalVentas = 0;
            Object.keys(com).forEach(function (k) { totalCom += com[k].comision; totalVentas += com[k].ventas; });
            var contactados = todos.filter(function (x) { return x.crm.ultimo && String(x.crm.ultimo).slice(0, 10) >= S.periodo.desde; }).length;
            c.appendChild(el("h2", { class: "co-h2", text: "Recuperación de clientes antiguos" }));
            c.appendChild(el("p", { class: "co-muted", text: "Clientes que vencieron hace entre 1 y 6 meses. Período de ventas y comisiones: " + fecha(S.periodo.desde) + " al " + fecha(S.periodo.hasta) + "." }));
            c.appendChild(kpis([
                ["Clientes antiguos por recuperar", todos.length.toLocaleString("es-BO"), sin ? sin + " sin ejecutiva asignada" : "Todos asignados", sin ? "warn" : null],
                ["Contactados en el período", contactados.toLocaleString("es-BO"), todos.length ? Math.round(contactados / todos.length * 100) + "% de la cartera" : ""],
                ["Seguimientos atrasados", String(todos.filter(function (x) { return x.crm.seguimiento_estado === "vencido"; }).length), "Clientes con seguimiento vencido", null],
                ["Clientes recuperados", String(totalVentas), "Ventas atribuidas a una ejecutiva", totalVentas ? "ok" : null],
                ["Comisiones a pagar", bs(totalCom), "Bs 5 por cliente recuperado"]
            ]));
            if (pendienteMaster(c)) return;
            c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "Ranking del equipo" }), tablaEquipo(false)]));
            var atrasadas = S.tareas.filter(function (t) { return !t.hecha && t.fecha_limite && String(t.fecha_limite).slice(0, 10) < hoy(); });
            if (atrasadas.length) c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "Tareas atrasadas" }), listaTareas(atrasadas, false)]));
        },
        equipo: function (c) {
            c.appendChild(el("h2", { class: "co-h2", text: "Equipo de ventas" }));
            if (pendienteMaster(c)) return;
            c.appendChild(el("div", { class: "co-fila" }, [el("button", { type: "button", class: "co-primario", text: "Agregar ejecutiva", onclick: function () { editarEjecutiva(null); } })]));
            c.appendChild(el("div", { id: "co-form-ej" }));
            c.appendChild(el("div", { class: "co-card" }, [tablaEquipo(true)]));
        },
        reparto: function (c) {
            var rep = L.repartir(clientesBase(), S.equipo, S.asignaciones), porSuc = {};
            rep.forEach(function (x) { var k = x.sucursal || "Sin sucursal"; var f = porSuc[k] || (porSuc[k] = { sucursal: k, clientes: 0, sin: 0, ej: {} }); f.clientes++; if (!x.key_ejecutiva) f.sin++; else f.ej[x.ejecutiva] = (f.ej[x.ejecutiva] || 0) + 1; });
            S.sucursales.forEach(function (s) { if (!Object.keys(porSuc).some(function (k) { return L.norm(k) === L.norm(s); })) porSuc[s] = { sucursal: s, clientes: 0, sin: 0, ej: {} }; });
            var lista = Object.keys(porSuc).map(function (k) { return porSuc[k]; }).sort(function (a, b) { return b.clientes - a.clientes; });
            c.appendChild(el("h2", { class: "co-h2", text: "Reparto por sucursal" }));
            c.appendChild(el("p", { class: "co-muted", text: "Cada ejecutiva recibe los clientes antiguos de sus sucursales. Si dos ejecutivas comparten sucursal, los clientes se reparten en partes iguales. Para cambiar las sucursales de una ejecutiva, edítala en «Equipo»." }));
            c.appendChild(el("div", { class: "co-card" }, [tabla([
                { t: "Sucursal", v: function (f) { return f.sucursal; } },
                { t: "Clientes antiguos", num: 1, v: function (f) { return f.clientes.toLocaleString("es-BO"); } },
                { t: "Ejecutivas", v: function (f) { var n = Object.keys(f.ej); return n.length ? n.map(function (k) { return k + " (" + f.ej[k] + ")"; }).join(", ") : chip(f.clientes ? "bad" : "muted", f.clientes ? "Sin cobertura" : "—"); } },
                { t: "Sin asignar", num: 1, v: function (f) { return f.sin ? chip("bad", String(f.sin)) : "0"; } }
            ], lista, "No hay clientes antiguos.")]));
        },
        clientes: function (c) {
            var todos = carteraDe();
            c.appendChild(el("h2", { class: "co-h2", text: "Clientes antiguos" }));
            c.appendChild(barraFiltros(todos, true));
            var cont = el("div"); c.appendChild(cont);
            var ejecutivaCelda = function (x) {
                if (S.sinHerramientas) return x.ejecutiva || "—";
                var sel = el("select", { class: "dash-select co-sel-mini", "aria-label": "Ejecutiva de " + (x.cliente || "cliente"), onchange: function () {
                    var v = sel.value;
                    llamar(T.asignar, { key_cliente: x.key_cliente, key_ejecutiva: v === "_auto" ? null : v, motivo: "Reasignado por Atención al Cliente" })
                        .then(function () { avisar((x.cliente || "Cliente") + (v === "_auto" ? " vuelve al reparto por sucursal." : " reasignado.")); cargar(); })
                        .catch(function (e) { avisar("No se pudo reasignar: " + textoError(e), "bad"); });
                } }, opciones([["_auto", "Por sucursal" + (x.asignacion === "sucursal" ? " (" + x.ejecutiva + ")" : "")]].concat(S.equipo.filter(activa).map(function (e) { return [e.key, e.nombre]; })), x.asignacion === "manual" ? x.key_ejecutiva : "_auto"));
                return el("div", {}, [sel, x.asignacion === "manual" ? el("div", { class: "co-muted", text: "Asignado a mano" }) : x.asignacion === "sin_asignar" ? chip("bad", "Sin asignar") : null]);
            };
            repintarLista = function () { cont.textContent = ""; var l = filtrosClientes(todos, true); cont.appendChild(el("p", { class: "co-muted", text: l.length + " de " + todos.length + " clientes" })); cont.appendChild(tablaClientes(l, { ejecutiva: ejecutivaCelda, vacio: "Nada coincide con los filtros." })); };
            repintarLista();
        },
        tareas: function (c) {
            c.appendChild(el("h2", { class: "co-h2", text: "Tareas e indicaciones" }));
            if (pendienteMaster(c)) return;
            c.appendChild(el("div", { class: "co-fila" }, [el("button", { type: "button", class: "co-primario", text: "Nueva tarea", onclick: function () { editarTarea(null); } })]));
            c.appendChild(el("div", { id: "co-form-tarea" }));
            var pend = S.tareas.filter(function (t) { return !t.hecha; }), hechas = S.tareas.filter(function (t) { return t.hecha; });
            c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "Pendientes (" + pend.length + ")" }), listaTareas(pend, false)]));
            c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "Hechas (" + hechas.length + ")" }), listaTareas(hechas.slice(0, 50), false)]));
        },
        guiones: function (c) {
            c.appendChild(el("h2", { class: "co-h2", text: "Guiones de llamada y WhatsApp" }));
            if (pendienteMaster(c)) return;
            c.appendChild(el("p", { class: "co-muted", text: "Usa {nombre}, {ejecutiva}, {sucursal} y {paquete}: se reemplazan solos con los datos de cada cliente." }));
            c.appendChild(el("div", { class: "co-fila" }, [el("button", { type: "button", class: "co-primario", text: "Nuevo guion", onclick: function () { editarGuion(null); } })]));
            c.appendChild(el("div", { id: "co-form-guion" }));
            c.appendChild(listaGuiones(true));
        },
        comisiones: function (c) {
            c.appendChild(el("h2", { class: "co-h2", text: "Comisiones · " + fecha(S.periodo.desde) + " al " + fecha(S.periodo.hasta) }));
            if (pendienteMaster(c)) return;
            c.appendChild(el("p", { class: "co-muted", text: "Una venta es de la ejecutiva que hizo el último contacto con ese cliente dentro de los 15 días anteriores a la compra. Si una comisión no corresponde, anúlala con el motivo." }));
            var t = L.totalesComision(S.comisiones);
            c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "A pagar por ejecutiva" }), tabla([
                { t: "Ejecutiva", v: function (f) { return f.ejecutiva; } },
                { t: "Clientes recuperados", num: 1, v: function (f) { return f.ventas; } },
                { t: "Vendido", num: 1, v: function (f) { return bs(f.monto_vendido); } },
                { t: "Anuladas", num: 1, v: function (f) { return f.anuladas; } },
                { t: "Comisión a pagar", num: 1, v: function (f) { return el("b", { text: bs(f.comision) }); } }
            ], Object.keys(t).map(function (k) { return t[k]; }).sort(function (a, b) { return b.comision - a.comision; }), "Todavía no hay ventas atribuidas."),
                el("button", { type: "button", class: "co-btn", text: "Descargar detalle (CSV)", onclick: descargarComisiones })]));
            c.appendChild(el("div", { class: "co-card" }, [el("h3", { class: "co-h3", text: "Detalle de ventas atribuidas" }), tablaComisiones(S.comisiones, true)]));
        },
        actividad: function (c) {
            c.appendChild(el("h2", { class: "co-h2", text: "Actividad del equipo" }));
            if (pendienteMaster(c)) return;
            c.appendChild(el("div", { class: "co-card" }, [tabla([
                { t: "Fecha", v: function (g) { return fecha(g.fecha_on) + " " + String(g.fecha_on || "").slice(11, 16); } },
                { t: "Ejecutiva", v: function (g) { return g.ejecutiva; } },
                { t: "Cliente", v: function (g) { return el("div", {}, [g.cliente || "—", el("div", { class: "co-muted", text: g.sucursal || "" })]); } },
                { t: "Canal", v: function (g) { return L.CANALES[g.canal] || g.canal; } },
                { t: "Resultado", v: function (g) { var r = L.RESULTADOS[g.resultado] || L.RESULTADOS.otro; return chip(r.tono, r.texto); } },
                { t: "Nota", v: function (g) { return g.nota; } },
                { t: "Seguimiento", v: function (g) { return g.proximo_seguimiento ? fecha(g.proximo_seguimiento) : "—"; } }
            ], S.gestiones.slice(0, 500), "Sin gestiones en el período.")]));
        }
    };

    function tablaEquipo(conAcciones) {
        var cartera = carteraDe(), porEj = {};
        cartera.forEach(function (x) { if (x.key_ejecutiva) { var f = porEj[x.key_ejecutiva] || (porEj[x.key_ejecutiva] = { clientes: 0, sin: 0 }); f.clientes++; if (x.crm.clave === "sin_contactar") f.sin++; } });
        var res = {}; S.resumen.forEach(function (r) { res[r.key_ejecutiva] = r; });
        var com = L.totalesComision(S.comisiones);
        var lista = S.equipo.filter(activa).map(function (e) { return Object.assign({}, e, res[e.key] || {}, { cartera: porEj[e.key] || { clientes: 0, sin: 0 }, com: com[e.key] || { ventas: 0, comision: 0 } }); })
            .sort(function (a, b) { return b.com.ventas - a.com.ventas || num(b.gestiones) - num(a.gestiones); });
        var cols = [
            { t: "Ejecutiva", v: function (e) { return el("div", {}, [el("b", { text: e.nombre }), el("div", { class: "co-muted", text: (e.sucursales || []).join(", ") || "Sin sucursales" })]); } },
            { t: "Clientes", num: 1, v: function (e) { return el("div", {}, [String(e.cartera.clientes), el("div", { class: "co-muted", text: e.cartera.sin + " sin contactar" })]); } },
            { t: "Gestiones", num: 1, v: function (e) { return num(e.gestiones); } },
            { t: "Contactados", num: 1, v: function (e) { return num(e.contactados); } },
            { t: "Interesados", num: 1, v: function (e) { return num(e.interesados); } },
            { t: "Seguim. atrasados", num: 1, v: function (e) { return num(e.seguimientos_vencidos) ? chip("bad", String(e.seguimientos_vencidos)) : "0"; } },
            { t: "Recuperados", num: 1, v: function (e) { return el("div", {}, [String(e.com.ventas), num(e.meta_mensual) ? el("div", { class: "co-meta" }, [el("span", { style: "width:" + Math.min(100, e.com.ventas / num(e.meta_mensual) * 100).toFixed(0) + "%" })]) : null, num(e.meta_mensual) ? el("div", { class: "co-muted", text: "meta " + e.meta_mensual }) : null]); } },
            { t: "Comisión", num: 1, v: function (e) { return bs(e.com.comision); } },
            { t: "Tareas pend.", num: 1, v: function (e) { return num(e.tareas_pendientes); } }
        ];
        if (conAcciones) cols.push({ t: "", v: function (e) { return el("button", { type: "button", class: "co-btn", text: "Editar", onclick: function () { editarEjecutiva(e); } }); } });
        return tabla(cols, lista, "Todavía no hay ejecutivas en el equipo. Agrégalas en «Equipo».");
    }

    /* ----- formularios del master ----- */
    function editarEjecutiva(e) {
        var cont = $("#co-form-ej"); if (!cont) { S.tab = "equipo"; pintar(); cont = $("#co-form-ej"); }
        cont.textContent = "";
        var msg = el("p", { class: "co-msg", role: "status" });
        var nombre = el("input", { type: "text", maxlength: "120", value: e ? e.nombre : "", required: true });
        var tel = el("input", { type: "tel", maxlength: "40", value: e ? e.telefono || "" : "" });
        var meta = el("input", { type: "number", min: "0", max: "10000", step: "1", value: e ? e.meta_mensual || 0 : 20 });
        var keyUsuario = e ? e.key_usuario : null;
        var buscar = el("input", { type: "search", placeholder: "Correo o nombre (debe tener el rol de Ejecutiva en Roles)", value: "" });
        var resultados = el("div", { class: "co-resultados" });
        var elegido = el("p", { class: "co-muted", text: keyUsuario ? "Cuenta: " + keyUsuario : "Busca y elige la cuenta de Google con la que la ejecutiva entra. Si no aparece, primero Dirección le da el rol «Ejecutiva de ventas» en Roles." });
        var t;
        buscar.addEventListener("input", function () {
            clearTimeout(t); var q = buscar.value.trim(); if (q.length < 3) { resultados.textContent = ""; return; }
            t = setTimeout(function () {
                llamar(T.buscarUsuario, { texto: q }).then(function (r) {
                    resultados.textContent = "";
                    filas(r).slice(0, 8).forEach(function (u) {
                        resultados.appendChild(el("button", { type: "button", class: "co-btn", text: (u.nombre || u.usuario || u.key) + (u.usuario ? " · " + u.usuario : ""), onclick: function () {
                            keyUsuario = u.key || u.key_usuario; if (!nombre.value) nombre.value = u.nombre || ""; if (!tel.value && u.telefono) tel.value = u.telefono;
                            elegido.textContent = "Usuario elegido: " + (u.nombre || u.usuario); resultados.textContent = "";
                        } }));
                    });
                    if (!resultados.childNodes.length) resultados.appendChild(el("span", { class: "co-muted", text: "Sin resultados." }));
                }).catch(function (err) { resultados.textContent = err.noDisponible ? "La búsqueda de usuarios todavía no está en el MCP." : textoError(err); });
            }, 350);
        });
        var marcadas = {}; (e ? e.sucursales || [] : []).forEach(function (s) { marcadas[L.norm(s)] = true; });
        var nombresSuc = S.sucursales.length ? S.sucursales : Object.keys(clientesBase().reduce(function (a, c) { if (c.sucursal) a[c.sucursal] = 1; return a; }, {}));
        var checks = nombresSuc.slice().sort().map(function (s) { return el("label", { class: "co-check" }, [el("input", { type: "checkbox", value: s, checked: !!marcadas[L.norm(s)] }), s]); });
        var f = el("form", { class: "co-card co-form", novalidate: true }, [
            el("h3", { class: "co-h3", text: e ? "Editar a " + e.nombre : "Agregar ejecutiva" }),
            e ? el("p", { class: "co-muted co-ancho", text: "Cuenta: " + e.key_usuario }) : el("label", { class: "co-ancho" }, ["Cuenta de Google", buscar, resultados, elegido]),
            el("label", {}, ["Nombre", nombre]), el("label", {}, ["Teléfono", tel]), el("label", {}, ["Meta mensual (clientes recuperados)", meta]),
            el("fieldset", { class: "co-ancho co-checks" }, [el("legend", { text: "Sucursales que atiende" })].concat(checks)),
            el("div", { class: "co-acciones co-ancho" }, [el("button", { type: "submit", class: "co-primario", text: "Guardar" }),
                e ? el("button", { type: "button", class: "co-peligro", text: "Dar de baja", onclick: function () { if (confirm("¿Dar de baja a " + e.nombre + "? Sus clientes vuelven al reparto por sucursal.")) guardar(0); } }) : null,
                el("button", { type: "button", class: "co-btn", text: "Cancelar", onclick: function () { cont.textContent = ""; } }), msg])
        ]);
        function guardar(estado) {
            if (!keyUsuario) { mensaje(msg, "bad", "Elige la cuenta de Google de la ejecutiva."); return; }
            if (!nombre.value.trim()) { mensaje(msg, "bad", "Escribe el nombre."); return; }
            var sucs = checks.map(function (l) { return l.querySelector("input"); }).filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
            mensaje(msg, "", "Guardando…");
            llamar(T.ejecutivaGuardar, { data: { key: e ? e.key : undefined, key_usuario: keyUsuario, nombre: nombre.value.trim(), telefono: tel.value.trim() || undefined, sucursales: sucs, meta_mensual: Math.max(0, parseInt(meta.value, 10) || 0), estado: estado == null ? 1 : estado } })
                .then(function () { avisar(estado === 0 ? e.nombre + " dada de baja." : "Ejecutiva guardada."); cont.textContent = ""; cargar(); })
                .catch(function (err) { mensaje(msg, "bad", textoError(err)); });
        }
        f.addEventListener("submit", function (ev) { ev.preventDefault(); guardar(); });
        cont.appendChild(f);
        (e ? nombre : buscar).focus();
    }
    function editarTarea(t) {
        var cont = $("#co-form-tarea"); if (!cont) { S.tab = "tareas"; pintar(); cont = $("#co-form-tarea"); }
        cont.textContent = "";
        var msg = el("p", { class: "co-msg", role: "status" });
        var titulo = el("input", { type: "text", maxlength: "200", value: t ? t.titulo : "", placeholder: "Ej.: Llamar a 30 clientes antiguos de Berea" });
        var ind = el("textarea", { rows: "4", maxlength: "4000", placeholder: "Indicaciones: qué ofrecer, a quién priorizar, cómo reportar…" }); ind.value = t ? t.indicaciones || "" : "";
        var para = el("select", { class: "dash-select" }, opciones([["", "Todo el equipo"]].concat(S.equipo.filter(activa).map(function (e) { return [e.key, e.nombre]; })), t ? t.key_ejecutiva || "" : ""));
        var prio = el("select", { class: "dash-select" }, opciones([["alta", "Alta"], ["normal", "Normal"], ["baja", "Baja"]], t ? t.prioridad : "normal"));
        var lim = el("input", { type: "date", value: t && t.fecha_limite ? String(t.fecha_limite).slice(0, 10) : "" });
        var f = el("form", { class: "co-card co-form", novalidate: true }, [
            el("h3", { class: "co-h3", text: t ? "Editar tarea" : "Nueva tarea" }),
            el("label", { class: "co-ancho" }, ["Tarea", titulo]), el("label", { class: "co-ancho" }, ["Indicaciones", ind]),
            el("label", {}, ["Para", para]), el("label", {}, ["Prioridad", prio]), el("label", {}, ["Fecha límite", lim]),
            el("div", { class: "co-acciones co-ancho" }, [el("button", { type: "submit", class: "co-primario", text: "Guardar tarea" }), el("button", { type: "button", class: "co-btn", text: "Cancelar", onclick: function () { cont.textContent = ""; } }), msg])
        ]);
        f.addEventListener("submit", function (ev) {
            ev.preventDefault();
            if (!titulo.value.trim()) { mensaje(msg, "bad", "Escribe la tarea."); return; }
            mensaje(msg, "", "Guardando…");
            llamar(T.tareaGuardar, { data: { key: t ? t.key : undefined, titulo: titulo.value.trim(), indicaciones: ind.value.trim() || undefined, key_ejecutiva: para.value || undefined, prioridad: prio.value, fecha_limite: lim.value || undefined } })
                .then(function () { avisar("Tarea guardada."); cont.textContent = ""; cargar(); })
                .catch(function (err) { mensaje(msg, "bad", textoError(err)); });
        });
        cont.appendChild(f); titulo.focus();
    }
    function editarGuion(g) {
        var cont = $("#co-form-guion"); if (!cont) { S.tab = "guiones"; pintar(); cont = $("#co-form-guion"); }
        cont.textContent = "";
        var msg = el("p", { class: "co-msg", role: "status" });
        var titulo = el("input", { type: "text", maxlength: "200", value: g ? g.titulo : "" });
        var oferta = el("input", { type: "text", maxlength: "300", value: g ? g.oferta || "" : "", placeholder: "Ej.: 2x1 en noviembre" });
        var llamada = el("textarea", { rows: "5", maxlength: "4000" }); llamada.value = g ? g.guion_llamada || "" : "";
        var wa = el("textarea", { rows: "3", maxlength: "1000" }); wa.value = g ? g.mensaje_whatsapp || "" : "";
        var orden = el("input", { type: "number", step: "1", value: g ? g.orden || 0 : 0 });
        var f = el("form", { class: "co-card co-form", novalidate: true }, [
            el("h3", { class: "co-h3", text: g ? "Editar guion" : "Nuevo guion" }),
            el("label", {}, ["Título", titulo]), el("label", {}, ["Oferta (opcional)", oferta]), el("label", {}, ["Orden", orden]),
            el("label", { class: "co-ancho" }, ["Guion de llamada", llamada]), el("label", { class: "co-ancho" }, ["Mensaje de WhatsApp", wa]),
            el("div", { class: "co-acciones co-ancho" }, [el("button", { type: "submit", class: "co-primario", text: "Guardar guion" }), el("button", { type: "button", class: "co-btn", text: "Cancelar", onclick: function () { cont.textContent = ""; } }), msg])
        ]);
        f.addEventListener("submit", function (ev) {
            ev.preventDefault();
            if (!titulo.value.trim()) { mensaje(msg, "bad", "Escribe el título."); return; }
            mensaje(msg, "", "Guardando…");
            llamar(T.guionGuardar, { data: { key: g ? g.key : undefined, lista: "antiguos", titulo: titulo.value.trim(), oferta: oferta.value.trim() || undefined, guion_llamada: llamada.value.trim() || undefined, mensaje_whatsapp: wa.value.trim() || undefined, orden: parseInt(orden.value, 10) || 0 } })
                .then(function () { avisar("Guion guardado."); cont.textContent = ""; cargar(); })
                .catch(function (err) { mensaje(msg, "bad", textoError(err)); });
        });
        cont.appendChild(f); titulo.focus();
    }
    function descargarComisiones() {
        var esc = function (v) { var s = v == null ? "" : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        var filasCsv = [["Fecha venta", "Ejecutiva", "Cliente", "Paquete", "Sucursal", "Monto", "Fecha contacto", "Canal", "Comisión", "Anulada", "Motivo anulación"]]
            .concat(S.comisiones.map(function (x) { return [String(x.fecha_venta || "").slice(0, 10), x.ejecutiva, x.cliente || x.key_cliente, x.paquete, x.sucursal, x.monto, String(x.fecha_contacto || "").slice(0, 10), x.canal, x.comision, x.anulada ? "sí" : "no", x.motivo_anulacion || ""]; }));
        var blob = new Blob(["﻿" + filasCsv.map(function (f) { return f.map(esc).join(";"); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = el("a", { href: URL.createObjectURL(blob), download: "comisiones-" + S.periodo.desde + "-a-" + S.periodo.hasta + ".csv" });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    function avisar(t, tono) { var m = $("#co-aviso"); mensaje(m, tono || "ok", t); clearTimeout(avisar.t); avisar.t = setTimeout(function () { m.textContent = ""; }, 8000); }

    /* ---------- arranque ---------- */
    function arrancar() {
    $("#co-titulo").textContent = MASTER ? "Sistema comercial" : "Mi CRM de ventas";
    $("#co-sub").textContent = MASTER
        ? "Atención al Cliente dirige al equipo de ventas: reparte clientes antiguos por sucursal, deja tareas y guiones, y controla resultados y comisiones."
        : "Tus clientes antiguos por recuperar, tus seguimientos, las tareas de Atención al Cliente y tu comisión.";
    var mes = $("#co-mes");
    mes.value = S.periodo.desde.slice(0, 7); mes.max = hoy().slice(0, 7);
    mes.addEventListener("change", function () {
        if (!/^\d{4}-\d{2}$/.test(mes.value)) return;
        var p = mes.value.split("-"), ini = new Date(+p[0], +p[1] - 1, 1), fin = new Date(+p[0], +p[1], 0);
        S.periodo = { desde: L.iso(ini), hasta: L.iso(fin) < hoy() ? L.iso(fin) : hoy() };
        cargar();
    });
    $("#co-actualizar").addEventListener("click", cargar);
    cargar();
    setInterval(function () { if (!document.hidden && !raiz.querySelector(".co-subfila, .co-form")) cargar(); }, 10 * 60000);
    }
    (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
        if (window.CMFB) {
            MASTER = CMFB.tieneRol("comercial");
            if (CMFB.estado.usuario && !MASTER && !CMFB.tieneRol("ventas")) {
                mensaje($("#co-estado"), "warn", "Tu cuenta " + CMFB.correo() + " no tiene el rol de Sistema comercial ni de Ejecutiva de ventas. Pídeselo a Dirección.");
                return;
            }
        }
        arrancar();
    });
})();
