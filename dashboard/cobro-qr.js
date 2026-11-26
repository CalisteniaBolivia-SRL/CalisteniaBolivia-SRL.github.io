/* =====================================================================================================
   Cobros QR · lo común: dónde están los QR y cuál corresponde. Bolivia y Paraguay, el mismo código.
   Un solo lugar para todos los QR de cobro: colección cobro_qr (Bolivia) / py_cobro_qr (Paraguay), que se
   carga en dashboard/cobros-qr.html. Documentos:
     general · referidos · atc · app · suc_<key_sucursal>
   Cada uno: { uso, nombre, key_sucursal?, imagen (foto del QR), banco, cuenta, titular, nit, nota, activo, fecha_mod, por }
   Regla para elegir el QR: el de la sucursal → el del canal → el general (solo los activos).
   Lo leen: la página del referido (r/), la pantalla de caja (qr/), Referidos y la caja de la app de administración.
   ===================================================================================================== */
(function (raiz) {
    "use strict";
    var CANALES = [
        { id: "general", nombre: "General", que: "Se usa donde no haya uno propio (sucursal o canal)." },
        { id: "referidos", nombre: "Referidos", que: "Lo ve el cliente que se anota con un código y paga en el momento." },
        { id: "atc", nombre: "Atención al Cliente", que: "Para cobrar por WhatsApp desde Atención al Cliente." },
        { id: "app", nombre: "App de clientes", que: "Para pagos desde la app (si no se usa el QR automático del banco)." }
    ];
    function col(pais) { return (pais === "paraguay" ? "py_" : "") + "cobro_qr"; }
    function idSucursal(key) { return "suc_" + String(key || "").replace(/[^A-Za-z0-9_-]/g, ""); }
    /* Orden de búsqueda para un lugar. */
    function candidatos(o) {
        var l = [];
        if (o && o.sucursal) l.push(idSucursal(o.sucursal));
        if (o && o.canal && o.canal !== "general") l.push(o.canal);
        l.push("general");
        return l;
    }
    /* Con la base de Firebase (páginas del centro de mando y públicas). Devuelve el QR que corresponde o null. */
    function buscar(db, pais, o) {
        var ids = candidatos(o), c = db.collection(col(pais));
        return Promise.all(ids.map(function (id) { return c.doc(id).get().then(function (d) { return d.exists ? Object.assign({ id: id }, d.data()) : null; }, function () { return null; }); }))
            .then(function (l) { return l.filter(function (x) { return x && x.activo !== false && x.imagen; })[0] || null; });
    }
    /* Texto con los datos de la cuenta, para mostrar debajo del QR. */
    function datosTexto(q) {
        if (!q) return "";
        return [q.banco, q.cuenta ? "Cuenta " + q.cuenta : "", q.titular, q.nit ? "NIT/RUC " + q.nit : "", q.nota].filter(Boolean).join(" · ");
    }
    var API = { CANALES: CANALES, col: col, idSucursal: idSucursal, candidatos: candidatos, buscar: buscar, datosTexto: datosTexto };
    if (typeof module !== "undefined" && module.exports) module.exports = API;
    raiz.COBRO_QR = API;
})(typeof window !== "undefined" ? window : this);
