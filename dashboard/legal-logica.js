/* Lógica del módulo legal (sin DOM): estado de contratos, permisos y casos, y el calendario de plazos.
   Se prueba aparte (window.LEG_logica). */
(function () {
    "use strict";
    var DIA = 86400000;
    function texto(v) { return v == null ? "" : String(v).trim(); }
    function f10(v) { return texto(v).slice(0, 10); }
    function dias(desde, hasta) { return Math.round((new Date(f10(hasta) + "T00:00:00") - new Date(f10(desde) + "T00:00:00")) / DIA); }
    function iso(d) { var p = function (n) { return String(n).padStart(2, "0"); }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
    function aviso(r, porDefecto) { var a = Number(r.aviso_dias); return isFinite(a) && r.aviso_dias !== null && r.aviso_dias !== "" ? a : porDefecto; }

    var TIPOS = {
        contrato: { alquiler: "Alquiler", personal: "Personal / entrenadores", proveedor: "Proveedor", convenio: "Convenio con empresa", servicio: "Servicio", otro: "Otro" },
        permiso: { licencia_funcionamiento: "Licencia de funcionamiento", permiso_municipal: "Permiso municipal", seprec: "SEPREC (matrícula)", impuestos: "Impuestos (SIN)", seguro: "Seguro", bomberos: "Bomberos / extintores", sanitario: "Sanitario", publicidad: "Publicidad / letrero", otro: "Otro" },
        caso: { laboral: "Laboral", civil: "Civil", penal: "Penal", administrativo: "Administrativo", reclamo_cliente: "Reclamo de cliente", multa: "Multa / sanción", otro: "Otro" },
        evento: { audiencia: "Audiencia", presentacion: "Presentación", notificacion: "Notificación", pago: "Pago", nota: "Nota" },
        plazo: { obligacion: "Obligación", presentacion: "Presentación", pago: "Pago", renovacion: "Renovación", reunion: "Reunión", otro: "Otro" }
    };
    var SITUACION_CASO = { abierto: "Abierto", en_proceso: "En proceso", suspendido: "Suspendido", conciliado: "Conciliado", cerrado_favorable: "Cerrado a favor", cerrado_desfavorable: "Cerrado en contra" };
    var SITUACION_CONTRATO = { vigente: "Vigente", en_negociacion: "En negociación", rescindido: "Rescindido", finalizado: "Finalizado" };

    /* Estado visible: { clave, texto, tono (ok|warn|bad|muted), dias } */
    function estadoContrato(c, hoy) {
        if (c.situacion === "rescindido" || c.situacion === "finalizado") return { clave: "terminado", texto: SITUACION_CONTRATO[c.situacion], tono: "muted" };
        if (!f10(c.fecha_fin)) return { clave: "indefinido", texto: c.situacion === "en_negociacion" ? "En negociación" : "Vigente (sin fecha de fin)", tono: c.situacion === "en_negociacion" ? "warn" : "ok" };
        var d = dias(hoy, c.fecha_fin);
        if (d < 0) return { clave: "vencido", texto: (c.renovacion_automatica ? "Venció (renovación automática: confirmar) " : "Vencido hace ") + (-d) + " días", tono: c.renovacion_automatica ? "warn" : "bad", dias: d };
        if (d <= aviso(c, 30)) return { clave: "por_vencer", texto: (c.renovacion_automatica ? "Se renueva solo en " : "Vence en ") + d + (d === 1 ? " día" : " días"), tono: c.renovacion_automatica ? "muted" : "warn", dias: d };
        return { clave: "vigente", texto: c.situacion === "en_negociacion" ? "En negociación" : "Vigente", tono: c.situacion === "en_negociacion" ? "warn" : "ok", dias: d };
    }
    function estadoPermiso(p, hoy) {
        if (p.en_tramite) return { clave: "tramite", texto: "En trámite", tono: "warn" };
        if (!f10(p.fecha_vencimiento)) return { clave: "no_vence", texto: "Vigente (no vence)", tono: "ok" };
        var d = dias(hoy, p.fecha_vencimiento);
        if (d < 0) return { clave: "vencido", texto: "Vencido hace " + (-d) + " días", tono: "bad", dias: d };
        if (d <= aviso(p, 30)) return { clave: "por_vencer", texto: "Vence en " + d + (d === 1 ? " día" : " días"), tono: "warn", dias: d };
        return { clave: "vigente", texto: "Vigente", tono: "ok", dias: d };
    }
    function casoActivo(k) { return ["abierto", "en_proceso", "suspendido", "", null, undefined].indexOf(k.situacion) >= 0; }
    function estadoCaso(k, hoy) {
        var sit = SITUACION_CASO[k.situacion || "abierto"] || k.situacion;
        if (!casoActivo(k)) return { clave: "cerrado", texto: sit, tono: k.situacion === "cerrado_desfavorable" ? "bad" : "muted" };
        if (f10(k.proxima_fecha)) {
            var d = dias(hoy, k.proxima_fecha);
            if (d < 0) return { clave: "atrasado", texto: sit + " · actuación atrasada", tono: "bad", dias: d };
            if (d <= 7) return { clave: "proximo", texto: sit + " · " + (d === 0 ? "hoy" : "en " + d + (d === 1 ? " día" : " días")), tono: "warn", dias: d };
        }
        return { clave: "activo", texto: sit, tono: k.prioridad === "alta" ? "warn" : "ok" };
    }

    /* Calendario: todo lo que tiene fecha, de lo atrasado a los próximos "horizonte" días. */
    function calendario(d, hoy, horizonte) {
        var h = horizonte == null ? 120 : horizonte, items = [];
        function add(fecha, tipo, titulo, detalle, ref, avisoDias, extra) {
            if (!f10(fecha)) return;
            var faltan = dias(hoy, fecha);
            if (faltan > h) return;
            items.push(Object.assign({ fecha: f10(fecha), tipo: tipo, titulo: titulo, detalle: detalle || "", ref: ref, faltan: faltan, aviso: avisoDias == null ? 7 : avisoDias }, extra || {}));
        }
        (d.contratos || []).forEach(function (c) {
            if (c.situacion === "rescindido" || c.situacion === "finalizado") return;
            if (c.renovacion_automatica && dias(hoy, c.fecha_fin) < 0) return;
            add(c.fecha_fin, "contrato", (c.renovacion_automatica ? "Se renueva: " : "Vence contrato: ") + c.titulo, [c.contraparte, c.sucursal].filter(Boolean).join(" · "), c, aviso(c, 30));
        });
        (d.permisos || []).forEach(function (p) {
            if (p.en_tramite) return;
            add(p.fecha_vencimiento, "permiso", "Vence: " + p.nombre, [TIPOS.permiso[p.tipo] || p.tipo, p.sucursal].filter(Boolean).join(" · "), p, aviso(p, 30));
        });
        (d.casos || []).forEach(function (k) {
            if (!casoActivo(k)) return;
            add(k.proxima_fecha, "caso", (k.proxima_actuacion || "Próxima actuación") + ": " + k.titulo, [k.entidad, k.expediente ? "Exp. " + k.expediente : "", k.abogado].filter(Boolean).join(" · "), k, 7);
        });
        var casos = {}; (d.casos || []).forEach(function (k) { casos[k.key] = k; });
        (d.eventos || []).forEach(function (e) {
            var k = casos[e.key_caso];
            if (!k || !casoActivo(k) || e.tipo !== "audiencia" || dias(hoy, e.fecha) < 0) return;
            if (f10(k.proxima_fecha) === f10(e.fecha)) return; /* ya está como próxima actuación */
            add(e.fecha, "audiencia", "Audiencia: " + k.titulo, e.descripcion, k, 7);
        });
        (d.plazos || []).forEach(function (p) {
            if (p.hecho) return;
            add(p.fecha, "plazo", p.titulo, [TIPOS.plazo[p.tipo] || p.tipo, p.sucursal, p.responsable].filter(Boolean).join(" · "), p, aviso(p, 7), { plazo: p });
        });
        items.forEach(function (i) {
            i.grupo = i.faltan < 0 ? "atrasado" : i.faltan <= 7 ? "semana" : i.faltan <= 30 ? "mes" : "despues";
            i.alerta = i.faltan < 0 || i.faltan <= i.aviso;
        });
        return items.sort(function (a, b) { return a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo); });
    }

    /* Matriz de permisos por sucursal: el peor estado de cada tipo en cada sucursal. */
    function matrizPermisos(permisos, sucursales, hoy) {
        var orden = { bad: 0, warn: 1, ok: 2, muted: 3 }, tipos = {}, filas = {};
        (sucursales || []).forEach(function (s) { filas[s] = {}; });
        permisos.forEach(function (p) {
            var s = texto(p.sucursal) || "Toda la empresa", e = estadoPermiso(p, hoy);
            tipos[p.tipo] = true;
            var f = filas[s] || (filas[s] = {});
            if (!f[p.tipo] || orden[e.tono] < orden[f[p.tipo].tono]) f[p.tipo] = e;
        });
        return { tipos: Object.keys(tipos), filas: Object.keys(filas).sort(function (a, b) { return a === "Toda la empresa" ? -1 : b === "Toda la empresa" ? 1 : a.localeCompare(b); }).map(function (s) { return { sucursal: s, estados: filas[s] }; }) };
    }

    window.LEG_logica = { TIPOS: TIPOS, SITUACION_CASO: SITUACION_CASO, SITUACION_CONTRATO: SITUACION_CONTRATO, dias: dias, iso: iso,
        estadoContrato: estadoContrato, estadoPermiso: estadoPermiso, estadoCaso: estadoCaso, casoActivo: casoActivo, calendario: calendario, matrizPermisos: matrizPermisos };
})();
