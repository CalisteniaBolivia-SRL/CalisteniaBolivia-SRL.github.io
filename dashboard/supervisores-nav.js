/* Supervisores: un solo módulo con dos pestañas (Sucursales y entrenadores · Reemplazo de profesores).
   Se inserta debajo de la barra superior en supervision.html y reemplazos.html; cada pestaña respeta los permisos del ERP. */
(function () {
    "use strict";
    var s = null; try { s = JSON.parse(localStorage.getItem("cb_centro_mando") || "null"); } catch (e) {}
    var t = (s && s.tableros) || [], py = window.CM_PAIS === "paraguay";
    var pag = location.pathname.split("/").pop() || "supervision.html";
    var q = location.search;
    var tabs = [
        { href: "supervision.html", txt: "Sucursales y entrenadores", ve: t.indexOf("supervision") >= 0 },
        { href: "reemplazos.html", txt: "Reemplazo de profesores", ve: ["supervision", "direccion", "rrhh", "administracion"].some(function (x) { return t.indexOf(x) >= 0; }) || py }
    ].filter(function (x) { return x.ve; });
    if (tabs.length < 2) return;
    var css = document.createElement("style");
    css.textContent = ".sv-nav{display:flex;gap:0;flex-wrap:wrap;align-items:stretch;border-bottom:1px solid #25272B;background:#09090A;padding:0 16px}" +
        ".sv-nav b{color:#8D9299;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;align-self:center;margin-right:18px}" +
        ".sv-nav a{color:#8D9299;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:12px 14px;border-bottom:2px solid transparent}" +
        ".sv-nav a:hover{color:#F3F4F5}.sv-nav a.is-on{color:#F3F4F5;border-bottom-color:#C4C8CE}";
    document.head.appendChild(css);
    var nav = document.createElement("nav"); nav.className = "sv-nav"; nav.setAttribute("aria-label", "Supervisores");
    var b = document.createElement("b"); b.textContent = "Supervisores"; nav.appendChild(b);
    tabs.forEach(function (x) {
        var a = document.createElement("a"); a.href = x.href + q; a.textContent = x.txt;
        if (x.href === pag) { a.className = "is-on"; a.setAttribute("aria-current", "page"); }
        nav.appendChild(a);
    });
    var barra = document.querySelector(".cm-barra");
    if (barra && barra.parentNode) barra.parentNode.insertBefore(nav, barra.nextSibling); else document.body.insertBefore(nav, document.body.firstChild);
})();
