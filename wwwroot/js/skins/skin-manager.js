/* ─────────────────────────────────────────────────────────────────────────
   SkinManager — conmutador de interfaz gráfica para la consola /Agent.

   Permite alternar entre la constelación "galaxia" (escena original) y
   nuevas skins (p. ej. "cerebro") sin duplicar la app. Cada skin expone un
   ciclo de vida { activate, deactivate } y el gestor:
     - oculta/muestra el contenedor del canvas correspondiente,
     - pausa la animación de la skin inactiva (ahorra GPU),
     - persiste la elección en localStorage.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    const STORAGE_KEY = 'consola.skin';
    const registry = new Map();   // id -> { label, containerId, activate, deactivate }
    let currentId = null;

    function register(id, def) {
        registry.set(id, def);
    }

    function persist(id) {
        try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* modo privado */ }
    }

    function restore() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function getContainer(id) {
        const def = registry.get(id);
        return def && def.containerId ? document.getElementById(def.containerId) : null;
    }

    function showOnly(activeId) {
        registry.forEach((def, id) => {
            const el = getContainer(id);
            if (el) el.style.display = (id === activeId) ? 'block' : 'none';
        });
    }

    function apply(id) {
        const def = registry.get(id);
        if (!def) return;

        /* Desactivar la anterior */
        if (currentId && registry.has(currentId)) {
            const prev = registry.get(currentId);
            if (typeof prev.deactivate === 'function') {
                try { prev.deactivate(); } catch (e) { console.warn('[Skin] deactivate falló:', e); }
            }
        }

        currentId = id;
        showOnly(id);

        /* Activar la nueva */
        if (typeof def.activate === 'function') {
            try { def.activate(); } catch (e) { console.warn('[Skin] activate falló:', e); }
        }

        persist(id);
        renderToggle();
        document.body.dataset.skin = id;
        window.dispatchEvent(new CustomEvent('skinchange', { detail: { id } }));
    }

    /* ── Botón conmutador (se auto-inserta junto al control de vista) ── */
    let toggleEl = null;

    function buildToggle() {
        if (toggleEl) return;
        const anchor = document.getElementById('view-control');
        const wrap = document.createElement('div');
        wrap.id = 'skin-control';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', 'Interfaz gráfica');

        const title = document.createElement('span');
        title.className = 'sk-title';
        title.textContent = 'Interfaz';
        wrap.appendChild(title);

        const list = document.createElement('div');
        list.id = 'skin-list';
        wrap.appendChild(list);

        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
        else document.body.appendChild(wrap);

        toggleEl = wrap;
    }

    function renderToggle() {
        buildToggle();
        const list = document.getElementById('skin-list');
        if (!list) return;
        list.innerHTML = '';
        registry.forEach((def, id) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sk-item' + (id === currentId ? ' active' : '');
            b.textContent = def.label || id;
            b.addEventListener('click', () => { if (id !== currentId) apply(id); });
            list.appendChild(b);
        });
    }

    /* ── API pública ── */
    window.SkinManager = {
        register,
        isActive: (id) => id === currentId,
        switchTo: apply,
        start: (defaultId) => {
            /* Prioridad: preferencia guardada > defaultId > primera registrada */
            const saved = restore();
            const target = (saved && registry.has(saved))
                ? saved
                : (defaultId || [...registry.keys()][0]);
            apply(registry.has(target) ? target : [...registry.keys()][0]);
        },
        list: () => [...registry.keys()]
    };

    /* Al cargar la página, registrar skins y arrancar con la persistida.
       Se engancha a DOMContentLoaded para asegurar que #canvas-container existe. */
    document.addEventListener('DOMContentLoaded', () => {
        /* Skin por defecto: la galaxia (constellation.js). Usa el mismo
           contenedor que siempre; solo lo pausa/reanuda al conmutar. */
        window.SkinManager.register('galaxia', {
            label: 'Galaxia',
            containerId: 'canvas-container',
            activate: () => { if (typeof window.__galaxyResume === 'function') window.__galaxyResume(); },
            deactivate: () => { if (typeof window.__galaxyPause === 'function') window.__galaxyPause(); }
        });

        /* Skin cerebro (si su script cargó). */
        if (window.BrainScene) {
            window.SkinManager.register('cerebro', {
                label: 'Cerebro',
                containerId: 'brain-container',
                activate: window.BrainScene.activate,
                deactivate: window.BrainScene.deactivate
            });
            if (typeof window.BrainScene.bindEvents === 'function') window.BrainScene.bindEvents();
        }

        window.SkinManager.start('galaxia');
    });
})();
