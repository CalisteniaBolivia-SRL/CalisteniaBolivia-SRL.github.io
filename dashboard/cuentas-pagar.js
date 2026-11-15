/* Cuentas por pagar y punto de equilibrio por sucursal (tablero de Administración).
   - Los datos se guardan en el servidor de Calistenia (componentes cuenta_pagar y cuenta_pagar_pago)
     y se leen y escriben con las herramientas del MCP de Calistenia (window.CM.llamar).
   - Las ventas por sucursal salen de reporte_ventas, igual que en el resto del tablero.
   - Punto de equilibrio = costos fijos ÷ (1 − costos variables ÷ ventas), por sucursal.
     Los gastos "generales" (sin sucursal) se reparten entre las sucursales según su parte de las ventas.
     Los gastos fijos mensuales del mes anterior que aún no se cargaron este mes se cuentan como estimados.
   Si el MCP todavía no tiene las herramientas, la sección lo avisa y el resto del tablero sigue igual. */
(function () {
    "use strict";

    var TOOLS = {
        listar: "cuentas_por_pagar_listar",
        registrar: "cuentas_por_pagar_registrar",
        pagar: "cuentas_por_pagar_pagar",
        anular: "cuentas_por_pagar_anular",
        sucursales: "cuentas_por_pagar_sucursales",
        ventas: "reporte_ventas"
    };
    var CATEGORIAS = [
        ["alquiler", "Alquiler"], ["servicios_basicos", "Servicios básicos (luz, agua, internet)"], ["sueldos", "Sueldos y honorarios"],
        ["mercaderia", "Mercadería"], ["impuestos", "Impuestos"], ["mantenimiento", "Mantenimiento y equipos"],
        ["marketing", "Marketing"], ["otros", "Otros"]
    ];
    var FORMAS_PAGO = [["transferencia", "Transferencia"], ["efectivo", "Efectivo"], ["qr", "QR"], ["cheque", "Cheque"], ["tarjeta", "Tarjeta"], ["otro", "Otro"]];

    /* ---------------- Cálculo (sin DOM, se puede probar aparte) ---------------- */

    var pad = function (n) { return String(n).padStart(2, "0"); };
    var iso = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    function norm(s) {
        return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
    }
    function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
    function filas(r) {
        if (Array.isArray(r)) return r;
        if (r && Array.isArray(r.filas)) return r.filas;
        if (r && Array.isArray(r.data)) return r.data;
        if (r && Array.isArray(r.rows)) return r.rows;
        return [];
    }

    /* Rango del mes "AAAA-MM": inicio, fin, mes anterior, días del mes y días transcurridos (si es el mes en curso). */
    function rangoMes(mes, hoy) {
        var p = mes.split("-"), y = Number(p[0]), m = Number(p[1]) - 1;
        var ini = new Date(y, m, 1), fin = new Date(y, m + 1, 0), antIni = new Date(y, m - 1, 1), antFin = new Date(y, m, 0);
        var h = hoy || new Date();
        var enCurso = h.getFullYear() === y && h.getMonth() === m;
        return {
            desde: iso(ini), hasta: iso(fin), ant_desde: iso(antIni), ant_hasta: iso(antFin),
            dias: fin.getDate(), transcurridos: enCurso ? h.getDate() : fin.getDate(), en_curso: enCurso,
            hasta_ventas: enCurso ? iso(h) : iso(fin)
        };
    }

    /* Cuentas del mes + gastos fijos mensuales del mes anterior que todavía no se cargaron (estimados). */
    function costosDelMes(cuentas, r) {
        var delMes = cuentas.filter(function (c) { return c.fecha_emision >= r.desde && c.fecha_emision <= r.hasta; });
        var firma = function (c) { return [norm(c.proveedor), norm(c.concepto).replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic|20\d\d)\b/g, "").replace(/\s+/g, " ").trim(), c.key_sucursal || ""].join("|"); };
        var cargadas = {};
        delMes.forEach(function (c) { cargadas[firma(c)] = true; });
        var estimadas = cuentas.filter(function (c) {
            return c.recurrencia === "mensual" && c.fecha_emision >= r.ant_desde && c.fecha_emision <= r.ant_hasta && !cargadas[firma(c)];
        }).map(function (c) { return Object.assign({}, c, { estimada: true }); });
        return delMes.map(function (c) { return Object.assign({}, c, { estimada: false }); }).concat(estimadas);
    }

    /* Punto de equilibrio por sucursal.
       ventas: [{ grupo (nombre de sucursal), total, ventas (cantidad) }]
       costos: cuentas del mes (con estimadas), cada una con key_sucursal, sucursal, tipo_costo, monto. */
    function puntoEquilibrio(ventas, costos, r) {
        var suc = {}, orden = [];
        function fila(nombre) {
            var k = norm(nombre);
            if (!suc[k]) { suc[k] = { sucursal: String(nombre).trim(), ventas: 0, cantidad: 0, fijos: 0, variables: 0, fijos_gen: 0, variables_gen: 0, estimado: 0 }; orden.push(k); }
            return suc[k];
        }
        ventas.forEach(function (v) {
            var nombre = String(v.grupo == null ? (v.sucursal || "") : v.grupo).trim();
            if (!nombre) return;
            var f = fila(nombre);
            f.ventas += num(v.total);
            f.cantidad += num(v.ventas != null ? v.ventas : v.cantidad);
        });
        var gen = { fijos: 0, variables: 0, estimado: 0 };
        costos.forEach(function (c) {
            var m = num(c.monto), fijo = c.tipo_costo === "fijo";
            if (!c.key_sucursal) {
                if (fijo) gen.fijos += m; else gen.variables += m;
                if (c.estimada) gen.estimado += m;
                return;
            }
            var f = fila(c.sucursal || "Sucursal " + c.key_sucursal);
            if (fijo) f.fijos += m; else f.variables += m;
            if (c.estimada) f.estimado += m;
        });
        var totalVentas = orden.reduce(function (a, k) { return a + suc[k].ventas; }, 0);
        var factor = r.en_curso && r.transcurridos > 0 ? r.dias / r.transcurridos : 1;
        var lista = orden.map(function (k) {
            var f = suc[k];
            var parte = totalVentas > 0 ? f.ventas / totalVentas : (orden.length ? 1 / orden.length : 0);
            f.parte = parte;
            f.fijos_gen = gen.fijos * parte;
            f.variables_gen = gen.variables * parte;
            f.estimado += gen.estimado * parte;
            f.costo_fijo = f.fijos + f.fijos_gen;
            f.costo_variable = f.variables + f.variables_gen;
            f.proyeccion = f.ventas * factor;
            f.ticket = f.cantidad > 0 ? f.ventas / f.cantidad : 0;
            f.pct_variable = f.ventas > 0 ? f.costo_variable / f.ventas : null;
            if (f.costo_fijo <= 0 && f.costo_variable <= 0) {
                f.estado = "sin_costos"; f.pe = null;
            } else if (f.ventas <= 0) {
                f.estado = "sin_ventas"; f.pe = null;
            } else if (f.pct_variable >= 1) {
                f.estado = "no_alcanzable"; f.pe = null;
            } else {
                f.pe = f.costo_fijo / (1 - f.pct_variable);
                f.avance = f.pe > 0 ? f.proyeccion / f.pe : null;
                f.margen = f.proyeccion > 0 ? (f.proyeccion - f.pe) / f.proyeccion : null;
                f.planes = f.ticket > 0 ? Math.ceil(f.pe / f.ticket) : null;
                f.estado = f.proyeccion >= f.pe ? (f.ventas >= f.pe ? "cubierto" : "en_camino") : "bajo";
            }
            return f;
        });
        lista.sort(function (a, b) { return (b.costo_fijo + b.costo_variable) - (a.costo_fijo + a.costo_variable) || b.ventas - a.ventas; });
        var t = lista.reduce(function (a, f) {
            a.ventas += f.ventas; a.proyeccion += f.proyeccion; a.cantidad += f.cantidad;
            a.costo_fijo += f.costo_fijo; a.costo_variable += f.costo_variable; a.estimado += f.estimado; return a;
        }, { ventas: 0, proyeccion: 0, cantidad: 0, costo_fijo: 0, costo_variable: 0, estimado: 0 });
        /* Si no hay sucursales con ventas, los gastos generales no se pueden repartir: se suman al total igual. */
        if (!lista.length) { t.costo_fijo = gen.fijos; t.costo_variable = gen.variables; t.estimado = gen.estimado; }
        t.pct_variable = t.ventas > 0 ? t.costo_variable / t.ventas : null;
        t.pe = t.ventas > 0 && t.pct_variable < 1 ? t.costo_fijo / (1 - t.pct_variable) : null;
        t.avance = t.pe ? t.proyeccion / t.pe : null;
        t.ticket = t.cantidad > 0 ? t.ventas / t.cantidad : 0;
        t.planes = t.pe && t.ticket > 0 ? Math.ceil(t.pe / t.ticket) : null;
        return { sucursales: lista, total: t, general: gen, factor: factor };
    }

    /* Resumen de lo que se debe hoy. */
    function resumenDeuda(pendientes, hoyIso) {
        var en7 = iso(new Date(new Date(hoyIso + "T00:00:00").getTime() + 7 * 86400000));
        return pendientes.reduce(function (a, c) {
            var s = num(c.saldo);
            if (s <= 0) return a;
            a.total += s; a.cantidad++;
            if (c.fecha_vencimiento < hoyIso) { a.vencido += s; a.n_vencidas++; }
            else if (c.fecha_vencimiento <= en7) { a.semana += s; a.n_semana++; }
            return a;
        }, { total: 0, cantidad: 0, vencido: 0, n_vencidas: 0, semana: 0, n_semana: 0 });
    }

    window.CXP_calc = { rangoMes: rangoMes, costosDelMes: costosDelMes, puntoEquilibrio: puntoEquilibrio, resumenDeuda: resumenDeuda, norm: norm };

    /* ---------------- Interfaz ---------------- */

    var raiz = document.getElementById("a-cxp");
    if (!raiz || !window.CM) return;

    var bs = function (v) { return "Bs " + Math.round(num(v)).toLocaleString("es-BO"); };
    var bs2 = function (v) { return "Bs " + num(v).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var pct = function (v) { return v == null ? "—" : Math.round(v * 100) + "%"; };
    var fechaCorta = function (s) { if (!s) return "—"; var p = String(s).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0].slice(2); };
    var $ = function (sel) { return raiz.querySelector(sel); };
    function el(tag, attrs, hijos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === "text") e.textContent = attrs[k];
            else if (k === "class") e.className = attrs[k];
            else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
            else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
        });
        (hijos || []).forEach(function (h) { if (h != null) e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
        return e;
    }
    function opciones(select, lista, valor) {
        select.textContent = "";
        lista.forEach(function (o) { select.appendChild(el("option", { value: o[0], text: o[1], selected: o[0] === valor })); });
    }

    var hoy = function () { return iso(new Date()); };
    var estado = { sucursales: [], pendientes: [], cuentasMes: [], ventas: [], mes: hoy().slice(0, 7), filtro: "pendiente", filtroSuc: "", disponible: true, cargando: false };

    function mostrarError(donde, err) {
        if (err && err.sinSesion) { var av = document.getElementById("cm-sesion"); if (av) av.hidden = false; }
        donde.textContent = err && err.sinSesion ? "Tu sesión de datos venció: vuelve a ingresar." : "No se pudo completar: " + ((err && err.message) || err);
        donde.className = "cxp-msg is-bad";
    }
    function llamar(tool, args) {
        return window.CM.llamar(tool, args || {}).then(function (r) {
            if (r && r.estado === "error") throw new Error(r.error || "error del servidor");
            if (r && r.error && typeof r.error === "string") throw new Error(r.error);
            return r;
        }).catch(function (e) {
            if (tool.indexOf("cuentas_por_pagar") === 0 && /unknown|not found|no existe|desconocid|no encontrad|-32601/i.test(String(e.message))) {
                var x = new Error(tool + ": " + e.message); x.noDisponible = true; throw x;
            }
            throw e;
        });
    }

    /* ----- Carga ----- */
    function cargar() {
        if (estado.cargando) return;
        estado.cargando = true;
        var r = rangoMes(estado.mes);
        $("#cxp-estado").textContent = "Actualizando…";
        $("#cxp-estado").className = "cxp-msg";
        var pSuc = estado.sucursales.length ? Promise.resolve(estado.sucursales)
            : llamar(TOOLS.sucursales).then(function (x) { estado.sucursales = filas(x).map(function (s) { return { key: s.key, descripcion: String(s.descripcion || "").trim() }; }); return estado.sucursales; });
        var pPend = llamar(TOOLS.listar, { estado_pago: "pendiente" }).then(filas);
        var pMes = llamar(TOOLS.listar, { estado_pago: "todas", desde: r.ant_desde, hasta: r.hasta }).then(filas);
        var pVen = llamar(TOOLS.ventas, { desde: r.desde, hasta: r.hasta_ventas, agrupar_por: "sucursal" }).then(filas)
            .catch(function (e) { if (e.sinSesion) throw e; estado.errorVentas = e; return []; });
        Promise.all([pSuc, pPend, pMes, pVen]).then(function (res) {
            estado.disponible = true;
            estado.pendientes = res[1];
            estado.cuentasMes = res[2];
            estado.ventas = res[3];
            $("#cxp-estado").textContent = "Actualizado a las " + new Date().toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
            pintarTodo();
        }).catch(function (e) {
            if (e.noDisponible) {
                estado.disponible = false;
                pintarNoDisponible();
            } else mostrarError($("#cxp-estado"), e);
        }).then(function () { estado.cargando = false; });
    }

    function pintarNoDisponible() {
        raiz.classList.add("is-pendiente");
        $("#cxp-estado").textContent = "El módulo está listo, pero el MCP de Calistenia todavía no tiene las herramientas de cuentas por pagar. Cuando se activen, esta sección se llena sola.";
        $("#cxp-estado").className = "cxp-msg is-warn";
    }

    /* ----- KPIs ----- */
    function pintarKpis() {
        var d = resumenDeuda(estado.pendientes, hoy());
        var r = rangoMes(estado.mes);
        var pe = puntoEquilibrio(estado.ventas, costosDelMes(estado.cuentasMes, r), r);
        $("#cxp-k-total").textContent = bs(d.total);
        $("#cxp-k-total-s").textContent = d.cantidad + (d.cantidad === 1 ? " cuenta pendiente" : " cuentas pendientes");
        $("#cxp-k-venc").textContent = bs(d.vencido);
        $("#cxp-k-venc-s").textContent = d.n_vencidas ? d.n_vencidas + " vencidas: pagar o renegociar" : "Nada vencido";
        $("#cxp-k-venc").parentNode.classList.toggle("is-bad", d.vencido > 0);
        $("#cxp-k-sem").textContent = bs(d.semana);
        $("#cxp-k-sem-s").textContent = d.n_semana ? d.n_semana + " vencen en los próximos 7 días" : "Nada vence esta semana";
        var t = pe.total;
        $("#cxp-k-pe").textContent = t.pe != null ? bs(t.pe) : "—";
        $("#cxp-k-pe-s").textContent = t.pe != null
            ? (r.en_curso ? "Proyección del mes: " + bs(t.proyeccion) + " (" + pct(t.avance) + ")" : "Ventas del mes: " + bs(t.ventas) + " (" + pct(t.avance) + ")")
            : (t.costo_fijo + t.costo_variable > 0 ? "Faltan ventas del mes para calcularlo" : "Carga los gastos del mes para calcularlo");
        var kpe = $("#cxp-k-pe").parentNode;
        kpe.classList.toggle("is-bad", t.avance != null && t.avance < 1);
        kpe.classList.toggle("is-ok", t.avance != null && t.avance >= 1);
    }

    /* ----- Tabla de cuentas ----- */
    function cuentasFiltradas() {
        var r = rangoMes(estado.mes), base;
        if (estado.filtro === "pendiente") base = estado.pendientes;
        else if (estado.filtro === "vencida") base = estado.pendientes.filter(function (c) { return c.fecha_vencimiento < hoy(); });
        else base = estado.cuentasMes.filter(function (c) { return c.fecha_emision >= r.desde && c.fecha_emision <= r.hasta && (estado.filtro === "todas" || num(c.saldo) <= 0); });
        if (estado.filtroSuc === "_general") base = base.filter(function (c) { return !c.key_sucursal; });
        else if (estado.filtroSuc) base = base.filter(function (c) { return c.key_sucursal === estado.filtroSuc; });
        return base.slice().sort(function (a, b) { return String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)) || String(a.proveedor).localeCompare(String(b.proveedor)); });
    }
    function chipEstado(c) {
        var s = num(c.saldo) <= 0 ? ["ok", "Pagada"] : c.fecha_vencimiento < hoy() ? ["bad", "Vencida"] : c.fecha_vencimiento <= iso(new Date(Date.now() + 7 * 86400000)) ? ["warn", "Vence pronto"] : ["muted", "Pendiente"];
        return el("span", { class: "cb-chip cxp-" + s[0], text: s[1] });
    }
    function pintarCuentas() {
        var tb = $("#cxp-tabla tbody"); tb.textContent = "";
        var lista = cuentasFiltradas();
        var cat = {}; CATEGORIAS.forEach(function (c) { cat[c[0]] = c[1]; });
        if (!lista.length) { tb.appendChild(el("tr", {}, [el("td", { colspan: 8, class: "cb-empty", text: estado.filtro === "pendiente" ? "No hay cuentas pendientes." : "No hay cuentas para este filtro." })])); }
        var suma = 0;
        lista.forEach(function (c) {
            suma += num(c.saldo);
            var acciones = el("td", { class: "cb-nowrap" });
            if (num(c.saldo) > 0) acciones.appendChild(el("button", { type: "button", class: "cb-btn", text: "Pagar", onclick: function () { abrirPago(c, tr); } }));
            if (num(c.pagado) <= 0) acciones.appendChild(el("button", { type: "button", class: "cb-btn", text: "Anular", onclick: function () { abrirAnular(c, tr); } }));
            var tr = el("tr", { "data-key": c.key }, [
                el("td", {}, [el("b", { text: c.proveedor }), c.nit ? el("small", { class: "cb-muted", text: " · NIT " + c.nit }) : null,
                    el("div", { class: "cb-muted", text: c.concepto + (c.nro_documento ? " · Doc. " + c.nro_documento : "") })]),
                el("td", {}, [String(c.sucursal || "General").trim(), el("div", { class: "cb-muted", text: (cat[c.categoria] || c.categoria) + " · " + (c.tipo_costo === "fijo" ? "fijo" : "variable") + (c.recurrencia === "mensual" ? " · mensual" : "") })]),
                el("td", { class: "cb-num", text: fechaCorta(c.fecha_vencimiento) }),
                el("td", { class: "cb-num", text: bs2(c.monto) }),
                el("td", { class: "cb-num", text: bs2(c.pagado) }),
                el("td", { class: "cb-num", text: bs2(c.saldo) }),
                el("td", {}, [chipEstado(c)]),
                acciones
            ]);
            tb.appendChild(tr);
        });
        $("#cxp-tabla-total").textContent = lista.length ? lista.length + (lista.length === 1 ? " cuenta" : " cuentas") + " · saldo " + bs2(suma) : "";
    }

    function filaFormulario(tr, contenido) {
        var prev = tr.nextSibling;
        if (prev && prev.classList && prev.classList.contains("cxp-subfila")) prev.remove();
        var fila = el("tr", { class: "cxp-subfila" }, [el("td", { colspan: 8 }, [contenido])]);
        tr.parentNode.insertBefore(fila, tr.nextSibling);
        var primero = fila.querySelector("input, select, textarea"); if (primero) primero.focus();
        return fila;
    }
    function abrirPago(c, tr) {
        var msg = el("p", { class: "cxp-msg", role: "status" });
        var monto = el("input", { type: "number", name: "monto", min: "0.01", step: "0.01", max: num(c.saldo).toFixed(2), value: num(c.saldo).toFixed(2), required: true, "aria-label": "Monto" });
        var fecha = el("input", { type: "date", name: "fecha", value: hoy(), required: true, "aria-label": "Fecha de pago" });
        var forma = el("select", { name: "forma_pago", class: "dash-select", "aria-label": "Forma de pago" }); opciones(forma, FORMAS_PAGO, "transferencia");
        var obs = el("input", { type: "text", name: "observacion", maxlength: "1000", placeholder: "Nº de comprobante u observación", "aria-label": "Observación" });
        var btn = el("button", { type: "submit", class: "cxp-primario", text: "Registrar pago" });
        var form = el("form", { class: "cxp-inline", novalidate: true }, [
            el("strong", { text: "Pago a " + c.proveedor + " · saldo " + bs2(c.saldo) }),
            el("label", {}, ["Monto", monto]), el("label", {}, ["Fecha", fecha]), el("label", {}, ["Forma", forma]), el("label", { class: "cxp-ancho" }, ["Observación", obs]),
            btn, el("button", { type: "button", class: "cb-btn", text: "Cancelar", onclick: function () { fila.remove(); } }), msg
        ]);
        var fila = filaFormulario(tr, form);
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var m = Number(monto.value);
            if (!(m > 0) || m > num(c.saldo) + 1e-9) { msg.textContent = "El monto debe ser mayor a 0 y no superar el saldo (" + bs2(c.saldo) + ")."; msg.className = "cxp-msg is-bad"; return; }
            btn.disabled = true; msg.textContent = "Guardando…"; msg.className = "cxp-msg";
            llamar(TOOLS.pagar, { key_cuenta_pagar: c.key, monto: m.toFixed(2), fecha: fecha.value, forma_pago: forma.value, observacion: obs.value.trim() || undefined })
                .then(function () { fila.remove(); avisar("Pago de " + bs2(m) + " a " + c.proveedor + " registrado."); cargar(); })
                .catch(function (err) { btn.disabled = false; mostrarError(msg, err); });
        });
    }
    function abrirAnular(c, tr) {
        var msg = el("p", { class: "cxp-msg", role: "status" });
        var motivo = el("input", { type: "text", name: "motivo", maxlength: "500", required: true, placeholder: "Ej.: cargada dos veces", "aria-label": "Motivo" });
        var btn = el("button", { type: "submit", class: "cxp-peligro", text: "Anular cuenta" });
        var form = el("form", { class: "cxp-inline", novalidate: true }, [
            el("strong", { text: "Anular " + c.proveedor + " · " + bs2(c.monto) }),
            el("label", { class: "cxp-ancho" }, ["Motivo", motivo]), btn,
            el("button", { type: "button", class: "cb-btn", text: "Cancelar", onclick: function () { fila.remove(); } }), msg
        ]);
        var fila = filaFormulario(tr, form);
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (!motivo.value.trim()) { msg.textContent = "Escribe el motivo."; msg.className = "cxp-msg is-bad"; return; }
            btn.disabled = true; msg.textContent = "Anulando…"; msg.className = "cxp-msg";
            llamar(TOOLS.anular, { key: c.key, motivo: motivo.value.trim() })
                .then(function () { fila.remove(); avisar("Cuenta de " + c.proveedor + " anulada."); cargar(); })
                .catch(function (err) { btn.disabled = false; mostrarError(msg, err); });
        });
    }

    /* ----- Punto de equilibrio ----- */
    function pintarEquilibrio() {
        var r = rangoMes(estado.mes);
        var costos = costosDelMes(estado.cuentasMes, r);
        var pe = puntoEquilibrio(estado.ventas, costos, r);
        var tb = $("#cxp-pe tbody"), tf = $("#cxp-pe tfoot"); tb.textContent = ""; tf.textContent = "";
        var etiqueta = { cubierto: ["ok", "Cubierto"], en_camino: ["warn", "En camino"], bajo: ["bad", "Por debajo"], sin_costos: ["muted", "Sin gastos cargados"], sin_ventas: ["bad", "Sin ventas"], no_alcanzable: ["bad", "Variables ≥ ventas"] };
        if (!pe.sucursales.length) tb.appendChild(el("tr", {}, [el("td", { colspan: 8, class: "cb-empty", text: "Todavía no hay ventas ni gastos para este mes." })]));
        pe.sucursales.forEach(function (f) {
            var e = etiqueta[f.estado];
            var barra = el("div", { class: "cxp-barra", title: pct(f.avance) + " del punto de equilibrio" }, [el("span", { style: "width:" + Math.min(100, Math.max(0, (f.avance || 0) * 100)).toFixed(1) + "%" })]);
            if (f.avance != null && f.avance < 1) barra.classList.add("is-bajo");
            tb.appendChild(el("tr", {}, [
                el("td", {}, [f.sucursal, f.estimado > 0 ? el("div", { class: "cb-muted", text: "incluye " + bs(f.estimado) + " estimados" }) : null]),
                el("td", { class: "cb-num" }, [bs(f.ventas), r.en_curso ? el("div", { class: "cb-muted", text: "proy. " + bs(f.proyeccion) }) : null]),
                el("td", { class: "cb-num" }, [bs(f.costo_fijo), f.fijos_gen > 0 ? el("div", { class: "cb-muted", text: bs(f.fijos_gen) + " generales" }) : null]),
                el("td", { class: "cb-num" }, [bs(f.costo_variable), el("div", { class: "cb-muted", text: pct(f.pct_variable) + " de ventas" })]),
                el("td", { class: "cb-num" }, [f.pe != null ? bs(f.pe) : "—", f.planes ? el("div", { class: "cb-muted", text: "≈ " + f.planes + " planes" }) : null]),
                el("td", { class: "cb-num" }, [pct(f.avance), barra]),
                el("td", { class: "cb-num", text: f.margen != null ? pct(f.margen) : "—" }),
                el("td", {}, [el("span", { class: "cb-chip cxp-" + e[0], text: e[1] })])
            ]));
        });
        var t = pe.total;
        tf.appendChild(el("tr", {}, [
            el("td", {}, [el("b", { text: "Toda la empresa" }), t.estimado > 0 ? el("div", { class: "cb-muted", text: "incluye " + bs(t.estimado) + " estimados" }) : null]),
            el("td", { class: "cb-num" }, [el("b", { text: bs(t.ventas) }), r.en_curso ? el("div", { class: "cb-muted", text: "proy. " + bs(t.proyeccion) }) : null]),
            el("td", { class: "cb-num" }, [el("b", { text: bs(t.costo_fijo) })]),
            el("td", { class: "cb-num" }, [el("b", { text: bs(t.costo_variable) }), el("div", { class: "cb-muted", text: pct(t.pct_variable) + " de ventas" })]),
            el("td", { class: "cb-num" }, [el("b", { text: t.pe != null ? bs(t.pe) : "—" }), t.planes ? el("div", { class: "cb-muted", text: "≈ " + t.planes + " planes" }) : null]),
            el("td", { class: "cb-num" }, [el("b", { text: pct(t.avance) })]),
            el("td", { class: "cb-num", text: t.pe && t.proyeccion > 0 ? pct((t.proyeccion - t.pe) / t.proyeccion) : "—" }),
            el("td", {})
        ]));
        var nota = r.en_curso
            ? "Mes en curso: ventas del 1 al " + r.transcurridos + " y proyección al cierre (" + r.dias + " días). El avance compara la proyección con el punto de equilibrio."
            : "Mes cerrado: ventas y gastos completos del mes.";
        if (pe.general.fijos + pe.general.variables > 0) nota += " Gastos generales (" + bs(pe.general.fijos + pe.general.variables) + ") repartidos según la parte de ventas de cada sucursal.";
        if (estado.errorVentas) nota += " No se pudieron leer las ventas: " + estado.errorVentas.message + ".";
        $("#cxp-pe-nota").textContent = nota;
    }

    function pintarTodo() {
        raiz.classList.remove("is-pendiente");
        pintarKpis(); pintarCuentas(); pintarEquilibrio(); pintarSucursales();
    }

    /* ----- Formulario de registro ----- */
    function pintarSucursales() {
        var sel = $("#cxp-f-suc"), filtro = $("#cxp-filtro-suc");
        var vs = sel.value, vf = filtro.value;
        var lista = [["", "General (toda la empresa / oficina central)"]].concat(estado.sucursales.map(function (s) { return [s.key, s.descripcion]; }));
        opciones(sel, lista, vs);
        opciones(filtro, [["", "Todas las sucursales"], ["_general", "Solo gastos generales"]].concat(estado.sucursales.map(function (s) { return [s.key, s.descripcion]; })), vf);
    }
    function avisar(t) { var m = $("#cxp-aviso"); m.textContent = t; m.className = "cxp-msg is-ok"; clearTimeout(avisar.t); avisar.t = setTimeout(function () { m.textContent = ""; }, 8000); }

    function iniciarFormulario() {
        var f = $("#cxp-form");
        opciones(f.categoria, CATEGORIAS, "alquiler");
        f.fecha_emision.value = hoy();
        f.fecha_vencimiento.value = hoy();
        var sugerirTipo = function () {
            var fijo = ["alquiler", "sueldos", "servicios_basicos", "impuestos", "mantenimiento"].indexOf(f.categoria.value) >= 0;
            f.tipo_costo.value = fijo ? "fijo" : "variable";
            if (["alquiler", "sueldos", "servicios_basicos"].indexOf(f.categoria.value) >= 0) f.recurrencia.value = "mensual";
        };
        f.categoria.addEventListener("change", sugerirTipo);
        sugerirTipo();
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            var msg = $("#cxp-f-msg");
            var datos = {
                proveedor: f.proveedor.value.trim(), nit: f.nit.value.trim() || undefined, concepto: f.concepto.value.trim(),
                categoria: f.categoria.value, tipo_costo: f.tipo_costo.value, recurrencia: f.recurrencia.value,
                key_sucursal: f.key_sucursal.value || undefined, monto: Number(f.monto.value).toFixed(2),
                fecha_emision: f.fecha_emision.value, fecha_vencimiento: f.fecha_vencimiento.value,
                nro_documento: f.nro_documento.value.trim() || undefined, observacion: f.observacion.value.trim() || undefined
            };
            if (!datos.proveedor || !datos.concepto) { msg.textContent = "Escribe el proveedor y el concepto."; msg.className = "cxp-msg is-bad"; return; }
            if (!(Number(datos.monto) > 0)) { msg.textContent = "El monto debe ser mayor a 0."; msg.className = "cxp-msg is-bad"; return; }
            if (!datos.fecha_emision || !datos.fecha_vencimiento) { msg.textContent = "Completa las fechas."; msg.className = "cxp-msg is-bad"; return; }
            if (datos.fecha_vencimiento < datos.fecha_emision) { msg.textContent = "El vencimiento no puede ser anterior a la emisión."; msg.className = "cxp-msg is-bad"; return; }
            if (!estado.disponible) { msg.textContent = "Todavía no se puede guardar: el MCP de Calistenia no tiene las herramientas de cuentas por pagar."; msg.className = "cxp-msg is-warn"; return; }
            var btn = f.querySelector("button[type=submit]");
            btn.disabled = true; msg.textContent = "Guardando…"; msg.className = "cxp-msg";
            llamar(TOOLS.registrar, datos).then(function () {
                var suc = f.key_sucursal.value, cat = f.categoria.value;
                f.reset(); f.key_sucursal.value = suc; f.categoria.value = cat; sugerirTipo();
                f.fecha_emision.value = hoy(); f.fecha_vencimiento.value = hoy();
                msg.textContent = ""; avisar("Cuenta de " + datos.proveedor + " por " + bs2(datos.monto) + " registrada.");
                cargar();
            }).catch(function (err) {
                if (err.noDisponible) { estado.disponible = false; pintarNoDisponible(); }
                mostrarError(msg, err);
            }).then(function () { btn.disabled = false; });
        });
    }

    /* ----- Arranque ----- */
    var inputMes = $("#cxp-mes");
    inputMes.value = estado.mes;
    inputMes.max = hoy().slice(0, 7);
    inputMes.addEventListener("change", function () { if (/^\d{4}-\d{2}$/.test(inputMes.value)) { estado.mes = inputMes.value; cargar(); } });
    $("#cxp-filtro").addEventListener("change", function (e) { estado.filtro = e.target.value; pintarCuentas(); });
    $("#cxp-filtro-suc").addEventListener("change", function (e) { estado.filtroSuc = e.target.value; pintarCuentas(); });
    $("#cxp-actualizar").addEventListener("click", cargar);
    iniciarFormulario();
    cargar();
    setInterval(function () { if (!document.hidden && estado.disponible) cargar(); }, 10 * 60000);
})();
