/* Conexión del centro de mando con el MCP de Calistenia Bolivia (https://calistenia.servisofts.com/mcp).
   - Inicio de sesión OAuth con PKCE: cada persona entra con su usuario de Calistenia.
   - Solo se piden permisos de lectura.
   - Los tokens se guardan en sessionStorage (no en localStorage): duran lo que la pestaña.
   - El refresh token cambia en cada uso; esta pestaña es la única que lo renueva. */
(function () {
    var BASE = "https://calistenia.servisofts.com";
    var MCP = BASE + "/mcp";
    var AUTHORIZE = BASE + "/mcp/authorize";
    var TOKEN = BASE + "/mcp/token";
    var REGISTER = BASE + "/mcp/register";
    var REDIRECT = "https://calisteniabolivia-srl.github.io/dashboard/";
    var SCOPES = "calistenia:read clientes:read ventas:read caja:read reportes:read bancos:read facturacion:read molinetes:read";
    var PROTOCOLO = "2025-06-18";
    var K = { cliente: "cm_cliente", tokens: "cm_tokens", pkce: "cm_pkce" };

    function leer(k) { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch (e) { return null; } }
    function guardar(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function azar(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
    function b64url(bytes) {
        var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function sha256(texto) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)).then(function (h) { return b64url(new Uint8Array(h)); }); }
    function formulario(obj) { return Object.keys(obj).filter(function (k) { return obj[k] != null; }).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]); }).join("&"); }

    function cliente() {
        var c = leer(K.cliente);
        if (c && c.client_id) return Promise.resolve(c.client_id);
        return fetch(REGISTER, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_name: "Centro de mando Calistenia", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none",
                grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: SCOPES
            })
        }).then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error("registro " + r.status + " " + t); }); })
          .then(function (d) { guardar(K.cliente, { client_id: d.client_id }); return d.client_id; });
    }

    /* Lleva al inicio de sesión de Calistenia y vuelve al portal; después el portal abre "volverA". */
    function iniciarSesion(volverA) {
        return cliente().then(function (clientId) {
            var verifier = azar(48), state = azar(24);
            return sha256(verifier).then(function (challenge) {
                guardar(K.pkce, { verifier: verifier, state: state, volverA: volverA || "", clientId: clientId });
                location.href = AUTHORIZE + "?" + formulario({
                    response_type: "code", client_id: clientId, redirect_uri: REDIRECT, scope: SCOPES, state: state,
                    code_challenge: challenge, code_challenge_method: "S256", resource: MCP
                });
            });
        });
    }

    function guardarTokens(d) {
        var t = { access: d.access_token, refresh: d.refresh_token, vence: Date.now() + (Number(d.expires_in) || 900) * 1000 };
        guardar(K.tokens, t);
        return t;
    }

    /* En el portal: si la URL trae ?code=…, lo canjea por tokens. Devuelve a dónde seguir (o null). */
    function atenderVuelta() {
        var q = new URLSearchParams(location.search);
        if (!q.get("code") && !q.get("error")) return Promise.resolve(null);
        var p = leer(K.pkce);
        history.replaceState(null, "", location.pathname + location.hash);
        if (q.get("error")) return Promise.reject(new Error(q.get("error_description") || q.get("error")));
        if (!p || q.get("state") !== p.state) return Promise.reject(new Error("La respuesta del inicio de sesión no coincide. Intenta de nuevo."));
        return fetch(TOKEN, {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formulario({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: REDIRECT, client_id: p.clientId, code_verifier: p.verifier, resource: MCP })
        }).then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error("token " + r.status + " " + t); }); })
          .then(function (d) { guardarTokens(d); guardar(K.pkce, null); return p.volverA || null; });
    }

    var renovando = null;
    function acceso() {
        var t = leer(K.tokens);
        if (!t) return Promise.reject(Object.assign(new Error("sin_sesion"), { sinSesion: true }));
        if (t.vence - Date.now() > 30000) return Promise.resolve(t.access);
        if (renovando) return renovando;
        var c = leer(K.cliente);
        renovando = fetch(TOKEN, {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formulario({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: c && c.client_id, resource: MCP })
        }).then(function (r) {
            if (!r.ok) { guardar(K.tokens, null); throw Object.assign(new Error("sin_sesion"), { sinSesion: true }); }
            return r.json();
        }).then(function (d) { return guardarTokens(d).access; })
          .then(function (a) { renovando = null; return a; }, function (e) { renovando = null; throw e; });
        return renovando;
    }

    /* ----- Protocolo MCP (Streamable HTTP) ----- */
    var sesionMcp = null, iniciando = null, idPedido = 1;
    function leerRespuesta(r, id) {
        var tipo = r.headers.get("content-type") || "";
        if (tipo.indexOf("text/event-stream") >= 0) {
            return r.text().then(function (txt) {
                var msgs = [];
                txt.split(/\r?\n\r?\n/).forEach(function (bloque) {
                    var datos = bloque.split(/\r?\n/).filter(function (l) { return l.indexOf("data:") === 0; }).map(function (l) { return l.slice(5).trim(); }).join("\n");
                    if (datos) { try { msgs.push(JSON.parse(datos)); } catch (e) {} }
                });
                return msgs.filter(function (m) { return m.id === id; })[0] || msgs[msgs.length - 1];
            });
        }
        return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    }
    function enviar(cuerpo, conSesion) {
        return acceso().then(function (token) {
            var h = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + token, "Mcp-Protocol-Version": PROTOCOLO };
            if (conSesion && sesionMcp) h["Mcp-Session-Id"] = sesionMcp;
            return fetch(MCP, { method: "POST", headers: h, body: JSON.stringify(cuerpo) });
        });
    }
    function iniciarMcp() {
        if (sesionMcp) return Promise.resolve();
        if (iniciando) return iniciando;
        var id = idPedido++;
        iniciando = enviar({ jsonrpc: "2.0", id: id, method: "initialize", params: { protocolVersion: PROTOCOLO, capabilities: {}, clientInfo: { name: "centro-de-mando", version: "1.0" } } }, false)
            .then(function (r) {
                if (r.status === 401) { guardar(K.tokens, null); throw Object.assign(new Error("sin_sesion"), { sinSesion: true }); }
                if (!r.ok) throw new Error("No se pudo iniciar la conexión con Calistenia (" + r.status + ").");
                sesionMcp = r.headers.get("Mcp-Session-Id");
                return leerRespuesta(r, id);
            })
            .then(function (m) {
                if (m && m.result && m.result.protocolVersion) PROTOCOLO = m.result.protocolVersion;
                return enviar({ jsonrpc: "2.0", method: "notifications/initialized" }, true);
            })
            .then(function () { iniciando = null; }, function (e) { iniciando = null; sesionMcp = null; throw e; });
        return iniciando;
    }

    /* Llama una herramienta del MCP y devuelve su respuesta ya convertida desde JSON. */
    function llamar(nombre, args, intento) {
        intento = intento || 0;
        return iniciarMcp().then(function () {
            var id = idPedido++;
            return enviar({ jsonrpc: "2.0", id: id, method: "tools/call", params: { name: nombre, arguments: args || {} } }, true).then(function (r) {
                if ((r.status === 404 || r.status === 400) && intento < 1) { sesionMcp = null; return llamar(nombre, args, intento + 1); }
                if (r.status === 401 && intento < 1) {
                    var t = leer(K.tokens); if (t) { t.vence = 0; guardar(K.tokens, t); }
                    sesionMcp = null; return llamar(nombre, args, intento + 1);
                }
                if (r.status === 401) { guardar(K.tokens, null); throw Object.assign(new Error("sin_sesion"), { sinSesion: true }); }
                if (!r.ok) throw new Error("El servidor respondió " + r.status + " en " + nombre + ".");
                return leerRespuesta(r, id).then(function (m) {
                    if (!m) throw new Error("Respuesta vacía de " + nombre + ".");
                    if (m.error) throw new Error(m.error.message || ("Error en " + nombre));
                    var res = m.result || {};
                    var texto = (res.content || []).filter(function (c) { return c.type === "text"; }).map(function (c) { return c.text; }).join("");
                    if (res.isError) throw new Error(texto || ("Error en " + nombre));
                    var dato = res.structuredContent != null ? res.structuredContent : texto;
                    if (typeof dato === "string") { try { dato = JSON.parse(dato); } catch (e) {} }
                    if (dato && typeof dato === "object" && !Array.isArray(dato) && Object.keys(dato).length === 1 && "result" in dato) dato = dato.result;
                    return dato;
                });
            });
        });
    }

    function cerrarSesion() { guardar(K.tokens, null); guardar(K.pkce, null); sesionMcp = null; }
    function conSesion() { return !!leer(K.tokens); }

    window.CM = { iniciarSesion: iniciarSesion, atenderVuelta: atenderVuelta, llamar: llamar, cerrarSesion: cerrarSesion, conSesion: conSesion };
})();
