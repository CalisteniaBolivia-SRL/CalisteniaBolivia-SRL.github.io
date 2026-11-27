/* =====================================================================================================
   Snacks · pantalla. Bolivia y Paraguay (?pais=paraguay), el mismo módulo; cada país lee su ERP S-ERP
   (Bolivia: empresa «Calistenia Bolivia»; Paraguay: «Calistenia Paraguay»). Solo lectura: no escribe en el ERP.
   - Catálogo con precio de venta y de compra y stock de cada almacén (inventario/modelo getAllStock).
   - Ventas de los últimos 45 días, producto por producto (movimientos de caja + cada venta), guardadas en el equipo.
   - Productos de snack = los de clase «inventario» del ERP (bebidas, proteínas, snacks, tienda).
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay", L = window.SNACKS_LOGICA, MON = PY ? "Gs" : "Bs", LOC = PY ? "es-PY" : "es-BO";
    var DIAS_DATOS = 45, K_CACHE = "snk_" + (PY ? "py" : "bo") + "_v1", K_CAT = "snk_cat_" + (PY ? "py" : "bo") + "_v1";
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
    function plata(n) { return MON + " " + Math.round(n || 0).toLocaleString(LOC); }
    function num(n, d) { return (Number(n) || 0).toLocaleString(LOC, { maximumFractionDigits: d || 0 }); }
    function hoy() { return new Intl.DateTimeFormat("en-CA", { timeZone: PY ? "America/Asuncion" : "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 10); }
    function leer(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
    function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function valores(d) { if (!d) return []; return Array.isArray(d) ? d : Object.keys(d).map(function (k) { return d[k]; }); }
    function claveUsuario() { return (window.CM_USUARIO && CM_USUARIO.key_usuario) || ""; }

    var D = { productos: {}, sucursales: {}, almacenes: {}, stock: {}, ventas: leer(K_CACHE) || {}, vista: "resumen", periodo: 30, sucursal: "", diasCompra: 14, orden: "bs" };
    (function () { var c = leer(K_CAT); if (c) { D.productos = c.productos || {}; D.sucursales = c.sucursales || {}; D.almacenes = c.almacenes || {}; D.stock = c.stock || {}; } })();

    /* ---------- datos del ERP ---------- */
    function cargarCatalogo() {
        var E = window.ERP, K = E.KEY_EMPRESA;
        return Promise.all([
            E.pedir({ version: "1.0", service: "empresa", component: "sucursal", type: "getAll", key_empresa: K, key_usuario: claveUsuario() }, 30000),
            E.pedir({ version: "1.0", service: "inventario", component: "almacen", type: "getAll", key_empresa: K, key_usuario: claveUsuario() }, 30000)
        ]).then(function (a) {
            var suc = {}, alm = {};
            valores(a[0].data).forEach(function (s) { if (s && s.key && Number(s.estado == null ? 1 : s.estado) > 0) suc[s.key] = String(s.descripcion || "").trim(); });
            valores(a[1].data).forEach(function (x) { if (x && x.key && x.key_sucursal && Number(x.estado == null ? 1 : x.estado) > 0 && !/p[eé]rdida|error/i.test(x.descripcion || "")) alm[x.key] = x.key_sucursal; });
            D.sucursales = suc; D.almacenes = alm;
            var productos = {}, stock = {}, keys = Object.keys(alm), i = 0;
            function uno() {
                if (i >= keys.length) return Promise.resolve();
                var a = keys[i++];
                return E.pedir({ version: "1.0", service: "inventario", component: "modelo", type: "getAllStock", key_empresa: K, key_usuario: claveUsuario(), key_almacen: a }, 60000).then(function (m) {
                    var st = stock[a] = {};
                    valores(m.data).forEach(function (p) {
                        if (!p || !p.key || Number(p.estado == null ? 1 : p.estado) <= 0) return;
                        var tp = p.tipo_producto || {};
                        if (tp.tipo !== "inventario") return;   // snacks = productos con stock (no paquetes ni servicios)
                        productos[p.key] = { nombre: String(p.descripcion || "").trim(), tipo: tp.descripcion || "", precio: Number(p.precio_venta) || 0, costo: Number(p.precio_compra) || 0 };
                        if (Number(p.stock)) st[p.key] = Number(p.stock);
                    });
                }, function () {}).then(uno);
            }
            return Promise.all([uno(), uno(), uno()]).then(function () {
                D.productos = productos; D.stock = stock;
                guardar(K_CAT, { productos: productos, sucursales: suc, almacenes: alm, stock: stock, fecha: Date.now() });
            });
        });
    }
    /* Ventas: las nuevas (y las anulaciones) desde el último día guardado; la primera vez, los últimos 45 días. */
    function cargarVentas(progreso) {
        var E = window.ERP, h = hoy(), desde = L.sumarDias(h, -(DIAS_DATOS - 1));
        var hay = Object.keys(D.ventas).length > 0;
        var ini = hay ? L.sumarDias(h, -2) : desde;
        return E.movimientos(ini, h).then(function (movs) {
            var nuevas = {};
            movs.forEach(function (mv) {
                var k = mv.key_compra_venta, t = String(mv.tipo || ""); if (!k) return;
                if (t.indexOf("anulacion") === 0) { if (D.ventas[k]) D.ventas[k].anul = 1; else D.ventas[k] = { anul: 1 }; }
                else if ((t === "venta" || t === "amortizacion") && !(D.ventas[k] && D.ventas[k].f)) nuevas[k] = 1;
            });
            var keys = Object.keys(nuevas), i = 0, hechas = 0;
            function una() {
                if (i >= keys.length) return Promise.resolve();
                var k = keys[i++];
                return E.venta(k).then(function (v) {
                    if (!v || !v.key) return;
                    var it = (v.detalle || v.detalles || []).filter(function (d) { return d.estado !== 0; }).map(function (d) { return [d.key_modelo, Number(d.cantidad) || 0, Number(d.precio_unitario) || 0]; });
                    D.ventas[k] = { f: String(v.fecha_on || "").slice(0, 16), s: v.key_sucursal || "", it: it, anul: (v.state !== "vendido" || v.estado === 0 || (D.ventas[k] && D.ventas[k].anul)) ? 1 : 0 };
                }, function () {}).then(function () { hechas++; if (progreso && (hechas % 25 === 0 || hechas === keys.length)) progreso(hechas, keys.length); if (hechas % 200 === 0) limpiarYGuardar(); return una(); });
            }
            return Promise.all([una(), una(), una(), una()]).then(limpiarYGuardar);
        });
    }
    function limpiarYGuardar() {
        var limite = L.sumarDias(hoy(), -(DIAS_DATOS + 5));
        Object.keys(D.ventas).forEach(function (k) { var v = D.ventas[k]; if (v.f && v.f.slice(0, 10) < limite) delete D.ventas[k]; });
        guardar(K_CACHE, D.ventas);
    }
    function listaVentas() { return Object.keys(D.ventas).map(function (k) { return D.ventas[k]; }).filter(function (v) { return v.f; }); }
    function nombreSuc(k) { return D.sucursales[k] || "Sin sucursal"; }
    function stockSuc() { return L.stockPorSucursal(D.stock, D.almacenes); }

    /* ---------- piezas ---------- */
    function kpi(t, v, s) { return el("div", { class: "sn-kpi" }, [el("span", { text: t }), el("b", { text: v }), s ? el("small", { text: s }) : null]); }
    function barras(lista, valor, etiqueta, fmt, max) {
        var l = lista.slice(0, max || 10), top = Math.max.apply(null, l.map(valor).concat([1]));
        return el("ul", { class: "sn-barras" }, l.map(function (x) {
            return el("li", {}, [el("span", { text: etiqueta(x), title: etiqueta(x) }), el("span", { class: "sn-pista" }, [el("i", { style: "width:" + Math.max(2, valor(x) / top * 100) + "%" })]), el("b", { text: fmt(valor(x)) })]);
        }));
    }
    function selPeriodo() {
        var s = el("select", { "aria-label": "Período" }, [[7, "Últimos 7 días"], [30, "Últimos 30 días"], [DIAS_DATOS, "Últimos " + DIAS_DATOS + " días"]].map(function (p) { return el("option", { value: p[0], text: p[1], selected: D.periodo === p[0] }); }));
        s.addEventListener("change", function () { D.periodo = Number(s.value); pintar(); }); return s;
    }
    function selSucursal(conTodas) {
        var ks = Object.keys(stockSuc()).concat(L.porSucursal(listaVentas(), D.productos, L.sumarDias(hoy(), -29), hoy()).map(function (x) { return x.key; }));
        var unicas = ks.filter(function (k, i) { return k && ks.indexOf(k) === i && D.sucursales[k]; }).sort(function (a, b) { return nombreSuc(a).localeCompare(nombreSuc(b)); });
        if (!conTodas && !D.sucursal && unicas.length) D.sucursal = unicas[0];
        var opts = (conTodas ? [el("option", { value: "", text: "Todas las sucursales" })] : []).concat(unicas.map(function (k) { return el("option", { value: k, text: nombreSuc(k), selected: D.sucursal === k }); }));
        var s = el("select", { "aria-label": "Sucursal" }, opts); s.value = D.sucursal;
        s.addEventListener("change", function () { D.sucursal = s.value; pintar(); }); return s;
    }

    /* ---------- vistas ---------- */
    function vistaResumen() {
        var h = hoy(), V = listaVentas(), P = D.productos, d = D.periodo, desde = L.sumarDias(h, -(d - 1));
        var tHoy = L.totales(V, P, h, h), tPer = L.totales(V, P, desde, h), tAnt = L.totales(V, P, L.sumarDias(desde, -d), L.sumarDias(desde, -1));
        /* Solo se compara si el período anterior entra completo en lo leído (45 días). */
        var cambio = tAnt.bs && d * 2 <= DIAS_DATOS ? Math.round((tPer.bs - tAnt.bs) / tAnt.bs * 100) : null;
        var w = el("div", {}, [el("div", { class: "sn-fila" }, [selPeriodo()])]);
        w.appendChild(el("div", { class: "sn-kpis" }, [
            kpi("Hoy", plata(tHoy.bs), num(tHoy.unidades) + " unidades · " + num(tHoy.tickets) + " tickets"),
            kpi("Últimos " + d + " días", plata(tPer.bs), cambio != null ? (cambio > 0 ? "+" : "") + cambio + " % vs los " + d + " días anteriores" : num(tPer.unidades) + " unidades"),
            kpi("Ganancia bruta", plata(tPer.ganancia), tPer.margen != null ? "Margen " + tPer.margen + " %" + (tPer.sinCosto ? " · " + plata(tPer.sinCosto) + " sin costo cargado" : "") : "Faltan costos en el ERP"),
            kpi("Ticket promedio", plata(tPer.ticket), num(tPer.tickets) + " tickets con snacks")
        ]));
        var suc = L.porSucursal(V, P, desde, h), prods = L.porProducto(V, P, desde, h), hs = L.porHora(V, P, desde, h), maxH = Math.max.apply(null, hs.map(function (x) { return x.bs; }).concat([1]));
        w.appendChild(el("div", { class: "sn-grid" }, [
            el("section", { class: "op-card" }, [el("h2", { text: "Por sucursal" }), suc.length ? barras(suc, function (x) { return x.bs; }, function (x) { return nombreSuc(x.key); }, plata, 20) : el("p", { class: "op-vacio", text: "Sin ventas en el período." })]),
            el("section", { class: "op-card" }, [el("h2", { text: "Lo que más se vende" }), prods.length ? barras(prods, function (x) { return x.bs; }, function (x) { return x.nombre; }, plata, 10) : el("p", { class: "op-vacio", text: "Sin ventas en el período." })]),
            el("section", { class: "op-card" }, [el("h2", { text: "Cuándo se vende (por hora)" }),
                el("div", { class: "sn-horas" }, hs.map(function (x) { return el("i", { style: "height:" + (x.bs / maxH * 100) + "%", title: x.hora + " h · " + plata(x.bs) }); })),
                el("div", { class: "sn-horas-et" }, hs.map(function (x) { return el("span", { text: x.hora % 3 === 0 ? String(x.hora) : "" }); }))])
        ]));
        return w;
    }
    function vistaProductos() {
        var h = hoy(), V = listaVentas(), P = D.productos, d = D.periodo, desde = L.sumarDias(h, -(d - 1));
        var lista = L.abc(L.porProducto(V, P, desde, h, D.sucursal || null)), tend = L.tendencia(V, P, h), st = stockSuc(), total = {};
        Object.keys(st).forEach(function (s) { if (D.sucursal && s !== D.sucursal) return; Object.keys(st[s]).forEach(function (k) { total[k] = (total[k] || 0) + st[s][k]; }); });
        /* También los que tienen stock y no se vendieron. */
        Object.keys(total).forEach(function (k) { if (P[k] && total[k] > 0 && !lista.some(function (x) { return x.key === k; })) lista.push({ key: k, nombre: P[k].nombre, tipo: P[k].tipo, unidades: 0, bs: 0, diario: 0, ganancia: null, margen: P[k].costo > 0 && P[k].precio > 0 ? Math.round((P[k].precio - P[k].costo) / P[k].precio * 100) : null, clase: "C" }); });
        var ord = { bs: function (a, b) { return b.bs - a.bs; }, unidades: function (a, b) { return b.unidades - a.unidades; }, margen: function (a, b) { return (b.margen == null ? -999 : b.margen) - (a.margen == null ? -999 : a.margen); }, stock: function (a, b) { return (total[b.key] || 0) - (total[a.key] || 0); }, nombre: function (a, b) { return a.nombre.localeCompare(b.nombre); } };
        lista.sort(ord[D.orden] || ord.bs);
        var th = function (t, k, n) { return el("th", { class: n ? "n" : "", text: t + (D.orden === k ? " ▾" : ""), onclick: function () { D.orden = k; pintar(); } }); };
        var t = el("table", { class: "sn-tabla" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "ABC" }), th("Producto", "nombre"), th("Unidades", "unidades", 1), th("Ventas", "bs", 1), el("th", { class: "n", text: "Por día" }), th("Margen", "margen", 1), el("th", { class: "n", text: "Tendencia" }), th("Stock", "stock", 1), el("th", { class: "n", text: "Precio / costo" })])])]);
        var tb = el("tbody");
        lista.forEach(function (x) {
            var p = P[x.key], tr = tend[x.key];
            tb.appendChild(el("tr", {}, [el("td", {}, [el("span", { class: "sn-clase " + x.clase, text: x.clase })]), el("td", {}, [x.nombre, el("br"), el("small", { class: "op-muted", text: x.tipo })]),
                el("td", { class: "n", text: num(x.unidades) }), el("td", { class: "n", text: plata(x.bs) }), el("td", { class: "n", text: num(x.diario, 1) }),
                el("td", { class: "n" + (x.margen != null && x.margen < 20 ? " sn-baja" : ""), text: x.margen != null ? x.margen + " %" : "—" }),
                el("td", { class: "n " + (tr > 0 ? "sn-sube" : tr < 0 ? "sn-baja" : ""), text: tr == null ? "—" : (tr > 0 ? "+" : "") + tr + " %" }),
                el("td", { class: "n", text: num(total[x.key] || 0) }), el("td", { class: "n", text: (p.precio ? num(p.precio, 2) : "—") + " / " + (p.costo ? num(p.costo, 2) : "—") })]));
        });
        t.appendChild(tb);
        return el("div", {}, [el("div", { class: "sn-fila" }, [selPeriodo(), selSucursal(true)]),
            el("p", { class: "op-muted", text: "A = los que hacen el 80 % de lo vendido (que nunca falten); C = los que casi no se venden. Tendencia: últimos 15 días contra los 15 anteriores." }),
            el("div", { class: "sn-wrap" }, [t])]);
    }
    var ALERTA = { sin_stock: ["Sin stock", "bad"], se_agota: ["Se agota", "warn"], parado: ["Parado", ""], sobra: ["Sobra", ""] };
    function vistaInventario() {
        var h = hoy(), w = el("div", {}, [el("div", { class: "sn-fila" }, [selSucursal(false)])]);
        if (!D.sucursal) { w.appendChild(el("p", { class: "op-vacio", text: "Sin sucursales con stock." })); return w; }
        var inv = L.inventario(listaVentas(), D.productos, stockSuc()[D.sucursal] || {}, h, D.sucursal);
        var cuenta = function (a) { return inv.filter(function (x) { return x.alerta === a; }).length; };
        var valor = inv.reduce(function (s, x) { return s + (x.costo > 0 ? x.stock * x.costo : 0); }, 0);
        w.appendChild(el("div", { class: "sn-kpis" }, [kpi("Sin stock", num(cuenta("sin_stock")), "se venden y no hay"), kpi("Se agotan", num(cuenta("se_agota")), "en menos de 3 días"), kpi("Parados", num(cuenta("parado")), "con stock y sin venta en 30 días"), kpi("Stock a costo", plata(valor), "plata en la heladera y el estante")]));
        var t = el("table", { class: "sn-tabla" }, [el("thead", {}, [el("tr", {}, ["Producto", "Stock", "Vende por día", "Alcanza", "Estado"].map(function (x, i) { return el("th", { class: i ? "n" : "", text: x }); }))])]), tb = el("tbody");
        inv.forEach(function (x) {
            var a = ALERTA[x.alerta];
            tb.appendChild(el("tr", {}, [el("td", { text: x.nombre }), el("td", { class: "n", text: num(x.stock) }), el("td", { class: "n", text: num(x.diario, 1) }),
                el("td", { class: "n", text: x.cobertura == null ? "—" : x.cobertura > 99 ? "+99 días" : num(x.cobertura, 0) + " días" }),
                el("td", { class: "n" }, [a ? el("span", { class: "op-chip" + (a[1] ? " is-" + a[1] : ""), text: a[0] }) : el("span", { class: "op-chip is-ok", text: "Bien" })])]));
        });
        t.appendChild(tb); w.appendChild(el("div", { class: "sn-wrap" }, [t]));
        return w;
    }
    function vistaComprar() {
        var h = hoy(), st = stockSuc(), dias = D.diasCompra;
        var selD = el("select", { "aria-label": "Días a cubrir" }, [7, 14, 21, 30].map(function (n) { return el("option", { value: n, text: "Cubrir " + n + " días", selected: n === dias }); }));
        selD.addEventListener("change", function () { D.diasCompra = Number(selD.value); pintar(); });
        var w = el("div", {}, [el("div", { class: "sn-fila" }, [selD]), el("p", { class: "op-muted", text: "Cantidad sugerida = lo que se vende por día (últimos 30 días) × los días a cubrir − el stock de hoy. Antes de comprar, revisá «Consejos»: a veces conviene traspasar de otra sucursal." })]);
        var sucs = Object.keys(D.sucursales).filter(function (s) { return st[s] || L.porSucursal(listaVentas(), D.productos, L.sumarDias(h, -29), h).some(function (x) { return x.key === s; }); }).sort(function (a, b) { return nombreSuc(a).localeCompare(nombreSuc(b)); });
        var texto = [], totalCosto = 0, totalU = 0, cards = [];
        sucs.forEach(function (s) {
            var c = L.sugerirCompra(L.inventario(listaVentas(), D.productos, st[s] || {}, h, s), dias);
            if (!c.length) return;
            var costo = c.reduce(function (t, x) { return t + (x.costo || 0); }, 0), u = c.reduce(function (t, x) { return t + x.cantidad; }, 0);
            totalCosto += costo; totalU += u;
            texto.push("*" + nombreSuc(s) + "*"); c.forEach(function (x) { texto.push("- " + x.nombre + ": " + x.cantidad); }); texto.push("");
            cards.push(el("section", { class: "op-card" }, [el("h2", { text: nombreSuc(s) + " · " + num(u) + " unidades · " + plata(costo) }),
                el("table", { class: "sn-tabla" }, [el("tbody", {}, c.map(function (x) { return el("tr", {}, [el("td", { text: x.nombre }), el("td", { class: "n", text: num(x.cantidad) }), el("td", { class: "n op-muted", text: "hay " + num(x.stock) + " · vende " + num(x.diario, 1) + "/día" }), el("td", { class: "n", text: x.costo != null ? plata(x.costo) : "—" })]); }))])]));
        });
        w.appendChild(el("div", { class: "sn-kpis" }, [kpi("A comprar", num(totalU) + " unidades", "en " + cards.length + " sucursales"), kpi("Costo estimado", plata(totalCosto), "con el precio de compra del ERP")]));
        var copiar = el("button", { type: "button", class: "op-btn is-fuerte", text: "Copiar la lista (para WhatsApp)" });
        copiar.addEventListener("click", function () { var tx = "Compra de snacks · cubrir " + dias + " días\n\n" + texto.join("\n"); (navigator.clipboard ? navigator.clipboard.writeText(tx) : Promise.reject()).then(function () { copiar.textContent = "Copiada"; }, function () { prompt("Copiá la lista:", tx); }); });
        if (cards.length) w.appendChild(el("div", { class: "op-acc" }, [copiar]));
        w.appendChild(cards.length ? el("div", { class: "sn-grid" }, cards) : el("p", { class: "op-vacio", text: "No hace falta comprar nada para cubrir " + dias + " días." }));
        return w;
    }
    var TIPO = { precio: "Precio", faltante: "Stock", traspaso: "Traspaso", promo: "Promoción", combo: "Combo", estrella: "Estrella", tendencia: "Tendencia", horario: "Horario" };
    function vistaConsejos() {
        var c = L.consejos({ ventas: listaVentas(), productos: D.productos, hoy: hoy(), stockSuc: stockSuc(), nombreSucursal: nombreSuc });
        var w = el("div", {}, [el("p", { class: "op-muted", text: "Salen solos de las ventas, el stock y los precios del ERP. Rojo: hacer ya; amarillo: esta semana; gris: ideas para vender más." })]);
        if (!c.length) { w.appendChild(el("p", { class: "op-vacio", text: "Todo en orden por ahora." })); return w; }
        w.appendChild(el("div", { class: "sn-consejos" }, c.slice(0, 60).map(function (x) {
            return el("article", { class: "sn-consejo p" + x.prioridad }, [el("span", { class: "op-chip", text: TIPO[x.tipo] || x.tipo }), el("b", { text: x.titulo }), el("p", { text: x.detalle })]);
        })));
        return w;
    }
    function tabs() {
        var t = $("sn-tabs"); t.textContent = "";
        [["resumen", "Resumen"], ["productos", "Productos"], ["inventario", "Inventario"], ["comprar", "Qué comprar"], ["consejos", "Consejos"]].forEach(function (x) {
            var b = el("button", { type: "button", role: "tab", class: D.vista === x[0] ? "is-on" : "", "aria-selected": D.vista === x[0] ? "true" : "false", text: x[1] });
            b.addEventListener("click", function () { D.vista = x[0]; if (x[0] === "comprar" || x[0] === "consejos") D.sucursal = D.sucursal; pintar(); try { history.replaceState(null, "", location.pathname + location.search + "#" + x[0]); } catch (e) {} });
            t.appendChild(b);
        });
    }
    function pintar() {
        tabs();
        var v = $("sn-vista"); v.textContent = "";
        if (!Object.keys(D.productos).length) { v.appendChild(el("p", { class: "op-vacio", text: "Cargando el catálogo del ERP…" })); return; }
        if (D.vista === "inventario") D.sucursal = D.sucursal || "";
        v.appendChild(D.vista === "productos" ? vistaProductos() : D.vista === "inventario" ? vistaInventario() : D.vista === "comprar" ? vistaComprar() : D.vista === "consejos" ? vistaConsejos() : vistaResumen());
    }

    /* ---------- arranque ---------- */
    if (PY) $("sn-eyebrow").textContent = "Calistenia Company · Paraguay · Snacks";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    var h0 = location.hash.slice(1); if (["resumen", "productos", "inventario", "comprar", "consejos"].indexOf(h0) >= 0) D.vista = h0;
    pintar();
    if (!window.ERP) { msg("No se pudo cargar la conexión con el ERP.", "bad"); return; }
    msg(Object.keys(D.ventas).length ? "Actualizando con el ERP…" : "Leyendo el catálogo y el stock del ERP…");
    cargarCatalogo().then(function () {
        pintar();
        var primera = !Object.keys(D.ventas).length;
        if (primera) msg("Leyendo las ventas de los últimos " + DIAS_DATOS + " días (la primera vez tarda unos minutos; después queda guardado)…");
        return cargarVentas(function (h, t) { msg("Leyendo ventas: " + h + " de " + t + "…"); if (h % 200 === 0) pintar(); });
    }).then(function () {
        msg(""); pintar();
        setInterval(function () { if (document.hidden) return; cargarVentas().then(pintar, function () {}); }, 120000);
        setInterval(function () { if (document.hidden) return; cargarCatalogo().then(pintar, function () {}); }, 15 * 60000);
    }, function (e) { msg("No se pudo leer el ERP (" + ((e && e.message) || "sin conexión") + "). Se muestra lo último guardado.", "warn"); pintar(); });
})();
