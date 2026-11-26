/* Registro ÚNICO de módulos del centro de mando, para todos los países.
   Regla del proyecto: cada módulo existe una sola vez y sirve a Bolivia y a Paraguay (cada uno con sus datos).
   Lo único que cambia por país es el CHECKLIST de qué se ve (com_config/modulos_<pais>), que edita Dirección en
   modulos.html. Un módulo oculto sigue funcionando y actualizándose; solo no aparece en el portal.
   Campos: id, tipo ("pantalla" del muro o "tablero"), nombre, que (descripción), quien/rol por país (opcional),
   href por país, permisos (basta con uno; mismos nombres en /centro_mando de cada ERP), datosPY (true si ya lee
   los datos de Paraguay; si no, en Paraguay muestra «falta conectar los datos»). */
(function () {
    "use strict";
    var PAISES = { bolivia: "Bolivia", paraguay: "Paraguay" };
    function q(pais) { return pais === "paraguay" ? "pais=paraguay" : ""; }
    function url(base, pais, hash) { var p = q(pais); return base + (p ? (base.indexOf("?") >= 0 ? "&" : "?") + p : "") + (hash || ""); }

    var MODULOS = [
        /* ---------- Muro ---------- */
        { id: "m_resumen", datosPY: true, tipo: "pantalla", num: "1", nombre: "Resumen", que: "Ingresos del mes y de hoy, visitas, activos y alertas", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p1"); } },
        { id: "m_ventas", datosPY: true, tipo: "pantalla", num: "2", nombre: "Ventas", que: "12 meses, últimos 30 días y medios de pago", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p2"); } },
        { id: "m_sucursales", datosPY: true, tipo: "pantalla", num: "3", nombre: "Sucursales", que: "Ranking y tablero contra el mes anterior", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p3"); } },
        { id: "m_paquetes", datosPY: true, tipo: "pantalla", num: "4", nombre: "Paquetes y cajeros", que: "Qué se vende y quién lo vende", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p4"); } },
        { id: "m_asistente", datosPY: true, tipo: "pantalla", num: "5", nombre: "Capital Corp · asistente", que: "Asistente de voz con los datos del día", permisos: ["muro", "direccion"], cc: true, href: function (p) { return url("asistente.html", p); } },
        { id: "m_asis_hoy", tipo: "pantalla", num: "5b", nombre: "Asistencia hoy", que: "Visitas por sucursal y por hora", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p5"); } },
        { id: "m_asis_30", tipo: "pantalla", num: "6", nombre: "Asistencia 30 días", que: "Horas buenas y bajas por sucursal, ocupación y frecuencia", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p6"); } },
        { id: "m_ventas_atc", datosPY: true, tipo: "pantalla", num: "7", nombre: "Ventas ATC", que: "CRM de Atención al Cliente: quién trabaja, qué lista y qué canal venden más", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p7"); } },
        { id: "m_retencion", datosPY: true, tipo: "pantalla", num: "8", nombre: "Retención", que: "Por vencer, en riesgo y vencidos por sucursal", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p8"); } },
        { id: "m_caja", tipo: "pantalla", num: "9", nombre: "Caja y molinetes", que: "Cajas abiertas, movimientos y molinetes", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p9"); } },
        { id: "m_camaras", tipo: "pantalla", num: "0", nombre: "Cámaras", que: "Todas las cámaras de todas las sucursales, girando solas", permisos: ["muro"], href: function (p) { return url("muro.html", p, "#p10"); } },
        /* ---------- Tableros ---------- */
        { id: "ingresos", tipo: "tablero", nombre: "Ingresos en vivo", quien: { bolivia: "Dirección · Accionistas", paraguay: "Dirección · Accionistas" }, rol: "Cierres semanales y mensuales", que: "Membresías, snacks y alquileres, actualizados cada 8 segundos", permisos: ["direccion", "accionistas"], datosPY: true, soloPY: false,
          href: function (p) { return p === "paraguay" ? "../accionistas-py/" : "../accionistas-py/?pais=bolivia"; } },
        { id: "asistente", tipo: "tablero", datosPY: true, nombre: "Asistente Capital Corp", quien: { bolivia: "Directores e inversionistas", paraguay: "Directores e inversionistas" }, rol: "Pregúntele lo que quiera, por voz", que: "Ingresos, ventas, paquetes, vencimientos y lo que necesite saber, en segundos", permisos: ["direccion", "accionistas"], href: function (p) { return url("jarvis.html", p); } },
        { id: "direccion", tipo: "tablero", nombre: "Dirección General", quien: { bolivia: "Jose Miguel Parada" }, rol: "Director", que: "Semáforo por área y de fiscalización, proyección del mes", permisos: ["direccion"], href: function (p) { return url("direccion.html", p); } },
        { id: "administracion", tipo: "tablero", nombre: "Administración", quien: { bolivia: "Luis Rodrigo Dorado" }, rol: "Administrador", que: "Cajas, control de ingreso, molinetes, sucursales y comisiones de los ATC", permisos: ["administracion"], href: function (p) { return url("administracion.html", p); } },
        { id: "contabilidad", tipo: "tablero", nombre: "Contabilidad y Fiscalización", quien: { bolivia: "Rodrigo Gomucio" }, rol: "Contabilidad", que: "Caja contra banco, precios, NIT, convenios y prórrogas", permisos: ["contabilidad"], href: function (p) { return url("contabilidad.html", p); } },
        { id: "supervision", alias: "reemplazos", tipo: "tablero", datosPY: true, nombre: "Supervisores", quien: { bolivia: "Michell Riobo · Marco Paz" }, rol: "Sucursales, entrenadores, calificaciones y reemplazos", que: "Sucursales, molinetes, horas buenas y bajas, calificación de entrenadores en cada visita y el registro de reemplazos de profesores", permisos: ["supervision", "direccion", "rrhh", "administracion"], href: function (p) { return url(p === "paraguay" ? "calificaciones.html" : "supervision.html", p); } },
        { id: "tareas", tipo: "tablero", datosPY: true, nombre: "Tareas de Administración", quien: { bolivia: "Administración · Dirección", paraguay: "Administración · Dirección" }, rol: "Qué hay por hacer y qué ya se hizo", que: "Tareas por prioridad (urgente, alta, media, baja), con su checklist, responsable, fecha límite y las decisiones de Dirección", permisos: ["administracion", "direccion"], href: function (p) { return url("tareas.html", p); } },
        { id: "mantenimiento", tipo: "tablero", datosPY: true, nombre: "Mantenimiento", quien: { bolivia: "Mantenimiento · Administración", paraguay: "Mantenimiento · Administración" }, rol: "Checklist de cada sucursal", que: "Revisión con checklist (bien o falla), reporte al administrador por WhatsApp y fallas pendientes hasta que se arreglan", permisos: ["mantenimiento", "administracion", "supervision", "direccion"], href: function (p) { return url("mantenimiento.html", p); } },
        { id: "marketing", tipo: "tablero", nombre: "Marketing y Ventas", quien: { bolivia: "Michell Riobo · Marco Paz" }, rol: "Marketing", que: "Proyección, paquetes, campañas y horas vacías", permisos: ["marketing"], href: function (p) { return url("marketing.html", p); } },
        { id: "redes", tipo: "tablero", nombre: "Redes sociales", quien: { bolivia: "Marketing · Bolivia", paraguay: "Marketing · Paraguay" }, rol: "Respuestas automáticas a comentarios", que: "Facebook e Instagram responden solos; casos delicados por aprobar; borradores para TikTok", permisos: ["marketing"], datosPY: true, href: function (p) { return "redes.html?pais=" + (p || "bolivia"); } },
        { id: "creativo", tipo: "tablero", datosPY: true, nombre: "Estudio creativo", quien: { bolivia: "Marketing · Dirección", paraguay: "Marketing · Dirección" }, rol: "Director Creativo con IA", que: "Escribís qué necesitás y te devuelve el paquete completo: concepto, guion, copies, prompts para cada IA (imagen, video, voz, música, edición), imágenes generadas, checklist y pruebas A/B", permisos: ["marketing", "direccion"], href: function (p) { return url("creativo.html", p); } },
        { id: "rrhh", tipo: "tablero", nombre: "Recursos Humanos", quien: { bolivia: "German Gallardo" }, rol: "Recursos Humanos", que: "Productividad de entrenadores y cumplimiento de cajeros", permisos: ["rrhh"], href: function (p) { return url("rrhh.html", p); } },
        { id: "denuncias", tipo: "tablero", datosPY: true, nombre: "Denuncias anónimas", quien: { bolivia: "Recursos Humanos · Dirección", paraguay: "Recursos Humanos · Dirección" }, rol: "Lo que el personal denuncia sin identificarse", que: "Denuncias del personal (acoso, maltrato, robo, riesgos), respuesta a quien denunció con su código, estado y notas internas; link y QR para el personal", permisos: ["rrhh", "direccion"], href: function (p) { return url("denuncias.html", p); } },
        { id: "sugerencias", tipo: "tablero", datosPY: true, nombre: "Buzón de sugerencias", quien: { bolivia: "German Gallardo" }, rol: "Recursos Humanos", que: "Quejas, ideas y felicitaciones que los clientes mandan desde la app", permisos: ["rrhh", "direccion"], href: function (p) { return url("sugerencias.html", p); } },
        { id: "reportes", tipo: "tablero", nombre: "Reportes", quien: { bolivia: "Dirección · Administración" }, rol: "Control y auditoría", que: "Traspasos, paquetes eliminados, cambios de fecha, convenios y usuarios duplicados", permisos: ["reportes"], href: function (p) { return url("reportes.html", p); } },
        { id: "referidos", tipo: "tablero", datosPY: true, todos: true, nombre: "Mis referidos", quien: { bolivia: "Todo el equipo", paraguay: "Todo el equipo" }, rol: "Tu código, tus cierres y tu comisión", que: "Compartí tu código por WhatsApp o QR y mirá cuánto ganás por cada cliente nuevo; Dirección y Administración liquidan desde acá", permisos: [], href: function (p) { return url("referidos.html", p); } },
        { id: "ref_ventas", tipo: "tablero", datosPY: true, nombre: "Referidos nuevos", quien: { bolivia: "ATC · Jefe de ATC · Administración", paraguay: "ATC · Jefe de ATC · Administración" }, rol: "Venta en el momento", que: "Quienes se anotaron con un código de referido (15 % de descuento): llamarlos al instante, y confirmar los pagos que mandan con comprobante", permisos: ["atencion", "atc", "jefe_atc", "administracion", "direccion"], href: function (p) { return url("referidos-ventas.html", p); } },
        { id: "jefe_atc", datosPY: true, tipo: "tablero", nombre: "Jefe de ATC", quien: { bolivia: "Eliana Aguilera" }, rol: "Dirige al equipo de atención al cliente", que: "Asigna listas y campañas, sigue cómo vende cada ATC, lo que gana, las comisiones a pagar y el control de caja", permisos: ["jefe_atc"], href: function (p) { return url("comercial.html?vista=jefe", p); } },
        { id: "atc", datosPY: true, tipo: "tablero", nombre: "Atención al Cliente (ATC)", quien: { bolivia: "ATC de cada sucursal", paraguay: "ATC" }, rol: "Llamar, escribir y cerrar ventas", que: "Tu lista del día con Llamar y WhatsApp, tus seguimientos y lo que vas ganando por cada cliente que vuelve", permisos: ["atencion", "atc"], href: function (p) { return url("comercial.html?vista=atc", p); } },
        { id: "legal", tipo: "tablero", nombre: "Legal", quien: { bolivia: "Asesoría legal · Dirección", paraguay: "Asesoría legal · Dirección" }, rol: "Contratos, permisos y casos", que: "Vencimientos de contratos y licencias, procesos con su bitácora y calendario de plazos", permisos: ["legal"], datosPY: true, href: function (p) { return url("legal.html", p); } }
    ];
    /* Qué se ve por defecto mientras Dirección no edite el checklist. Bolivia: todo. Paraguay: lo que ya tiene sus datos. */
    var POR_DEFECTO = {
        bolivia: function () { return true; },
        paraguay: function (m) { return !!m.datosPY; }
    };
    var K_CFG = "cm_modulos_cfg";
    function cfgLocal() { try { return JSON.parse(localStorage.getItem(K_CFG) || "null") || {}; } catch (e) { return {}; } }
    function visible(m, pais, cfg) {
        var c = (cfg || cfgLocal())[pais];
        if (c && c.visibles) {
            /* Módulos fusionados: se ve si estaba marcado con cualquiera de sus nombres (ej. Supervisores = Supervisión + Reemplazos). */
            var v = c.visibles[m.id], va = m.alias ? c.visibles[m.alias] : undefined;
            if (typeof v === "boolean" || typeof va === "boolean") return v === true || va === true;
        }
        return POR_DEFECTO[pais] ? POR_DEFECTO[pais](m) : true;
    }
    /* Lee el checklist de la base (si hay sesión) y lo guarda en el equipo para mostrar el portal al instante. */
    function cargarConfig() {
        var listo = window.CMFB && CMFB.listo ? CMFB.listo : Promise.resolve();
        return listo.then(function () {
            if (!window.firebase || !firebase.apps.length || !firebase.auth().currentUser) return null;
            var db = firebase.firestore();
            return Promise.all(Object.keys(PAISES).map(function (p) { return db.collection("com_config").doc("modulos_" + p).get().then(function (x) { return [p, x.exists ? x.data() : null]; }, function () { return [p, null]; }); }))
                .then(function (l) {
                    var cfg = cfgLocal(), cambio = false;
                    l.forEach(function (x) { if (x[1] && JSON.stringify(cfg[x[0]]) !== JSON.stringify(x[1])) { cfg[x[0]] = x[1]; cambio = true; } });
                    try { localStorage.setItem(K_CFG, JSON.stringify(cfg)); } catch (e) {}
                    return cambio ? cfg : null;
                });
        }).catch(function () { return null; });
    }
    function tieneAlguno(m, permisos) { return m.todos || (permisos || []).indexOf("todo") >= 0 || m.permisos.some(function (p) { return (permisos || []).indexOf(p) >= 0; }); }
    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

    /* Áreas del portal: cada tablero va en el espacio de su área laboral, con una sola línea que dice para qué sirve. */
    var AREAS = [
        { id: "ventas", nombre: "Ventas y clientes" },
        { id: "direccion", nombre: "Dirección" },
        { id: "administracion", nombre: "Administración" },
        { id: "operaciones", nombre: "Operaciones" },
        { id: "marketing", nombre: "Marketing" },
        { id: "personas", nombre: "Personas" }
    ];
    var AREA_DE = { ingresos: "direccion", asistente: "direccion", direccion: "direccion", reportes: "direccion",
        atc: "ventas", jefe_atc: "ventas", ref_ventas: "ventas", referidos: "ventas",
        marketing: "marketing", redes: "marketing", creativo: "marketing",
        supervision: "operaciones", mantenimiento: "operaciones",
        administracion: "administracion", tareas: "administracion", contabilidad: "administracion", legal: "administracion",
        rrhh: "personas", denuncias: "personas", sugerencias: "personas" };
    /* Módulos que se abren como pestaña dentro de otro: Tareas en Administración (y Dirección), Denuncias y Sugerencias
       en Recursos Humanos, Referidos nuevos en Jefe de ATC. */
    var DENTRO = { tareas: "administracion", denuncias: "rrhh", sugerencias: "rrhh", ref_ventas: "jefe_atc" };
    var ORDEN = ["direccion", "ingresos", "asistente", "reportes", "atc", "jefe_atc", "ref_ventas", "administracion", "tareas", "contabilidad", "legal",
        "supervision", "mantenimiento", "marketing", "redes", "creativo", "rrhh", "denuncias", "sugerencias"];
    var CORTO = { ingresos: "Lo que entra, en vivo", asistente: "Preguntale lo que quieras, por voz", direccion: "Semáforo de todas las áreas", reportes: "Control y auditoría",
        atc: "Tu lista para llamar y vender", jefe_atc: "Listas, equipo y comisiones de las ATC", ref_ventas: "Llamar y cobrar a los referidos", referidos: "Tu código y lo que ganás",
        marketing: "Ventas, paquetes y campañas", redes: "Respuestas en Instagram y Facebook", creativo: "Piezas y videos con IA",
        supervision: "Sucursales, entrenadores y reemplazos", mantenimiento: "Checklist de sucursales y fallas",
        administracion: "Cajas, ingresos y comisiones", tareas: "Pendientes por prioridad", contabilidad: "Caja contra banco y fiscalización", legal: "Contratos, permisos y casos",
        rrhh: "Entrenadores y cajeros", denuncias: "Lo que denuncia el personal", sugerencias: "Lo que dicen los clientes" };

    /* Arma en el portal la lista del muro y las tarjetas de tableros de ese país, según permisos y checklist. */
    function pintar(opc) {
        var pais = opc.pais, perms = opc.permisos || [], cfg = opc.cfg;
        var pant = MODULOS.filter(function (m) { return m.tipo === "pantalla" && tieneAlguno(m, perms) && visible(m, pais, cfg); });
        var tabs = MODULOS.filter(function (m) { return m.tipo === "tablero" && tieneAlguno(m, perms) && visible(m, pais, cfg); });
        if (opc.pantallas) {
            opc.pantallas.textContent = "";
            pant.forEach(function (m, i) {
                var li = el("li"), a = el("a", "cm-screen");
                a.href = m.href(pais);
                a.appendChild(el("span", "cm-num", String(i + 1)));   /* numeración seguida según lo visible */ a.appendChild(el("span", "cm-name", m.nombre)); a.appendChild(el("span", "cm-desc", m.que));
                if (pais === "paraguay" && !m.datosPY) a.appendChild(el("span", "cm-prox", "Falta conectar los datos de Paraguay"));
                li.appendChild(a); opc.pantallas.appendChild(li);
            });
            if (opc.bloqueMuro) opc.bloqueMuro.hidden = !pant.length;
            var n = pant.length;
            if (opc.cuentaMuro) opc.cuentaMuro.textContent = n + (n === 1 ? " pantalla" : " pantallas");
        }
        if (opc.tableros) {
            opc.tableros.textContent = "";
            /* «Mis referidos» es de todo el personal: va en el menú de arriba; acá solo si no hay otro tablero. */
            /* Lo que ya está adentro de otro tablero (como pestaña) no se repite como tarjeta, si ese tablero está a la vista. */
            var porId = {}; tabs.forEach(function (m) { porId[m.id] = m; });
            var propios = tabs.filter(function (m) {
                if (m.todos) return false;
                var padre = porId[DENTRO[m.id]];
                return !(padre && (pais !== "paraguay" || padre.datosPY));
            });
            var lista = propios.length ? propios : tabs;
            /* Dirección ve primero su área; dentro de cada área, primero lo de todos los días. */
            var areas = perms.indexOf("direccion") >= 0 || perms.indexOf("todo") >= 0 ? [AREAS[1]].concat(AREAS.filter(function (a) { return a.id !== "direccion"; })) : AREAS;
            var pos = function (m) { var i = ORDEN.indexOf(m.id); return i < 0 ? 99 : i; };
            areas.forEach(function (ar) {
                var deArea = lista.filter(function (m) { return (AREA_DE[m.id] || "direccion") === ar.id; }).sort(function (a, b) { return pos(a) - pos(b); });
                if (!deArea.length) return;
                var g = el("section", "cm-area-grupo");
                if (propios.length > 3) g.appendChild(el("h3", "cm-area-tit", ar.nombre));
                var grilla = el("div", "cm-team cm-team--corto");
                deArea.forEach(function (m) {
                    var a = el("a", "cm-card cm-card--corta"); a.href = m.href(pais); a.title = m.que || "";
                    a.appendChild(el("span", "cm-area", m.nombre));
                    a.appendChild(el("span", "cm-what", CORTO[m.id] || m.rol || ""));
                    if (pais === "paraguay" && !m.datosPY) a.appendChild(el("span", "cm-prox", "Falta conectar los datos de Paraguay"));
                    grilla.appendChild(a);
                });
                g.appendChild(grilla);
                opc.tableros.appendChild(g);
            });
            if (opc.bloqueTableros) opc.bloqueTableros.hidden = !tabs.length;
        }
        return { pantallas: pant.length, tableros: tabs.length };
    }

    window.CM_MODULOS = { AREAS: AREAS, AREA_DE: AREA_DE, PAISES: PAISES, lista: MODULOS, visible: visible, cargarConfig: cargarConfig, pintar: pintar, porDefecto: POR_DEFECTO, tieneAlguno: tieneAlguno };
})();
