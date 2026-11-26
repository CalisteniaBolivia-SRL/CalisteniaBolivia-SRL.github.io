/* =====================================================================================================
   Portal · franja «Hoy»: lo que cada persona tiene pendiente, con un botón que lleva a resolverlo.
   Cada aviso solo se muestra a quien tiene el permiso del área (y en el país del portal que está mirando);
   si una consulta no está permitida o falla, ese aviso simplemente no aparece.
   ===================================================================================================== */
(function () {
    "use strict";
    if (!window.CMFB || !window.firebase) return;
    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function hace(dias) { return new Date(Date.now() - dias * 864e5).toISOString(); }

    function permisos(pais) {
        var c = (CMFB.estado && CMFB.estado.claims) || {}, bo = c.tableros || [], py = c.tableros_py || [];
        if (pais !== "paraguay") return bo;
        return bo.indexOf("direccion") >= 0 ? ["direccion", "administracion", "jefe_atc", "atencion", "rrhh", "mantenimiento", "marketing"] : py;
    }
    /* Cada aviso: quién lo ve, cómo se cuenta y a dónde lleva. */
    var AVISOS = [
        { roles: ["atencion", "atc"], texto: function (n) { return n === 1 ? "cliente en tu lista para llamar" : "clientes en tu lista para llamar"; }, href: "comercial.html?vista=atc",
          contar: function (db, pre, uid) { return db.collection(pre + "com_asignacion").where("key_ejecutiva", "==", uid).get().then(function (q) { return q.docs.filter(function (d) { var x = d.data(); return x.lote && Number(x.estado == null ? 1 : x.estado) > 0; }).length; }); } },
        /* Referidos: a la Jefa de ATC, los nuevos que nadie tomó (para asignar); a cada ATC, solo los que tiene asignados. */
        { roles: ["jefe_atc"], urgente: true, texto: function (n) { return n === 1 ? "referido nuevo sin asignar" : "referidos nuevos sin asignar"; }, href: "referidos-ventas.html",
          contar: function (db, pre) { return db.collection(pre + "ref_inscripcion").where("fecha_on", ">=", hace(14)).get().then(function (q) { return q.docs.filter(function (d) { var x = d.data(); return !x.seguimiento && x.estado !== "rechazada"; }).length; }); } },
        { roles: ["atencion", "atc"], soloSin: "jefe_atc", urgente: true, texto: function (n) { return n === 1 ? "referido asignado a vos para llamar" : "referidos asignados a vos para llamar"; }, href: "referidos-ventas.html",
          contar: function (db, pre, uid) { return db.collection(pre + "ref_inscripcion").where("tomado_por", "==", uid).get().then(function (q) { var d14 = hace(14); return q.docs.filter(function (d) { var x = d.data(); return (x.seguimiento === "tomado" || x.seguimiento === "no_contesta") && String(x.fecha_on) >= d14; }).length; }); } },
        { roles: ["jefe_atc", "administracion", "direccion"], urgente: true, texto: function (n) { return n === 1 ? "pago de referido por confirmar" : "pagos de referidos por confirmar"; }, href: "referidos-ventas.html",
          contar: function (db, pre) { return db.collection(pre + "ref_pago").where("estado", "==", "por_confirmar").get().then(function (q) { return q.size; }); } },
        { roles: ["administracion", "direccion"], urgente: true, texto: function (n) { return n === 1 ? "tarea urgente" : "tareas urgentes"; }, href: "tareas.html",
          contar: function (db, pre) { return db.collection(pre + "adm_tarea").where("estado", "==", "pendiente").get().then(function (q) { return q.docs.filter(function (d) { var x = d.data(); return x.prioridad === "urgente" && Number(x.activa == null ? 1 : x.activa) > 0; }).length; }); } },
        { roles: ["direccion"], texto: function (n) { return n === 1 ? "tarea espera tu decisión" : "tareas esperan tu decisión"; }, href: "tareas.html",
          contar: function (db, pre) { return db.collection(pre + "adm_tarea").where("estado", "==", "pendiente").get().then(function (q) { return q.docs.filter(function (d) { var x = d.data(); return x.espera_direccion && Number(x.activa == null ? 1 : x.activa) > 0; }).length; }); } },
        { roles: ["mantenimiento", "administracion", "supervision", "direccion"], texto: function (n) { return n === 1 ? "falla de mantenimiento abierta" : "fallas de mantenimiento abiertas"; }, href: "mantenimiento.html",
          contar: function (db, pre) { return db.collection(pre + "mant_falla").where("estado", "==", "abierta").get().then(function (q) { return q.size; }); } },
        { roles: ["rrhh", "direccion"], urgente: true, texto: function (n) { return n === 1 ? "denuncia espera respuesta" : "denuncias esperan respuesta"; }, href: "denuncias.html",
          contar: function (db, pre, uid, dir) {
              var q = db.collection(pre + "rh_denuncia"); if (!dir) q = q.where("solo_direccion", "==", false);
              return q.get().then(function (r) { return r.docs.filter(function (d) { var x = d.data(); return (x.estado === "recibida" || x.estado === "en_revision") && x.de_ultimo === "denunciante"; }).length; });
          } },
        { roles: ["rrhh", "direccion"], texto: function (n) { return n === 1 ? "sugerencia nueva de clientes" : "sugerencias nuevas de clientes"; }, href: "sugerencias.html",
          contar: function (db, pre) { return db.collection(pre + "rh_sugerencia").where("estado", "==", "nueva").get().then(function (q) { return q.size; }); } }
    ];

    var pintando = {}, reintentos = {};
    function pintar(pais) {
        var caja = document.getElementById("hoy-" + pais);
        if (!caja || pintando[pais]) return;
        if (!CMFB.sesionVigente()) { reintentos[pais] = (reintentos[pais] || 0) + 1; if (reintentos[pais] < 8) setTimeout(function () { pintar(pais); }, 1500); return; }
        pintando[pais] = true;
        var py = pais === "paraguay", pre = py ? "py_" : "", db = firebase.firestore(), uid = CMFB.usuarioKey(), mios = permisos(pais);
        var dir = mios.indexOf("direccion") >= 0;
        var tiene = function (a) {
            if (a.soloSin && (mios.indexOf(a.soloSin) >= 0 || mios.indexOf("todo") >= 0)) return false;   // la Jefa ya tiene su propio aviso
            return mios.indexOf("todo") >= 0 || a.roles.some(function (r) { return mios.indexOf(r) >= 0; });
        };
        var lista = AVISOS.filter(tiene);
        if (!lista.length) { pintando[pais] = false; return; }
        Promise.all(lista.map(function (a) { return a.contar(db, pre, uid, dir).then(function (n) { return { a: a, n: n }; }, function () { return null; }); })).then(function (r) {
            var hay = r.filter(function (x) { return x && x.n > 0; });
            caja.textContent = "";
            caja.appendChild(el("h2", "cm-hoy-tit", "Hoy"));
            if (!hay.length) { caja.appendChild(el("p", "cm-hoy-ok", "Todo al día. No tenés pendientes.")); }
            else {
                hay.sort(function (x, y) { return (y.a.urgente ? 1 : 0) - (x.a.urgente ? 1 : 0); });
                var ul = el("div", "cm-hoy-lista");
                hay.forEach(function (x) {
                    var a = el("a", "cm-hoy-item" + (x.a.urgente ? " is-urgente" : ""));
                    a.href = x.a.href + (py ? (x.a.href.indexOf("?") >= 0 ? "&" : "?") + "pais=paraguay" : "");
                    a.appendChild(el("b", "", String(x.n)));
                    a.appendChild(el("span", "", x.a.texto(x.n)));
                    a.appendChild(el("i", "", "→"));
                    ul.appendChild(a);
                });
                caja.appendChild(ul);
            }
            caja.hidden = false;
        }).then(function () { pintando[pais] = false; }, function () { pintando[pais] = false; });
    }
    function visibles() {
        var bo = document.getElementById("portal"), py = document.getElementById("portal-py");
        if (bo && !bo.hidden) pintar("bolivia");
        if (py && !py.hidden) pintar("paraguay");
        var ref = document.getElementById("nav-referidos");
        if (ref) ref.href = "referidos.html" + (py && !py.hidden ? "?pais=paraguay" : "");
    }
    /* El link «Muro» de arriba abre el bloque plegado de pantallas. */
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest('a[href="#muro"]');
        if (!a) return;
        var py = document.getElementById("portal-py"), id = py && !py.hidden ? "muro-py" : "muro";
        var d = document.querySelector("#" + id + " details"); if (d) { d.open = true; e.preventDefault(); d.scrollIntoView({ behavior: "smooth" }); }
    });
    CMFB.listo.then(function () {
        visibles();
        ["portal", "portal-py"].forEach(function (id) {
            var n = document.getElementById(id);
            if (n && window.MutationObserver) new MutationObserver(visibles).observe(n, { attributes: true, attributeFilter: ["hidden"] });
        });
        setInterval(function () { if (!document.hidden) visibles(); }, 120000);
    });
})();
