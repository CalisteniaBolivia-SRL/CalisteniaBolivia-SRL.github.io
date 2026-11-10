/* Ingreso al centro de mando con el usuario y la contraseña del ERP (serp.servisofts.com).
   Usa el mismo pedido que la web del ERP: servicio "usuario", tipo "login", por su conexión segura.
   La contraseña no se guarda: solo se recuerda el nombre durante la sesión del navegador (8 horas). */
(function () {
    var WS_URL = "wss://serp.servisofts.com/ws/";
    var MARCA = "---SSofts---";
    var CLAVE = "cb_centro_mando";
    var HORAS = 8;

    var acceso = document.getElementById("acceso");
    var portal = document.getElementById("portal");
    var nav = document.getElementById("nav-portal");
    var form = document.getElementById("f-acceso");
    var error = document.getElementById("acc-error");
    var boton = document.getElementById("acc-btn");
    var hola = document.getElementById("hola");
    var salir = document.getElementById("salir");

    function mostrarPortal(nombre) {
        acceso.hidden = true;
        portal.hidden = false;
        nav.hidden = false;
        hola.textContent = nombre ? "Hola, " + nombre : "";
    }
    function mostrarAcceso() {
        try { sessionStorage.removeItem(CLAVE); } catch (e) {}
        portal.hidden = true;
        nav.hidden = true;
        acceso.hidden = false;
        document.getElementById("acc-usuario").focus();
    }

    try {
        var s = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
        if (s && s.vence > Date.now()) mostrarPortal(s.nombre);
    } catch (e) {}

    function idUnico() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    function loginERP(usuario, password) {
        return new Promise(function (resolver, rechazar) {
            var ws, buffer = "", enviado = false, id = idUnico(), terminado = false;
            function fin() { terminado = true; clearTimeout(reloj); try { ws.close(); } catch (e) {} }
            var reloj = setTimeout(function () { if (!terminado) { fin(); rechazar(new Error("tiempo")); } }, 20000);
            try { ws = new WebSocket(WS_URL); } catch (e) { fin(); return rechazar(new Error("conexion")); }
            ws.onerror = function () { if (!terminado) { fin(); rechazar(new Error("conexion")); } };
            ws.onmessage = function (ev) {
                buffer += ev.data;
                var i;
                while ((i = buffer.indexOf(MARCA)) >= 0) {
                    var crudo = buffer.slice(0, i).split("---SSkey---")[0];
                    buffer = buffer.slice(i + MARCA.length);
                    var m;
                    try { m = JSON.parse(crudo); } catch (e) { continue; }
                    if (!enviado && m.component === "servicio" && m.type === "init") {
                        enviado = true;
                        ws.send(JSON.stringify({
                            service: "usuario", component: "usuario", version: "2.0", type: "login", estado: "cargando",
                            data: { usuario: usuario, password: password }, _ssocket_promise: id
                        }) + "\n");
                    } else if (m._ssocket_promise === id) {
                        fin();
                        if (m.estado === "exito") resolver(m); else rechazar(new Error(m.error || "error_login"));
                    }
                }
            };
        });
    }

    function nombreDe(respuesta, usuario) {
        var d = (respuesta && respuesta.data) || {};
        var n = d.Nombres || d.nombres || d.nombre || d.Nombre || "";
        n = String(n).trim().split(/\s+/)[0];
        return n || usuario;
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        var usuario = form.usuario.value.trim();
        var password = form.password.value;
        if (!usuario || !password) { error.textContent = "Escribe tu usuario y tu contraseña."; return; }
        error.textContent = "";
        boton.disabled = true;
        boton.textContent = "Verificando…";
        loginERP(usuario, password).then(function (r) {
            var nombre = nombreDe(r, usuario);
            try { sessionStorage.setItem(CLAVE, JSON.stringify({ nombre: nombre, vence: Date.now() + HORAS * 3600000 })); } catch (e2) {}
            form.reset();
            mostrarPortal(nombre);
        }).catch(function (err) {
            form.password.value = "";
            error.textContent = err.message === "error_login" ? "Usuario o contraseña incorrectos."
                : err.message === "tiempo" ? "El ERP no respondió a tiempo. Intenta de nuevo."
                : "No se pudo conectar con el ERP. Revisa tu conexión e intenta de nuevo.";
        }).then(function () {
            boton.disabled = false;
            boton.textContent = "Ingresar";
        });
    });

    salir.addEventListener("click", mostrarAcceso);
})();
