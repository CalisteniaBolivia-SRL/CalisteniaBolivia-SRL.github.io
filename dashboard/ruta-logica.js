/* =====================================================================================================
   Hoja de ruta de supervisores · reglas (sin interfaz ni datos: se prueban solas con Node).
   Bolivia y Paraguay usan exactamente estas reglas.
   - Cada semana, todas las sucursales activas se reparten entre los supervisores activos.
   - Se agrupan por zona (barrido alrededor del centro de la ciudad, grupos parejos), cada supervisor recorre las de su
     zona en el orden más corto (vecino más cercano) y se reparten de lunes a sábado, parejo.
   - Una sucursal sin ubicación va al final de la zona con menos visitas.
   ===================================================================================================== */
(function (raiz) {
    "use strict";
    var DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

    function km(a, b) {
        if (!a || !b || a.lat == null || b.lat == null) return 0;
        var R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
        var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
        return 2 * R * Math.asin(Math.sqrt(h));
    }
    function conUbicacion(s) { return s && isFinite(Number(s.lat)) && isFinite(Number(s.lon)) && s.lat !== null && s.lon !== null; }

    /* Lunes de la semana de una fecha (AAAA-MM-DD), en hora local de la fecha dada. */
    function lunes(fechaIso) {
        var d = new Date(String(fechaIso).slice(0, 10) + "T12:00:00Z"), dow = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - dow);
        return d.toISOString().slice(0, 10);
    }
    function fechaDia(lunesIso, i) { var d = new Date(lunesIso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); }

    /* Ordena un grupo de sucursales en el recorrido más corto aproximado, empezando por la más alejada del centro. */
    function recorrido(lista, centro) {
        var pend = lista.filter(conUbicacion).slice(), sin = lista.filter(function (s) { return !conUbicacion(s); });
        if (!pend.length) return sin;
        pend.sort(function (a, b) { return km(b, centro) - km(a, centro); });
        var out = [pend.shift()];
        while (pend.length) {
            var ult = out[out.length - 1], mejor = 0;
            for (var i = 1; i < pend.length; i++) if (km(ult, pend[i]) < km(ult, pend[mejor])) mejor = i;
            out.push(pend.splice(mejor, 1)[0]);
        }
        return out.concat(sin);
    }

    /* Reparte sucursales [{key, nombre, lat, lon}] entre supervisores [{key, nombre}] y días (6 por defecto).
       → [{ supervisor: {key,nombre}, dias: [[sucursal, ...] × días] }] */
    function armar(sucursales, supervisores, nDias) {
        nDias = nDias || DIAS.length;
        var sups = (supervisores || []).filter(Boolean);
        if (!sups.length) return [];
        var ubic = sucursales.filter(conUbicacion), sin = sucursales.filter(function (s) { return !conUbicacion(s); });
        var centro = ubic.length ? { lat: ubic.reduce(function (s, x) { return s + Number(x.lat); }, 0) / ubic.length, lon: ubic.reduce(function (s, x) { return s + Number(x.lon); }, 0) / ubic.length } : null;
        /* Barrido por ángulo: zonas contiguas y del mismo tamaño. */
        var orden = ubic.slice().sort(function (a, b) { return Math.atan2(a.lat - centro.lat, a.lon - centro.lon) - Math.atan2(b.lat - centro.lat, b.lon - centro.lon); });
        var grupos = sups.map(function () { return []; }), n = orden.length, k = sups.length;
        var corte = 0; for (var g = 0; g < k; g++) { var tam = Math.floor(n / k) + (g < n % k ? 1 : 0); grupos[g] = orden.slice(corte, corte + tam); corte += tam; }
        sin.forEach(function (s) { var menor = 0; grupos.forEach(function (gr, i) { if (gr.length < grupos[menor].length) menor = i; }); grupos[menor].push(s); });
        return sups.map(function (sup, i) {
            var r = recorrido(grupos[i], centro), dias = [], m = r.length;
            for (var d = 0; d < nDias; d++) dias.push([]);
            /* Parejo: las primeras visitas se reparten una por día y lo que sobra va sumando desde el lunes. */
            var porDia = Math.floor(m / nDias), extra = m % nDias, pos = 0;
            for (var d2 = 0; d2 < nDias; d2++) { var c = porDia + (d2 < extra ? 1 : 0); dias[d2] = r.slice(pos, pos + c); pos += c; }
            return { supervisor: { key: sup.key, nombre: sup.nombre }, dias: dias };
        });
    }

    /* Link de Google Maps con todas las paradas del día (desde donde está el supervisor). */
    function linkMapa(paradas) {
        var p = (paradas || []).filter(conUbicacion);
        if (!p.length) return "";
        var dest = p[p.length - 1], pasos = p.slice(0, -1);
        return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + dest.lat + "," + dest.lon +
            (pasos.length ? "&waypoints=" + encodeURIComponent(pasos.map(function (x) { return x.lat + "," + x.lon; }).join("|")) : "");
    }
    function linkSucursal(s) { return conUbicacion(s) ? "https://www.google.com/maps/dir/?api=1&destination=" + s.lat + "," + s.lon : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((s.nombre || "") + " " + (s.direccion || "")); }

    /* Avance: visitas registradas contra la ruta. visitas: [{ semana, key_sucursal, key_supervisor }] */
    function avance(ruta, visitas) {
        var hechas = {}; (visitas || []).forEach(function (v) { hechas[v.key_sucursal] = v; });
        var total = 0, ok = 0, porSup = [];
        (ruta || []).forEach(function (r) {
            var t = 0, h = 0; r.dias.forEach(function (d) { d.forEach(function (s) { t++; if (hechas[s.key]) h++; }); });
            total += t; ok += h; porSup.push({ supervisor: r.supervisor, total: t, hechas: h });
        });
        return { total: total, hechas: ok, pct: total ? Math.round(ok / total * 100) : 0, porSupervisor: porSup, hechasPorSucursal: hechas };
    }

    var API = { DIAS: DIAS, km: km, lunes: lunes, fechaDia: fechaDia, recorrido: recorrido, armar: armar, linkMapa: linkMapa, linkSucursal: linkSucursal, avance: avance };
    if (typeof module !== "undefined" && module.exports) module.exports = API;
    raiz.RUTA_LOGICA = API;
})(typeof window !== "undefined" ? window : this);
