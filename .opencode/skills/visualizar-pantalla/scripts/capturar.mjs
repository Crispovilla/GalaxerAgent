#!/usr/bin/env node
/**
 * Captura la pantalla del proyecto ASP.NET (con login si hace falta).
 *
 * Uso:
 *   node capturar.mjs [ruta] [--out=archivo.png] [--wait=6000] [--anon]
 *
 *   node capturar.mjs /Agent
 *   node capturar.mjs / --out=$TEMP/opencode/home.png
 *
 * Credenciales (para pantallas protegidas):
 *   %USERPROFILE%\.config\opencode\agent-ui-creds.json  { "user": "...", "pass": "..." }
 *   o variables de entorno AGENT_UI_USER / AGENT_UI_PASS
 *
 * Sale con: 0 ok | 2 requiere login (sin creds) | 3 login fallido | 4 app no responde
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const PREFIX = path.join(os.tmpdir(), 'opencode', 'ui-captura');
const OUT_DIR = path.join(os.tmpdir(), 'opencode');

function loadPlaywright() {
    try {
        return require(path.join(PREFIX, 'node_modules', 'playwright-core'));
    } catch {
        console.error('[setup] Instalando playwright-core (solo la primera vez)...');
        execSync(`npm install playwright-core --prefix "${PREFIX}" --no-fund --no-audit`,
            { stdio: 'inherit', timeout: 180000 });
        return require(path.join(PREFIX, 'node_modules', 'playwright-core'));
    }
}

function loadCreds() {
    if (process.env.AGENT_UI_USER && process.env.AGENT_UI_PASS) {
        return { user: process.env.AGENT_UI_USER, pass: process.env.AGENT_UI_PASS };
    }
    const p = path.join(process.env.USERPROFILE || os.homedir(),
        '.config', 'opencode', 'agent-ui-creds.json');
    try {
        const raw = fs.readFileSync(p, 'utf8').replace(/^ï»¿/, '');
        const j = JSON.parse(raw);
        if (j.user && j.pass) return j;
    } catch { }
    return null;
}

const args = process.argv.slice(2);
const flag = (name, def) => {
    const a = args.find(x => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : def;
};
const anon = args.includes('--anon');
const route = (args.find(x => !x.startsWith('--')) || '/Agent');
const baseUrl = process.env.APP_URL || 'http://localhost:5031';
const out = flag('out', path.join(OUT_DIR, 'pantalla.png'));
const waitMs = parseInt(flag('wait', route.includes('Agent') ? '6000' : '2500'), 10);

fs.mkdirSync(path.dirname(out), { recursive: true });

// Â¿La app responde?
try {
    const r = await fetch(baseUrl, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
    if (r.status >= 500) throw new Error('500');
} catch {
    console.error(`[ERROR] La app no responde en ${baseUrl}. LevÃ¡ntala: dotnet run --launch-profile http`);
    process.exit(4);
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--hide-scrollbars']
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const problems = [];
page.on('pageerror', e => problems.push('[JS] ' + e.message));
page.on('console', m => { if (m.type() === 'error') problems.push('[console] ' + m.text()); });

const url = route.startsWith('http') ? route : baseUrl.replace(/\/$/, '') + route;
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

let finalUrl = page.url();
if (finalUrl.includes('Account/Login')) {
    if (anon) {
        console.error('[AVISO] Redirige a login (pantalla protegida). Usa credenciales para verla.');
        await page.screenshot({ path: out });
        console.log('OK ' + out + ' (login)');
        await browser.close();
        process.exit(2);
    }
    const creds = loadCreds();
    if (!creds) {
        console.error('[ERROR] Se requiere login y no hay credenciales en agent-ui-creds.json');
        await browser.close();
        process.exit(2);
    }
    await page.fill('#Input_Email', creds.user);
    await page.fill('#Input_Password', creds.pass);
    await Promise.all([
        page.waitForURL(u => !u.toString().includes('Account/Login'), { timeout: 15000 }).catch(() => { }),
        page.click('#login-submit')
    ]);
    finalUrl = page.url();
    if (finalUrl.includes('Account/Login')) {
        console.error('[ERROR] Login fallido (credenciales invÃ¡lidas o cuenta bloqueada).');
        await page.screenshot({ path: out });
        await browser.close();
        process.exit(3);
    }
    if (!route.startsWith('http')) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        finalUrl = page.url();
    }
}

// Esperar montaje de la escena / contenido dinÃ¡mico
if (page.url().includes('/Agent') || route.includes('Agent')) {
    await page.waitForSelector('#canvas-container canvas', { timeout: 15000 }).catch(() => {
        problems.push('[AVISO] No apareciÃ³ el canvas de la constelaciÃ³n');
    });
}
await page.waitForTimeout(waitMs);

await page.screenshot({ path: out });
console.log('OK ' + out);
console.log('URL ' + page.url());
console.log('TITLE ' + await page.title());
if (problems.length) {
    console.log('PROBLEMAS:');
    for (const p of problems.slice(0, 20)) console.log('  ' + p);
}
await browser.close();
