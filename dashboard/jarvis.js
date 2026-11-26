/* =====================================================================================================
   Capital · asistente de voz en tiempo real (Gemini Live, voz a voz).
   - Pide un token temporal al servidor (liveToken) con la sesión del centro de mando; la clave de Google no
     pasa por el navegador.
   - Micrófono continuo a 16 kHz con cancelación de eco; la voz de Capital llega a 24 kHz y se reproduce
     sin cortes. Si usted habla mientras responde, Gemini lo detecta, Capital se calla y atiende lo nuevo.
   - Los datos de la empresa los pide el modelo con herramientas y se leen acá con la sesión del usuario
     (Bolivia: sistema de Calistenia; Paraguay: ERP de Paraguay).
   - Tras 2 minutos sin conversación se cierra (cuesta por minuto); se reabre con «Capital» o con el botón.
   ===================================================================================================== */
(function () {
    "use strict";
    var CFG = window.CM_FIREBASE_CONFIG || {};
    var PUENTE = window.CM_LIVE_PUENTE || ("https://southamerica-east1-" + CFG.projectId + ".cloudfunctions.net/liveToken");
    var WS = function (ver, token) { return "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage." + ver + ".GenerativeService.BidiGenerateContentConstrained?access_token=" + encodeURIComponent(token); };
    var PY = window.CM_PAIS === "paraguay";
    var INACTIVO_MS = 120000;
    var $ = function (id) { return document.getElementById(id); };

    var J = { ws: null, token: null, tokenVence: 0, setup: null, handle: null, ver: "v1beta", estado: "espera", abierto: false,
        micCtx: null, micStream: null, micNodo: null, nivelMic: 0, mudo: false,
        outCtx: null, outGain: null, analizador: null, proxima: 0, fuentes: [], ultimo: 0, reloj: null, despertador: null };

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
        if (!nueva && ult && ult.dataset.quien === quien && !ult.dataset.fin) { ult.querySelector("span").textContent += texto; }
        else {
            var p = document.createElement("p"); p.className = "jv-l is-" + quien; p.dataset.quien = quien;
            var b = document.createElement("b"); b.textContent = quien === "yo" ? "Usted" : "Capital";
            var s = document.createElement("span"); s.textContent = texto;
            p.appendChild(b); p.appendChild(s); log.appendChild(p);
            while (log.children.length > 40) log.removeChild(log.firstChild);
        }
        log.scrollTop = log.scrollHeight;
    }
    function cerrarLinea() { var u = $("jv-log").lastElementChild; if (u) u.dataset.fin = "1"; }
    function aviso(t) { var a = $("jv-aviso"); a.textContent = t || ""; a.hidden = !t; }

    /* ---------- utilidades de audio ---------- */
    function aBase64(buf) { var b = new Uint8Array(buf), s = "", i; for (i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
    function deBase64(b64) { var s = atob(b64), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b.buffer; }
    var WORKLET = "class Cap extends AudioWorkletProcessor{constructor(){super();this.b=[];}process(i){var c=i[0]&&i[0][0];if(!c)return true;for(var k=0;k<c.length;k++)this.b.push(c[k]);" +
        "if(this.b.length>=640){var o=new Int16Array(this.b.length),q=0;for(var j=0;j<this.b.length;j++){var s=Math.max(-1,Math.min(1,this.b[j]));o[j]=s<0?s*32768:s*32767;q+=s*s;}" +
        "this.port.postMessage({pcm:o.buffer,nivel:Math.sqrt(q/this.b.length)},[o.buffer]);this.b=[];}return true;}}registerProcessor('cap',Cap);";

    function prepararSalida() {
        if (J.outCtx) return;
        J.outCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        J.outGain = J.outCtx.createGain(); J.analizador = J.outCtx.createAnalyser(); J.analizador.fftSize = 256;
        J.outGain.connect(J.analizador);
        /* La voz sale por un elemento <audio>: así el cancelador de eco del navegador la reconoce y la resta del micrófono.
           Si el navegador no lo permite, sale directo por los parlantes como antes. */
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
        var t = Math.max(J.outCtx.currentTime + 0.03, J.proxima);
        src.start(t); J.proxima = t + buf.duration;
        J.fuentes.push(src); src.onended = function () { J.fuentes = J.fuentes.filter(function (x) { return x !== src; }); if (!J.fuentes.length) { if (!J.cortado) J.colaHasta = Date.now() + 450; if (J.estado === "hablando") estado("escuchando"); } };
        if (J.estado !== "hablando") estado("hablando");
    }
    function callar() {
        J.cortado = true; J.colaHasta = 0;
        J.fuentes.forEach(function (s) { try { s.stop(); } catch (e) {} });
        J.fuentes = []; J.proxima = 0;
        if (J.abierto) estado("escuchando");
    }

    function abrirMicrofono() {
        if (J.micStream) return Promise.resolve();
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
    /* Anti-eco: mientras el asistente habla (y un instante después), el micrófono no se manda, para que no se escuche
       a sí mismo por los parlantes y se corte. Si alguien le habla claramente más fuerte que el eco (≈ 0,2 s seguidos),
       se lo deja interrumpir. */
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
    function pedirToken() {
        if (J.token && Date.now() < J.tokenVence) return Promise.resolve(J.token);
        return (window.CMFB ? CMFB.listo : Promise.resolve()).then(function () {
            var u = window.firebase && firebase.auth().currentUser;
            if (!u) throw new Error("Falta la sesión del centro de mando: salí y volvé a ingresar con tu usuario del ERP.");
            return u.getIdToken();
        }).then(function (id) {
            return fetch(PUENTE, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + id }, body: JSON.stringify({ pais: PY ? "paraguay" : "bolivia" }) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || !d.token) throw new Error(d.error || ("El servidor respondió " + r.status)); return d; }); })
          .then(function (d) { J.token = d.token; J.setup = d.setup; J.tokenVence = Date.now() + 25 * 60000; return d.token; });
    }

    function conectar() {
        estado("conectando");
        return pedirToken().then(function (token) {
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
                        if (m.setupComplete) { listo = true; J.listo = true; ok(); return; }
                        atender(m);
                    });
                };
                ws.onerror = function () {};
                ws.onclose = function (e) {
                    J.listo = false;
                    if (!listo) {
                        /* El token temporal funciona en v1beta; si Google lo rechaza ahí, se prueba v1alpha. */
                        if (J.ver === "v1beta") { J.ver = "v1alpha"; conectar().then(ok, mal); return; }
                        mal(new Error("Google cerró la conexión (" + e.code + (e.reason ? ": " + e.reason : "") + ")."));
                        return;
                    }
                    if (J.abierto && !J.cerrando) { estado("conectando", "Reconectando…"); setTimeout(function () { if (J.abierto) conectar().catch(fallo); }, 400); }
                };
            });
        });
    }

    function atender(m) {
        J.ultimo = Date.now();
        if (m.sessionResumptionUpdate && m.sessionResumptionUpdate.resumable && m.sessionResumptionUpdate.newHandle) J.handle = m.sessionResumptionUpdate.newHandle;
        if (m.goAway) { try { J.ws.close(); } catch (e) {} return; }
        var sc = m.serverContent;
        if (sc) {
            if (sc.interrupted) { callar(); cerrarLinea(); }
            if (sc.inputTranscription && sc.inputTranscription.text) linea("yo", sc.inputTranscription.text);
            if (sc.outputTranscription && sc.outputTranscription.text) linea("capital", sc.outputTranscription.text);
            ((sc.modelTurn && sc.modelTurn.parts) || []).forEach(function (p) { if (p.inlineData && p.inlineData.data) reproducir(p.inlineData.data); });
            if (sc.turnComplete) cerrarLinea();
        }
        if (m.toolCall && m.toolCall.functionCalls) {
            estado("pensando");
            Promise.all(m.toolCall.functionCalls.map(function (fc) {
                return ejecutar(fc.name, fc.args || {}).then(function (r) { return { id: fc.id, name: fc.name, response: { result: r } }; },
                    function (e) { return { id: fc.id, name: fc.name, response: { error: (e && e.message) || "No se pudo leer el dato." } }; });
            })).then(function (resp) { if (J.ws && J.ws.readyState === 1) J.ws.send(JSON.stringify({ toolResponse: { functionResponses: resp } })); });
        }
    }

    /* ---------- herramientas: datos reales con la sesión del usuario ---------- */
    function hoyLocal() {
        var p = new Intl.DateTimeFormat("en-CA", { timeZone: PY ? "America/Asuncion" : "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        return p.slice(0, 10);
    }
    function recortar(o) { var s = JSON.stringify(o); return s.length > 7000 ? JSON.parse(JSON.stringify(o, function (k, v) { return Array.isArray(v) ? v.slice(0, 25) : v; })) : o; }
    function llamar(t, a) {
        if (!window.CM || !CM.llamar) return Promise.reject(new Error("Falta la conexión con los datos de Calistenia."));
        return CM.llamar(t, a).then(function (r) { if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) {} } return r; });
    }
    function ejecutar(nombre, a) {
        var hoy = hoyLocal();
        if (nombre === "ventas") return llamar("reporte_ventas", { desde: a.desde || hoy, hasta: a.hasta || hoy, agrupar_por: a.agrupar_por || "dia" }).then(recortar);
        if (nombre === "asistencia_hoy") return llamar("asistencia_del_dia", { fecha: hoy }).then(function (r) {
            return recortar({ total: r && (r.total || r.visitas), por_sucursal: r && (r.por_sucursal || r.sucursales), por_hora: r && r.por_hora, comparado: r && (r.pct_del_promedio || r.promedio) });
        });
        if (nombre === "clientes_por_vencer" || nombre === "clientes_vencidos") {
            var d = Math.max(1, Math.min(nombre === "clientes_vencidos" ? 180 : 30, parseInt(a.dias, 10) || 7));
            return llamar(nombre, { dias: d, limite: 30 }).then(function (r) {
                var f = (r && (r.filas || r.clientes || r.result)) || [];
                return recortar({ total: (r && r.total) || f.length, ejemplos: f.slice(0, 12).map(function (c) { return { cliente: c.cliente || c.nombre, sucursal: c.sucursal, vence: c.fecha_fin, paquete: c.paquete }; }) });
            });
        }
        return Promise.reject(new Error("Herramienta desconocida: " + nombre));
    }

    /* ---------- abrir / cerrar la conversación ---------- */
    function fallo(e) {
        J.abierto = false; cerrarMicrofono();
        estado("error", (e && e.message) || "No se pudo conectar.");
        escucharPalabra();
    }
    function abrir() {
        if (J.abierto) return;
        J.abierto = true; J.cerrando = false; J.ultimo = Date.now();
        pararPalabra();
        prepararSalida(); if (J.outCtx.state === "suspended") J.outCtx.resume();
        aviso("");
        abrirMicrofono().then(conectar).then(function () {
            estado("escuchando", "Hable con naturalidad. Si lo interrumpe, Capital se calla y lo escucha.");
            /* Saludo breve, sin datos. */
            J.ws.send(JSON.stringify({ realtimeInput: { text: "(La persona acaba de abrir la conversación. Saludá brevemente según la hora y preguntá en qué podés ayudar.)" } }));
            clearInterval(J.reloj);
            J.reloj = setInterval(function () { if (J.abierto && !J.fuentes.length && Date.now() - J.ultimo > INACTIVO_MS) terminar("Conversación en pausa por inactividad. Diga «Capital» o toque Conversar."); }, 5000);
        }).catch(function (e) {
            if (e && e.name === "NotAllowedError") e = new Error("El navegador bloqueó el micrófono. Permítalo en el candado de la barra de direcciones y vuelva a tocar Conversar.");
            fallo(e);
        });
    }
    function terminar(nota) {
        J.abierto = false; J.cerrando = true;
        clearInterval(J.reloj);
        try { if (J.ws) J.ws.close(); } catch (e) {}
        J.ws = null; callar(); cerrarMicrofono();
        estado("espera", nota || "Toque Conversar o diga «Capital».");
        escucharPalabra();
    }

    /* ---------- palabra de activación «Capital» (gratis, del navegador) ---------- */
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    function escucharPalabra() {
        if (!SR || J.despertador || J.abierto) return;
        var r = new SR(); r.lang = "es-BO"; r.continuous = true; r.interimResults = true;
        r.onresult = function (ev) {
            for (var i = ev.resultIndex; i < ev.results.length; i++) if (/capital/i.test(ev.results[i][0].transcript)) { pararPalabra(); abrir(); return; }
        };
        r.onend = function () { if (J.despertador === r) { J.despertador = null; setTimeout(escucharPalabra, 600); } };
        r.onerror = function () {};
        try { r.start(); J.despertador = r; } catch (e) {}
    }
    function pararPalabra() { var r = J.despertador; J.despertador = null; if (r) try { r.abort(); } catch (e) {} }

    /* ---------- esfera ---------- */
    function dibujar() {
        var c = $("jv-esfera"), x = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
        var w = c.clientWidth * dpr, h = c.clientHeight * dpr; if (c.width !== w) { c.width = w; c.height = h; }
        var t = performance.now() / 1000, r0 = Math.min(w, h) * 0.28, nivel = 0;
        if (J.analizador && J.fuentes.length) { var a = new Uint8Array(J.analizador.frequencyBinCount); J.analizador.getByteFrequencyData(a); var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; nivel = s / a.length / 255; }
        else if (J.abierto && !J.mudo) nivel = Math.min(1, J.nivelMic * 6);
        x.clearRect(0, 0, w, h);
        var col = J.estado === "hablando" ? "232,236,240" : J.estado === "error" ? "199,106,98" : J.abierto ? "196,200,206" : "120,124,130";
        for (var k = 0; k < 3; k++) {
            x.beginPath();
            for (var g = 0; g <= 128; g++) {
                var an = g / 128 * Math.PI * 2, onda = Math.sin(an * (3 + k) + t * (1.2 + k * .4)) * (6 + nivel * 60) * dpr;
                var rr = r0 + k * 10 * dpr + onda + nivel * 30 * dpr, px = w / 2 + Math.cos(an) * rr, py = h / 2 + Math.sin(an) * rr;
                g ? x.lineTo(px, py) : x.moveTo(px, py);
            }
            x.closePath(); x.strokeStyle = "rgba(" + col + "," + (0.55 - k * 0.15) + ")"; x.lineWidth = (2 - k * .4) * dpr; x.stroke();
        }
        requestAnimationFrame(dibujar);
    }

    /* ---------- arranque ---------- */
    $("jv-boton").onclick = function () { J.abierto ? terminar() : abrir(); };
    $("jv-mudo").onclick = function () { J.mudo = !J.mudo; this.textContent = J.mudo ? "Activar micrófono" : "Silenciar micrófono"; this.classList.toggle("is-on", J.mudo); };
    $("jv-full").onclick = function () { var d = document.documentElement; (document.fullscreenElement ? document.exitFullscreen() : d.requestFullscreen && d.requestFullscreen()); };
    document.addEventListener("keydown", function (e) { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); J.abierto ? terminar() : abrir(); } });
    estado("espera", SR ? "Toque Conversar o diga «Capital»." : "Toque Conversar para hablar con Capital.");
    escucharPalabra();
    requestAnimationFrame(dibujar);
    window.JARVIS = { abrir: abrir, terminar: terminar, _J: J, _ejecutar: ejecutar };
})();
