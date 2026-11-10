/* Ingreso al centro de mando con el usuario y la contraseña del ERP (serp.servisofts.com).
   Usa el mismo pedido que la web del ERP: servicio "usuario", tipo "login", por su conexión segura.
   La contraseña no se guarda: solo se recuerda el nombre durante la sesión del navegador (8 horas). */
(function () {
    var WS_URL = "wss://serp.servisofts.com/ws/";
    var MARCA = "---SSofts---";
    var CLAVE = "cb_centro_mando";
    var HORAS = 8;

    /* ===== Accesos por cargo =====
       Qué ve cada cargo después de ingresar. Claves de tablero:
       muro, direccion, administracion, contabilidad, atencion, supervision, marketing, rrhh */
    var CARGOS = {
        director:       ["muro", "direccion", "administracion", "contabilidad", "atencion", "supervision", "marketing", "rrhh"],
        administrador:  ["muro", "administracion"],
        contabilidad:   ["contabilidad"],
        atencion:       ["atencion"],
        supervision:    ["muro", "supervision", "marketing"],
        rrhh:           ["rrhh"]
    };
    /* Usuario del ERP (tal como se escribe al ingresar, sin importar mayúsculas) → cargo.
       Quien no esté en esta lista entra pero no ve tableros hasta que se le asigne un cargo. */
    var USUARIOS = {
        // "usuario.del.erp": "director",
    };

    var acceso = document.getElementById("acceso");
    var portal = document.getElementById("portal");
    var nav = document.getElementById("nav-portal");
    var form = document.getElementById("f-acceso");
    var error = document.getElementById("acc-error");
    var boton = document.getElementById("acc-btn");
    var hola = document.getElementById("hola");
    var salir = document.getElementById("salir");

    function tablerosDe(usuario) {
        /* Mientras no haya usuarios cargados, el reparto por cargo está apagado y se ve todo. */
        if (Object.keys(USUARIOS).length === 0) return CARGOS.director;
        var cargo = USUARIOS[String(usuario || "").trim().toLowerCase()];
        return CARGOS[cargo] || [];
    }

    function mostrarPortal(nombre, usuario) {
        var permitidos = tablerosDe(usuario);
        document.querySelectorAll("[data-tablero]").forEach(function (el) {
            el.hidden = permitidos.indexOf(el.getAttribute("data-tablero")) < 0;
        });
        var hayTarjetas = permitidos.some(function (t) { return t !== "muro"; });
        document.querySelectorAll('#equipo, a[href="#equipo"]').forEach(function (el) { el.hidden = !hayTarjetas; });
        document.getElementById("sin-acceso").hidden = permitidos.length > 0;
        document.getElementById("mi-usuario").textContent = usuario ? "«" + usuario + "»" : "";
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
        if (s && s.vence > Date.now()) mostrarPortal(s.nombre, s.usuario);
    } catch (e) {}

    function idUnico() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    /* serp.servisofts.com tiene dos direcciones y una no responde: el navegador puede tardar
       hasta ~30 s en pasar a la que sí funciona. Por eso se espera más y se reintenta. */
    function loginERP(usuario, password) {
        var intentos = 3;
        function intentar(n) {
            return loginUnaVez(usuario, password).catch(function (err) {
                /* Solo se reintenta si no se llegó a enviar el ingreso (problema de conexión). */
                if ((err.message === "conexion" || err.message === "tiempo") && !err.enviado && n < intentos) {
                    boton.textContent = "Reintentando conexión (" + (n + 1) + " de " + intentos + ")…";
                    return intentar(n + 1);
                }
                throw err;
            });
        }
        return intentar(1);
    }

    function loginUnaVez(usuario, password) {
        return new Promise(function (resolver, rechazar) {
            var ws, buffer = "", enviado = false, id = idUnico(), terminado = false, paso = "conectando";
            function fin() { terminado = true; clearTimeout(reloj); try { ws.close(); } catch (e) {} }
            function fallar(motivo) {
                if (terminado) return;
                fin();
                var e = new Error(motivo); e.paso = paso; e.enviado = enviado;
                rechazar(e);
            }
            var reloj = setTimeout(function () { fallar("tiempo"); }, 45000);
            try { ws = new WebSocket(WS_URL); } catch (e) { return fallar("conexion"); }
            ws.onopen = function () { paso = "conectado, esperando saludo del ERP"; };
            ws.onerror = function () { fallar("conexion"); };
            ws.onclose = function (ev) { if (!terminado) { paso += " (cerrado " + ev.code + ")"; fallar("conexion"); } };
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
                        paso = "usuario enviado, esperando respuesta";
                        ws.send(JSON.stringify({
                            service: "usuario", component: "usuario", version: "2.0", type: "login", estado: "cargando",
                            data: { usuario: usuario, password: password }, _ssocket_promise: id
                        }) + "\n");
                    } else if (enviado && (m._ssocket_promise === id || (m.component === "usuario" && m.type === "login"))) {
                        /* La respuesta del ingreso: la reconoce por su identificador o, si el ERP no lo devuelve, por su tipo. */
                        if (m.estado === "exito") { fin(); resolver(m); }
                        else if (m.estado === "error") { fin(); rechazar(new Error(m.error || "error_login")); }
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
        boton.textContent = "Conectando con el ERP…";
        loginERP(usuario, password).then(function (r) {
            var nombre = nombreDe(r, usuario);
            try { sessionStorage.setItem(CLAVE, JSON.stringify({ nombre: nombre, usuario: usuario, vence: Date.now() + HORAS * 3600000 })); } catch (e2) {}
            form.reset();
            mostrarPortal(nombre, usuario);
        }).catch(function (err) {
            form.password.value = "";
            var detalle = err.paso ? " (paso: " + err.paso + ")" : "";
            error.textContent = err.message === "error_login" ? "Usuario o contraseña incorrectos."
                : err.enviado ? "El ERP recibió tu usuario pero no respondió a tiempo. Intenta de nuevo" + detalle + "."
                : err.message === "tiempo" ? "El ERP no respondió a tiempo. Intenta de nuevo" + detalle + "."
                : err.message === "conexion" ? "No se pudo conectar con el ERP" + detalle + ". Intenta de nuevo en un momento."
                : "El ERP rechazó el ingreso: " + err.message + ".";
        }).then(function () {
            boton.disabled = false;
            boton.textContent = "Ingresar";
        });
    });

    salir.addEventListener("click", mostrarAcceso);
})();
