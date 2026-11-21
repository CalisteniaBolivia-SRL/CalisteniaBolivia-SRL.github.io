/* Pantalla «Cámaras» del muro: todas las cámaras de todas las sucursales, girando solas por sucursal.
   El video llega del «puente de cámaras» (go2rtc) instalado en la computadora de la oficina, que se conecta a los
   grabadores Dahua. El puente se publica solo dentro de la red privada de Tailscale (https://….ts.net): fuera de
   esa red no se ve. Cada cámara se nombra en el puente «Sucursal - Nombre de la cámara»; la página las agrupa sola.
   Configuración (Dirección): dirección del puente y segundos por sucursal, guardados en com_config/camaras.
   Uso: window.CAM_muro.montar(contenedor). */
(function () {
    "use strict";
    var C = { cont: null, cfg: null, camaras: [], grupos: [], i: 0, reloj: null, error: null, cargando: false, pausa: false, editar: false };

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
    function db() { return window.firebase && firebase.apps.length ? firebase.firestore() : null; }
    function puedeEditar() { return window.CMFB && (CMFB.tieneRol("direccion") || CMFB.tieneRol("jefe_atc")); }
    function base() { return String((C.cfg && C.cfg.puente) || "").replace(/\/+$/, ""); }
    function segundos() { return Math.max(10, Math.min(300, Number(C.cfg && C.cfg.segundos) || 25)); }

    /* «Berea - Sala 1» → sucursal «Berea», cámara «Sala 1». Sin guion: «Otras». */
    function agrupar(nombres) {
        var g = {};
        nombres.sort().forEach(function (n) {
            var m = /^(.+?)\s*[-–·|]\s*(.+)$/.exec(n), suc = m ? m[1].trim() : "Otras", cam = m ? m[2].trim() : n;
            (g[suc] = g[suc] || []).push({ src: n, nombre: cam });
        });
        return Object.keys(g).sort(function (a, b) { return a === "Otras" ? 1 : b === "Otras" ? -1 : a.localeCompare(b); }).map(function (s) { return { sucursal: s, camaras: g[s] }; });
    }

    function cargar() {
        if (C.cargando) return;
        C.cargando = true;
        /* Espera la sesión del centro de mando (Firebase) antes de leer la configuración. */
        (window.CMFB && CMFB.listo ? CMFB.listo : Promise.resolve()).then(leer, leer);
    }
    function leer() {
        var d = db();
        var pCfg = d ? d.collection("com_config").doc("camaras").get().then(function (x) { C.cfg = x.exists ? x.data() : {}; }, function () { C.cfg = C.cfg || {}; }) : Promise.resolve(C.cfg = C.cfg || {});
        pCfg.then(function () {
            if (!base()) { C.error = null; C.grupos = []; return; }
            return fetch(base() + "/api/streams", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("El puente respondió " + r.status); return r.json(); })
                .then(function (j) { C.grupos = agrupar(Object.keys(j || {})); C.error = null; if (C.i >= C.grupos.length) C.i = 0; })
                .catch(function () { C.error = "No llego al puente de cámaras. Revise que la computadora de la oficina esté encendida y que este equipo tenga Tailscale abierto."; });
        }).then(function () { C.cargando = false; pintar(); programar(); });
    }

    function siguiente(paso) {
        if (!C.grupos.length) return;
        C.i = (C.i + (paso || 1) + C.grupos.length) % C.grupos.length;
        pintar();
    }
    function programar() {
        clearInterval(C.reloj);
        C.reloj = setInterval(function () { if (!C.pausa && C.cont && C.cont.offsetParent && !document.hidden) siguiente(1); }, segundos() * 1000);
    }

    function formulario() {
        var url = el("input", { type: "url", value: (C.cfg && C.cfg.puente) || "", placeholder: "https://camaras-oficina.tu-red.ts.net" });
        var seg = el("input", { type: "number", min: "10", max: "300", value: String(segundos()) });
        var msg = el("p", { class: "cam-nota" });
        return el("div", { class: "cam-form" }, [
            el("label", {}, ["Dirección del puente de cámaras", url]),
            el("label", {}, ["Segundos por sucursal", seg]),
            el("div", { class: "cam-acc" }, [
                el("button", { type: "button", class: "cam-btn is-fuerte", text: "Guardar", onclick: function () {
                    var u = url.value.trim().replace(/\/+$/, "");
                    if (u && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u)) { msg.textContent = "La dirección debe empezar con https:// (la que da Tailscale)."; return; }
                    db().collection("com_config").doc("camaras").set({ puente: u, segundos: Math.max(10, Math.min(300, parseInt(seg.value, 10) || 25)), fecha_edicion: new Date().toISOString() }, { merge: true })
                        .then(function () { C.editar = false; cargar(); programar(); }, function (e) { msg.textContent = "No se pudo guardar: " + ((e && e.message) || e); });
                } }),
                el("button", { type: "button", class: "cam-btn", text: "Cancelar", onclick: function () { C.editar = false; pintar(); } })
            ]), msg
        ]);
    }

    function pintar() {
        var c = C.cont; if (!c) return;
        c.textContent = "";
        var g = C.grupos[C.i];
        var cab = el("div", { class: "cam-cab" }, [
            el("div", { class: "cam-suc" }, [el("b", { text: g ? g.sucursal : "Cámaras" }), g ? el("span", { text: (C.i + 1) + " de " + C.grupos.length + " sucursales · " + g.camaras.length + " cámaras" }) : null]),
            el("div", { class: "cam-acc" }, [
                C.grupos.length > 1 ? el("button", { type: "button", class: "cam-btn", text: "‹ Anterior", onclick: function () { siguiente(-1); programar(); } }) : null,
                C.grupos.length > 1 ? el("button", { type: "button", class: "cam-btn", text: C.pausa ? "Seguir girando" : "Pausar", onclick: function () { C.pausa = !C.pausa; pintar(); } }) : null,
                C.grupos.length > 1 ? el("button", { type: "button", class: "cam-btn", text: "Siguiente ›", onclick: function () { siguiente(1); programar(); } }) : null,
                puedeEditar() ? el("button", { type: "button", class: "cam-btn", text: "Configurar", onclick: function () { C.editar = !C.editar; pintar(); } }) : null
            ])
        ]);
        c.appendChild(cab);
        if (C.editar && puedeEditar()) c.appendChild(formulario());
        if (C.grupos.length > 1) c.appendChild(el("div", { class: "cam-chips" }, C.grupos.map(function (x, k) {
            return el("button", { type: "button", class: "cam-chip" + (k === C.i ? " is-on" : ""), text: x.sucursal, onclick: function () { C.i = k; pintar(); programar(); } });
        })));
        if (!base()) { c.appendChild(el("div", { class: "cam-vacio" }, [el("b", { text: "Falta conectar el puente de cámaras." }), " Cuando esté instalado en la computadora de la oficina, Dirección toca «Configurar» y pega su dirección. Desde ahí se ven todas las cámaras de todas las sucursales, girando solas."])); return; }
        if (C.error) { c.appendChild(el("div", { class: "cam-vacio" }, [el("b", { text: "Sin video. " }), C.error])); return; }
        if (!g) { c.appendChild(el("div", { class: "cam-vacio", text: C.cargando ? "Buscando cámaras…" : "El puente no tiene cámaras cargadas todavía." })); return; }
        var n = g.camaras.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
        c.appendChild(el("div", { class: "cam-grilla", style: "grid-template-columns: repeat(" + cols + ", minmax(0, 1fr))" }, g.camaras.map(function (cam) {
            return el("figure", { class: "cam-celda" }, [
                el("iframe", { src: base() + "/stream.html?src=" + encodeURIComponent(cam.src) + "&mode=mse,webrtc", title: g.sucursal + " · " + cam.nombre, allow: "autoplay", loading: "lazy" }),
                el("figcaption", { text: cam.nombre })
            ]);
        })));
    }

    window.CAM_muro = {
        montar: function (cont) {
            var primera = C.cont !== cont; C.cont = cont;
            if (primera || !C.cfg) cargar(); else pintar();
            programar();
        },
        /* Para el conteo de personas (siguiente paso): lista de sucursales y cámaras, y la dirección del puente. */
        camaras: function () { return { puente: base(), grupos: C.grupos }; },
        _interno: { agrupar: agrupar, C: C }
    };
    /* Cada 10 minutos vuelve a leer la lista de cámaras del puente (por si se agregan). */
    setInterval(function () { if (C.cont && C.cont.offsetParent && !document.hidden) cargar(); }, 600000);
})();
