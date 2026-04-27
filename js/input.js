/* ============================================================
   input.js
   Unified input manager. Translates keyboard, mouse, and touch
   events into game intents (FLAP, PAUSE, UNPAUSE) and dispatches
   them through a small event-emitter. Game.js subscribes.
   ============================================================ */
(function () {
    'use strict';

    class InputManager {
        constructor() {
            this.listeners = {}; // intent -> [fn,...]
            this.bindGlobal();
        }

        on(intent, fn) {
            (this.listeners[intent] ||= []).push(fn);
        }

        emit(intent, evt) {
            const fns = this.listeners[intent];
            if (!fns) return;
            for (let i = 0; i < fns.length; i++) fns[i](evt);
        }

        /** Global event bindings — once at startup. */
        bindGlobal() {
            // ----- KEYBOARD -----
            window.addEventListener('keydown', (e) => {
                if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
                    e.preventDefault();
                    if (e.repeat) return;
                    this.emit('flap', e);
                } else if (e.code === 'Escape' || e.code === 'KeyP') {
                    e.preventDefault();
                    this.emit('pause-toggle', e);
                } else if (e.code === 'KeyR') {
                    this.emit('restart', e);
                }
            });

            // ----- POINTER (mouse + pen + touch unified)
            // We attach to the game shell but ignore clicks on UI buttons,
            // which have their own listeners.
            const shell = document.getElementById('game-shell');
            const isUI = (target) => !!(target.closest && target.closest('.btn, .icon-btn, .skin-card, .switch, .setting-row, .screen--panel, .screen--menu, .screen--gameover, .screen--pause, .screen--settings'));

            // Use pointerdown for the lowest-latency response.
            shell.addEventListener('pointerdown', (e) => {
                if (isUI(e.target)) return;
                // Avoid double-fire from mouse on touch devices
                e.preventDefault();
                this.emit('flap', e);
            }, { passive: false });

            // Prevent context menu on long-press / right-click on the shell
            shell.addEventListener('contextmenu', (e) => {
                if (!isUI(e.target)) e.preventDefault();
            });

            // ----- VISIBILITY — auto-pause when tab hidden
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.emit('window-blur');
            });
            window.addEventListener('blur', () => this.emit('window-blur'));
        }
    }

    window.input = new InputManager();
})();
