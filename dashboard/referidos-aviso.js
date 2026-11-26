/* Franja «Referidos nuevos» arriba del tablero de Atención al Cliente (ATC y Jefe de ATC): cuántos se anotaron con un
   código de referido en los últimos 3 días y nadie tomó todavía, con el botón para abrirlos. Necesita cm-firebase.js. */
(function () {
    "use strict";
    if (!window.CMFB || !window.firebase) return;
    var PY = window.CM_PAIS === "paraguay";
    var franja = document.createElement("div");
    franja.className = "tk-aviso"; franja.hidden = true; franja.setAttribute("role", "status");
    function poner() { var ancla = document.getElementById("cm-sesion") || document.querySelector(".cm-barra"); if (ancla && ancla.parentNode) ancla.parentNode.insertBefore(franja, ancla.nextSibling); else document.body.insertBefore(franja, document.body.firstChild); }
    function revisar() {
        var desde = new Date(Date.now() - 3 * 864e5).toISOString();
        firebase.firestore().collection((PY ? "py_" : "") + "ref_inscripcion").where("fecha_on", ">=", desde).get().then(function (q) {
            var n = q.docs.filter(function (d) { var x = d.data(); return !x.seguimiento && x.estado !== "rechazada"; }).length;
            franja.textContent = "";
            if (!n) { franja.hidden = true; return; }
            var b = document.createElement("b"); b.textContent = "Referidos nuevos"; franja.appendChild(b);
            var s = document.createElement("span"); s.className = "is-rojo"; s.textContent = n + (n === 1 ? " persona se anotó y espera tu llamada" : " personas se anotaron y esperan tu llamada"); franja.appendChild(s);
            var a = document.createElement("a"); a.href = "referidos-ventas.html" + (PY ? "?pais=paraguay" : ""); a.textContent = "Llamar ahora"; franja.appendChild(a);
            franja.hidden = false;
        }, function () {});
    }
    CMFB.listo.then(function () {
        if (!CMFB.sesionVigente() || !["atencion", "atc", "jefe_atc"].some(function (r) { return CMFB.tieneRolPais(r); })) return;
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poner); else poner();
        revisar(); setInterval(function () { if (!document.hidden) revisar(); }, 120000);
    });
})();
