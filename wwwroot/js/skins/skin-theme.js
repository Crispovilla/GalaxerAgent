/* ─────────────────────────────────────────────────────────────────────────
   skin-theme — re-tematización de la interfaz según la skin activa.

   La skin define la escena 3D, pero la consola (título, subtítulo, icono,
   botón, etiqueta de misión, telemetría, log de arranque y tablero inferior)
   también debe cambiar de identidad. Este módulo aplica esos textos/iconos
   y alterna el tablero: el velocímetro/radar del Halcón se ocultan y se
   muestra un tablero neural con un neurograma (EEG) en vivo y estadísticas
   leídas de BrainScene.

   Se suscribe al evento 'skinchange' que despacha SkinManager y también
   aplica el tema al cargar (DOMContentReady) usando body[data-skin].
   ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    /* ── Iconos del encabezado ── */
    const FALCON_ICON = [
        '<circle cx="19" cy="25" r="12.5" fill="none" stroke="currentColor" stroke-width="2" />',
        '<rect x="12.5" y="6" width="4.5" height="13" rx="1.4" fill="currentColor" />',
        '<rect x="21" y="6" width="4.5" height="13" rx="1.4" fill="currentColor" />',
        '<circle cx="33" cy="16" r="3" fill="currentColor" />'
    ].join('');

    /* Red neuronal: nodos + sinapsis */
    const BRAIN_ICON = [
        '<circle cx="13" cy="13" r="3.1" fill="none" stroke="currentColor" stroke-width="2" />',
        '<circle cx="13" cy="27" r="3.1" fill="none" stroke="currentColor" stroke-width="2" />',
        '<circle cx="27" cy="20" r="3.6" fill="currentColor" />',
        '<line x1="13" y1="13" x2="27" y2="20" stroke="currentColor" stroke-width="1.6" />',
        '<line x1="13" y1="27" x2="27" y2="20" stroke="currentColor" stroke-width="1.6" />',
        '<line x1="13" y1="13" x2="13" y2="27" stroke="currentColor" stroke-width="1.6" />'
    ].join('');

    const THEMES = {
        galaxia: {
            title: 'Halcón Milenario',
            subtitle: '// Consola de Mando · Agente IA',
            icon: FALCON_ICON,
            start: 'Iniciar Hiperimpulsor',
            missionLabel: 'Misión',
            boot: '[Sistema] Halcón Milenario en plataforma — motores listos.',
            telKeys: ['Vel', 'Objetivo', 'Dist', 'Motor'],
            viewLabels: { base: 'Base de control', solar: 'Sistema solar', folders: 'Carpetas' },
            drive: 'galaxy'
        },
        cerebro: {
            title: 'NeuroNexo',
            subtitle: '// Consola Neural · Agente IA',
            icon: BRAIN_ICON,
            start: 'Iniciar Proceso Neural',
            missionLabel: 'Proceso',
            boot: '[Red] Cerebro central en línea — sinapsis listas.',
            telKeys: ['Señal', 'Fase', 'Neuronas', 'Estado'],
            viewLabels: { base: 'Vista general', solar: 'Red completa', folders: 'Regiones' },
            drive: 'brain'
        }
    };

    let rafId = null;
    const WAVE_LEN = 96;
    const wave = [];
    let gramCtx = null;

    function el(id) { return document.getElementById(id); }

    /* ── Aplica los textos/iconos/etiquetas de la skin ── */
    function applyTheme(id) {
        const t = THEMES[id] || THEMES.galaxia;

        const title = el('panel-title'); if (title) title.textContent = t.title;
        const subtitle = el('panel-subtitle'); if (subtitle) subtitle.textContent = t.subtitle;
        const icon = el('ship-icon'); if (icon) icon.innerHTML = t.icon;
        const btn = el('btnStart'); if (btn) btn.textContent = t.start;
        const mlabel = el('mission-label'); if (mlabel) mlabel.textContent = t.missionLabel;
        const boot = el('boot-line'); if (boot) boot.textContent = t.boot;

        document.querySelectorAll('#telemetry .tel-k').forEach((k, i) => {
            if (t.telKeys[i]) k.textContent = t.telKeys[i];
        });

        /* Control de vista: etiquetas por skin + refresco */
        window.__viewLabels = t.viewLabels || {};
        if (typeof window.refreshViewControl === 'function') window.refreshViewControl();

        if (t.drive === 'brain') startBrainDrive();
        else stopBrainDrive();
    }

    /* ── Tablero neural en vivo (neurograma + estadísticas) ── */
    function startBrainDrive() {
        if (rafId) return;
        const cv = el('neuro-gram');
        if (cv) gramCtx = cv.getContext('2d');
        wave.length = 0;
        const loop = () => { rafId = requestAnimationFrame(loop); drawBrainDash(); };
        loop();
    }

    function stopBrainDrive() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        gramCtx = null;
        wave.length = 0;
        /* La galaxia reescribe la telemetría al reanudar su bucle. */
    }

    function drawBrainDash() {
        const bs = (window.BrainScene && window.BrainScene.stats) ? window.BrainScene.stats() : null;
        const act = (window.BrainScene && window.BrainScene.activity) ? window.BrainScene.activity() : 0;

        wave.push(act);
        while (wave.length > WAVE_LEN) wave.shift();

        drawNeurogram();

        if (!bs) return;
        const fase = el('brain-fase'); if (fase) fase.textContent = faseLabel(bs.fase);
        const syn = el('brain-syn'); if (syn) syn.textContent = String(bs.pulsos);
        const neu = el('brain-neu'); if (neu) neu.textContent = bs.firing + '/' + bs.neuronas;

        /* Telemetría en vivo con datos del cerebro */
        const v0 = el('tel-vel'); if (v0) v0.textContent = Math.round(act * 100);
        const v1 = el('tel-obj'); if (v1) v1.textContent = faseLabel(bs.fase);
        const v2 = el('tel-dist'); if (v2) v2.textContent = String(bs.neuronas);
        const v3 = el('tel-hyper'); if (v3) { v3.textContent = bs.seq ? 'PROC' : 'IDLE'; v3.classList.remove('on'); }
    }

    function drawNeurogram() {
        if (!gramCtx) return;
        const cv = gramCtx.canvas, w = cv.width, h = cv.height;
        gramCtx.clearRect(0, 0, w, h);

        /* Rejilla sutil */
        gramCtx.strokeStyle = 'rgba(150,110,255,0.14)';
        gramCtx.lineWidth = 1;
        gramCtx.beginPath();
        for (let x = 0; x <= w; x += 23) { gramCtx.moveTo(x + 0.5, 0); gramCtx.lineTo(x + 0.5, h); }
        gramCtx.moveTo(0, h / 2 + 0.5); gramCtx.lineTo(w, h / 2 + 0.5);
        gramCtx.stroke();

        /* Onda de actividad */
        const n = wave.length;
        if (n < 2) return;
        gramCtx.lineWidth = 1.8;
        gramCtx.strokeStyle = '#c39dff';
        gramCtx.shadowColor = 'rgba(180,140,255,0.9)';
        gramCtx.shadowBlur = 6;
        gramCtx.beginPath();
        const now = performance.now();
        for (let i = 0; i < n; i++) {
            const x = (i / (WAVE_LEN - 1)) * w;
            const amp = wave[i] * (h * 0.34);
            const y = h / 2 - Math.sin(i * 0.85 + now * 0.004) * amp;
            if (i === 0) gramCtx.moveTo(x, y); else gramCtx.lineTo(x, y);
        }
        gramCtx.stroke();
        gramCtx.shadowBlur = 0;
    }

    function faseLabel(f) {
        switch (f) {
            case 'input': return 'Entrada';
            case 'analysis': return 'Análisis';
            case 'orchestrate': return 'Orquesta';
            case 'output': return 'Salida';
            default: return 'Reposo';
        }
    }

    /* SkinManager despacha 'skinchange' en cada conmutación (y al arrancar). */
    window.addEventListener('skinchange', (e) => {
        applyTheme(e.detail && e.detail.id);
    });

    /* Respaldo al cargar: aplica la skin vigente por si el evento ya pasó. */
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(document.body.dataset.skin || 'galaxia');
    });
})();
