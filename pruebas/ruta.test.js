const test = require("node:test"); const assert = require("node:assert");
const R = require("../dashboard/ruta-logica.js");
const SUC = [["Berea", -17.84, -63.24], ["Busch", -17.77, -63.21], ["Chonta", -17.7, -63.16], ["Cristo", -17.77, -63.18], ["Cusis", -17.76, -63.17], ["Equipetrol", -17.76, -63.2],
  ["Guaracachi", -17.78, -63.14], ["Mutualista", -17.77, -63.16], ["Pirai", -17.8, -63.22], ["Santos Dumont", -17.84, -63.18], ["Sur", -17.81, -63.17]].map(([n, la, lo]) => ({ key: n, nombre: n, lat: la, lon: lo }));
const SUP = [{ key: "u1", nombre: "Michell" }, { key: "u2", nombre: "Marco" }];
const todas = (r) => r.flatMap((x) => x.dias.flat()).map((s) => s.key).sort();

test("todas las sucursales quedan asignadas una sola vez", () => {
  const r = R.armar(SUC, SUP); assert.deepEqual(todas(r), SUC.map((s) => s.key).sort());
});
test("reparto parejo entre supervisores (diferencia máx. 1)", () => {
  const r = R.armar(SUC, SUP), n = r.map((x) => x.dias.flat().length); assert.ok(Math.abs(n[0] - n[1]) <= 1, String(n));
});
test("cada supervisor tiene visitas de lunes a sábado, parejas", () => {
  const r = R.armar(SUC, SUP); r.forEach((x) => { assert.equal(x.dias.length, 6); const c = x.dias.map((d) => d.length); assert.ok(Math.max(...c) - Math.min(...c) <= 1, String(c)); });
});
test("un solo supervisor recorre todas", () => { const r = R.armar(SUC, [SUP[0]]); assert.equal(r[0].dias.flat().length, 11); });
test("zonas: el recorrido de cada supervisor es más corto que repartir al azar", () => {
  const r = R.armar(SUC, SUP);
  const largo = (l) => l.slice(1).reduce((s, x, i) => s + R.km(l[i], x), 0);
  const zonas = r.reduce((s, x) => s + largo(x.dias.flat()), 0);
  const alternado = [SUC.filter((_, i) => i % 2 === 0), SUC.filter((_, i) => i % 2 === 1)].reduce((s, l) => s + largo(l), 0);
  assert.ok(zonas < alternado, zonas + " vs " + alternado);
});
test("sucursal sin ubicación igual se asigna", () => { const r = R.armar(SUC.concat([{ key: "X", nombre: "Sin mapa" }]), SUP); assert.ok(todas(r).includes("X")); });
test("sin supervisores no arma nada", () => { assert.deepEqual(R.armar(SUC, []), []); });
test("lunes de la semana", () => { assert.equal(R.lunes("2026-11-26"), "2026-11-23"); assert.equal(R.lunes("2026-11-23"), "2026-11-23"); assert.equal(R.lunes("2026-11-29"), "2026-11-23"); assert.equal(R.fechaDia("2026-11-23", 5), "2026-11-28"); });
test("avance cuenta visitas hechas", () => {
  const r = R.armar(SUC, SUP), a = R.avance(r, [{ key_sucursal: "Cristo" }, { key_sucursal: "Sur" }]);
  assert.equal(a.total, 11); assert.equal(a.hechas, 2); assert.equal(a.pct, 18);
});
test("link de mapa con paradas", () => { const l = R.linkMapa(SUC.slice(0, 3)); assert.ok(/destination=-17.7,-63.16/.test(l) && /waypoints=/.test(l)); });
