/* Franja «Tareas de Administración» arriba de los tableros de Administración y Dirección:
   cuántas urgentes, pendientes, vencidas y esperando decisión, con el botón para abrirlas.
   Necesita cm-firebase.js en la página. Si el usuario no tiene permiso, no muestra nada. */
(function () {
    "use strict";
    if (!window.CMFB || !window.firebase) return;
    var PY = window.CM_PAIS === "paraguay";
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var d = new Date(), hoy = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    var franja = document.createElement("div");
    franja.className = "tk-aviso"; franja.hidden = true; franja.setAttribute("role", "status");
    var ancla = document.getElementById("cm-sesion") || document.querySelector(".cm-barra");
    if (ancla && ancla.parentNode) ancla.parentNode.insertBefore(franja, ancla.nextSibling); else document.body.insertBefore(franja, document.body.firstChild);
    function pintar(l) {
        var pend = l.filter(function (t) { return Number(t.activa == null ? 1 : t.activa) > 0 && t.estado !== "hecha"; });
        var urg = pend.filter(function (t) { return t.prioridad === "urgente"; }).length;
        var venc = pend.filter(function (t) { return t.fecha_limite && t.fecha_limite < hoy; }).length;
        var esp = pend.filter(function (t) { return t.espera_direccion; }).length;
        franja.textContent = "";
        var b = document.createElement("b"); b.textContent = "Tareas de Administración"; franja.appendChild(b);
        var add = function (txt, rojo) { var s = document.createElement("span"); s.textContent = txt; if (rojo) s.className = "is-rojo"; franja.appendChild(s); };
        if (!pend.length) add("Nada pendiente.");
        else {
            add(urg + (urg === 1 ? " urgente" : " urgentes"), urg > 0);
            add(pend.length + (pend.length === 1 ? " pendiente" : " pendientes"));
            if (venc) add(venc + (venc === 1 ? " vencida" : " vencidas"), true);
            if (esp) add(esp + " esperan decisión de Dirección", false);
        }
        var a = document.createElement("a"); a.href = "tareas.html" + (PY ? "?pais=paraguay" : ""); a.textContent = "Abrir tareas"; franja.appendChild(a);
        franja.hidden = false;
    }
    CMFB.listo.then(function () {
        if (!CMFB.sesionVigente() || !(CMFB.tieneRolPais("administracion") || CMFB.tieneRolPais("direccion"))) return;
        firebase.firestore().collection((PY ? "py_" : "") + "adm_tarea").where("estado", "==", "pendiente").get()
            .then(function (q) { pintar(q.docs.map(function (x) { return x.data(); })); }, function () {});
    });
})();
