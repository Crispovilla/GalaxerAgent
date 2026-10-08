const container = document.getElementById('canvas-container');
const logBox = document.getElementById('log-container');
const missionStatus = document.getElementById('mission-status');
const hudFx = document.getElementById('hud-fx');
const telVel = document.getElementById('tel-vel');
const telObj = document.getElementById('tel-obj');
const telDist = document.getElementById('tel-dist');
const telHyper = document.getElementById('tel-hyper');
const missionBar = document.querySelector('#ui-panel .mission-bar');
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

function addLog(msg, cls) {
    const div = document.createElement('div');
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    if (cls) {
        div.className = cls;
    } else if (/Error|429|fallaron|fallo|agotada|no disponible|sin conexi|inválida|undefined/i.test(msg)) {
        div.className = 'err';
    } else if (msg.startsWith('AGENTE')) {
        div.className = 'agent';
    } else if (/^(Skill:|Destino:|Objetivo)/.test(msg)) {
        div.className = 'skill';
    } else {
        div.className = 'sys';
    }
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
}

function setMission(text, cls) {
    if (!missionStatus) return;
    missionStatus.textContent = text;
    missionStatus.className = cls || '';
    if (missionBar) missionBar.classList.toggle('is-working', cls === 'working');
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
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
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
renderer.toneMappingExposure = 1.08;
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
        0.85,
        0.55,
        0.22
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

function createSun() {
    sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(5, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0xffd27d })
    );

    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffa83e,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    sunGlow.scale.setScalar(34);
    sunMesh.add(sunGlow);

    const light = new THREE.PointLight(0xfff0d0, 2.2, 600, 1.4);
    solarSystem.add(light);

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
        color: 0x8b8378,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true
    });

    for (let i = 0; i < 140; i++) {
        const rock = new THREE.Mesh(geo, mat);
        const angle = Math.random() * Math.PI * 2;
        const radius = 31.6 + (Math.random() - 0.5) * 2.6;
        const s = 0.12 + Math.random() * 0.4;
        rock.scale.setScalar(s);
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

const ship = new THREE.Group();
const shipLight = new THREE.PointLight(0xfff2d8, 1.3, 46, 1.6);
let engineFlame = null;
let engineGlow = null;

const BASE_POSITION = new THREE.Vector3(0, 5, 70);
const PORTAL_POSITION = new THREE.Vector3(0, 34, -95);
let patrolCenter = BASE_POSITION.clone();

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

function createShip() {
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
    ship.add(saucer);

    /* Aro del borde */
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.57, 0.09, 10, 72), panelMat);
    rim.rotation.x = -Math.PI / 2;
    ship.add(rim);

    /* Cúpula superior */
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.75, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        hullMat
    );
    dome.scale.set(1, 0.2, 1);
    dome.position.y = 0.30;
    ship.add(dome);

    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.16, 20), panelMat);
    hatch.position.y = 0.66;
    ship.add(hatch);

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
    ship.add(turret);

    /* Torreta inferior */
    const turretB = turret.clone();
    turretB.position.set(0, -0.62, -0.15);
    turretB.rotation.z = Math.PI;
    ship.add(turretB);

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
        ship.add(mand);
    });

    /* Luces de navegación en las puntas */
    [{ x: -0.88, c: 0xff3b52 }, { x: 0.88, c: 0x3dff9e }].forEach(({ x, c }) => {
        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 10, 8),
            new THREE.MeshBasicMaterial({ color: c })
        );
        lamp.position.set(x, 0.06, 3.56);
        ship.add(lamp);

        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture,
            color: c,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        halo.scale.setScalar(0.9);
        halo.position.copy(lamp.position);
        ship.add(halo);
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
    ship.add(cockpit);

    /* Matriz de impulso curva (arco trasero con lamas) */
    const arc = 130 * Math.PI / 180;
    const engineBack = new THREE.Mesh(
        new THREE.CylinderGeometry(2.48, 2.48, 0.5, 32, 1, true, Math.PI - arc / 2, arc),
        new THREE.MeshStandardMaterial({ color: 0x2c3238, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide })
    );
    ship.add(engineBack);

    const engineBand = new THREE.Mesh(
        new THREE.CylinderGeometry(2.56, 2.56, 0.42, 40, 1, true, Math.PI - arc / 2, arc),
        new THREE.MeshStandardMaterial({
            color: 0xaebfcb,
            map: engineTexture,
            emissive: 0xffffff,
            emissiveMap: engineTexture,
            emissiveIntensity: 1.7,
            metalness: 0.35,
            roughness: 0.4,
            side: THREE.DoubleSide
        })
    );
    ship.add(engineBand);

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
        ship.add(g);
    });

    /* Antena parabólica */
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 8), darkMat);
    stalk.position.set(-0.9, 0.85, -0.5);
    ship.add(stalk);

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
    ship.add(dish);

    /* Anillos de acoplamiento (lado izquierdo) */
    [-0.5, 0.5].forEach(z => {
        const dock = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), panelMat);
        dock.rotation.z = Math.PI / 2;
        dock.position.set(-2.55, 0, z);
        ship.add(dock);
    });

    /* Luz de cabina */
    shipLight.position.set(1.5, 3.4, 1.8);
    ship.add(shipLight);

    /* Resplandor de motores */
    engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x66c8ff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    engineGlow.scale.setScalar(5);
    engineGlow.position.z = -3.0;
    ship.add(engineGlow);

    engineFlame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xbfe8ff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    engineFlame.scale.setScalar(2.6);
    engineFlame.position.z = -3.4;
    ship.add(engineFlame);

    const engineLight = new THREE.PointLight(0x66c8ff, 0.9, 18);
    engineLight.position.set(0, 0, -3);
    ship.add(engineLight);

    ship.position.copy(BASE_POSITION);
    scene.add(ship);
}

createShip();

/* Estela */
const TRAIL_MAX = 110;
const trailPoints = [];
let trailLine = null;
let trailColor = new THREE.Color(0x00e5ff);

function resetTrail() {
    trailPoints.length = 0;
    trailPoints.push(ship.position.clone());
    rebuildTrail();
}

function rebuildTrail() {
    if (trailLine) {
        effectsGroup.remove(trailLine);
        disposeObject(trailLine);
        trailLine = null;
    }
    if (trailPoints.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(trailPoints);
    const mat = new THREE.LineBasicMaterial({
        color: trailColor,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    trailLine = new THREE.Line(geo, mat);
    effectsGroup.add(trailLine);
}

/* ───────────────────────── Base y portal ───────────────────────── */

let baseMarker = null;
let portal = null;
let portalGlow = null;
let portalRingInner = null;

/* ───────────────────── Modelos de estación espacial ───────────────────── */

function stationHull() {
    return new THREE.MeshStandardMaterial({ color: 0x8d99ad, metalness: 0.85, roughness: 0.38 });
}

function stationDark() {
    return new THREE.MeshStandardMaterial({ color: 0x222b3a, metalness: 0.7, roughness: 0.5 });
}

function stationAccent(colorHex, intensity) {
    return new THREE.MeshStandardMaterial({
        color: 0x0f1724,
        emissive: colorHex,
        emissiveIntensity: intensity === undefined ? 1.0 : intensity,
        metalness: 0.45,
        roughness: 0.4
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
            emissiveIntensity: 0.55,
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

function createBase() {
    baseMarker = new THREE.Group();
    const colorHex = 0x00ffcc;

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.4, 6.6, 24), stationHull());
    tower.position.y = -1.6;
    baseMarker.add(tower);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.16, 8, 40), stationAccent(colorHex, 1.2));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.4;
    baseMarker.add(collar);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), stationHull());
    dome.position.y = 1.7;
    baseMarker.add(dome);

    const antenna = makeAntenna(2.6, colorHex);
    antenna.position.set(2.7, 1.5, 0);
    baseMarker.add(antenna);

    /* Anillo de atraque donde estaciona la nave */
    const dockRing = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.26, 10, 64), stationAccent(colorHex, 1.0));
    dockRing.rotation.x = Math.PI / 2;
    dockRing.position.y = 2.3;
    baseMarker.add(dockRing);

    const beacons = [];
    for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group();
        arm.rotation.y = (i / 4) * Math.PI * 2;

        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.6, 8), stationDark());
        strut.rotation.z = Math.PI / 2;
        strut.position.set(2.4, 2.3, 0);
        arm.add(strut);

        const beacon = makeBeacon(colorHex);
        beacon.position.set(4.8, 2.3, 0);
        arm.add(beacon);
        beacons.push(beacon);

        baseMarker.add(arm);
    }

    /* Hábitat giratorio */
    const rotor = new THREE.Group();
    const habitat = makeHabitatRing(6.2, 0.3, colorHex, 4);
    habitat.rotation.x = -Math.PI / 2;
    rotor.add(habitat);
    rotor.position.y = -2.6;
    baseMarker.add(rotor);

    const wingL = makeSolarWing(colorHex, 5.6);
    wingL.position.set(-5.6, -4.6, 0);
    baseMarker.add(wingL);

    const wingR = makeSolarWing(colorHex, 5.6);
    wingR.position.set(5.6, -4.6, 0);
    baseMarker.add(wingR);

    const label = makeLabelSprite('BASE DE CONTROL', '#00ffcc');
    label.position.y = 8;
    label.scale.set(18, 4.5, 1);
    baseMarker.add(label);

    baseMarker.userData.rotor = rotor;
    baseMarker.userData.beacons = beacons;

    baseMarker.position.copy(BASE_POSITION);
    baseMarker.position.y -= 2.5;
    scene.add(baseMarker);
}

function createPortal() {
    portal = new THREE.Group();
    const colorHex = 0xb44bff;

    /* Torre central con módulo de mando */
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 8, 24), stationHull());
    portal.add(tower);

    const command = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 18), stationHull());
    command.position.y = 4.6;
    portal.add(command);

    const band = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.16, 8, 40), stationAccent(colorHex, 1.3));
    band.rotation.x = Math.PI / 2;
    band.position.y = 4.6;
    portal.add(band);

    const docking = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 1.4, 20), stationAccent(colorHex, 1.0));
    docking.position.y = -4.6;
    portal.add(docking);

    /* Rueda vertical de habitación (gira sobre su eje) */
    portalRingInner = new THREE.Group();
    portalRingInner.add(makeHabitatRing(5.4, 0.35, colorHex, 6));
    portal.add(portalRingInner);

    /* Anillos horizontales de sacrificio: la nave pasa por el hueco */
    const ringTop = makeHabitatRing(8, 0.55, colorHex, 6);
    ringTop.rotation.x = -Math.PI / 2;
    ringTop.position.y = 3.5;
    portal.add(ringTop);

    const ringBottom = makeHabitatRing(8, 0.55, colorHex, 6);
    ringBottom.rotation.x = -Math.PI / 2;
    ringBottom.position.y = -3.5;
    portal.add(ringBottom);

    /* Paneles solares superior e inferior */
    const wingTop = makeSolarWing(colorHex, 7);
    wingTop.position.set(0, 7.0, 0);
    portal.add(wingTop);

    const pylonTop = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 8), stationDark());
    pylonTop.position.y = 5.4;
    portal.add(pylonTop);

    const wingBottom = makeSolarWing(colorHex, 7);
    wingBottom.position.set(0, -7.0, 0);
    portal.add(wingBottom);

    const pylonBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 8), stationDark());
    pylonBottom.position.y = -5.8;
    portal.add(pylonBottom);

    const mast = makeAntenna(3.2, colorHex);
    mast.position.set(2.4, 5.4, 0);
    portal.add(mast);

    portalGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xb44bff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    portalGlow.scale.setScalar(26);
    portal.add(portalGlow);

    const label = makeLabelSprite('DESTINO FINAL', '#b44bff');
    label.position.y = 11;
    label.scale.set(16, 4, 1);
    portal.add(label);

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
            opacity: 0.75,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        glow.scale.setScalar(6);
        planet.add(glow);

        planet.position.set(x, y, z);
        planetsGroup.add(planet);

        nodesMap.set(node.id, {
            id: node.id,
            planet,
            sphere,
            glow,
            baseGlow: 6,
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
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    glow.scale.setScalar(8);
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

function buildFolderBase(name, colorHex, scale) {
    const group = new THREE.Group();

    const core = new THREE.Group();

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.2, 18), stationHull());
    core.add(body);

    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        stationHull()
    );
    dome.position.y = 1.1;
    core.add(dome);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 8, 28), stationAccent(colorHex, 1.2));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.7;
    core.add(collar);

    group.add(core);

    const ring = new THREE.Group();
    ring.rotation.x = -Math.PI / 2.6;
    ring.add(makeHabitatRing(2.4, 0.16, colorHex, 3));
    group.add(ring);

    const wingL = makeSolarWing(colorHex, 2.4);
    wingL.position.set(-2.2, 1.2, 0);
    group.add(wingL);

    const wingR = makeSolarWing(colorHex, 2.4);
    wingR.position.set(2.2, 1.2, 0);
    group.add(wingR);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: colorHex,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    glow.scale.setScalar(6);
    group.add(glow);

    const label = makeLabelSprite(name, '#' + colorHex.toString(16).padStart(6, '0'));
    label.position.y = 3.4;
    label.scale.set(14, 3.5, 1);
    group.add(label);

    group.scale.setScalar(scale || 1);

    folderBasesList.push({
        core,
        ring,
        glow,
        phase: Math.random() * Math.PI * 2,
        baseGlow: 6 * (scale || 1)
    });

    return group;
}

function renderFolderBases(path, folderPaths) {
    disposeFolderBases();
    folderBasePath = path || '';

    const list = (folderPaths || []).slice(0, 48);
    const count = list.length;
    const tail = folderTail(path) || 'RAÍZ';

    const central = buildFolderBase(tail, 0x00ffcc, 1.7);
    central.position.copy(FOLDER_ZONE);
    folderBasesGroup.add(central);
    folderBaseCore = central;

    const header = makeLabelSprite('ESTRUCTURA: ' + (path || 'Unidades'), '#6fe3ff');
    header.position.set(FOLDER_ZONE.x, FOLDER_ZONE.y + 9, FOLDER_ZONE.z);
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

        const base = buildFolderBase(name, i % 2 ? 0x6ec8ff : 0x9be7ff, 1);
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
    if (!folderBaseCore) return false;
    const name = folderTail(path || folderBasePath) || 'Carpeta';
    enqueueWaypoint(folderBaseCore, 'station', name, 'Workspace');
    return true;
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

/* ───────────────────────── Misión: navegación de la nave ───────────────────────── */

const shipTarget = { object: null, point: null, kind: null, name: null };
const waypointQueue = [];
let missionStep = 0;
let missionEnding = false;
let missionDone = false;
const lookHelper = new THREE.Object3D();
const SHIP_SPEED = 30;
let bankAngle = 0;
let warpActive = false;
const lastMoveDir = new THREE.Vector3(0, 0, 1);
const lastShipPos = new THREE.Vector3();
let smoothSpeed = 0;
let telAccum = 0;

function enqueueWaypoint(target, kind, name, skill) {
    waypointQueue.push({ target, kind, name, skill });
    if (!shipTarget.object && !shipTarget.point) dispatchNextWaypoint();
}

function dispatchNextWaypoint() {
    if (waypointQueue.length === 0) return;
    const wp = waypointQueue.shift();
    shipTarget.kind = wp.kind;
    shipTarget.name = wp.name;

    if (wp.target && wp.target.isObject3D) {
        shipTarget.object = wp.target;
        shipTarget.point = null;
    } else {
        shipTarget.object = null;
        shipTarget.point = wp.target.clone();
    }

    const color = wp.kind === 'portal' ? 0xb44bff : skillColor(wp.skill);
    trailColor = new THREE.Color(color);
    rebuildTrail();

    setMission(`Paso ${missionStep} · Ruta hacia ${wp.name}`, 'working');
}

function currentTargetPosition() {
    if (shipTarget.object) return shipTarget.object.getWorldPosition(new THREE.Vector3());
    return shipTarget.point;
}

function onWaypointArrived() {
    const pos = ship.position.clone();
    let color = 0x00ffcc;

    if (shipTarget.kind === 'portal') {
        color = 0xb44bff;
        missionDone = true;
        missionEnding = false;
        patrolCenter = PORTAL_POSITION.clone();
        setMission('Misión completada · Destino alcanzado', 'done');
        addLog('DESTINO FINAL ALCANZADO — Misión completada.');

        spawnArrivalPulse(pos, color);
        gsap.to(portal.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 0.6, yoyo: true, repeat: 3, ease: 'power1.inOut' });
        gsap.to(portal.rotation, { z: Math.PI * 2, duration: 2.4, ease: 'power2.inOut' });
        if (portalGlow) {
            gsap.fromTo(portalGlow.material, { opacity: 1 }, { opacity: 0.55, duration: 2 });
        }
    } else {
        if (shipTarget.kind === 'node' && shipTarget.object) {
            const entry = [...nodesMap.values()].find(n => n.planet === shipTarget.object);
            if (entry && !entry.visited) entry.visited = true;
        }
        if (shipTarget.kind === 'station' && shipTarget.name) {
            const st = [...stationsMap.values()].find(s => s.name === shipTarget.name);
            if (st) {
                st.visited = true;
                color = st.color;
                gsap.fromTo(st.core.rotation, { y: 0 }, { y: Math.PI * 2, duration: 1.2, ease: 'power2.out' });
            }
        }
        spawnArrivalPulse(pos, color);
        addLog(`Objetivo alcanzado: ${shipTarget.name}`);
    }

    shipTarget.object = null;
    shipTarget.point = null;
    shipTarget.kind = null;
    shipTarget.name = null;

    if (waypointQueue.length > 0) {
        dispatchNextWaypoint();
    } else if (!missionDone) {
        if (missionEnding) {
            setMission('Destino final en ruta…', 'working');
        } else {
            setMission(`Paso ${missionStep} · En espera de siguiente acción`, 'working');
        }
    }
}

function updateShip(dt, elapsed) {
    const target = currentTargetPosition();

    /* Velocidad real (suavizada) */
    const frameSpeed = lastShipPos.distanceTo(ship.position) / Math.max(dt, 0.001);
    lastShipPos.copy(ship.position);
    smoothSpeed += (frameSpeed - smoothSpeed) * Math.min(1, dt * 4);

    if (target) {
        const toTarget = target.clone().sub(ship.position);
        const dist = toTarget.length();

        if (dist < 3.2) {
            onWaypointArrived();
        } else {
            const step = Math.min(SHIP_SPEED * dt, dist);
            toTarget.normalize();
            ship.position.addScaledVector(toTarget, step);

            lookHelper.position.copy(ship.position);
            lookHelper.lookAt(target);
            ship.quaternion.slerp(lookHelper.quaternion, Math.min(1, dt * 5));

            /* Alabeo al girar (estilo vuelo real) */
            let yaw = Math.atan2(toTarget.x, toTarget.z) - Math.atan2(lastMoveDir.x, lastMoveDir.z);
            if (yaw > Math.PI) yaw -= Math.PI * 2;
            if (yaw < -Math.PI) yaw += Math.PI * 2;
            lastMoveDir.copy(toTarget);
            const bankTarget = THREE.MathUtils.clamp((yaw / Math.max(dt, 0.001)) * 0.04, -0.5, 0.5);
            bankAngle += (bankTarget - bankAngle) * Math.min(1, dt * 4);
            ship.rotateZ(bankAngle);
        }
    } else {
        const orbitAngle = elapsed * 0.25;
        const patrol = new THREE.Vector3(
            patrolCenter.x + Math.cos(orbitAngle) * 9,
            patrolCenter.y + Math.sin(elapsed * 0.7) * 2.5,
            patrolCenter.z + Math.sin(orbitAngle) * 9
        );
        const toPatrol = patrol.sub(ship.position);
        if (toPatrol.length() > 0.3) {
            ship.position.addScaledVector(toPatrol.normalize(), Math.min(6 * dt, toPatrol.length()));
            lookHelper.position.copy(ship.position);
            lookHelper.lookAt(patrolCenter);
            ship.quaternion.slerp(lookHelper.quaternion, Math.min(1, dt * 2));
            bankAngle += (0 - bankAngle) * Math.min(1, dt * 3);
            ship.rotateZ(bankAngle);
        }
    }

    /* Estela */
    const last = trailPoints[trailPoints.length - 1];
    if (!last || last.distanceToSquared(ship.position) > 0.06) {
        trailPoints.push(ship.position.clone());
        if (trailPoints.length > TRAIL_MAX) trailPoints.shift();
        rebuildTrail();
    }

    /* Motores */
    if (engineFlame) {
        const flicker = 2.4 + Math.sin(elapsed * 24) * 0.5 + Math.random() * 0.3;
        engineFlame.scale.setScalar(target ? flicker : flicker * 0.5);
        engineFlame.material.opacity = target ? 0.85 : 0.45;
    }
    if (engineGlow) {
        engineGlow.scale.setScalar(5 + Math.sin(elapsed * 9) * 0.9);
    }

    /* Hipervuelo en el HUD */
    const wantWarp = !!target;
    if (hudFx && wantWarp !== warpActive) {
        warpActive = wantWarp;
        hudFx.classList.toggle('warp', wantWarp);
    }

    /* Panel de telemetría */
    telAccum += dt;
    if (telAccum > 0.15) {
        telAccum = 0;
        if (telVel) telVel.textContent = Math.round(smoothSpeed);
        if (telObj) telObj.textContent = shipTarget.name || (waypointQueue.length ? waypointQueue[0].name : 'Patrulla');
        if (telDist) telDist.textContent = target ? ship.position.distanceTo(target).toFixed(1) + ' u' : '—';
        if (telHyper) {
            const on = smoothSpeed > SHIP_SPEED * 0.5;
            telHyper.textContent = on ? 'HIPER' : 'IDLE';
            telHyper.classList.toggle('on', on);
        }

        /* Velocímetro analógico */
        const spd = Math.min(smoothSpeed / 60, 1);
        if (speedoNeedle) speedoNeedle.setAttribute('transform', `rotate(${(-110 + spd * 220).toFixed(1)} 66 68)`);
        if (speedoVal) speedoVal.textContent = Math.round(smoothSpeed);

        /* Barra de potencia */
        const lit = smoothSpeed < 4 ? 0 : smoothSpeed < 12 ? 1 : smoothSpeed < 22 ? 2 : smoothSpeed < 27 ? 3 : 4;
        pwrBars.forEach((b, i) => b.classList.toggle('on', i < lit));

        /* Navegación: coordenadas y rumbo */
        const fwdVec = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion);
        if (navXyz) {
            navXyz.textContent = `X ${ship.position.x.toFixed(1)} · Y ${ship.position.y.toFixed(1)} · Z ${ship.position.z.toFixed(1)}`;
        }
        if (navHdg) {
            const hdg = (Math.atan2(fwdVec.x, -fwdVec.z) * 180 / Math.PI + 360) % 360;
            navHdg.textContent = String(Math.round(hdg) % 360).padStart(3, '0') + '°';
        }

        /* Computadora de navegación (tarjeta superior) */
        if (target && wpCard) {
            const rel = target.clone().sub(ship.position);
            const nz = new THREE.Vector3(fwdVec.x, 0, fwdVec.z).normalize();
            const side = rel.x * nz.z + rel.z * (-nz.x);
            const up = rel.x * nz.x + rel.z * nz.z;
            const bearing = Math.atan2(side, up) * 180 / Math.PI;
            if (wpArrow) wpArrow.style.transform = `rotate(${bearing.toFixed(1)}deg)`;
            if (wpName) wpName.textContent = shipTarget.name || '—';
            if (wpDist) wpDist.textContent = ship.position.distanceTo(target).toFixed(1) + ' u';
            wpCard.classList.add('show');
        } else if (wpCard) {
            wpCard.classList.remove('show');
        }
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

    /* Rotación: proa de la nave arriba */
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion);
    let fx = fwd.x;
    let fz = fwd.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    const rx = fz;
    const rz = -fx;

    function toScreen(p) {
        const dx = p.x - ship.position.x;
        const dz = p.z - ship.position.z;
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

    /* Objetivo actual */
    const target = currentTargetPosition();
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

function updateCamera(dt) {
    if (performance.now() < userControlUntil) return;

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion);
    const desired = ship.position.clone()
        .addScaledVector(forward, -30)
        .add(new THREE.Vector3(0, 13, 0));

    camera.position.lerp(desired, Math.min(1, dt * 1.6));
    controls.target.lerp(ship.position, Math.min(1, dt * 2.5));
}

/* ───────────────────────── SignalR ───────────────────────── */

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/constellationHub")
    .withAutomaticReconnect()
    .build();

connection.on("OnCodeGraphLoaded", (graph) => {
    addLog("Sistema solar recibido. Desplegando planetas...");
    buildSolarSystem(graph);
});

connection.on("OnAgentStateChanged", (data) => {
    const skill = data.skill || '';
    const target = data.target || '';

    const logLabels = {
        Error: '[ERROR]',
        Cuota: '[CUOTA]',
        Config: '[CONFIG]',
        Reintentando: '[AVISO 429]',
        Proveedor: '[PROVEEDOR]'
    };
    const logClass = { Error: 'err', Cuota: 'err', Config: 'err', Reintentando: 'err' };

    if (logLabels[skill]) addLog(`${logLabels[skill]} ${target}`, logClass[skill] || 'sys');
    else addLog(`Skill: ${skill} -> ${target}`);

    if (skill === 'Agente') {
        setMission('Analizando la petición…', 'working');
        return;
    }

    if (skill === 'Cuota') {
        setMission(`Cuota agotada · ${target}`, 'error');
        return;
    }

    if (skill === 'Config') {
        setMission(`Configuración · ${target}`, 'error');
        return;
    }

    if (skill === 'Reintentando') {
        setMission(target, 'error');
        return;
    }

    if (skill === 'Proveedor') {
        setMission(target, 'working');
        return;
    }

    if (skill === 'Error') {
        missionStep++;
        setMission(`Error: ${target}`, 'error');
        const st = getOrCreateStation(`error-${target.slice(0, 30)}`, 'ERROR', SKILL_COLORS.Error);
        enqueueWaypoint(st.station, 'station', 'Error', 'Error');
        return;
    }

    missionStep++;

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
        addLog(`Destino: planeta ${entry.id}`);
        enqueueWaypoint(entry.planet, 'node', entry.id, skill);
    } else {
        const name = target === 'Workspace' ? 'WORKSPACE' : target;
        const st = getOrCreateStation(`${skill}-${target}`, name, skillColor(skill));
        enqueueWaypoint(st.station, 'station', name, skill);
    }
});

connection.on("OnAgentResponse", (data) => {
    addLog('AGENTE: ' + data.text);
    missionEnding = true;
    setMission('Tarea ejecutada · Ruta al destino final…', 'working');
    enqueueWaypoint(portal, 'portal', 'Destino final', 'Portal');
});

connection.start()
    .then(() => addLog('Conectado con SignalR con éxito.'))
    .catch(err => addLog('[ERROR] Error SignalR: ' + err, 'err'));

connection.onclose(err => addLog('[ERROR] Conexión con el servidor cerrada' + (err ? ': ' + err : ''), 'err'));
connection.onreconnected(() => addLog('Conexión SignalR reestablecida.', 'sys'));
connection.onreconnecting(() => addLog('[AVISO] Reconectando con el servidor…', 'err'));

/* ───────────────────────── Inicio de sesión ───────────────────────── */

document.getElementById('btnStart').addEventListener('click', async () => {
    const targetPath = document.getElementById('targetPath').value;
    const prompt = document.getElementById('prompt').value;

    /* Reiniciar misión */
    waypointQueue.length = 0;
    shipTarget.object = null;
    shipTarget.point = null;
    shipTarget.kind = null;
    shipTarget.name = null;
    missionStep = 0;
    missionEnding = false;
    missionDone = false;
    patrolCenter = BASE_POSITION.clone();
    ship.position.copy(BASE_POSITION);
    ship.quaternion.identity();
    bankAngle = 0;
    lastMoveDir.set(0, 0, 1);
    lastShipPos.copy(ship.position);
    smoothSpeed = 0;
    resetTrail();
    clearGroup(stationsGroup);
    stationsMap.clear();
    if (portal) portal.scale.setScalar(1);
    setMission('Despegando…', 'working');
    addLog('Enviando petición de orquestación...');
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
            addLog(`[ERROR] No se pudo iniciar la misión: ${reason}`, 'err');
            setMission('Error al iniciar la misión', 'error');
            document.body.classList.remove('launching');
            return;
        }

        if (!data.sessionId) {
            addLog('[ERROR] El servidor no devolvió un id de sesión.', 'err');
            setMission('Error al iniciar la misión', 'error');
            document.body.classList.remove('launching');
            return;
        }

        addLog(`Sesión creada: ${data.sessionId}`);
        connection.invoke('JoinSession', data.sessionId);

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
        addLog('[ERROR] No se pudo iniciar sesión: ' + err, 'err');
        setMission('Error al iniciar la misión', 'error');
        document.body.classList.remove('launching');
    }
});

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
        const pulse = 34 + Math.sin(elapsed * 1.3) * 3.5;
        sunGlow.scale.setScalar(pulse);
    }

    if (portal) {
        portal.rotation.y += dt * 0.4;
        if (portalRingInner) portalRingInner.rotation.z -= dt * 0.9;
    }

    if (baseMarker) {
        if (baseMarker.userData.rotor) baseMarker.userData.rotor.rotation.y += dt * 0.35;
        const beacons = baseMarker.userData.beacons;
        if (beacons) {
            const pulse = 0.5 + Math.abs(Math.sin(elapsed * 2.6)) * 1.5;
            beacons.forEach(b => { b.material.emissiveIntensity = pulse; });
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
        st.glow.scale.setScalar(8 * boost * (1 + Math.sin(elapsed * 2.4) * 0.18));
    });

    folderBasesList.forEach(f => {
        if (f.core) f.core.rotation.y += dt * 0.7;
        if (f.ring) f.ring.rotation.z += dt * 0.5;
        if (f.glow) f.glow.scale.setScalar(f.baseGlow * (1 + Math.sin(elapsed * 2.2 + f.phase) * 0.16));
    });

    updateShip(dt, elapsed);
    drawRadar(elapsed);
    updateCamera(dt);

    controls.update();
    if (composer) composer.render();
    else renderer.render(scene, camera);
}

resetTrail();
lastShipPos.copy(ship.position);
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
