/* «Capital Corp»: asistente de voz de la pantalla central del muro.
   - Lee los datos del día del MCP de Calistenia (Bolivia) y muestra lo que hay que atender.
   - Escucha la palabra «Capital» (o el botón Hablar), saluda, pregunta con quién habla y responde en voz alta.
   - Conversación con IA: función «asistente» de Firebase (Claude). Mientras no esté publicada, trabaja en modo básico:
     saludo y resumen del día armados aquí, y respuestas simples por palabras clave. */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var CFG = window.CM_FIREBASE_CONFIG;
    var URL_IA = window.CM_ASISTENTE_URL || (CFG ? "https://southamerica-east1-" + CFG.projectId + ".cloudfunctions.net/asistente" : null);
    var REPOSO_MS = 3 * 60000, DATOS_MS = 5 * 60000;

    var S = { estado: "espera", datos: null, historial: [], quien: "", modoIA: null, ultimo: Date.now(), escuchando: false, hablando: false, activo: false };

    /* ---------- reloj ---------- */
    function reloj() {
        var d = new Date();
        $("as-hora").textContent = d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
        $("as-fecha").textContent = d.toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" });
    }
    reloj(); setInterval(reloj, 15000);

    /* ---------- anillo animado ---------- */
    var cv = $("as-canvas"), cx = cv.getContext("2d"), fase = 0;
    var reducido = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function dibujar() {
        var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
        var w = cv.width, c = w / 2;
        cx.clearRect(0, 0, w, w);
        var vel = S.estado === "hablando" ? 2.2 : S.estado === "pensando" ? 3.2 : S.estado === "escuchando" ? 1.4 : 0.45;
        if (!reducido) fase += 0.016 * vel;
        var pulso = S.estado === "hablando" ? 0.5 + 0.5 * Math.abs(Math.sin(fase * 3.1) * Math.sin(fase * 1.7 + 1)) : S.estado === "escuchando" ? 0.35 + 0.15 * Math.sin(fase * 2) : 0.18;
        var anillos = [[0.46, 0.012, 0.9, 1], [0.40, 0.006, 0.55, -1.4], [0.34, 0.018, 0.75, 0.8], [0.27, 0.004, 0.45, -2.1]];
        anillos.forEach(function (a, i) {
            var rad = w * a[0], segs = 3 + i;
            cx.lineWidth = Math.max(1, w * a[1]);
            for (var s = 0; s < segs; s++) {
                var ini = fase * a[3] + s * (Math.PI * 2 / segs), largo = (Math.PI * 2 / segs) * (0.55 + 0.25 * Math.sin(fase + i));
                cx.strokeStyle = "rgba(255,255,255," + (a[2] * (0.45 + pulso * 0.55)).toFixed(3) + ")";
                cx.beginPath(); cx.arc(c, c, rad, ini, ini + largo); cx.stroke();
            }
        });
        var g = cx.createRadialGradient(c, c, 0, c, c, w * 0.22);
        g.addColorStop(0, "rgba(255,255,255," + (0.30 + pulso * 0.55).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,255,255,0)");
        cx.fillStyle = g; cx.beginPath(); cx.arc(c, c, w * 0.22, 0, Math.PI * 2); cx.fill();
        requestAnimationFrame(dibujar);
    }
    requestAnimationFrame(dibujar);
    function estado(e, txt) { S.estado = e; $("as-estado").textContent = txt || { espera: "En espera", escuchando: "Escuchando", pensando: "Pensando", hablando: "" }[e] || ""; }

    /* ---------- datos del día (MCP de Calistenia) ---------- */
    function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    function filas(r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { return []; } } if (r && r.result && !r.filas) r = r.result; return Array.isArray(r) ? r : (r && r.filas) || []; }
    function total(r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { return null; } } if (r && r.result && r.total == null) r = r.result; return r && r.total != null ? Number(r.total) : null; }
    function llamar(t, a) { return window.CM.llamar(t, a).catch(function (e) { if (e && e.sinSesion) S.sinSesion = true; return null; }); }
    function suma(l, k) { return l.reduce(function (a, r) { return a + (Number(r[k]) || 0); }, 0); }
    function cargarDatos() {
        var h = new Date(), hoy = iso(h), ini = hoy.slice(0, 8) + "01";
        var a = new Date(h.getFullYear(), h.getMonth() - 1, 1), antIni = iso(a);
        var antFin = iso(new Date(h.getFullYear(), h.getMonth() - 1, Math.min(h.getDate(), new Date(h.getFullYear(), h.getMonth(), 0).getDate())));
        return Promise.all([
            llamar("reporte_ventas", { desde: hoy, hasta: hoy, agrupar_por: "sucursal" }),
            llamar("reporte_ventas", { desde: ini, hasta: hoy, agrupar_por: "sucursal" }),
            llamar("reporte_ventas", { desde: antIni, hasta: antFin, agrupar_por: "sucursal" }),
            llamar("asistencia_del_dia", { fecha: hoy }),
            llamar("clientes_por_vencer", { dias: 7, limite: 1 }),
            llamar("clientes_sin_asistir", { dias: 14, limite: 1 }),
            llamar("clientes_vencidos", { dias: 30, limite: 1 }),
            llamar("cajas_abiertas", {})
        ]).then(function (x) {
            var vHoy = filas(x[0]), vMes = filas(x[1]), vAnt = filas(x[2]);
            var asis = x[3] && (x[3].sucursales || (x[3].result && x[3].result.sucursales)) || [];
            var cajas = Array.isArray(x[7]) ? x[7] : (x[7] && x[7].result) || [];
            var viejas = cajas.filter(function (c) { var t = Date.parse(c.apertura); return t && Date.now() - t > 2 * 864e5 && !/qr/i.test(String(c.tipo || "")); });
            var mes = suma(vMes, "total"), ant = suma(vAnt, "total");
            var ranking = vMes.map(function (r) { return { sucursal: String(r.grupo || "").trim(), total: Number(r.total) || 0 }; }).filter(function (r) { return r.sucursal; }).sort(function (p, q) { return q.total - p.total; });
            var d = {
                pais: "Bolivia", moneda: "Bs", fecha: hoy,
                ingresos_hoy: x[0] ? Math.round(suma(vHoy, "total")) : null, ventas_hoy: x[0] ? suma(vHoy, "ventas") : null,
                ingresos_mes: x[1] ? Math.round(mes) : null, ingresos_mismo_periodo_mes_anterior: x[2] ? Math.round(ant) : null,
                variacion_mes_pct: x[1] && x[2] && ant > 0 ? Math.round((mes - ant) / ant * 100) : null,
                visitas_hoy: x[3] ? suma(asis, "visitas") : null,
                por_vencer_7_dias: total(x[4]), sin_venir_14_dias: total(x[5]), vencidos_30_dias: total(x[6]),
                cajas_abiertas: x[7] ? cajas.length : null, cajas_abiertas_mas_de_2_dias: x[7] ? viejas.length : null,
                sucursal_lider_mes: ranking[0] || null, sucursal_ultima_mes: ranking.length > 1 ? ranking[ranking.length - 1] : null,
                ranking_mes: ranking.slice(0, 11)
            };
            S.datos = d; pintarKpis(d); return d;
        });
    }
    var n = function (v) { return v == null ? "—" : Math.round(v).toLocaleString("es-BO"); };
    function pintarKpis(d) {
        var k = $("as-kpis"); k.textContent = "";
        if (S.sinSesion && d.ingresos_hoy == null) { k.innerHTML = '<p class="as-oye">Sin la sesión de datos de Calistenia. Vuelva al centro de mando e ingrese de nuevo.</p>'; return; }
        function kpi(et, val, sub, tono) {
            var a = document.createElement("div"); a.className = "as-kpi" + (tono ? " is-" + tono : "");
            var s1 = document.createElement("span"); s1.textContent = et;
            var b = document.createElement("b"); b.textContent = val;
            a.appendChild(s1); a.appendChild(b);
            if (sub) { var sm = document.createElement("small"); sm.textContent = sub; a.appendChild(sm); }
            k.appendChild(a);
        }
        kpi("Ingresos de hoy", "Bs " + n(d.ingresos_hoy), d.ventas_hoy != null ? n(d.ventas_hoy) + " ventas" : "");
        kpi("Ingresos del mes", "Bs " + n(d.ingresos_mes), d.variacion_mes_pct != null ? (d.variacion_mes_pct >= 0 ? "+" : "") + d.variacion_mes_pct + "% vs. mismos días del mes anterior" : "", d.variacion_mes_pct == null ? "" : d.variacion_mes_pct >= 0 ? "ok" : "bad");
        kpi("Visitas de hoy", n(d.visitas_hoy));
        kpi("Vencen en 7 días", n(d.por_vencer_7_dias), "Aún no renovaron", d.por_vencer_7_dias > 0 ? "warn" : "");
        kpi("Sin venir 14 días o más", n(d.sin_venir_14_dias), "Con plan vigente", d.sin_venir_14_dias > 0 ? "warn" : "");
        kpi("Cajas abiertas hace más de 2 días", n(d.cajas_abiertas_mas_de_2_dias), d.cajas_abiertas != null ? n(d.cajas_abiertas) + " cajas abiertas en total" : "", d.cajas_abiertas_mas_de_2_dias > 0 ? "bad" : "ok");
        if (d.sucursal_lider_mes) kpi("Sucursal líder del mes", d.sucursal_lider_mes.sucursal, "Bs " + n(d.sucursal_lider_mes.total));
    }

    /* ---------- voz ---------- */
    var voz = null;
    function elegirVoz() {
        var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
        var es = vs.filter(function (v) { return /^es/i.test(v.lang); });
        var caballero = /jorge|diego|pablo|juan|carlos|enrique|alvaro|álvaro|raul|raúl|andres|andrés|tomas|tomás|male|hombre/i;
        voz = es.filter(function (v) { return caballero.test(v.name) && /419|MX|US|AR|CO|BO|PY|CL|PE/i.test(v.lang); })[0]
            || es.filter(function (v) { return caballero.test(v.name); })[0]
            || es.filter(function (v) { return /419|MX|US/i.test(v.lang); })[0] || es[0] || null;
    }
    if (window.speechSynthesis) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }
    function decir(texto) {
        $("as-dice").textContent = texto;
        S.ultimo = Date.now();
        if (!window.speechSynthesis) { estado("espera"); return Promise.resolve(); }
        return new Promise(function (fin) {
            speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(texto);
            if (voz) { u.voice = voz; u.lang = voz.lang; } else u.lang = "es-419";
            u.rate = 0.98; u.pitch = 0.88;
            S.hablando = true; detenerEscucha(); estado("hablando");
            var listo = false, empezo = false, cerrar = function () { if (listo) return; listo = true; S.hablando = false; estado("espera"); fin(); };
            u.onstart = function () { empezo = true; S.vozBloqueada = false; avisar(""); };
            u.onend = cerrar;
            u.onerror = function (e) { if (e && e.error === "not-allowed") bloqueada(texto); cerrar(); };
            /* Si el navegador no deja sonar sin un toque previo, no empieza nunca: se avisa y se repite al primer toque. */
            setTimeout(function () { if (!empezo && !listo && !speechSynthesis.speaking) { bloqueada(texto); cerrar(); } }, 2500);
            setTimeout(cerrar, Math.max(6000, texto.length * 95));   // por si el navegador no avisa el final
            speechSynthesis.speak(u);
        });
    }

    /* ---------- arranque automático ----------
       El asistente arranca solo. Si este equipo todavía no autorizó sonido o micrófono para el sitio, el navegador lo frena:
       se avisa arriba y basta un toque o una tecla una sola vez. En el equipo del muro, la configuración de
       dashboard/kiosco/ autoriza el sitio de forma permanente y ya no hace falta ni eso. */
    function avisar(t) { var a = $("as-aviso"); a.textContent = t || ""; a.hidden = !t; }
    function bloqueada(texto) {
        if (S.vozBloqueada) return;
        S.vozBloqueada = true; S.pendiente = texto;
        avisar("El navegador de este equipo bloqueó el sonido: toque la pantalla o presione una tecla una vez. (En el muro se configura para que no lo pida: carpeta kiosco.)");
    }
    function alPrimerToque() {
        if (!S.vozBloqueada && !S.sinMic) return;
        var t = S.pendiente; S.vozBloqueada = false; S.pendiente = null; S.sinMic = false; avisar("");
        if (t) decir(t).then(function () { escuchar("turno"); }); else escuchar("vigilia");
    }
    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, alPrimerToque, true); });

    /* ---------- escucha ---------- */
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null;
    function detenerEscucha() { if (rec) { try { rec.onend = null; rec.abort(); } catch (e) {} rec = null; } S.escuchando = false; $("as-mic").classList.remove("is-on"); }
    /* modo "vigilia": espera la palabra «Capital»; modo "turno": toma una frase completa como pregunta. */
    function escuchar(modo) {
        if (!Rec || S.hablando || !S.activo) return;
        detenerEscucha();
        rec = new Rec(); rec.lang = "es-BO"; rec.interimResults = true; rec.continuous = modo === "vigilia"; rec.maxAlternatives = 1;
        var oido = "", vence = modo === "turno" ? setTimeout(function () { if (!oido) { detenerEscucha(); $("as-oye").textContent = ""; escuchar("vigilia"); } }, 9000) : null;
        S.escuchando = true;
        if (modo === "turno") { estado("escuchando"); $("as-mic").classList.add("is-on"); }
        rec.onresult = function (ev) {
            var t = "", final = false;
            for (var i = ev.resultIndex; i < ev.results.length; i++) { t += ev.results[i][0].transcript; if (ev.results[i].isFinal) final = true; }
            t = t.trim();
            if (modo === "turno") { oido = t; $("as-oye").textContent = t ? "«" + t + "»" : ""; if (final && t) { clearTimeout(vence); detenerEscucha(); atender(t); } return; }
            var m = /\bcapital(?:\s+corp)?\b[,.\s]*(.*)$/i.exec(t);
            if (m && final) { detenerEscucha(); var resto = m[1].trim(); $("as-oye").textContent = "«" + t + "»"; resto.length > 3 ? atender(resto) : atender(null); }
        };
        rec.onerror = function (e) { if (e.error === "not-allowed" || e.error === "service-not-allowed") { S.sinMic = true; avisar("Este equipo no tiene permitido el micrófono para el sitio: permítalo en el candado de la barra de direcciones (una sola vez) o configure el muro con la carpeta kiosco. Mientras tanto puede escribir."); } };
        rec.onend = function () { var era = S.escuchando; S.escuchando = false; $("as-mic").classList.remove("is-on"); if (era && !S.hablando && !S.pensando && !S.sinMic) setTimeout(function () { escuchar("vigilia"); }, 400); if (S.estado === "escuchando") estado("espera"); };
        try { rec.start(); } catch (e) {}
    }

    /* ---------- conversación ---------- */
    function nombreDe(t) {
        var m = /(?:^|[\s,.¡!¿])(?:[Ss]oy|[Hh]abla|[Ll]e habla|[Mm]e llamo|[Mm]i nombre es|[Cc]on usted habla)\s+(?:el |la |don |doña |do[nñ]a )?([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/.exec(t);
        if (!m || /^(el|la|yo|de|un|una|nuevo|nueva)$/i.test(m[1])) return "";
        return m[1].charAt(0).toUpperCase() + m[1].slice(1);
    }
    function saludo() { var h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; }
    function bs(v) { return v == null ? "sin dato" : Math.round(v).toLocaleString("es-BO") + " bolivianos"; }
    /* Modo básico: el resumen del día armado aquí. */
    function resumen() {
        var d = S.datos;
        if (!d) return "Todavía estoy leyendo los datos del día; deme un momento.";
        var p = [];
        p.push("Hoy llevamos " + bs(d.ingresos_hoy) + " en ingresos" + (d.visitas_hoy != null ? " y " + n(d.visitas_hoy) + " visitas" : "") + ".");
        if (d.ingresos_mes != null) p.push("En el mes vamos en " + bs(d.ingresos_mes) + (d.variacion_mes_pct != null ? ", " + Math.abs(d.variacion_mes_pct) + " por ciento " + (d.variacion_mes_pct >= 0 ? "por encima" : "por debajo") + " de los mismos días del mes pasado" : "") + ".");
        var at = [];
        if (d.por_vencer_7_dias) at.push(n(d.por_vencer_7_dias) + " clientes vencen en los próximos siete días");
        if (d.sin_venir_14_dias) at.push(n(d.sin_venir_14_dias) + " con plan vigente no vienen hace dos semanas");
        if (d.cajas_abiertas_mas_de_2_dias) at.push(n(d.cajas_abiertas_mas_de_2_dias) + (d.cajas_abiertas_mas_de_2_dias === 1 ? " caja sigue abierta" : " cajas siguen abiertas") + " hace más de dos días");
        if (at.length) p.push("Merece su atención: " + at.join("; ") + ".");
        p.push("¿Desea que profundice en algo?");
        return p.join(" ");
    }
    function respuestaBasica(t) {
        var d = S.datos || {}, x = t.toLowerCase();
        if (/resumen|pendiente|atender|c[oó]mo vamos|novedad/.test(x)) return resumen();
        if (/sucursal|ranking|mejor|peor|l[ií]der/.test(x) && d.sucursal_lider_mes) return "En el mes lidera " + d.sucursal_lider_mes.sucursal + " con " + bs(d.sucursal_lider_mes.total) + (d.sucursal_ultima_mes ? ", y la que más atrás va es " + d.sucursal_ultima_mes.sucursal + " con " + bs(d.sucursal_ultima_mes.total) : "") + ".";
        if (/ingres|venta|factur|plata|dinero/.test(x)) return "Hoy llevamos " + bs(d.ingresos_hoy) + " y en el mes " + bs(d.ingresos_mes) + (d.variacion_mes_pct != null ? ", " + Math.abs(d.variacion_mes_pct) + " por ciento " + (d.variacion_mes_pct >= 0 ? "arriba" : "abajo") + " del mes pasado a la misma fecha" : "") + ".";
        if (/visita|asistencia|gente|entr/.test(x)) return "Hoy entraron " + n(d.visitas_hoy) + " personas a nuestras sucursales.";
        if (/venc|renov|retenc|riesgo/.test(x)) return n(d.por_vencer_7_dias) + " clientes vencen en siete días, " + n(d.sin_venir_14_dias) + " no vienen hace dos semanas y " + n(d.vencidos_30_dias) + " vencieron en el último mes. Atención al Cliente tiene las listas.";
        if (/caja/.test(x)) return "Hay " + n(d.cajas_abiertas) + " cajas abiertas, " + n(d.cajas_abiertas_mas_de_2_dias) + " de ellas hace más de dos días.";
        if (/gracias/.test(x)) return "Es un placer" + (S.quien ? ", " + S.quien : "") + ". Aquí estaré.";
        return "Por ahora trabajo en modo básico: puedo darle el resumen del día, ingresos, visitas, vencimientos, cajas y sucursales. La conversación completa se activa en cuanto publiquemos mi inteligencia artificial.";
    }
    function modo2(t) { $("as-modo").textContent = t; }
    function preguntarIA() {
        if (!URL_IA || !window.firebase || !firebase.apps.length || !firebase.auth().currentUser) return Promise.reject(new Error("sin_sesion_datos"));
        return firebase.auth().currentUser.getIdToken().then(function (tok) {
            return fetch(URL_IA, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
                body: JSON.stringify({ historial: S.historial.slice(-16), datos: S.datos, interlocutor: S.quien, ahora: new Date().toLocaleString("es-BO") }) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.texto) throw Object.assign(new Error(j.error || "ia " + r.status), { status: r.status }); return j.texto; }); });
    }
    /* t = null: alguien se acercó (dijo «Capital» o tocó Hablar sin decir nada). */
    function atender(t) {
        S.ultimo = Date.now();
        if (t) { S.historial.push({ rol: "usuario", texto: t }); var nom = nombreDe(t); if (nom) S.quien = nom; }
        S.pensando = true; estado("pensando");
        var local = function () {
            if (!t) return S.quien ? saludo() + ", " + S.quien + ". " + resumen() : saludo() + ". Soy Capital Corp, a su servicio. ¿Con quién tengo el gusto?";
            if (!S.historial.slice(0, -1).some(function (m) { return m.rol === "usuario"; }) && S.quien && nombreDe(t)) return "Un gusto, " + S.quien + ". " + resumen();
            return respuestaBasica(t);
        };
        var p = S.modoIA === false ? Promise.resolve(local()) : preguntarIA().then(function (x) { S.modoIA = true; modo2(""); return x; }, function (e) {
            if (e.status === 429) return "Demasiadas preguntas seguidas; permítame un momento.";
            S.modoIA = false;
            modo2("Modo básico: la conversación con IA se activa cuando se publique el asistente en Firebase.");
            return local();
        });
        return p.then(function (resp) {
            S.pensando = false;
            S.historial.push({ rol: "asistente", texto: resp });
            return decir(resp);
        }).then(function () { $("as-oye").textContent = ""; escuchar("turno"); });
    }

    /* Reposo: sin conversación por 3 minutos, se olvida con quién hablaba (puede acercarse otra persona). */
    setInterval(function () {
        if (Date.now() - S.ultimo > REPOSO_MS && (S.historial.length || S.quien)) { S.historial = []; S.quien = ""; $("as-dice").textContent = "Diga «Capital» para hablar conmigo."; }
    }, 20000);

    /* ---------- controles ---------- */
    /* Arranca solo: saluda en cuanto están los datos (o a los 4 segundos) y queda escuchando. */
    S.activo = true;
    if (!Rec) modo2("Este navegador no permite hablarme: escriba su pregunta. (Use Chrome para conversar por voz.)");
    var saludado = false;
    function arrancar() { if (saludado) return; saludado = true; atender(null); }
    setTimeout(arrancar, 4000);
    $("as-mic").addEventListener("click", function () { if (!S.activo) return; if (window.speechSynthesis) speechSynthesis.cancel(); S.hablando = false; escuchar("turno"); });
    $("as-form").addEventListener("submit", function (e) { e.preventDefault(); var t = $("as-texto").value.trim(); if (!t) return; $("as-texto").value = ""; S.activo = true; if (window.speechSynthesis) speechSynthesis.cancel(); detenerEscucha(); atender(t); });
    $("as-full").addEventListener("click", function () { var d = document.documentElement; (d.requestFullscreen ? d.requestFullscreen() : Promise.resolve()).catch(function () {}); });

    cargarDatos().catch(function () {}).then(function () { setTimeout(arrancar, 300); });
    setInterval(function () { if (!document.hidden) cargarDatos().catch(function () {}); }, DATOS_MS);
    $("as-dice").textContent = "Diga «Capital» para hablar conmigo.";
})();
