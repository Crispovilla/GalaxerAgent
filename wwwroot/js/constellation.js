const container = document.getElementById('canvas-container');
const hudFx = document.getElementById('hud-fx');
const radarCanvas = document.getElementById('radar');
const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
const speedoNeedle = document.getElementById('speedo-needle');
const speedoVal = document.getElementById('speedo-val');
const navXyz = document.getElementById('nav-xyz');
const navHdg = document.getElementById('nav-hdg');
const pwrBars = Array.from(document.querySelectorAll('#pwr-bars i'));
const wpCard = document.getElementById('hud-waypoint');
const wpName = document.getElementById('wp-name');
const wpDist = document.getElementById('wp-dist');
const wpArrow = document.getElementById('wp-arrow');

/* ───────────────── Globales de la consola de agentes ───────────────── */

let mainWin = null;      // ventana principal (#ui-panel)
let focusedWin = null;   // ventana enfocada (su nave gobierna el cockpit)
let hudRig = null;       // nave cuya telemetría se muestra en el dashboard
let windowSeq = 0;       // numeración "Agente N" de ventanas secundarias
const agentWindows = [];         // todas las ventanas de agente
const sessionWindows = new Map(); // sessionId -> ventana
let launchInFlight = false;       // hay un POST /api/agent/start en curso (evita duplicado con restoreSessions)

function addLog(msg, cls) {
    if (mainWin) mainWin.addLog(msg, cls);
}

function setMission(text, cls) {
    if (mainWin) mainWin.setMission(text, cls);
}

/* ───────────────────────── Utilidades ───────────────────────── */

function createGlowTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

const glowTexture = createGlowTexture();

function disposeObject(obj) {
    obj.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const mats = o.material
            ? (Array.isArray(o.material) ? o.material : [o.material])
            : [];
        mats.forEach(m => {
            if (m.map && m.map !== glowTexture) m.map.dispose();
            m.dispose();
        });
    });
}

function clearGroup(group) {
    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        disposeObject(child);
    }
}

const SKILL_COLORS = {
    WriteFile: 0x3dff9e,
    ReadFile: 0xffe36e,
    ListFiles: 0x6ec8ff,
    Error: 0xff4d6d,
    Config: 0xffb347,
    Agente: 0x00ffcc
};

function skillColor(skill) {
    return SKILL_COLORS[skill] || 0x9be7ff;
}

function nodeColor(type) {
    switch (type) {
        case 2: return 0x8fe8ff;
        case 3: return 0xd2aaff;
        case 4: return 0xffe3a3;
        default: return 0xeaf4ff;
    }
}

function makeLabelSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const raw = String(text == null ? '' : text);
    const label = raw.length > 24 ? raw.slice(0, 23) + '…' : raw;
    const fontPx = Math.max(14, Math.min(56, Math.floor(472 / Math.max(label.length, 1) / 0.62)));
    ctx.font = `bold ${fontPx}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = '#dfeaf4';
    ctx.fillText(label, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    try { tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); } catch (e) { }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false
    }));
    sprite.scale.set(14, 3.5, 1);
    return sprite;
}

/* ───────────────────────── Escena base ───────────────────────── */

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040c, 0.0016);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 42, 120);

let composer = null;

function getRenderPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    return composer ? Math.min(dpr, 2) : Math.min(dpr, 3);
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x02040c, 1);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 24;
controls.maxDistance = 300;
controls.enablePan = false;

/* Post-procesado: bloom + FXAA + corrección gamma (si examples/js cargó desde CDN) */
let fxaaPass = null;
if (typeof THREE.EffectComposer === 'function'
    && typeof THREE.UnrealBloomPass === 'function'
    && typeof THREE.ShaderPass === 'function') {
    composer = new THREE.EffectComposer(renderer);
    composer.setPixelRatio(getRenderPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.38,
        0.4,
        0.68
    ));
    if (typeof THREE.GammaCorrectionShader !== 'undefined') {
        composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
    }
    if (typeof THREE.FXAAShader !== 'undefined') {
        fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
        composer.addPass(fxaaPass);
    }
    renderer.setPixelRatio(getRenderPixelRatio());
}

function updatePostSize() {
    if (!composer) return;
    const dpr = getRenderPixelRatio();
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(dpr);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (fxaaPass) {
        fxaaPass.material.uniforms.resolution.value.set(
            1 / (window.innerWidth * dpr),
            1 / (window.innerHeight * dpr)
        );
    }
}
updatePostSize();

function createStarfield() {
    const count = 4200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
        const radius = 380 + Math.random() * 620;
        let x, y, z;

        if (i % 3 === 0) {
            const band = (i / count) * golden * 18;
            y = Math.sin(band * 0.35) * radius * 0.18 + (Math.random() - 0.5) * radius * 0.14;
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.max(radius * radius - y * y, 1));
            x = r * Math.cos(angle);
            z = r * Math.sin(angle);
        } else {
            const u = Math.random() * 2 - 1;
            const theta = Math.random() * Math.PI * 2;
            const s = Math.sqrt(1 - u * u);
            x = radius * s * Math.cos(theta);
            y = radius * u;
            z = radius * s * Math.sin(theta);
        }

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        const brightness = 0.3 + Math.random() * 0.7;
        const warm = Math.random();
        colors[i * 3] = brightness * (warm < 0.1 ? 1.0 : warm < 0.2 ? 0.75 : 0.92);
        colors[i * 3 + 1] = brightness * (warm < 0.1 ? 0.88 : warm < 0.2 ? 0.82 : 0.95);
        colors[i * 3 + 2] = brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 2.6,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        fog: false
    });

    scene.add(new THREE.Points(geometry, material));
}

createStarfield();

function createNebulae() {
    const tints = [0x3a1a66, 0x143b66, 0x0d5c5c, 0x5c1a3a, 0x24306a, 0x1a4a3a];
    for (let i = 0; i < tints.length; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture,
            color: tints[i],
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false
        }));
        sprite.scale.setScalar(420 + Math.random() * 380);
        const u = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const r = 820 + Math.random() * 220;
        sprite.position.set(r * s * Math.cos(theta), r * u * 0.6, r * s * Math.sin(theta));
        scene.add(sprite);
    }
}

function createSkyConstellations() {
    const lineMat = new THREE.LineBasicMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
    });

    for (let c = 0; c < 7; c++) {
        const pts = [];
        const dir = new THREE.Vector3(
            Math.random() * 2 - 1,
            (Math.random() * 2 - 1) * 0.7,
            Math.random() * 2 - 1
        ).normalize();
        let p = dir.clone().multiplyScalar(540 + Math.random() * 80);
        const steps = 4 + Math.floor(Math.random() * 4);

        for (let i = 0; i < steps; i++) {
            pts.push(p.clone());
            p = p.clone()
                .add(new THREE.Vector3((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 70))
                .setLength(540 + Math.random() * 80);
        }

        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));

        pts.forEach(pt => {
            const star = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glowTexture,
                color: 0xdff2ff,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                fog: false
            }));
            star.scale.setScalar(6);
            star.position.copy(pt);
            scene.add(star);
        });
    }
}

createNebulae();
createSkyConstellations();

/* ───────────────────────── Sistema solar ───────────────────────── */

const solarSystem = new THREE.Group();
scene.add(solarSystem);

const planetsGroup = new THREE.Group();
const linksGroup = new THREE.Group();
const stationsGroup = new THREE.Group();
const effectsGroup = new THREE.Group();
solarSystem.add(planetsGroup);
solarSystem.add(linksGroup);
solarSystem.add(stationsGroup);
solarSystem.add(effectsGroup);

const ORBIT_RADII = [15, 21, 28, 36, 45, 55];
const nodesMap = new Map();
const stationsMap = new Map();

let sunMesh = null;
let sunGlow = null;
let sunCorona = null;
let sunUniforms = null;
let nextFlareAt = 7;

function sunSph(r, lat, lon) {
    return new THREE.Vector3(
        r * Math.cos(lat) * Math.cos(lon),
        r * Math.sin(lat),
        r * Math.cos(lat) * Math.sin(lon)
    );
}

function createSun() {
    /* Superficie de plasma: granulación FBM + limbo + manchas frías */
    sunUniforms = {
        uTime: { value: 0 },
        uFlare: { value: 0 }
    };
    const sunVert = `
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
            vPos = position;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const sunFrag = `
        uniform float uTime;
        uniform float uFlare;
        varying vec3 vPos;
        varying vec3 vNormal;

        float hash(vec3 p) {
            p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float noise(vec3 x) {
            vec3 i = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                    mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                    mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
                f.z);
        }
        float fbm(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 5; i++) {
                v += a * noise(p);
                p = p * 2.03 + vec3(1.7, 9.2, 4.1);
                a *= 0.55;
            }
            return v;
        }

        void main() {
            vec3 p = normalize(vPos);
            float t = uTime * 0.05;
            float gran = fbm(p * 6.5 + vec3(t, -t * 0.7, t * 0.35));
            float cells = fbm(p * 2.3 - vec3(t * 0.4, 0.0, t * 0.2));
            float f = 0.55 * gran + 0.45 * cells;

            vec3 deep = vec3(0.70, 0.14, 0.015);
            vec3 mid  = vec3(1.00, 0.50, 0.09);
            vec3 hot  = vec3(1.00, 0.94, 0.62);
            vec3 col = mix(deep, mid, smoothstep(0.22, 0.60, f));
            col = mix(col, hot, smoothstep(0.56, 0.86, f));

            /* manchas / regiones frías */
            float spot = smoothstep(0.30, 0.16, cells) * smoothstep(0.40, 0.55, gran);
            col *= 1.0 - spot * 0.6;

            /* limbo: más brillante al centro, más profundo en el borde */
            float facing = clamp(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
            col *= 0.66 + 0.55 * pow(facing, 0.5);

            /* fulguración global momentánea */
            col += vec3(1.0, 0.82, 0.5) * uFlare;
            gl_FragColor = vec4(col, 1.0);
        }
    `;
    sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(5, 64, 64),
        new THREE.ShaderMaterial({
            uniforms: sunUniforms,
            vertexShader: sunVert,
            fragmentShader: sunFrag
        })
    );

    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffa83e,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    sunGlow.scale.setScalar(26);
    sunMesh.add(sunGlow);

    /* Corona exterior tenue (segunda capa de resplandor) */
    const coronaOuter = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xff5a1e,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    coronaOuter.scale.setScalar(46);
    sunMesh.add(coronaOuter);

    /* Protuberancias solares: arcos de plasma sobre el limbo */
    const promGroup = new THREE.Group();
    sunMesh.add(promGroup);
    const proms = [
        { lat: 0.25, lon: 0.4, spread: 0.85, height: 2.3, thick: 0.38 },
        { lat: -0.35, lon: 2.1, spread: 0.65, height: 1.6, thick: 0.28 },
        { lat: 0.5, lon: 3.6, spread: 1.1, height: 2.8, thick: 0.45 },
        { lat: -0.15, lon: 5.0, spread: 0.55, height: 1.3, thick: 0.24 },
        { lat: 0.05, lon: 1.3, spread: 0.95, height: 2.0, thick: 0.3 }
    ];
    proms.forEach(cfg => {
        const a = sunSph(4.92, cfg.lat, cfg.lon);
        const b = sunSph(4.92, cfg.lat + (Math.random() - 0.5) * 0.4, cfg.lon + cfg.spread);
        const mid = a.clone().add(b).normalize().multiplyScalar(5 + cfg.height);
        const curve = new THREE.CatmullRomCurve3([a, mid, b]);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff5a22,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, cfg.thick, 6, false), mat);
        promGroup.add(tube);
        /* núcleo brillante más fino dentro del arco */
        const coreMat = mat.clone();
        coreMat.color.setHex(0xffb46a);
        const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, cfg.thick * 0.4, 5, false), coreMat);
        promGroup.add(core);
        /* respiración lenta del plasma */
        const target = 0.45 + Math.random() * 0.35;
        gsap.to(mat, { opacity: target, duration: 2.4 + Math.random() * 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: Math.random() * 3 });
        gsap.to(coreMat, { opacity: target * 0.8, duration: 1.9 + Math.random() * 2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: Math.random() * 2 });
    });

    const light = new THREE.PointLight(0xfff0d0, 1.4, 600, 1.4);
    solarSystem.add(light);

    /* Luz principal direccional con sombras suaves (realismo) */
    const keyLight = new THREE.DirectionalLight(0xfff2dd, 0.7);
    keyLight.position.set(70, 110, -50);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -170;
    keyLight.shadow.camera.right = 170;
    keyLight.shadow.camera.top = 170;
    keyLight.shadow.camera.bottom = -170;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 460;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);
    scene.add(keyLight.target);

    /* Relleno ambiental frío (cielo espacial) */
    const hemi = new THREE.HemisphereLight(0x93aed0, 0x101824, 0.5);
    scene.add(hemi);

    sunCorona = new THREE.Mesh(
        new THREE.TorusGeometry(6.6, 0.12, 8, 100),
        new THREE.MeshBasicMaterial({
            color: 0xffb050,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    sunCorona.rotation.x = -Math.PI / 2;
    solarSystem.add(sunCorona);

    solarSystem.add(sunMesh);
}

/* Fulguración solar: destello, chispas, luz puntual y brillo global */
function spawnSolarFlare() {
    const lat = (Math.random() - 0.5) * 1.3;
    const lon = Math.random() * Math.PI * 2;
    const pos = sunSph(5.0, lat, lon);

    /* Destello principal */
    const fm = new THREE.SpriteMaterial({
        map: glowTexture, color: 0xfff1c2, transparent: true,
        opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const flash = new THREE.Sprite(fm);
    flash.position.copy(pos);
    flash.scale.setScalar(0.5);
    sunMesh.add(flash);
    gsap.to(flash.scale, { x: 7.5, y: 7.5, z: 7.5, duration: 0.85, ease: 'power2.out' });
    gsap.to(fm, {
        opacity: 0, duration: 1.1, ease: 'power1.in',
        onComplete: () => { sunMesh.remove(flash); fm.dispose(); }
    });

    /* Destello secundario anaranjado (a las 0,2 s) */
    gsap.delayedCall(0.2, () => {
        const fm2 = new THREE.SpriteMaterial({
            map: glowTexture, color: 0xffb066, transparent: true,
            opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const f2 = new THREE.Sprite(fm2);
        f2.position.copy(pos);
        f2.scale.setScalar(0.3);
        sunMesh.add(f2);
        gsap.to(f2.scale, { x: 3.6, y: 3.6, z: 3.6, duration: 0.8, ease: 'power2.out' });
        gsap.to(fm2, {
            opacity: 0, duration: 1.0, ease: 'power1.in',
            onComplete: () => { sunMesh.remove(f2); fm2.dispose(); }
        });
    });

    /* Chispas de plasma en todas direcciones */
    const N = 42;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const vels = [];
    const palette = [0xfff6d8, 0xffd27f, 0xffa040, 0xffffff];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
        c.setHex(palette[(Math.random() * palette.length) | 0]);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        vels.push(new THREE.Vector3(
            (Math.random() - 0.5) * 1.4,
            (Math.random() - 0.5) * 1.4,
            (Math.random() - 0.5) * 1.4
        ).normalize().multiplyScalar(2.5 + Math.random() * 6));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.3, vertexColors: true, transparent: true,
        opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const sparks = new THREE.Points(geo, mat);
    sparks.position.copy(pos);
    sunMesh.add(sparks);
    const dur = 1.4;
    const st = { t: 0 };
    gsap.to(st, {
        t: dur, duration: dur, ease: 'none',
        onUpdate: () => {
            const arr = geo.attributes.position.array;
            const k = st.t / dur;
            for (let i = 0; i < N; i++) {
                const v = vels[i];
                arr[i * 3] = v.x * k;
                arr[i * 3 + 1] = v.y * k;
                arr[i * 3 + 2] = v.z * k;
            }
            geo.attributes.position.needsUpdate = true;
            mat.opacity = 1 - k;
        },
        onComplete: () => {
            sunMesh.remove(sparks);
            geo.dispose();
            mat.dispose();
        }
    });

    /* Luz puntual que baña el entorno */
    const fl = new THREE.PointLight(0xffc890, 0, 95, 1.8);
    fl.position.copy(pos);
    sunMesh.add(fl);
    gsap.to(fl, {
        intensity: 9, duration: 0.16, ease: 'power2.out',
        onComplete: () => {
            gsap.to(fl, {
                intensity: 0, duration: 0.95, ease: 'power1.in',
                onComplete: () => { sunMesh.remove(fl); fl.dispose(); }
            });
        }
    });

    /* Brillo global del sol (uFlare del shader) */
    if (sunUniforms) {
        gsap.fromTo(sunUniforms.uFlare, { value: 0.45 }, { value: 0, duration: 1.0, ease: 'power1.out' });
    }
}

function createOrbits() {
    ORBIT_RADII.forEach(radius => {
        const pts = [];
        for (let i = 0; i <= 128; i++) {
            const a = (i / 128) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
            color: 0x2a6fb8,
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        solarSystem.add(new THREE.Line(geo, mat));
    });
}

createSun();
createOrbits();

/* ───────────────────────── Cinturón de asteroides ───────────────────────── */

let asteroidBelt = null;

function createAsteroidBelt() {
    asteroidBelt = new THREE.Group();
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x5f574c,
        roughness: 1.0,
        metalness: 0.0,
        flatShading: true
    });

    for (let i = 0; i < 170; i++) {
        const rock = new THREE.Mesh(geo, mat);
        const angle = Math.random() * Math.PI * 2;
        const radius = 31.6 + (Math.random() - 0.5) * 3.4;
        const s = 0.32 + Math.random() * 0.9;
        rock.scale.set(
            s * (0.7 + Math.random() * 0.7),
            s * (0.5 + Math.random() * 0.55),
            s * (0.7 + Math.random() * 0.7)
        );
        rock.position.set(
            Math.cos(angle) * radius,
            (Math.random() - 0.5) * 1.8,
            Math.sin(angle) * radius
        );
        rock.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        asteroidBelt.add(rock);
    }

    asteroidBelt.rotation.z = 0.05;
    solarSystem.add(asteroidBelt);
}

createAsteroidBelt();

/* ───────────────────────── Nave ───────────────────────── */

const BASE_POSITION = new THREE.Vector3(0, 5, 70);
const PORTAL_POSITION = new THREE.Vector3(0, 34, -95);

function createHullTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#a9a39a';
    ctx.fillRect(0, 0, 1024, 512);

    /* Grano de desgaste */
    for (let i = 0; i < 2600; i++) {
        const shade = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${shade},${shade},${shade},${(Math.random() * 0.05).toFixed(3)})`;
        ctx.fillRect(Math.random() * 1024, Math.random() * 512, 2 + Math.random() * 3, 1 + Math.random() * 2);
    }

    /* Placas del casco */
    const palette = ['#b3ada3', '#9d978d', '#bcb5a9', '#c4a97c', '#8e877d', '#6f6a62', '#a89c8e', '#97917f'];
    for (let i = 0; i < 180; i++) {
        const w = 22 + Math.random() * 84;
        const h = 14 + Math.random() * 52;
        const x = Math.random() * (1024 - w);
        const y = Math.random() * (512 - h);
        ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(48, 46, 42, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }

    /* Costuras horizontales */
    for (let i = 0; i < 9; i++) {
        const y = (i + 1) * 51 + Math.random() * 18;
        ctx.strokeStyle = `rgba(40, 38, 34, ${(0.25 + Math.random() * 0.3).toFixed(2)})`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1024, y);
        ctx.stroke();
    }

    /* Costuras verticales */
    for (let i = 0; i < 46; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 460;
        ctx.strokeStyle = 'rgba(40, 38, 34, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 24 + Math.random() * 40);
        ctx.stroke();
    }

    /* Rejillas de ventilación */
    for (let i = 0; i < 26; i++) {
        const x = Math.random() * 990;
        const y = Math.random() * 480;
        ctx.fillStyle = 'rgba(35, 34, 30, 0.7)';
        for (let j = 0; j < 5; j++) {
            ctx.fillRect(x, y + j * 4, 18 + Math.random() * 14, 2);
        }
    }

    /* Remaches */
    for (let i = 0; i < 260; i++) {
        ctx.fillStyle = 'rgba(55, 52, 46, 0.6)';
        ctx.beginPath();
        ctx.arc(Math.random() * 1024, Math.random() * 512, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
}

function createEngineTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#10161d';
    ctx.fillRect(0, 0, 256, 64);

    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#e8fbff');
    grad.addColorStop(0.5, '#7fd4ff');
    grad.addColorStop(1, '#2a8fd8');

    for (let x = 4; x < 256; x += 16) {
        ctx.fillStyle = grad;
        ctx.fillRect(x, 4, 9, 56);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

const hullTexture = createHullTexture();
const engineTexture = createEngineTexture();

function buildShipParts() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: hullTexture,
        metalness: 0.35,
        roughness: 0.52
    });
    const panelMat = new THREE.MeshStandardMaterial({
        color: 0x7d786e,
        metalness: 0.5,
        roughness: 0.58
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: 0x4a4740,
        metalness: 0.4,
        roughness: 0.7
    });
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });

    /* Casco principal con perfil redondeado (Lathe) */
    const profile = [
        new THREE.Vector2(0.02, -0.30),
        new THREE.Vector2(1.20, -0.33),
        new THREE.Vector2(1.95, -0.30),
        new THREE.Vector2(2.32, -0.22),
        new THREE.Vector2(2.52, -0.12),
        new THREE.Vector2(2.60, 0.00),
        new THREE.Vector2(2.52, 0.12),
        new THREE.Vector2(2.32, 0.22),
        new THREE.Vector2(1.95, 0.30),
        new THREE.Vector2(1.20, 0.33),
        new THREE.Vector2(0.02, 0.35)
    ];
    const saucer = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), hullMat);
    group.add(saucer);

    /* Aro del borde */
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.57, 0.09, 10, 72), panelMat);
    rim.rotation.x = -Math.PI / 2;
    group.add(rim);

    /* Cúpula superior */
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.75, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        hullMat
    );
    dome.scale.set(1, 0.2, 1);
    dome.position.y = 0.30;
    group.add(dome);

    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.16, 20), panelMat);
    hatch.position.y = 0.66;
    group.add(hatch);

    /* Torreta superior */
    const turret = new THREE.Group();
    turret.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), panelMat));
    [-0.09, 0.09].forEach(x => {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8), darkMat);
        barrel.rotation.x = 0.9;
        barrel.position.set(x, 0.28, 0.16);
        turret.add(barrel);
    });
    turret.position.set(0, 0.78, -0.15);
    group.add(turret);

    /* Torreta inferior */
    const turretB = turret.clone();
    turretB.position.set(0, -0.62, -0.15);
    turretB.rotation.z = Math.PI;
    group.add(turretB);

    /* Mandíbulas biseladas (ExtrudeGeometry) */
    const mandShape = new THREE.Shape();
    mandShape.moveTo(0, -0.26);
    mandShape.lineTo(1.95, -0.15);
    mandShape.lineTo(1.95, 0.15);
    mandShape.lineTo(0, 0.26);
    mandShape.closePath();
    const mandGeo = new THREE.ExtrudeGeometry(mandShape, {
        depth: 0.6,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments: 2,
        steps: 1
    });
    mandGeo.translate(0, 0, -0.3);
    mandGeo.rotateY(-Math.PI / 2);
    [-0.88, 0.88].forEach(x => {
        const mand = new THREE.Mesh(mandGeo, hullMat);
        mand.position.set(x, 0, 1.55);
        group.add(mand);
    });

    /* Luces de navegación en las puntas */
    [{ x: -0.88, c: 0xff3b52 }, { x: 0.88, c: 0x3dff9e }].forEach(({ x, c }) => {
        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 10, 8),
            new THREE.MeshBasicMaterial({ color: c })
        );
        lamp.position.set(x, 0.06, 3.56);
        group.add(lamp);

        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture,
            color: c,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        halo.scale.setScalar(0.9);
        halo.position.copy(lamp.position);
        group.add(halo);
    });

    /* Cabina en el estribor (cuello + tubo cónico + cúpula) */
    const cockpit = new THREE.Group();
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.5, 14), panelMat);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = 0.2;
    cockpit.add(neck);

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 1.3, 16), hullMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = 1.0;
    cockpit.add(tube);

    const canopyRim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.045, 8, 20), darkMat);
    canopyRim.position.z = 1.62;
    cockpit.add(canopyRim);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), glassMat);
    canopy.position.z = 1.66;
    cockpit.add(canopy);

    cockpit.position.set(1.72, 0.06, 1.2);
    cockpit.rotation.y = -0.3;
    group.add(cockpit);

    /* Matriz de impulso curva (arco trasero con lamas) */
    const arc = 130 * Math.PI / 180;
    const engineBack = new THREE.Mesh(
        new THREE.CylinderGeometry(2.48, 2.48, 0.5, 32, 1, true, Math.PI - arc / 2, arc),
        new THREE.MeshStandardMaterial({ color: 0x2c3238, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide })
    );
    group.add(engineBack);

    const engineBand = new THREE.Mesh(
        new THREE.CylinderGeometry(2.56, 2.56, 0.42, 40, 1, true, Math.PI - arc / 2, arc),
        new THREE.MeshStandardMaterial({
            color: 0xaebfcb,
            map: engineTexture,
            emissive: 0xffffff,
            emissiveMap: engineTexture,
            emissiveIntensity: 1.0,
            metalness: 0.35,
            roughness: 0.4,
            side: THREE.DoubleSide
        })
    );
    group.add(engineBand);

    /* Greebles variados sobre el casco */
    const greebleDefs = [
        [1.75, 0.95, 'cyl'], [-1.8, 0.75, 'cyl'], [1.35, -1.55, 'box'], [-1.45, -1.5, 'box'],
        [0.45, -2.15, 'cyl'], [-0.6, 2.0, 'box'], [2.0, -0.7, 'cyl'], [-2.05, -0.55, 'box'],
        [1.0, 1.9, 'box'], [-1.1, 1.85, 'cyl']
    ];
    greebleDefs.forEach(([x, z, kind], i) => {
        const g = kind === 'cyl'
            ? new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 10), i % 2 ? panelMat : darkMat)
            : new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.3), i % 2 ? darkMat : panelMat);
        g.position.set(x, 0.4, z);
        group.add(g);
    });

    /* Antena parabólica */
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 8), darkMat);
    stalk.position.set(-0.9, 0.85, -0.5);
    group.add(stalk);

    const dish = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.07, 18),
        new THREE.MeshStandardMaterial({
            color: 0xcac4b8,
            metalness: 0.4,
            roughness: 0.5,
            side: THREE.DoubleSide
        })
    );
    dish.position.set(-0.9, 1.15, -0.5);
    dish.rotation.x = -0.9;
    group.add(dish);

    /* Anillos de acoplamiento (lado izquierdo) */
    [-0.5, 0.5].forEach(z => {
        const dock = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), panelMat);
        dock.rotation.z = Math.PI / 2;
        dock.position.set(-2.55, 0, z);
        group.add(dock);
    });

    /* Luz de cabina */
    const shipLight = new THREE.PointLight(0xfff2d8, 1.3, 46, 1.6);
    shipLight.position.set(1.5, 3.4, 1.8);
    group.add(shipLight);

    /* Resplandor de motores */
    const engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x66c8ff,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    engineGlow.scale.setScalar(5);
    engineGlow.position.z = -3.0;
    group.add(engineGlow);

    const engineFlame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xbfe8ff,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    engineFlame.scale.setScalar(2.6);
    engineFlame.position.z = -3.4;
    group.add(engineFlame);

    const engineLight = new THREE.PointLight(0x66c8ff, 0.9, 18);
    engineLight.position.set(0, 0, -3);
    group.add(engineLight);

    return { group, engineFlame, engineGlow };
}

/* Estela (por nave) */
const TRAIL_MAX = 110;

function resetTrail(rig) {
    rig.trailPoints.length = 0;
    rig.trailPoints.push(rig.group.position.clone());
    rebuildTrail(rig);
}

function rebuildTrail(rig) {
    if (rig.trailLine) {
        effectsGroup.remove(rig.trailLine);
        disposeObject(rig.trailLine);
        rig.trailLine = null;
    }
    if (rig.trailPoints.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(rig.trailPoints);
    const mat = new THREE.LineBasicMaterial({
        color: rig.trailColor,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    rig.trailLine = new THREE.Line(geo, mat);
    effectsGroup.add(rig.trailLine);
}

/* ───────────────────────── Base y portal ───────────────────────── */

let baseMarker = null;
let portal = null;
let portalGlow = null;
let portalRingInner = null;

/* ───────────────────── Modelos de estación espacial ───────────────────── */

function stationHull() {
    return new THREE.MeshStandardMaterial({ color: 0x8d99ad, metalness: 0.8, roughness: 0.46 });
}

function stationDark() {
    return new THREE.MeshStandardMaterial({ color: 0x222b3a, metalness: 0.7, roughness: 0.5 });
}

function stationAccent(colorHex, intensity) {
    return new THREE.MeshStandardMaterial({
        color: 0x0f1724,
        emissive: colorHex,
        emissiveIntensity: (intensity === undefined ? 1.0 : intensity) * 0.55,
        metalness: 0.45,
        roughness: 0.4
    });
}

function enableShadows(obj) {
    obj.traverse(o => {
        if (o.isMesh && !(o.material && o.material.transparent)) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
}

function makeBeacon(colorHex) {
    return new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), stationAccent(colorHex, 1.6));
}

function makeSolarWing(colorHex, span) {
    const wing = new THREE.Group();

    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(span, 0.06, 1.5),
        new THREE.MeshStandardMaterial({
            color: 0x0d2c52,
            emissive: 0x1a4d86,
            emissiveIntensity: 0.3,
            metalness: 0.55,
            roughness: 0.45
        })
    );
    wing.add(panel);

    for (let i = -2; i <= 2; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 1.56), stationAccent(colorHex, 0.6));
        rib.position.x = i * span * 0.2;
        wing.add(rib);
    }

    const spine = new THREE.Mesh(new THREE.BoxGeometry(span + 0.4, 0.1, 0.12), stationAccent(colorHex, 0.9));
    wing.add(spine);

    return wing;
}

function makeHabitatRing(radius, tube, colorHex, spokes) {
    const ring = new THREE.Group();

    ring.add(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 72), stationHull()));

    ring.add(new THREE.Mesh(
        new THREE.TorusGeometry(radius + tube * 0.75, tube * 0.4, 8, 72),
        stationAccent(colorHex, 1.1)
    ));

    ring.add(new THREE.Mesh(
        new THREE.TorusGeometry(radius - tube * 0.75, tube * 0.35, 8, 72),
        stationAccent(colorHex, 0.7)
    ));

    for (let i = 0; i < spokes; i++) {
        const arm = new THREE.Group();
        arm.rotation.z = (i / spokes) * Math.PI * 2;

        const spoke = new THREE.Mesh(
            new THREE.CylinderGeometry(tube * 0.4, tube * 0.4, radius * 0.95, 8),
            stationDark()
        );
        spoke.rotation.z = Math.PI / 2;
        spoke.position.x = radius * 0.475;
        arm.add(spoke);

        const pod = new THREE.Mesh(new THREE.SphereGeometry(tube * 1.6, 12, 10), stationAccent(colorHex, 0.9));
        pod.position.x = radius * 0.78;
        arm.add(pod);

        const portLight = new THREE.Mesh(new THREE.BoxGeometry(tube * 0.5, tube * 1.2, tube * 2.4), stationAccent(colorHex, 1.4));
        portLight.position.x = radius;
        arm.add(portLight);

        ring.add(arm);
    }

    return ring;
}

function makeAntenna(height, colorHex) {
    const mast = new THREE.Group();

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, height, 8), stationDark());
    pole.position.y = height / 2;
    mast.add(pole);

    const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        stationHull()
    );
    dish.rotation.x = -Math.PI / 2.4;
    dish.position.y = height * 0.62;
    mast.add(dish);

    const tip = makeBeacon(colorHex);
    tip.position.y = height;
    mast.add(tip);

    return mast;
}

function buildDestroyerHull() {
    const sb = 14;      /* semiancho casco inferior (popa) */
    const st = 12.4;    /* semiancho casco superior (popa) */
    const yb = -1.8;    /* quilla */
    const ys = 2.1;     /* cubierta superior en popa */
    const ybow = 1.0;   /* proa (cubierta baja) */
    const zStern = -18;
    const zBow = 26;

    const v = [
        [-sb, yb, zStern], [sb, yb, zStern], [0, yb, zBow],
        [-st, ys, zStern], [st, ys, zStern], [0, ybow, zBow]
    ];
    const idx = [
        0, 1, 2,
        3, 5, 4,
        0, 4, 1, 0, 3, 4,
        0, 2, 5, 0, 5, 3,
        1, 5, 2, 1, 4, 5
    ];
    const pos = [];
    idx.forEach(i => pos.push(v[i][0], v[i][1], v[i][2]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
}

function sdRand(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function createBase() {
    baseMarker = new THREE.Group();
    const colorHex = 0x00ffcc;
    const rand = sdRand(20251009);

    const topY = z => 2.1 - 1.1 * (z + 18) / 44;
    const topW = z => 12.4 * Math.max(0, 26 - z) / 44;
    const botW = z => 14 * Math.max(0, 26 - z) / 44;
    const slope = Math.atan(1.1 / 44);

    const hullMat = new THREE.MeshStandardMaterial({
        color: 0xb0b6bf, metalness: 0.55, roughness: 0.55, flatShading: true
    });
    const plateMats = [0xbdc2ca, 0xa8aeb8, 0x969ca8, 0xc6cbd2, 0x9ea4ae].map(c =>
        new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.55, flatShading: true }));
    const plateDarkMats = [0x8b909a, 0x7d838e, 0x868c96].map(c =>
        new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.6, flatShading: true }));
    const darkMat = stationDark();
    const glowAmber = new THREE.MeshBasicMaterial({ color: 0xffa64d });
    const glowWhite = new THREE.MeshBasicMaterial({ color: 0xbfe9ff });
    const glowDot = new THREE.MeshBasicMaterial({ color: 0xcfe8ff });

    const addBox = (w, h, d, mat, x, y, z, rx) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        baseMarker.add(m);
        return m;
    };

    /* ── Casco en cuña (proa hacia afuera, +z) ── */
    baseMarker.add(new THREE.Mesh(buildDestroyerHull(), hullMat));

    /* ── Placas de cubierta superior (greebling determinista) ── */
    for (let z = -16.5; z < 24;) {
        const len = 1.6 + rand() * 4.2;
        const wMax = topW(z + len / 2) * 0.92;
        let x = -wMax;
        while (x < wMax - 0.4) {
            const w = Math.min(1.0 + rand() * 3.2, wMax - x);
            if (rand() > 0.22) {
                const th = 0.05 + rand() * 0.1;
                addBox(w, th, len, plateMats[Math.floor(rand() * plateMats.length)],
                    x + w / 2, topY(z + len / 2) + th / 2 + 0.015, z + len / 2, slope);
            }
            x += w + 0.25 + rand() * 0.9;
        }
        z += len + 0.35 + rand() * 0.7;
    }

    /* Placas del casco inferior (más grandes, tonos oscuros) */
    for (let z = -14; z < 22;) {
        const len = 2.5 + rand() * 4.5;
        const wMax = botW(z + len / 2) * 0.85;
        const w = Math.min(3 + rand() * 6, wMax * 2);
        const th = 0.05 + rand() * 0.08;
        addBox(w, th, len, plateDarkMats[Math.floor(rand() * plateDarkMats.length)],
            (rand() - 0.5) * Math.max(0, wMax * 2 - w), -1.8 - th / 2 - 0.01, z + len / 2);
        z += len + 0.5 + rand();
    }

    /* Lomo dorsal elevado */
    addBox(1.7, 0.32, 13, hullMat, 0, topY(-3) + 0.16, -3, slope);
    addBox(0.9, 0.14, 12, darkMat, 0, topY(-3) + 0.34, -3, slope);

    /* Borde de quina con luces de navegación (ambos flancos) */
    [-1, 1].forEach(s => {
        for (let z = -16; z < 22.5; z += 3) {
            const zc = z + 1.5;
            addBox(0.32, 0.16, 3.05, plateMats[3], s * (topW(zc) - 0.12), topY(zc) + 0.09, zc, slope);
            if (Math.floor(z / 3) % 2 === 0) {
                addBox(0.1, 0.1, 0.12, glowDot, s * (topW(zc) + 0.1), topY(zc) + 0.14, zc);
            }
        }
    });

    /* ── Baterías antiaéreas gemelas (turbolasers) en los flancos ── */
    [-8.5, -3, 2.5, 8].forEach(z => {
        [-1, 1].forEach(s => {
            const grp = new THREE.Group();
            grp.position.set(s * (topW(z) - 1.1), topY(z) + 0.22, z);
            const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.38, 1.4), darkMat);
            grp.add(base);
            [-0.3, 0.3].forEach(dz => {
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.35, 8), darkMat);
                barrel.rotation.z = s > 0 ? (-Math.PI / 2 + 0.35) : (Math.PI / 2 - 0.35);
                barrel.position.set(s * 0.68, 0.26, dz);
                grp.add(barrel);
                const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glowDot);
                muzzle.position.set(s * 1.24, 0.48, dz);
                grp.add(muzzle);
            });
            baseMarker.add(grp);
        });
    });

    /* Proa escalonada + domo de sensores */
    [20.5, 22.6, 24.3].forEach((z, i) => {
        const w = topW(z) * (1.5 - i * 0.35);
        addBox(w, 0.14, 1.7, plateMats[3], 0, topY(z) + 0.09, z, slope);
    });
    const sensorDome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), hullMat);
    sensorDome.position.set(0, topY(17) + 0.42, 17);
    baseMarker.add(sensorDome);

    /* ── Superestructura multi-nivel ── */
    addBox(9.2, 0.9, 10.5, hullMat, 0, 2.55, -11.5);
    addBox(7.4, 0.8, 8.6, plateMats[0], 0, 3.35, -11.8);
    addBox(5.6, 0.7, 6.8, plateMats[1], 0, 4.05, -12.2);

    /* Cuerpo de la torre con pods de turbolift */
    addBox(3.6, 2.5, 3.8, hullMat, 0, 5.55, -12.6);
    [-2.15, 2.15].forEach(x => {
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.9, 12), plateMats[1]);
        pod.position.set(x, 5.5, -12.6);
        baseMarker.add(pod);
        addBox(0.2, 2.2, 0.2, darkMat, x, 5.5, -11.0);
    });

    /* Puente de mando con ala frontal y ventanas */
    addBox(6.6, 1.15, 2.4, hullMat, 0, 7.35, -12.9);
    addBox(4.2, 0.5, 1.3, plateMats[0], 0, 7.35, -11.4);
    addBox(5.4, 0.3, 2.0, plateMats[3], 0, 8.05, -12.9);
    addBox(5.6, 0.38, 0.12, glowWhite, 0, 7.4, -11.72);
    [-1, 1].forEach(s => addBox(0.12, 0.3, 1.5, glowWhite, s * 3.32, 7.4, -12.9));

    /* Torres de escudo sobre mástil */
    [-1.75, 1.75].forEach(x => {
        addBox(0.18, 0.55, 0.18, darkMat, x, 8.45, -12.9);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), plateMats[3]);
        dome.position.set(x, 9.15, -12.9);
        baseMarker.add(dome);
        addBox(1.2, 0.12, 1.2, darkMat, x, 8.62, -12.9);
    });

    /* Antenas y radares tras el puente */
    [-1.5, -0.5, 0.5, 1.5].forEach((x, i) => {
        addBox(0.07, 1.1 + (i % 2) * 0.7, 0.07, darkMat, x, 8.6 + (i % 2) * 0.35, -14.1);
        if (i % 2 === 0) addBox(0.12, 0.12, 0.12, glowDot, x, 9.2 + (i % 2) * 0.7, -14.1);
    });
    [-1.1, 1.1].forEach(x => {
        const dish = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), plateMats[3]);
        dish.rotation.x = -Math.PI / 3;
        dish.position.set(x, 8.7, -14.6);
        baseMarker.add(dish);
    });

    /* Ventanas laterales de la torre */
    [-1, 1].forEach(s => {
        for (let i = 0; i < 4; i++) {
            addBox(0.08, 0.14, 0.55, glowWhite, s * 1.82, 5.1 + (i % 2) * 0.9, -13.6 + i * 0.62);
        }
    });

    /* Hangares laterales en la cubierta de la superestructura */
    [-1, 1].forEach(s => {
        addBox(1.9, 0.9, 3.2, darkMat, s * 4.5, 2.5, -11.5);
        addBox(0.12, 0.6, 2.6, glowAmber, s * 3.62, 2.5, -11.5);
    });

    /* ── Hangar ventral principal con estructura interna ── */
    addBox(6.8, 0.35, 8.8, darkMat, 0, -1.78, -6.5);
    addBox(5.2, 0.4, 7.2, glowAmber, 0, -1.83, -6.5);
    [-8.2, -6.5, -4.8].forEach(z => addBox(5.2, 0.42, 0.35, darkMat, 0, -1.84, z));
    [-2.0, 2.0].forEach(x => addBox(0.3, 0.42, 7.2, darkMat, x, -1.84, -6.5));

    /* Hangares secundarios */
    [[-3.6, 1.5], [3.6, 1.5], [-2.9, 7.5], [2.9, 7.5]].forEach(([x, z]) => {
        addBox(1.5, 0.24, 2.4, darkMat, x, -1.76, z);
        addBox(1.1, 0.26, 1.9, glowAmber, x, -1.78, z);
    });

    /* Cresta ventral con canal iluminado */
    addBox(1.3, 0.5, 17, darkMat, 0, -1.95, 9);
    addBox(0.45, 0.52, 16, new THREE.MeshBasicMaterial({ color: 0x1a4d86 }), 0, -1.97, 9);

    /* ── Grupo de motores (3 grandes + 4 pequeños) con rima y aletas ── */
    const engineFlames = [];
    const engines = [
        { x: -4.8, y: -0.4, r: 1.6 }, { x: 0, y: -0.4, r: 1.6 }, { x: 4.8, y: -0.4, r: 1.6 },
        { x: -7.2, y: 1.3, r: 0.75 }, { x: -2.4, y: 1.5, r: 0.75 },
        { x: 2.4, y: 1.5, r: 0.75 }, { x: 7.2, y: 1.3, r: 0.75 }
    ];
    engines.forEach(e => {
        const housing = new THREE.Mesh(
            new THREE.CylinderGeometry(e.r, e.r * 1.12, 1.5, 20), darkMat);
        housing.rotation.x = Math.PI / 2;
        housing.position.set(e.x, e.y, -18.55);
        baseMarker.add(housing);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(e.r * 1.02, 0.13, 8, 24), plateMats[1]);
        rim.position.set(e.x, e.y, -19.25);
        baseMarker.add(rim);

        const inner = new THREE.Mesh(
            new THREE.CircleGeometry(e.r * 0.85, 20),
            new THREE.MeshBasicMaterial({ color: 0xe8f6ff }));
        inner.rotation.y = Math.PI;
        inner.position.set(e.x, e.y, -19.3);
        baseMarker.add(inner);

        const disc = new THREE.Mesh(
            new THREE.CircleGeometry(e.r * 0.62, 18),
            new THREE.MeshBasicMaterial({ color: 0x66bfff }));
        disc.rotation.y = Math.PI;
        disc.position.set(e.x, e.y, -19.32);
        baseMarker.add(disc);

        if (e.r > 1) {
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * Math.PI * 2;
                addBox(0.14, 0.5, 0.9, darkMat,
                    e.x + Math.cos(a) * e.r * 1.25, e.y + Math.sin(a) * e.r * 1.25, -18.5);
            }
            const flameOut = new THREE.Mesh(
                new THREE.ConeGeometry(e.r * 0.78, 3.4, 14, 1, true),
                new THREE.MeshBasicMaterial({
                    color: 0x3f8fd9, transparent: true, opacity: 0.4,
                    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
                }));
            flameOut.rotation.x = -Math.PI / 2;
            flameOut.position.set(e.x, e.y, -21.3);
            baseMarker.add(flameOut);
            engineFlames.push(flameOut);

            const flameIn = new THREE.Mesh(
                new THREE.ConeGeometry(e.r * 0.4, 2.3, 12, 1, true),
                new THREE.MeshBasicMaterial({
                    color: 0xcfeaff, transparent: true, opacity: 0.7,
                    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
                }));
            flameIn.rotation.x = -Math.PI / 2;
            flameIn.position.set(e.x, e.y, -20.7);
            baseMarker.add(flameIn);
            engineFlames.push(flameIn);
        }
    });

    /* Divisores verticales del banco de motores + rejilla de popa */
    [-8.4, -6.0, -3.6, -1.2, 1.2, 3.6, 6.0, 8.4].forEach(x => {
        addBox(0.18, 3.3, 0.7, darkMat, x, 0.1, -18.45);
    });
    addBox(18.5, 0.25, 0.5, plateMats[1], 0, 1.95, -18.4);

    const engineLight = new THREE.PointLight(0x77ccff, 1.5, 44);
    engineLight.position.set(0, 0.2, -20.5);
    baseMarker.add(engineLight);

    /* ── Pasillo de aterrizaje dorsal (luces de guía) ── */
    [-2.6, 2.6].forEach(x => {
        const strip = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.06, 16),
            stationAccent(colorHex, 1.4)
        );
        strip.position.set(x, (topY(4) + topY(20)) / 2 + 0.22, 12);
        strip.rotation.x = slope;
        baseMarker.add(strip);
    });

    const beacons = [];
    [
        [-3.2, 5], [3.2, 5], [-2.0, 19], [2.0, 19],
        [-12.5, -17], [12.5, -17], [0, 25]
    ].forEach(([x, z]) => {
        const beacon = makeBeacon(colorHex);
        beacon.position.set(x, topY(z) + 0.5, z);
        baseMarker.add(beacon);
        beacons.push(beacon);
    });

    const label = makeLabelSprite('BASE DE CONTROL', '#00ffcc');
    label.position.y = 11.5;
    label.scale.set(18, 4.5, 1);
    baseMarker.add(label);

    baseMarker.userData.beacons = beacons;
    baseMarker.userData.engineFlames = engineFlames;

    baseMarker.position.copy(BASE_POSITION);
    baseMarker.position.y -= 2.5;
    scene.add(baseMarker);
}

function createPortal() {
    portal = new THREE.Group();
    const colorHex = 0xb44bff;
    const rand = sdRand(761977);

    const hullMat = new THREE.MeshStandardMaterial({
        color: 0xb9bec6, metalness: 0.55, roughness: 0.55, flatShading: true
    });
    const plateMats = [0xc3c8d0, 0xa9aeb8, 0x9aa0aa, 0xb2b7c0].map(c =>
        new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.55, flatShading: true }));
    const darkMat = stationDark();
    const glowWin = new THREE.MeshBasicMaterial({ color: 0xd9c2ff });
    const glowDot = new THREE.MeshBasicMaterial({ color: 0xcfb8ff });
    const glowAmber = new THREE.MeshBasicMaterial({ color: 0xffa64d });
    const accentMat = stationAccent(colorHex, 1.2);

    const addBox = (w, h, d, mat, x, y, z, rx) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        portal.add(m);
        return m;
    };
    const addTurret = (x, y, z) => {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.24, 10), darkMat);
        base.position.set(x, y, z);
        portal.add(base);
        addBox(0.5, 0.22, 0.42, plateMats[2], x, y + 0.2, z);
        [-0.14, 0.14].forEach(dx => {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.9, 6), darkMat);
            b.rotation.x = Math.PI / 2 - 0.22;
            b.position.set(x + dx, y + 0.34, z + 0.42);
            portal.add(b);
        });
    };
    const engineFlames = [];
    const beacons = [];

    /* ══ MÓDULO DE MANDO (proa, +z) ══ */
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), hullMat);
    bulb.scale.set(1.15, 0.85, 1.5);
    bulb.position.set(0, 0, 13.4);
    portal.add(bulb);

    /* Bandas ecuatoriales del bulbo */
    [12.6, 13.4, 14.2].forEach(z => {
        const band = new THREE.Mesh(new THREE.TorusGeometry(1.92, 0.06, 6, 36), plateMats[2]);
        band.position.set(0, 0, z);
        portal.add(band);
    });

    /* Placas facetadas sobre el bulbo */
    for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2;
        const px = Math.cos(a) * 1.42;
        const py = Math.sin(a) * 1.05;
        const p = addBox(0.4 + rand() * 0.7, 0.08, 0.5 + rand() * 0.9,
            plateMats[Math.floor(rand() * 4)], px, py, 12.2 + rand() * 2.4);
        p.rotation.z = a - Math.PI / 2;
    }

    /* Puente en martillo */
    addBox(4.6, 0.85, 1.5, hullMat, 0, 0.15, 15.7);
    addBox(4.2, 0.12, 1.2, plateMats[0], 0, 0.62, 15.7);
    addBox(3.8, 0.1, 1.3, darkMat, 0, -0.32, 15.7);
    [-2.3, 2.3].forEach(x => {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), plateMats[0]);
        cap.position.set(x, 0.15, 15.7);
        portal.add(cap);
        const capDish = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), plateMats[2]);
        capDish.rotation.x = -Math.PI / 2.2;
        capDish.position.set(x, 0.15, 16.25);
        portal.add(capDish);
        const nav = makeBeacon(colorHex);
        nav.position.set(x > 0 ? 2.58 : -2.58, 0.15, 15.7);
        portal.add(nav);
        beacons.push(nav);
    });
    addBox(3.9, 0.3, 0.1, glowWin, 0, 0.2, 16.48);
    [-1, 1].forEach(s => addBox(0.1, 0.26, 1.05, glowWin, s * 2.32, 0.2, 15.7));
    for (let i = 0; i < 5; i++) {
        addBox(0.16, 0.1, 0.22, glowDot, -1.6 + i * 0.8, 0.72, 15.3 + (i % 2) * 0.5);
    }

    /* Sensores, mástiles y torreta dorsal del bulbo */
    const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), plateMats[2]);
    dish.rotation.x = -Math.PI / 3;
    dish.position.set(0.7, 1.25, 13.8);
    portal.add(dish);
    addBox(0.07, 1.3, 0.07, darkMat, -0.6, 1.5, 13.2);
    addBox(0.05, 0.9, 0.05, darkMat, -0.95, 1.3, 13.5);
    const tipBeacon = makeBeacon(colorHex);
    tipBeacon.position.set(-0.6, 2.2, 13.2);
    portal.add(tipBeacon);
    beacons.push(tipBeacon);
    addTurret(0, 1.48, 12.3);

    /* Sensores laterales y agarres ventrales */
    [-1, 1].forEach(s => {
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.8, 8), plateMats[1]);
        pod.rotation.z = Math.PI / 2;
        pod.position.set(s * 1.95, -0.35, 14.1);
        portal.add(pod);
        addBox(0.1, 0.12, 0.12, glowDot, s * 2.4, -0.35, 14.1);
        addBox(0.5, 0.42, 1.3, plateMats[1], s * 1.95, -0.25, 13.0);
    });
    [-0.8, 0.8].forEach(x => {
        const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 8), darkMat);
        clamp.position.set(x, -1.35, 13.4);
        portal.add(clamp);
    });
    const dockRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 6, 24), accentMat);
    dockRing.rotation.x = Math.PI / 2;
    dockRing.position.set(0, -1.5, 13.4);
    portal.add(dockRing);

    /* Cuello de unión bulbo-lomo */
    addBox(1.35, 1.1, 1.6, hullMat, 0, 0.35, 11.4);
    [10.9, 11.4, 11.9].forEach(z => addBox(1.55, 0.12, 0.18, darkMat, 0, 0.35, z));

    /* ══ LOMO DE CELOSÍA (espinazo dorsal) ══ */
    addBox(1.15, 0.85, 13.5, hullMat, 0, 0.75, 5.2);
    [-0.65, 0.65].forEach(x => addBox(0.1, 0.55, 13.5, plateMats[1], x, 0.75, 5.2));
    for (let z = -0.5; z < 11.5; z += 1.5) {
        addBox(1.5, 0.12, 0.22, darkMat, 0, 1.18, z);
    }
    addBox(0.55, 0.5, 13, darkMat, 0, -0.55, 5.4);
    [1, 5, 9].forEach(z => {
        [-0.45, 0.45].forEach(x => addBox(0.14, 1.0, 0.14, darkMat, x, 0.1, z));
    });
    [-0.74, 0.74].forEach(x => addBox(0.08, 0.14, 12.4, accentMat, x, 0.42, 5.5));

    /* Celosía diagonal en los flancos del lomo */
    let latK = 0;
    for (let z = -0.4; z < 11.2; z += 1.6) {
        [-1, 1].forEach(s => {
            const diag = addBox(0.09, 0.09, 1.75, darkMat, s * 0.6, 0.42, z + 0.75);
            diag.rotation.x = (latK % 2 ? 0.62 : -0.62);
        });
        latK++;
    }

    /* Tuberías de servicio bajo el lomo */
    [-0.22, 0.22].forEach(x => {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 12.6, 8), darkMat);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(x, -0.28, 5.4);
        portal.add(pipe);
    });

    /* Luces de guía y greebles en el lomo */
    for (let z = 0; z < 11.5; z += 1.7) {
        [-0.7, 0.7].forEach(x => addBox(0.09, 0.09, 0.14, glowDot, x, 0.2, z));
    }
    for (let i = 0; i < 8; i++) {
        addBox(0.28 + rand() * 0.5, 0.18, 0.5 + rand() * 1.0, darkMat,
            (rand() - 0.5) * 0.7, 1.28, rand() * 11);
    }
    [2.5, 7.5].forEach(z => {
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), darkMat);
        vent.position.set(0.3, 1.45, z);
        portal.add(vent);
    });
    addTurret(0, 1.25, 1.8);
    addTurret(0, 1.25, 8.6);

    /* ══ BLOQUE DE INGENIERÍA (popa, -z) ══ */
    addBox(5.2, 2.8, 8.5, hullMat, 0, 0, -9.5);
    addBox(4.0, 1.2, 6.5, plateMats[0], 0, 1.9, -10);
    addBox(3.2, 0.5, 5.0, plateMats[2], 0, 2.7, -10.2);

    /* Placas del casco de ingeniería */
    for (let i = 0; i < 20; i++) {
        addBox(0.5 + rand() * 1.3, 0.06 + rand() * 0.09, 0.5 + rand() * 1.4,
            plateMats[Math.floor(rand() * 4)],
            (rand() - 0.5) * 2.8, 2.98, -8.0 - rand() * 4.4);
    }
    for (let i = 0; i < 12; i++) {
        addBox(0.6 + rand() * 1.2, 0.08, 0.5 + rand() * 1.3, plateMats[Math.floor(rand() * 4)],
            (rand() > 0.5 ? 1 : -1) * (1.9 + rand() * 0.6), 1.46, -6.2 - rand() * 6.6);
    }
    /* Placas laterales en las caras ±x del bloque principal */
    [-1, 1].forEach(s => {
        for (let i = 0; i < 8; i++) {
            addBox(0.08, 0.4 + rand() * 0.8, 0.6 + rand() * 1.5,
                plateMats[Math.floor(rand() * 4)], s * 2.63,
                -1.0 + rand() * 1.8, -6.2 - rand() * 6.5);
        }
    });

    /* Radiadores laterales */
    [-1, 1].forEach(s => {
        for (let i = 0; i < 4; i++) {
            addBox(0.14, 0.16, 5.6, darkMat, s * 2.72, -0.95 + i * 0.52, -9.5);
        }
        addBox(0.07, 0.14, 6.0, accentMat, s * 2.7, 1.05, -9.5);
    });

    /* Aletas laterales con baterías gemelas */
    [-1, 1].forEach(s => {
        addBox(1.5, 1.0, 3.2, plateMats[1], s * 3.2, -0.3, -8.5);
        addBox(1.2, 0.14, 2.6, plateMats[3], s * 3.2, 0.24, -8.5);
        [-8.85, -8.15].forEach(dz => {
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 8), darkMat);
            barrel.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
            barrel.position.set(s * 4.4, -0.1, dz);
            portal.add(barrel);
        });
        addBox(0.3, 0.3, 0.7, darkMat, s * 3.75, -0.1, -8.5);
        const sDome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), plateMats[2]);
        sDome.position.set(s * 3.4, 0.55, -7.6);
        portal.add(sDome);
        addBox(0.1, 0.12, 0.14, glowWin, s * 5.0, -0.1, -8.5);
    });

    /* Aletón de comunicaciones + balizas */
    addBox(0.45, 3.4, 2.2, hullMat, 0, 4.2, -11.3);
    addBox(0.6, 3.0, 0.14, darkMat, 0.3, 4.2, -11.3);
    addBox(0.9, 0.3, 1.6, plateMats[2], 0, 5.9, -11.3);
    addBox(0.06, 1.1, 0.06, darkMat, 0, 6.5, -11.3);
    addBox(0.05, 0.8, 0.05, darkMat, 0.22, 6.35, -11.5);
    const finBeacon = makeBeacon(colorHex);
    finBeacon.position.set(0, 7.1, -11.3);
    portal.add(finBeacon);
    beacons.push(finBeacon);

    /* Bosque de antenas y radares en la cubierta superior */
    [-1.5, -0.5, 0.6, 1.6].forEach((x, i) => {
        addBox(0.06, 0.9 + (i % 2) * 0.6, 0.06, darkMat, x, 3.4 + (i % 2) * 0.3, -12.9);
        if (i % 2 === 0) addBox(0.1, 0.1, 0.1, glowDot, x, 3.9 + (i % 2) * 0.6, -12.9);
    });
    [-1.2, 1.2].forEach(x => {
        const d = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), plateMats[3]);
        d.rotation.x = -Math.PI / 3;
        d.position.set(x, 3.35, -9.0);
        portal.add(d);
        addBox(0.12, 0.45, 0.12, darkMat, x, 3.1, -9.0);
    });
    /* Rejillas de ventilación */
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
            addBox(0.5, 0.08, 0.14, darkMat, -0.8 + j * 0.55, 3.0, -11.6 - i * 0.4);
        }
    }
    addTurret(-1.4, 3.0, -7.6);
    addTurret(1.4, 3.0, -7.6);

    /* Hangar ventral con luces de aproximación */
    addBox(2.3, 0.3, 3.1, darkMat, 0, -1.5, -8);
    addBox(1.7, 0.32, 2.5, glowAmber, 0, -1.53, -8);
    addBox(2.6, 0.14, 0.3, plateMats[2], 0, -1.48, -6.35);
    for (let i = 0; i < 4; i++) {
        addBox(0.12, 0.1, 0.12, glowAmber, -0.75 + i * 0.5, -1.5, -5.9);
    }
    addBox(4.4, 0.16, 0.3, accentMat, 0, -1.45, -5.6);

    /* Muro de popa tras los motores */
    addBox(5.1, 2.7, 0.25, plateMats[1], 0, 0, -13.7);

    /* ══ GRUPO DE Motores (2 grandes + 2 pequeños) ══ */
    const engines = [
        { x: -1.55, y: -0.55, r: 1.35 }, { x: 1.55, y: -0.55, r: 1.35 },
        { x: 0, y: -0.55, r: 0.7 }, { x: 0, y: 1.35, r: 0.6 }
    ];
    engines.forEach(e => {
        const housing = new THREE.Mesh(
            new THREE.CylinderGeometry(e.r, e.r * 1.12, 1.3, 18), darkMat);
        housing.rotation.x = Math.PI / 2;
        housing.position.set(e.x, e.y, -14.15);
        portal.add(housing);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(e.r * 1.02, 0.12, 8, 22), plateMats[1]);
        rim.position.set(e.x, e.y, -14.75);
        portal.add(rim);

        const rim2 = new THREE.Mesh(new THREE.TorusGeometry(e.r * 1.14, 0.07, 6, 20), plateMats[2]);
        rim2.position.set(e.x, e.y, -13.75);
        portal.add(rim2);

        const inner = new THREE.Mesh(
            new THREE.CircleGeometry(e.r * 0.85, 18),
            new THREE.MeshBasicMaterial({ color: 0xe8ddff }));
        inner.rotation.y = Math.PI;
        inner.position.set(e.x, e.y, -14.8);
        portal.add(inner);

        const disc = new THREE.Mesh(
            new THREE.CircleGeometry(e.r * 0.6, 16),
            new THREE.MeshBasicMaterial({ color: 0x9b6bff }));
        disc.rotation.y = Math.PI;
        disc.position.set(e.x, e.y, -14.82);
        portal.add(disc);

        if (e.r > 1) {
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * Math.PI * 2;
                addBox(0.12, 0.42, 0.8, darkMat,
                    e.x + Math.cos(a) * e.r * 1.28, e.y + Math.sin(a) * e.r * 1.28, -14.1);
            }
            const flameOut = new THREE.Mesh(
                new THREE.ConeGeometry(e.r * 0.78, 3.0, 14, 1, true),
                new THREE.MeshBasicMaterial({
                    color: 0x7a4fd9, transparent: true, opacity: 0.42,
                    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
                }));
            flameOut.rotation.x = -Math.PI / 2;
            flameOut.position.set(e.x, e.y, -16.7);
            portal.add(flameOut);
            engineFlames.push(flameOut);

            const flameIn = new THREE.Mesh(
                new THREE.ConeGeometry(e.r * 0.4, 2.0, 12, 1, true),
                new THREE.MeshBasicMaterial({
                    color: 0xeadcff, transparent: true, opacity: 0.7,
                    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
                }));
            flameIn.rotation.x = -Math.PI / 2;
            flameIn.position.set(e.x, e.y, -16.1);
            portal.add(flameIn);
            engineFlames.push(flameIn);
        }
    });

    /* Divisores y bandas del banco de motores */
    [-2.6, -0.7, 0.7, 2.6].forEach(x => {
        addBox(0.16, 2.6, 0.55, darkMat, x, 0.1, -14.1);
    });
    addBox(5.0, 0.22, 0.45, plateMats[0], 0, 1.55, -14.05);
    addBox(5.0, 0.2, 0.4, plateMats[2], 0, -1.85, -14.0);
    [-2.2, 2.2].forEach(x => addBox(0.35, 0.35, 0.5, glowDot, x, 1.55, -14.3));

    const engineLight = new THREE.PointLight(0x8866ff, 1.3, 40);
    engineLight.position.set(0, 0, -16);
    portal.add(engineLight);

    portalGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xb44bff,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    portalGlow.scale.setScalar(14);
    portalGlow.position.set(0, 0.5, -5);
    portal.add(portalGlow);

    const label = makeLabelSprite('DESTINO FINAL', '#b44bff');
    label.position.y = 10;
    label.scale.set(16, 4, 1);
    portal.add(label);

    portal.userData.engineFlames = engineFlames;
    portal.userData.beacons = beacons;

    portal.position.copy(PORTAL_POSITION);
    scene.add(portal);
}

createBase();
createPortal();

/* ───────────────────────── Planetas (CodeGraph) ───────────────────────── */

function buildSolarSystem(graph) {
    clearGroup(planetsGroup);
    clearGroup(linksGroup);
    nodesMap.clear();

    const nodes = graph.nodes || [];
    const links = graph.links || [];
    const golden = Math.PI * (3 - Math.sqrt(5));

    nodes.forEach((node, i) => {
        const orbit = ORBIT_RADII[i % ORBIT_RADII.length];
        const angle = i * golden + (i % ORBIT_RADII.length) * 0.7;
        const y = (Math.random() - 0.5) * 4;

        const x = Math.cos(angle) * orbit;
        const z = Math.sin(angle) * orbit;
        const color = nodeColor(node.type);

        const planet = new THREE.Group();

        const size = 1.0 + (node.type === 2 ? 0.7 : node.type === 3 ? 0.35 : 0);
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(size, 28, 28),
            new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.35,
                metalness: 0.2,
                roughness: 0.6
            })
        );
        sphere.rotation.z = (Math.random() - 0.5) * 1.2;
        planet.add(sphere);

        if (i % 4 === 0) {
            const pRing = new THREE.Mesh(
                new THREE.RingGeometry(size * 1.5, size * 2.2, 48),
                new THREE.MeshBasicMaterial({
                    color: 0xcfd8e6,
                    transparent: true,
                    opacity: 0.45,
                    side: THREE.DoubleSide,
                    depthWrite: false
                })
            );
            pRing.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
            planet.add(pRing);
        }

        if (i % 3 === 0) {
            const atmo = new THREE.Mesh(
                new THREE.SphereGeometry(size * 1.18, 28, 28),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.28,
                    side: THREE.BackSide,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                })
            );
            planet.add(atmo);
        }

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        glow.scale.setScalar(4);
        planet.add(glow);

        planet.position.set(x, y, z);
        planetsGroup.add(planet);

        nodesMap.set(node.id, {
            id: node.id,
            planet,
            sphere,
            glow,
            baseGlow: 4,
            color,
            phase: Math.random() * Math.PI * 2,
            visited: false
        });
    });

    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x86cfff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    links.forEach(link => {
        const src = nodesMap.get(link.sourceId);
        const tgt = nodesMap.get(link.targetId);
        if (src && tgt) {
            const geo = new THREE.BufferGeometry().setFromPoints([
                src.planet.position,
                tgt.planet.position
            ]);
            linksGroup.add(new THREE.Line(geo, lineMaterial));
        }
    });

    addLog(`Sistema solar desplegado: ${nodes.length} cuerpos celestes.`);
}

/* ───────────────────────── Estaciones (objetivos sin planeta) ───────────────────────── */

function getOrCreateStation(key, name, colorHex) {
    if (stationsMap.has(key)) return stationsMap.get(key);

    const station = new THREE.Group();

    /* Núcleo habitacional (gira sobre su eje vertical) */
    const core = new THREE.Group();

    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 2.6, 20), stationHull());
    core.add(body);

    const domeTop = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        stationHull()
    );
    domeTop.position.y = 1.3;
    core.add(domeTop);

    const domeBottom = new THREE.Mesh(
        new THREE.SphereGeometry(1.35, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        stationHull()
    );
    domeBottom.position.y = -1.3;
    core.add(domeBottom);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 32), stationAccent(colorHex, 1.2));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.9;
    core.add(collar);

    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const moduleBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.7), stationDark());
        moduleBox.position.set(Math.cos(a) * 1.4, -0.3, Math.sin(a) * 1.4);
        moduleBox.lookAt(0, -0.3, 0);
        core.add(moduleBox);
    }

    station.add(core);

    /* Anillo orbital inclinado (gira en su propio plano) */
    const ring = new THREE.Group();
    ring.rotation.x = -Math.PI / 2.4;
    ring.add(makeHabitatRing(3.3, 0.2, colorHex, 3));
    station.add(ring);

    /* Paneles solares */
    const wingL = makeSolarWing(colorHex, 3.4);
    wingL.position.set(-3.1, 1.5, 0);
    station.add(wingL);

    const wingR = makeSolarWing(colorHex, 3.4);
    wingR.position.set(3.1, 1.5, 0);
    station.add(wingR);

    /* Baliza y antena */
    const beacon = makeBeacon(colorHex);
    beacon.position.y = 2.6;
    station.add(beacon);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: colorHex,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    glow.scale.setScalar(4.5);
    station.add(glow);

    const label = makeLabelSprite(name, '#' + colorHex.toString(16).padStart(6, '0'));
    label.position.y = 4.2;
    station.add(label);

    const angle = Math.random() * Math.PI * 2;
    const radius = 58 + Math.random() * 14;
    station.position.set(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 22,
        Math.sin(angle) * radius
    );

    stationsGroup.add(station);

    const entry = { station, core, ring, glow, color: colorHex, name, visited: false };
    stationsMap.set(key, entry);
    return entry;
}

/* ─────────────── Estructura de carpetas como bases espaciales ─────────────── */

const FOLDER_ZONE = new THREE.Vector3(0, 90, 0);
const folderBasesGroup = new THREE.Group();
scene.add(folderBasesGroup);

const folderBasesList = [];
let folderBaseCore = null;
let folderBasePath = '';

function folderTail(path) {
    const parts = String(path || '').split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

function disposeFolderBases() {
    while (folderBasesGroup.children.length > 0) {
        const child = folderBasesGroup.children[0];
        folderBasesGroup.remove(child);
        disposeObject(child);
    }
    folderBasesList.length = 0;
    folderBaseCore = null;
}

function buildFolderBase(name, colorHex, scale, variant) {
    const group = new THREE.Group();
    const core = new THREE.Group();
    const isDeathStar = variant === 'deathstar';
    const sRand = sdRand(isDeathStar ? 1977 : name.length * 977 + 13);

    const hullGray = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.45, roughness: 0.62 });
    const hullLight = new THREE.MeshStandardMaterial({ color: 0xb4bac2, metalness: 0.45, roughness: 0.6, flatShading: true });
    const hullMid = new THREE.MeshStandardMaterial({ color: 0x878d96, metalness: 0.45, roughness: 0.65, flatShading: true });
    const hullDark = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.5, roughness: 0.65 });
    const glowDot = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
    const glowWarm = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    let superlaser = null;

    if (isDeathStar) {
        const R = 5;
        core.add(new THREE.Mesh(new THREE.SphereGeometry(R, 40, 30), hullGray));

        /* Zanja ecuatorial con labios, luces y estructuras internas */
        core.add(new THREE.Mesh(
            new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.55, 56, 1, true), hullDark));
        [0.33, -0.33].forEach(y => {
            const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.06, 6, 56), hullLight);
            lip.rotation.x = Math.PI / 2;
            lip.position.y = y;
            core.add(lip);
        });
        for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            const dot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), i % 3 ? glowDot : glowWarm);
            dot.position.set(Math.cos(a) * (R + 0.09), i % 2 ? 0.14 : -0.14, Math.sin(a) * (R + 0.09));
            core.add(dot);
        }
        /* Hangares y módulos dentro de la zanja */
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + 0.15;
            const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.22), hullDark);
            slot.position.set(Math.cos(a) * (R - 0.02), 0, Math.sin(a) * (R - 0.02));
            slot.lookAt(0, 0, 0);
            core.add(slot);
            if (i % 2 === 0) {
                const bay = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.06),
                    new THREE.MeshBasicMaterial({ color: 0xffc36e }));
                bay.position.set(Math.cos(a) * (R + 0.05), 0, Math.sin(a) * (R + 0.05));
                bay.lookAt(0, 0, 0);
                core.add(bay);
            }
        }

        /* Estaciones sobre la banda ecuatorial (con mástiles) */
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.3;
            const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), hullLight);
            st.position.set(Math.cos(a) * (R + 0.16), 0.45, Math.sin(a) * (R + 0.16));
            st.lookAt(0, 0.45, 0);
            core.add(st);
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), hullDark);
            ant.position.set(Math.cos(a) * (R + 0.16), 0.85, Math.sin(a) * (R + 0.16));
            core.add(ant);
        }

        /* Zanjas meridianas (3 en total) */
        [0, Math.PI / 3, 2 * Math.PI / 3].forEach(rot => {
            const meridian = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.1, 6, 64), hullDark);
            meridian.rotation.y = Math.PI / 2 + rot;
            core.add(meridian);
        });

        /* Costuras de paneles (anillos de latitud) */
        [-0.75, -0.42, 0.42, 0.78].forEach(lat => {
            const seam = new THREE.Mesh(
                new THREE.TorusGeometry(R * Math.cos(lat), 0.045, 5, 56), hullDark);
            seam.rotation.x = Math.PI / 2;
            seam.position.y = R * Math.sin(lat);
            core.add(seam);
        });

        /* Placas de superficie: dispersas + bandas densas cerca del ecuador */
        const plateMatsDS = [hullLight, hullMid, hullGray];
        for (let i = 0; i < 58; i++) {
            const u = new THREE.Vector3(sRand() * 2 - 1, sRand() * 2 - 1, sRand() * 2 - 1).normalize();
            if (Math.abs(u.y) > 0.9) continue;
            const plate = new THREE.Mesh(
                new THREE.BoxGeometry(0.4 + sRand() * 1.2, 0.07, 0.4 + sRand() * 1.2),
                plateMatsDS[Math.floor(sRand() * 3)]);
            plate.position.copy(u).multiplyScalar(R + 0.04);
            plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
            core.add(plate);
        }
        for (let i = 0; i < 26; i++) {
            const a = sRand() * Math.PI * 2;
            const lat = (sRand() - 0.5) * 0.5;
            const u = new THREE.Vector3(Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat));
            const plate = new THREE.Mesh(
                new THREE.BoxGeometry(0.35 + sRand() * 0.8, 0.09, 0.5 + sRand() * 1.0),
                plateMatsDS[Math.floor(sRand() * 3)]);
            plate.position.copy(u).multiplyScalar(R + 0.05);
            plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
            core.add(plate);
        }
        /* Paneles oscuros (recesos) */
        for (let i = 0; i < 12; i++) {
            const u = new THREE.Vector3(sRand() * 2 - 1, sRand() * 2 - 1, sRand() * 2 - 1).normalize();
            if (Math.abs(u.y) > 0.85) continue;
            const rec = new THREE.Mesh(
                new THREE.BoxGeometry(0.7 + sRand() * 1.0, 0.05, 0.7 + sRand() * 1.0), hullDark);
            rec.position.copy(u).multiplyScalar(R + 0.03);
            rec.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
            core.add(rec);
        }

        /* Torres defensivas (bultos radiales) */
        for (let i = 0; i < 14; i++) {
            const u = new THREE.Vector3(sRand() * 2 - 1, (sRand() - 0.5) * 1.4, sRand() * 2 - 1).normalize();
            const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.3, 6), hullDark);
            turret.position.copy(u).multiplyScalar(R + 0.12);
            turret.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
            core.add(turret);
        }

        /* Luces de superficie: dispersas + clústeres urbanos */
        for (let i = 0; i < 40; i++) {
            const u = new THREE.Vector3(sRand() * 2 - 1, sRand() * 2 - 1, sRand() * 2 - 1).normalize();
            if (Math.abs(u.y) > 0.94) continue;
            const dot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), i % 4 ? glowDot : glowWarm);
            dot.position.copy(u).multiplyScalar(R + 0.08);
            core.add(dot);
        }
        for (let c = 0; c < 7; c++) {
            const cu = new THREE.Vector3(sRand() * 2 - 1, (sRand() - 0.5) * 1.6, sRand() * 2 - 1).normalize();
            for (let j = 0; j < 6; j++) {
                const off = new THREE.Vector3(sRand() - 0.5, sRand() - 0.5, sRand() - 0.5).multiplyScalar(0.22);
                const dot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07),
                    j % 3 ? glowWarm : glowDot);
                dot.position.copy(cu).add(off).normalize().multiplyScalar(R + 0.08);
                core.add(dot);
            }
        }

        /* Complejos polares */
        const platN = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.18, 12), hullLight);
        platN.position.set(0, R + 0.08, 0);
        core.add(platN);
        [-0.28, 0.28].forEach(x => {
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), hullMid);
            dome.position.set(x, R + 0.25, 0.15);
            core.add(dome);
        });
        const antN = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.8, 6), hullDark);
        antN.position.set(0.1, R + 0.55, -0.2);
        core.add(antN);
        const antS = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.6, 6), hullDark);
        antS.position.set(0, -R - 0.25, 0);
        core.add(antS);

        /* Plato superláser (cráter elevado, hemisferio norte) */
        const dir = new THREE.Vector3(0.55, 0.72, 0.42).normalize();
        const dishGroup = new THREE.Group();
        dishGroup.position.copy(dir).multiplyScalar(R + 1.55);
        dishGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
        const bowl = new THREE.Mesh(
            new THREE.SphereGeometry(1.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.1),
            new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.4, roughness: 0.7, side: THREE.BackSide }));
        dishGroup.add(bowl);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.1, 8, 36), hullLight);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.86;
        dishGroup.add(rim);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.58, 1.72, 0.5, 24, 1, true), hullMid);
        collar.position.y = 1.05;
        dishGroup.add(collar);
        [0.55, 0.9].forEach((yy, idx) => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(idx ? 0.9 : 0.55, 0.05, 6, 28), hullDark);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = yy;
            dishGroup.add(ring);
        });
        superlaser = new THREE.Mesh(
            new THREE.CircleGeometry(0.38, 20),
            new THREE.MeshBasicMaterial({ color: 0x3aff7a, transparent: true, opacity: 0.7 }));
        superlaser.rotation.x = Math.PI / 2;
        superlaser.position.y = 0.36;
        dishGroup.add(superlaser);
        const laserGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture, color: 0x3aff7a, transparent: true, opacity: 0.55,
            depthWrite: false, blending: THREE.AdditiveBlending
        }));
        laserGlow.scale.setScalar(1.6);
        laserGlow.position.y = 0.5;
        dishGroup.add(laserGlow);
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), hullDark);
            strut.position.set(Math.cos(a) * 0.98, 0.5, Math.sin(a) * 0.98);
            strut.rotation.z = Math.cos(a) * 0.55;
            strut.rotation.x = -Math.sin(a) * 0.55;
            dishGroup.add(strut);
            const node = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5),
                new THREE.MeshBasicMaterial({ color: 0x3aff7a }));
            node.position.set(Math.cos(a) * 1.38, 0.78, Math.sin(a) * 1.38);
            dishGroup.add(node);
        }
        core.add(dishGroup);

        /* Baliza polar */
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 6), hullDark);
        mast.position.set(0.3, R + 0.3, 0.2);
        core.add(mast);
        const poleBeacon = makeBeacon(0x3aff7a);
        poleBeacon.position.set(0.3, R + 0.7, 0.2);
        core.add(poleBeacon);
    } else {
        /* Mini-luna para subcarpetas */
        const R = 1.25;
        core.add(new THREE.Mesh(new THREE.SphereGeometry(R, 18, 14), hullGray));
        core.add(new THREE.Mesh(
            new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.22, 24, 1, true), hullDark));
        for (let i = 0; i < 6; i++) {
            const u = new THREE.Vector3(sRand() * 2 - 1, sRand() * 2 - 1, sRand() * 2 - 1).normalize();
            if (Math.abs(u.y) > 0.88) continue;
            const plate = new THREE.Mesh(
                new THREE.BoxGeometry(0.25 + sRand() * 0.4, 0.05, 0.25 + sRand() * 0.4),
                sRand() > 0.5 ? hullLight : hullMid);
            plate.position.copy(u).multiplyScalar(R + 0.03);
            plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
            core.add(plate);
        }
        for (let i = 0; i < 5; i++) {
            const u = new THREE.Vector3(sRand() * 2 - 1, sRand() * 2 - 1, sRand() * 2 - 1).normalize();
            const dot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), glowDot);
            dot.position.copy(u).multiplyScalar(R + 0.06);
            core.add(dot);
        }
        const miniDish = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12),
            new THREE.MeshBasicMaterial({ color: 0x3aff7a, transparent: true, opacity: 0.55 }));
        const dDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
        miniDish.position.copy(dDir).multiplyScalar(R + 0.02);
        miniDish.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dDir);
        core.add(miniDish);
    }

    group.add(core);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: colorHex,
        transparent: true,
        opacity: isDeathStar ? 0.3 : 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    glow.scale.setScalar(isDeathStar ? 9 : 3.5);
    group.add(glow);

    const label = makeLabelSprite(name, '#' + colorHex.toString(16).padStart(6, '0'));
    label.position.y = isDeathStar ? 7.4 : 3.4;
    label.scale.set(isDeathStar ? 20 : 14, isDeathStar ? 5 : 3.5, 1);
    group.add(label);

    group.scale.setScalar(scale || 1);

    folderBasesList.push({
        core,
        ring: null,
        glow,
        superlaser,
        phase: sRand() * Math.PI * 2,
        baseGlow: isDeathStar ? 9 : 4 * (scale || 1)
    });

    return group;
}

function renderFolderBases(path, folderPaths) {
    disposeFolderBases();
    folderBasePath = path || '';
    if (typeof refreshViewControl === 'function') refreshViewControl();

    const list = (folderPaths || []).slice(0, 48);
    const count = list.length;
    const tail = folderTail(path) || 'RAÍZ';

    const central = buildFolderBase(tail, 0x00ffcc, 1.7, 'deathstar');
    central.position.copy(FOLDER_ZONE);
    folderBasesGroup.add(central);
    folderBaseCore = central;

    const header = makeLabelSprite('ESTRUCTURA: ' + (path || 'Unidades'), '#6fe3ff');
    header.position.set(FOLDER_ZONE.x, FOLDER_ZONE.y + 14, FOLDER_ZONE.z);
    header.scale.set(34, 6, 1);
    folderBasesGroup.add(header);

    if (count === 0) {
        const empty = makeLabelSprite('(sin subcarpetas)', '#7f93a8');
        empty.position.set(FOLDER_ZONE.x, FOLDER_ZONE.y - 7, FOLDER_ZONE.z);
        empty.scale.set(18, 4, 1);
        folderBasesGroup.add(empty);
        return;
    }

    const radius = Math.min(Math.max(12 + count * 1.2, 13), 34);
    const linkMaterial = new THREE.LineBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.32
    });

    list.forEach((folder, i) => {
        const name = folderTail(folder) || folder;
        const angle = (i / count) * Math.PI * 2;
        const ringRadius = radius * (i % 2 ? 1 : 0.74);
        const pos = new THREE.Vector3(
            FOLDER_ZONE.x + Math.cos(angle) * ringRadius,
            FOLDER_ZONE.y + ((i % 3) - 1) * 3,
            FOLDER_ZONE.z + Math.sin(angle) * ringRadius
        );

        const base = buildFolderBase(name, i % 2 ? 0x6ec8ff : 0x9be7ff, 1, 'moon');
        base.position.copy(pos);
        folderBasesGroup.add(base);

        const link = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([FOLDER_ZONE.clone(), pos]),
            linkMaterial
        );
        folderBasesGroup.add(link);
    });
}

function focusFolderBase(path) {
    if (typeof setViewMode === 'function') setViewMode('folders');
    return !!folderBaseCore;
}

/* ───────────────────────── Efectos de llegada ───────────────────────── */

function spawnArrivalPulse(position, colorHex) {
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.35, 48),
        new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        })
    );
    ring.position.copy(position);
    ring.lookAt(camera.position);
    effectsGroup.add(ring);

    gsap.to(ring.scale, { x: 7, y: 7, z: 7, duration: 1.1, ease: 'power2.out' });
    gsap.to(ring.material, {
        opacity: 0,
        duration: 1.1,
        ease: 'power2.out',
        onComplete: () => {
            effectsGroup.remove(ring);
            disposeObject(ring);
        }
    });
}

/* ───────────────────────── Misión: rigs de nave por agente ───────────────────────── */

const shipRigs = new Map();   /* sessionId -> rig */
const liveRigs = new Set();   /* todas las naves vivas en escena (se actualizan en animate) */
let heroRig = null;           /* nave principal: patrulla en la base hasta el 1er despegue */
let primaryShipUsed = false;
let dockSpawnIndex = 0;       /* desfase de las naves secundarias en la plataforma */
const lookHelper = new THREE.Object3D();
const SHIP_SPEED = 30;

function makeRig(parts, spawnPos) {
    const group = parts.group;
    group.position.copy(spawnPos);
    scene.add(group);
    enableShadows(group);
    const rig = {
        sessionId: null,
        win: null,
        group,
        dockOffset: new THREE.Vector3(0, 0, 0),
        engineFlame: parts.engineFlame,
        engineGlow: parts.engineGlow,
        trailPoints: [],
        trailLine: null,
        trailColor: new THREE.Color(0x00e5ff),
        target: { object: null, point: null, kind: null, name: null },
        queue: [],
        missionStep: 0,
        missionEnding: false,
        missionDone: false,
        patrolCenter: spawnPos.clone(),
        bankAngle: 0,
        warpActive: false,
        lastMoveDir: new THREE.Vector3(0, 0, 1),
        lastShipPos: spawnPos.clone(),
        smoothSpeed: 0,
        telAccum: 0
    };
    liveRigs.add(rig);
    return rig;
}

function spawnShipRig() {
    const parts = buildShipParts();
    const offsets = [
        new THREE.Vector3(0, 4, 24),
        new THREE.Vector3(12, 3, 9),
        new THREE.Vector3(-12, 3, 9),
        new THREE.Vector3(12, 6, 16),
        new THREE.Vector3(-12, 6, 16),
        new THREE.Vector3(14, 8, 24)
    ];
    const offset = offsets[dockSpawnIndex % offsets.length];
    dockSpawnIndex++;
    offset.x += (Math.random() - 0.5) * 1.8;
    offset.y += (Math.random() - 0.5) * 0.5;
    offset.z += (Math.random() - 0.5) * 1.8;
    const rig = makeRig(parts, BASE_POSITION.clone().add(offset));
    rig.dockOffset.copy(offset);
    return rig;
}

function resetRig(rig, atBase) {
    rig.queue.length = 0;
    rig.target.object = null;
    rig.target.point = null;
    rig.target.kind = null;
    rig.target.name = null;
    rig.missionStep = 0;
    rig.missionEnding = false;
    rig.missionDone = false;
    rig.bankAngle = 0;
    rig.lastMoveDir.set(0, 0, 1);
    rig.smoothSpeed = 0;
    if (atBase) {
        const home = BASE_POSITION.clone().add(rig.dockOffset);
        rig.group.position.copy(home);
        rig.group.quaternion.identity();
        rig.patrolCenter = home;
    }
    rig.lastShipPos.copy(rig.group.position);
    resetTrail(rig);
}

function rigFor(sessionId) {
    if (sessionId && shipRigs.has(sessionId)) return shipRigs.get(sessionId);
    return hudRig || heroRig;
}

/* Despegue cinematográfico desde la plataforma de la base de control */
function startTakeoff(rig) {
    const from = rig.group.position.clone();
    const lateral = (Math.random() - 0.5) * 9;
    const mid = from.clone().add(new THREE.Vector3(lateral * 0.35, 5.5, -3));
    const end = from.clone().add(new THREE.Vector3(lateral, 9.5, -22));
    rig.takeoff = { t: 0, dur: 1.8, from, mid, end };
}

function enqueueWaypoint(target, kind, name, skill, sessionId) {
    const rig = rigFor(sessionId);
    if (!rig) return;
    rig.queue.push({ target, kind, name, skill });
    if (!rig.target.object && !rig.target.point) dispatchNextWaypoint(rig);
}

function dispatchNextWaypoint(rig) {
    if (rig.queue.length === 0) return;
    const wp = rig.queue.shift();
    rig.target.kind = wp.kind;
    rig.target.name = wp.name;

    if (wp.target && wp.target.isObject3D) {
        rig.target.object = wp.target;
        rig.target.point = null;
    } else {
        rig.target.object = null;
        rig.target.point = wp.target.clone();
    }

    const color = wp.kind === 'portal' ? 0xb44bff : skillColor(wp.skill);
    rig.trailColor = new THREE.Color(color);
    rebuildTrail(rig);

    const win = rig.win || focusedWin || mainWin;
    if (win) win.setMission(`Paso ${rig.missionStep} · Ruta hacia ${wp.name}`, 'working');
}

function currentTargetPosition(rig) {
    if (!rig) return null;
    if (rig.target.object) return rig.target.object.getWorldPosition(new THREE.Vector3());
    return rig.target.point;
}

function onWaypointArrived(rig) {
    const pos = rig.group.position.clone();
    let color = 0x00ffcc;
    const win = rig.win || focusedWin || mainWin;

    if (rig.target.kind === 'portal') {
        color = 0xb44bff;
        rig.missionDone = true;
        rig.missionEnding = false;
        rig.patrolCenter = PORTAL_POSITION.clone();
        if (win) {
            win.setMission('Misión completada · Destino alcanzado', 'done');
            win.addLog('DESTINO FINAL ALCANZADO — Misión completada.');
        }

        spawnArrivalPulse(pos, color);
        if (portal) {
            gsap.to(portal.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 0.6, yoyo: true, repeat: 3, ease: 'power1.inOut' });
            gsap.to(portal.rotation, { z: Math.PI * 2, duration: 2.4, ease: 'power2.inOut' });
        }
        if (portalGlow) {
            gsap.fromTo(portalGlow.material, { opacity: 0.6 }, { opacity: 0.38, duration: 2 });
        }
    } else {
        if (rig.target.kind === 'node' && rig.target.object) {
            const entry = [...nodesMap.values()].find(n => n.planet === rig.target.object);
            if (entry && !entry.visited) entry.visited = true;
        }
        if (rig.target.kind === 'station' && rig.target.name) {
            const st = [...stationsMap.values()].find(s => s.name === rig.target.name);
            if (st) {
                st.visited = true;
                color = st.color;
                gsap.fromTo(st.core.rotation, { y: 0 }, { y: Math.PI * 2, duration: 1.2, ease: 'power2.out' });
            }
        }
        spawnArrivalPulse(pos, color);
        if (win) win.addLog(`Objetivo alcanzado: ${rig.target.name}`);
    }

    rig.target.object = null;
    rig.target.point = null;
    rig.target.kind = null;
    rig.target.name = null;

    if (rig.queue.length > 0) {
        dispatchNextWaypoint(rig);
    } else if (!rig.missionDone && win) {
        if (rig.missionEnding) {
            win.setMission('Destino final en ruta…', 'working');
        } else {
            win.setMission(`Paso ${rig.missionStep} · En espera de siguiente acción`, 'working');
        }
    }
}

function updateRig(rig, dt, elapsed) {
    const group = rig.group;
    const target = currentTargetPosition(rig);
    const isHud = rig === hudRig;
    const win = rig.win;

    /* Velocidad real (suavizada) */
    const frameSpeed = rig.lastShipPos.distanceTo(group.position) / Math.max(dt, 0.001);
    rig.lastShipPos.copy(group.position);
    rig.smoothSpeed += (frameSpeed - rig.smoothSpeed) * Math.min(1, dt * 4);

    if (rig.takeoff) {
        /* Despegue: la nave sale de la plataforma de la base de control */
        rig.takeoff.t = Math.min(rig.takeoff.t + dt, rig.takeoff.dur);
        const k = rig.takeoff.t / rig.takeoff.dur;
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const a = rig.takeoff.from.clone().lerp(rig.takeoff.mid, e);
        const b = rig.takeoff.mid.clone().lerp(rig.takeoff.end, e);
        const pos = a.lerp(b, e);
        const tangent = pos.clone().sub(group.position);
        group.position.copy(pos);
        if (tangent.lengthSq() > 1e-8) {
            lookHelper.position.copy(group.position);
            lookHelper.lookAt(group.position.clone().add(tangent));
            group.quaternion.slerp(lookHelper.quaternion, Math.min(1, dt * 8));
        }
        if (k >= 1) {
            rig.takeoff = null;
            rig.lastShipPos.copy(group.position);
        }
    } else if (target) {
        const toTarget = target.clone().sub(group.position);
        const dist = toTarget.length();

        if (dist < 3.2) {
            onWaypointArrived(rig);
        } else {
            const step = Math.min(SHIP_SPEED * dt, dist);
            toTarget.normalize();
            group.position.addScaledVector(toTarget, step);

            lookHelper.position.copy(group.position);
            lookHelper.lookAt(target);
            group.quaternion.slerp(lookHelper.quaternion, Math.min(1, dt * 5));

            /* Alabeo al girar (estilo vuelo real) */
            let yaw = Math.atan2(toTarget.x, toTarget.z) - Math.atan2(rig.lastMoveDir.x, rig.lastMoveDir.z);
            if (yaw > Math.PI) yaw -= Math.PI * 2;
            if (yaw < -Math.PI) yaw += Math.PI * 2;
            rig.lastMoveDir.copy(toTarget);
            const bankTarget = THREE.MathUtils.clamp((yaw / Math.max(dt, 0.001)) * 0.04, -0.5, 0.5);
            rig.bankAngle += (bankTarget - rig.bankAngle) * Math.min(1, dt * 4);
            group.rotateZ(rig.bankAngle);
        }
    } else {
        const orbitAngle = elapsed * 0.25;
        const patrol = new THREE.Vector3(
            rig.patrolCenter.x + Math.cos(orbitAngle) * 9,
            rig.patrolCenter.y + Math.sin(elapsed * 0.7) * 2.5,
            rig.patrolCenter.z + Math.sin(orbitAngle) * 9
        );
        const toPatrol = patrol.sub(group.position);
        if (toPatrol.length() > 0.3) {
            group.position.addScaledVector(toPatrol.normalize(), Math.min(6 * dt, toPatrol.length()));
            lookHelper.position.copy(group.position);
            lookHelper.lookAt(rig.patrolCenter);
            group.quaternion.slerp(lookHelper.quaternion, Math.min(1, dt * 2));
            rig.bankAngle += (0 - rig.bankAngle) * Math.min(1, dt * 3);
            group.rotateZ(rig.bankAngle);
        }
    }

    /* Estela */
    const last = rig.trailPoints[rig.trailPoints.length - 1];
    if (!last || last.distanceToSquared(group.position) > 0.06) {
        rig.trailPoints.push(group.position.clone());
        if (rig.trailPoints.length > TRAIL_MAX) rig.trailPoints.shift();
        rebuildTrail(rig);
    }

    /* Motores */
    const thrusting = !!target || !!rig.takeoff;
    if (rig.engineFlame) {
        const flicker = 2.4 + Math.sin(elapsed * 24 + rig.missionStep) * 0.5 + Math.random() * 0.3;
        rig.engineFlame.scale.setScalar(thrusting ? flicker : flicker * 0.5);
        rig.engineFlame.material.opacity = thrusting ? 0.85 : 0.45;
    }
    if (rig.engineGlow) {
        rig.engineGlow.scale.setScalar(5 + Math.sin(elapsed * 9) * 0.9);
    }

    /* Hipervuelo en el HUD (solo la nave enfocada) */
    const wantWarp = !!target;
    rig.warpActive = wantWarp;
    if (isHud && hudFx) hudFx.classList.toggle('warp', wantWarp);

    /* Telemetría de la ventana dueña de la nave */
    rig.telAccum += dt;
    if (rig.telAccum > 0.15) {
        rig.telAccum = 0;
        if (win && win.tel) {
            if (win.tel.vel) win.tel.vel.textContent = Math.round(rig.smoothSpeed);
            if (win.tel.obj) win.tel.obj.textContent = rig.target.name || (rig.queue.length ? rig.queue[0].name : 'Patrulla');
            if (win.tel.dist) win.tel.dist.textContent = target ? group.position.distanceTo(target).toFixed(1) + ' u' : '—';
            if (win.tel.hyper) {
                const on = rig.smoothSpeed > SHIP_SPEED * 0.5;
                win.tel.hyper.textContent = on ? 'HIPER' : 'IDLE';
                win.tel.hyper.classList.toggle('on', on);
            }
        }
        if (isHud) updateCockpit(rig, target);
    }
}

/* Dashboard del cockpit: gobierna la nave enfocada */
function updateCockpit(rig, target) {
    const group = rig.group;

    const spd = Math.min(rig.smoothSpeed / 60, 1);
    if (speedoNeedle) speedoNeedle.setAttribute('transform', `rotate(${(-110 + spd * 220).toFixed(1)} 66 68)`);
    if (speedoVal) speedoVal.textContent = Math.round(rig.smoothSpeed);

    const lit = rig.smoothSpeed < 4 ? 0 : rig.smoothSpeed < 12 ? 1 : rig.smoothSpeed < 22 ? 2 : rig.smoothSpeed < 27 ? 3 : 4;
    pwrBars.forEach((b, i) => b.classList.toggle('on', i < lit));

    const fwdVec = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    if (navXyz) {
        navXyz.textContent = `X ${group.position.x.toFixed(1)} · Y ${group.position.y.toFixed(1)} · Z ${group.position.z.toFixed(1)}`;
    }
    if (navHdg) {
        const hdg = (Math.atan2(fwdVec.x, -fwdVec.z) * 180 / Math.PI + 360) % 360;
        navHdg.textContent = String(Math.round(hdg) % 360).padStart(3, '0') + '°';
    }

    if (target && wpCard) {
        const rel = target.clone().sub(group.position);
        const nz = new THREE.Vector3(fwdVec.x, 0, fwdVec.z).normalize();
        const side = rel.x * nz.z + rel.z * (-nz.x);
        const up = rel.x * nz.x + rel.z * nz.z;
        const bearing = Math.atan2(side, up) * 180 / Math.PI;
        if (wpArrow) wpArrow.style.transform = `rotate(${bearing.toFixed(1)}deg)`;
        if (wpName) wpName.textContent = rig.target.name || '—';
        if (wpDist) wpDist.textContent = group.position.distanceTo(target).toFixed(1) + ' u';
        wpCard.classList.add('show');
    } else if (wpCard) {
        wpCard.classList.remove('show');
    }
}

/* ───────────────────────── Meteoros ───────────────────────── */

let nextMeteorAt = 5;

function spawnMeteor() {
    const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 0.4, Math.random() * 2 - 1).normalize();
    const start = dir.clone().multiplyScalar(430 + Math.random() * 80);
    const end = start.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 260,
        -40 - Math.random() * 60,
        (Math.random() - 0.5) * 260
    ));

    const mat = new THREE.MeshBasicMaterial({
        color: 0xbfe8ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 18), mat);
    mesh.position.copy(start);
    mesh.lookAt(end);
    scene.add(mesh);

    gsap.to(mesh.position, { x: end.x, y: end.y, z: end.z, duration: 1.1, ease: 'none' });
    gsap.to(mat, {
        opacity: 0,
        duration: 1.1,
        ease: 'power1.in',
        onComplete: () => {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mat.dispose();
        }
    });
}

/* ───────────────────────── Radar (dashboard) ───────────────────────── */

const RADAR_RANGE = 95;

function drawRadar(elapsed) {
    if (!radarCtx) return;
    const w = radarCanvas.width;
    const cx = w / 2;
    const cy = w / 2;
    const R = w / 2 - 5;
    const ctx = radarCtx;

    ctx.clearRect(0, 0, w, w);

    ctx.fillStyle = 'rgba(0, 22, 28, 0.82)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
    ctx.lineWidth = 1.5;
    [R, R * 0.66, R * 0.33].forEach(r => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(0, 255, 204, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    /* Barrido rotatorio */
    const sweep = (elapsed * 1.7) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(sweep) * R, cy - Math.cos(sweep) * R);
    ctx.stroke();

    /* Rotación: proa de la nave enfocada arriba */
    const centerRig = hudRig || heroRig;
    if (!centerRig) return;
    const refGroup = centerRig.group;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(refGroup.quaternion);
    let fx = fwd.x;
    let fz = fwd.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    const rx = fz;
    const rz = -fx;

    function toScreen(p) {
        const dx = p.x - refGroup.position.x;
        const dz = p.z - refGroup.position.z;
        const up = dx * fx + dz * fz;
        const side = dx * rx + dz * rz;
        let sx = (side / RADAR_RANGE) * R;
        let sy = -(up / RADAR_RANGE) * R;
        const m = Math.hypot(sx, sy);
        if (m > R - 3) {
            sx = (sx / m) * (R - 3);
            sy = (sy / m) * (R - 3);
        }
        return [cx + sx, cy + sy];
    }

    function blip(p, color, size, ring) {
        const [x, y] = toScreen(p);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        if (ring) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, size + 4 + Math.sin(elapsed * 5) * 2, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    /* Planetas (tenues) */
    ctx.fillStyle = 'rgba(110, 200, 255, 0.45)';
    nodesMap.forEach(e => {
        const wp = e.planet.getWorldPosition(new THREE.Vector3());
        const [x, y] = toScreen(wp);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });

    /* Estaciones */
    stationsMap.forEach(s => {
        const wp = s.station.getWorldPosition(new THREE.Vector3());
        blip(wp, '#' + s.color.toString(16).padStart(6, '0'), 3, false);
    });

    /* Naves de otros agentes */
    const others = new Set(shipRigs.values());
    if (heroRig) others.add(heroRig);
    others.forEach(r => {
        if (r !== centerRig) blip(r.group.position, '#7dd7ff', 3, false);
    });

    /* Objetivo actual */
    const target = currentTargetPosition(centerRig);
    if (target) {
        blip(target, '#ffe81f', 4, true);
    }

    /* Base y portal */
    blip(BASE_POSITION, '#00ff9d', 4, false);
    blip(PORTAL_POSITION, '#b44bff', 4, false);

    /* Nave (centro) */
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx + 4.5, cy + 5);
    ctx.lineTo(cx, cy + 2.5);
    ctx.lineTo(cx - 4.5, cy + 5);
    ctx.closePath();
    ctx.fill();
}

/* ───────────────────────── Cámara con seguimiento ───────────────────────── */

let userControlUntil = 0;
controls.addEventListener('start', () => {
    userControlUntil = performance.now() + 5000;
});
controls.addEventListener('end', () => {
    userControlUntil = performance.now() + 3500;
});

/* ───────────────────────── Control de vista (cámara) ─────────────────────────
   base    → estática lejana de la base de control (por defecto)
   solar   → encuadre del sistema solar / proyecto cargado
   folders → encuadre de la estructura de carpetas (bases espaciales)
   follow  → persecución de la nave de un agente activo                      */

let viewMode = 'base';
let viewRefRig = null;
let camTween = false;

const VIEW_PRESETS = {
    base: { pos: new THREE.Vector3(82, 52, 168), target: new THREE.Vector3(0, 16, 55) },
    solar: { pos: new THREE.Vector3(0, 100, 178), target: new THREE.Vector3(0, 0, 0) },
    folders: { pos: new THREE.Vector3(0, 112, 92), target: new THREE.Vector3(0, 88, 0) }
};

function applyViewPreset(mode, animate) {
    const p = VIEW_PRESETS[mode];
    if (!p) return;
    if (animate) {
        camTween = true;
        gsap.to(camera.position, { x: p.pos.x, y: p.pos.y, z: p.pos.z, duration: 1.5, ease: 'power2.inOut', onComplete: () => { camTween = false; } });
        gsap.to(controls.target, { x: p.target.x, y: p.target.y, z: p.target.z, duration: 1.5, ease: 'power2.inOut' });
    } else {
        camera.position.copy(p.pos);
        controls.target.copy(p.target);
    }
}

function setViewMode(mode, rig) {
    if (mode === 'follow') {
        if (!rig) return;
        viewMode = 'follow';
        viewRefRig = rig;
        camTween = false;
        userControlUntil = 0;
        hudRig = rig;
        if (rig.win) focusWindow(rig.win);
    } else {
        viewMode = mode;
        viewRefRig = null;
        userControlUntil = 0;
        applyViewPreset(mode, true);
    }
    if (typeof refreshViewControl === 'function') refreshViewControl();
}

function updateCamera(dt) {
    if (camTween) return;
    if (viewMode !== 'follow') return;   /* vistas estáticas: orbit libre */

    const rig = viewRefRig;
    if (!rig) return;
    if (performance.now() < userControlUntil) return;

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.group.quaternion);
    const desired = rig.group.position.clone()
        .addScaledVector(forward, -30)
        .add(new THREE.Vector3(0, 13, 0));

    camera.position.lerp(desired, Math.min(1, dt * 1.6));
    controls.target.lerp(rig.group.position, Math.min(1, dt * 2.5));
}

/* ───────────────────────── SignalR ───────────────────────── */

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/constellationHub")
    .withAutomaticReconnect()
    .build();

/* ───────────────────────── SignalR: enrutamiento por sesión ───────────────────────── */

let graphBuilt = false;

connection.on("OnCodeGraphLoaded", (data) => {
    const sessionId = data && data.sessionId;
    const graph = data && data.graph;
    const win = sessionId ? sessionWindows.get(sessionId) : mainWin;

    if (!graphBuilt && graph) {
        if (win) win.addLog("Sistema solar recibido. Desplegando planetas...");
        buildSolarSystem(graph);
        graphBuilt = true;
    } else if (win && graph) {
        win.addLog('[Sistema] Mapa recibido — la escena ya está desplegada.', 'sys');
    }
});

connection.on("OnAgentStateChanged", (data) => {
    const sessionId = data.sessionId;
    if (sessionId && !sessionWindows.has(sessionId)) return; /* sesión cerrada en esta pestaña */
    const skill = data.skill || '';
    const target = data.target || '';
    const win = sessionId ? sessionWindows.get(sessionId) : (focusedWin || mainWin);
    const rig = (sessionId && shipRigs.get(sessionId)) || hudRig || heroRig;

    const logLabels = {
        Error: '[ERROR]',
        Cuota: '[CUOTA]',
        Config: '[CONFIG]',
        Reintentando: '[AVISO 429]',
        Proveedor: '[PROVEEDOR]'
    };
    const logClass = { Error: 'err', Cuota: 'err', Config: 'err', Reintentando: 'err' };

    if (win) {
        if (logLabels[skill]) win.addLog(`${logLabels[skill]} ${target}`, logClass[skill] || 'sys');
        else win.addLog(`Skill: ${skill} -> ${target}`);
    }

    if (skill === 'Agente') {
        if (win) win.setMission('Analizando la petición…', 'working');
        return;
    }

    if (skill === 'Cuota') {
        if (win) win.setMission(`Cuota agotada · ${target}`, 'error');
        return;
    }

    if (skill === 'Config') {
        if (win) win.setMission(`Configuración · ${target}`, 'error');
        return;
    }

    if (skill === 'Reintentando') {
        if (win) win.setMission(target, 'error');
        return;
    }

    if (skill === 'Proveedor') {
        if (win) win.setMission(target, 'working');
        return;
    }

    if (skill === 'Error') {
        if (rig) rig.missionStep++;
        if (win) win.setMission(`Error: ${target}`, 'error');
        const st = getOrCreateStation(`error-${target.slice(0, 30)}`, 'ERROR', SKILL_COLORS.Error);
        enqueueWaypoint(st.station, 'station', 'Error', 'Error', sessionId);
        return;
    }

    if (rig) rig.missionStep++;

    /* Buscar el planeta correspondiente al objetivo */
    let entry = null;
    if (target && target !== 'Workspace') {
        const lower = target.toLowerCase();
        if (nodesMap.has(target)) {
            entry = nodesMap.get(target);
        } else {
            for (const [key, value] of nodesMap.entries()) {
                const keyLower = key.toLowerCase();
                const baseName = keyLower.split('/').pop().split('\\').pop();
                if (keyLower.includes(lower) || lower.includes(baseName) ||
                    baseName.startsWith(lower) || lower.startsWith(baseName.split('.')[0])) {
                    entry = value;
                    break;
                }
            }
        }
    }

    if (entry) {
        if (win) win.addLog(`Destino: planeta ${entry.id}`);
        enqueueWaypoint(entry.planet, 'node', entry.id, skill, sessionId);
    } else {
        const name = target === 'Workspace' ? 'WORKSPACE' : target;
        const st = getOrCreateStation(`${skill}-${target}`, name, skillColor(skill));
        enqueueWaypoint(st.station, 'station', name, skill, sessionId);
    }
});

connection.on("OnAgentResponse", (data) => {
    const sessionId = data.sessionId;
    if (sessionId && !sessionWindows.has(sessionId)) return; /* sesión cerrada en esta pestaña */
    const win = sessionId ? sessionWindows.get(sessionId) : (focusedWin || mainWin);
    const rig = (sessionId && shipRigs.get(sessionId)) || hudRig || heroRig;

    if (win) win.addLog('AGENTE: ' + data.text);
    if (rig) rig.missionEnding = true;
    if (win) win.setMission('Tarea ejecutada · Ruta al destino final…', 'working');
    enqueueWaypoint(portal, 'portal', 'Destino final', 'Portal', sessionId);
});

/* ───────────────────────── Ventanas de agente (paralelo) ───────────────────────── */

const sideWindowsEl = document.getElementById('side-windows');
const agentsBar = document.getElementById('agents-bar');
const btnNewAgent = document.getElementById('btn-new-agent');

function classifyLog(msg) {
    if (/Error|429|fallaron|fallo|agotada|no disponible|sin conexi|inválida|undefined/i.test(msg)) return 'err';
    if (msg.startsWith('AGENTE')) return 'agent';
    if (/^(Skill:|Destino:|Objetivo)/.test(msg)) return 'skill';
    return 'sys';
}

function focusWindow(win) {
    if (!win) return;
    focusedWin = win;
    if (win.rig) hudRig = win.rig;
}

/* ── Acordeón de ventanas laterales: una expandida a la vez ── */

function isSideWin(win) {
    return !!(win && win.el && win.el.classList.contains('agent-window'));
}

function setToggleGlyph(win, expanded) {
    const b = win.el && win.el.querySelector('.win-toggle');
    if (b) b.textContent = expanded ? '▴' : '▾';
}

function collapseWindow(win) {
    if (!isSideWin(win)) return;
    win.expanded = false;
    win.el.classList.add('collapsed');
    setToggleGlyph(win, false);
}

function expandWindow(win) {
    if (!isSideWin(win)) return;
    agentWindows.forEach(w => { if (w !== win) collapseWindow(w); });
    win.expanded = true;
    win.el.classList.remove('collapsed');
    setToggleGlyph(win, true);
}

function toggleWindow(win) {
    if (isSideWin(win) && win.expanded) collapseWindow(win);
    else expandWindow(win);
}

function makeWindow(root, opts) {
    const win = {
        index: opts.index,
        name: opts.name,
        el: root,
        pathInput: root.querySelector('.target-path'),
        promptInput: root.querySelector('.prompt-input'),
        btnStart: root.querySelector('.btn-start'),
        btnBrowse: root.querySelector('.btn-browse'),
        missionEl: root.querySelector('.mission-status'),
        missionBarEl: root.querySelector('.mission-bar'),
        logEl: root.querySelector('.log-container'),
        tel: {
            vel: root.querySelector('.tel-vel'),
            obj: root.querySelector('.tel-obj'),
            dist: root.querySelector('.tel-dist'),
            hyper: root.querySelector('.tel-hyper')
        },
        chip: null,
        sessionId: null,
        rig: null,
        minimized: false,

        addLog(msg, cls) {
            if (!this.logEl) return;
            const div = document.createElement('div');
            div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
            div.className = cls || classifyLog(msg);
            this.logEl.appendChild(div);
            this.logEl.scrollTop = this.logEl.scrollHeight;
        },

        setMission(text, cls) {
            if (this.missionEl) {
                this.missionEl.textContent = text;
                this.missionEl.className = 'mission-status' + (cls ? ' ' + cls : '');
            }
            if (this.missionBarEl) this.missionBarEl.classList.toggle('is-working', cls === 'working');
            if (this.chip) {
                this.chip.classList.remove('st-working', 'st-done', 'st-error');
                if (cls === 'working') this.chip.classList.add('st-working');
                else if (cls === 'done') this.chip.classList.add('st-done');
                else if (cls === 'error') this.chip.classList.add('st-error');
                const m = this.chip.querySelector('.chip-mission');
                if (m) m.textContent = text;
            }
        },

        minimize() {
            this.minimized = true;
            this.el.classList.add('hidden');
            if (this.chip) this.chip.classList.add('minimized');
        },

        restore() {
            this.minimized = false;
            this.el.classList.remove('hidden');
            if (this.chip) this.chip.classList.remove('minimized');
            focusWindow(this);
        }
    };

    /* Chip de resumen en la barra inferior */
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'agent-chip';
    chip.innerHTML = '<span class="chip-dot"></span><span class="chip-name"></span><span class="chip-mission"></span>';
    chip.querySelector('.chip-name').textContent = opts.name;
    chip.querySelector('.chip-mission').textContent = 'En espera de despegue';
    chip.addEventListener('click', () => {
        win.restore();
        if (isSideWin(win)) expandWindow(win);
    });
    win.chip = chip;
    if (agentsBar) {
        agentsBar.appendChild(chip);
        agentsBar.classList.remove('hidden');
    }

    const btnMin = root.querySelector('.win-min');
    if (btnMin) btnMin.addEventListener('click', () => win.minimize());
    const btnClose = root.querySelector('.win-close');
    if (btnClose) btnClose.addEventListener('click', () => closeWindow(win));

    /* Acordeón: cabecera o ▾/▴ alternan contraer/expandir */
    const btnToggle = root.querySelector('.win-toggle');
    if (btnToggle) btnToggle.addEventListener('click', () => toggleWindow(win));
    const headEl = root.querySelector('.panel-head');
    if (headEl) headEl.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (isSideWin(win)) toggleWindow(win);
    });

    root.addEventListener('mousedown', () => focusWindow(win));

    if (win.btnBrowse) {
        win.btnBrowse.addEventListener('click', () => {
            if (typeof window.openPathExplorer === 'function') window.openPathExplorer(win.pathInput);
        });
    }

    if (win.btnStart) win.btnStart.addEventListener('click', () => launchAgent(win));

    agentWindows.push(win);
    if (typeof refreshViewControl === 'function') refreshViewControl();
    return win;
}

/* Explosión estilo Star Wars: destello, onda de choque y escombros incandescentes */
function explodeRig(rig) {
    if (!rig || !rig.group) return;
    const pos = rig.group.position.clone();

    liveRigs.delete(rig);
    resetTrail(rig);
    scene.remove(rig.group);
    disposeObject(rig.group);

    /* Destello inicial (La Nave se consume en un fogonazo) */
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), flashMat);
    flash.position.copy(pos);
    scene.add(flash);
    gsap.to(flash.scale, { x: 14, y: 14, z: 14, duration: 0.4, ease: 'power2.out' });
    gsap.to(flashMat, {
        opacity: 0,
        duration: 0.55,
        ease: 'power1.out',
        onComplete: () => {
            scene.remove(flash);
            flash.geometry.dispose();
            flashMat.dispose();
        }
    });

    /* Onda de choque expansiva */
    const shockMat = new THREE.MeshBasicMaterial({
        color: 0xffa050,
        transparent: true,
        opacity: 0.7,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const shock = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shockMat);
    shock.position.copy(pos);
    scene.add(shock);
    gsap.to(shock.scale, { x: 24, y: 24, z: 24, duration: 1.0, ease: 'power2.out' });
    gsap.to(shockMat, {
        opacity: 0,
        duration: 1.0,
        ease: 'power1.out',
        onComplete: () => {
            scene.remove(shock);
            shock.geometry.dispose();
            shockMat.dispose();
        }
    });

    /* Escombros incandescentes en todas las direcciones */
    const count = 150;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const vels = [];
    const palette = [0xffd27f, 0xff8c42, 0xfff6d8, 0xff5e3a, 0x9fb4ff];
    const sparkColor = new THREE.Color();
    for (let i = 0; i < count; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        sparkColor.setHex(palette[(Math.random() * palette.length) | 0]);
        colors[i * 3] = sparkColor.r;
        colors[i * 3 + 1] = sparkColor.g;
        colors[i * 3 + 2] = sparkColor.b;
        vels.push(new THREE.Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
        ).normalize().multiplyScalar(6 + Math.random() * 22));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.75,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const sparks = new THREE.Points(geo, mat);
    sparks.position.copy(pos);
    scene.add(sparks);

    /* Luz de la explosión iluminando el entorno */
    const light = new THREE.PointLight(0xff9040, 16, 65, 1.5);
    light.position.copy(pos);
    scene.add(light);

    /* Chunks del casco girando y enfriándose (estilo Star Wars) */
    for (let c = 0; c < 14; c++) {
        const chunkMat = new THREE.MeshStandardMaterial({
            color: 0x7a7268,
            roughness: 0.85,
            metalness: 0.35,
            emissive: 0xff7020,
            emissiveIntensity: 1.4,
            transparent: true,
            opacity: 1
        });
        const chunk = new THREE.Mesh(new THREE.TetrahedronGeometry(0.25 + Math.random() * 0.55), chunkMat);
        chunk.position.copy(pos);
        scene.add(chunk);
        const dir = new THREE.Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
        ).normalize().multiplyScalar(4 + Math.random() * 10);
        const spin = new THREE.Vector3(
            Math.random() * 6 - 3,
            Math.random() * 6 - 3,
            Math.random() * 6 - 3
        );
        const cs = { t: 0 };
        gsap.to(cs, {
            t: 1.3,
            duration: 1.3,
            ease: 'none',
            onUpdate: () => {
                chunk.position.set(
                    pos.x + dir.x * cs.t,
                    pos.y + dir.y * cs.t - 5 * cs.t * cs.t,
                    pos.z + dir.z * cs.t
                );
                chunk.rotation.set(spin.x * cs.t, spin.y * cs.t, spin.z * cs.t);
                chunkMat.opacity = Math.max(0, 1 - cs.t / 1.3);
                chunkMat.emissiveIntensity = Math.max(0, 1.4 * (1 - cs.t / 0.9));
            },
            onComplete: () => {
                scene.remove(chunk);
                chunk.geometry.dispose();
                chunkMat.dispose();
            }
        });
    }

    const dur = 1.5;
    const st = { k: 0 };
    gsap.to(st, {
        k: dur,
        duration: dur,
        ease: 'none',
        onUpdate: () => {
            const p = st.k / dur;
            const ease = 1 - (1 - p) * (1 - p);
            const arr = geo.attributes.position.array;
            for (let i = 0; i < count; i++) {
                const v = vels[i];
                arr[i * 3] = v.x * ease;
                arr[i * 3 + 1] = v.y * ease - 7 * p * p;
                arr[i * 3 + 2] = v.z * ease;
            }
            geo.attributes.position.needsUpdate = true;
            mat.opacity = 1 - p;
            light.intensity = Math.max(0, 16 * (1 - p / 0.35));
        },
        onComplete: () => {
            scene.remove(sparks);
            geo.dispose();
            mat.dispose();
            scene.remove(light);
        }
    });
}

/* Cerrar una ventana de agente: suelta la nave (explosa), el chip y la sesión */
function closeWindow(win) {
    if (!win) return;

    if (win.sessionId) {
        sessionWindows.delete(win.sessionId);
        fetch('/api/agent/sessions/' + encodeURIComponent(win.sessionId) + '/close', { method: 'POST' })
            .catch(() => { });
    }

    const rig = win.rig;
    if (rig) {
        if (rig.sessionId) shipRigs.delete(rig.sessionId);
        explodeRig(rig);
        if (rig === heroRig) heroRig = null;
        if (rig === viewRefRig) {
            /* La cámara se queda sobre la explosión un momento… */
            setTimeout(() => {
                if (viewRefRig !== rig) return;
                viewRefRig = null;
                if (viewMode === 'follow') {
                    viewMode = 'base';
                    applyViewPreset('base', true);
                }
            }, 1300);
        }
        win.rig = null;
        rig.win = null;
    }

    if (win.chip) {
        win.chip.remove();
        win.chip = null;
    }
    if (agentsBar && !agentsBar.querySelector('.agent-chip')) {
        agentsBar.classList.add('hidden');
    }

    const idx = agentWindows.indexOf(win);
    if (idx >= 0) agentWindows.splice(idx, 1);
    if (win.el) win.el.remove();

    if (focusedWin === win) {
        focusedWin = agentWindows[agentWindows.length - 1] || null;
    }
    if (rig === hudRig) {
        hudRig = (focusedWin && focusedWin.rig) || null;
    }

    /* Si la ventana cerrada estaba expandida, expandir la siguiente */
    if (!agentWindows.some(w => isSideWin(w) && w.expanded)) {
        const nextSide = agentWindows.find(isSideWin);
        if (nextSide) expandWindow(nextSide);
    }

    refreshViewControl();
}

function createSideWindow() {
    windowSeq++;
    const el = document.createElement('div');
    el.className = 'agent-window hud-panel';
    el.innerHTML = `
        <div class="brackets" aria-hidden="true"></div>
        <div class="panel-head">
            <div>
                <div class="head-row">
                    <svg class="ship-icon" viewBox="0 0 40 40" aria-hidden="true">
                        <circle cx="19" cy="25" r="12.5" fill="none" stroke="currentColor" stroke-width="2" />
                        <rect x="12.5" y="6" width="4.5" height="13" rx="1.4" fill="currentColor" />
                        <rect x="21" y="6" width="4.5" height="13" rx="1.4" fill="currentColor" />
                        <circle cx="33" cy="16" r="3" fill="currentColor" />
                    </svg>
                    <h3>Agente ${windowSeq}</h3>
                </div>
                <div class="subtitle win-extra">// Consola paralela</div>
            </div>
            <div class="win-actions">
                <button type="button" class="win-toggle" title="Contraer/Expandir" aria-label="Contraer o expandir">&#9650;</button>
                <button type="button" class="win-min" title="Minimizar" aria-label="Minimizar">&ndash;</button>
                <button type="button" class="win-close" title="Cerrar agente" aria-label="Cerrar agente">&times;</button>
            </div>
        </div>
        <div class="field">
            <label>Ruta del Proyecto Objetivo</label>
            <div class="path-row">
                <input type="text" class="target-path" value="C:/" spellcheck="false" />
                <button type="button" class="btn-browse" title="Explorar carpetas del servidor">Examinar</button>
            </div>
        </div>
        <div class="field">
            <label>Instrucción al Agente</label>
            <textarea class="prompt-input" rows="3" spellcheck="false"></textarea>
        </div>
        <button class="btn-start win-extra" type="button">Iniciar Hiperimpulsor</button>
        <div class="mission-bar win-extra">
            <span class="mission-label">Misión</span>
            <span class="mission-status">En espera de despegue</span>
        </div>
        <div class="telemetry win-extra" aria-label="Telemetría del halcón">
            <div class="tel"><span class="tel-k">Vel</span><span class="tel-v tel-vel">0</span></div>
            <div class="tel"><span class="tel-k">Objetivo</span><span class="tel-v tel-obj">—</span></div>
            <div class="tel"><span class="tel-k">Dist</span><span class="tel-v tel-dist">—</span></div>
            <div class="tel"><span class="tel-k">Motor</span><span class="tel-v tel-hyper">IDLE</span></div>
        </div>
        <div class="log-head win-extra">
            <span class="live">System Log</span>
        </div>
        <div class="log-container win-extra"></div>
    `;
    if (sideWindowsEl) sideWindowsEl.appendChild(el);
    const win = makeWindow(el, { index: windowSeq, name: `Agente ${windowSeq}` });

    expandWindow(win); /* la nueva ventana queda expandida, las demás se contraen */

    /* Nave del agente: aparece flotando en la base de control al crear la ventana */
    const rig = spawnShipRig();
    rig.win = win;
    win.rig = rig;
    refreshViewControl();

    return win;
}

/* ───────────────────────── Control de vista (UI) ───────────────────────── */

function refreshViewControl() {
    const list = document.getElementById('view-list');
    if (!list) return;
    list.innerHTML = '';

    const add = (label, active, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vc-item' + (active ? ' active' : '');
        b.textContent = label;
        b.addEventListener('click', onClick);
        list.appendChild(b);
        return b;
    };

    add('Base de control', viewMode === 'base', () => setViewMode('base'));
    add('Sistema solar', viewMode === 'solar', () => setViewMode('solar'));

    if (folderBasePath) {
        const tail = folderTail(folderBasePath) || folderBasePath;
        add('Carpetas: ' + tail, viewMode === 'folders', () => setViewMode('folders'));
    }

    const withSession = agentWindows;
    if (withSession.length) {
        const sep = document.createElement('span');
        sep.className = 'vc-sep';
        list.appendChild(sep);
    }
    withSession.forEach(w => {
        const active = viewMode === 'follow' && viewRefRig === w.rig;
        const tail = w.sessionId && w.pathInput ? (folderTail(w.pathInput.value) || '') : '';
        add(w.name + (tail ? ' · ' + tail : ''), active, () => {
            if (w.rig) setViewMode('follow', w.rig);
            else focusWindow(w);
        });
    });
}

/* ───────────────────────── Despegue de agentes ───────────────────────── */

function bindRig(win, sessionId) {
    let rig = win.rig;
    if (!rig) {
        if (!primaryShipUsed && heroRig) {
            rig = heroRig;
            primaryShipUsed = true;
        } else {
            rig = spawnShipRig();
        }
        win.rig = rig;
        rig.win = win;
    }

    /* ¿Hay otras misiones en curso? → no limpiar la escena compartida */
    const hasOtherSessions = [...shipRigs.values()].some(r => r !== rig && r.sessionId);

    /* Desvincular el mapeo anterior de esta ventana (relanzamiento) */
    for (const [id, r] of [...shipRigs]) {
        if (r === rig && id !== sessionId) shipRigs.delete(id);
    }

    resetRig(rig, true);
    if (!hasOtherSessions) {
        clearGroup(stationsGroup);
        stationsMap.clear();
        if (portal) portal.scale.setScalar(1);
    }

    rig.sessionId = sessionId;
    rig.win = win;
    shipRigs.set(sessionId, rig);
    hudRig = rig;

    /* Una nave por agente: despega de la base de control */
    startTakeoff(rig);
}

async function launchAgent(win) {
    const targetPath = win.pathInput ? win.pathInput.value : '';
    const prompt = win.promptInput ? win.promptInput.value : '';

    launchInFlight = true;
    win.setMission('Despegando…', 'working');
    win.addLog('Enviando petición de orquestación...');
    document.body.classList.add('launching');
    setTimeout(() => document.body.classList.remove('launching'), 1400);

    try {
        const res = await fetch('/api/agent/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetPath, prompt })
        });

        let data = {};
        try { data = await res.json(); } catch (e) { }

        if (!res.ok) {
            const reason = data.message || data.Message || `HTTP ${res.status}`;
            win.addLog(`[ERROR] No se pudo iniciar la misión: ${reason}`, 'err');
            win.setMission('Error al iniciar la misión', 'error');
            document.body.classList.remove('launching');
            return;
        }

        if (!data.sessionId) {
            win.addLog('[ERROR] El servidor no devolvió un id de sesión.', 'err');
            win.setMission('Error al iniciar la misión', 'error');
            document.body.classList.remove('launching');
            return;
        }

        /* La ventana pudo cerrarse mientras el POST estaba en curso */
        if (agentWindows.indexOf(win) < 0) {
            fetch('/api/agent/sessions/' + encodeURIComponent(data.sessionId) + '/close', { method: 'POST' }).catch(() => { });
            document.body.classList.remove('launching');
            return;
        }

        if (win.sessionId) sessionWindows.delete(win.sessionId);
        win.sessionId = data.sessionId;
        sessionWindows.set(data.sessionId, win);
        connection.invoke('JoinSession', data.sessionId);
        bindRig(win, data.sessionId);
        focusWindow(win);

        win.addLog(`Sesión creada: ${data.sessionId}`);

        /* Desplegar la estructura de la ruta objetivo como bases espaciales */
        try {
            if (typeof renderFolderBases === 'function') {
                const treeRes = await fetch('/api/agent/browse?path=' + encodeURIComponent(targetPath));
                if (treeRes.ok) {
                    const tree = await treeRes.json();
                    renderFolderBases(tree.path || targetPath, (tree.folders || []).map(f => f.path));
                }
            }
        } catch (e) { }
    } catch (err) {
        win.addLog('[ERROR] No se pudo iniciar sesión: ' + err, 'err');
        win.setMission('Error al iniciar la misión', 'error');
        document.body.classList.remove('launching');
    } finally {
        launchInFlight = false;
    }
}

/* Restaurar sesiones activas tras (re)cargar la página */
async function restoreSessions() {
    try {
        /* Si hay una misión lanzándose en esta página, su POST aún no registró la
           ventana: restaurarla aquí crearía un duplicado. Se omite (habrá otra
           oportunidad en la próxima carga). */
        if (launchInFlight) return;

        const res = await fetch('/api/agent/sessions');
        if (!res.ok) return;
        const sessions = await res.json();
        (sessions || []).forEach(s => {
            if (!s.sessionId || sessionWindows.has(s.sessionId)) return;
            if (s.status === 'Closed') return;
            if (launchInFlight) return;

            const win = createSideWindow();
            if (s.targetPath) win.pathInput.value = s.targetPath;
            if (s.prompt) win.promptInput.value = s.prompt;
            win.sessionId = s.sessionId;
            sessionWindows.set(s.sessionId, win);
            connection.invoke('JoinSession', s.sessionId);

            const rig = win.rig || spawnShipRig();
            win.rig = rig;
            rig.win = win;
            rig.sessionId = s.sessionId;
            shipRigs.set(s.sessionId, rig);

            if (s.status === 'Done') win.setMission('Misión completada · sesión restaurada', 'done');
            else if (s.status === 'Error') win.setMission('Error · sesión restaurada', 'error');
            else win.setMission('En misión · sesión restaurada', 'working');
            win.minimize();
        });
        refreshViewControl();
    } catch (e) { }
}

/* ───────────────────────── Conexión ───────────────────────── */

connection.start()
    .then(() => {
        addLog('Conectado con SignalR con éxito.');
        restoreSessions();
    })
    .catch(err => addLog('[ERROR] Error SignalR: ' + err, 'err'));

connection.onclose(err => addLog('[ERROR] Conexión con el servidor cerrada' + (err ? ': ' + err : ''), 'err'));
connection.onreconnected(() => addLog('Conexión SignalR reestablecida.', 'sys'));
connection.onreconnecting(() => addLog('[AVISO] Reconectando con el servidor…', 'err'));

/* ───────────────────────── Consola principal + botón ───────────────────────── */

mainWin = makeWindow(document.getElementById('ui-panel'), { index: 1, name: 'Agente 1' });
focusedWin = mainWin;
windowSeq = 1;

/* Todos los agentes viven en la misma columna apilada a la izquierda */
if (sideWindowsEl) sideWindowsEl.prepend(mainWin.el);
expandWindow(mainWin);

if (btnNewAgent) {
    btnNewAgent.addEventListener('click', () => {
        const win = createSideWindow();
        focusWindow(win);
        if (win.promptInput) win.promptInput.focus();
    });
}

refreshViewControl();


/* ───────────────────────── Animación ───────────────────────── */

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    solarSystem.rotation.y += 0.0004;

    if (asteroidBelt) asteroidBelt.rotation.y += dt * 0.014;

    if (elapsed > nextMeteorAt) {
        nextMeteorAt = elapsed + 6 + Math.random() * 9;
        spawnMeteor();
    }

    if (sunMesh) sunMesh.rotation.y += dt * 0.15;
    if (sunCorona) sunCorona.rotation.z += dt * 0.06;
    if (sunGlow) {
        const pulse = 26 + Math.sin(elapsed * 1.3) * 2.5;
        sunGlow.scale.setScalar(pulse);
    }
    if (sunUniforms) sunUniforms.uTime.value = elapsed;
    if (elapsed > nextFlareAt) {
        nextFlareAt = elapsed + 9 + Math.random() * 13;
        spawnSolarFlare();
    }

    if (portal) {
        portal.rotation.y += dt * 0.05;
        if (portalRingInner) portalRingInner.rotation.z -= dt * 0.9;
        const flames = portal.userData.engineFlames;
        if (flames) {
            flames.forEach((f, i) => {
                const k = 0.85 + Math.sin(elapsed * 8 + i * 1.9) * 0.15;
                f.scale.set(k, 1, k);
                f.material.opacity = 0.4 + Math.abs(Math.sin(elapsed * 5.5 + i)) * 0.3;
            });
        }
        const pBeacons = portal.userData.beacons;
        if (pBeacons) {
            const pulse = 0.3 + Math.abs(Math.sin(elapsed * 2.2)) * 0.7;
            pBeacons.forEach(b => { b.material.emissiveIntensity = pulse; });
        }
    }

    if (baseMarker) {
        if (baseMarker.userData.rotor) baseMarker.userData.rotor.rotation.y += dt * 0.35;
        const beacons = baseMarker.userData.beacons;
        if (beacons) {
            const pulse = 0.28 + Math.abs(Math.sin(elapsed * 2.6)) * 0.7;
            beacons.forEach(b => { b.material.emissiveIntensity = pulse; });
        }
        const flames = baseMarker.userData.engineFlames;
        if (flames) {
            flames.forEach((f, i) => {
                const k = 0.85 + Math.sin(elapsed * 9 + i * 1.7) * 0.15;
                f.scale.set(k, 1, k);
                f.material.opacity = 0.45 + Math.abs(Math.sin(elapsed * 6 + i)) * 0.3;
            });
        }
    }

    nodesMap.forEach(entry => {
        if (entry.glow) {
            const boost = entry.visited ? 1.5 : 1;
            entry.glow.scale.setScalar(entry.baseGlow * boost * (1 + Math.sin(elapsed * 2 + entry.phase) * 0.16));
        }
        if (entry.sphere) entry.sphere.rotation.y += dt * 0.3;
    });

    stationsMap.forEach(st => {
        st.core.rotation.y += dt * 0.8;
        st.ring.rotation.z += dt * 0.6;
        const boost = st.visited ? 1.6 : 1;
        st.glow.scale.setScalar(4.5 * boost * (1 + Math.sin(elapsed * 2.4) * 0.18));
    });

    folderBasesList.forEach(f => {
        if (f.core) f.core.rotation.y += dt * 0.7;
        if (f.ring) f.ring.rotation.z += dt * 0.5;
        if (f.glow) f.glow.scale.setScalar(f.baseGlow * (1 + Math.sin(elapsed * 2.2 + f.phase) * 0.16));
        if (f.superlaser) f.superlaser.material.opacity = 0.4 + Math.abs(Math.sin(elapsed * 1.8 + f.phase)) * 0.55;
    });

    liveRigs.forEach(r => updateRig(r, dt, elapsed));
    drawRadar(elapsed);
    updateCamera(dt);

    controls.update();
    if (composer) composer.render();
    else renderer.render(scene, camera);
}

heroRig = makeRig(buildShipParts(), BASE_POSITION.clone().add(new THREE.Vector3(0, 2, 13)));
heroRig.dockOffset.set(0, 2, 13);
hudRig = heroRig;
mainWin.rig = heroRig;
heroRig.win = mainWin;
primaryShipUsed = true;
resetTrail(heroRig);
enableShadows(scene);
if (sunMesh) { sunMesh.castShadow = false; sunMesh.receiveShadow = false; }
if (sunCorona) { sunCorona.castShadow = false; sunCorona.receiveShadow = false; }
applyViewPreset('base', false);
setMission('En espera de despegue', '');
animate();

['Core-9 · navegación inicializada.', 'Buscando señales de code-graph…', 'Hipermotor en espera.'].forEach((line, i) => {
    setTimeout(() => addLog('[Sistema] ' + line), 500 + i * 550);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (composer) updatePostSize();
    else renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('error', (e) => {
    const detail = e.message
        || (e.target && (e.target.src || e.target.href))
        || 'Error de JavaScript';
    addLog('[ERROR] ' + detail, 'err');
});

window.addEventListener('unhandledrejection', (e) => {
    const reason = (e.reason && (e.reason.message || String(e.reason))) || 'promesa rechazada';
    addLog('[ERROR] ' + reason, 'err');
});
