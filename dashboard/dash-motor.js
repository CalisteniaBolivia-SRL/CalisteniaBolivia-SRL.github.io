/* Motor de los tableros del centro de mando.
   Da a cada página las funciones que usa su código (dash.data, dash.calc, dash.loader, dash.draw,
   dash.params, dash.refresh…) y trae los datos con las herramientas del MCP de Calistenia (window.CM).
   La configuración de cada página va en window.CM_PAGINA = { datasets: {id: {tool, args}}, params: {…} }. */
(function () {
    var CFG = window.CM_PAGINA || { datasets: {}, params: {} };
    var params = Object.assign({}, CFG.params || {});
    var estados = {};          // id -> {status, data, columns, message, refreshing, clave}
    var cargadores = {};       // id -> fn
    var calculos = {};         // id -> {inputs, fn, version, valor}
    var dibujos = {};          // nombre -> fn | {mount, update, unmount}
    var montados = new WeakMap();
    var alCambiar = [];
    var pendiente = false;
    var versionGlobal = 0;

    function rellenar(valor) {
        if (typeof valor === "string") {
            var m = /^\{\{(\w+)\}\}$/.exec(valor);
            if (m) return params[m[1]] == null ? "" : params[m[1]];
            return valor.replace(/\{\{(\w+)\}\}/g, function (_, k) { return params[k] == null ? "" : String(params[k]); });
        }
        if (Array.isArray(valor)) return valor.map(rellenar);
        if (valor && typeof valor === "object") { var o = {}; Object.keys(valor).forEach(function (k) { o[k] = rellenar(valor[k]); }); return o; }
        return valor;
    }

    function aFilas(r) {
        if (r == null) return { data: [], columns: [] };
        if (Array.isArray(r)) return { data: r, columns: r.length && typeof r[0] === "object" ? Object.keys(r[0]) : [] };
        if (Array.isArray(r.data)) return { data: r.data, columns: r.columns || (r.data[0] ? Object.keys(r.data[0]) : []), cut: r.cut };
        if (Array.isArray(r.rows)) return { data: r.rows, columns: r.columns || (r.rows[0] ? Object.keys(r.rows[0]) : []), cut: r.cut };
        if (Array.isArray(r.results)) return { data: r.results, columns: r.results[0] ? Object.keys(r.results[0]) : [] };
        return { data: r, columns: [] };
    }

    function cargar(id, forzar) {
        var def = CFG.datasets[id];
        if (!def) { estados[id] = { status: "missing", data: [] }; return; }
        var args = rellenar(def.args || {});
        var clave = JSON.stringify(args);
        var e = estados[id];
        if (e && !forzar && e.clave === clave && (e.status === "ok" || e.status === "loading")) return;
        if (e && e.cargando && !forzar) return;
        var nuevo = !e || e.clave !== clave;
        estados[id] = e = Object.assign(e || {}, { clave: clave, cargando: true });
        if (nuevo || e.status !== "ok") { e.status = "loading"; e.data = []; } else { e.refreshing = true; }
        programar();
        var llamar = function (tool, a) { return window.CM.llamar(tool, a); };
        window.CM.llamar(def.tool, args).then(function (respuesta) {
            var fn = cargadores[id];
            return fn ? fn({ answer: respuesta, call: llamar, args: args, read: {} }) : respuesta;
        }).then(function (res) {
            if (estados[id].clave !== clave) return;
            var f = aFilas(res);
            Object.assign(estados[id], { status: "ok", data: f.data, columns: f.columns, message: "", refreshing: false, cargando: false, version: ++versionGlobal });
            programar();
        }).catch(function (err) {
            if (err && err.sinSesion) { avisarSesion(); }
            if (estados[id].clave !== clave) return;
            var e2 = estados[id];
            var habia = e2.status === "ok" && e2.refreshing;
            Object.assign(e2, { refreshing: false, cargando: false, message: (err && err.message) || "Error" });
            if (!habia) { e2.status = "error"; e2.data = []; }
            console.warn("[centro de mando]", id, err && err.message);
            programar();
        });
    }

    function datoCalculo(id) {
        var c = calculos[id];
        var entradas = c.inputs.map(function (i) { return datos(i); });
        if (entradas.some(function (d) { return d.status === "error" || d.status === "missing"; })) return { status: "error", data: null };
        if (entradas.some(function (d) { return d.status !== "ok"; })) return { status: "loading", data: null };
        var firma = entradas.map(function (d) { return d.version || 0; }).join(",");
        if (c.firma !== firma) {
            try {
                c.valor = c.fn.apply(null, entradas.map(function (d) { return Array.isArray(d.data) ? d.data : (d.data == null ? [] : d.data); }));
                c.firma = firma; c.version = ++versionGlobal; c.error = null;
            } catch (e) { c.error = e; c.firma = firma; console.warn("[centro de mando] cálculo", id, e); }
        }
        if (c.error) return { status: "error", data: null, message: String(c.error) };
        var refrescando = entradas.some(function (d) { return d.refreshing; });
        return { status: "ok", data: c.valor, columns: Array.isArray(c.valor) && c.valor[0] ? Object.keys(c.valor[0]) : [], refreshing: refrescando, version: c.version };
    }

    function datos(id) {
        if (calculos[id]) return datoCalculo(id);
        if (!estados[id]) cargar(id);
        var e = estados[id] || { status: "loading", data: [] };
        return { status: e.status, data: e.data, columns: e.columns || [], message: e.message || "", refreshing: !!e.refreshing, version: e.version || 0, meta: [] };
    }

    function visible(el) {
        for (var n = el; n && n !== document.documentElement; n = n.parentElement) if (n.hidden) return false;
        return true;
    }

    function correr() {
        pendiente = false;
        alCambiar.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
        Object.keys(dibujos).forEach(function (nombre) {
            var d = dibujos[nombre];
            document.querySelectorAll('[data-draw="' + nombre + '"]').forEach(function (el) {
                if (!visible(el)) return;
                try {
                    if (typeof d === "function") d(el);
                    else {
                        if (!montados.has(el)) { el.replaceChildren(); montados.set(el, d.mount ? d.mount(el) : null); }
                        if (d.update) d.update(el, montados.get(el));
                    }
                } catch (e) { console.error("[centro de mando] dibujo", nombre, e); }
            });
        });
    }
    function programar() { if (!pendiente) { pendiente = true; requestAnimationFrame(correr); } }

    function avisarSesion() {
        if (avisarSesion.hecho) return;
        avisarSesion.hecho = true;
        var b = document.getElementById("cm-sesion");
        if (b) b.hidden = false;
    }

    window.dash = {
        data: datos,
        loader: function (id, def) { cargadores[id] = def.fn; },
        calc: function (id, def) { calculos[id] = { inputs: def.inputs || [], fn: def.fn, title: def.title }; },
        draw: function (nombre, fn) { if (fn) dibujos[nombre] = fn; programar(); },
        onData: function (fn) { alCambiar.push(fn); programar(); },
        params: function () { return Object.assign({}, params); },
        setParams: function (cambios) {
            Object.keys(cambios || {}).forEach(function (k) { if (cambios[k] == null) delete params[k]; else params[k] = cambios[k]; });
            Object.keys(estados).forEach(function (id) { cargar(id); });
            programar();
        },
        resetParams: function () { params = Object.assign({}, CFG.params || {}); Object.keys(estados).forEach(function (id) { cargar(id); }); programar(); },
        refresh: function (id) { cargar(id, true); },
        setLink: function (nombre) { try { history.replaceState(null, "", "#" + nombre); } catch (e) {} },
        colors: ["var(--cb-accent)", "#D9AE5B", "#6FBF95", "#8AA4D6", "#C98BB9"]
    };

    /* Redibuja cuando cambia el tamaño o cuando se muestra una sección oculta. */
    window.addEventListener("resize", programar);
    new MutationObserver(function (lista) { if (lista.some(function (m) { return m.attributeName === "hidden"; })) programar(); })
        .observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
})();
