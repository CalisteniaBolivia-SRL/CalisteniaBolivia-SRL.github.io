/* =====================================================================================================
   Snacks · lectura de ventas del ERP S-ERP desde el servidor (Bolivia y Paraguay).
   Antes cada computadora leía las ventas una por una (miles de consultas) y las guardaba en el navegador, que se
   llenaba. Ahora el servidor las lee UNA vez y las guarda en la base por mes:
     snk_bo/AAAA-MM · snk_py/AAAA-MM  →  { ventas: { key: { f, s, it: "key_modelo,cantidad,precio[,1];…", a? } }, actualizado }
     bo_snack_mes/AAAA-MM            →  { snacks, alquileres, ventas, fecha }   (Bolivia: totales para los gráficos)
     snk_estado/<pais>               →  hasta qué mes ya se completó la carga histórica
   Se pone al día cada vez que alguien abre Snacks, el muro o Dirección (como mucho una vez cada 3 minutos) y
   avanza la carga histórica desde abril de 2026, de a un mes. Solo lee el ERP; nunca escribe en él.
   ===================================================================================================== */
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const WebSocket = require("ws");
if (!admin.apps.length) admin.initializeApp();

const ERP_WS_URL = process.env.SERP_WS_URL || "wss://serp.servisofts.com/ws/";   // en pruebas: un ERP simulado
const MARCA = "---SSofts---";
const ORIGENES = ["https://calisteniabolivia-srl.github.io"].concat(process.env.ORIGEN_EXTRA ? [process.env.ORIGEN_EXTRA] : []);
const PAISES = {
    bolivia: { key: "d4118f82-0b0a-44e3-8525-73df48be69db", col: "snk_bo", inicio: "2026-04", tz: "America/La_Paz" },
    paraguay: { key: "3433c7d4-a626-44de-b825-f924334e679c", col: "snk_py", inicio: "2026-04", tz: "America/Asuncion" }
};
/* Bolivia: tipos de producto de alquiler (el resto del ERP de Bolivia son snacks). */
const ALQ_BO = new Set(["e98fbe7f-96d2-4e30-b734-b672783eaa9f", "636e04ae-4600-4def-a3f3-ec7e053f67ce", "04f24377-8dd9-464a-900c-714dc7f206d8", "23bd81e3-ba2a-4fd2-91a4-a1ba9687925f", "1074a23a-41d3-466b-b9f5-79627eef118c"]);
const PRESUPUESTO_MS = 200000;   // por llamada; lo que falte sigue en la próxima

function hoy(tz) { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 10); }
function finDeMes(m) { const y = +m.slice(0, 4), mm = +m.slice(5, 7); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); }
function mesSiguiente(m) { let y = +m.slice(0, 4), mm = +m.slice(5, 7) + 1; if (mm > 12) { mm = 1; y++; } return y + "-" + String(mm).padStart(2, "0"); }
function mesAnterior(m) { let y = +m.slice(0, 4), mm = +m.slice(5, 7) - 1; if (mm < 1) { mm = 12; y--; } return y + "-" + String(mm).padStart(2, "0"); }
function lineas(it) { return String(it || "").split(";").filter(Boolean).map((x) => { const p = x.split(","); return [p[0], Number(p[1]) || 0, Number(p[2]) || 0, p[3] ? 1 : 0]; }); }
function valores(d) { if (!d) return []; return Array.isArray(d) ? d : Object.keys(d).map((k) => d[k]); }

/* Conexión con el ERP: varios pedidos a la vez, cada respuesta se reconoce por su _ssocket_promise. */
function conectarERP() {
    return new Promise((ok, mal) => {
        const ws = new WebSocket(ERP_WS_URL), esperando = new Map();
        let buffer = "", listo = false;
        const t = setTimeout(() => { if (!listo) { try { ws.close(); } catch (e) {} mal(new Error("tiempo")); } }, 20000);
        ws.on("error", (e) => { if (!listo) { clearTimeout(t); mal(e); } esperando.forEach((p) => p.mal(new Error("conexion"))); esperando.clear(); });
        ws.on("close", () => { esperando.forEach((p) => p.mal(new Error("conexion"))); esperando.clear(); });
        ws.on("message", (datos) => {
            buffer += datos.toString();
            let i;
            while ((i = buffer.indexOf(MARCA)) >= 0) {
                const crudo = buffer.slice(0, i).split("---SSkey---")[0];
                buffer = buffer.slice(i + MARCA.length);
                let m; try { m = JSON.parse(crudo); } catch (e) { continue; }
                if (!listo && m.component === "servicio" && m.type === "init") {
                    listo = true; clearTimeout(t);
                    ok({
                        pedir(cuerpo, ms) {
                            return new Promise((res, rej) => {
                                const id = require("crypto").randomUUID();
                                const tt = setTimeout(() => { esperando.delete(id); rej(new Error("tiempo")); }, ms || 30000);
                                esperando.set(id, { ok: (x) => { clearTimeout(tt); res(x); }, mal: (e) => { clearTimeout(tt); rej(e); } });
                                ws.send(JSON.stringify(Object.assign({ version: "1.0", estado: "cargando", _ssocket_promise: id }, cuerpo)) + "\n");
                            });
                        },
                        cerrar() { try { ws.close(); } catch (e) {} }
                    });
                    continue;
                }
                const p = esperando.get(m._ssocket_promise);
                if (p) { esperando.delete(m._ssocket_promise); p.ok(m); }
            }
        });
    });
}

/* Pone al día un mes: ventas nuevas (una por una, en paralelo) y anulaciones. Devuelve si quedó completo. */
async function procesarMes(erp, P, mes, hasta, limite, tipos) {
    const db = admin.firestore(), ref = db.collection(P.col).doc(mes);
    const movs = await erp.pedir({ service: "caja", component: "caja", type: "getAllMovimientosCajasByEmpresa", key_empresa: P.key, fecha_inicio: mes + "-01", fecha_fin: hasta }, 120000).then((m) => valores(m.data));
    const snap = await ref.get(), ventas = (snap.exists && snap.data().ventas) || {};
    const keys = new Set(), anul = new Set();
    movs.forEach((mv) => { const k = mv.key_compra_venta, t = String(mv.tipo || ""); if (!k) return; if (t.indexOf("anulacion") === 0) anul.add(k); else if (t === "venta" || t === "amortizacion") keys.add(k); });
    let cambios = 0;
    anul.forEach((k) => { if (ventas[k] && !ventas[k].a) { ventas[k].a = 1; cambios++; } });
    const nuevas = [...keys].filter((k) => !ventas[k] && !anul.has(k));
    let i = 0;
    async function hilo() {
        while (i < nuevas.length && Date.now() < limite) {
            const k = nuevas[i++];
            try {
                const r = await erp.pedir({ service: "compra_venta", component: "compra_venta", type: "getJson", key: k, key_empresa: P.key }, 30000);
                let v = r.data; if (Array.isArray(v)) v = v[0];
                if (!v || !v.key) continue;
                /* [key_modelo, cantidad, precio] y, en Bolivia, un 1 al final si es alquiler (el resto son snacks). */
                /* Texto compacto (Firestore no guarda listas dentro de listas): "key_modelo,cantidad,precio[,1 si es alquiler];…" */
                const it = (v.detalle || v.detalles || []).filter((d) => d.estado !== 0).map((d) => [d.key_modelo, Number(d.cantidad) || 0, Number(d.precio_unitario) || 0].concat(tipos && ALQ_BO.has(tipos[d.key_modelo]) ? [1] : []).join(",")).join(";");
                const x = { f: String(v.fecha_on || "").slice(0, 16), s: v.key_sucursal || "", it };
                if (v.state !== "vendido" || v.estado === 0) x.a = 1;
                if (x.f.slice(0, 7) === mes) { ventas[k] = x; cambios++; }
            } catch (e) { /* se reintenta en la próxima vuelta */ }
        }
    }
    await Promise.all([hilo(), hilo(), hilo(), hilo(), hilo(), hilo(), hilo(), hilo()]);
    const completo = i >= nuevas.length;
    if (cambios || !snap.exists) await ref.set({ ventas, actualizado: new Date().toISOString(), completo });
    /* Bolivia: totales del mes para los gráficos (snacks y alquileres). */
    if (tipos && (cambios || !snap.exists)) {
        const t = { snacks: 0, alquileres: 0, ventas: 0 };
        Object.keys(ventas).forEach((k) => {
            const v = ventas[k]; if (v.a) return; t.ventas++;
            lineas(v.it).forEach((l) => { const m = l[1] * l[2]; if (l[3] === 1 || ALQ_BO.has(tipos[l[0]])) t.alquileres += m; else t.snacks += m; });
        });
        await db.collection("bo_snack_mes").doc(mes).set({ snacks: Math.round(t.snacks), alquileres: Math.round(t.alquileres), ventas: t.ventas, fecha: new Date().toISOString() });
    }
    return { completo, nuevas: nuevas.length, leidas: Math.min(i, nuevas.length) };
}

async function sincronizar(pais) {
    const P = PAISES[pais], db = admin.firestore(), est = db.collection("snk_estado").doc(pais);
    /* Una sola vuelta a la vez y como mucho cada 3 minutos. */
    const ahora = Date.now();
    const ok = await db.runTransaction(async (tx) => {
        const s = await tx.get(est), d = s.exists ? s.data() : {};
        if (d.corriendo_hasta && d.corriendo_hasta > ahora) return false;
        if (d.ultima && ahora - d.ultima < 180000) return false;
        tx.set(est, { corriendo_hasta: ahora + PRESUPUESTO_MS + 60000 }, { merge: true });
        return true;
    });
    if (!ok) return { pais, salteado: true };
    const limite = ahora + PRESUPUESTO_MS, h = hoy(P.tz), actual = h.slice(0, 7), anterior = mesAnterior(actual);
    const res = { pais, meses: {} };
    let erp;
    try {
        erp = await conectarERP();
        const s = (await est.get()).data() || {};
        let tipos = null;
        if (pais === "bolivia") {
            const m = await erp.pedir({ service: "inventario", component: "modelo", type: "getAll", key_empresa: P.key, key_usuario: "" }, 60000);
            tipos = {}; valores(m.data).forEach((x) => { if (x && x.key) tipos[x.key] = x.key_tipo_producto; });
        }
        /* Primero lo de hoy (mes actual y anterior), después la carga histórica de a un mes. */
        res.meses[actual] = await procesarMes(erp, P, actual, h, limite, tipos);
        if (Date.now() < limite) res.meses[anterior] = await procesarMes(erp, P, anterior, finDeMes(anterior), limite, tipos);
        let back = s.historico || P.inicio;
        while (back < anterior && Date.now() < limite) {
            const r = await procesarMes(erp, P, back, finDeMes(back), limite, tipos);
            res.meses[back] = r;
            if (!r.completo) break;
            back = mesSiguiente(back);
        }
        await est.set({ historico: back, ultima: Date.now(), corriendo_hasta: 0, ultimo_resultado: JSON.stringify(res.meses).slice(0, 1500) }, { merge: true });
    } catch (e) {
        await est.set({ corriendo_hasta: 0, error: String(e && e.message || e).slice(0, 200), ultima: Date.now() }, { merge: true });
        res.error = String(e && e.message || e);
    } finally { if (erp) erp.cerrar(); }
    return res;
}

exports.snacksSync = onRequest({ region: "southamerica-east1", cors: ORIGENES, maxInstances: 2, timeoutSeconds: 300, memory: "512MiB" }, async (req, res) => {
    const pais = req.query.pais === "paraguay" || (req.body && req.body.pais === "paraguay") ? "paraguay" : "bolivia";
    try { res.json(await sincronizar(pais)); }
    catch (e) { console.error("snacksSync", e); res.status(500).json({ error: "No se pudo poner al día." }); }
});
exports._internos = { sincronizar, procesarMes, mesSiguiente, mesAnterior, finDeMes };
