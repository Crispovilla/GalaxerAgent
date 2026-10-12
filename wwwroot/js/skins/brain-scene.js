/* ─────────────────────────────────────────────────────────────────────────
   Escena 3D "Cerebro" — skin alternativa de la consola /Agent.

   Representa el proceso del agente como un cerebro que dispara sinapsis
   (pulsos de luz recorriendo conexiones entre neuronas) cada vez que hay
   actividad, en lugar de la constelación de la galaxia.

   Es un script clásico (sin módulos) autocontenido: crea su propio renderer
   dentro de #brain-container y NO toca la escena de constellation.js.
   Se comunica con el resto de la app usando las globales de página:
     - THREE / gsap (CDN)
     - connection (SignalR, definida en constellation.js)
   Se registra en SkinManager desde skins.js.
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

    /* ── Estado interno ── */
    const neurons = [];            // { pos: Vector3, region: string, energy: number }
    const synapses = [];           // { a: idx, b: idx }
    const adjacency = [];          // adjacency[i] = array de índices de sinapsis que tocan i
    const pulses = [];             // pulsos vivos { sprite, a, b, t, speed, intensity, color }
    const pulsePool = [];          // sprites inactivos reutilizables
    let regionIndex = {};          // region -> [idx neuronas]

    let running = false;
    let rafId = null;
    let initialized = false;
    let propagationBudget = 0;    // limita cascadas para no saturar
    let nextIdleAt = 0;
    const clock = (typeof THREE !== 'undefined') ? new THREE.Clock() : null;

    /* Paleta: azul reposo → cian/blanco activo. Señales coloreadas por skill. */
    const RESTING = new THREE.Color(0x0f3d8c);
    const ACTIVE = new THREE.Color(0x9be8ff);

    const SKILL_COLORS = {
        Error: 0xff5a5a,
        Cuota: 0xff5a5a,
        Config: 0xff5a5a,
        Reintentando: 0xffb347,
        Proveedor: 0xffb347,
        Agente: 0x66ffcc,
        Portal: 0xcc77ff
    };
    const DEFAULT_SIGNAL = 0x66d9ff;

    /* ───────────────── Texturas y utilidades ───────────────── */

    function makeGlowTexture() {
        const size = 128;
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const ctx = cv.getContext('2d');
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0.0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(200,235,255,0.85)');
        g.addColorStop(0.55, 'rgba(90,160,255,0.35)');
        g.addColorStop(1.0, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(cv);
    }

    function rnd(a, b) { return a + Math.random() * (b - a); }

    /* ───────────────── Generación del cerebro ───────────────── */

    /* Forma general: elipsoide deformada (corteza) + tronco + cerebelo.
       Cada región se clasifica por posición para poder "dirigir" las señales. */
    function generateNeurons() {
        const rx = 62, ry = 50, rz = 72;      // radios de la corteza
        const CORTEX = 190;

        /* Corteza por distribución de Fibonacci sobre una elipsoide */
        const golden = Math.PI * (1 + Math.sqrt(5));
        for (let i = 0; i < CORTEX; i++) {
            const t = (i + 0.5) / CORTEX;
            const phi = Math.acos(1 - 2 * t);
            const theta = golden * i;
            let x = Math.sin(phi) * Math.cos(theta) * rx;
            let y = Math.cos(phi) * ry;
            let z = Math.sin(phi) * Math.sin(theta) * rz;

            /* Longitudinal fissure: separar hemisferios dejando un canal en x≈0 */
            if (Math.abs(x) < 5) x += (x >= 0 ? 5 : -5);
            /* Aplanar un poco la base */
            if (y < -ry * 0.45) y *= 0.82;

            /* Ruido sutil para aspecto orgánico */
            x += rnd(-2.2, 2.2); y += rnd(-2.2, 2.2); z += rnd(-2.2, 2.2);

            const region = classifyCortex(x, y, z, rx, ry, rz);
            addNeuron(x, y, z, region);
        }

        /* Cerebelo: racimo pequeño abajo-atrás */
        const cbCx = 0, cbCy = -ry * 0.66, cbCz = -rz * 0.6;
        for (let i = 0; i < 32; i++) {
            const u = rnd(0, Math.PI * 2), v = Math.acos(rnd(-1, 1));
            const rr = 20 * Math.cbrt(Math.random());
            addNeuron(
                cbCx + rr * Math.sin(v) * Math.cos(u) * 1.15,
                cbCy + rr * Math.cos(v) * 0.6,
                cbCz + rr * Math.sin(v) * Math.sin(u) * 0.75,
                'cerebelo'
            );
        }

        /* Tronco encefálico: columna que desciende desde el centro inferior */
        for (let i = 0; i < 22; i++) {
            const f = i / 21;
            const y = -ry * 0.4 - f * (ry * 0.7);
            const z = -rz * 0.08 - f * 6;
            addNeuron(rnd(-7, 7), y, z + rnd(-3, 3), 'tronco');
        }
    }

    function classifyCortex(x, y, z, rx, ry, rz) {
        if (z > rz * 0.28) return 'frontal';       // zona de entrada / peticiones
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

    /* Conexiones: k vecinos más cercanos + algunas fibras de larga distancia. */
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
        /* Fibras de asociación frontal ↔ occipital para propagación lejana */
        const front = regionIndex.frontal || [];
        const back = regionIndex.occipital || [];
        for (let n = 0; n < 26; n++) {
            if (!front.length || !back.length) break;
            addEdge(front[(Math.random() * front.length) | 0],
                    back[(Math.random() * back.length) | 0], seen);
        }
        /* Cerebelo y tronco conectados a la corteza más cercana */
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
    }

    function addEdge(a, b, seen) {
        if (a === b) return;
        const key = a < b ? a + '_' + b : b + '_' + a;
        if (seen.has(key)) return;
        seen.add(key);
        const idx = synapses.length;
        synapses.push({ a, b });
        adjacency[a].push(idx);
        adjacency[b].push(idx);
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
            uniforms: {
                uTex: { value: glowTex },
                uScale: { value: 400 }
            },
            vertexShader: [
                'attribute float aScale;',
                'attribute vec3 aColor;',
                'varying vec3 vColor;',
                'uniform float uScale;',
                'void main() {',
                '  vColor = aColor;',
                '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
                '  gl_PointSize = aScale * uScale / max(0.001, -mv.z);',
                '  gl_Position = projectionMatrix * mv;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D uTex;',
                'varying vec3 vColor;',
                'void main() {',
                '  vec4 t = texture2D(uTex, gl_PointCoord);',
                '  gl_FragColor = vec4(vColor, 1.0) * t;',
                '}'
            ].join('\n'),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        neuronPoints = new THREE.Points(geo, mat);
        neuronPoints.frustumCulled = false;
        scene.add(neuronPoints);
    }

    function buildEdgeLines() {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(synapses.length * 6);
        synapses.forEach((s, i) => {
            const a = neurons[s.a].pos, b = neurons[s.b].pos;
            pos[i * 6] = a.x; pos[i * 6 + 1] = a.y; pos[i * 6 + 2] = a.z;
            pos[i * 6 + 3] = b.x; pos[i * 6 + 4] = b.y; pos[i * 6 + 5] = b.z;
        });
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0x1c4a86, transparent: true, opacity: 0.22,
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
            sp.visible = false;
            sp.scale.setScalar(7);
            scene.add(sp);
            pulsePool.push({ sprite: sp, active: false });
        }
    }

    /* ───────────────── Disparo de sinapsis ───────────────── */

    function fireSynapse(a, b, colorHex, speed, intensity) {
        const slot = pulsePool.find(p => !p.active);
        if (!slot) return;
        slot.active = true;
        slot.sprite.visible = true;
        slot.sprite.material.color.setHex(colorHex);
        slot.sprite.material.opacity = Math.min(1, 0.5 + intensity * 0.5);
        pulses.push({
            sprite: slot.sprite, ref: slot,
            a, b, t: 0,
            speed: speed || rnd(1.6, 2.6),
            intensity: intensity == null ? 0.7 : intensity,
            color: colorHex
        });
    }

    function signalColor(skill) {
        return SKILL_COLORS[skill] != null ? SKILL_COLORS[skill] : DEFAULT_SIGNAL;
    }

    function randomNeuron(region) {
        const pool = (region && regionIndex[region]) || neurons.map((_, i) => i);
        if (!pool.length) return (Math.random() * neurons.length) | 0;
        return pool[(Math.random() * pool.length) | 0];
    }

    /* Onda de entrada: parte de la zona frontal (la "petición" del usuario). */
    function fireInputWave(colorHex, intensity) {
        propagationBudget = 150;
        const front = regionIndex.frontal || [];
        const seeds = front.slice(0, Math.min(front.length, 14));
        seeds.forEach(i => {
            neurons[i].energy = Math.max(neurons[i].energy, intensity);
            const adj = adjacency[i] || [];
            if (adj.length) {
                const s = synapses[adj[(Math.random() * adj.length) | 0]];
                fireSynapse(i, s.a === i ? s.b : s.a, colorHex, rnd(2.4, 3.4), intensity);
            }
        });
    }

    /* Onda global de finalización. */
    function fireCompletionBurst() {
        propagationBudget = 240;
        for (let n = 0; n < 40; n++) {
            const i = randomNeuron();
            neurons[i].energy = Math.max(neurons[i].energy, rnd(0.8, 1));
            const adj = adjacency[i] || [];
            if (adj.length) {
                const s = synapses[adj[(Math.random() * adj.length) | 0]];
                fireSynapse(i, s.a === i ? s.b : s.a, signalColor('Portal'), rnd(2.2, 3.2), 0.9);
            }
        }
    }

    /* Iluminar toda la estructura (mapa/code-graph recibido). */
    function illuminateAll() {
        neurons.forEach((n, i) => {
            if (Math.random() < 0.85) {
                n.energy = Math.max(n.energy, rnd(0.5, 0.9));
                const adj = adjacency[i] || [];
                if (adj.length && Math.random() < 0.5) {
                    const s = synapses[adj[(Math.random() * adj.length) | 0]];
                    fireSynapse(i, s.a === i ? s.b : s.a, DEFAULT_SIGNAL, rnd(1.8, 2.8), 0.6);
                }
            }
        });
    }

    /* ───────────────── Bucle de animación ───────────────── */

    function updatePulses(dt) {
        for (let i = pulses.length - 1; i >= 0; i--) {
            const p = pulses[i];
            p.t += (p.speed * dt) / Math.max(1, neurons[p.a].pos.distanceTo(neurons[p.b].pos)) * 22;
            if (p.t >= 1) {
                /* Llegada: encender neurona y, si hay presupuesto, propagar. */
                neurons[p.b].energy = Math.min(1.2, neurons[p.b].energy + p.intensity);
                if (propagationBudget > 0 && p.intensity > 0.35 && Math.random() < 0.55) {
                    propagationBudget--;
                    const adj = adjacency[p.b] || [];
                    if (adj.length) {
                        const s = synapses[adj[(Math.random() * adj.length) | 0]];
                        const nxt = s.a === p.b ? s.b : s.a;
                        fireSynapse(p.b, nxt, p.color, p.speed * 0.95, p.intensity * 0.72);
                    }
                }
                p.ref.active = false;
                p.ref.sprite.visible = false;
                p.ref.sprite.material.opacity = 0;
                pulses.splice(i, 1);
                continue;
            }
            const a = neurons[p.a].pos, b = neurons[p.b].pos;
            p.sprite.position.lerpVectors(a, b, p.t);
            const flick = 0.7 + Math.sin(p.t * Math.PI) * 0.3;
            p.sprite.material.opacity = Math.min(1, (0.4 + p.intensity * 0.6) * flick);
            p.sprite.scale.setScalar(6 + p.intensity * 6 * Math.sin(p.t * Math.PI));
        }
    }

    function updateNeurons(dt, elapsed) {
        const col = neuronPoints.geometry.getAttribute('aColor');
        const scl = neuronPoints.geometry.getAttribute('aScale');
        const tmp = new THREE.Color();
        for (let i = 0; i < neurons.length; i++) {
            const n = neurons[i];
            if (n.energy > 0) n.energy = Math.max(0, n.energy - dt * 1.4);
            /* Parpadeo de reposo + impulso activo */
            const rest = 0.14 + Math.sin(elapsed * 1.6 + i * 0.7) * 0.08;
            const e = Math.min(1, n.energy + rest * (1 - Math.min(1, n.energy)));
            tmp.copy(RESTING).lerp(ACTIVE, e);
            tmp.toArray(col.array, i * 3);
            scl.array[i] = 6 + e * 12;
        }
        col.needsUpdate = true;
        scl.needsUpdate = true;
    }

    function animate() {
        if (!running) return;
        rafId = requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.elapsedTime;

        /* Potencial de reposo: sinapsis débiles aleatorias */
        if (elapsed > nextIdleAt) {
            nextIdleAt = elapsed + rnd(0.3, 0.7);
            if (pulses.length < 22) {
                const i = randomNeuron();
                const adj = adjacency[i] || [];
                if (adj.length) {
                    const s = synapses[adj[(Math.random() * adj.length) | 0]];
                    fireSynapse(i, s.a === i ? s.b : s.a, DEFAULT_SIGNAL, rnd(1.2, 2.0), 0.28);
                }
            }
        }

        updatePulses(dt);
        updateNeurons(dt, elapsed);

        scene.rotation.y += dt * 0.04;
        if (controls) controls.update();
        if (composer) composer.render();
        else renderer.render(scene, camera);
    }

    function resize() {
        if (!renderer) return;
        const w = window.innerWidth, h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (composer) composer.setSize(w, h);
        if (neuronPoints) neuronPoints.material.uniforms.uScale.value = h * 0.42;
    }

    /* ───────────────── Ciclo de vida (llamado por SkinManager) ───────────────── */

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
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.minDistance = 90;
        controls.maxDistance = 340;
        controls.enablePan = false;

        generateNeurons();
        connectNeurons();
        buildNeuronPoints();
        buildEdgeLines();
        buildPulsePool(80);

        /* Post-procesado bloom si los passes del CDN cargaron (mismos que la galaxia) */
        if (typeof THREE.EffectComposer === 'function'
            && typeof THREE.UnrealBloomPass === 'function'
            && typeof THREE.ShaderPass === 'function') {
            composer = new THREE.EffectComposer(renderer);
            composer.setSize(window.innerWidth, window.innerHeight);
            composer.addPass(new THREE.RenderPass(scene, camera));
            composer.addPass(new THREE.UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.5, 0.2
            ));
        }

        resize();
        window.addEventListener('resize', resize);

        neuronPoints.material.uniforms.uScale.value = window.innerHeight * 0.42;
    }

    function activate() {
        init();
        if (running) return;
        running = true;
        clock.getDelta();
        /* Saludo: el cerebro "despierta" */
        illuminateAll();
        animate();
    }

    function deactivate() {
        running = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    /* ───────────────── Eventos de la app (SignalR + UI) ───────────────── */

    function bindEvents() {
        /* SignalR: se suscribe a los MISMOS eventos que la galaxia.
           SignalR permite múltiples handlers por nombre, así que no pisa a constellation.js. */
        if (typeof connection !== 'undefined' && connection && typeof connection.on === 'function') {
            connection.on('OnCodeGraphLoaded', () => {
                if (!isActive()) return;
                illuminateAll();
            });

            connection.on('OnAgentStateChanged', (data) => {
                if (!isActive()) return;
                const skill = (data && data.skill) || '';
                if (skill === 'Agente') { fireInputWave(signalColor('Agente'), 0.85); return; }
                if (skill === 'Error' || skill === 'Cuota' || skill === 'Config') {
                    fireInputWave(signalColor(skill), 0.95); return;
                }
                propagationBudget = 120;
                const from = randomNeuron('frontal');
                const to = randomNeuron();
                neurons[from].energy = Math.max(neurons[from].energy, 0.8);
                fireSynapse(from, to, signalColor(skill), rnd(2.4, 3.2), 0.8);
            });

            connection.on('OnAgentResponse', () => {
                if (!isActive()) return;
                fireCompletionBurst();
            });
        }

        /* Al enviar una petición (Iniciar Hiperimpulsor), onda de entrada. */
        const btnStart = document.getElementById('btnStart');
        if (btnStart) {
            btnStart.addEventListener('click', () => {
                if (!isActive()) return;
                fireInputWave(DEFAULT_SIGNAL, 0.9);
            });
        }
    }

    function isActive() {
        return (typeof SkinManager !== 'undefined') && SkinManager.isActive('cerebro');
    }

    /* ───────────────── Expuesto a la página ───────────────── */
    window.BrainScene = {
        init, activate, deactivate, bindEvents,
        /* atajos para probar desde consola/Playwright */
        pulse: () => fireInputWave(DEFAULT_SIGNAL, 0.9),
        burst: fireCompletionBurst,
        stats: () => ({ neuronas: neurons.length, sinapsis: synapses.length, pulsos: pulses.length })
    };
})();
