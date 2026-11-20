/* Comisiones de los ATC (para Administración y Dirección, que las pagan): por cada ATC, clientes contactados,
   clientes que volvieron (Bs 5 cada uno), conversión y total a pagar del mes. Mismos datos que ve ATC Central. */
(function () {
    "use strict";
    var raiz = document.getElementById("a-comisiones");
    if (!raiz || !window.CM) return;
    var $ = function (s) { return raiz.querySelector(s); };
    var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
    var bs = function (v) { return "Bs " + Math.round(num(v)).toLocaleString("es-BO"); };
    var iso = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    function texto(n, t) { var e = document.createElement(n); e.textContent = t; return e; }
    function cargar() {
        var mes = $("#com-mes").value || iso(new Date()).slice(0, 7), p = mes.split("-");
        var ini = new Date(+p[0], +p[1] - 1, 1), fin = new Date(+p[0], +p[1], 0), hoy = new Date();
        var desde = iso(ini), hasta = iso(fin < hoy ? fin : hoy);
        $("#com-estado").textContent = "Cargando…";
        window.CM.llamar("comercial_resumen", { desde: desde, hasta: hasta }).then(function (r) {
            var filas = ((r && r.filas) || []).slice().sort(function (a, b) { return num(b.comision) - num(a.comision) || num(b.contactados) - num(a.contactados); });
            var tb = $("#com-tabla tbody"); tb.textContent = "";
            var tot = { contactados: 0, ventas: 0, comision: 0 };
            filas.forEach(function (f) {
                tot.contactados += num(f.contactados); tot.ventas += num(f.ventas); tot.comision += num(f.comision);
                var tr = document.createElement("tr");
                [f.nombre, (f.sucursales || []).join(", ") || "—", num(f.contactados).toLocaleString("es-BO"), String(num(f.ventas)),
                    num(f.contactados) ? Math.round(num(f.ventas) / num(f.contactados) * 100) + "%" : "—",
                    f.meta_mensual ? num(f.ventas) + " de " + f.meta_mensual : "—", bs(f.comision)].forEach(function (v, i) {
                    var td = texto("td", v); if (i >= 2) td.className = "cb-num"; if (i === 6) td.style.fontWeight = "700"; tr.appendChild(td);
                });
                tb.appendChild(tr);
            });
            if (!filas.length) { var tr = document.createElement("tr"), td = texto("td", "Todavía no hay ATC registrados en el equipo."); td.colSpan = 7; tr.appendChild(td); tb.appendChild(tr); }
            $("#com-k-total").textContent = bs(tot.comision);
            $("#com-k-ventas").textContent = String(tot.ventas);
            $("#com-k-conv").textContent = tot.contactados ? Math.round(tot.ventas / tot.contactados * 100) + "%" : "—";
            $("#com-k-cont").textContent = tot.contactados.toLocaleString("es-BO");
            $("#com-estado").textContent = "Del " + desde.split("-").reverse().join("/") + " al " + hasta.split("-").reverse().join("/") + ". Bs " + (r.comision_por_venta || 5) + " por cliente que vuelve a comprar dentro de los " + (r.ventana_dias || 15) + " días del contacto del ATC.";
            return window.CM.llamar("comercial_campanas", { desde: desde, hasta: hasta }).then(function (c) {
                var al = (c && c.alertas) || [], box = $("#com-control"); box.textContent = "";
                var h = texto("h3", al.length ? "⚠ Control de caja: " + al.length + (al.length === 1 ? " venta" : " ventas") + " de paquetes exclusivos a personas fuera de la lista" : "Control de caja: ningún paquete exclusivo vendido fuera de su lista");
                h.className = "cb-h3"; if (al.length) h.style.color = "var(--color-bad)"; box.appendChild(h);
                if (!al.length) return;
                var t = document.createElement("table"); t.className = "cb-table";
                t.innerHTML = "<thead><tr><th>Fecha</th><th>Paquete</th><th>Cliente</th><th>Sucursal</th><th>Cajero</th><th class='cb-num'>Monto</th></tr></thead>";
                var tb = document.createElement("tbody");
                al.forEach(function (f) { var tr = document.createElement("tr"); [String(f.fecha).replace("T", " ").slice(0, 16), f.paquete, f.cliente || "—", f.sucursal, f.cajero || "—", bs(f.monto)].forEach(function (v, i) { var td = texto("td", v); if (i === 5) td.className = "cb-num"; tr.appendChild(td); }); tb.appendChild(tr); });
                t.appendChild(tb); var w = document.createElement("div"); w.className = "cb-tablewrap"; w.appendChild(t); box.appendChild(w);
            }).catch(function () {});
        }).catch(function (e) {
            $("#com-estado").textContent = e && (e.sinFirebase || e.code === "permission-denied")
                ? "Para ver las comisiones hace falta la sesión de datos del centro de mando (sal y vuelve a ingresar con tu usuario del ERP)."
                : "No se pudieron cargar las comisiones: " + ((e && e.message) || e);
        });
    }
    $("#com-mes").value = iso(new Date()).slice(0, 7);
    $("#com-mes").addEventListener("change", cargar);
    $("#com-actualizar").addEventListener("click", cargar);
    if (window.CMFB) CMFB.listo.then(cargar); else cargar();
})();
