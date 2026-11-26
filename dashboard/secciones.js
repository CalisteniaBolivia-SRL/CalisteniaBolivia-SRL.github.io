/* =====================================================================================================
   Pestañas por tema para los tableros de una sola página (Administración, Contabilidad, Dirección, RRHH, Marketing,
   Supervisores). En vez de bajar por 10 o 14 bloques, se ve un tema a la vez. No cambia ningún dato ni cálculo:
   solo muestra u oculta los bloques que ya existen, según el título de cada uno.
   La pestaña elegida queda en la dirección (#tema) y se recuerda al volver.
   Algunas pestañas son atajos a otro módulo del mismo trabajo (por ejemplo «Tareas» en Administración).
   ===================================================================================================== */
(function () {
    "use strict";
    var PAG = (location.pathname.split("/").pop() || "").replace(".html", "");
    var PY = /[?&]pais=paraguay\b/.test(location.search);
    var conPais = function (u) { return u + (PY ? (u.indexOf("?") >= 0 ? "&" : "?") + "pais=paraguay" : ""); };
    /* Por tablero: pestañas con los títulos (comienzo) de sus bloques, secciones enteras o un atajo. */
    var CONFIG = {
        administracion: [
            { id: "hoy", nombre: "Hoy", t: ["Tu trabajo de hoy"], kpis: true },
            { id: "cajas", nombre: "Cajas y cobros", t: ["Cajas abiertas", "Cobros por cajero", "Movimientos de caja", "Tablero por sucursal"] },
            { id: "ingreso", nombre: "Molinetes e ingreso", t: ["Control de ingreso", "Molinetes"] },
            { id: "pagar", nombre: "Cuentas por pagar", s: ["a-cxp"] },
            { id: "comisiones", nombre: "Comisiones ATC", s: ["a-comisiones"] },
            { id: "tareas", nombre: "Tareas →", link: "tareas.html" },
            { id: "qr", nombre: "Cobros QR →", link: "cobros-qr.html" },
            { id: "mant", nombre: "Mantenimiento →", link: "mantenimiento.html" }
        ],
        contabilidad: [
            { id: "hoy", nombre: "Hoy", t: ["Tu trabajo de hoy"], kpis: true },
            { id: "banco", nombre: "Caja y banco", t: ["Conciliación", "Bancos", "Movimientos de caja", "Medios de pago"] },
            { id: "precios", nombre: "Precios y cajeros", t: ["Precio registrado", "Control por cajero", "Ventas de convenio"] },
            { id: "prorrogas", nombre: "Prórrogas", t: ["Prórrogas", "Detalle de prórrogas"] },
            { id: "historico", nombre: "12 meses", t: ["Ingresos por mes"] }
        ],
        direccion: [
            { id: "hoy", nombre: "Hoy", t: ["Semáforo", "Fiscalización", "Tu trabajo de hoy", "Tableros del equipo"], kpis: true },
            { id: "sucursales", nombre: "Sucursales", t: ["Ingresos del mes por sucursal", "Tablero por sucursal", "Retención"] },
            { id: "historico", nombre: "12 meses", t: ["Ingresos por mes"] },
            { id: "tareas", nombre: "Tareas →", link: "tareas.html" }
        ],
        rrhh: [
            { id: "hoy", nombre: "Hoy", t: ["Tu trabajo de hoy", "Equipo de gestión"], kpis: true },
            { id: "entrenadores", nombre: "Entrenadores", t: ["Entrenadores", "Promedio de alumnos", "Demanda"] },
            { id: "cajeros", nombre: "Cajeros", t: ["Cajeros", "Cobros por cajero", "Prórrogas"] },
            { id: "denuncias", nombre: "Denuncias →", link: "denuncias.html" },
            { id: "sugerencias", nombre: "Sugerencias →", link: "sugerencias.html" }
        ],
        marketing: [
            { id: "hoy", nombre: "Hoy", t: ["Tu trabajo de hoy"], kpis: true },
            { id: "ventas", nombre: "Paquetes y sucursales", t: ["Paquetes y promociones", "Ingresos del mes por sucursal", "Ingresos por mes"] },
            { id: "horarios", nombre: "Horarios", t: ["Horas vacías", "Ocupación"] },
            { id: "clientes", nombre: "Clientes", t: ["Recuperación", "Renovaciones"] },
            { id: "redes", nombre: "Redes →", link: "redes.html" },
            { id: "creativo", nombre: "Estudio creativo →", link: "creativo.html" }
        ],
        supervision: [
            { id: "hoy", nombre: "Hoy", t: ["Tu trabajo de hoy", "También a su cargo"], kpis: true },
            { id: "ingreso", nombre: "Molinetes e ingreso", t: ["Molinetes", "Control de ingreso", "Visitas de hoy", "Entradas de hoy"] },
            { id: "asistencia", nombre: "Asistencia", t: ["Asistencia por sucursal", "Horas buenas", "Personas por sucursal", "¿Cuántos días"] },
            { id: "entrenadores", nombre: "Entrenadores", t: ["Todos los entrenadores", "Promedio de alumnos"] },
            { id: "riesgo", nombre: "Clientes en riesgo", t: ["Clientes en riesgo", "En riesgo"] },
            { id: "mant", nombre: "Mantenimiento →", link: "mantenimiento.html" }
        ]
    };
    var grupos = CONFIG[PAG];
    if (!grupos) return;
    function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }

    function iniciar() {
        var raiz = document.querySelector(".cb"); if (!raiz) return;
        var paginas = Array.prototype.slice.call(raiz.querySelectorAll("section.cb-page"));
        if (!paginas.length) return;
        /* Bloques: cada tarjeta y cada fila de indicadores. */
        var bloques = [];
        paginas.forEach(function (sec) {
            Array.prototype.forEach.call(sec.querySelectorAll(".cb-card, .cb-kpis"), function (b) {
                if (b.parentElement && b.parentElement.closest(".cb-card")) return;   // tarjeta dentro de otra: va con su padre
                var h = b.querySelector("h3, h2"), tit = norm(h ? h.textContent : "");
                var g = null;
                grupos.forEach(function (gr) {
                    if (g) return;
                    if (gr.s && gr.s.indexOf(sec.id) >= 0) g = gr.id;
                    else if (b.classList.contains("cb-kpis") && gr.kpis) g = gr.id;
                    else if (!gr.s && gr.t && sec === paginas[0] && gr.t.some(function (p) { return tit.indexOf(norm(p)) === 0; })) g = gr.id;
                });
                bloques.push({ el: b, sec: sec, g: g });
            });
        });
        /* Lo que no se reconoce no se pierde: va a «Otros». */
        var lista = grupos.slice();
        if (bloques.some(function (b) { return !b.g; })) { lista.push({ id: "otros", nombre: "Otros" }); bloques.forEach(function (b) { if (!b.g) b.g = "otros"; }); }
        var nav = document.createElement("nav"); nav.className = "cb-nav cb-secciones"; nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "Temas");
        var cab = raiz.querySelector(".cb-top");
        if (cab && cab.parentNode) cab.parentNode.insertBefore(nav, cab.nextSibling); else raiz.insertBefore(nav, raiz.firstChild);
        var actual = null;
        function mostrar(id) {
            var porSec = lista.filter(function (g) { return g.s && g.s.indexOf(id) >= 0; })[0]; if (porSec) id = porSec.id;   // #a-cxp → «Cuentas por pagar»
            if (!lista.some(function (g) { return g.id === id && !g.link; })) id = lista[0].id;
            actual = id;
            bloques.forEach(function (b) { b.el.hidden = b.g !== id; });
            paginas.forEach(function (sec, i) {
                var hay = bloques.some(function (b) { return b.sec === sec && b.g === id; });
                sec.hidden = !hay;
                var head = sec.querySelector(".cb-head"); if (head) head.hidden = !(i === 0 && id === lista[0].id);
            });
            Array.prototype.forEach.call(nav.children, function (b) { var on = b.dataset.id === id; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
            try { history.replaceState(null, "", location.pathname + location.search + "#" + id); localStorage.setItem("cb_tema_" + PAG, id); } catch (e) {}
            /* Los gráficos se vuelven a dibujar con el ancho visible. */
            setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 30);
        }
        lista.forEach(function (g) {
            var b;
            if (g.link) { b = document.createElement("a"); b.href = conPais(g.link); b.className = "cb-tab cb-tab-link"; }
            else { b = document.createElement("button"); b.type = "button"; b.className = "cb-tab"; b.setAttribute("role", "tab"); b.addEventListener("click", function () { mostrar(g.id); window.scrollTo(0, 0); }); }
            b.dataset.id = g.id; b.textContent = g.nombre;
            nav.appendChild(b);
        });
        var inicial = location.hash.slice(1);
        if (!inicial) { try { inicial = localStorage.getItem("cb_tema_" + PAG) || ""; } catch (e) {} }
        mostrar(inicial);
        window.addEventListener("hashchange", function () { var h = location.hash.slice(1); if (h && h !== actual) mostrar(h); });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
