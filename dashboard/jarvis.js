/* =====================================================================================================
   Capital · asistente de voz en tiempo real (Gemini Live, voz a voz). Es el ÚNICO asistente del centro de mando.
   - Pide un token temporal al servidor (liveToken) con la sesión del centro de mando; la clave de Google no
     pasa por el navegador. Cada conexión usa un token nuevo (el token sirve una sola vez).
   - Micrófono continuo a 16 kHz con cancelación de eco; la voz de Capital llega a 24 kHz y se reproduce
     sin cortes. Si usted habla mientras responde, Capital se calla y atiende lo nuevo.
   - Los datos los pide el modelo con herramientas y se leen acá con la sesión del usuario (Bolivia: sistema de
     Calistenia; Paraguay: ERP de Paraguay; pendientes del equipo: base del centro de mando). Cada consulta se
     muestra en pantalla como tarjeta con los números.
   - Tras 2 minutos sin conversación se cierra (cuesta por minuto); se reabre con «Capital» o con el botón.
   ===================================================================================================== */
(function () {
    "use strict";
    var CFG = window.CM_FIREBASE_CONFIG || {};
    var PUENTE = window.CM_LIVE_PUENTE || ("https://southamerica-east1-" + CFG.projectId + ".cloudfunctions.net/liveToken");
    var WS = function (ver, token) { return "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage." + ver + ".GenerativeService.BidiGenerateContentConstrained?access_token=" + encodeURIComponent(token); };
    var PY = window.CM_PAIS === "paraguay", MON = PY ? "Gs" : "Bs", LOC = PY ? "es-PY" : "es-BO";
    var INACTIVO_MS = 120000;
    var $ = function (id) { return document.getElementById(id); };

    var J = { ws: null, setup: null, handle: null, ver: "v1beta", estado: "espera", abierto: false, listo: false,
        micCtx: null, micStream: null, micNodo: null, nivelMic: 0, mudo: false, pendiente: [],
        outCtx: null, outGain: null, analizador: null, proxima: 0, fuentes: [], ultimo: 0, reloj: null, despertador: null, reintentos: 0 };

    /* ---------- interfaz ---------- */
    var TXT = { espera: "En espera", conectando: "Conectando…", escuchando: "Lo escucho", hablando: "Capital habla", pensando: "Consultando…", error: "Sin conexión" };
    function estado(e, detalle) {
        J.estado = e;
        $("jv-estado").textContent = TXT[e] || e;
        document.body.dataset.estado = e;
        $("jv-boton").textContent = J.abierto ? "Terminar" : "Conversar";
        $("jv-boton").classList.toggle("is-on", J.abierto);
        if (detalle != null) $("jv-nota").textContent = detalle;
    }
    function linea(quien, texto, nueva) {
        var log = $("jv-log"), ult = log.lastElementChild;
        var vacio = log.querySelector(".jv-vacio"); if (vacio) vacio.remove();
        if (!nueva && ult && ult.dataset.quien === quien && !ult.dataset.fin) { ult.querySelector("span").textContent += texto; }
        else {
            var p = document.createElement("p"); p.className = "jv-l is-" + quien; p.dataset.quien = quien;
            var b = document.createElement("b"); b.textContent = quien === "yo" ? "Usted" : "Capital";
            var s = document.createElement("span"); s.textContent = texto;
            p.appendChild(b); p.appendChild(s); log.appendChild(p);
            while (log.querySelectorAll(".jv-l").length > 60) log.removeChild(log.querySelector(".jv-l"));
        }
        log.scrollTop = log.scrollHeight;
    }
    function cerrarLinea() { var u = $("jv-log").lastElementChild; if (u) u.dataset.fin = "1"; }
    function aviso(t) { var a = $("jv-aviso"); a.textContent = t || ""; a.hidden = !t; clearTimeout(J.avisoReloj); if (t) J.avisoReloj = setTimeout(function () { a.hidden = true; }, 10000); }

    /* ---------- tarjetas con los datos consultados ---------- */
    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function num(n) { return (Number(n) || 0).toLocaleString(LOC, { maximumFractionDigits: 0 }); }
    function plata(n) { return MON + " " + num(n); }
    function pct(n) { if (n == null || !isFinite(n)) return ""; var r = Math.round(n); return (r > 0 ? "+" : "") + r + " %"; }
    function fechaCorta(iso) { var d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return isNaN(d) ? String(iso || "") : d.toLocaleDateString(LOC, { day: "numeric", month: "short" }); }
    function rangoTxt(a, b) { return a === b ? fechaCorta(a) : fechaCorta(a) + " al " + fechaCorta(b); }
    function barras(filas, valor, etiqueta, fmt) {
        var l = filas.slice(0, 8), max = Math.max.apply(null, l.map(valor).concat([1]));
        var ul = el("ul", "jv-barras");
        l.forEach(function (f) {
            var li = el("li"), v = valor(f);
            li.appendChild(el("span", "jv-b-et", etiqueta(f)));
            var pista = el("span", "jv-b-pista"), b = el("i"); b.style.width = Math.max(2, v / max * 100) + "%"; pista.appendChild(b); li.appendChild(pista);
            li.appendChild(el("span", "jv-b-v", fmt(v)));
            ul.appendChild(li);
        });
        if (filas.length > 8) ul.appendChild(el("li", "jv-b-mas", "y " + (filas.length - 8) + " más"));
        return ul;
    }
    function tarjeta(t) {
        if (!t) return;
        var c = el("article", "jv-card");
        c.appendChild(el("h3", "", t.titulo));
        if (t.sub) c.appendChild(el("p", "jv-card-sub", t.sub));
        if (t.grande != null) { var g = el("p", "jv-grande"); g.appendChild(el("b", "", t.grande)); if (t.cambio) { var ch = el("span", "jv-cambio " + (/^\+/.test(t.cambio) ? "is-sube" : /^-/.test(t.cambio) ? "is-baja" : ""), t.cambio); g.appendChild(ch); } c.appendChild(g); }
        if (t.kpis) { var k = el("div", "jv-kpis"); t.kpis.forEach(function (x) { var d = el("div", "jv-kpi"); d.appendChild(el("span", "", x[0])); d.appendChild(el("b", "", x[1])); if (x[2]) d.appendChild(el("small", /^\+/.test(x[2]) ? "is-sube" : /^-/.test(x[2]) ? "is-baja" : "", x[2])); k.appendChild(d); }); c.appendChild(k); }
        if (t.barras) c.appendChild(t.barras);
        if (t.lista) { var ul = el("ul", "jv-lista"); t.lista.forEach(function (x) { var li = el("li"); li.appendChild(el("span", "", x[0])); li.appendChild(el("b", "", x[1])); ul.appendChild(li); }); c.appendChild(ul); }
        if (t.nota) c.appendChild(el("p", "jv-card-sub", t.nota));
        var cont = $("jv-cards"); cont.insertBefore(c, cont.firstChild);
        while (cont.children.length > 2) cont.removeChild(cont.lastChild);
        cont.hidden = false;
    }
    /* Tarjeta para cualquier consulta: total si lo hay y las primeras filas con su número principal. */
    var NOMBRES = { reporte_ventas: "Ventas", listar_ventas: "Ventas detalle", ver_venta: "Venta", listar_paquetes: "Paquetes", listar_sucursales: "Sucursales", buscar_cliente: "Clientes encontrados", ver_cliente: "Cliente",
        historial_paquetes_cliente: "Paquetes del cliente", clientes_sin_asistir: "Clientes sin venir", clientes_cumpleanos: "Cumpleaños", reporte_asistencia: "Visitas", comparar_asistencia: "Comparación de visitas",
        frecuencia_asistencia: "Frecuencia de visitas", asistencia_por_instructor: "Por instructor", listar_cajas: "Cajas", reporte_movimientos_caja: "Movimientos de caja", movimientos_banco: "Movimientos de banco",
        listar_facturas: "Facturas", listar_prorrogas: "Prórrogas", reporte_traspasos: "Traspasos", reporte_paquetes_eliminados: "Paquetes eliminados", reporte_cambios_fecha: "Cambios de fecha",
        reporte_convenios: "Convenios", estado_molinetes: "Molinetes", listar_pagos_qr: "Pagos QR", ver_horarios: "Horarios" };
    function tarjetaGenerica(t, args, r) {
        var titulo = NOMBRES[t] || t.replace(/_/g, " ");
        var sub = args.desde ? rangoTxt(args.desde, args.hasta || args.desde) : "";
        var f = Array.isArray(r) ? r : (r && (r.filas || r.clientes || r.result || r.items)) || [];
        var tot = r && (r.total != null ? r.total : r.totales && r.totales.total);
        var etq = function (x) { return String(x.grupo || x.cliente || x.nombre || x.descripcion || x.paquete || x.sucursal || x.instructor || x.entrenador || x.cajero || x.fecha || x.fecha_venta || "—").trim(); };
        var val = function (x) { var v = x.total != null ? x.total : x.monto != null ? x.monto : x.precio != null ? x.precio : x.visitas != null ? x.visitas : x.asistentes != null ? x.asistentes : x.cantidad; return Number(v) || 0; };
        var hayVal = f.some(function (x) { return val(x) > 0; }), plataQ = f.some(function (x) { return x.total != null || x.monto != null || x.precio != null; });
        tarjeta({ titulo: titulo, sub: sub, grande: tot != null ? (r.moneda || (r.totales && plataQ) ? plata(tot) : num(tot)) : (f.length ? num(f.length) : null),
            barras: f.length > 1 && hayVal ? barras(f, val, etq, plataQ ? plata : num) : null,
            lista: f.length && !hayVal ? f.slice(0, 8).map(function (x) { return [etq(x), String(x.sucursal || x.estado || x.fecha_fin || "")]; }) : null,
            nota: !f.length && tot == null ? "Consulta hecha; la respuesta está en la voz." : null });
    }
    var SIN_PY = { titulo: "Paraguay", sub: "Este dato todavía no está conectado en el ERP de Paraguay." };

    /* ---------- utilidades de audio ---------- */
    function aBase64(buf) { var b = new Uint8Array(buf), s = "", i; for (i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
    function deBase64(b64) { var s = atob(b64), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b.buffer; }
    var WORKLET = "class Cap extends AudioWorkletProcessor{constructor(){super();this.b=[];}process(i){var c=i[0]&&i[0][0];if(!c)return true;for(var k=0;k<c.length;k++)this.b.push(c[k]);" +
        "if(this.b.length>=640){var o=new Int16Array(this.b.length),q=0;for(var j=0;j<this.b.length;j++){var s=Math.max(-1,Math.min(1,this.b[j]));o[j]=s<0?s*32768:s*32767;q+=s*s;}" +
        "this.port.postMessage({pcm:o.buffer,nivel:Math.sqrt(q/this.b.length)},[o.buffer]);this.b=[];}return true;}}registerProcessor('cap',Cap);";

    function prepararSalida() {
        if (J.outCtx) return;
        /* Contexto a la frecuencia propia del equipo (sin forzar 24 kHz): el navegador remuestrea cada pedazo una sola
           vez y con buena calidad. «playback» pide búferes más grandes: menos chasquidos si la computadora está ocupada. */
        J.outCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
        J.outGain = J.outCtx.createGain(); J.outGain.gain.value = 0.9; J.analizador = J.outCtx.createAnalyser(); J.analizador.fftSize = 256;
        J.outGain.connect(J.analizador);
        /* La voz sale por un elemento <audio>: así el cancelador de eco del navegador la reconoce y la resta del micrófono.
           Si el navegador no lo permite, sale directo por los parlantes. */
        try {
            var dst = J.outCtx.createMediaStreamDestination(); J.analizador.connect(dst);
            var au = new Audio(); au.autoplay = true; au.srcObject = dst.stream; J.outAudio = au;
            var p = au.play(); if (p && p.catch) p.catch(function () { try { J.analizador.disconnect(dst); } catch (e) {} J.analizador.connect(J.outCtx.destination); });
        } catch (e) { J.analizador.connect(J.outCtx.destination); }
    }
    function reproducir(b64) {
        prepararSalida();
        var pcm = new Int16Array(deBase64(b64)), f = new Float32Array(pcm.length);
        for (var i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768;
        var buf = J.outCtx.createBuffer(1, f.length, 24000); buf.copyToChannel(f, 0);
        J.cortado = false;
        var src = J.outCtx.createBufferSource(); src.buffer = buf; src.connect(J.outGain);
        /* Colchón: al empezar a hablar se deja ~0,2 s de margen, y si un pedazo llegó tarde se vuelve a dejar margen,
           así la voz sale pareja en vez de entrecortada. Los pedazos que llegan a tiempo van pegados, sin huecos. */
        var ahora = J.outCtx.currentTime;
        if (J.proxima < ahora + 0.02) J.proxima = ahora + (J.fuentes.length ? 0.12 : 0.2);
        var t = J.proxima;
        src.start(t); J.proxima = t + buf.duration;
        J.fuentes.push(src); src.onended = function () { J.fuentes = J.fuentes.filter(function (x) { return x !== src; }); if (!J.fuentes.length) { if (!J.cortado) J.colaHasta = Date.now() + 450; if (J.estado === "hablando") estado("escuchando"); } };
        if (J.estado !== "hablando") estado("hablando");
    }
    function callar() {
        J.cortado = true; J.colaHasta = 0;
        J.fuentes.forEach(function (s) { try { s.stop(); } catch (e) {} });
        J.fuentes = []; J.proxima = 0;
        if (J.abierto && J.estado !== "pensando") estado("escuchando");
    }

    function abrirMicrofono() {
        if (J.micStream) return Promise.resolve();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("Este navegador no permite usar el micrófono. Pruebe con Chrome."));
        return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }).then(function (st) {
            J.micStream = st;
            J.micCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            var url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
            return J.micCtx.audioWorklet.addModule(url).then(function () {
                var fuente = J.micCtx.createMediaStreamSource(st);
                J.micNodo = new AudioWorkletNode(J.micCtx, "cap");
                J.micNodo.port.onmessage = function (e) {
                    J.nivelMic = e.data.nivel;
                    if (J.mudo || !J.ws || J.ws.readyState !== 1 || !J.listo) return;
                    if (!dejaPasar(e.data.nivel)) return;
                    J.ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: aBase64(e.data.pcm) } } }));
                };
                fuente.connect(J.micNodo);
            });
        });
    }
    /* Anti-eco: mientras Capital habla (y un instante después), el micrófono no se manda, para que no se escuche a sí
       mismo por los parlantes. Si alguien le habla claramente más fuerte que el eco (≈ 0,2 s seguidos), lo interrumpe. */
    function hablandoAhora() { return J.fuentes.length > 0 || (J.outCtx && J.proxima > J.outCtx.currentTime) || Date.now() < (J.colaHasta || 0); }
    function dejaPasar(nivel) {
        if (!hablandoAhora()) { J.ecoBase = 0; J.fuerte = 0; return true; }
        if (!J.ecoBase) J.ecoBase = Math.min(nivel, 0.05);
        var umbral = Math.max(0.06, J.ecoBase * 3);
        if (nivel > umbral) J.fuerte = (J.fuerte || 0) + 1;
        else { J.fuerte = 0; J.ecoBase = J.ecoBase * 0.9 + nivel * 0.1; }   // aprende solo del eco, no de quien habla fuerte
        if (J.fuerte >= 5) { J.fuerte = 0; callar(); J.colaHasta = 0; return true; }
        return false;
    }
    function cerrarMicrofono() {
        if (J.micStream) J.micStream.getTracks().forEach(function (t) { t.stop(); });
        if (J.micCtx) J.micCtx.close().catch(function () {});
        J.micStream = J.micCtx = J.micNodo = null; J.nivelMic = 0;
    }

    /* ---------- token y conexión ---------- */
    /* El token temporal sirve UNA vez y hay que usarlo en 2 minutos: se pide uno nuevo en cada conexión
       (también al reconectar cuando Google corta la sesión larga). */
    function pedirToken() {
        return (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
            var u = window.firebase && firebase.auth().currentUser;
            if (!u) throw new Error("Falta la sesión del centro de mando: salí y volvé a ingresar con tu usuario del ERP.");
            return u.getIdToken();
        }).then(function (id) {
            return fetch(PUENTE, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + id }, body: JSON.stringify({ pais: PY ? "paraguay" : "bolivia" }) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.token) throw new Error(d.error || ("El servidor respondió " + r.status)); return d; }); })
          .then(function (d) { J.setup = d.setup; return d.token; });
    }

    function conectar() {
        estado("conectando");
        return pedirToken().then(function (token) { return abrirSocket(token); }).catch(function (e) {
            /* El token funciona en v1beta; si Google lo rechaza ahí, se prueba una vez v1alpha con otro token. */
            if (e && e.probarAlpha && J.ver === "v1beta") { J.ver = "v1alpha"; return pedirToken().then(abrirSocket); }
            throw e;
        });
    }
    function abrirSocket(token) {
        return new Promise(function (ok, mal) {
            var ws = new WebSocket(WS(J.ver, token)), listo = false;
            J.ws = ws; J.listo = false;
            ws.onopen = function () {
                var s = JSON.parse(JSON.stringify(J.setup));
                s.inputAudioTranscription = {}; s.outputAudioTranscription = {};
                s.realtimeInputConfig = { automaticActivityDetection: { disabled: false, startOfSpeechSensitivity: "START_SENSITIVITY_LOW", endOfSpeechSensitivity: "END_SENSITIVITY_LOW", silenceDurationMs: 800, prefixPaddingMs: 300 } };
                s.sessionResumption = J.handle ? { handle: J.handle } : {};
                s.contextWindowCompression = { slidingWindow: {} };
                ws.send(JSON.stringify({ setup: s }));
            };
            ws.onmessage = function (ev) {
                var leer = typeof ev.data === "string" ? Promise.resolve(ev.data) : (ev.data.text ? ev.data.text() : Promise.resolve(new TextDecoder().decode(ev.data)));
                leer.then(function (txt) {
                    var m; try { m = JSON.parse(txt); } catch (e) { return; }
                    if (m.setupComplete) { listo = true; J.listo = true; J.reintentos = 0; ok(); vaciarPendientes(); return; }
                    atender(m);
                });
            };
            ws.onerror = function () {};
            ws.onclose = function (e) {
                if (J.ws === ws) J.listo = false;
                if (!listo) {
                    /* Si la sesión guardada ya no sirve, se arranca una nueva. */
                    if (J.handle) { J.handle = null; mal(Object.assign(new Error("reintentar"), { reintentar: true })); return; }
                    mal(Object.assign(new Error("Google cerró la conexión (" + e.code + (e.reason ? ": " + e.reason : "") + ")."), { probarAlpha: true }));
                    return;
                }
                if (J.ws === ws && J.abierto && !J.cerrando) reconectar();
            };
        });
    }
    function reconectar() {
        if (++J.reintentos > 4) { fallo(new Error("Se cortó la conexión varias veces. Toque Conversar para volver a intentar.")); return; }
        estado("conectando", "Reconectando…");
        setTimeout(function () {
            if (!J.abierto) return;
            conectar().then(function () { estado("escuchando", ""); }, function (e) { if (e && e.reintentar) reconectar(); else fallo(e); });
        }, 300 * J.reintentos);
    }

    function enviarTexto(t) {
        if (J.ws && J.ws.readyState === 1 && J.listo) J.ws.send(JSON.stringify({ realtimeInput: { text: t } }));
        else J.pendiente.push(t);
    }
    function vaciarPendientes() { var l = J.pendiente; J.pendiente = []; l.forEach(enviarTexto); }

    /* Cierre por voz: espera a que termine la despedida (o 6 s como máximo) y cierra como el botón Terminar. */
    var CIERRE = /(gracias|muchas gracias)[\s,.!]*(capital)|capital[\s,.!]*(gracias)|\beso es todo\b|\bnada m[aá]s\b|\bhasta luego\b|\bchau\b|\badi[oó]s\b|\bya est[aá],? capital\b|\blisto,? capital\b/i;
    function cerrarAlTerminar() {
        if (J.cerrandoPorVoz) return;
        J.cerrandoPorVoz = true; var desde = Date.now();
        var mirar = setInterval(function () {
            if (!J.abierto) { clearInterval(mirar); J.cerrandoPorVoz = false; return; }
            var listo = J.turnoTerminado && !hablandoAhora();
            if (listo || Date.now() - desde > 6000) { clearInterval(mirar); J.cerrandoPorVoz = false; terminar("Hasta luego. Diga «Capital» o toque Conversar cuando lo necesite."); }
        }, 200);
    }
    function atender(m) {
        J.ultimo = Date.now();
        if (m.sessionResumptionUpdate && m.sessionResumptionUpdate.resumable && m.sessionResumptionUpdate.newHandle) J.handle = m.sessionResumptionUpdate.newHandle;
        if (m.goAway) { try { J.ws.close(); } catch (e) {} return; }
        var sc = m.serverContent;
        if (sc) {
            if (sc.interrupted) { callar(); cerrarLinea(); }
            if (sc.inputTranscription && sc.inputTranscription.text) {
                linea("yo", sc.inputTranscription.text); J.turnoTerminado = false;
                J.dichoTurno = ((J.dichoTurno || "") + " " + sc.inputTranscription.text).slice(-200);
                if (CIERRE.test(J.dichoTurno)) cerrarAlTerminar();
            }
            if (sc.modelTurn || sc.outputTranscription) J.turnoTerminado = false;
            if (sc.outputTranscription && sc.outputTranscription.text) linea("capital", sc.outputTranscription.text);
            ((sc.modelTurn && sc.modelTurn.parts) || []).forEach(function (p) { if (p.inlineData && p.inlineData.data) reproducir(p.inlineData.data); });
            if (sc.turnComplete) { cerrarLinea(); J.turnoTerminado = true; J.dichoTurno = ""; }
        }
        if (m.toolCall && m.toolCall.functionCalls) {
            estado("pensando", "");
            Promise.all(m.toolCall.functionCalls.map(function (fc) {
                return ejecutar(fc.name, fc.args || {}).then(function (r) { return { id: fc.id, name: fc.name, response: { result: r } }; },
                    function (e) { return { id: fc.id, name: fc.name, response: { error: (e && e.message) || "No se pudo leer el dato." } }; });
            })).then(function (resp) {
                if (J.ws && J.ws.readyState === 1) J.ws.send(JSON.stringify({ toolResponse: { functionResponses: resp } }));
                if (J.estado === "pensando") estado("escuchando");
            });
        }
    }

    /* ---------- herramientas: datos reales con la sesión del usuario ---------- */
    function hoyLocal(offsetDias) {
        var d = new Date(Date.now() + (offsetDias || 0) * 864e5);
        return new Intl.DateTimeFormat("en-CA", { timeZone: PY ? "America/Asuncion" : "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).slice(0, 10);
    }
    function mesAnteriorMismoTramo(hoy) {
        var y = +hoy.slice(0, 4), m = +hoy.slice(5, 7), d = +hoy.slice(8, 10);
        var ym = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1, ult = new Date(Date.UTC(ym, mm, 0)).getUTCDate();
        var p = function (n) { return (n < 10 ? "0" : "") + n; };
        return { desde: ym + "-" + p(mm) + "-01", hasta: ym + "-" + p(mm) + "-" + p(Math.min(d, ult)) };
    }
    /* Sin recortes salvo lo enorme (más de ~120 mil caracteres, que Google no acepta en una respuesta): ahí se
       acortan las listas y se avisa para que pida la página siguiente. */
    function recortar(o) {
        var s = JSON.stringify(o); if (s.length <= 120000) return o;
        var r = JSON.parse(JSON.stringify(o, function (k, v) { return Array.isArray(v) ? v.slice(0, 400) : v; }));
        if (r && typeof r === "object" && !Array.isArray(r)) r.aviso = "Resultado muy largo: se muestran las primeras 400 filas de cada lista; pedí la página siguiente con offset si hace falta.";
        return r;
    }
    function llamar(t, a) {
        if (!window.CM || !CM.llamar) return Promise.reject(new Error("Falta la conexión con los datos de Calistenia."));
        return CM.llamar(t, a).then(function (r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) {} } return r || {}; });
    }
    function sinPY(r) { return r && r.sin_datos_paraguay; }
    function filasDe(r) { return (r && (r.filas || r.clientes || r.result)) || []; }
    function totalVentas(r) { return Number((r && r.totales && r.totales.total) != null ? r.totales.total : filasDe(r).reduce(function (s, f) { return s + (Number(f.total) || 0); }, 0)); }
    function cantVentas(r) { return Number((r && r.totales && r.totales.ventas) != null ? r.totales.ventas : filasDe(r).reduce(function (s, f) { return s + (Number(f.ventas) || 0); }, 0)); }
    var GRUPO = { dia: "por día", mes: "por mes", sucursal: "por sucursal", paquete: "por paquete", tipo_pago: "por tipo de pago", cajero: "por cajero" };

    var HERR = {
        ventas: function (a, hoy) {
            var desde = a.desde || hoy, hasta = a.hasta || hoy, g = a.agrupar_por || "dia";
            return llamar("reporte_ventas", { desde: desde, hasta: hasta, agrupar_por: g }).then(function (r) {
                if (sinPY(r)) { tarjeta(SIN_PY); return r; }
                var f = filasDe(r).slice();
                if (g !== "dia" && g !== "mes") f.sort(function (x, y) { return (Number(y.total) || 0) - (Number(x.total) || 0); });
                tarjeta({ titulo: "Ventas " + (GRUPO[g] || ""), sub: rangoTxt(desde, hasta), grande: plata(totalVentas(r)), kpis: [["Ventas", num(cantVentas(r))]],
                    barras: f.length > 1 ? barras(f, function (x) { return Number(x.total) || 0; }, function (x) { return g === "dia" ? fechaCorta(x.grupo) : String(x.grupo || "—").trim(); }, plata) : null });
                return recortar({ desde: desde, hasta: hasta, moneda: MON, total: totalVentas(r), ventas: cantVentas(r), filas: f.map(function (x) { return { grupo: x.grupo, total: x.total, ventas: x.ventas }; }) });
            });
        },
        resumen: function (a, hoy) {
            var ini = hoy.slice(0, 8) + "01", ant = mesAnteriorMismoTramo(hoy);
            var cuida = function (p) { return p.then(function (r) { return r; }, function () { return null; }); };
            return Promise.all([cuida(llamar("reporte_ventas", { desde: hoy, hasta: hoy, agrupar_por: "dia" })), cuida(llamar("reporte_ventas", { desde: ini, hasta: hoy, agrupar_por: "dia" })),
                cuida(llamar("reporte_ventas", { desde: ant.desde, hasta: ant.hasta, agrupar_por: "dia" })), cuida(llamar("asistencia_del_dia", { fecha: hoy })), cuida(llamar("listar_clientes_activos", { limite: 1 }))])
                .then(function (x) {
                    var vh = x[0] && !sinPY(x[0]) ? totalVentas(x[0]) : null, vm = x[1] && !sinPY(x[1]) ? totalVentas(x[1]) : null, va = x[2] && !sinPY(x[2]) ? totalVentas(x[2]) : null;
                    var as = x[3] && !sinPY(x[3]) ? x[3] : null, act = x[4] && !sinPY(x[4]) ? x[4] : null;
                    var cm = vm != null && va ? (vm - va) / va * 100 : null;
                    var k = [];
                    if (vh != null) k.push(["Ventas de hoy", plata(vh), x[0] ? num(cantVentas(x[0])) + " ventas" : ""]);
                    if (vm != null) k.push(["Ventas del mes", plata(vm), cm != null ? pct(cm) + " vs mes pasado" : ""]);
                    if (as) k.push(["Visitas de hoy", num(as.visitas), as.variacion_pct != null && as.visitas_semana_anterior ? pct(as.variacion_pct) + " vs semana pasada" : ""]);
                    if (act) k.push(["Clientes activos", num(act.total), ""]);
                    tarjeta({ titulo: "Resumen", sub: fechaCorta(hoy) + (PY ? " · Paraguay" : " · Bolivia"), kpis: k, nota: k.length ? null : "No se pudieron leer los datos ahora." });
                    return { hoy: hoy, moneda: MON, ventas_hoy: vh, ventas_mes: vm, ventas_mismo_tramo_mes_anterior: va, variacion_mes_pct: cm != null ? Math.round(cm) : null,
                        visitas_hoy: as ? as.visitas : null, visitas_mismo_dia_semana_pasada: as ? as.visitas_semana_anterior : null, clientes_activos: act ? act.total : null,
                        nota: PY && !as ? "En Paraguay las visitas todavía no están conectadas." : undefined };
                });
        },
        asistencia_hoy: function (a, hoy) {
            return llamar("asistencia_del_dia", { fecha: hoy }).then(function (r) {
                if (sinPY(r)) { tarjeta(SIN_PY); return r; }
                var suc = (r.sucursales || r.por_sucursal || []).map(function (s) { return { nombre: s.sucursal || s.nombre || s.grupo, visitas: Number(s.visitas) || 0 }; }).sort(function (x, y) { return y.visitas - x.visitas; });
                tarjeta({ titulo: "Visitas de hoy", sub: fechaCorta(hoy) + " · contra el " + fechaCorta(r.comparado_con || ""), grande: num(r.visitas), cambio: r.visitas_semana_anterior ? pct(r.variacion_pct) : "",
                    barras: suc.length > 1 ? barras(suc, function (x) { return x.visitas; }, function (x) { return String(x.nombre || "—").trim(); }, num) : null,
                    nota: !r.visitas ? "Todavía no hay entradas registradas hoy." : null });
                return recortar({ visitas: r.visitas, visitas_semana_anterior: r.visitas_semana_anterior, variacion_pct: r.variacion_pct, por_sucursal: suc });
            });
        },
        asistencia: function (a, hoy) {
            var desde = a.desde || hoy, hasta = a.hasta || hoy, g = a.agrupar_por === "sucursal" ? "sucursal" : "dia";
            return llamar("reporte_asistencia", { desde: desde, hasta: hasta, agrupar_por: g }).then(function (r) {
                if (sinPY(r)) { tarjeta(SIN_PY); return r; }
                var f = filasDe(r).map(function (x) { return { grupo: x.grupo || x.sucursal || x.fecha, visitas: Number(x.visitas || x.asistencias || x.total) || 0 }; });
                if (g === "sucursal") f.sort(function (x, y) { return y.visitas - x.visitas; });
                var tot = f.reduce(function (s, x) { return s + x.visitas; }, 0);
                tarjeta({ titulo: "Visitas " + (g === "sucursal" ? "por sucursal" : "por día"), sub: rangoTxt(desde, hasta), grande: num(tot),
                    barras: f.length > 1 ? barras(f, function (x) { return x.visitas; }, function (x) { return g === "dia" ? fechaCorta(x.grupo) : String(x.grupo || "—").trim(); }, num) : null });
                return recortar({ desde: desde, hasta: hasta, total: tot, filas: f });
            });
        },
        horarios: function (a, hoy) {
            var desde = a.desde || hoyLocal(-30), hasta = a.hasta || hoy;
            return llamar("ocupacion_por_horario", { desde: desde, hasta: hasta }).then(function (r) {
                if (sinPY(r)) { tarjeta(SIN_PY); return r; }
                var f = filasDe(r).map(function (x) { return { hora: x.hora || x.horario || x.grupo, valor: Number(x.promedio || x.ocupacion_pct || x.asistentes || x.visitas || x.total) || 0 }; }).filter(function (x) { return x.hora != null; });
                var porHora = {}; f.forEach(function (x) { var h = String(x.hora).slice(0, 5); porHora[h] = (porHora[h] || 0) + x.valor; });
                var l = Object.keys(porHora).sort().map(function (h) { return { hora: h, valor: porHora[h] }; });
                var orden = l.slice().sort(function (x, y) { return y.valor - x.valor; });
                tarjeta({ titulo: "Ocupación por horario", sub: rangoTxt(desde, hasta),
                    lista: orden.length ? [["Hora más llena", orden[0].hora], ["Hora más vacía", orden[orden.length - 1].hora]] : null,
                    barras: l.length > 1 ? barras(orden, function (x) { return x.valor; }, function (x) { return x.hora; }, num) : null });
                return recortar({ desde: desde, hasta: hasta, por_hora: l, mas_llenas: orden.slice(0, 3), mas_vacias: orden.slice(-3) });
            });
        },
        clientes_activos: function () {
            return llamar("listar_clientes_activos", { limite: 1 }).then(function (r) {
                if (sinPY(r)) { tarjeta(SIN_PY); return r; }
                var suc = (r.clientes_por_sucursal || []).map(function (s) { return { nombre: s.sucursal, n: Number(s.clientes) || 0 }; });
                tarjeta({ titulo: "Clientes activos", sub: "Con el plan vigente hoy", grande: num(r.total),
                    barras: suc.length > 1 ? barras(suc, function (x) { return x.n; }, function (x) { return String(x.nombre || "—").trim(); }, num) : null });
                return { total: r.total, por_sucursal: suc };
            });
        },
        cajas_abiertas: function () {
            return llamar("cajas_abiertas", {}).then(function (r) {
                if (sinPY(r)) { tarjeta(SIN_PY); return r; }
                /* Las cajas QR automáticas (siempre abiertas y en cero) no cuentan como caja de una persona. */
                var l = filasDe(r).filter(function (c) { return !(c.tipo === "qr" && /vendedor qr/i.test(c.cajero || "") && !(Number(c.saldo_total) > 0)); });
                tarjeta({ titulo: "Cajas abiertas", sub: "Ahora", grande: num(l.length),
                    lista: l.slice(0, 10).map(function (c) { return [String(c.sucursal || "").trim() + " · " + (c.cajero || "—") + " · desde " + String(c.apertura || "").slice(11, 16), plata(c.saldo_total)]; }) });
                return recortar({ abiertas: l.length, cajas: l.map(function (c) { return { sucursal: String(c.sucursal || "").trim(), cajero: c.cajero, apertura: c.apertura, saldo: c.saldo_total }; }) });
            });
        },
        pendientes: function () { return pendientes(); },
        /* «Gracias, Capital», «eso es todo»…: se despide y cierra como el botón Terminar. */
        terminar_conversacion: function () { cerrarAlTerminar(); return Promise.resolve({ ok: true }); },
        /* Lectura libre de todo el sistema (lo que el usuario puede ver con su sesión). */
        consultar_sistema: function (a) {
            var t = String(a.herramienta || ""), args = {};
            if (!/^(reporte_|listar_|ver_|buscar_|historial_|asistencia|asistencias_|progreso_|clientes_|comparar_|detalle_|frecuencia_|ocupacion_|cajas_|movimientos_|estado_|eventos_|usuarios_en_)/.test(t)) return Promise.reject(new Error("Esa consulta no es de lectura."));
            try { args = a.argumentos_json ? JSON.parse(a.argumentos_json) : {}; } catch (e) { return Promise.reject(new Error("Los argumentos no son un JSON válido.")); }
            return llamar(t, args).then(function (r) {
                if (sinPY(r)) { tarjeta(SIN_PY); return r; }
                tarjetaGenerica(t, args, r);
                return recortar(r);
            });
        },
        referidos: function (a, hoy) { return referidos(hoy); }
    };
    function vencimientos(nombre, a) {
        var d = Math.max(1, Math.min(nombre === "clientes_vencidos" ? 365 : 90, parseInt(a.dias, 10) || 7));
        return llamar(nombre, { dias: d, limite: 200 }).then(function (r) {
            if (sinPY(r)) { tarjeta(SIN_PY); return r; }
            var f = filasDe(r), total = (r && r.total) || f.length;
            var porSuc = {}; f.forEach(function (c) { var s = String(c.sucursal || "—").trim(); porSuc[s] = (porSuc[s] || 0) + 1; });
            var suc = Object.keys(porSuc).map(function (s) { return { nombre: s, n: porSuc[s] }; }).sort(function (x, y) { return y.n - x.n; });
            tarjeta({ titulo: nombre === "clientes_vencidos" ? "Vencidos sin renovar" : "Por vencer", sub: nombre === "clientes_vencidos" ? "Últimos " + d + " días" : "Próximos " + d + " días", grande: num(total),
                barras: suc.length > 1 ? barras(suc, function (x) { return x.n; }, function (x) { return x.nombre; }, num) : null,
                nota: total > f.length ? "Por sucursal, sobre los primeros " + f.length + "." : null });
            return recortar({ total: total, por_sucursal: suc, clientes: f.map(function (c) { return { cliente: c.cliente || c.nombre, sucursal: c.sucursal, vence: c.fecha_fin, paquete: c.paquete, telefono: c.telefono }; }) });
        });
    }
    HERR.clientes_por_vencer = function (a) { return vencimientos("clientes_por_vencer", a); };
    HERR.clientes_vencidos = function (a) { return vencimientos("clientes_vencidos", a); };

    /* Pendientes del equipo (base del centro de mando): lo que no se puede leer por permisos, simplemente no se cuenta. */
    function pendientes() {
        if (!window.firebase || !firebase.apps.length) return Promise.reject(new Error("Falta la sesión del centro de mando."));
        var db = firebase.firestore(), pre = PY ? "py_" : "", d14 = new Date(Date.now() - 14 * 864e5).toISOString();
        var contar = function (nombre, q, filtro) { return q.get().then(function (r) { return [nombre, filtro ? r.docs.filter(function (x) { return filtro(x.data()); }).length : r.size]; }, function () { return null; }); };
        var activa = function (x) { return Number(x.activa == null ? 1 : x.activa) > 0; };
        return Promise.all([
            contar("Tareas urgentes", db.collection(pre + "adm_tarea").where("estado", "==", "pendiente"), function (x) { return x.prioridad === "urgente" && activa(x); }),
            contar("Tareas que esperan a Dirección", db.collection(pre + "adm_tarea").where("estado", "==", "pendiente"), function (x) { return x.espera_direccion && activa(x); }),
            contar("Fallas de mantenimiento abiertas", db.collection(pre + "mant_falla").where("estado", "==", "abierta")),
            contar("Pagos de referidos por confirmar", db.collection(pre + "ref_pago").where("estado", "==", "por_confirmar")),
            contar("Referidos sin asignar", db.collection(pre + "ref_inscripcion").where("fecha_on", ">=", d14), function (x) { return !x.seguimiento && x.estado !== "rechazada"; }),
            contar("Denuncias sin responder", db.collection(pre + "rh_denuncia"), function (x) { return (x.estado === "recibida" || x.estado === "en_revision") && x.de_ultimo === "denunciante"; }),
            contar("Sugerencias nuevas de clientes", db.collection(pre + "rh_sugerencia").where("estado", "==", "nueva"))
        ]).then(function (l) {
            var ok = l.filter(Boolean), con = ok.filter(function (x) { return x[1] > 0; });
            tarjeta({ titulo: "Pendientes del equipo", sub: PY ? "Paraguay" : "Bolivia", lista: con.map(function (x) { return [x[0], num(x[1])]; }), nota: con.length ? null : "Todo al día." });
            var o = {}; ok.forEach(function (x) { o[x[0]] = x[1]; });
            return { pendientes: o };
        });
    }
    function referidos(hoy) {
        if (!window.firebase || !firebase.apps.length) return Promise.reject(new Error("Falta la sesión del centro de mando."));
        var db = firebase.firestore(), pre = PY ? "py_" : "", ini = hoy.slice(0, 8) + "01";
        return Promise.all([db.collection(pre + "ref_inscripcion").where("fecha_on", ">=", ini).get(), db.collection(pre + "ref_pago").where("estado", "==", "por_confirmar").get().catch(function () { return { size: 0 }; })]).then(function (r) {
            var l = r[0].docs.map(function (d) { return d.data(); });
            var vend = l.filter(function (x) { return x.seguimiento === "vendido"; }).length, sin = l.filter(function (x) { return !x.seguimiento && x.estado !== "rechazada"; }).length;
            var porCod = {}; l.forEach(function (x) { var c = String(x.codigo || "").replace(/-CAL$/, ""); if (c) porCod[c] = (porCod[c] || 0) + 1; });
            var top = Object.keys(porCod).map(function (c) { return { codigo: c, n: porCod[c] }; }).sort(function (a, b) { return b.n - a.n; });
            tarjeta({ titulo: "Referidos del mes", sub: "Desde el " + fechaCorta(ini), kpis: [["Se anotaron", num(l.length)], ["Vendidos", num(vend)], ["Sin contactar", num(sin)], ["Pagos por confirmar", num(r[1].size)]],
                barras: top.length > 1 ? barras(top, function (x) { return x.n; }, function (x) { return x.codigo; }, num) : null });
            return { anotados: l.length, vendidos: vend, sin_contactar: sin, pagos_por_confirmar: r[1].size, mejores_codigos: top.slice(0, 5) };
        }, function (e) { if (e && e.code === "permission-denied") throw new Error("Este usuario no tiene permiso para ver referidos."); throw e; });
    }
    function ejecutar(nombre, a) {
        var h = HERR[nombre];
        if (!h) return Promise.reject(new Error("Herramienta desconocida: " + nombre));
        return Promise.resolve().then(function () { return h(a || {}, hoyLocal()); });
    }

    /* ---------- abrir / cerrar la conversación ---------- */
    function fallo(e) {
        J.abierto = false; J.cerrando = true; cerrarMicrofono();
        try { if (J.ws) J.ws.close(); } catch (x) {}
        J.ws = null; J.pendiente = [];
        estado("error", (e && e.message) || "No se pudo conectar.");
        escucharPalabra();
    }
    function abrir(opc) {
        opc = opc || {};
        if (J.abierto) return Promise.resolve();
        J.abierto = true; J.cerrando = false; J.ultimo = Date.now(); J.reintentos = 0; J.dichoTurno = ""; J.turnoTerminado = true; J.cerrandoPorVoz = false;
        pararPalabra();
        prepararSalida(); if (J.outCtx.state === "suspended") J.outCtx.resume();
        aviso("");
        var mic = abrirMicrofono().catch(function (e) {
            throw e && e.name === "NotAllowedError" ? new Error("El navegador bloqueó el micrófono: permítalo en el candado de la barra de direcciones y vuelva a tocar Conversar.") : e;
        });
        return mic.then(conectar).then(function () {
            estado("escuchando", "Hable con naturalidad. Si lo interrumpe, Capital se calla y lo escucha.");
            if (opc.saludo !== false) enviarTexto("(La persona acaba de abrir la conversación. Saludá en una sola frase corta según la hora, por ejemplo «Buenas tardes, señor.», sin preguntar nada ni ofrecer ayuda, y esperá en silencio.)");
            clearInterval(J.reloj);
            J.reloj = setInterval(function () { if (J.abierto && !J.fuentes.length && J.estado !== "pensando" && Date.now() - J.ultimo > INACTIVO_MS) terminar("Conversación en pausa por inactividad. Diga «Capital» o toque Conversar."); }, 5000);
        }).catch(function (e) { if (e && e.reintentar) { J.abierto = false; return abrir(opc); } fallo(e); });
    }
    function terminar(nota) {
        J.abierto = false; J.cerrando = true; J.noDespertarHasta = Date.now() + 5000;
        clearInterval(J.reloj);
        try { if (J.ws) J.ws.close(); } catch (e) {}
        J.ws = null; J.listo = false; callar(); cerrarMicrofono();
        estado("espera", nota || "Toque Conversar o diga «Capital».");
        escucharPalabra();
    }
    function preguntar(t) {
        t = String(t || "").trim(); if (!t) return;
        linea("yo", t, true); cerrarLinea(); J.ultimo = Date.now();
        callar();
        if (!J.abierto) { J.pendiente.push(t); abrir({ saludo: false }); } else enviarTexto(t);
    }

    /* ---------- palabra de activación «Capital» (gratis, del navegador) ---------- */
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    function escucharPalabra() {
        if (!SR || J.despertador || J.abierto) return;
        var r = new SR(); r.lang = PY ? "es-PY" : "es-BO"; r.continuous = true; r.interimResults = true;
        r.onresult = function (ev) {
            if (Date.now() < (J.noDespertarHasta || 0)) return;   // recién cerrado con «gracias, Capital»: no se reabre solo
            for (var i = ev.resultIndex; i < ev.results.length; i++) if (/capital/i.test(ev.results[i][0].transcript) && !/gracias/i.test(ev.results[i][0].transcript)) { pararPalabra(); abrir(); return; }
        };
        r.onend = function () { if (J.despertador === r) { J.despertador = null; setTimeout(escucharPalabra, 600); } };
        r.onerror = function () {};
        try { r.start(); J.despertador = r; } catch (e) {}
    }
    function pararPalabra() { var r = J.despertador; J.despertador = null; if (r) try { r.abort(); } catch (e) {} }

    /* ---------- esfera ---------- */
    var suave = 0;
    /* Isologo de Capital Corp en el centro de la esfera: late con la voz. */
    var ISO = new Image(); ISO.src = "../images/capital-corp-simbolo.png";
    function dibujar() {
        var c = $("jv-esfera"), x = c.getContext("2d"), dpr = Math.min(1.5, window.devicePixelRatio || 1);
        var w = c.clientWidth * dpr, h = c.clientHeight * dpr; if (c.width !== w) { c.width = w; c.height = h; }
        var t = performance.now() / 1000, r0 = Math.min(w, h) * 0.28, nivel = 0;
        if (J.analizador && J.fuentes.length) { var a = new Uint8Array(J.analizador.frequencyBinCount); J.analizador.getByteFrequencyData(a); var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; nivel = s / a.length / 255; }
        else if (J.abierto && !J.mudo) nivel = Math.min(1, J.nivelMic * 6);
        suave += (nivel - suave) * 0.25;
        x.clearRect(0, 0, w, h);
        var habla = J.estado === "hablando", piensa = J.estado === "pensando";
        var col = habla ? "227,6,19" : J.estado === "error" ? "199,106,98" : J.abierto ? "232,236,240" : "120,124,130";
        /* halo */
        var gr = x.createRadialGradient(w / 2, h / 2, r0 * 0.2, w / 2, h / 2, r0 * 1.6);
        gr.addColorStop(0, "rgba(" + col + "," + (0.10 + suave * 0.25) + ")"); gr.addColorStop(1, "rgba(" + col + ",0)");
        x.fillStyle = gr; x.beginPath(); x.arc(w / 2, h / 2, r0 * 1.6, 0, Math.PI * 2); x.fill();
        for (var k = 0; k < 4; k++) {
            x.beginPath();
            for (var g = 0; g <= 160; g++) {
                var an = g / 160 * Math.PI * 2, vel = piensa ? 3 : 1.2;
                var onda = Math.sin(an * (3 + k) + t * (vel + k * .4)) * (5 + suave * 70) * dpr + Math.sin(an * (7 + k) - t * 0.9) * (2 + suave * 18) * dpr;
                var rr = r0 + k * 9 * dpr + onda + suave * 26 * dpr, px = w / 2 + Math.cos(an) * rr, py = h / 2 + Math.sin(an) * rr;
                g ? x.lineTo(px, py) : x.moveTo(px, py);
            }
            x.closePath(); x.strokeStyle = "rgba(" + col + "," + (0.7 - k * 0.15) + ")"; x.lineWidth = (2.2 - k * .45) * dpr; x.stroke();
        }
        if (ISO.complete && ISO.naturalWidth) {
            var lado = r0 * (0.95 + suave * 0.18), alto = lado * ISO.naturalHeight / ISO.naturalWidth;
            x.save(); x.globalAlpha = J.abierto ? 0.95 : 0.75;
            x.drawImage(ISO, w / 2 - lado / 2, h / 2 - alto / 2, lado, alto); x.restore();
        }
        if (piensa) { x.beginPath(); x.arc(w / 2, h / 2, r0 * 0.78, t * 4, t * 4 + Math.PI * 0.6); x.strokeStyle = "rgba(232,236,240,.8)"; x.lineWidth = 2 * dpr; x.stroke(); }
        requestAnimationFrame(dibujar);
    }

    /* ---------- arranque ---------- */
    $("jv-boton").onclick = function () { J.abierto ? terminar() : abrir(); };
    $("jv-mudo").onclick = function () { J.mudo = !J.mudo; this.textContent = J.mudo ? "Activar micrófono" : "Silenciar micrófono"; this.classList.toggle("is-on", J.mudo); };
    $("jv-full").onclick = function () { var d = document.documentElement; (document.fullscreenElement ? document.exitFullscreen() : d.requestFullscreen && d.requestFullscreen()); };
    document.addEventListener("keydown", function (e) { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); J.abierto ? terminar() : abrir(); } });
    if (PY) { var pp = $("jv-pais"); if (pp) pp.textContent = "Paraguay"; }
    estado("espera", SR ? "Toque Conversar o diga «Capital»." : "Toque Conversar para hablar con Capital.");
    escucharPalabra();
    requestAnimationFrame(dibujar);
    window.JARVIS = { abrir: abrir, terminar: terminar, preguntar: preguntar, _J: J, _ejecutar: ejecutar };
})();
