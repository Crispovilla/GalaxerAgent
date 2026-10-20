/* ─────────────────────────────────────────────────────────────────────────
   Escena 3D "Cerebro" — skin alternativa de la consola /Agent.

   Representa el proceso del agente como un cerebro que dispara sinapsis
   (pulsos de luz recorriendo conexiones entre neuronas) cada vez que hay
   actividad, en lugar de la constelación de la galaxia.

   Versión "didáctica": además de los pulsos, muestra las regiones
   cerebrales etiquetadas y colorea cada lóbulo con su tinte, de modo que
   la señal se pueda SEGUIR por la estructura:
       ENTRADA (frontal) → ANÁLISIS (parietal/temporal)
       → ORQUESTACIÓN (cerebelo/tronco) → SALIDA (occipital)
   Cada etapa ilumina las conexiones reales que recorre y actualiza un
   panel HUD que explica en qué fase está el agente.

   Script clásico (sin módulos) autocontenido: crea su propio renderer
   dentro de #brain-container y NO toca la escena de constellation.js.
   Usa las globales de página: THREE / gsap (CDN) y connection (SignalR).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    /* ── Referencias DOM ── */
    let container = null;
    let renderer = null;
    let scene = null;
    let camera = null;
    let controls = null;
    let composer = null;
    let neuronPoints = null;
    let edgeLines = null;
    let glowTex = null;
    let hudEl = null;

    /* ── Estado interno ── */
    const neurons = [];            // { pos, region, energy }
    const synapses = [];           // { a, b }
    const adjacency = [];          // adjacency[i] = índices de sinapsis que tocan i
    const edgeIndex = new Map();   // "min_max" -> índice de sinapsis
    const crossRegion = [];        // { from, to, edge } sinapsis entre regiones distintas
    const pulses = [];             // pulsos vivos
    const pulsePool = [];
    const fireRings = [];          // anillos de disparo vivos
    const fireRingPool = [];
    let regionIndex = {};          // region -> [idx neuronas]
    let regionColor = {};          // region -> THREE.Color
    let regionCentroid = {};       // region -> Vector3
    let edgeBrightness = null;     // Float32Array por sinapsis (apagado→encendido)

    let running = false;
    let rafId = null;
    let initialized = false;
    let propagationBudget = 0;
    let nextIdleAt = 0;
    const clock = (typeof THREE !== 'undefined') ? new THREE.Clock() : null;

    /* Paleta base y por región (didáctica: cada lóbulo su tinte) */
    const RESTING = new THREE.Color(0x0c2c66);
    const REGION_COLORS = {
        frontal:   0x33ffcc,   /* entrada de la petición */
        parietal:  0x33d1ff,   /* integración / contexto */
        temporal:  0xffb347,   /* memoria / skills */
        cerebelo:  0xcc77ff,   /* orquestación */
        tronco:    0x6ea8ff,   /* ejecución / herramientas */
        occipital: 0xff6fc0    /* salida / respuesta */
    };
    const REGION_LABELS = {
        frontal:   'FRONTAL · entrada',
        parietal:  'PARIETAL · contexto',
        temporal:  'TEMPORAL · memoria',
        cerebelo:  'CEREBELO · orquesta',
        tronco:    'TRONCO · ejecuta',
        occipital: 'OCCIPITAL · salida'
    };

    const SKILL_COLORS = {
        Error: 0xff5a5a, Cuota: 0xff5a5a, Config: 0xff5a5a,
        Reintentando: 0xffb347, Proveedor: 0xffb347,
        Agente: 0x33ffcc, Portal: 0xff6fc0
    };
    const DEFAULT_SIGNAL = 0x66d9ff;

    /* Etapas del proceso (didáctico). Se disparan por tiempo al iniciar una
       petición, y cada evento real del agente salta/adelanta la etapa. */
    const STAGES = [
        { at: 0.0, phase: 'input',      from: 'frontal',   to: ['parietal', 'temporal'], label: 'Entrada' },
        { at: 1.1, phase: 'analysis',   from: 'parietal',  to: ['temporal', 'cerebelo'], label: 'Análisis' },
        { at: 2.6, phase: 'orchestrate',from: 'cerebelo',  to: ['tronco', 'occipital'],  label: 'Orquestación' },
        { at: 4.2, phase: 'output',     from: 'occipital', to: [],                       label: 'Salida' }
    ];
    const SEQ_END = 5.6;

    let seqActive = false;
    let seqStart = 0;
    let seqFired = [];
    let currentPhase = 'idle';

    /* ───────────────── Texturas y utilidades ───────────────── */

    function makeGlowTexture() {
        const size = 128;
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const ctx = cv.getContext('2d');
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0.0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(210,240,255,0.9)');
        g.addColorStop(0.55, 'rgba(110,180,255,0.4)');
        g.addColorStop(1.0, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(cv);
    }

    function rnd(a, b) { return a + Math.random() * (b - a); }

    function makeLabelSprite(text, hexColor) {
        const w = 512, h = 128;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.font = 'bold 52px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const col = '#' + hexColor.toString(16).padStart(6, '0');
        ctx.shadowColor = col; ctx.shadowBlur = 16;
        ctx.fillStyle = col;
        ctx.fillText(text, w / 2, h / 2);
        const tex = new THREE.CanvasTexture(cv);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false, depthTest: false,
            blending: THREE.AdditiveBlending, opacity: 0.92
        }));
        sp.scale.set(30, 7.5, 1);
        return sp;
    }

    /* ───────────────── Generación del cerebro ───────────────── */

    function generateNeurons() {
        const rx = 62, ry = 50, rz = 72;
        const CORTEX = 190;
        const golden = Math.PI * (1 + Math.sqrt(5));
        for (let i = 0; i < CORTEX; i++) {
            const t = (i + 0.5) / CORTEX;
            const phi = Math.acos(1 - 2 * t);
            const theta = golden * i;
            let x = Math.sin(phi) * Math.cos(theta) * rx;
            let y = Math.cos(phi) * ry;
            let z = Math.sin(phi) * Math.sin(theta) * rz;
            if (Math.abs(x) < 5) x += (x >= 0 ? 5 : -5);
            if (y < -ry * 0.45) y *= 0.82;
            x += rnd(-2.2, 2.2); y += rnd(-2.2, 2.2); z += rnd(-2.2, 2.2);
            addNeuron(x, y, z, classifyCortex(x, y, z, rx, ry, rz));
        }

        const cbCy = -ry * 0.66, cbCz = -rz * 0.6;
        for (let i = 0; i < 32; i++) {
            const u = rnd(0, Math.PI * 2), v = Math.acos(rnd(-1, 1));
            const rr = 20 * Math.cbrt(Math.random());
            addNeuron(rr * Math.sin(v) * Math.cos(u) * 1.15, cbCy + rr * Math.cos(v) * 0.6,
                cbCz + rr * Math.sin(v) * Math.sin(u) * 0.75, 'cerebelo');
        }
        for (let i = 0; i < 22; i++) {
            const f = i / 21;
            addNeuron(rnd(-7, 7), -ry * 0.4 - f * (ry * 0.7), -rz * 0.08 - f * 6 + rnd(-3, 3), 'tronco');
        }
    }

    function classifyCortex(x, y, z, rx, ry, rz) {
        if (z > rz * 0.28) return 'frontal';
        if (z < -rz * 0.24) return 'occipital';
        if (y > ry * 0.25) return 'parietal';
        return 'temporal';
    }

    function addNeuron(x, y, z, region) {
        const pos = new THREE.Vector3(x, y, z);
        const idx = neurons.length;
        neurons.push({ pos, region, energy: 0 });
        adjacency[idx] = [];
        if (!regionIndex[region]) regionIndex[region] = [];
        regionIndex[region].push(idx);
    }

    function connectNeurons() {
        const seen = new Set();
        const K = 3;
        for (let i = 0; i < neurons.length; i++) {
            const order = [];
            for (let j = 0; j < neurons.length; j++) {
                if (j === i) continue;
                order.push([j, neurons[i].pos.distanceToSquared(neurons[j].pos)]);
            }
            order.sort((a, b) => a[1] - b[1]);
            for (let k = 0; k < K && k < order.length; k++) addEdge(i, order[k][0], seen);
        }
        const front = regionIndex.frontal || [], back = regionIndex.occipital || [];
        for (let n = 0; n < 26; n++) {
            if (!front.length || !back.length) break;
            addEdge(front[(Math.random() * front.length) | 0], back[(Math.random() * back.length) | 0], seen);
        }
        ['cerebelo', 'tronco'].forEach(reg => {
            (regionIndex[reg] || []).forEach(i => {
                const order = [];
                for (let j = 0; j < neurons.length; j++) {
                    if (neurons[j].region === reg) continue;
                    order.push([j, neurons[i].pos.distanceToSquared(neurons[j].pos)]);
                }
                order.sort((a, b) => a[1] - b[1]);
                for (let k = 0; k < 2 && k < order.length; k++) addEdge(i, order[k][0], seen);
            });
        });

        /* Mapa de sinapsis entre regiones distintas (para el flujo direccional) */
        synapses.forEach((s, idx) => {
            const ra = neurons[s.a].region, rb = neurons[s.b].region;
            if (ra !== rb) crossRegion.push({ from: ra, to: rb, edge: idx });
        });
    }

    function addEdge(a, b, seen) {
        if (a === b) return;
        const key = a < b ? a + '_' + b : b + '_' + a;
        if (seen.has(key)) return;
        seen.add(key);
        const idx = synapses.length;
        synapses.push({ a, b });
        edgeIndex.set(key, idx);
        adjacency[a].push(idx);
        adjacency[b].push(idx);
    }

    function computeRegionMeta() {
        Object.keys(REGION_COLORS).forEach(reg => {
            regionColor[reg] = new THREE.Color(REGION_COLORS[reg]);
        });
        const acc = {};
        neurons.forEach(n => {
            if (!acc[n.region]) acc[n.region] = new THREE.Vector3();
            acc[n.region].add(n.pos);
        });
        Object.keys(acc).forEach(reg => {
            regionCentroid[reg] = acc[reg].clone().divideScalar(Math.max(1, regionIndex[reg].length));
        });
    }

    /* ───────────────── Construcción de objetos Three ───────────────── */

    function buildNeuronPoints() {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(neurons.length * 3);
        const colors = new Float32Array(neurons.length * 3);
        const scales = new Float32Array(neurons.length);
        neurons.forEach((n, i) => {
            positions[i * 3] = n.pos.x;
            positions[i * 3 + 1] = n.pos.y;
            positions[i * 3 + 2] = n.pos.z;
            RESTING.toArray(colors, i * 3);
            scales[i] = 6;
        });
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: { uTex: { value: glowTex }, uScale: { value: 400 } },
            vertexShader: [
                'attribute float aScale;', 'attribute vec3 aColor;',
                'varying vec3 vColor;', 'uniform float uScale;',
                'void main() {', '  vColor = aColor;',
                '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
                '  gl_PointSize = aScale * uScale / max(0.001, -mv.z);',
                '  gl_Position = projectionMatrix * mv;', '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D uTex;', 'varying vec3 vColor;',
                'void main() {', '  vec4 t = texture2D(uTex, gl_PointCoord);',
                '  gl_FragColor = vec4(vColor, 1.0) * t;', '}'
            ].join('\n'),
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });

        neuronPoints = new THREE.Points(geo, mat);
        neuronPoints.frustumCulled = false;
        scene.add(neuronPoints);
    }

    function buildEdgeLines() {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(synapses.length * 6);
        const cols = new Float32Array(synapses.length * 6);
        synapses.forEach((s, i) => {
            const a = neurons[s.a].pos, b = neurons[s.b].pos;
            pos[i * 6] = a.x; pos[i * 6 + 1] = a.y; pos[i * 6 + 2] = a.z;
            pos[i * 6 + 3] = b.x; pos[i * 6 + 4] = b.y; pos[i * 6 + 5] = b.z;
            RESTING.toArray(cols, i * 6); RESTING.toArray(cols, i * 6 + 3);
        });
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        edgeBrightness = new Float32Array(synapses.length);

        const mat = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        edgeLines = new THREE.LineSegments(geo, mat);
        edgeLines.frustumCulled = false;
        scene.add(edgeLines);
    }

    function buildPulsePool(count) {
        for (let i = 0; i < count; i++) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glowTex, transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, opacity: 0
            }));
            sp.visible = false; sp.scale.setScalar(7);
            scene.add(sp);
            pulsePool.push({ sprite: sp, active: false });
        }
    }

    function buildFireRingPool(count) {
        for (let i = 0; i < count; i++) {
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.8, 1.15, 20),
                new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide,
                    blending: THREE.AdditiveBlending, depthWrite: false })
            );
            ring.visible = false;
            scene.add(ring);
            fireRingPool.push({ mesh: ring, active: false });
        }
    }

    function buildRegionMarkers() {
        /* Etiquetas de región + marcador de ENTRADA/SALIDA */
        Object.keys(REGION_LABELS).forEach(reg => {
            const c = regionCentroid[reg];
            if (!c) return;
            const lbl = makeLabelSprite(REGION_LABELS[reg], REGION_COLORS[reg]);
            lbl.position.copy(c).multiplyScalar(1.28);
            lbl.scale.set(26, 6.5, 1);
            lbl.material.opacity = 0.75;
            scene.add(lbl);
        });

        /* Anillo de ENTRADA (polo frontal) y SALIDA (polo occipital) */
        ['frontal', 'occipital'].forEach(reg => {
            const c = regionCentroid[reg];
            if (!c) return;
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(6.5, 8, 40),
                new THREE.MeshBasicMaterial({ color: REGION_COLORS[reg], transparent: true,
                    opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
            );
            ring.position.copy(c);
            ring.lookAt(camera.position);
            ring.userData.pulseReg = reg;
            scene.add(ring);
            inputOutputRings.push(ring);
        });
    }
    const inputOutputRings = [];

    /* ───────────────── Disparo de sinapsis ───────────────── */

    function edgeBetween(a, b) {
        const key = a < b ? a + '_' + b : b + '_' + a;
        return edgeIndex.has(key) ? edgeIndex.get(key) : -1;
    }

    function fireSynapse(a, b, colorHex, speed, intensity) {
        const slot = pulsePool.find(p => !p.active);
        if (!slot) return;
        slot.active = true;
        slot.sprite.visible = true;
        slot.sprite.material.color.setHex(colorHex);
        pulses.push({
            sprite: slot.sprite, ref: slot, a, b, t: 0,
            edge: edgeBetween(a, b),
            speed: speed || rnd(1.8, 2.8),
            intensity: intensity == null ? 0.7 : intensity,
            color: colorHex
        });
    }

    function spawnFireRing(pos, colorHex) {
        const slot = fireRingPool.find(r => !r.active);
        if (!slot) return;
        slot.active = true;
        slot.mesh.visible = true;
        slot.mesh.position.copy(pos);
        slot.mesh.material.color.setHex(colorHex);
        slot.mesh.material.opacity = 0.85;
        slot.mesh.scale.setScalar(1);
        slot.mesh.lookAt(camera.position);
        slot.t = 0;
        fireRings.push(slot);
    }

    function signalColor(skill) {
        return SKILL_COLORS[skill] != null ? SKILL_COLORS[skill] : DEFAULT_SIGNAL;
    }

    function randomNeuron(region) {
        const pool = (region && regionIndex[region]) || neurons.map((_, i) => i);
        if (!pool.length) return (Math.random() * neurons.length) | 0;
        return pool[(Math.random() * pool.length) | 0];
    }

    /* Enciende una conexión real entre dos regiones (direccional, didáctico). */
    function fireBetween(regA, regB, colorHex, intensity, count) {
        const candidates = crossRegion.filter(c =>
            (c.from === regA && c.to === regB) || (c.from === regB && c.to === regA));
        if (!candidates.length) {
            /* Fallback: dispara desde un nodo de la región A hacia cualquiera */
            for (let n = 0; n < (count || 3); n++) {
                const a = randomNeuron(regA), b = randomNeuron(regB);
                neurons[a].energy = Math.max(neurons[a].energy, intensity);
                fireSynapse(a, b, colorHex, rnd(2.4, 3.2), intensity);
            }
            return;
        }
        const used = new Set();
        for (let n = 0; n < (count || 6); n++) {
            const c = candidates[(Math.random() * candidates.length) | 0];
            if (used.has(c.edge)) continue;
            used.add(c.edge);
            /* Dirección correcta del pulso: siempre regA → regB */
            const s = synapses[c.edge];
            const from = neurons[s.a].region === regA ? s.a : s.b;
            const to = from === s.a ? s.b : s.a;
            neurons[from].energy = Math.max(neurons[from].energy, intensity);
            fireSynapse(from, to, colorHex, rnd(2.4, 3.4), intensity);
        }
    }

    /* Onda de entrada desde el polo frontal (la "petición" del usuario). */
    function fireInputWave(colorHex, intensity) {
        propagationBudget = 150;
        const front = regionIndex.frontal || [];
        const seeds = front.slice(0, Math.min(front.length, 16));
        const pole = regionCentroid.frontal;
        if (pole) spawnFireRing(pole, REGION_COLORS.frontal);
        seeds.forEach(i => {
            neurons[i].energy = Math.max(neurons[i].energy, intensity);
            const adj = adjacency[i] || [];
            if (adj.length) {
                const s = synapses[adj[(Math.random() * adj.length) | 0]];
                fireSynapse(i, s.a === i ? s.b : s.a, colorHex, rnd(2.6, 3.6), intensity);
            }
        });
    }

    function fireCompletionBurst() {
        propagationBudget = 240;
        const pole = regionCentroid.occipital;
        if (pole) spawnFireRing(pole, REGION_COLORS.occipital);
        (regionIndex.occipital || []).slice(0, 18).forEach(i => {
            neurons[i].energy = Math.max(neurons[i].energy, rnd(0.8, 1));
            const adj = adjacency[i] || [];
            if (adj.length) {
                const s = synapses[adj[(Math.random() * adj.length) | 0]];
                fireSynapse(i, s.a === i ? s.b : s.a, signalColor('Portal'), rnd(2.2, 3.2), 0.9);
            }
        });
    }

    function illuminateAll() {
        neurons.forEach((n, i) => {
            if (Math.random() < 0.85) {
                n.energy = Math.max(n.energy, rnd(0.5, 0.9));
                const adj = adjacency[i] || [];
                if (adj.length && Math.random() < 0.5) {
                    const s = synapses[adj[(Math.random() * adj.length) | 0]];
                    fireSynapse(i, s.a === i ? s.b : s.a, REGION_COLORS[neurons[i].region] || DEFAULT_SIGNAL, rnd(1.8, 2.8), 0.6);
                }
            }
        });
    }

    /* ───────────────── Secuencia didáctica por etapas ───────────────── */

    function startProcessing() {
        seqActive = true;
        seqStart = clock.elapsedTime;
        seqFired = STAGES.map(() => false);
        setPhase('input', 'Recibiendo petición…');
    }

    function stopProcessing() {
        seqActive = false;
        setPhase('idle', 'Reposo');
    }

    function advanceTo(phase) {
        /* Salta la secuencia a la etapa que corresponde al evento real */
        const idx = STAGES.findIndex(s => s.phase === phase);
        if (idx < 0) return;
        for (let i = 0; i <= idx; i++) runStage(i, true);
    }

    function runStage(i, immediate) {
        if (seqFired[i]) { if (immediate) fireStageAgain(i); return; }
        seqFired[i] = true;
        const st = STAGES[i];
        const col = REGION_COLORS[st.from] || DEFAULT_SIGNAL;
        setPhase(st.phase, phaseMessage(st.phase));
        /* Anillo en la región de origen */
        if (regionCentroid[st.from]) spawnFireRing(regionCentroid[st.from], col);
        /* Enciende la región de origen */
        (regionIndex[st.from] || []).slice(0, 12).forEach(k => {
            neurons[k].energy = Math.max(neurons[k].energy, 0.9);
        });
        /* Flujo direccional hacia las regiones destino */
        (st.to || []).forEach(reg => fireBetween(st.from, reg, col, 0.85, 6));
    }

    function fireStageAgain(i) {
        const st = STAGES[i];
        const col = REGION_COLORS[st.from] || DEFAULT_SIGNAL;
        (st.to || []).forEach(reg => fireBetween(st.from, reg, col, 0.7, 3));
    }

    function phaseMessage(phase) {
        switch (phase) {
            case 'input': return 'Entrada · comprendiendo la petición';
            case 'analysis': return 'Análisis · explorando contexto del código';
            case 'orchestrate': return 'Orquestación · seleccionando skills';
            case 'output': return 'Salida · preparando respuesta';
            default: return 'Reposo';
        }
    }

    function tickSequence(elapsed) {
        if (!seqActive) return;
        const t = elapsed - seqStart;
        STAGES.forEach((st, i) => { if (t >= st.at) runStage(i, false); });
        if (t >= SEQ_END) { seqActive = false; setPhase('output', 'Trabajando · esperando respuesta del agente'); }
    }

    /* ───────────────── HUD de proceso (DOM) ───────────────── */

    function buildHud() {
        if (hudEl) return;
        const style = document.createElement('style');
        style.textContent = [
            '#brain-hud{position:fixed;top:120px;right:26px;width:246px;z-index:40;',
            'font-family:"Share Tech Mono",monospace;border:1px solid rgba(51,255,204,.28);',
            'border-radius:6px;background:linear-gradient(160deg,rgba(6,14,26,.9),rgba(3,7,16,.94));',
            'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
            'box-shadow:0 12px 34px rgba(0,0,0,.45);overflow:hidden;pointer-events:none;}',
            '#brain-hud .bh-head{display:flex;align-items:center;gap:8px;padding:8px 11px;',
            'border-bottom:1px solid rgba(51,255,204,.18);background:rgba(0,24,32,.5);}',
            '#brain-hud .bh-dot{width:9px;height:9px;border-radius:50%;background:#33ffcc;',
            'box-shadow:0 0 8px #33ffcc;transition:background .2s,box-shadow .2s;}',
            '#brain-hud .bh-dot.busy{animation:bhPulse 1s infinite;}',
            '@keyframes bhPulse{0%,100%{opacity:1}50%{opacity:.35}}',
            '#brain-hud .bh-title{color:#7ef7e2;font-size:.62rem;letter-spacing:2px;text-transform:uppercase;}',
            '#brain-hud .bh-phase{padding:9px 11px 4px;color:#cfe9f7;font-size:.74rem;letter-spacing:1px;min-height:1.2em;}',
            '#brain-hud .bh-steps{list-style:none;margin:0;padding:6px 11px 10px;display:flex;flex-direction:column;gap:5px;}',
            '#brain-hud .bh-steps li{display:flex;align-items:center;gap:8px;font-size:.64rem;color:#5f7d93;',
            'letter-spacing:.5px;padding:3px 6px;border-radius:3px;border:1px solid transparent;transition:all .25s;}',
            '#brain-hud .bh-steps li .bh-idx{width:15px;height:15px;border-radius:50%;display:flex;',
            'align-items:center;justify-content:center;font-size:.56rem;border:1px solid currentColor;flex:0 0 auto;}',
            '#brain-hud .bh-steps li.on{color:#eafcff;border-color:rgba(51,255,204,.35);background:rgba(0,60,60,.28);}',
            '#brain-hud .bh-legend{border-top:1px solid rgba(51,255,204,.14);padding:8px 11px;',
            'display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;}',
            '#brain-hud .bh-legend span{display:flex;align-items:center;gap:6px;font-size:.56rem;color:#7d9bb0;letter-spacing:.5px;}',
            '#brain-hud .bh-legend i{width:8px;height:8px;border-radius:2px;box-shadow:0 0 5px currentColor;}',
            '@media (max-width:900px){#brain-hud{display:none;}}'
        ].join('');
        document.head.appendChild(style);

        hudEl = document.createElement('div');
        hudEl.id = 'brain-hud';
        hudEl.innerHTML = [
            '<div class="bh-head"><span class="bh-dot" id="bh-dot"></span>',
            '<span class="bh-title">Red Neuronal</span></div>',
            '<div class="bh-phase" id="bh-phase">Reposo</div>',
            '<ul class="bh-steps" id="bh-steps">',
            '  <li data-p="input"><span class="bh-idx">1</span>Entrada</li>',
            '  <li data-p="analysis"><span class="bh-idx">2</span>Análisis</li>',
            '  <li data-p="orchestrate"><span class="bh-idx">3</span>Orquestación</li>',
            '  <li data-p="output"><span class="bh-idx">4</span>Salida</li>',
            '</ul>',
            '<div class="bh-legend">',
            '  <span style="color:#33ffcc"><i style="background:#33ffcc"></i>Entrada</span>',
            '  <span style="color:#33d1ff"><i style="background:#33d1ff"></i>Contexto</span>',
            '  <span style="color:#ffb347"><i style="background:#ffb347"></i>Memoria</span>',
            '  <span style="color:#cc77ff"><i style="background:#cc77ff"></i>Orquesta</span>',
            '  <span style="color:#6ea8ff"><i style="background:#6ea8ff"></i>Ejecuta</span>',
            '  <span style="color:#ff6fc0"><i style="background:#ff6fc0"></i>Salida</span>',
            '</div>'
        ].join('');
        (container || document.body).appendChild(hudEl);
    }

    function setPhase(phase, text) {
        currentPhase = phase;
        if (!hudEl) return;
        const ph = document.getElementById('bh-phase');
        const dot = document.getElementById('bh-dot');
        if (ph) ph.textContent = text;
        if (dot) dot.classList.toggle('busy', phase !== 'idle');
        const steps = hudEl.querySelectorAll('.bh-steps li');
        const order = ['input', 'analysis', 'orchestrate', 'output'];
        const cur = order.indexOf(phase);
        steps.forEach(li => {
            const p = li.getAttribute('data-p');
            const pi = order.indexOf(p);
            li.classList.toggle('on', cur >= 0 && pi <= cur);
        });
    }

    /* ───────────────── Bucle de animación ───────────────── */

    const _tmpCol = (typeof THREE !== 'undefined') ? new THREE.Color() : null;
    const _edgeBase = (typeof THREE !== 'undefined') ? new THREE.Color(0x10305e) : null;

    function updatePulses(dt) {
        for (let i = pulses.length - 1; i >= 0; i--) {
            const p = pulses[i];
            p.t += (p.speed * dt) / Math.max(1, neurons[p.a].pos.distanceTo(neurons[p.b].pos)) * 22;
            /* Enciende la conexión que está recorriendo (didáctico) */
            if (p.edge >= 0) edgeBrightness[p.edge] = Math.min(1, edgeBrightness[p.edge] + p.intensity * 0.9);
            if (p.t >= 1) {
                neurons[p.b].energy = Math.min(1.2, neurons[p.b].energy + p.intensity);
                spawnFireRing(neurons[p.b].pos, p.color);
                if (propagationBudget > 0 && p.intensity > 0.35 && Math.random() < 0.55) {
                    propagationBudget--;
                    const adj = adjacency[p.b] || [];
                    if (adj.length) {
                        const s = synapses[adj[(Math.random() * adj.length) | 0]];
                        const nxt = s.a === p.b ? s.b : s.a;
                        fireSynapse(p.b, nxt, p.color, p.speed * 0.95, p.intensity * 0.72);
                    }
                }
                p.ref.active = false; p.ref.sprite.visible = false;
                p.ref.sprite.material.opacity = 0;
                pulses.splice(i, 1);
                continue;
            }
            const a = neurons[p.a].pos, b = neurons[p.b].pos;
            p.sprite.position.lerpVectors(a, b, p.t);
            const flick = 0.7 + Math.sin(p.t * Math.PI) * 0.3;
            p.sprite.material.opacity = Math.min(1, (0.45 + p.intensity * 0.55) * flick);
            p.sprite.scale.setScalar(6 + p.intensity * 7 * Math.sin(p.t * Math.PI));
        }
    }

    function updateFireRings(dt) {
        for (let i = fireRings.length - 1; i >= 0; i--) {
            const r = fireRings[i];
            r.t += dt * 2.4;
            if (r.t >= 1) {
                r.active = false; r.mesh.visible = false; r.mesh.material.opacity = 0;
                fireRings.splice(i, 1); continue;
            }
            const s = 1 + r.t * 4;
            r.mesh.scale.setScalar(s);
            r.mesh.material.opacity = 0.85 * (1 - r.t);
            r.mesh.lookAt(camera.position);
        }
    }

    function updateNeurons(dt, elapsed) {
        const col = neuronPoints.geometry.getAttribute('aColor');
        const scl = neuronPoints.geometry.getAttribute('aScale');
        for (let i = 0; i < neurons.length; i++) {
            const n = neurons[i];
            if (n.energy > 0) n.energy = Math.max(0, n.energy - dt * 1.3);
            const rest = 0.12 + Math.sin(elapsed * 1.6 + i * 0.7) * 0.06;
            const e = Math.min(1, n.energy + rest * (1 - Math.min(1, n.energy)));
            /* Reposo azul → tinte de su región al activarse */
            const rc = regionColor[n.region] || RESTING;
            _tmpCol.copy(RESTING).lerp(rc, e);
            _tmpCol.toArray(col.array, i * 3);
            scl.array[i] = 6 + e * 13;
        }
        col.needsUpdate = true; scl.needsUpdate = true;
    }

    function updateEdges() {
        const attr = edgeLines.geometry.getAttribute('color');
        for (let e = 0; e < synapses.length; e++) {
            const b = edgeBrightness[e];
            if (b <= 0.001) {
                _tmpCol.copy(_edgeBase);
            } else {
                edgeBrightness[e] = Math.max(0, b - 0.028);
                const s = synapses[e];
                const rc = regionColor[neurons[s.a].region] || _edgeBase;
                _tmpCol.copy(_edgeBase).lerp(rc, Math.min(1, b));
            }
            _tmpCol.toArray(attr.array, e * 6);
            _tmpCol.toArray(attr.array, e * 6 + 3);
        }
        attr.needsUpdate = true;
    }

    function updateMarkers(elapsed) {
        inputOutputRings.forEach((ring, i) => {
            const pulse = 0.45 + Math.abs(Math.sin(elapsed * 1.6 + i * 1.5)) * 0.35;
            ring.material.opacity = pulse;
            ring.scale.setScalar(1 + Math.sin(elapsed * 1.6 + i * 1.5) * 0.08);
            ring.lookAt(camera.position);
        });
    }

    function animate() {
        if (!running) return;
        rafId = requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.elapsedTime;

        /* Potencial de reposo */
        if (!seqActive && elapsed > nextIdleAt) {
            nextIdleAt = elapsed + rnd(0.35, 0.75);
            if (pulses.length < 20) {
                const i = randomNeuron();
                const adj = adjacency[i] || [];
                if (adj.length) {
                    const s = synapses[adj[(Math.random() * adj.length) | 0]];
                    fireSynapse(i, s.a === i ? s.b : s.a, DEFAULT_SIGNAL, rnd(1.2, 2.0), 0.26);
                }
            }
        }

        tickSequence(elapsed);
        updatePulses(dt);
        updateFireRings(dt);
        updateNeurons(dt, elapsed);
        updateEdges();
        updateMarkers(elapsed);

        scene.rotation.y += dt * 0.04;
        if (controls) controls.update();
        if (composer) composer.render();
        else renderer.render(scene, camera);
    }

    function resize() {
        if (!renderer) return;
        const w = window.innerWidth, h = window.innerHeight;
        camera.aspect = w / h; camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (composer) composer.setSize(w, h);
        if (neuronPoints) neuronPoints.material.uniforms.uScale.value = h * 0.42;
    }

    /* ───────────────── Presets de cámara (Control de vista) ─────────────────
       Permite que el "Control de vista" de la consola mueva la cámara del
       cerebro (además de la del Halcón) cuando esta skin está activa. */
    const BRAIN_VIEWS = {
        base:    { pos: [0, 8, 182], target: [0, 0, 10] },   /* general, frontal */
        solar:   { pos: [0, 58, 252], target: [0, 0, 0] },   /* red completa */
        folders: { pos: [126, 44, 118], target: [0, 0, 0] }  /* lateral / regiones */
    };

    function setView(name) {
        const v = BRAIN_VIEWS[name] || BRAIN_VIEWS.base;
        if (!camera || !controls) return;
        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, { x: v.pos[0], y: v.pos[1], z: v.pos[2], duration: 1.4, ease: 'power2.inOut' });
            gsap.to(controls.target, { x: v.target[0], y: v.target[1], z: v.target[2], duration: 1.4, ease: 'power2.inOut' });
        } else {
            camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
            controls.target.set(v.target[0], v.target[1], v.target[2]);
            controls.update();
        }
    }

    /* ───────────────── Ciclo de vida ───────────────── */

    function init() {
        if (initialized) return;
        initialized = true;

        container = document.getElementById('brain-container');
        glowTex = makeGlowTexture();

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x02040c, 0.0022);

        camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 2000);
        camera.position.set(0, 12, 215);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x02040c, 1);
        renderer.outputEncoding = THREE.sRGBEncoding;
        container.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; controls.dampingFactor = 0.06;
        controls.minDistance = 90; controls.maxDistance = 340; controls.enablePan = false;

        generateNeurons();
        connectNeurons();
        computeRegionMeta();
        buildNeuronPoints();
        buildEdgeLines();
        buildPulsePool(120);
        buildFireRingPool(40);
        buildRegionMarkers();
        buildHud();

        if (typeof THREE.EffectComposer === 'function'
            && typeof THREE.UnrealBloomPass === 'function'
            && typeof THREE.ShaderPass === 'function') {
            composer = new THREE.EffectComposer(renderer);
            composer.setSize(window.innerWidth, window.innerHeight);
            composer.addPass(new THREE.RenderPass(scene, camera));
            composer.addPass(new THREE.UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.5, 0.18));
        }

        resize();
        window.addEventListener('resize', resize);
        neuronPoints.material.uniforms.uScale.value = window.innerHeight * 0.42;
    }

    function activate() {
        init();
        if (hudEl) hudEl.style.display = '';
        if (running) return;
        running = true; clock.getDelta();
        illuminateAll();
        setPhase('idle', 'Reposo · esperando una petición');
        animate();
    }

    function deactivate() {
        running = false;
        if (hudEl) hudEl.style.display = 'none';
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    /* ───────────────── Eventos de la app (SignalR + UI) ───────────────── */

    function bindEvents() {
        if (typeof connection !== 'undefined' && connection && typeof connection.on === 'function') {
            connection.on('OnCodeGraphLoaded', () => { if (isActive()) illuminateAll(); });

            connection.on('OnAgentStateChanged', (data) => {
                if (!isActive()) return;
                const skill = (data && data.skill) || '';
                if (skill === 'Agente') { startProcessing(); fireInputWave(signalColor('Agente'), 0.85); return; }
                if (skill === 'Error' || skill === 'Cuota' || skill === 'Config') {
                    setPhase('output', 'Error · ' + ((data && data.target) || 'ver log'));
                    fireInputWave(signalColor(skill), 0.95); return;
                }
                if (skill === 'Proveedor' || skill === 'Reintentando') {
                    advanceTo('orchestrate'); return;
                }
                /* Una skill concreta: muestra el salto de análisis → orquestación */
                advanceTo('analysis');
                fireBetween('temporal', 'cerebelo', signalColor(skill), 0.8, 5);
                setPhase('analysis', 'Skill · ' + (data.target || skill));
            });

            connection.on('OnAgentResponse', () => {
                if (!isActive()) return;
                advanceTo('output');
                fireCompletionBurst();
                seqActive = false;
                setPhase('output', 'Respuesta lista · red en reposo pronto');
            });
        }

        const btnStart = document.getElementById('btnStart');
        if (btnStart) {
            btnStart.addEventListener('click', () => {
                if (!isActive()) return;
                startProcessing();
                fireInputWave(DEFAULT_SIGNAL, 0.9);
            });
        }
    }

    function isActive() {
        return (typeof SkinManager !== 'undefined') && SkinManager.isActive('cerebro');
    }

    /* ───────────────── Expuesto a la página ───────────────── */
    window.BrainScene = {
        init, activate, deactivate, bindEvents, setView,
        process: startProcessing,
        pulse: () => fireInputWave(DEFAULT_SIGNAL, 0.9),
        burst: fireCompletionBurst,
        /* Métrica de actividad 0..1 para el tablero (dashboard) */
        activity: () => {
            let firing = 0;
            for (let i = 0; i < neurons.length; i++) if (neurons[i].energy > 0.35) firing++;
            const byPulses = Math.min(1, pulses.length / 26);
            const byFiring = firing / Math.max(1, neurons.length);
            const boost = seqActive ? 0.3 : 0;
            return Math.min(1, byPulses * 0.6 + byFiring * 0.8 + boost);
        },
        stats: () => {
            let firing = 0;
            for (let i = 0; i < neurons.length; i++) if (neurons[i].energy > 0.35) firing++;
            return {
                neuronas: neurons.length, sinapsis: synapses.length, pulsos: pulses.length,
                firing: firing, fases: crossRegion.length, fase: currentPhase, seq: seqActive
            };
        }
    };
})();
