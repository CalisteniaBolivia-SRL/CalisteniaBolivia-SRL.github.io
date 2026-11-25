/* País del módulo (?pais=paraguay). Todos los módulos son los mismos para Bolivia y Paraguay (ver modulos.js);
   cada uno lee los datos de su país. Mientras un módulo no tenga conectados los datos de Paraguay, en Paraguay
   muestra el aviso en lugar de datos de otro país. Cuando se conecten, se agrega su página a LISTOS. */
(function () {
    "use strict";
    var pais = /[?&]pais=paraguay\b/.test(location.search) ? "paraguay" : "bolivia";
    window.CM_PAIS = pais;
    window.CM_MONEDA = pais === "paraguay" ? "Gs" : "Bs";
    /* Comisión de Atención al Cliente por venta confirmada, en la moneda de cada país. */
    window.CM_COMISION = pais === "paraguay" ? 10000 : 5;
    if (pais !== "paraguay") return;
    var LISTOS = ["legal.html", "redes.html", "reemplazos.html", "manual.html", "modulos.html", "muro.html", "comercial.html", "asistente.html", "referidos.html", "jarvis.html", "mantenimiento.html", "calificaciones.html", "tareas.html", "denuncia.html", "denuncias.html"];
    var pag = location.pathname.split("/").pop() || "index.html";
    document.documentElement.classList.add("cm-py");
    function aplicar() {
        document.querySelectorAll('[class*="eyebrow"]').forEach(function (e) { if (/Bolivia|Santa Cruz/.test(e.textContent)) e.textContent = e.textContent.replace(/Bolivia/g, "Paraguay").replace(/Santa Cruz/g, "Asunción"); });
        if (!/Paraguay/.test(document.title)) document.title = document.title.replace(/ · Calistenia Company$/, " · Paraguay · Calistenia Company");
        if (LISTOS.indexOf(pag) >= 0) return;
        var css = document.createElement("style");
        css.textContent = "body.cm-py-pendiente > *:not(.cm-barra):not(.cm-py-aviso):not(script):not(style){display:none!important}" +
            ".cm-py-aviso{max-width:720px;margin:48px auto;padding:22px 24px;background:#16181B;border:1px solid #2B2E33;border-top:2px solid #E30613;color:#FFFFFF;font:15px/1.55 'Segoe UI',Roboto,Arial,sans-serif}" +
            ".cm-py-aviso h1{font-size:20px;margin:0 0 8px}.cm-py-aviso p{margin:0 0 8px;color:#D6D8DC}";
        document.head.appendChild(css);
        document.body.classList.add("cm-py-pendiente");
        var d = document.createElement("section"); d.className = "cm-py-aviso"; d.setAttribute("role", "status");
        d.innerHTML = "<h1>Paraguay: falta conectar los datos</h1><p>Este módulo es el mismo que el de Bolivia y ya está listo para Paraguay, pero todavía no lee los datos del ERP de Calistenia Paraguay. Para no mezclar países, no muestra datos de Bolivia.</p><p>Se habilita apenas se conecten los datos de Paraguay. Mientras tanto, Dirección puede ocultarlo desde «Módulos».</p>";
        var barra = document.querySelector(".cm-barra");
        if (barra && barra.nextSibling) barra.parentNode.insertBefore(d, barra.nextSibling); else document.body.insertBefore(d, document.body.firstChild);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aplicar); else aplicar();
})();
