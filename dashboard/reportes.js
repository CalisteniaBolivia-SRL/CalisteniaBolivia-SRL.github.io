/* Tablero Reportes del centro de mando.
   1. Traspasos de mensualidad   2. Paquetes eliminados   3. Modificaciones de fecha
   4. Convenios de empresa y recargas   5. Eliminación de usuarios duplicados
   Los datos vienen del MCP de Calistenia (window.CM.llamar). Las herramientas reporte_* son nuevas
   (servidor: componente reporte_centro_mando); mientras el MCP no las tenga:
   - Modificaciones de fecha usa listar_prorrogas (solo prórrogas).
   - Convenios usa listar_ventas (ventas de paquetes CONVENIO, sin número de recarga histórico).
   - Traspasos, eliminados y duplicados avisan que están pendientes de activación. */
(function () {
    "use strict";

    var TOOLS = {
        traspasos: "reporte_traspasos",
        eliminados: "reporte_paquetes_eliminados",
        fechas: "reporte_cambios_fecha",
        convenios: "reporte_convenios",
        duplicados: "reporte_usuarios_eliminados",
        cumpleanos: "clientes_cumpleanos",
        prorrogas: "listar_prorrogas",
        ventas: "listar_ventas"
    };

    /* ---------------- Utilidades puras ---------------- */
    var pad = function (n) { return String(n).padStart(2, "0"); };
    var iso = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
    var texto = function (v) { return v == null ? "" : String(v).trim(); };
    function filas(r) {
        if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { return []; } }
        if (Array.isArray(r)) return r;
        if (r && Array.isArray(r.filas)) return r.filas;
        if (r && Array.isArray(r.data)) return r.data;
        return [];
    }
    function sinTilde(s) { return texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

    function rangoRapido(cual, hoy) {
        var h = hoy || new Date(), y = h.getFullYear(), m = h.getMonth();
        if (cual === "mes_anterior") return { desde: iso(new Date(y, m - 1, 1)), hasta: iso(new Date(y, m, 0)) };
        if (cual === "30") return { desde: iso(new Date(y, m, h.getDate() - 29)), hasta: iso(h) };
        if (cual === "90") return { desde: iso(new Date(y, m, h.getDate() - 89)), hasta: iso(h) };
        return { desde: iso(new Date(y, m, 1)), hasta: iso(h) };
    }

    /* Nombre a mostrar de un cliente / usuario: el nombre si el MCP lo trae, si no la clave corta. */
    function persona(nombre, key) {
        var n = texto(nombre);
        if (n) return n;
        var k = texto(key);
        return k ? "Usuario " + k.slice(0, 8) : "—";
    }

    /* Empresa del convenio: la que dice el paquete después de "CONVENIO" (así se agrupan igual todas las ventas
       del mismo convenio); si el paquete no la dice, la razón social de la factura cuando es real. */
    function empresaConvenio(r) {
        var ep = texto(r.empresa_paquete);
        if (!ep) ep = texto(r.paquete).replace(/^.*convenio[\s:.\-]*/i, "").trim();
        if (ep) return ep;
        var rs = texto(r.razon_social);
        if (rs && !/^(s\/?n|sin nombre|-|0|consumidor final|ninguno?)$/i.test(rs)) return rs;
        return "Sin empresa";
    }

    /* Agrupa convenios por empresa. Si la fila no trae numero_recarga, se cuenta dentro del período. */
    function resumenConvenios(lista) {
        var porCliente = {};
        var ordenadas = lista.slice().sort(function (a, b) { return texto(a.fecha_on || a.fecha).localeCompare(texto(b.fecha_on || b.fecha)); });
        ordenadas.forEach(function (r) {
            if (r.numero_recarga == null) {
                var k = (r.key_cliente || r.cliente || r.key_paquete_venta) + "|" + texto(r.paquete);
                porCliente[k] = (porCliente[k] || 0) + 1;
                r._recarga = porCliente[k];
                r._recarga_estimada = true;
            } else r._recarga = num(r.numero_recarga);
        });
        var emp = {};
        lista.forEach(function (r) {
            var e = empresaConvenio(r);
            var g = emp[e] || (emp[e] = { empresa: e, ventas: 0, clientes: {}, recargas: 0, monto: 0 });
            g.ventas++;
            g.clientes[r.key_cliente || r.cliente || r.key_paquete_venta] = true;
            if (r._recarga > 1) g.recargas++;
            g.monto += num(r.monto != null ? r.monto : r.precio);
        });
        return Object.keys(emp).map(function (k) { var g = emp[k]; g.clientes = Object.keys(g.clientes).length; return g; })
            .sort(function (a, b) { return b.ventas - a.ventas || a.empresa.localeCompare(b.empresa); });
    }

    function csv(cols, lista) {
        var esc = function (v) { var s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        return "﻿" + [cols.map(function (c) { return esc(c[1]); }).join(";")]
            .concat(lista.map(function (r) { return cols.map(function (c) { return esc(typeof c[2] === "function" ? c[2](r) : r[c[0]]); }).join(";"); }))
            .join("\r\n");
    }

    /* ----- Cumpleañeros ----- */
    /* Fecha de nacimiento en AAAA-MM-DD, AAAA-MM-DDThh… o DD/MM/AAAA. Devuelve { y, m, d } o null. */
    function leerNacimiento(v) {
        var s = texto(v), m;
        if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return { y: +m[1], m: +m[2], d: +m[3] };
        if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return { y: +m[3], m: +m[2], d: +m[1] };
        return null;
    }
    /* Cumpleañeros del mes "AAAA-MM": día, edad que cumplen, si es hoy o cuántos días faltan. */
    function cumpleanerosDelMes(lista, mes, hoyIso) {
        var y = +mes.slice(0, 4), m = +mes.slice(5, 7);
        var bisiesto = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        var vistos = {};
        return lista.map(function (r) {
            var n = leerNacimiento(r.fecha_nacimiento);
            if (!n || n.m !== m || n.d < 1 || n.d > 31) return null;
            var k = texto(r.key_usuario || r.key_cliente || (r.cliente + r.telefono));
            if (vistos[k]) return null;
            vistos[k] = true;
            var dia = n.m === 2 && n.d === 29 && !bisiesto ? 28 : n.d;
            var fechaCumple = mes + "-" + pad(dia);
            var faltan = Math.round((new Date(fechaCumple + "T00:00:00") - new Date(hoyIso + "T00:00:00")) / 86400000);
            var edad = n.y >= 1900 && n.y < y ? y - n.y : null;
            return Object.assign({}, r, { dia: dia, fecha_cumple: fechaCumple, edad: edad, faltan: faltan, cuando: faltan === 0 ? "hoy" : faltan < 0 ? "paso" : faltan <= 7 ? "semana" : "mes" });
        }).filter(Boolean).sort(function (a, b) { return a.dia - b.dia || texto(a.cliente).localeCompare(texto(b.cliente)); });
    }
    var MENSAJES_CUMPLE = [
        "¡Feliz cumpleaños, {nombre}! 🎉 De parte de toda la familia de Calistenia Bolivia te deseamos un año lleno de fuerza, salud y nuevas metas cumplidas. ¡Cada repetición cuenta y este año va a ser el mejor! 💪",
        "¡{nombre}, feliz cumpleaños! 🥳 Que este nuevo año de vida venga con más energía, más disciplina y muchos logros. Gracias por entrenar con nosotros: tu esfuerzo inspira. ¡A celebrar a lo grande! 💪🔥",
        "¡Feliz cumple, {nombre}! 🎂 Hoy celebramos tu vida y todo lo que has logrado. Recuerda: el cuerpo logra lo que la mente cree. Te deseamos un año increíble. ¡Un abrazo de todo el equipo de Calistenia Bolivia! 💪",
        "¡Muchas felicidades, {nombre}! 🎉 Un año más para ser más fuerte que ayer. Que la vida te regale salud, alegría y muchas metas cumplidas dentro y fuera del entrenamiento. ¡Feliz cumpleaños! 💪",
        "¡Feliz cumpleaños, {nombre}! 🌟 Gracias por ser parte de Calistenia Bolivia. Que este año sea de progreso, constancia y momentos felices. ¡Te mereces lo mejor! 🎂💪",
        "¡{nombre}, que tengas un cumpleaños espectacular! 🥳 Nuevo año, nuevas metas: seguimos entrenando juntos para que sea el más fuerte de todos. ¡Felicidades de parte de todo el equipo! 💪🔥"
    ];
    var INVITACION_REGRESO = " Y como regalo, te esperamos de vuelta: escríbenos y te reservamos tu clase de regreso. 🎁";
    function hashTexto(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h); }
    /* Mensaje de felicitación: plantilla elegida o, en "auto", una distinta por cliente (siempre la misma para el mismo cliente).
       A quien no tiene plan vigente se le suma una invitación a volver. */
    function mensajeCumple(r, plantilla) {
        var i = plantilla === "auto" || plantilla == null ? hashTexto(texto(r.key_usuario || r.cliente)) % MENSAJES_CUMPLE.length : +plantilla;
        var nombre = texto(r.cliente).split(/\s+/)[0] || "";
        var msg = MENSAJES_CUMPLE[i] || MENSAJES_CUMPLE[0];
        msg = msg.replace(/\{nombre\}/g, nombre).replace(/,\s*!/g, "!").replace(/^¡\s*,\s*(\S)/, function (_, c) { return "¡" + c.toUpperCase(); }).replace(/\s+([,!])/g, "$1");
        if (r.activo === false) msg += INVITACION_REGRESO;
        return msg;
    }
    function linkWhatsApp(tel, msg) {
        var d = texto(tel).replace(/\D/g, "");
        if (d.length < 8) return null;
        if (d.length === 8) d = "591" + d;
        return "https://wa.me/" + d + "?text=" + encodeURIComponent(msg);
    }

    window.REP_calc = { rangoRapido: rangoRapido, empresaConvenio: empresaConvenio, resumenConvenios: resumenConvenios, persona: persona, csv: csv,
        cumpleanerosDelMes: cumpleanerosDelMes, mensajeCumple: mensajeCumple, leerNacimiento: leerNacimiento, MENSAJES_CUMPLE: MENSAJES_CUMPLE };

    /* ---------------- Interfaz ---------------- */
    var raiz = document.getElementById("reportes");
    if (!raiz || !window.CM) return;
    var $ = function (s) { return raiz.querySelector(s); };
    function el(tag, attrs, hijos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === "text") e.textContent = attrs[k];
            else if (k === "class") e.className = attrs[k];
            else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
            else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
        });
        (hijos || []).forEach(function (h) { if (h != null) e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); });
        return e;
    }
    var bs = function (v) { return "Bs " + Math.round(num(v)).toLocaleString("es-BO"); };
    var fecha = function (s) { if (!s) return "—"; var p = texto(s).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : texto(s); };
    var fechaHora = function (s) { if (!s) return "—"; var t = texto(s).replace(" ", "T"); return fecha(t) + (t.length > 15 ? " " + t.slice(11, 16) : ""); };
    var muted = function (t) { return el("div", { class: "rp-muted", text: t }); };

    var estado = { tab: "traspasos", desde: "", hasta: "", buscar: "", datos: {}, avisos: {}, cargando: {}, mesCumple: "", plantilla: "auto", soloCumple: "" };

    function esNoDisponible(e) { return /unknown tool|tool not found|not found|no existe|desconocid|no encontrad|-32601/i.test(String((e && e.message) || e)); }
    function llamar(tool, args) {
        return window.CM.llamar(tool, args || {}).then(function (r) {
            if (r && r.estado === "error") throw new Error(r.error || "error del servidor");
            if (r && typeof r.error === "string") throw new Error(r.error);
            return r;
        });
    }
    /* Junta páginas de listar_ventas (filas + siguiente_offset), hasta 3.000 filas. */
    function todasLasVentas(args) {
        var acc = [];
        function pagina(offset, n) {
            return llamar(TOOLS.ventas, Object.assign({}, args, { limite: 200, offset: offset })).then(function (r) {
                acc = acc.concat(filas(r));
                var sig = r && r.siguiente_offset;
                return sig != null && n < 14 ? pagina(sig, n + 1) : { filas: acc, cortado: sig != null };
            });
        }
        return pagina(0, 0);
    }

    /* Cada reporte: cómo se carga (con plan B si existe) y cómo se pinta. */
    var REPORTES = {
        traspasos: {
            titulo: "Traspasos de mensualidad",
            cargar: function (a) { return llamar(TOOLS.traspasos, a).then(function (r) { return { filas: filas(r) }; }); },
            kpis: function (l) {
                var de = {}, a = {};
                l.forEach(function (r) { de[r.key_usuario_anterior] = 1; a[r.key_usuario_nuevo] = 1; });
                return [["Traspasos", l.length], ["Titulares que cedieron", Object.keys(de).length], ["Con cambio de fecha", l.filter(function (r) { return r.cambio_fecha; }).length]];
            },
            columnas: [
                ["fecha_on", "Fecha", function (r) { return fechaHora(r.fecha_on); }],
                ["de", "De (titular)", function (r) { return persona(r.cliente_anterior, r.key_usuario_anterior); }],
                ["a", "A (nuevo usuario)", function (r) { return persona(r.cliente_nuevo, r.key_usuario_nuevo); }],
                ["paquete", "Paquete"], ["sucursal", "Sucursal"],
                ["vigencia", "Vigencia", function (r) { return fecha(r.fecha_inicio) + " – " + fecha(r.fecha_fin); }],
                ["responsable", "Hecho por", function (r) { return persona(r.responsable, r.key_usuario_responsable); }],
                ["nota", "Nota", function (r) { return (r.cambio_fecha ? "También cambió la fecha. " : "") + texto(r.observacion); }]
            ],
            vacio: "No hubo traspasos en este período.",
            nota: "Se registran desde que se instaló el historial en el servidor; los traspasos anteriores no quedaron guardados."
        },
        eliminados: {
            titulo: "Paquetes eliminados",
            cargar: function (a) { return llamar(TOOLS.eliminados, a).then(function (r) { return { filas: filas(r) }; }); },
            kpis: function (l) {
                var anuladas = l.filter(function (r) { return r.origen !== "paquete_quitado"; });
                return [["Ventas anuladas", anuladas.length], ["Monto anulado", bs(anuladas.reduce(function (s, r) { return s + num(r.monto); }, 0))],
                    ["Paquetes quitados a un cliente", l.length - anuladas.length], ["Sin motivo", l.filter(function (r) { return !texto(r.motivo); }).length]];
            },
            columnas: [
                ["fecha_eliminacion", "Eliminado", function (r) { return fechaHora(r.fecha_eliminacion); }],
                ["tipo", "Tipo", function (r) { return r.origen === "paquete_quitado" ? "Paquete quitado" : "Venta anulada"; }],
                ["paquete", "Paquete"], ["sucursal", "Sucursal"],
                ["clientes", "Cliente(s)", function (r) { var n = r.clientes_nombres || []; return (r.clientes || []).map(function (k, i) { return persona(n[i], k); }).join(", ") || "—"; }],
                ["monto", "Monto", function (r) { return bs(r.monto); }],
                ["fecha_venta", "Vendido", function (r) { return fecha(r.fecha_venta); }],
                ["motivo", "Motivo", function (r) { return texto(r.motivo) || "Sin motivo"; }],
                ["responsable", "Eliminado por", function (r) { return persona(r.responsable, r.key_usuario_responsable); }]
            ],
            numericas: ["monto"],
            vacio: "No se eliminaron paquetes en este período."
        },
        fechas: {
            titulo: "Modificaciones de fecha",
            cargar: function (a) {
                return llamar(TOOLS.fechas, a).then(function (r) { return { filas: filas(r) }; }).catch(function (e) {
                    if (!esNoDisponible(e)) throw e;
                    return llamar(TOOLS.prorrogas, Object.assign({ limite: 500 }, a)).then(function (r) {
                        return {
                            parcial: "Por ahora solo se ven las prórrogas. Los cambios de fecha de inicio o fin hechos desde el perfil del cliente aparecerán cuando se active el reporte completo.",
                            filas: filas(r).map(function (p) {
                                return { origen: "prorroga", fecha_on: p.fecha, cliente: p.cliente, paquete: p.paquete, sucursal: p.sucursal, dias: p.dias, fecha_fin_nueva: p.nueva_fecha_fin, descripcion: p.motivo, responsable: p.registrado_por, vigente: true };
                            })
                        };
                    });
                });
            },
            kpis: function (l) {
                var pr = l.filter(function (r) { return r.origen === "prorroga" && r.vigente !== false; });
                return [["Prórrogas", pr.length], ["Días otorgados en prórrogas", pr.reduce(function (s, r) { return s + num(r.dias); }, 0)],
                    ["Cambios manuales de fecha", l.filter(function (r) { return r.origen === "cambio_fecha"; }).length], ["Prórrogas anuladas", l.filter(function (r) { return r.vigente === false; }).length]];
            },
            columnas: [
                ["fecha_on", "Fecha", function (r) { return fechaHora(r.fecha_on); }],
                ["tipo", "Tipo", function (r) { return r.origen === "prorroga" ? "Prórroga" + (r.vigente === false ? " (anulada)" : "") : "Cambio de fecha"; }],
                ["cliente", "Cliente", function (r) { return persona(r.cliente, r.key_cliente); }],
                ["paquete", "Paquete"], ["sucursal", "Sucursal"],
                ["inicio", "Inicio", function (r) { return r.fecha_inicio_nueva && r.fecha_inicio_nueva !== r.fecha_inicio_anterior ? fecha(r.fecha_inicio_anterior) + " → " + fecha(r.fecha_inicio_nueva) : "—"; }],
                ["fin", "Fin", function (r) { return r.fecha_fin_anterior ? fecha(r.fecha_fin_anterior) + " → " + fecha(r.fecha_fin_nueva) : fecha(r.fecha_fin_nueva); }],
                ["dias", "Días", function (r) { var d = num(r.dias); return r.dias == null ? "—" : (d > 0 ? "+" : "") + d; }],
                ["descripcion", "Motivo", function (r) { return texto(r.descripcion) || "—"; }],
                ["responsable", "Hecho por", function (r) { return persona(r.responsable, r.key_usuario_responsable); }]
            ],
            numericas: ["dias"],
            vacio: "No hubo prórrogas ni cambios de fecha en este período."
        },
        convenios: {
            titulo: "Convenios de empresa y recargas",
            cargar: function (a) {
                return llamar(TOOLS.convenios, a).then(function (r) { return { filas: filas(r) }; }).catch(function (e) {
                    if (!esNoDisponible(e)) throw e;
                    return todasLasVentas(a).then(function (v) {
                        return {
                            parcial: "Vista provisional con las ventas del período. El número de recarga se cuenta solo dentro de las fechas elegidas; con el reporte completo se cuenta desde la primera compra del cliente.",
                            cortado: v.cortado,
                            filas: v.filas.filter(function (r) { return /convenio/i.test(texto(r.paquete)); }).map(function (r) {
                                var cl = r.clientes || [];
                                return { fecha_on: r.fecha, paquete: texto(r.paquete), razon_social: r.razon_social, nit: r.nit, sucursal: texto(r.sucursal), monto: r.precio, cliente: typeof cl[0] === "string" ? cl[0] : (cl[0] && (cl[0].nombre || cl[0].cliente)) || "", key_paquete_venta: r.key_paquete_venta };
                            })
                        };
                    });
                });
            },
            kpis: function (l, resumen) {
                return [["Ventas de convenio", l.length], ["Empresas", resumen.length], ["Recargas (renovaciones)", l.filter(function (r) { return r._recarga > 1; }).length], ["Monto", bs(l.reduce(function (s, r) { return s + num(r.monto); }, 0))]];
            },
            columnas: [
                ["fecha_on", "Fecha", function (r) { return fecha(r.fecha_on); }],
                ["empresa", "Empresa", function (r) { return empresaConvenio(r); }],
                ["cliente", "Cliente", function (r) { return persona(r.cliente, r.key_cliente); }],
                ["paquete", "Paquete"], ["sucursal", "Sucursal"],
                ["recarga", "Credencial", function (r) { return r._recarga > 1 ? "Recarga n.º " + (r._recarga - 1) : "Primera compra"; }],
                ["vigencia", "Vigencia", function (r) { return r.fecha_inicio ? fecha(r.fecha_inicio) + " – " + fecha(r.fecha_fin) : "—"; }],
                ["nit", "NIT", function (r) { return texto(r.nit) || "—"; }],
                ["monto", "Monto", function (r) { return bs(r.monto); }]
            ],
            numericas: ["monto"],
            vacio: "No hubo ventas de paquetes CONVENIO en este período."
        },
        cumpleanos: {
            titulo: "Cumpleañeros del mes",
            porMes: true,
            cargar: function () {
                return llamar(TOOLS.cumpleanos, { mes: estado.mesCumple }).then(function (r) {
                    return { filas: cumpleanerosDelMes(filas(r), estado.mesCumple, iso(new Date())) };
                });
            },
            kpis: function (l) {
                return [["Cumpleañeros del mes", l.length], ["Cumplen hoy", l.filter(function (r) { return r.cuando === "hoy"; }).length],
                    ["Próximos 7 días", l.filter(function (r) { return r.cuando === "semana"; }).length], ["Con plan vigente", l.filter(function (r) { return r.activo !== false; }).length]];
            },
            columnas: [
                ["dia", "Día", function (r) { return pad(r.dia) + "/" + estado.mesCumple.slice(5, 7); }],
                ["cuando", "Cuándo", function (r) { return r.cuando === "hoy" ? "¡Hoy!" : r.faltan < 0 ? "Hace " + (-r.faltan) + (r.faltan === -1 ? " día" : " días") : "En " + r.faltan + (r.faltan === 1 ? " día" : " días"); }],
                ["cliente", "Cliente", function (r) { return persona(r.cliente, r.key_usuario); }],
                ["edad", "Cumple", function (r) { return r.edad ? r.edad + " años" : "—"; }],
                ["telefono", "Teléfono", function (r) { return texto(r.telefono) || "—"; }],
                ["sucursal", "Sucursal", function (r) { return texto(r.sucursal) || "—"; }],
                ["estado", "Estado", function (r) { return r.activo === false ? "Sin plan vigente" + (r.fecha_fin ? " (venció " + fecha(r.fecha_fin) + ")" : "") : "Activo"; }],
                ["mensaje", "Mensaje de felicitación", function (r) { return mensajeCumple(r, estado.plantilla); }, function (r) {
                    var msg = mensajeCumple(r, estado.plantilla), wa = linkWhatsApp(r.telefono, msg);
                    return el("div", { class: "rp-cumple-msg" }, [el("p", { text: msg }),
                        wa ? el("a", { class: "rp-btn rp-wa", href: wa, target: "_blank", rel: "noopener", text: "Felicitar por WhatsApp" }) : el("span", { class: "rp-muted", text: "Sin teléfono válido" })]);
                }]
            ],
            numericas: [],
            filaClase: function (r) { return r.cuando === "hoy" ? "is-hoy" : r.cuando === "paso" ? "is-paso" : null; },
            vacio: "No hay clientes que cumplan años en este mes.",
            nota: "El botón abre WhatsApp con el mensaje listo; nada se envía hasta que la persona lo manda. A quien no tiene plan vigente se le suma una invitación a volver.",
            pendiente: "El MCP de Calistenia todavía no tiene la herramienta de cumpleaños (clientes_cumpleanos). La fecha de nacimiento está en el servicio de usuarios de Servisofts: cuando Capital Corp la exponga, aquí aparecen los cumpleañeros con su mensaje."
        },
        duplicados: {
            titulo: "Eliminación de usuarios duplicados",
            cargar: function (a) { return llamar(TOOLS.duplicados, a).then(function (r) { return { filas: filas(r) }; }); },
            kpis: function (l) { return [["Usuarios eliminados", l.length]]; },
            columnas: [
                ["fecha_on", "Fecha", function (r) { return fechaHora(r.fecha_on); }],
                ["eliminado", "Usuario eliminado", function (r) { return persona(r.usuario_eliminado, r.key_usuario_eliminado); }],
                ["conservado", "Usuario que quedó", function (r) { return persona(r.usuario_conservado, r.key_usuario_conservado); }],
                ["motivo", "Motivo", function (r) { return texto(r.motivo) || "—"; }],
                ["responsable", "Hecho por", function (r) { return persona(r.responsable, r.key_usuario_responsable); }]
            ],
            vacio: "No se eliminaron usuarios duplicados en este período.",
            pendiente: "Los usuarios se manejan en el servicio de usuarios de Servisofts, fuera del servidor de Calistenia. Falta definir con Servisofts / Capital Corp de dónde sale este dato para conectarlo."
        }
    };

    function cargar(tab, forzar) {
        var R = REPORTES[tab], clave = R.porMes ? "mes|" + estado.mesCumple : estado.desde + "|" + estado.hasta;
        if (!forzar && estado.datos[tab] && estado.datos[tab].clave === clave) { pintar(); return; }
        estado.cargando[tab] = true;
        pintar();
        R.cargar({ desde: estado.desde, hasta: estado.hasta }).then(function (res) {
            estado.datos[tab] = { clave: clave, filas: res.filas, parcial: res.parcial, cortado: res.cortado };
        }).catch(function (e) {
            if (e && e.sinSesion) { var av = document.getElementById("cm-sesion"); if (av) av.hidden = false; }
            estado.datos[tab] = { clave: clave, filas: [], pendiente: esNoDisponible(e), error: e && e.sinSesion ? "Tu sesión de datos venció: vuelve a ingresar." : (e && e.message) || String(e) };
        }).then(function () { estado.cargando[tab] = false; pintar(); pintarTabs(); });
    }

    function filtrar(lista, R) {
        var q = sinTilde(estado.buscar);
        if (!q) return lista;
        return lista.filter(function (r) {
            return R.columnas.some(function (c) { var v = typeof c[2] === "function" ? c[2](r) : r[c[0]]; return sinTilde(v).indexOf(q) >= 0; });
        });
    }

    function pintarTabs() {
        raiz.querySelectorAll("[data-tab]").forEach(function (b) {
            var t = b.getAttribute("data-tab"), d = estado.datos[t], on = t === estado.tab;
            b.classList.toggle("is-on", on);
            b.setAttribute("aria-selected", on ? "true" : "false");
            var n = b.querySelector("b");
            n.textContent = d && !d.error ? String(d.filas.length) : d && d.pendiente ? "·" : "";
        });
    }

    function pintar() {
        var R = REPORTES[estado.tab], d = estado.datos[estado.tab];
        var cont = $("#rp-contenido"); cont.textContent = "";
        cont.appendChild(el("h2", { class: "rp-h2", id: "rp-titulo", text: R.titulo }));
        if (R.porMes) {
            var mesInput = el("input", { type: "month", value: estado.mesCumple, "aria-label": "Mes de los cumpleaños", onchange: function (e) { if (/^\d{4}-\d{2}$/.test(e.target.value)) { estado.mesCumple = e.target.value; cargar(estado.tab); } } });
            var plantillas = [["auto", "Automático (uno distinto por cliente)"]].concat(MENSAJES_CUMPLE.map(function (m, i) { return [String(i), "Mensaje " + (i + 1) + ": " + m.slice(0, 48).replace("{nombre}", "…") + "…"]; }));
            var sel = el("select", { class: "dash-select", "aria-label": "Mensaje", onchange: function (e) { estado.plantilla = e.target.value; pintar(); } },
                plantillas.map(function (o) { return el("option", { value: o[0], text: o[1], selected: o[0] === estado.plantilla }); }));
            var cuando = el("select", { class: "dash-select", "aria-label": "Mostrar", onchange: function (e) { estado.soloCumple = e.target.value; pintar(); } },
                [["", "Todo el mes"], ["hoy", "Solo hoy"], ["semana", "Hoy y próximos 7 días"], ["pendientes", "Los que faltan"]].map(function (o) { return el("option", { value: o[0], text: o[1], selected: o[0] === estado.soloCumple }); }));
            cont.appendChild(el("div", { class: "rp-cumple-barra" }, [el("label", {}, ["Mes", mesInput]), el("label", {}, ["Mostrar", cuando]), el("label", { class: "rp-cumple-plantilla" }, ["Mensaje", sel])]));
        } else cont.appendChild(el("p", { class: "rp-muted", text: "Del " + fecha(estado.desde) + " al " + fecha(estado.hasta) + "." }));
        if (estado.cargando[estado.tab] || !d) { cont.appendChild(el("p", { class: "rp-msg", role: "status", text: "Cargando…" })); return; }
        if (d.error) {
            cont.appendChild(el("div", { class: "rp-aviso " + (d.pendiente ? "is-warn" : "is-bad"), role: "status" }, [
                el("strong", { text: d.pendiente ? "Pendiente de activación" : "No se pudo cargar" }),
                el("p", { text: d.pendiente ? (R.pendiente || "El MCP de Calistenia todavía no tiene la herramienta de este reporte. Cuando se active, aparece aquí solo.") : d.error })
            ]));
            return;
        }
        var lista = d.filas;
        var resumen = estado.tab === "convenios" ? resumenConvenios(lista) : null;
        if (d.parcial) cont.appendChild(el("div", { class: "rp-aviso is-warn" }, [el("p", { text: d.parcial })]));
        if (d.cortado) cont.appendChild(el("div", { class: "rp-aviso is-warn" }, [el("p", { text: "Hay más de 3.000 ventas en el período: acorta las fechas para verlas todas." })]));
        cont.appendChild(el("div", { class: "rp-kpis" }, R.kpis(lista, resumen).map(function (k) {
            return el("article", { class: "rp-kpi" }, [el("h3", { text: k[0] }), el("p", { text: typeof k[1] === "number" ? k[1].toLocaleString("es-BO") : k[1] })]);
        })));
        if (resumen && resumen.length) {
            cont.appendChild(el("div", { class: "rp-card" }, [el("h3", { class: "rp-h3", text: "Por empresa" }), tabla(
                [["empresa", "Empresa"], ["ventas", "Ventas"], ["clientes", "Clientes"], ["recargas", "Recargas"], ["monto", "Monto", function (g) { return bs(g.monto); }]],
                resumen, ["ventas", "clientes", "recargas", "monto"], "")]));
        }
        var visibles = filtrar(lista, R);
        if (R.porMes && estado.soloCumple) visibles = visibles.filter(function (r) {
            return estado.soloCumple === "hoy" ? r.cuando === "hoy" : estado.soloCumple === "semana" ? (r.cuando === "hoy" || r.cuando === "semana") : r.faltan >= 0;
        });
        var botonCsv = el("button", { type: "button", class: "rp-btn", text: "Descargar CSV", disabled: !visibles.length, onclick: function () {
            var blob = new Blob([csv(R.columnas, visibles)], { type: "text/csv;charset=utf-8" });
            var a = el("a", { href: URL.createObjectURL(blob), download: "reporte-" + estado.tab + "-" + estado.desde + "-a-" + estado.hasta + ".csv" });
            document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        } });
        cont.appendChild(el("div", { class: "rp-card" }, [
            el("div", { class: "rp-fila" }, [el("h3", { class: "rp-h3", text: "Detalle" }), el("span", { class: "rp-muted", text: visibles.length === lista.length ? lista.length + " registros" : visibles.length + " de " + lista.length + " registros" }), botonCsv]),
            tabla(R.columnas, visibles, R.numericas || [], estado.buscar || estado.soloCumple ? "Nada coincide con el filtro." : R.vacio, R.filaClase)
        ]));
        if (R.nota) cont.appendChild(el("p", { class: "rp-muted", text: R.nota }));
    }

    function tabla(cols, lista, numericas, vacio, filaClase) {
        var tb = el("tbody");
        if (!lista.length) tb.appendChild(el("tr", {}, [el("td", { colspan: cols.length, class: "rp-vacio", text: vacio })]));
        lista.slice(0, 1500).forEach(function (r) {
            tb.appendChild(el("tr", { class: filaClase ? filaClase(r) : null }, cols.map(function (c) {
                if (typeof c[3] === "function") return el("td", {}, [c[3](r)]);
                var v = typeof c[2] === "function" ? c[2](r) : r[c[0]];
                return el("td", { class: numericas.indexOf(c[0]) >= 0 ? "rp-num" : null, text: v == null || v === "" ? "—" : String(v) });
            })));
        });
        var t = el("table", { class: "rp-table" }, [el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { scope: "col", class: numericas.indexOf(c[0]) >= 0 ? "rp-num" : null, text: c[1] }); }))]), tb]);
        var w = el("div", { class: "rp-tablewrap", tabindex: "0", role: "region", "aria-label": "Tabla" }, [t]);
        if (lista.length > 1500) w.appendChild(el("p", { class: "rp-muted", text: "Se muestran 1.500 filas; descarga el CSV para ver todas." }));
        return w;
    }

    /* ----- Arranque ----- */
    function ponerRango(r) {
        estado.desde = r.desde; estado.hasta = r.hasta;
        $("#rp-desde").value = r.desde; $("#rp-hasta").value = r.hasta;
        estado.datos = {};
        cargar(estado.tab);
    }
    raiz.querySelectorAll("[data-tab]").forEach(function (b) {
        b.addEventListener("click", function () {
            estado.tab = b.getAttribute("data-tab");
            try { history.replaceState(null, "", "#" + estado.tab); } catch (e) {}
            pintarTabs(); cargar(estado.tab);
        });
    });
    raiz.querySelectorAll("[data-rango]").forEach(function (b) { b.addEventListener("click", function () { ponerRango(rangoRapido(b.getAttribute("data-rango"))); }); });
    $("#rp-fechas").addEventListener("submit", function (e) {
        e.preventDefault();
        var d = $("#rp-desde").value, h = $("#rp-hasta").value, msg = $("#rp-fechas-msg");
        if (!d || !h) { msg.textContent = "Elige las dos fechas."; return; }
        if (h < d) { msg.textContent = "La fecha final no puede ser anterior a la inicial."; return; }
        if ((new Date(h) - new Date(d)) / 86400000 > 366) { msg.textContent = "El rango máximo es de un año."; return; }
        msg.textContent = "";
        ponerRango({ desde: d, hasta: h });
    });
    $("#rp-buscar").addEventListener("input", function (e) { estado.buscar = e.target.value; pintar(); });
    $("#rp-actualizar").addEventListener("click", function () { cargar(estado.tab, true); });
    estado.mesCumple = iso(new Date()).slice(0, 7);
    var inicial = (location.hash || "").slice(1);
    if (REPORTES[inicial]) estado.tab = inicial;
    pintarTabs();
    ponerRango(rangoRapido("mes"));
})();
