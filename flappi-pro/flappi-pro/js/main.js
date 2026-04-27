/* ============================================================
 * main.js — Bootstrap
 * Instancia el juego y lo arranca cuando el DOM está listo.
 * ============================================================ */
(function bootstrap() {
    'use strict';

    function start() {
        try {
            const game = new Game();
            // Exponer en window para depuración / consola
            window.game = game;
            game.boot();
        } catch (err) {
            console.error('[Flappi Pro] Error al iniciar:', err);
            // Fallback visual mínimo si algo crítico falla
            const loader = document.getElementById('overlay-loading');
            if (loader) {
                const txt = loader.querySelector('.loader-text');
                if (txt) txt.textContent = 'Error al iniciar el juego';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
