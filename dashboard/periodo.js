/* =====================================================================================================
   Período de los tableros: ver cualquier año o mes del histórico, o todo el histórico junto.
   Lo usan Dirección, Administración, Contabilidad, Marketing, Atención, Supervisión, RRHH y el muro, en Bolivia y
   Paraguay (cada país con sus datos y desde su primer dato). Va después de dash-motor.js y antes del código de la
   página: envuelve window.CB_fechas, así las fechas que usa cada tablero (hoy, mes, 30 días, 12 meses, mes
   anterior) pasan a ser las del período elegido. «En vivo» deja todo como siempre.
   Lo que no tiene fecha (clientes activos, por vencer, cajas abiertas, molinetes) sigue siendo de hoy.
   La elección se recuerda en la pestaña del navegador mientras se pasa de un tablero a otro.
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay";
    var INICIO = PY ? "2026-04-01" : "2021-08-01";   // primer dato de cada país
    var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    var K = "cm_periodo_" + (PY ? "py" : "bo");
    var pad = function (n) { return String(n).padStart(2, "0"); };
    var iso = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    function ahora() { return new Date(); }

    /* Período elegido: null = en vivo · { anio } · { anio, mes } (mes 0-11) · { todo: true } */
    var elegido = null;
    try { elegido = JSON.parse(sessionStorage.getItem(K) || "null"); } catch (e) {}
    if (elegido && elegido.anio && (elegido.anio < +INICIO.slice(0, 4) || elegido.anio > ahora().getFullYear())) elegido = null;
    function guardar() { try { if (elegido) sessionStorage.setItem(K, JSON.stringify(elegido)); else sessionStorage.removeItem(K); } catch (e) {} }

    /* Fechas del período, con las mismas claves que usan los tableros. */
    function fechas() {
        if (!elegido) return null;
        var h = ahora(), r = {};
        if (elegido.todo) {
            var i = new Date(+INICIO.slice(0, 4), +INICIO.slice(5, 7) - 1, 1);
            r.hoy = iso(h); r.ini_mes = iso(i); r.ini_12m = iso(i);
            r.ini_30 = iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 29)); r.ini_90 = iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 89));
            r.ant_ini = iso(i); r.ant_fin = iso(i);   // no hay período anterior al histórico completo
            return r;
        }
        var y = elegido.anio;
        if (elegido.mes == null) {
            var finA = new Date(y, 11, 31), ref = finA > h ? h : finA;
            r.hoy = iso(ref); r.ini_mes = y + "-01-01"; r.ini_12m = y + "-01-01";
            r.ini_30 = iso(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 29)); r.ini_90 = iso(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 89));
            r.ant_ini = (y - 1) + "-01-01"; r.ant_fin = iso(new Date(y - 1, ref.getMonth(), Math.min(ref.getDate(), new Date(y - 1, ref.getMonth() + 1, 0).getDate())));
            return r;
        }
        var m = elegido.mes, finM = new Date(y, m + 1, 0), refM = finM > h ? h : finM, d = refM.getDate();
        r.hoy = iso(refM); r.ini_mes = iso(new Date(y, m, 1)); r.ini_12m = iso(new Date(y, m - 11, 1));
        r.ini_30 = iso(new Date(y, m, d - 29)); r.ini_90 = iso(new Date(y, m, d - 89));
        r.ant_ini = iso(new Date(y, m - 1, 1)); r.ant_fin = iso(new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate())));
        return r;
    }
    function nombre() {
        if (!elegido) return "En vivo";
        if (elegido.todo) return "Todo el histórico (desde " + MESES[+INICIO.slice(5, 7) - 1] + " " + INICIO.slice(0, 4) + ")";
        return elegido.mes == null ? "Año " + elegido.anio : MESES[elegido.mes].charAt(0).toUpperCase() + MESES[elegido.mes].slice(1) + " " + elegido.anio;
    }

    /* La página asigna window.CB_fechas más abajo: se guarda y se devuelve envuelta. */
    var original = null;
    function envuelta() {
        var f = original ? original() : {}, p = fechas();
        if (!p) return f;
        var o = {}; Object.keys(f).forEach(function (k) { o[k] = (k in p) ? p[k] : f[k]; });
        return o;
    }
    try {
        Object.defineProperty(window, "CB_fechas", { configurable: true, get: function () { return original ? envuelta : undefined; }, set: function (fn) { original = fn; } });
    } catch (e) {}

    /* ---------- textos: «del mes» pasa a «del año» cuando se mira un año entero ---------- */
    var originales = new WeakMap();
    var SEL = ".cb-kpi-l, .cb-h3, .cb-note, .cb-kpi-s, h2, th";
    function reetiquetar() {
        var anual = elegido && (elegido.todo || elegido.mes == null);
        var cuando = elegido ? (elegido.todo ? "del histórico" : elegido.mes == null ? "de " + elegido.anio : "") : "";
        Array.prototype.forEach.call(document.querySelectorAll(SEL), function (el) {
            if (el.closest && el.closest(".cm-periodo")) return;
            Array.prototype.forEach.call(el.childNodes, function (n) {
                if (n.nodeType !== 3) return;
                if (!originales.has(n)) originales.set(n, n.nodeValue);
                var t = originales.get(n);
                if (anual) {
                    var ant = elegido.todo ? "período anterior" : "año anterior";
                    t = t.replace(/\bmismos días del mes anterior\b/gi, elegido.todo ? "período anterior" : "mismas fechas del año anterior")
                        .replace(/\bdel mes anterior\b/gi, "del " + ant).replace(/\bmes anterior\b/gi, ant)
                        .replace(/\b(Ingresos|Ventas|Visitas|Asistencias|Total) del mes\b/gi, function (_, a) { return a + " " + cuando; })
                        .replace(/\bdel mes( en curso)?\b/gi, cuando).replace(/\beste mes\b/gi, cuando)
                        .replace(/\b12 meses\b/g, elegido.todo ? "todo el histórico" : String(elegido.anio));
                }
                if (n.nodeValue !== t) n.nodeValue = t;
            });
        });
    }

    /* ---------- barra ---------- */
    var css = ".cm-periodo{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0 14px;padding:10px 12px;border:1px solid #3A3E44;background:#0D0E10;color:#FFFFFF;font-size:14px}" +
        ".cm-periodo b{letter-spacing:.06em;text-transform:uppercase;font-size:12px;color:#C4C8CE;margin-right:4px}" +
        ".cm-periodo select,.cm-periodo button{font:inherit;background:#17181B;color:#FFFFFF;border:1px solid #3A3E44;border-radius:0;padding:6px 10px;min-height:36px;cursor:pointer}" +
        ".cm-periodo button:disabled{opacity:.4;cursor:default}" +
        ".cm-periodo .cm-p-hoy{border-color:#E30613}" +
        ".cm-periodo.is-pasado{border-color:#E30613}" +
        ".cm-periodo .cm-p-aviso{flex-basis:100%;margin:2px 0 0;color:#C4C8CE;font-size:13px}" +
        ".cm-periodo .cm-p-aviso i{font-style:normal;color:#E30613;font-weight:600}" +
        "@media (max-width:560px){.cm-periodo select{flex:1 1 40%}}";
    var barra, selA, selM, bAnt, bSig, bHoy, aviso;
    function opciones() {
        var hoyY = ahora().getFullYear(), ini = +INICIO.slice(0, 4);
        selA.textContent = "";
        [["vivo", "En vivo (hoy)"]].concat((function () { var l = []; for (var y = hoyY; y >= ini; y--) l.push([String(y), String(y)]); return l; })(), [["todo", "Todo el histórico"]]).forEach(function (o) {
            var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; selA.appendChild(op);
        });
        selA.value = !elegido ? "vivo" : elegido.todo ? "todo" : String(elegido.anio);
        selM.textContent = "";
        var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "Año completo"; selM.appendChild(o0);
        if (elegido && elegido.anio) {
            var y = elegido.anio, ultimo = y === hoyY ? ahora().getMonth() : 11, primero = y === ini ? +INICIO.slice(5, 7) - 1 : 0;
            for (var m = primero; m <= ultimo; m++) { var op = document.createElement("option"); op.value = String(m); op.textContent = MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1); selM.appendChild(op); }
            selM.value = elegido.mes == null ? "" : String(elegido.mes);
        }
        selM.hidden = !(elegido && elegido.anio);
        var lista = pasos(), i = indice(lista);
        bAnt.disabled = i <= 0; bSig.disabled = !elegido || elegido.todo || i >= lista.length - 1;
        bHoy.hidden = !elegido;
        barra.classList.toggle("is-pasado", !!elegido);
        aviso.innerHTML = "";
        if (elegido) {
            var i1 = document.createElement("i"); i1.textContent = "Mirando: " + nombre() + ". ";
            aviso.appendChild(i1);
            aviso.appendChild(document.createTextNode((elegido.todo || elegido.mes == null ? "Las tarjetas «del mes» muestran el período completo y se comparan con el " + (elegido.todo ? "inicio" : "año anterior") + ". " : "«Hoy» es el último día de ese mes. ") +
                "Clientes activos, por vencer, cajas y molinetes son siempre de hoy." + (PY ? " En Paraguay los datos del ERP empiezan en abril de 2026." : "")));
        }
        aviso.hidden = !elegido;
    }
    /* Flechas: van de mes en mes (o de año en año si se mira un año completo). */
    function pasos() {
        var l = [], h = ahora(), ini = +INICIO.slice(0, 4);
        if (elegido && elegido.anio && elegido.mes == null) { for (var y = ini; y <= h.getFullYear(); y++) l.push({ anio: y }); return l; }
        for (var a = ini; a <= h.getFullYear(); a++) for (var m = 0; m < 12; m++) { var k = a + "-" + pad(m + 1); if (k < INICIO.slice(0, 7) || (a === h.getFullYear() && m > h.getMonth())) continue; l.push({ anio: a, mes: m }); }
        return l;
    }
    function indice(l) {
        if (!elegido) return l.length;   // en vivo = después del último
        if (elegido.todo) return -1;
        for (var i = 0; i < l.length; i++) if (l[i].anio === elegido.anio && (l[i].mes == null ? elegido.mes == null : l[i].mes === elegido.mes)) return i;
        return -1;
    }
    function aplicar() {
        guardar(); opciones();
        if (window.dash && window.CB_fechas) dash.setParams(window.CB_fechas());
        reetiquetar();
        try { window.dispatchEvent(new CustomEvent("cm-periodo", { detail: { periodo: elegido, fechas: fechas() } })); } catch (e) {}
    }
    function montar() {
        var cab = document.getElementById("cabecera");
        if (!cab || document.querySelector(".cm-periodo")) return;
        var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
        barra = document.createElement("div"); barra.className = "cm-periodo"; barra.setAttribute("role", "group"); barra.setAttribute("aria-label", "Período");
        var et = document.createElement("b"); et.textContent = "Período";
        bAnt = document.createElement("button"); bAnt.type = "button"; bAnt.textContent = "←"; bAnt.setAttribute("aria-label", "Período anterior");
        selA = document.createElement("select"); selA.setAttribute("aria-label", "Año");
        selM = document.createElement("select"); selM.setAttribute("aria-label", "Mes");
        bSig = document.createElement("button"); bSig.type = "button"; bSig.textContent = "→"; bSig.setAttribute("aria-label", "Período siguiente");
        bHoy = document.createElement("button"); bHoy.type = "button"; bHoy.className = "cm-p-hoy"; bHoy.textContent = "Volver a hoy";
        aviso = document.createElement("p"); aviso.className = "cm-p-aviso"; aviso.setAttribute("aria-live", "polite");
        [et, bAnt, selA, selM, bSig, bHoy, aviso].forEach(function (x) { barra.appendChild(x); });
        cab.parentNode.insertBefore(barra, cab.nextSibling);
        selA.onchange = function () { var v = selA.value; elegido = v === "vivo" ? null : v === "todo" ? { todo: true } : { anio: +v }; aplicar(); };
        selM.onchange = function () { elegido = { anio: elegido.anio, mes: selM.value === "" ? null : +selM.value }; aplicar(); };
        bAnt.onclick = function () { var l = pasos(), i = indice(l); if (!elegido) { var h = ahora(); elegido = h.getMonth() === 0 ? { anio: h.getFullYear() - 1, mes: 11 } : { anio: h.getFullYear(), mes: h.getMonth() - 1 }; if (elegido.anio < +INICIO.slice(0, 4)) elegido = null; } else if (i > 0) elegido = l[i - 1]; aplicar(); };
        bSig.onclick = function () { var l = pasos(), i = indice(l); if (i >= 0 && i < l.length - 1) elegido = l[i + 1]; aplicar(); };
        bHoy.onclick = function () { elegido = null; aplicar(); };
        opciones();
        if (window.dash && dash.onData) dash.onData(reetiquetar);
        reetiquetar();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
    window.CM_PERIODO = { fechas: fechas, nombre: nombre, elegido: function () { return elegido; }, INICIO: INICIO };
})();
