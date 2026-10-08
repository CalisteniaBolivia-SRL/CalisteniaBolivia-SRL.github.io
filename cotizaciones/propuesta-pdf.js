/* Genera el PDF de una propuesta con jsPDF + AutoTable a partir del contenido de la página.
   Requiere: jspdf.umd.min.js y jspdf.plugin.autotable.min.js cargados antes que este archivo,
   y un botón #btnPdf. Las demos animadas (chat, consola, pantalla) no se incluyen en el PDF. */

(function () {
    const btn = document.getElementById("btnPdf");
    if (!btn) return;

    const RED = [227, 6, 19];
    const INK = [17, 17, 17];
    const MUTED = [105, 105, 105];
    const LINE = [222, 222, 222];
    const SOFT = [246, 246, 246];

    const PAGE_W = 210, PAGE_H = 297, M = 16, CONTENT_W = PAGE_W - M * 2, BOTTOM = PAGE_H - 18;

    // Las fuentes estándar de jsPDF solo cubren Latin-1: se normalizan los símbolos.
    const clean = (t) => (t || "")
        .replace(/[−–—]/g, "-")
        .replace(/[→⇥]/g, "->")
        .replace(/[⇄⇌]/g, "<->")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/…/g, "...")
        .replace(/[•]/g, "-")
        .replace(/[^\u0000-ÿ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const text = (el) => clean(el ? el.textContent : "");

    async function loadImage(src, { jpeg = false } = {}) {
        try {
            const res = await fetch(src);
            if (!res.ok) return null;
            const blob = await res.blob();
            const data = await new Promise((ok, fail) => {
                const r = new FileReader();
                r.onload = () => ok(r.result);
                r.onerror = fail;
                r.readAsDataURL(blob);
            });
            const size = await new Promise((ok) => {
                const img = new Image();
                img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight });
                img.onerror = () => ok(null);
                img.src = data;
            });
            if (!size) return null;
            if (jpeg) {
                // Las capturas se re-codifican como JPEG para que el PDF pese poco
                const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = data; });
                const c = document.createElement("canvas");
                c.width = size.w;
                c.height = size.h;
                const ctx = c.getContext("2d");
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0);
                return { data: c.toDataURL("image/jpeg", 0.85), ...size, fmt: "JPEG" };
            }
            return { data, ...size, fmt: blob.type.includes("png") ? "PNG" : "JPEG" };
        } catch (e) {
            return null; // p. ej. abierto como file:// sin servidor
        }
    }

    async function build() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "mm", format: "a4" });
        if (typeof doc.autoTable !== "function" && window.applyPlugin) window.applyPlugin(jsPDF);
        const autoTable = (opts) =>
            typeof doc.autoTable === "function" ? doc.autoTable(opts) : window.autoTable(doc, opts);

        const head = document.querySelector(".quote-head");
        const eyebrow = text(head.querySelector(".eyebrow"));
        const logo = await loadImage(document.querySelector(".nav__brand img").getAttribute("src"));
        let y = 0;

        /* ---------- utilidades de página ---------- */
        function pageBand(first) {
            const h = first ? 30 : 14;
            doc.setFillColor(0, 0, 0);
            doc.rect(0, 0, PAGE_W, h, "F");
            doc.setFillColor(...RED);
            doc.rect(0, h, PAGE_W, 1.2, "F");
            if (logo) doc.addImage(logo.data, logo.fmt, M - 2, first ? 5 : 1.5, first ? 20 : 11, first ? 20 : 11, "logo", "FAST");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(first ? 15 : 9.5);
            doc.setTextColor(255, 255, 255);
            const tx = M + (first ? 21 : 11);
            const ty = first ? 16.5 : 8.8;
            doc.text("CALISTENIA", tx, ty);
            doc.setTextColor(...RED);
            doc.text(" COMPANY", tx + doc.getTextWidth("CALISTENIA"), ty);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(first ? 9 : 8);
            doc.setTextColor(200, 200, 200);
            doc.text(first ? "Tecnología desarrollada por Servisofts SRL" : eyebrow, PAGE_W - M, first ? 16.5 : 8.8, { align: "right" });
            return h + 10;
        }

        function ensure(h) {
            if (y + h > BOTTOM) {
                doc.addPage();
                y = pageBand(false);
            }
        }

        function lines(str, size, width, style = "normal") {
            doc.setFont("helvetica", style);
            doc.setFontSize(size);
            return doc.splitTextToSize(clean(str), width);
        }

        const LH = (size) => size * 0.42; // alto de línea en mm

        function para(str, { size = 9.5, color = INK, style = "normal", gap = 3, x = M, width = CONTENT_W } = {}) {
            if (!clean(str)) return;
            const ls = lines(str, size, width, style);
            doc.setTextColor(...color);
            for (const l of ls) {
                ensure(LH(size));
                doc.text(l, x, y + LH(size) * 0.8);
                y += LH(size);
            }
            y += gap;
        }

        /* ---------- bloques ---------- */
        function heading(h2) {
            const num = text(h2.querySelector(".n"));
            const title = clean(h2.textContent.replace(h2.querySelector(".n")?.textContent || "", ""));
            ensure(45);
            y += 3;
            doc.setFillColor(...RED);
            doc.rect(M, y, 9, 9, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(255, 255, 255);
            doc.text(num, M + 4.5, y + 6.3, { align: "center" });
            doc.setTextColor(...INK);
            doc.setFontSize(13);
            doc.text(title.toUpperCase(), M + 12, y + 6.5);
            y += 14;
        }

        function sub(el) {
            ensure(30);
            y += 2;
            para(el.textContent.toUpperCase(), { size: 10, style: "bold", gap: 2 });
        }

        function list(ul) {
            [...ul.children].forEach((li, i) => {
                const b = li.firstElementChild;
                const full = clean(li.textContent);
                const title = b && b.tagName === "B" && full.startsWith(text(b)) && /[:.]$/.test(text(b)) ? text(b) : "";
                const rest = full.slice(title.length).trim();
                const marker = ul.tagName === "OL" && !ul.classList.contains("steps") ? `${i + 1}.` : "";
                const tLines = title ? lines(title, 9.5, CONTENT_W - 6, "bold") : [];
                const rLines = lines(rest, 9.5, CONTENT_W - 6);
                ensure(LH(9.5) * Math.min(2, tLines.length + rLines.length) + 2);
                doc.setFillColor(...RED);
                if (marker) {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(9.5);
                    doc.setTextColor(...RED);
                    doc.text(marker, M, y + LH(9.5) * 0.8);
                } else {
                    doc.rect(M + 0.5, y + 1.3, 1.6, 1.6, "F");
                }
                if (title) para(title, { style: "bold", x: M + 6, width: CONTENT_W - 6, gap: 0.5 });
                para(rest, { x: M + 6, width: CONTENT_W - 6, gap: 2.2 });
            });
            y += 1;
        }

        // Tarjetas en dos columnas: [{ num, title, body: [strings] }]
        function cards(items, cols = 2) {
            const gap = 4, w = (CONTENT_W - gap * (cols - 1)) / cols, pad = 3.5;
            for (let i = 0; i < items.length; i += cols) {
                const row = items.slice(i, i + cols).map((it) => {
                    const tl = lines(it.title, 9.5, w - pad * 2, "bold");
                    const bl = it.body.flatMap((b) => lines(b, 8.5, w - pad * 2));
                    const h = pad + (it.num ? LH(8.5) + 0.8 : 0) + tl.length * LH(9.5) + 1 + bl.length * LH(8.5) + pad;
                    return { ...it, tl, bl, h };
                });
                const rh = Math.max(...row.map((r) => r.h));
                ensure(rh + gap);
                row.forEach((r, j) => {
                    const x = M + j * (w + gap);
                    doc.setFillColor(...SOFT);
                    doc.rect(x, y, w, rh, "F");
                    doc.setFillColor(...RED);
                    doc.rect(x, y, w, 0.9, "F");
                    let cy = y + pad;
                    if (r.num) {
                        doc.setFont("helvetica", "bold");
                        doc.setFontSize(8.5);
                        doc.setTextColor(...RED);
                        doc.text(r.num, x + pad, cy + LH(8.5) * 0.8);
                        cy += LH(8.5) + 0.8;
                    }
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(9.5);
                    doc.setTextColor(...INK);
                    r.tl.forEach((l) => { doc.text(l, x + pad, cy + LH(9.5) * 0.8); cy += LH(9.5); });
                    cy += 1;
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(8.5);
                    doc.setTextColor(...MUTED);
                    r.bl.forEach((l) => { doc.text(l, x + pad, cy + LH(8.5) * 0.8); cy += LH(8.5); });
                });
                y += rh + gap;
            }
            y += 1;
        }

        function cardItems(container, sel) {
            return [...container.querySelectorAll(sel)].map((el) => {
                const num = text(el.querySelector(":scope > span, :scope > .pain__num"));
                const titleEl = el.querySelector(":scope > h3, :scope > code, :scope > b");
                const ps = [...el.querySelectorAll(":scope > p")].map((p) => p.textContent);
                return { num, title: text(titleEl), body: ps };
            });
        }

        function flow(fl) {
            const nodes = [...fl.querySelectorAll(".flow__node")];
            const arrow = 7, w = (CONTENT_W - arrow * (nodes.length - 1)) / nodes.length, h = 16;
            ensure(h + 4);
            nodes.forEach((n, i) => {
                const x = M + i * (w + arrow);
                const red = n.classList.contains("flow__node--red");
                doc.setFillColor(...(red ? RED : SOFT));
                doc.setDrawColor(...(red ? RED : LINE));
                doc.rect(x, y, w, h, "FD");
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8.5);
                doc.setTextColor(...(red ? [255, 255, 255] : INK));
                doc.text(doc.splitTextToSize(text(n.querySelector("b")).toUpperCase(), w - 3)[0], x + w / 2, y + 6.5, { align: "center" });
                doc.setFont("helvetica", "normal");
                doc.setFontSize(7);
                doc.setTextColor(...(red ? [255, 235, 235] : MUTED));
                doc.text(doc.splitTextToSize(text(n.querySelector("small")), w - 3).slice(0, 2), x + w / 2, y + 10.5, { align: "center" });
                if (i < nodes.length - 1) {
                    const ax = x + w + 1.2, ay = y + h / 2;
                    doc.setDrawColor(...RED);
                    doc.setLineWidth(0.5);
                    doc.line(ax, ay, ax + arrow - 2.4, ay);
                    doc.setFillColor(...RED);
                    doc.triangle(ax + arrow - 2.4, ay - 1.3, ax + arrow - 2.4, ay + 1.3, ax + arrow - 0.6, ay, "F");
                    doc.setLineWidth(0.2);
                }
            });
            y += h + 4;
        }

        function scenario(sc) {
            const label = sc.querySelector(".scenario__label");
            if (label) {
                ensure(26);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(7.5);
                const lw = doc.getTextWidth(text(label).toUpperCase()) + 5;
                doc.setFillColor(...(label.classList.contains("scenario__label--new") ? RED : INK));
                doc.rect(M, y, lw, 5.5, "F");
                doc.setTextColor(255, 255, 255);
                doc.text(text(label).toUpperCase(), M + 2.5, y + 3.8);
                y += 8;
            }
            sc.querySelectorAll(".flow").forEach(flow);
            y += 2;
        }

        function gantt(g) {
            const weeks = Number(getComputedStyle(g).getPropertyValue("--w")) || 8;
            const rows = [...g.querySelectorAll(".gantt__row")];
            const labelW = 62, trackW = CONTENT_W - labelW, rh = 7;
            ensure(rh * (rows.length + 1) + 4);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(...MUTED);
            for (let w = 0; w < weeks; w++) {
                doc.text(`S${w + 1}`, M + labelW + (w + 0.5) * (trackW / weeks), y + 4, { align: "center" });
            }
            y += rh;
            rows.forEach((r) => {
                const bar = r.querySelector("i");
                const s = parseFloat(bar.style.getPropertyValue("--s")) || 0;
                const d = parseFloat(bar.style.getPropertyValue("--d")) || 0;
                doc.setDrawColor(...LINE);
                doc.line(M, y + rh, M + CONTENT_W, y + rh);
                for (let w = 1; w < weeks; w++) {
                    const gx = M + labelW + w * (trackW / weeks);
                    doc.line(gx, y + 0.5, gx, y + rh - 0.5);
                }
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8);
                doc.setTextColor(...INK);
                doc.text(text(r.querySelector("span")), M, y + 4.6);
                doc.setFillColor(...RED);
                doc.rect(M + labelW + (s / weeks) * trackW, y + 1.8, (d / weeks) * trackW, rh - 3.6, "F");
                y += rh;
            });
            y += 5;
        }

        function phases(ol) {
            const items = [...ol.children].map((li) => {
                const h3 = li.querySelector("h3");
                const small = h3.querySelector("small");
                const title = clean(h3.textContent.replace(small ? small.textContent : "", ""));
                return {
                    num: text(small),
                    title,
                    body: [...li.querySelectorAll("ul li")].map((x) => "- " + x.textContent),
                };
            });
            cards(items, 2);
        }

        function table(t) {
            const rowText = (tr) => [...tr.children].map((td) => {
                const small = td.querySelector("small");
                const main = clean(td.textContent.replace(small ? small.textContent : "", ""));
                return small ? `${main}\n${clean(small.textContent)}` : main;
            });
            const headRows = [...t.querySelectorAll("thead tr")].map(rowText);
            const body = [...t.querySelectorAll("tbody tr")].map(rowText);
            const footTrs = [...t.querySelectorAll("tfoot tr")];
            const foot = footTrs.map(rowText);
            const cols = headRows[0].length;
            const columnStyles = { [cols - 1]: { halign: "right", cellWidth: 32 } };
            if (headRows[0][0] === "#") columnStyles[0] = { cellWidth: 12, textColor: RED, fontStyle: "bold" };
            ensure(30);
            autoTable({
                startY: y,
                margin: { left: M, right: M, top: 24, bottom: PAGE_H - BOTTOM },
                head: headRows,
                body,
                foot,
                showFoot: "lastPage",
                theme: "plain",
                styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 } },
                headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
                footStyles: { fontStyle: "bold" },
                columnStyles,
                didParseCell: (data) => {
                    if (data.column.index === cols - 1) data.cell.styles.halign = "right";
                    if (data.section !== "foot") return;
                    const tr = footTrs[data.row.index];
                    if (tr.classList.contains("row-disc")) data.cell.styles.textColor = [22, 140, 70];
                    else if (!tr.classList.contains("row-sub")) {
                        data.cell.styles.fillColor = INK;
                        data.cell.styles.textColor = data.column.index === cols - 1 ? [255, 90, 98] : [255, 255, 255];
                        data.cell.styles.fontSize = 10;
                    }
                },
                willDrawPage: (data) => { if (data.pageNumber > 1) pageBand(false); },
            });
            y = doc.lastAutoTable.finalY + 5;
        }

        // Las demos animadas se imprimen como transcripción usando window.DEMO
        function demo(el) {
            const items = window.DEMO || [];
            if (!items.length) return;
            const isConsole = el.classList.contains("console");
            const plain = (html) => {
                const d = document.createElement("div");
                d.innerHTML = html.replace(/<\/(em|b|td)>/g, " $&").replace(/<\/tr>/g, "; $&");
                return clean(d.textContent).replace(/;\s*$/, "");
            };
            ensure(14);
            doc.setFillColor(30, 30, 30);
            doc.rect(M, y, CONTENT_W, 6.5, "F");
            doc.setFillColor(...RED);
            doc.circle(M + 3.5, y + 3.25, 1, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(230, 230, 230);
            doc.text(text(el.querySelector(".chat__bar b")), M + 7, y + 4.4);
            y += 6.5;

            if (isConsole) {
                const COLORS = { dev: [96, 165, 250], robot: [255, 210, 63], srv: [255, 90, 90], ok: [74, 222, 128], deny: [248, 113, 113] };
                const lh = 4.4;
                for (const it of items) {
                    const kind = (it.cls.match(/log--(\w+)/) || [])[1];
                    const ls = kind === "sep" ? [""] : (doc.setFont("courier", "normal"), doc.setFontSize(7.5), doc.splitTextToSize(plain(it.html), CONTENT_W - 6));
                    for (const l of ls) {
                        ensure(lh);
                        doc.setFillColor(12, 12, 12);
                        doc.rect(M, y, CONTENT_W, lh, "F");
                        doc.setFont("courier", "normal");
                        doc.setFontSize(7.5);
                        doc.setTextColor(...(COLORS[kind] || [210, 210, 210]));
                        doc.text(l, M + 3, y + 3);
                        y += lh;
                    }
                }
                y += 5;
                return;
            }

            const WHO = { user: ["Ejecutivo", RED], tool: ["Herramienta MCP", MUTED], ai: ["Asistente IA", INK] };
            y += 3;
            for (const it of items) {
                const [who, color] = WHO[(it.cls.match(/msg--(\w+)/) || [])[1]] || ["", INK];
                ensure(12);
                para(who.toUpperCase(), { size: 7.5, style: "bold", color, gap: 0.5, x: M + 3 });
                para(plain(it.html), { size: 9, color: who === "Herramienta MCP" ? MUTED : INK, x: M + 3, width: CONTENT_W - 6, gap: 2.5 });
            }
            y += 2;
        }

        async function figure(fig) {
            const img = fig.querySelector("img");
            const data = img && (await loadImage(img.getAttribute("src"), { jpeg: true }));
            if (data) {
                const h = (CONTENT_W * data.h) / data.w;
                ensure(h + 4);
                doc.addImage(data.data, data.fmt, M, y, CONTENT_W, h);
                y += h + 2;
            }
            para(text(fig.querySelector("figcaption")), { size: 8, color: MUTED });
        }

        async function block(el) {
            const c = el.classList;
            if (el.tagName === "H2") return heading(el);
            if (el.tagName === "H3" && c.contains("sub")) return sub(el);
            if (c.contains("chat")) return demo(el);
            if (c.contains("screen-wrap") || c.contains("toc")) return;
            if (el.tagName === "P") {
                return para(el.textContent, c.contains("note") ? { size: 8, color: MUTED } : c.contains("goal") ? { style: "bold" } : {});
            }
            if (c.contains("pain")) return cards(cardItems(el, ".pain__item"));
            if (c.contains("split")) return cards(cardItems(el, ":scope > div"));
            if (c.contains("sec")) return cards(cardItems(el, ".sec__item"));
            if (c.contains("tools")) return cards(cardItems(el, ".tool"));
            if (c.contains("phases")) return phases(el);
            if (el.tagName === "UL" || el.tagName === "OL") return list(el);
            if (c.contains("scenario")) return scenario(el);
            if (c.contains("flow")) return flow(el);
            if (c.contains("figure")) return figure(el);
            if (c.contains("table-wrap")) {
                const g = el.querySelector(".gantt");
                if (g) return gantt(g);
                const t = el.querySelector("table");
                if (t) return table(t);
            }
            if (el.tagName === "TABLE") return table(el);
        }

        /* ---------- portada / encabezado ---------- */
        y = pageBand(true);
        para(eyebrow.toUpperCase(), { size: 9, style: "bold", color: RED, gap: 1.5 });
        para(text(head.querySelector("h1")), { size: 19, style: "bold", gap: 3 });
        para(text(head.querySelector(".section__lead")), { size: 10, color: MUTED, gap: 4 });

        const pairs = [...head.querySelectorAll("dl dt")].map((dt) => {
            const dd = dt.nextElementSibling;
            const old = dd.querySelector(".old");
            const val = old ? `${clean(dd.textContent.replace(old.textContent, ""))} (antes ${text(old)})` : text(dd);
            return [text(dt), val];
        });
        const status = text(head.querySelector(".status"));
        if (status) pairs.push(["Estado", status]);
        autoTable({
            startY: y,
            margin: { left: M, right: M },
            body: pairs,
            theme: "plain",
            styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 }, textColor: INK },
            columnStyles: { 0: { textColor: MUTED, cellWidth: 32 }, 1: { fontStyle: "bold" } },
            didParseCell: (d) => { if (/Inversión/.test(d.row.raw[0]) && d.column.index === 1) d.cell.styles.textColor = RED; },
            willDrawCell: (d) => { if (d.row.index % 2 === 0) { doc.setFillColor(...SOFT); doc.rect(d.cell.x, d.cell.y, d.cell.width, d.cell.height, "F"); } },
        });
        y = doc.lastAutoTable.finalY + 6;

        /* ---------- secciones ---------- */
        for (const section of document.querySelectorAll("main .quote-block")) {
            for (const el of section.children) await block(el);
            y += 3;
        }

        /* ---------- pie de página ---------- */
        const total = doc.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setDrawColor(...LINE);
            doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(...MUTED);
            doc.text(`Calistenia Company · ${eyebrow} · Servisofts SRL`, M, PAGE_H - 7.5);
            doc.text(`Página ${i} de ${total}`, PAGE_W - M, PAGE_H - 7.5, { align: "right" });
        }

        const num = (eyebrow.match(/\d+/) || ["000"])[0];
        return { doc, filename: `Cotizacion-${num}-Calistenia-Company.pdf` };
    }

    btn.addEventListener("click", async () => {
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Generando PDF…";
        try {
            const { doc, filename } = await build();
            doc.save(filename);
        } catch (e) {
            console.error(e);
            btn.textContent = "Error al generar el PDF";
            setTimeout(() => (btn.textContent = label), 2500);
            btn.disabled = false;
            return;
        }
        btn.textContent = label;
        btn.disabled = false;
    });

    // Para pruebas automatizadas
    window.__buildPropuestaPdf = build;
})();
