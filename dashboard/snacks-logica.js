/* =====================================================================================================
   Snacks · reglas (sin interfaz ni datos: se prueban solas con Node). Bolivia y Paraguay usan las mismas reglas.
   Entradas:
     productos: { key: { nombre, tipo, precio, costo } }               (catálogo del ERP, solo productos de inventario)
     stock:     { key_almacen: { key_modelo: cantidad } }  + almacenes: { key_almacen: key_sucursal }
     ventas:    [{ f: "AAAA-MM-DDTHH:MM", s: key_sucursal, it: [[key_modelo, cantidad, precio_unitario]], anul }]
   ===================================================================================================== */
(function (raiz) {
    "use strict";
    function dia(f) { return String(f).slice(0, 10); }
    function hora(f) { return parseInt(String(f).slice(11, 13), 10); }
    function sumarDias(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
    function vigentes(ventas, desde, hasta) { return (ventas || []).filter(function (v) { var d = dia(v.f); return !v.anul && d >= desde && d <= hasta; }); }

    /* Totales de un período, solo productos del catálogo de snacks. */
    function totales(ventas, productos, desde, hasta) {
        var r = { bs: 0, unidades: 0, costo: 0, tickets: 0, sinCosto: 0 };
        vigentes(ventas, desde, hasta).forEach(function (v) {
            var hay = false;
            v.it.forEach(function (l) {
                var p = productos[l[0]]; if (!p) return; hay = true;
                var bs = l[1] * l[2]; r.bs += bs; r.unidades += l[1];
                if (p.costo > 0) r.costo += l[1] * p.costo; else r.sinCosto += bs;
            });
            if (hay) r.tickets++;
        });
        r.ganancia = r.bs - r.costo - r.sinCosto;   // lo que no tiene costo cargado no se cuenta como ganancia
        r.margen = r.bs - r.sinCosto > 0 ? Math.round(r.ganancia / (r.bs - r.sinCosto) * 100) : null;
        r.ticket = r.tickets ? r.bs / r.tickets : 0;
        return r;
    }

    /* Por producto (y opcionalmente por sucursal): unidades, Bs y venta diaria. */
    function porProducto(ventas, productos, desde, hasta, sucursal) {
        var m = {}, dias = Math.max(1, (new Date(hasta) - new Date(desde)) / 864e5 + 1);
        vigentes(ventas, desde, hasta).forEach(function (v) {
            if (sucursal && v.s !== sucursal) return;
            v.it.forEach(function (l) {
                var p = productos[l[0]]; if (!p) return;
                var x = m[l[0]] || (m[l[0]] = { key: l[0], nombre: p.nombre, tipo: p.tipo, unidades: 0, bs: 0 });
                x.unidades += l[1]; x.bs += l[1] * l[2];
            });
        });
        return Object.keys(m).map(function (k) {
            var x = m[k], p = productos[k];
            x.diario = x.unidades / dias;
            x.ganancia = p.costo > 0 ? x.bs - x.unidades * p.costo : null;
            x.margen = p.costo > 0 && x.bs > 0 ? Math.round(x.ganancia / x.bs * 100) : null;
            return x;
        }).sort(function (a, b) { return b.bs - a.bs; });
    }

    /* Clasificación ABC: A = productos que juntos hacen el 80 % de lo vendido, B = el 15 % siguiente, C = el resto. */
    function abc(lista) {
        var total = lista.reduce(function (s, x) { return s + x.bs; }, 0), acum = 0;
        lista.slice().sort(function (a, b) { return b.bs - a.bs; }).forEach(function (x) {
            acum += x.bs; var p = total ? acum / total : 1;
            x.clase = p <= 0.8 || acum === x.bs ? "A" : p <= 0.95 ? "B" : "C";
        });
        return lista;
    }

    /* Tendencia: últimos 15 días contra los 15 anteriores (por producto). */
    function tendencia(ventas, productos, hoy) {
        var a = porProducto(ventas, productos, sumarDias(hoy, -14), hoy), b = porProducto(ventas, productos, sumarDias(hoy, -29), sumarDias(hoy, -15)), m = {};
        b.forEach(function (x) { m[x.key] = x.unidades; });
        var r = {}; a.forEach(function (x) { var ant = m[x.key] || 0; r[x.key] = ant ? Math.round((x.unidades - ant) / ant * 100) : null; });
        b.forEach(function (x) { if (!(x.key in r)) r[x.key] = -100; });
        return r;
    }

    /* Stock por sucursal: { key_sucursal: { key_modelo: cantidad } } */
    function stockPorSucursal(stock, almacenes) {
        var r = {};
        Object.keys(stock || {}).forEach(function (a) {
            var s = almacenes[a]; if (!s) return;
            var m = r[s] || (r[s] = {});
            Object.keys(stock[a]).forEach(function (k) { m[k] = (m[k] || 0) + (Number(stock[a][k]) || 0); });
        });
        return r;
    }

    /* Inventario de una sucursal: stock, venta diaria (30 días) y días de cobertura, con alertas. */
    function inventario(ventas, productos, stockSuc, hoy, sucursal) {
        var vendidos = {}; porProducto(ventas, productos, sumarDias(hoy, -29), hoy, sucursal).forEach(function (x) { vendidos[x.key] = x; });
        var keys = {}; Object.keys(stockSuc || {}).forEach(function (k) { if (productos[k]) keys[k] = 1; }); Object.keys(vendidos).forEach(function (k) { keys[k] = 1; });
        return Object.keys(keys).map(function (k) {
            var st = (stockSuc || {})[k] || 0, v = vendidos[k], diario = v ? v.diario : 0;
            var cob = diario > 0 ? st / diario : null, alerta = null;
            if (st <= 0 && diario > 0) alerta = "sin_stock";
            else if (cob != null && cob < 3) alerta = "se_agota";
            else if (st > 0 && !diario) alerta = "parado";
            else if (cob != null && cob > 60) alerta = "sobra";
            return { key: k, nombre: productos[k].nombre, stock: st, diario: diario, cobertura: cob, alerta: alerta, costo: productos[k].costo };
        }).sort(function (a, b) { var o = { sin_stock: 0, se_agota: 1, sobra: 2, parado: 3 }; return ((o[a.alerta] != null ? o[a.alerta] : 9) - (o[b.alerta] != null ? o[b.alerta] : 9)) || b.diario - a.diario; });
    }

    /* Compra sugerida para cubrir N días: (venta diaria × días) − stock, redondeado hacia arriba. */
    function sugerirCompra(inv, dias) {
        dias = dias || 14;
        return inv.map(function (x) {
            var falta = Math.ceil(x.diario * dias - Math.max(0, x.stock));
            return falta > 0 ? { key: x.key, nombre: x.nombre, cantidad: falta, costo: x.costo > 0 ? falta * x.costo : null, stock: x.stock, diario: x.diario } : null;
        }).filter(Boolean).sort(function (a, b) { return b.cantidad - a.cantidad; });
    }

    /* Productos que se compran juntos (mismo ticket). */
    function pares(ventas, productos, desde, hasta) {
        var m = {};
        vigentes(ventas, desde, hasta).forEach(function (v) {
            var ks = []; v.it.forEach(function (l) { if (productos[l[0]] && ks.indexOf(l[0]) < 0) ks.push(l[0]); });
            ks.sort();
            for (var i = 0; i < ks.length; i++) for (var j = i + 1; j < ks.length; j++) { var k = ks[i] + "|" + ks[j]; m[k] = (m[k] || 0) + 1; }
        });
        return Object.keys(m).map(function (k) { var p = k.split("|"); return { a: productos[p[0]].nombre, b: productos[p[1]].nombre, veces: m[k] }; })
            .filter(function (x) { return x.veces >= 3; }).sort(function (a, b) { return b.veces - a.veces; });
    }

    /* Ventas por hora del día (para saber cuándo se vende). */
    function porHora(ventas, productos, desde, hasta) {
        var h = []; for (var i = 0; i < 24; i++) h.push({ hora: i, bs: 0, tickets: 0 });
        vigentes(ventas, desde, hasta).forEach(function (v) {
            var bs = 0; v.it.forEach(function (l) { if (productos[l[0]]) bs += l[1] * l[2]; });
            if (bs > 0) { var x = h[hora(v.f)]; if (x) { x.bs += bs; x.tickets++; } }
        });
        return h;
    }
    function porSucursal(ventas, productos, desde, hasta) {
        var m = {};
        vigentes(ventas, desde, hasta).forEach(function (v) {
            var bs = 0, u = 0; v.it.forEach(function (l) { if (productos[l[0]]) { bs += l[1] * l[2]; u += l[1]; } });
            if (!bs) return; var x = m[v.s] || (m[v.s] = { key: v.s, bs: 0, unidades: 0, tickets: 0 }); x.bs += bs; x.unidades += u; x.tickets++;
        });
        return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.bs - a.bs; });
    }

    /* Consejos: qué hacer para vender más y mover el inventario. Cada uno: { tipo, prioridad (1 alta), titulo, detalle } */
    function consejos(ctx) {
        var out = [], P = ctx.productos, hoy = ctx.hoy, nombreSuc = ctx.nombreSucursal || function (k) { return k; };
        var lista = abc(porProducto(ctx.ventas, P, sumarDias(hoy, -29), hoy));
        /* 1. Precios a pérdida o con margen muy bajo */
        Object.keys(P).forEach(function (k) {
            var p = P[k];
            if (p.precio > 0 && p.costo > 0 && p.precio <= p.costo) out.push({ tipo: "precio", prioridad: 1, titulo: "Se vende a pérdida: " + p.nombre, detalle: "Cuesta " + p.costo + " y se vende a " + p.precio + ". Revisá el precio en el ERP." });
            else if (p.precio > 0 && p.costo > 0 && (p.precio - p.costo) / p.precio < 0.2 && lista.some(function (x) { return x.key === k; })) out.push({ tipo: "precio", prioridad: 2, titulo: "Margen bajo: " + p.nombre, detalle: "Gana " + Math.round((p.precio - p.costo) / p.precio * 100) + " % (cuesta " + p.costo + ", se vende a " + p.precio + "). Subir un poco el precio o negociar con el proveedor." });
        });
        /* 2. Los que más venden: que nunca falten */
        lista.filter(function (x) { return x.clase === "A"; }).slice(0, 5).forEach(function (x) {
            out.push({ tipo: "estrella", prioridad: 3, titulo: "Estrella: " + x.nombre, detalle: "Es de los que hacen el 80 % de la venta. Que nunca falte y que esté a la vista en caja." });
        });
        /* 3. Faltantes y parados por sucursal; traspasos */
        var sobran = {}, faltan = {};
        Object.keys(ctx.stockSuc || {}).forEach(function (s) {
            inventario(ctx.ventas, P, ctx.stockSuc[s], hoy, s).forEach(function (x) {
                if (x.alerta === "sin_stock") { out.push({ tipo: "faltante", prioridad: 1, titulo: "Sin stock en " + nombreSuc(s) + ": " + x.nombre, detalle: "Se vende " + x.diario.toFixed(1) + " por día y no hay. Se pierden ventas." }); (faltan[x.key] = faltan[x.key] || []).push(s); }
                else if (x.alerta === "se_agota") { out.push({ tipo: "faltante", prioridad: 2, titulo: "Se agota en " + nombreSuc(s) + ": " + x.nombre, detalle: "Quedan " + x.stock + " (alcanza " + Math.max(0, x.cobertura).toFixed(1) + " días)." }); (faltan[x.key] = faltan[x.key] || []).push(s); }
                else if (x.alerta === "parado" && x.stock >= 5) (sobran[x.key] = sobran[x.key] || []).push({ s: s, stock: x.stock });
                else if (x.alerta === "sobra") (sobran[x.key] = sobran[x.key] || []).push({ s: s, stock: x.stock });
            });
        });
        Object.keys(sobran).forEach(function (k) {
            var donde = sobran[k], aDonde = faltan[k];
            if (aDonde && aDonde.length) out.push({ tipo: "traspaso", prioridad: 2, titulo: "Traspasar " + P[k].nombre, detalle: "Sobra en " + donde.map(function (d) { return nombreSuc(d.s) + " (" + d.stock + ")"; }).join(", ") + " y falta en " + aDonde.map(nombreSuc).join(", ") + ". Moverlo antes de comprar más." });
            else {
                var n = donde.reduce(function (t, d) { return t + d.stock; }, 0);
                if (n >= 10) out.push({ tipo: "promo", prioridad: 3, titulo: "Mover stock parado: " + P[k].nombre, detalle: n + " unidades sin venta en 30 días (" + donde.map(function (d) { return nombreSuc(d.s); }).join(", ") + "). Probar 2×1, combo con un producto estrella o precio especial por una semana." });
            }
        });
        /* 4. Combos naturales */
        pares(ctx.ventas, P, sumarDias(hoy, -29), hoy).slice(0, 3).forEach(function (x) {
            out.push({ tipo: "combo", prioridad: 3, titulo: "Combo: " + x.a + " + " + x.b, detalle: "Se compraron juntos " + x.veces + " veces en 30 días. Armar un combo con precio redondo y ofrecerlo en caja." });
        });
        /* 5. Tendencias */
        var t = tendencia(ctx.ventas, P, hoy);
        lista.forEach(function (x) {
            if (t[x.key] != null && t[x.key] <= -40 && x.unidades >= 10) out.push({ tipo: "tendencia", prioridad: 2, titulo: "Cae la venta de " + x.nombre, detalle: "Vendió " + Math.abs(t[x.key]) + " % menos en los últimos 15 días. Revisar stock, precio o exhibición." });
            else if (t[x.key] != null && t[x.key] >= 50 && x.unidades >= 10) out.push({ tipo: "tendencia", prioridad: 3, titulo: "Sube la venta de " + x.nombre, detalle: "Vendió " + t[x.key] + " % más en los últimos 15 días. Asegurar stock en todas las sucursales." });
        });
        /* 6. Horario */
        var h = porHora(ctx.ventas, P, sumarDias(hoy, -29), hoy).filter(function (x) { return x.bs > 0; }).sort(function (a, b) { return b.bs - a.bs; });
        if (h.length >= 2) out.push({ tipo: "horario", prioridad: 3, titulo: "Horas fuertes: " + h.slice(0, 3).map(function (x) { return x.hora + " h"; }).join(", "), detalle: "Es cuando más se vende. Heladera llena y productos a la vista antes de esas horas; ofrecer al cobrar el paquete." });
        return out.sort(function (a, b) { return a.prioridad - b.prioridad; });
    }

    var API = { totales: totales, porProducto: porProducto, abc: abc, tendencia: tendencia, stockPorSucursal: stockPorSucursal, inventario: inventario, sugerirCompra: sugerirCompra, pares: pares, porHora: porHora, porSucursal: porSucursal, consejos: consejos, sumarDias: sumarDias };
    if (typeof module !== "undefined" && module.exports) module.exports = API;
    raiz.SNACKS_LOGICA = API;
})(typeof window !== "undefined" ? window : this);
