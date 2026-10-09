import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const PREFIX = path.join(os.tmpdir(), 'opencode', 'ui-captura');
const { chromium } = require(path.join(PREFIX, 'node_modules', 'playwright-core'));
const BASE = 'http://localhost:5031';
const OUT = path.join(os.tmpdir(), 'opencode');
const log = (...a) => console.log(...a);

const creds = JSON.parse(
    fs.readFileSync(path.join(process.env.USERPROFILE, '.config', 'opencode', 'agent-ui-creds.json'), 'utf8')
        .replace(/^\uFEFF/, '').replace(/^ï»¿/, '')
);

const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--enable-unsafe-swiftshader', '--hide-scrollbars']
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => log('[JS] ' + e.message));

try {
    await page.goto(BASE + '/Agent', { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (page.url().includes('Account/Login')) {
        await page.fill('#Input_Email', creds.user);
        await page.fill('#Input_Password', creds.pass);
        await Promise.all([
            page.waitForURL(u => !u.toString().includes('Account/Login'), { timeout: 15000 }),
            page.click('#login-submit')
        ]);
        await page.goto(BASE + '/Agent', { waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    await page.waitForSelector('#canvas-container canvas', { timeout: 15000 });
    await page.waitForTimeout(5000);

    await page.evaluate(() => {
        renderFolderBases('C:/Proyecto/Core-9-IA', [
            'Controllers', 'Dtos', 'Entities', 'Interfaces', 'Persistence',
            'Services', 'Views', 'wwwroot', 'Models', 'Scripts', 'docs', 'tests'
        ]);
        setViewMode('folders');
    });
    await page.waitForTimeout(2500);

    /* congelar giro y apuntar el plato superláser hacia la cámara */
    await page.evaluate(() => {
        window.__dsLock = setInterval(() => { folderBasesList[0].core.rotation.y = 0.25; }, 25);
    });
    await page.evaluate(([a, b, c, d, e, f]) => {
        camTween = false;
        camera.position.set(a, b, c);
        controls.target.set(d, e, f);
        controls.update();
    }, [14, 101, 18, 3.5, 94.5, 2.5]);
    await page.waitForTimeout(300);
    await page.evaluate(([a, b, c, d, e, f]) => {
        camTween = false;
        camera.position.set(a, b, c);
        controls.target.set(d, e, f);
        controls.update();
    }, [14, 101, 18, 3.5, 94.5, 2.5]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'ds4-superlaser.png') });
    log('OK ds4-superlaser.png');

    /* plano general con giro liberado */
    await page.evaluate(() => clearInterval(window.__dsLock));
    await page.evaluate(([a, b, c, d, e, f]) => {
        camTween = false;
        camera.position.set(a, b, c);
        controls.target.set(d, e, f);
        controls.update();
    }, [0, 108, 42, 0, 90, 0]);
    await page.waitForTimeout(300);
    await page.evaluate(([a, b, c, d, e, f]) => {
        camTween = false;
        camera.position.set(a, b, c);
        controls.target.set(d, e, f);
        controls.update();
    }, [0, 108, 42, 0, 90, 0]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'ds5-general.png') });
    log('OK ds5-general.png');
} catch (e) {
    log('[SCRIPT] ' + e.message);
} finally {
    await browser.close();
}
