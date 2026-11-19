/* Autorización del equipo del muro, una sola vez.
   Si este navegador todavía no tiene permitido micrófono y cámara para el sitio, muestra abajo un aviso con un botón
   que descarga autorizar-este-equipo.reg (se abre, se acepta y se reinicia Chrome). Cuando el equipo ya está
   autorizado, el aviso no vuelve a aparecer nunca. */
(function () {
    "use strict";
    if (!navigator.permissions || !navigator.permissions.query) return;
    var BASE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/configurar\.js.*$/, "") : "kiosco/";
    var CLAVE = "cc_muro_autorizar_mas_tarde";
    function estado(n) { return navigator.permissions.query({ name: n }).then(function (r) { return r.state; }, function () { return "granted"; }); }
    function revisar() {
        return Promise.all([estado("microphone"), estado("camera")]).then(function (e) { return e[0] === "granted" && e[1] === "granted"; });
    }
    function mostrar() {
        try { if (sessionStorage.getItem(CLAVE)) return; } catch (e) {}
        var css = document.createElement("style");
        css.textContent = ".cc-autorizar{position:fixed;right:16px;bottom:84px;z-index:50;display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;" +
            "width:min(calc(100vw - 32px),420px);padding:14px 18px;background:#0A0A0A;border:1px solid #FFFFFF;color:#FFFFFF;font:15px/1.4 Saira,'Segoe UI',Roboto,Arial,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.6)}" +
            ".cc-autorizar p{margin:0;flex:1 1 100%}.cc-autorizar b{font-weight:600}.cc-autorizar small{display:block;color:#BDBDBD;margin-top:4px}" +
            ".cc-autorizar a,.cc-autorizar button{font:inherit;font-weight:600;padding:9px 16px;cursor:pointer;text-decoration:none;white-space:nowrap}" +
            ".cc-autorizar a{background:#FFFFFF;color:#000000;border:1px solid #FFFFFF}.cc-autorizar button{background:none;color:#BDBDBD;border:1px solid #3A3A3A}";
        document.head.appendChild(css);
        var d = document.createElement("div");
        d.className = "cc-autorizar"; d.setAttribute("role", "status");
        d.innerHTML = '<p><b>Autorice este equipo una sola vez</b> para que el muro use micrófono, cámara y sonido sin volver a preguntar.' +
            '<small>1. Descargar · 2. Abrir el archivo y aceptar «Sí» · 3. Cerrar Chrome y volver a abrirlo. Listo para siempre en este usuario.</small></p>' +
            '<a download="autorizar-este-equipo.reg" href="' + BASE + 'autorizar-este-equipo.reg">Descargar autorización</a>' +
            '<button type="button">Más tarde</button>';
        d.querySelector("button").onclick = function () { try { sessionStorage.setItem(CLAVE, "1"); } catch (e) {} d.remove(); };
        document.body.appendChild(d);
        /* Si se autoriza por otro lado (por ejemplo, desde el candado de la barra de direcciones), el aviso se va solo. */
        var t = setInterval(function () { revisar().then(function (ok) { if (ok) { clearInterval(t); d.remove(); } }); }, 5000);
    }
    function iniciar() { revisar().then(function (ok) { if (!ok) mostrar(); }); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
