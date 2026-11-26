/* =====================================================================================================
   Hoja de ruta de supervisores · pantalla. Bolivia y Paraguay (?pais=paraguay), el mismo módulo; cada país con lo
   suyo en la base (sup_* / py_sup_*).
   - «Mi ruta»: el supervisor ve sus visitas de la semana por día, con «Cómo llegar» y «Marcar visitada» (hora,
     ubicación y nota).
   - «Semana»: todos los supervisores, qué se visitó y qué falta (Dirección, Administración y Supervisión).
   - «Configurar»: supervisores activos y sucursales que entran en la ruta.
   La ruta de cada semana se arma sola la primera vez que alguien la abre (o con «Volver a armar»).
   ===================================================================================================== */
(function () {
    "use strict";
    var PY = window.CM_PAIS === "paraguay", L = window.RUTA_LOGICA;
    var $ = function (id) { return document.getElementById(id); };
    function el(tag, attrs, hijos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            var v = attrs[k];
            if (k === "text") e.textContent = v; else if (k === "class") e.className = v;
            else if (k.indexOf("on") === 0 && typeof v === "function") e.addEventListener(k.slice(2), v);
            else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
        });
        (hijos || []).forEach(function (h) { if (h != null && h !== false) e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
        return e;
    }
    function msg(t, tono) { var m = $("op-estado"); m.textContent = t || ""; m.className = "op-msg" + (tono ? " is-" + tono : ""); }
    function errTxt(e) { return e && e.code === "permission-denied" ? "Tu usuario del ERP no tiene permiso para esto en /centro_mando" + (PY ? " de Paraguay" : "") + "." : (e && e.message) || String(e); }
    function db() { return firebase.firestore(); }
    function col(n) { return db().collection((PY ? "py_" : "") + n); }
    function ahora() { return new Date().toISOString(); }
    function hoyLocal() { return new Intl.DateTimeFormat("en-CA", { timeZone: PY ? "America/Asuncion" : "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 10); }
    function fechaCorta(iso) { var d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return isNaN(d) ? "" : d.toLocaleDateString(PY ? "es-PY" : "es-BO", { day: "numeric", month: "short" }); }
    function hora(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString(PY ? "es-PY" : "es-BO", { hour: "2-digit", minute: "2-digit" }); }

    /* Semana que se muestra: la actual; el domingo ya se muestra la que empieza el lunes. */
    function semanaActual() { var h = hoyLocal(), l = L.lunes(h); return new Date(h + "T12:00:00Z").getUTCDay() === 0 ? L.fechaDia(l, 7) : l; }
    var M = { yo: "", nombre: "", esSup: false, esDir: false, vista: "mi", semana: semanaActual(), config: null, supervisores: [], ruta: null, visitas: [] };

    /* ---------- datos ---------- */
    function paradasARuta(doc) {
        if (!doc || !doc.paradas) return null;
        var por = {};
        (doc.supervisores || []).forEach(function (s) { por[s.key] = { supervisor: s, dias: L.DIAS.map(function () { return []; }) }; });
        doc.paradas.slice().sort(function (a, b) { return a.dia - b.dia || a.orden - b.orden; }).forEach(function (p) {
            if (!por[p.key_supervisor]) por[p.key_supervisor] = { supervisor: { key: p.key_supervisor, nombre: p.supervisor }, dias: L.DIAS.map(function () { return []; }) };
            por[p.key_supervisor].dias[p.dia].push({ key: p.key_sucursal, nombre: p.sucursal, lat: p.lat, lon: p.lon, direccion: p.direccion });
        });
        return Object.keys(por).map(function (k) { return por[k]; });
    }
    function cargarConfig() {
        return col("sup_config").doc("general").get().then(function (d) {
            M.config = d.exists ? d.data() : null;
            if (M.config || PY) return;
            return sucursalesSistema().then(function (l) {
                if (!l.length) return;
                M.config = { sucursales: l, fecha_mod: ahora(), por: M.nombre };
                if (M.esDir || M.esSup) return col("sup_config").doc("general").set(M.config).catch(function () {});
            });
        });
    }
    /* Bolivia: sucursales del sistema (gimnasios abiertos en la app); entran por defecto las que vendieron en los últimos 60 días. */
    function sucursalesSistema() {
        if (!window.CM || !CM.llamar) return Promise.resolve([]);
        var parse = function (r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { r = {}; } } return r || {}; };
        var hasta = hoyLocal(), desde = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
        return Promise.all([CM.llamar("listar_sucursales", {}).then(parse), CM.llamar("reporte_ventas", { desde: desde, hasta: hasta, agrupar_por: "sucursal" }).then(parse).catch(function () { return {}; })]).then(function (a) {
            var vendieron = {}; ((a[1] && a[1].filas) || []).forEach(function (f) { if (Number(f.total) > 0) vendieron[String(f.grupo || "").trim().toLowerCase()] = 1; });
            var hay = Object.keys(vendieron).length > 0;
            return ((a[0] && (a[0].result || a[0].filas)) || []).filter(function (s) { return !s.tipo_tienda && s.estado_app !== 0 && !/oficina/i.test(s.descripcion || ""); }).map(function (s) {
                var n = String(s.descripcion || "").trim();
                return { key: s.key, nombre: n, lat: s.latitude, lon: s.longitude, direccion: s.direccion || "", activa: hay ? !!vendieron[n.toLowerCase()] : true };
            }).sort(function (x, y) { return x.nombre.localeCompare(y.nombre); });
        }).catch(function () { return []; });
    }
    function cargarSupervisores() {
        return col("sup_supervisor").get().then(function (q) {
            M.supervisores = q.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }).sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
            /* Cada supervisor queda anotado solo la primera vez que abre la Hoja de ruta. */
            if (M.esSup && !M.supervisores.some(function (s) { return s.key === M.yo; })) {
                var yo = { nombre: M.nombre || "Supervisor", activo: true, fecha_on: ahora() };
                return col("sup_supervisor").doc(M.yo).set(yo).then(function () { M.supervisores.push(Object.assign({ key: M.yo }, yo)); M.nuevo = true; }, function () {});
            }
        });
    }
    function cargarSemana() {
        return Promise.all([col("sup_ruta").doc(M.semana).get(), col("sup_visita").where("semana", "==", M.semana).get()]).then(function (a) {
            M.rutaDoc = a[0].exists ? a[0].data() : null; M.ruta = paradasARuta(M.rutaDoc);
            M.visitas = a[1].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        });
    }
    function activosSup() { return M.supervisores.filter(function (s) { return s.activo !== false; }); }
    function activasSuc() { return ((M.config && M.config.sucursales) || []).filter(function (s) { return s.activa !== false; }); }
    /* Arma (o vuelve a armar) la ruta de la semana con los supervisores y sucursales activos. */
    function armar() {
        var sups = activosSup(), sucs = activasSuc();
        if (!sups.length) return Promise.reject(new Error("Todavía no hay supervisores: cada supervisor queda anotado al abrir la Hoja de ruta con su usuario del ERP."));
        if (!sucs.length) return Promise.reject(new Error("No hay sucursales activas para la ruta: revisalas en «Configurar»."));
        /* Si se arma durante la semana en curso, se reparte desde hoy hasta el sábado (no en días que ya pasaron). */
        var desde = 0;
        if (M.semana === L.lunes(hoyLocal())) { for (var k = 0; k < L.DIAS.length; k++) if (L.fechaDia(M.semana, k) === hoyLocal()) desde = k; }
        var r = L.armar(sucs, sups.map(function (s) { return { key: s.key, nombre: s.nombre }; }), L.DIAS.length - desde), paradas = [];
        r.forEach(function (x) { x.dias.forEach(function (d, i) { d.forEach(function (s, j) { paradas.push({ dia: i + desde, orden: j, key_supervisor: x.supervisor.key, supervisor: x.supervisor.nombre, key_sucursal: s.key, sucursal: s.nombre, lat: s.lat == null ? null : Number(s.lat), lon: s.lon == null ? null : Number(s.lon), direccion: s.direccion || "" }); }); }); });
        var doc = { semana: M.semana, supervisores: r.map(function (x) { return x.supervisor; }), paradas: paradas, armada_por: M.nombre, fecha_on: ahora() };
        return col("sup_ruta").doc(M.semana).set(doc).then(function () { M.rutaDoc = doc; M.ruta = paradasARuta(doc); });
    }
    /* Se arma sola: si la semana no tiene ruta, o si entró un supervisor nuevo y todavía no hay visitas. */
    function asegurarRuta() {
        if (!(M.esSup || M.esDir) || M.semana < semanaActual()) return Promise.resolve();
        var faltaSup = M.ruta && activosSup().some(function (s) { return !M.ruta.some(function (r) { return r.supervisor.key === s.key; }); });
        if (!M.ruta || (faltaSup && !M.visitas.length)) return armar().catch(function (e) { msg(e.message, "warn"); });
        return Promise.resolve();
    }

    /* ---------- marcar visitada ---------- */
    function marcar(s, diaIdx) {
        var nota = prompt("Visita a " + s.nombre + ". ¿Algo para anotar? (opcional)", "");
        if (nota === null) return;
        msg("Guardando la visita…");
        var guardar = function (pos) {
            var d = { semana: M.semana, dia: diaIdx, key_sucursal: s.key, sucursal: s.nombre, key_supervisor: M.yo, supervisor: M.nombre, fecha: ahora(), nota: String(nota).slice(0, 300) };
            if (pos) { d.lat = pos.coords.latitude; d.lon = pos.coords.longitude; if (s.lat != null) d.dist_m = Math.round(L.km({ lat: d.lat, lon: d.lon }, s) * 1000); }
            return col("sup_visita").doc(M.semana + "_" + s.key).set(d).then(function () {
                M.visitas = M.visitas.filter(function (v) { return v.key_sucursal !== s.key; }).concat([d]);
                msg("Visita a " + s.nombre + " registrada" + (d.dist_m != null ? (d.dist_m > 500 ? " (ojo: a " + Math.round(d.dist_m / 100) / 10 + " km de la sucursal)" : " en la sucursal") : "") + ".", "ok"); pintar();
            }, function (e) { msg(errTxt(e), "bad"); });
        };
        if (navigator.geolocation) navigator.geolocation.getCurrentPosition(guardar, function () { guardar(null); }, { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true });
        else guardar(null);
    }

    /* ---------- vistas ---------- */
    function visitaDe(key) { return M.visitas.filter(function (v) { return v.key_sucursal === key; })[0]; }
    function tarjetaDia(dia, i, propio) {
        var fecha = L.fechaDia(M.semana, i), hoy = fecha === hoyLocal();
        var c = el("article", { class: "op-card rt-dia" + (hoy ? " is-hoy" : "") }, [el("h3", {}, [L.DIAS[i] + (hoy ? " · hoy" : ""), el("small", { text: fechaCorta(fecha) })])]);
        if (!dia.length) { c.appendChild(el("p", { class: "op-muted", text: "Sin visitas." })); return c; }
        var mapa = L.linkMapa(dia);
        if (mapa && dia.length > 1) c.appendChild(el("a", { class: "op-btn", href: mapa, target: "_blank", rel: "noopener", text: "Ruta del día en Maps" }));
        dia.forEach(function (s) {
            var v = visitaDe(s.key);
            c.appendChild(el("div", { class: "rt-parada" }, [
                el("b", { text: s.nombre }),
                s.direccion ? el("p", { class: "op-muted", text: s.direccion }) : null,
                v ? el("span", { class: "rt-ok", text: "✓ Visitada " + fechaCorta(v.fecha) + " " + hora(v.fecha) + (v.supervisor && v.key_supervisor !== M.yo ? " · " + v.supervisor : "") + (v.nota ? " · " + v.nota : "") }) : null,
                el("div", { class: "op-acc" }, [
                    el("a", { class: "op-btn", href: L.linkSucursal(s), target: "_blank", rel: "noopener", text: "Cómo llegar" }),
                    propio && M.esSup && !v ? el("button", { type: "button", class: "op-btn is-fuerte", text: "Marcar visitada", onclick: function () { marcar(s, i); } }) : null
                ])
            ]));
        });
        return c;
    }
    function vistaMia() {
        var w = el("div");
        var mia = (M.ruta || []).filter(function (r) { return r.supervisor.key === M.yo; })[0];
        if (!mia) { w.appendChild(el("p", { class: "op-vacio", text: M.ruta ? "Esta semana no tenés visitas asignadas." : "Todavía no hay ruta para esta semana." })); return w; }
        var a = L.avance([mia], M.visitas);
        w.appendChild(el("p", { class: "op-muted", text: a.hechas + " de " + a.total + " sucursales visitadas esta semana." }));
        w.appendChild(el("div", { class: "rt-barra" }, [el("i", { style: "width:" + a.pct + "%" })]));
        var g = el("div", { class: "rt-dias", style: "margin-top:12px" });
        mia.dias.forEach(function (d, i) { g.appendChild(tarjetaDia(d, i, true)); });
        w.appendChild(g);
        return w;
    }
    function vistaSemana() {
        var w = el("div");
        if (!M.ruta) { w.appendChild(el("p", { class: "op-vacio", text: "Todavía no hay ruta para esta semana." })); }
        else {
            var a = L.avance(M.ruta, M.visitas);
            w.appendChild(el("div", { class: "op-kpis" }, [
                el("div", { class: "op-kpi" + (a.pct >= 100 ? " is-ok" : "") }, [el("span", { text: "Visitadas" }), el("b", { text: a.hechas + " / " + a.total }), el("small", { text: a.pct + " %" })])
            ].concat(a.porSupervisor.map(function (p) { return el("div", { class: "op-kpi" }, [el("span", { text: p.supervisor.nombre }), el("b", { text: p.hechas + " / " + p.total })]); }))));
            var t = el("table", { class: "rt-tabla" }), h = el("tr", {}, [el("th", { text: "Supervisor" })].concat(L.DIAS.map(function (d, i) { return el("th", { text: d.slice(0, 3) + " " + fechaCorta(L.fechaDia(M.semana, i)) }); })));
            t.appendChild(h);
            M.ruta.forEach(function (r) {
                t.appendChild(el("tr", {}, [el("td", {}, [el("b", { text: r.supervisor.nombre })])].concat(r.dias.map(function (d) {
                    return el("td", {}, d.map(function (s) { var v = visitaDe(s.key); return el("div", { class: v ? "rt-ok" : "", text: (v ? "✓ " : "· ") + s.nombre + (v ? " " + hora(v.fecha) : "") }); }));
                }))));
            });
            w.appendChild(el("div", { class: "lg-tablewrap", style: "overflow-x:auto;margin-top:12px" }, [t]));
            var lejos = M.visitas.filter(function (v) { return v.dist_m > 500; });
            if (lejos.length) w.appendChild(el("p", { class: "op-msg is-warn", text: "Marcadas lejos de la sucursal: " + lejos.map(function (v) { return v.sucursal + " (" + Math.round(v.dist_m / 100) / 10 + " km, " + v.supervisor + ")"; }).join(", ") + "." }));
        }
        if (M.esDir || M.esSup) w.appendChild(el("div", { class: "op-acc", style: "margin-top:12px" }, [el("button", { type: "button", class: "op-btn", text: M.ruta ? "Volver a armar la ruta" : "Armar la ruta", onclick: function () {
            if (M.ruta && M.visitas.length && !confirm("Ya hay visitas marcadas esta semana. ¿Volver a repartir igual? Las visitas hechas quedan registradas.")) return;
            msg("Armando…"); armar().then(function () { msg("Ruta armada.", "ok"); pintar(); }, function (e) { msg(errTxt(e), "bad"); });
        } })]));
        return w;
    }
    function vistaConfig() {
        var w = el("div");
        var cs = el("section", { class: "op-card" }, [el("h2", { text: "Supervisores" }), el("p", { class: "op-muted", text: "Cada supervisor queda anotado al abrir la Hoja de ruta con su usuario del ERP (permiso Supervisión). Desmarcá a quien no deba recibir visitas (vacaciones, licencia) y volvé a armar la ruta." })]);
        if (!M.supervisores.length) cs.appendChild(el("p", { class: "op-vacio", text: "Todavía no entró ningún supervisor." }));
        M.supervisores.forEach(function (s) {
            var i = el("input", { type: "checkbox" }); i.checked = s.activo !== false; i.disabled = !M.esDir && s.key !== M.yo;
            i.addEventListener("change", function () { col("sup_supervisor").doc(s.key).update({ activo: i.checked }).then(function () { s.activo = i.checked; msg("Guardado. Tocá «Volver a armar la ruta» en «Semana» para aplicarlo.", "ok"); }, function (e) { i.checked = !i.checked; msg(errTxt(e), "bad"); }); });
            cs.appendChild(el("label", { class: "rt-chk" }, [i, s.nombre]));
        });
        w.appendChild(cs);
        var ss = el("section", { class: "op-card", style: "margin-top:12px" }, [el("h2", { text: "Sucursales en la ruta" }), el("p", { class: "op-muted", text: PY ? "Agregá cada sucursal con su dirección (y, si querés, el punto de Google Maps)." : "Salen del sistema; vienen marcadas las que vendieron en los últimos 60 días. Desmarcá las cerradas." })]);
        var lista = (M.config && M.config.sucursales) || [];
        var guardarCfg = function () { M.config = M.config || {}; M.config.sucursales = lista; M.config.fecha_mod = ahora(); M.config.por = M.nombre; return col("sup_config").doc("general").set(M.config).then(function () { msg("Guardado. Tocá «Volver a armar la ruta» en «Semana» para aplicarlo.", "ok"); }, function (e) { msg(errTxt(e), "bad"); }); };
        lista.forEach(function (s) {
            var i = el("input", { type: "checkbox" }); i.checked = s.activa !== false; i.disabled = !(M.esDir || M.esSup);
            i.addEventListener("change", function () { s.activa = i.checked; guardarCfg(); });
            ss.appendChild(el("label", { class: "rt-chk" }, [i, s.nombre + (s.lat == null ? " (sin ubicación)" : "")]));
        });
        if (!lista.length) ss.appendChild(el("p", { class: "op-vacio", text: "Todavía no hay sucursales." }));
        if (M.esDir || M.esSup) {
            var n = el("input", { type: "text", maxlength: "60", placeholder: "Nombre" }), dir = el("input", { type: "text", maxlength: "120", placeholder: "Dirección" }), ub = el("input", { type: "text", maxlength: "300", placeholder: "Link de Google Maps o «-25.28, -57.63» (opcional)" });
            var agregar = el("button", { type: "button", class: "op-btn", text: "Agregar sucursal", onclick: function () {
                var nom = n.value.trim(); if (nom.length < 3) { msg("Escribí el nombre de la sucursal.", "warn"); return; }
                var m = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(ub.value) || /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(ub.value);
                lista.push({ key: "manual-" + nom.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), nombre: nom, direccion: dir.value.trim(), lat: m ? Number(m[1]) : null, lon: m ? Number(m[2]) : null, activa: true });
                guardarCfg().then(pintar);
            } });
            ss.appendChild(el("div", { class: "rt-form", style: "margin-top:10px" }, [n, dir, ub, agregar]));
        }
        w.appendChild(ss);
        return w;
    }
    function tabs() {
        var t = $("rt-tabs"); t.textContent = "";
        [M.esSup ? ["mi", "Mi ruta"] : null, ["semana", "Semana"], (M.esDir || M.esSup) ? ["config", "Configurar"] : null].filter(Boolean).forEach(function (x) {
            var b = el("button", { type: "button", role: "tab", class: M.vista === x[0] ? "is-on" : "", "aria-selected": M.vista === x[0] ? "true" : "false", text: x[1] });
            b.addEventListener("click", function () { M.vista = x[0]; pintar(); }); t.appendChild(b);
        });
    }
    function pintar() {
        tabs();
        $("rt-sem").textContent = "Semana del " + fechaCorta(M.semana) + " al " + fechaCorta(L.fechaDia(M.semana, 5));
        var v = $("rt-vista"); v.textContent = "";
        v.appendChild(M.vista === "mi" ? vistaMia() : M.vista === "config" ? vistaConfig() : vistaSemana());
    }
    function irSemana(delta) {
        var d = new Date(M.semana + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 7 * delta); M.semana = d.toISOString().slice(0, 10);
        msg("Cargando…"); cargarSemana().then(asegurarRuta).then(function () { msg(""); pintar(); }, function (e) { msg(errTxt(e), "bad"); });
    }

    /* ---------- arranque ---------- */
    if (PY) $("rt-eyebrow").textContent = "Calistenia Company · Paraguay · Supervisores";
    var qn = $("cm-quien"); if (qn && window.CM_USUARIO) qn.textContent = "Hola, " + window.CM_USUARIO.nombre;
    $("cm-salir").onclick = function () { if (window.CM) CM.cerrarSesion(); if (window.CMFB) CMFB.salir(); try { localStorage.removeItem("cb_centro_mando"); } catch (e) {} location.href = "./"; };
    $("rt-ant").onclick = function () { irSemana(-1); };
    $("rt-sig").onclick = function () { irSemana(1); };
    CMFB.listo.then(function () {
        if (!CMFB.sesionVigente()) { msg("Salí del centro de mando y volvé a entrar con tu usuario del ERP.", "bad"); return; }
        var r = function (x) { return CMFB.tieneRolPais(x); };
        M.yo = CMFB.usuarioKey(); M.nombre = (window.CM_USUARIO && CM_USUARIO.nombre) || CMFB.nombre() || "";
        M.esDir = r("direccion"); M.esSup = r("supervision") && !M.esDir;   // Dirección ve todo, pero no recibe visitas
        M.vista = M.esSup ? "mi" : "semana";
        msg("Cargando…");
        return Promise.all([cargarConfig(), cargarSupervisores()]).then(cargarSemana).then(asegurarRuta).then(function () { msg(""); pintar(); }, function (e) { msg(errTxt(e), "bad"); pintar(); });
    });
})();
