/* ─────────────────────────────────────────────────────────────────────────
   structure-modal — modal con diagrama jerárquico de carpetas.

   Se abre al hacer clic en la Estrella de la Muerte (o sus lunas) en la
   escena 3D. Consulta GET api/agent/structure y pinta un diagrama
   izquierda→derecha en SVG:
     · nodos = tarjetas redondeadas con nombre + contador de hijos,
     · aristas = curvas bezier con animación de trazado,
     · clic en un nodo con hijos = colapsar/expandir,
     · arrastrar = desplazar, rueda = zoom,
     · entrada animada escalonada de los nodos.

   Estética alineada al HUD de la consola (Share Tech Mono, cian/ámbar).
   No depende de libs externas: SVG + JS puro.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    /* ── Constantes de layout ── */
    const ROW_H = 46;        /* altura vertical por nodo hoja */
    const LEVEL_W = 236;     /* separación horizontal entre niveles */
    const NODE_W = 178;
    const NODE_H = 38;
    const PAD = 60;

    /* ── Estado ── */
    let overlay = null;      /* el contenedor del modal (se crea bajo demanda) */
    let svg = null;
    let viewport = null;     /* <g> que se transforma con pan/zoom */
    let rootData = null;     /* árbol completo del servidor */
    let collapsed = new Set(); /* paths colapsados */
    let layoutNodes = [];    /* resultado del layout actual */
    let transform = { x: 40, y: 40, k: 1 };
    let drag = null;

    /* ───────────────── Infra del modal (DOM) ───────────────── */

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'structure-modal';
        overlay.className = 'sm-hidden';
        overlay.innerHTML = [
            '<div class="sm-backdrop" data-sm-close></div>',
            '<div class="sm-panel" role="dialog" aria-modal="true" aria-label="Estructura del proyecto">',
            '  <div class="sm-head">',
            '    <div class="sm-title-wrap">',
            '      <span class="sm-glyph">&#9670;</span>',
            '      <div>',
            '        <div class="sm-title">Estructura de carpetas</div>',
            '        <div class="sm-path" id="sm-path">-</div>',
            '      </div>',
            '    </div>',
            '    <div class="sm-tools">',
            '      <button type="button" class="sm-btn" id="sm-expand" title="Expandir todo">Expandir</button>',
            '      <button type="button" class="sm-btn" id="sm-collapse" title="Colapsar todo">Colapsar</button>',
            '      <button type="button" class="sm-btn sm-btn-icon" id="sm-zoomout" title="Alejar">&minus;</button>',
            '      <button type="button" class="sm-btn sm-btn-icon" id="sm-zoomin" title="Acercar">+</button>',
            '      <button type="button" class="sm-btn sm-btn-icon" id="sm-center" title="Centrar">&#9678;</button>',
            '      <button type="button" class="sm-btn sm-btn-icon sm-close" id="sm-close" title="Cerrar" aria-label="Cerrar">&#10005;</button>',
            '    </div>',
            '  </div>',
            '  <div class="sm-body" id="sm-body">',
            '    <div class="sm-loading" id="sm-loading">Escaneando estructura…</div>',
            '    <svg id="sm-svg" xmlns="http://www.w3.org/2000/svg">',
            '      <defs>',
            '        <linearGradient id="sm-edge" x1="0" y1="0" x2="1" y2="0">',
            '          <stop offset="0%" stop-color="#0d3a5c"/>',
            '          <stop offset="100%" stop-color="#00ffcc" stop-opacity="0.75"/>',
            '        </linearGradient>',
            '        <filter id="sm-glow" x="-60%" y="-60%" width="220%" height="220%">',
            '          <feGaussianBlur stdDeviation="3" result="b"/>',
            '          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>',
            '        </filter>',
            '      </defs>',
            '      <g id="sm-viewport">',
            '        <g id="sm-edges"></g>',
            '        <g id="sm-nodes"></g>',
            '      </g>',
            '    </svg>',
            '    <div class="sm-empty sm-hidden" id="sm-empty">Sin subcarpetas que mostrar</div>',
            '  </div>',
            '  <div class="sm-foot">',
            '    <span id="sm-counts">-</span>',
            '    <span class="sm-hint">Clic en un nodo: colapsar/expandir · Arrastrar: mover · Rueda: zoom</span>',
            '  </div>',
            '</div>'
        ].join('\n');
        document.body.appendChild(overlay);

        svg = overlay.querySelector('#sm-svg');
        viewport = overlay.querySelector('#sm-viewport');

        overlay.querySelector('[data-sm-close]').addEventListener('click', close);
        overlay.querySelector('#sm-close').addEventListener('click', close);
        overlay.querySelector('#sm-expand').addEventListener('click', () => { collapsed.clear(); draw(); });
        overlay.querySelector('#sm-collapse').addEventListener('click', collapseAll);
        overlay.querySelector('#sm-zoomin').addEventListener('click', () => zoomAt(1.2));
        overlay.querySelector('#sm-zoomout').addEventListener('click', () => zoomAt(1 / 1.2));
        overlay.querySelector('#sm-center').addEventListener('click', fitToView);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

        bindCanvasInteractions();
        return overlay;
    }

    /* ───────────────── Carga de datos ───────────────── */

    async function open(path) {
        const el = ensureOverlay();
        el.classList.remove('sm-hidden');
        document.body.classList.add('sm-modal-open');

        const pathEl = el.querySelector('#sm-path');
        pathEl.textContent = path || '-';
        el.querySelector('#sm-loading').classList.remove('sm-hidden');
        el.querySelector('#sm-empty').classList.add('sm-hidden');
        svg.style.display = 'block';

        try {
            const res = await fetch('/api/agent/structure?path=' + encodeURIComponent(path || '') + '&depth=4');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            rootData = await res.json();
            collapsed.clear();
            /* Colapsa niveles profundos de entrada para no saturar la vista */
            primeCollapse(rootData, 0);
            el.querySelector('#sm-loading').classList.add('sm-hidden');
            draw(true);
        } catch (err) {
            el.querySelector('#sm-loading').textContent = 'No se pudo leer la estructura: ' + err.message;
        }
    }

    function primeCollapse(node, level) {
        if (!node || !node.children || !node.children.length) return;
        if (level >= 2) collapsed.add(node.path);
        node.children.forEach(c => primeCollapse(c, level + 1));
    }

    function close() {
        if (!overlay) return;
        overlay.classList.add('sm-hidden');
        document.body.classList.remove('sm-modal-open');
    }

    function collapseAll() {
        collapsed.clear();
        const walk = (n) => {
            if (!n || !n.children || !n.children.length) return;
            if (n !== rootData) collapsed.add(n.path);
            n.children.forEach(walk);
        };
        walk(rootData);
        draw();
    }

    /* ───────────────── Layout (árbol izquierda→derecha) ───────────────── */

    function computeLayout() {
        layoutNodes = [];
        if (!rootData) return;
        let cursorY = 0;

        function place(node, depth) {
            const visibleChildren = collapsed.has(node.path)
                ? []
                : (node.children || []).filter(c => (c.children || []).length || true);

            let y;
            if (!visibleChildren.length) {
                y = cursorY + ROW_H / 2;
                cursorY += ROW_H;
            } else {
                const childYs = visibleChildren.map(c => place(c, depth + 1));
                y = (childYs[0] + childYs[childYs.length - 1]) / 2;
            }

            layoutNodes.push({
                node, depth, y,
                x: PAD + depth * LEVEL_W,
                hasKids: (node.children || []).length > 0,
                isCollapsed: collapsed.has(node.path),
                childCount: (node.children || []).length
            });
            return y;
        }

        place(rootData, 0);
    }

    /* ───────────────── Pintado ───────────────── */

    function draw(animateIn) {
        if (!rootData) return;
        computeLayout();

        const edgesG = svg.querySelector('#sm-edges');
        const nodesG = svg.querySelector('#sm-nodes');
        edgesG.innerHTML = '';
        nodesG.innerHTML = '';

        const byPath = new Map(layoutNodes.map(n => [n.node.path, n]));

        /* Aristas: de cada nodo visible a sus hijos visibles */
        layoutNodes.forEach(item => {
            if (item.isCollapsed) return;
            (item.node.children || []).forEach(child => {
                const target = byPath.get(child.path);
                if (!target) return;
                const x1 = item.x + NODE_W, y1 = item.y;
                const x2 = target.x, y2 = target.y;
                const mid = (x1 + x2) / 2;
                const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', d);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', 'url(#sm-edge)');
                path.setAttribute('stroke-width', '1.6');
                path.setAttribute('stroke-linecap', 'round');
                edgesG.appendChild(path);

                if (animateIn) animateEdge(path);
            });
        });

        /* Nodos */
        layoutNodes.forEach((item, i) => {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'sm-node' + (item.depth === 0 ? ' sm-root' : '')
                + (item.isCollapsed ? ' sm-collapsed' : ''));
            g.setAttribute('transform', `translate(${item.x}, ${item.y - NODE_H / 2})`);

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('width', NODE_W);
            rect.setAttribute('height', NODE_H);
            rect.setAttribute('rx', 9);
            g.appendChild(rect);

            /* Pinche lateral para colapsar/expandir */
            if (item.hasKids) {
                const tog = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                tog.setAttribute('class', 'sm-toggle');
                const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c.setAttribute('cx', NODE_W); c.setAttribute('cy', NODE_H / 2); c.setAttribute('r', 8.5);
                tog.appendChild(c);
                const sign = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                sign.setAttribute('x', NODE_W); sign.setAttribute('y', NODE_H / 2 + 3.6);
                sign.setAttribute('text-anchor', 'middle');
                sign.textContent = item.isCollapsed ? '+' : '−';
                tog.appendChild(sign);
                g.appendChild(tog);
            }

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('class', 'sm-label');
            label.setAttribute('x', 13);
            label.setAttribute('y', NODE_H / 2 + 4.2);
            const name = truncate(item.node.name || item.node.path || 'raíz', 20);
            label.textContent = name;
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            t.textContent = item.node.path;
            label.appendChild(t);
            g.appendChild(label);

            if (item.childCount > 0) {
                const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                badge.setAttribute('class', 'sm-badge');
                badge.setAttribute('x', NODE_W - 11);
                badge.setAttribute('y', 14);
                badge.setAttribute('text-anchor', 'end');
                badge.textContent = item.childCount;
                g.appendChild(badge);
            }

            if (item.hasKids) {
                g.style.cursor = 'pointer';
                g.addEventListener('click', () => {
                    if (collapsed.has(item.node.path)) collapsed.delete(item.node.path);
                    else collapsed.add(item.node.path);
                    draw();
                });
            }

            nodesG.appendChild(g);
            if (animateIn) animateNode(g, i);
        });

        /* Panel de estadísticas */
        let total = 0, visible = layoutNodes.length;
        const countAll = (n) => { total++; (n.children || []).forEach(countAll); };
        if (rootData) countAll(rootData);
        const countsEl = overlay.querySelector('#sm-counts');
        if (countsEl) countsEl.textContent = `${visible} de ${total} carpetas visibles`;

        if (animateIn) fitToView();
    }

    /* ───────────────── Animaciones ───────────────── */

    function animateEdge(path) {
        try {
            const len = path.getTotalLength();
            path.style.strokeDasharray = len;
            path.style.strokeDashoffset = len;
            path.style.transition = 'stroke-dashoffset .55s ease';
            requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
        } catch (e) { /* SVG no medible aún */ }
    }

    function animateNode(g, i) {
        g.style.opacity = '0';
        g.style.transformBox = 'fill-box';
        g.style.transition = 'opacity .35s ease';
        setTimeout(() => { g.style.opacity = '1'; }, 40 + i * 14);
    }

    /* ───────────────── Pan / zoom ───────────────── */

    function applyTransform() {
        viewport.setAttribute('transform', `translate(${transform.x}, ${transform.y}) scale(${transform.k})`);
    }

    function zoomAt(factor, cx, cy) {
        const rect = svg.getBoundingClientRect();
        const px = cx == null ? rect.width / 2 : cx;
        const py = cy == null ? rect.height / 2 : cy;
        const k2 = Math.min(2.6, Math.max(0.18, transform.k * factor));
        const ratio = k2 / transform.k;
        transform.x = px - (px - transform.x) * ratio;
        transform.y = py - (py - transform.y) * ratio;
        transform.k = k2;
        applyTransform();
    }

    function fitToView() {
        if (!layoutNodes.length) return;
        const rect = svg.getBoundingClientRect();
        const minX = Math.min(...layoutNodes.map(n => n.x)) - PAD;
        const maxX = Math.max(...layoutNodes.map(n => n.x + NODE_W)) + PAD;
        const minY = Math.min(...layoutNodes.map(n => n.y)) - PAD;
        const maxY = Math.max(...layoutNodes.map(n => n.y)) + PAD;
        const w = maxX - minX, h = maxY - minY;
        const k = Math.min((rect.width - 20) / w, (rect.height - 20) / h, 1.6);
        transform.k = Math.max(0.18, k);
        transform.x = (rect.width - w * transform.k) / 2 - minX * transform.k;
        transform.y = (rect.height - h * transform.k) / 2 - minY * transform.k;
        applyTransform();
    }

    function bindCanvasInteractions() {
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
        }, { passive: false });

        svg.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.sm-node')) return; /* clicks en nodos no arrastran */
            drag = { x: e.clientX, y: e.clientY, ox: transform.x, oy: transform.y };
            svg.setPointerCapture(e.pointerId);
            svg.classList.add('sm-panning');
        });
        svg.addEventListener('pointermove', (e) => {
            if (!drag) return;
            transform.x = drag.ox + (e.clientX - drag.x);
            transform.y = drag.oy + (e.clientY - drag.y);
            applyTransform();
        });
        const endDrag = () => { drag = null; svg.classList.remove('sm-panning'); };
        svg.addEventListener('pointerup', endDrag);
        svg.addEventListener('pointercancel', endDrag);
    }

    /* ───────────────── Utilidades ───────────────── */

    function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    /* ───────────────── API pública ───────────────── */
    window.StructureModal = { open, close };
})();
