const test = require("node:test"); const assert = require("node:assert");
const S = require("../dashboard/snacks-logica.js");
const P = { agua: { nombre: "AGUA", tipo: "Bebida", precio: 6, costo: 3 }, gat: { nombre: "GATORADE", tipo: "Bebida", precio: 12, costo: 8 }, bar: { nombre: "BARRA", tipo: "SNACK", precio: 5, costo: 6 }, mona: { nombre: "MOÑA", tipo: "Tienda", precio: 3.5, costo: 0.7 } };
const hoy = "2026-11-27";
const V = [];
for (let d = 0; d < 30; d++) { const f = S.sumarDias(hoy, -d); V.push({ f: f + "T18:10", s: "s1", it: [["agua", 2, 6], ["gat", 1, 12]] }); V.push({ f: f + "T07:30", s: "s2", it: [["agua", 1, 6]] }); }
V.push({ f: hoy + "T10:00", s: "s1", it: [["agua", 100, 6]], anul: 1 });
test("totales: solo vigentes, ganancia y margen con el costo", () => {
  const t = S.totales(V, P, hoy, hoy);
  assert.equal(t.bs, 2 * 6 + 12 + 6); assert.equal(t.unidades, 4); assert.equal(t.tickets, 2);
  assert.equal(t.ganancia, 30 - (3 * 3 + 8)); assert.equal(t.margen, Math.round(13 / 30 * 100));
});
test("por producto y ABC", () => {
  const l = S.abc(S.porProducto(V, P, S.sumarDias(hoy, -29), hoy));
  assert.equal(l[0].key, "agua"); assert.equal(l[0].unidades, 90); assert.equal(l[0].clase, "A");
  assert.equal(Math.round(l[0].diario), 3);
});
test("inventario: sin stock, se agota, parado", () => {
  const inv = S.inventario(V, P, { agua: 0, gat: 2, mona: 20 }, hoy, "s1");
  const a = Object.fromEntries(inv.map((x) => [x.key, x.alerta]));
  assert.equal(a.agua, "sin_stock"); assert.equal(a.gat, "se_agota"); assert.equal(a.mona, "parado");
});
test("compra sugerida para 14 días", () => {
  const c = S.sugerirCompra(S.inventario(V, P, { agua: 0, gat: 2 }, hoy, "s1"), 14);
  const m = Object.fromEntries(c.map((x) => [x.key, x.cantidad]));
  assert.equal(m.agua, 28); assert.equal(m.gat, 12);
  assert.equal(c.find((x) => x.key === "agua").costo, 84);
});
test("combos: agua + gatorade juntos", () => { const p = S.pares(V, P, S.sumarDias(hoy, -29), hoy); assert.equal(p[0].veces, 30); });
test("consejos: pérdida, faltante, traspaso o promo, combo, horario", () => {
  const c = S.consejos({ ventas: V, productos: P, hoy, stockSuc: { s1: { agua: 0, gat: 2 }, s2: { agua: 40, mona: 30 } }, nombreSucursal: (k) => ({ s1: "Cristo", s2: "Cusis" })[k] });
  const tipos = c.map((x) => x.tipo);
  assert.ok(c.some((x) => /pérdida: BARRA/.test(x.titulo)));
  assert.ok(c.some((x) => /Sin stock en Cristo: AGUA/.test(x.titulo)));
  assert.ok(c.some((x) => /Mover stock parado: MOÑA/.test(x.titulo)));
  assert.ok(tipos.includes("combo") && tipos.includes("horario") && tipos.includes("estrella"));
  assert.equal(c[0].prioridad, 1);
});
test("por hora y por sucursal", () => {
  const h = S.porHora(V, P, hoy, hoy); assert.equal(h[18].tickets, 1); assert.equal(h[7].tickets, 1);
  const s = S.porSucursal(V, P, hoy, hoy); assert.equal(s[0].key, "s1");
});
