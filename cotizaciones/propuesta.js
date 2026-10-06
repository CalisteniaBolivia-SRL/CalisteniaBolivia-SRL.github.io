/* Script compartido de las propuestas detalladas.
   Cada página puede definir window.DEMO = [{ cls, html, wait, typing }] antes de cargar este archivo
   para animar una secuencia (chat, consola, etc.) dentro de #demoBody. */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Aparición al hacer scroll ---------- */
const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
    });
}, { threshold: 0.15 });
document.querySelectorAll(".reveal, .gantt").forEach((el) => io.observe(el));

/* ---------- Contador del total ---------- */
const fmt = (n) => n.toLocaleString("es-BO").replace(/,/g, ".");
document.querySelectorAll(".count").forEach((el) => {
    const to = Number(el.dataset.to);
    if (reduceMotion) return;
    const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        const start = performance.now();
        const tick = (t) => {
            const p = Math.min((t - start) / 1400, 1);
            el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
});

/* ---------- Secuencia animada ---------- */
const demoBody = document.getElementById("demoBody");
const demo = window.DEMO || [];

function addItem(item) {
    const div = document.createElement("div");
    div.className = item.cls;
    div.innerHTML = item.html;
    demoBody.appendChild(div);
    demoBody.scrollTop = demoBody.scrollHeight;
    return div;
}

async function playDemo() {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    while (true) {
        demoBody.innerHTML = "";
        for (const item of demo) {
            if (item.typing) {
                const t = addItem({ cls: item.cls, html: '<span class="typing"><span></span><span></span><span></span></span>' });
                await wait(item.typing);
                t.remove();
            }
            addItem(item);
            await wait(item.wait || 1000);
        }
        await wait(5000);
    }
}

if (demoBody && demo.length) {
    if (reduceMotion) {
        demo.forEach(addItem);
    } else {
        let started = false;
        new IntersectionObserver(([e], o) => {
            if (e.isIntersecting && !started) { started = true; o.disconnect(); playDemo(); }
        }, { threshold: 0.3 }).observe(demoBody);
    }
}
