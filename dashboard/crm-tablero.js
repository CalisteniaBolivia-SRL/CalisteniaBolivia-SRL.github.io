/* Tablero del CRM de ventas (Atención al Cliente): cómo nos va con las listas.
   Quién trabaja y quién no, qué funciona y qué no. Lee del sistema (Firestore) con los permisos de quien mira:
   equipo, listas asignadas, contactos registrados por cada ATC y ventas confirmadas con el registro de ventas.
   Uso: window.CRM_tablero.montar(contenedor). Se actualiza solo cada 2 minutos mientras está visible. */
(function () {
    "use strict";
    var COMISION = window.CM_COMISION || 5, MON = function () { return (window.CM_MONEDA || "Bs") + " "; };
    var RES = { agendado: "Compró o va a pagar", interesado: "Lo va a pensar", no_contesta: "Sin respuesta", no_interesado: "No le interesa",
        ya_activo: "Ya estaba activo", numero_errado: "No contactar", otro: "Otro" };
    var CANAL = { llamada: "Llamada", whatsapp: "WhatsApp", presencial: "En persona", otro: "Otro" };
    var T = { cont: null, periodo: 7, datos: null, error: null, cargando: false, reloj: null };

    function el(tag, attrs, hijos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            var v = attrs[k];
            if (k === "text") e.textContent = v; else if (k === "class") e.className = v;
            else if (k.indexOf("on") === 0 && typeof v === "function") e.addEventListener(k.slice(2), v);
            else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
        });
        (hijos || []).forEach(function (h) { if (h != null && h !== false) e.appendChild(typeof h === "string" || typeof h === "number" ? document.createTextNode(String(h)) : h); });
        return e;
    }
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function hace(n) { var d = new Date(); d.setDate(d.getDate() - n); return iso(d); }
    var hoy = function () { return iso(new Date()); };
    var num = function (n) { return Math.round(Number(n) || 0).toLocaleString("es-BO"); };
    var pct = function (a, b) { return b ? Math.round(a / b * 100) + "%" : "—"; };
    function corta(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] : "—"; }
    function filas(r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { return []; } } return Array.isArray(r) ? r : (r && (r.filas || r.data)) || []; }
    function llamar(t, a) { return window.CM.llamar(t, a || {}).then(function (r) { if (r && r.estado === "error") throw new Error(r.error || "error"); return r; }); }

    function cargar() {
        if (T.cargando) return;
        T.cargando = true; pintar();
        var desde = hace(30);
        Promise.all([llamar("comercial_equipo"), llamar("comercial_asignaciones"), llamar("comercial_gestiones", { desde: desde, hasta: hoy() }),
            llamar("comercial_confirmadas", { desde: desde }).catch(function () { return { filas: [] }; })])
            .then(function (x) { T.datos = { equipo: filas(x[0]), asig: filas(x[1]), gest: filas(x[2]), conf: filas(x[3]).filter(function (c) { return !c.anulada; }) }; T.error = null; T.hora = new Date(); })
            .catch(function (e) { T.error = (e && e.message) || String(e); })
            .then(function () { T.cargando = false; pintar(); });
    }

    /* ---------- cálculos ---------- */
    function calcular() {
        var D = T.datos, desde = T.periodo === 1 ? hoy() : hace(T.periodo - 1), h = hoy();
        var activas = D.equipo.filter(function (e) { return Number(e.estado == null ? 1 : e.estado) > 0; });
        var nom = {}; activas.forEach(function (e) { nom[e.key] = e.nombre; });
        var asig = D.asig.filter(function (a) { return a.lote && a.key_ejecutiva; });
        var grupoDe = {}; asig.forEach(function (a) { grupoDe[a.key_cliente || a.key] = a.grupo_titulo || "Sin grupo"; });
        var gest = D.gest.filter(function (g) { return String(g.fecha_on).slice(0, 10) >= desde; });
        var conf = D.conf.filter(function (c) { return String(c.fecha_venta).slice(0, 10) >= desde; });
        var confPorCliente = {}; conf.forEach(function (c) { confPorCliente[c.key_cliente] = c; });

        /* Por ATC */
        var porAtc = activas.map(function (e) {
            var g = gest.filter(function (x) { return x.key_ejecutiva === e.key; }), todas = D.gest.filter(function (x) { return x.key_ejecutiva === e.key; });
            var cli = {}, dias = {}; g.forEach(function (x) { cli[x.key_cliente] = 1; dias[String(x.fecha_on).slice(0, 10)] = 1; });
            var lista = asig.filter(function (a) { return a.key_ejecutiva === e.key; });
            var tocados = lista.filter(function (a) { return todas.some(function (x) { return x.key_cliente === (a.key_cliente || a.key) && String(x.fecha_on) >= String(a.fecha_on); }); }).length;
            var hoyN = {}; g.forEach(function (x) { if (String(x.fecha_on).slice(0, 10) === h) hoyN[x.key_cliente] = 1; });
            var c = conf.filter(function (x) { return x.key_ejecutiva === e.key; });
            var ult = todas.map(function (x) { return String(x.fecha_on); }).sort().pop() || null;
            var diasSin = ult ? Math.round((new Date(h) - new Date(ult.slice(0, 10))) / 864e5) : null;
            var estado = !lista.length ? ["muted", "Sin lista"] : Object.keys(hoyN).length ? ["ok", "Trabajando hoy"] : diasSin == null ? ["bad", "Nunca contactó"] : diasSin >= 2 ? ["bad", "Inactiva " + diasSin + " días"] : ["warn", "Sin actividad hoy"];
            return { key: e.key, nombre: e.nombre, sucursal: (e.sucursales || []).join(", "), lista: lista.length, tocados: tocados, hoy: Object.keys(hoyN).length,
                contactos: Object.keys(cli).length, dias: Object.keys(dias).length, reportadas: g.filter(function (x) { return x.resultado === "agendado"; }).length,
                confirmadas: c.length, bs: c.length * COMISION, ultimo: ult, estado: estado };
        }).sort(function (a, b) { return b.confirmadas - a.confirmadas || b.contactos - a.contactos; });

        /* Qué funciona: por grupo de lista, por canal, por resultado y por sucursal */
        function agrupar(clave) {
            var m = {};
            gest.forEach(function (x) { var k = clave(x); var o = m[k] || (m[k] = { nombre: k, contactos: {}, reportadas: 0 }); o.contactos[x.key_cliente] = 1; if (x.resultado === "agendado") o.reportadas++; });
            return Object.keys(m).map(function (k) {
                var o = m[k], cl = Object.keys(o.contactos), c = cl.filter(function (id) { return confPorCliente[id]; }).length;
                return { nombre: k, contactos: cl.length, reportadas: o.reportadas, confirmadas: c, conv: cl.length ? c / cl.length : 0 };
            }).sort(function (a, b) { return b.conv - a.conv || b.contactos - a.contactos; });
        }
        var porGrupo = agrupar(function (x) { return grupoDe[x.key_cliente] || "Otras listas"; });
        var porCanal = agrupar(function (x) { return CANAL[x.canal] || "Otro"; });
        var porSuc = agrupar(function (x) { return String(x.sucursal || "Sin sucursal").trim(); });
        var res = {}; gest.forEach(function (x) { var k = RES[x.resultado] || "Otro"; res[k] = (res[k] || 0) + 1; });
        var porRes = Object.keys(res).map(function (k) { return { nombre: k, n: res[k] }; }).sort(function (a, b) { return b.n - a.n; });

        /* Por día (14 días) */
        var dias = [];
        for (var i = 13; i >= 0; i--) {
            var d = hace(i), cl = {};
            D.gest.forEach(function (x) { if (String(x.fecha_on).slice(0, 10) === d) cl[x.key_cliente] = 1; });
            dias.push({ dia: d, contactos: Object.keys(cl).length, ventas: D.conf.filter(function (c) { return String(c.fecha_venta).slice(0, 10) === d; }).length });
        }

        var contactados = {}; gest.forEach(function (x) { contactados[x.key_cliente] = 1; });
        var nContact = Object.keys(contactados).length;
        var totalLista = asig.length, tocadosTot = porAtc.reduce(function (a, x) { return a + x.tocados; }, 0);
        return {
            porAtc: porAtc, porGrupo: porGrupo, porCanal: porCanal, porSuc: porSuc, porRes: porRes, dias: dias, totalRes: gest.length,
            k: { contactos: nContact, reportadas: gest.filter(function (x) { return x.resultado === "agendado"; }).length, confirmadas: conf.length, bs: conf.length * COMISION,
                conv: nContact ? conf.length / nContact : 0, cobertura: totalLista ? tocadosTot / totalLista : 0, totalLista: totalLista,
                trabajando: porAtc.filter(function (x) { return x.estado[0] === "ok"; }).length, conLista: porAtc.filter(function (x) { return x.lista; }).length,
                inactivas: porAtc.filter(function (x) { return x.estado[0] === "bad"; }) }
        };
    }

    /* ---------- dibujo ---------- */
    function kpi(et, val, sub, tono) { return el("div", { class: "crm-kpi" + (tono ? " is-" + tono : "") }, [el("span", { text: et }), el("b", { text: val }), sub ? el("small", { text: sub }) : null]); }
    function barras(lista, valor, etiqueta, max) {
        max = max || Math.max.apply(null, lista.map(valor).concat([1]));
        return el("div", { class: "crm-barras" }, lista.map(function (x) {
            var v = valor(x);
            return el("div", { class: "crm-bar" }, [el("span", { class: "crm-bar-n", text: x.nombre }), el("span", { class: "crm-bar-t" }, [el("i", { style: "width:" + Math.max(2, v / max * 100) + "%" })]), el("span", { class: "crm-bar-v", text: etiqueta(x) })]);
        }));
    }
    function pintar() {
        var c = T.cont; if (!c) return;
        c.textContent = "";
        var cab = el("div", { class: "crm-cab" }, [
            el("div", { class: "crm-per", role: "tablist" }, [[1, "Hoy"], [7, "7 días"], [30, "30 días"]].map(function (p) {
                return el("button", { type: "button", class: T.periodo === p[0] ? "is-on" : "", text: p[1], onclick: function () { T.periodo = p[0]; pintar(); } });
            })),
            el("span", { class: "crm-hora", text: T.cargando ? "Actualizando…" : T.hora ? "Actualizado " + pad(T.hora.getHours()) + ":" + pad(T.hora.getMinutes()) : "" })
        ]);
        c.appendChild(cab);
        if (T.error && !T.datos) { c.appendChild(el("p", { class: "crm-vacio", text: /permiso|sesi/i.test(T.error) ? "Para ver este tablero, ingresá al centro de mando con un usuario del ERP con permiso del muro, Dirección o Jefe de ATC." : "No se pudo cargar: " + T.error })); return; }
        if (!T.datos) { c.appendChild(el("p", { class: "crm-vacio", text: "Cargando el CRM…" })); return; }
        var R = calcular(), k = R.k;
        if (!R.porAtc.length) { c.appendChild(el("p", { class: "crm-vacio", text: "Todavía no hay ATC en el equipo. Aparecen cuando entran al centro de mando con su usuario del ERP." })); return; }

        c.appendChild(el("div", { class: "crm-kpis" }, [
            kpi("Clientes contactados", num(k.contactos), k.trabajando + " de " + k.conLista + " ATC trabajando hoy", k.conLista && k.trabajando < k.conLista ? "warn" : "ok"),
            kpi("Ventas reportadas", num(k.reportadas), "«Compró o va a pagar»"),
            kpi("Ventas confirmadas", num(k.confirmadas), "Con el registro de ventas", k.confirmadas ? "ok" : ""),
            kpi("Conversión", k.contactos ? Math.round(k.conv * 100) + "%" : "—", "Confirmadas ÷ contactados", k.contactos && k.conv < 0.03 ? "bad" : ""),
            kpi("Comisiones", MON() + num(k.bs), MON() + num(COMISION) + " por venta confirmada"),
            kpi("Listas trabajadas", k.totalLista ? Math.round(k.cobertura * 100) + "%" : "—", num(k.totalLista) + " clientes asignados", k.totalLista && k.cobertura < 0.5 ? "warn" : "")
        ]));
        if (k.inactivas.length) c.appendChild(el("div", { class: "crm-alerta" }, [el("b", { text: "Atención: " }), k.inactivas.map(function (x) { return x.nombre + " (" + x.estado[1].toLowerCase() + ")"; }).join(", ") + "."]));

        /* Quién trabaja y quién no */
        var tabla = el("table", { class: "crm-tabla" }, [
            el("thead", {}, [el("tr", {}, ["ATC", "Estado", "Hoy", "Contactados", "Días activos", "Lista trabajada", "Reportadas", "Confirmadas", "Conversión", "Último contacto"].map(function (t, i) { return el("th", { class: i > 1 ? "is-n" : "", text: t }); }))]),
            el("tbody", {}, R.porAtc.map(function (x) {
                return el("tr", {}, [
                    el("td", {}, [el("b", { text: x.nombre }), x.sucursal ? el("small", { text: x.sucursal }) : null]),
                    el("td", {}, [el("span", { class: "crm-chip is-" + x.estado[0], text: x.estado[1] })]),
                    el("td", { class: "is-n", text: num(x.hoy) }), el("td", { class: "is-n", text: num(x.contactos) }),
                    el("td", { class: "is-n", text: x.dias + " de " + T.periodo }),
                    el("td", { class: "is-n", text: x.lista ? pct(x.tocados, x.lista) + " de " + num(x.lista) : "—" }),
                    el("td", { class: "is-n", text: num(x.reportadas) }), el("td", { class: "is-n", text: num(x.confirmadas) }),
                    el("td", { class: "is-n", text: pct(x.confirmadas, x.contactos) }), el("td", { class: "is-n", text: x.ultimo ? corta(x.ultimo) : "—" })
                ]);
            }))
        ]);
        var maxGrupo = Math.max.apply(null, R.porGrupo.concat(R.porCanal).map(function (x) { return x.conv; }).concat([0.0001]));
        c.appendChild(el("div", { class: "crm-fila" }, [
            el("section", { class: "crm-card crm-ancha" }, [el("h3", { text: "Quién trabaja y quién no" }), el("p", { class: "crm-nota", text: "Ordenado por ventas confirmadas. «Lista trabajada»: clientes de su lista que ya contactó." }), el("div", { class: "crm-scroll" }, [tabla])]),
            el("section", { class: "crm-card" }, [
                el("h3", { text: "Qué funciona: conversión por lista" }),
                el("p", { class: "crm-nota", text: "Ventas confirmadas ÷ clientes contactados de cada grupo." }),
                R.porGrupo.length ? barras(R.porGrupo, function (x) { return x.conv; }, function (x) { return Math.round(x.conv * 100) + "% · " + x.confirmadas + " de " + x.contactos; }, maxGrupo) : el("p", { class: "crm-nota", text: "Sin contactos en el período." }),
                el("h3", { text: "Llamada o WhatsApp" }),
                R.porCanal.length ? barras(R.porCanal, function (x) { return x.conv; }, function (x) { return Math.round(x.conv * 100) + "% · " + x.confirmadas + " de " + x.contactos; }, maxGrupo) : null
            ])
        ]));
        c.appendChild(el("div", { class: "crm-fila" }, [
            el("section", { class: "crm-card" }, [el("h3", { text: "¿Cómo les fue? (todos los contactos)" }),
                R.porRes.length ? barras(R.porRes, function (x) { return x.n; }, function (x) { return pct(x.n, R.totalRes) + " · " + num(x.n); }) : el("p", { class: "crm-nota", text: "Sin contactos en el período." })]),
            el("section", { class: "crm-card" }, [el("h3", { text: "Por sucursal" }), el("p", { class: "crm-nota", text: "Clientes contactados y conversión." }),
                R.porSuc.length ? barras(R.porSuc, function (x) { return x.contactos; }, function (x) { return num(x.contactos) + " · " + Math.round(x.conv * 100) + "%"; }) : null]),
            el("section", { class: "crm-card" }, [el("h3", { text: "Últimos 14 días" }), el("p", { class: "crm-nota", text: "Clientes contactados por día y ventas confirmadas." }),
                el("div", { class: "crm-dias" }, R.dias.map(function (d) {
                    var max = Math.max.apply(null, R.dias.map(function (x) { return x.contactos; }).concat([1]));
                    return el("div", { class: "crm-dia", title: corta(d.dia) + ": " + d.contactos + " contactados, " + d.ventas + " ventas" }, [
                        el("span", { class: "crm-dia-v", text: d.ventas ? String(d.ventas) : "" }),
                        el("i", { style: "height:" + Math.max(2, d.contactos / max * 100) + "%" }),
                        el("small", { text: corta(d.dia).slice(0, 2) })]);
                }))])
        ]));
    }

    window.CRM_tablero = {
        montar: function (cont) {
            T.cont = cont;
            if (!T.datos || Date.now() - (T.hora || 0) > 120000) cargar(); else pintar();
            if (!T.reloj) T.reloj = setInterval(function () { if (T.cont && T.cont.offsetParent && !document.hidden) cargar(); }, 120000);
        },
        _interno: { T: T, calcular: calcular }
    };
})();
