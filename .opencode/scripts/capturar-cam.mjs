/**
 * capturar-cam.mjs — captura la constelación con cámara libre controlada.
 *
 * Uso:
 *   node .opencode/scripts/capturar-cam.mjs --view=folders --setup=deathstar \
 *     --cam=14,101,18 --tgt=3.5,94.5,2.5 --out=ds4.png [--wait=2500] [--lock=0:0.25]
 *
 * Flags:
 *   --view   base | solar | folders        (setViewMode; opcional si --setup lo hace)
 *   --setup  deathstar | none              (deathstar: renderFolderBases + folders)
 *   --cam    px,py,pz                      (obligatorio)
 *   --tgt    tx,ty,tz                      (obligatorio)
 *   --out    ruta del PNG                  (default %TEMP%\opencode\cam.png)
 *   --wait   ms de espera tras el setup    (default 2500)
 *   --lock   "indiceBase:rotY"             (congela el giro de una base de carpeta)
 *
 * Login automático con agent-ui-creds.json; errores JS de la página en stdout [JS].
 * Códigos: 0 ok · 4 app no responde · 1 error.
 */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const PREFIX = path.join(os.tmpdir(), 'opencode', 'ui-captura');
const { chromium } = require(path.join(PREFIX, 'node_modules', 'playwright-core'));
const BASE = 'http://localhost:5031';
const log = (...a) => console.log(...a);

const argv = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const m = a.match(/^--([^=]+)(?:=(.*))?$/);
        return m ? [m[1], m[2] ?? true] : [a, true];
    })
);

if (!argv.cam || !argv.tgt) {
    log('Uso: capturar-cam.mjs --cam=x,y,z --tgt=x,y,z [--view=folders] [--setup=deathstar] [--out=f.png] [--wait=2500] [--lock=0:0.25]');
    process.exit(1);
}
const cam = String(argv.cam).split(',').map(Number);
const tgt = String(argv.tgt).split(',').map(Number);
const outArg = argv.out ? String(argv.out) : 'cam.png';
const out = path.isAbsolute(outArg) ? outArg : path.join(os.tmpdir(), 'opencode', outArg);
const wait = Number(argv.wait ?? 2500);
if (cam.length !== 3 || cam.some(Number.isNaN) || tgt.length !== 3 || tgt.some(Number.isNaN)) {
    log('[SCRIPT] --cam y --tgt deben ser x,y,z numéricos');
    process.exit(1);
}

const creds = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.config', 'opencode', 'agent-ui-creds.json'), 'utf8')
        .replace(/^\uFEFF/, '').replace(/^ï»¿/, '')
);

const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => log('[JS] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') log('[JS] ' + m.text()); });

let exitCode = 0;
try {
    await page.goto(BASE + '/Agent', { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (page.url().includes('Account/Login')) {
        await page.fill('#Input_Email', creds.user);
        await page.fill('#Input_Password', creds.pass);
        await Promise.all([
            page.waitForURL((u) => !u.toString().includes('Account/Login'), { timeout: 15000 }),
            page.click('#login-submit'),
        ]);
        await page.goto(BASE + '/Agent', { waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    await page.waitForSelector('#canvas-container canvas', { timeout: 15000 });
    await page.waitForTimeout(5000);

    if (argv.setup === 'deathstar') {
        await page.evaluate(() => {
            renderFolderBases('C:/Proyecto/Core-9-IA', [
                'Controllers', 'Dtos', 'Entities', 'Interfaces', 'Persistence',
                'Services', 'Views', 'wwwroot', 'Models', 'Scripts', 'docs', 'tests',
            ]);
            setViewMode('folders');
        });
    } else if (argv.view) {
        await page.evaluate((v) => setViewMode(v), String(argv.view));
    }
    if (argv.eval) {
        await page.evaluate('(() => {' + String(argv.eval) + '})()');
    }
    await page.waitForTimeout(wait);

    if (argv.lock) {
        const [idx, rotY] = String(argv.lock).split(':').map(Number);
        await page.evaluate(([i, r]) => {
            window.__camLock = setInterval(() => { folderBasesList[i].core.rotation.y = r; }, 25);
        }, [idx, rotY]);
    }

    const setCam = async () => {
        await page.evaluate(([a, b, c, d, e, f]) => {
            camTween = false;
            camera.position.set(a, b, c);
            controls.target.set(d, e, f);
            controls.update();
        }, [...cam, ...tgt]);
    };
    await setCam();
    await page.waitForTimeout(300);
    await setCam(); // segundo set: gana al tween de GSAP si aún corría
    await page.waitForTimeout(500);

    await page.screenshot({ path: out });
    log('OK ' + out);
} catch (e) {
    log('[SCRIPT] ' + e.message);
    exitCode = /ERR_|net::|ECONNREFUSED|timeout/i.test(e.message) ? 4 : 1;
} finally {
    await browser.close();
}
process.exit(exitCode);
