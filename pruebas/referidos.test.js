/* Pruebas de las reglas de los códigos de referido. Correr con: node --test pruebas/referidos.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../dashboard/referidos-logica.js");

const juan = { key_usuario: "u-juan", nombre: "Juan Pérez Vaca", ci: "1234567 SC", telefono: "+591 70000001", estado: 1,
  familiares: [{ nombre: "Ana Pérez", ci: "7654321", telefono: "" }] };
const ins = (o) => Object.assign({ codigo: "JUAN-CAL", ci: "9990001", telefono: "71111111", nombre: "Lucía Áñez Rojas", fecha: "2026-11-10T10:00:00Z" }, o);

test("código: único, en mayúsculas, sin -CAL (los viejos -CAL siguen valiendo)", () => {
  const usados = new Set(["JUAN"]);
  assert.equal(R.generarCodigo("Juan Carlos Pérez", () => false), "JUAN");
  assert.equal(R.generarCodigo("Juan Carlos Pérez", (c) => usados.has(c)), "JUAN2");
  assert.equal(R.generarCodigo("José Ñandú", () => false), "JOSE");
  assert.equal(R.generarCodigo("Al", () => false), "ALC");
  assert.equal(R.normCodigo(" juan-cal "), "JUAN-CAL");
  assert.equal(R.mostrarCodigo("JUAN-CAL"), "JUAN");
  assert.equal(R.codigoValido("JUANFIT"), true);
  assert.equal(R.codigoValido("JU"), false);
  assert.equal(R.codigoValido("JUAN FIT"), false);
});

test("cliente nuevo (sin ficha en el ERP) → válido", () => {
  const v = R.validarInscripcion(ins(), juan, null, null);
  assert.equal(v.ok, true); assert.equal(v.estado, "valido");
});

test("cliente registrado sin compras cuenta como nuevo", () => {
  const v = R.validarInscripcion(ins(), juan, { key_usuario: "c1", compras: 0, primera_compra: null }, null);
  assert.equal(v.ok, true);
});

test("cliente actual (con compras previas) también vale", () => {
  const v = R.validarInscripcion(ins(), juan, { key_usuario: "c1", compras: 3, primera_compra: "2025-01-05" }, null);
  assert.equal(v.ok, true); assert.equal(v.alertas.length, 0);
});

test("código propio (mismo carnet o celular) → rechazado y alerta «propio»", () => {
  assert.equal(R.validarInscripcion(ins({ ci: "1234567sc" }), juan, null, null).alertas[0].tipo, "propio");
  assert.equal(R.validarInscripcion(ins({ ci: "", telefono: "70000001" }), juan, null, null).alertas[0].tipo, "propio");
  assert.equal(R.validarInscripcion(ins(), juan, { key_usuario: "u-juan", compras: 0 }, null).alertas[0].tipo, "propio");
});

test("familiar declarado → rechazado y alerta «familiar»", () => {
  const v = R.validarInscripcion(ins({ ci: "7654321" }), juan, null, null);
  assert.equal(v.ok, false); assert.equal(v.alertas[0].tipo, "familiar");
});

test("mismos dos apellidos → válido pero con alerta para revisar", () => {
  const v = R.validarInscripcion(ins({ nombre: "Pedro Pérez Vaca" }), juan, null, null);
  assert.equal(v.ok, true); assert.equal(v.alertas[0].tipo, "apellido");
});

test("un cliente queda con el primer código que usó", () => {
  const v = R.validarInscripcion(ins(), juan, null, { codigo: "MARIA-CAL" });
  assert.equal(v.ok, false); assert.equal(v.alertas[0].tipo, "duplicado");
});

test("venta del referido: primera compra desde que se anotó, también para clientes actuales", () => {
  const h = [{ key_paquete_venta: "v2", fecha_venta: "2026-11-12", anulada: false }, { key_paquete_venta: "v1", fecha_venta: "2026-11-10", anulada: true }];
  assert.equal(R.ventaDelReferido(h, "2026-11-10").venta.key_paquete_venta, "v2");
  const act = R.ventaDelReferido([{ key_paquete_venta: "v0", fecha_venta: "2026-10-01", anulada: false }, { key_paquete_venta: "v3", fecha_venta: "2026-11-15", anulada: false }], "2026-11-10");
  assert.equal(act.existente, true); assert.equal(act.venta.key_paquete_venta, "v3");
  assert.equal(R.ventaDelReferido([{ fecha_venta: "2026-10-01", anulada: false }], "2026-11-10").venta, null);
  assert.equal(R.ventaDelReferido([], "2026-11-10").venta, null);
});

test("cobrado: solo pagos positivos (la transferencia +X/−X al banco no resta)", () => {
  assert.equal(R.cobrado([{ monto: 250 }, { monto: -250 }]), 250);
  assert.equal(R.cobrado([{ monto: 100 }, { monto: 50, anulado: true }]), 100);
});

test("comisión: 5 % de lo cobrado por defecto (con descuento se calcula sobre lo cobrado)", () => {
  assert.equal(R.calcularComision(199, 2.5), 4.98);
  assert.equal(R.calcularComision(212.5, 5), 10.63);
  assert.equal(R.pctPara({}, "PLAN MENSUAL"), 5);
  assert.equal(R.DESC_CLIENTE, 15);
  assert.equal(R.pctPara({ pct: 3 }, "PLAN MENSUAL"), 3);
  assert.equal(R.pctPara({ pct: 3, pct_paquete: { "Plan Black - Acceso a todas las Sucursales": 4 } }, "plan black - acceso a todas las sucursales"), 4);
});

test("venta sin pago → pendiente; al pagar → ganada y congelada", () => {
  const p = R.actualizar(null, { anulada: false, cobrado: 0, precio: 250, paquete: "PLAN MENSUAL" }, { pct: 2.5 }, "2026-11-12T10:00:00Z");
  assert.equal(p.estado, "pendiente"); assert.equal(p.comision, 0); assert.equal(p.estimada, 6.25);
  const g = R.actualizar(Object.assign({}, p), { anulada: false, cobrado: 200, precio: 250, paquete: "PLAN MENSUAL" }, { pct: 2.5 }, "2026-11-13T10:00:00Z");
  assert.equal(g.estado, "ganada"); assert.equal(g.comision, 5); assert.equal(g.fecha_ganada, "2026-11-13T10:00:00Z");
  // Cambia el % y el precio después: no se toca (congelada).
  assert.equal(R.actualizar(Object.assign({}, p, g), { anulada: false, cobrado: 300, paquete: "PLAN MENSUAL" }, { pct: 10 }), null);
});

test("pago directo en caja (sin pasar por pendiente) → ganada", () => {
  const g = R.actualizar(null, { anulada: false, cobrado: 250, paquete: "PLAN MENSUAL" }, {}, "2026-11-12T10:00:00Z");
  assert.equal(g.estado, "ganada"); assert.equal(g.comision, 12.5);
});

test("anulación antes de liquidar → revertida sin saldo en contra", () => {
  const r = R.actualizar({ estado: "ganada", comision: 6.25 }, { anulada: true }, {});
  assert.equal(r.estado, "revertida"); assert.equal(r.revertida_tras_pago, false); assert.equal(r.saldo, 0);
});

test("anulación después de liquidar → revertida con saldo en contra a descontar", () => {
  const r = R.actualizar({ estado: "pagada", comision: 6.25 }, { anulada: true }, {});
  assert.equal(r.estado, "revertida"); assert.equal(r.revertida_tras_pago, true); assert.equal(r.saldo, -6.25);
  const liq = R.liquidacion([{ id: "a", estado: "ganada", comision: 10 }, { id: "b", estado: "revertida", revertida_tras_pago: true, comision: 6.25 }], 0);
  assert.deepEqual([liq.bruto, liq.descuento, liq.neto, liq.se_puede], [10, 6.25, 3.75, true]);
  const negativo = R.liquidacion([{ id: "a", estado: "ganada", comision: 5 }, { id: "b", estado: "revertida", revertida_tras_pago: true, comision: 6.25 }], 0);
  assert.equal(negativo.se_puede, false);   // queda en contra hasta que gane más
});

test("venta anulada que nunca generó comisión → nada", () => {
  assert.equal(R.actualizar(null, { anulada: true }, {}), null);
});

test("período de pago del 26 al 25", () => {
  assert.deepEqual(R.periodo("2026-11-25"), { clave: "2026-11", desde: "2026-10-26", hasta: "2026-11-25" });
  assert.equal(R.periodo("2026-11-26").clave, "2026-12");
  assert.equal(R.periodo("2026-12-30").clave, "2027-01");
});

test("resumen en montos: ganada, pendiente, pagada y saldo", () => {
  const r = R.resumen([
    { estado: "ganada", comision: 6.25, fecha_ganada: "2026-11-22T10:00:00Z" },
    { estado: "pagada", comision: 5, fecha_ganada: "2026-11-02T10:00:00Z" },
    { estado: "pendiente", estimada: 10 },
    { estado: "revertida", revertida_tras_pago: true, comision: 2 }
  ], "2026-11-22");
  assert.deepEqual([r.cierres_dia, r.cierres_periodo, r.ganada, r.pendiente, r.pagada, r.en_contra, r.saldo], [1, 2, 6.25, 10, 5, 2, 4.25]);
});

test("meta y bonos: «te faltan 3 cierres para tu bono de 100»", () => {
  const m = R.metaYBonos(7, { bonos: [{ cierres: 10, monto: 100 }, { cierres: 20, monto: 250 }] });
  assert.deepEqual(m.proximo, { cierres: 10, monto: 100, faltan: 3 });
  assert.equal(R.metaYBonos(12, { bonos: [{ cierres: 10, monto: 100 }] }).bono_ganado, 100);
});

test("tabla «si vendés este paquete, ganás» y ranking", () => {
  const t = R.tablaPaquetes([{ nombre: "PLAN MENSUAL", precio: 250 }, { nombre: "PLAN DIARIO", precio: 40 }, { nombre: "BECA", precio: 0 }], { pct: 2.5 });
  assert.deepEqual(t.map((x) => x.gana), [6.25, 1]);
  const k = R.ranking([{ nombre: "A", cierres: 2, comision: 5 }, { nombre: "B", cierres: 5, comision: 12 }]);
  assert.equal(k[0].nombre, "B"); assert.equal(k[0].puesto, 1);
});
