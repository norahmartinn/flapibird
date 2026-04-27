/* ============================================================
   ui.js
   DOM UI controller. Owns the DOM references for screens, HUD,
   toasts, and the skin / achievement / settings panels. Keeps the
   game.js focused on canvas concerns.
   ============================================================ */
(function () {
    'use strict';

    class UI {
        constructor() {
            // Screens
            this.screens = {
                loading:      document.getElementById('screen-loading'),
                menu:         document.getElementById('screen-menu'),
                tutorial:     document.getElementById('screen-tutorial'),
                countdown:    document.getElementById('screen-countdown'),
                pause:        document.getElementById('screen-pause'),
                gameover:     document.getElementById('screen-gameover'),
                skins:        document.getElementById('screen-skins'),
                achievements: document.getElementById('screen-achievements'),
                settings:     document.getElementById('screen-settings'),
            };

            this.hud = document.getElementById('hud');

            // HUD elements
            this.hudScore   = document.getElementById('hud-score');
            this.hudBest    = document.getElementById('hud-best-value');
            this.combo      = document.getElementById('combo');
            this.comboValue = document.getElementById('combo-value');
            this.toasts     = document.getElementById('toast-container');

            // Menu
            this.menuBird   = document.getElementById('menu-bird-img');

            // Game over
            this.goScore     = document.getElementById('go-score');
            this.goBest      = document.getElementById('go-best');
            this.goMedal     = document.getElementById('go-medal-shape');
            this.goMedalLabel= document.getElementById('go-medal-label');
            this.goStats     = document.getElementById('go-stats');

            // Countdown
            this.countdownNum = document.getElementById('countdown-number');

            // Sky orbs (purely decorative)
            this.skyOrbSun  = document.querySelector('.sky-orb--sun');
            this.skyOrbMoon = document.querySelector('.sky-orb--moon');

            // Game-shell click target for menu skin preview
            this._wireMenuBird();
            this._wireBackButtons();
        }

        _wireMenuBird() {
            // Sync menu bird image with selected skin from save data
            const id = SaveData.getSelectedSkin();
            const skin = GameData.SKINS.find(s => s.id === id) || GameData.SKINS[0];
            this.menuBird.src = skin.src;
        }

        _wireBackButtons() {
            document.querySelectorAll('[data-back-to]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = btn.getAttribute('data-back-to');
                    audio.unlock();
                    audio.sfxButton();
                    this.show(target);
                });
            });
        }

        /* ---------- SCREEN MANAGEMENT ---------- */

        /** Show a single screen, hide the others (panels). */
        show(name) {
            for (const k in this.screens) {
                const el = this.screens[k];
                if (!el) continue;
                if (k === name) el.removeAttribute('hidden');
                else el.setAttribute('hidden', '');
            }
            // HUD only shows when a game is in progress (controlled separately)
        }

        /** Show a transient overlay alongside other screens (e.g. tutorial, countdown, pause). */
        showOverlay(name) {
            const el = this.screens[name];
            if (el) el.removeAttribute('hidden');
        }

        hideOverlay(name) {
            const el = this.screens[name];
            if (el) el.setAttribute('hidden', '');
        }

        hideAll() {
            for (const k in this.screens) {
                if (this.screens[k]) this.screens[k].setAttribute('hidden', '');
            }
        }

        showHUD()  { this.hud.removeAttribute('hidden'); }
        hideHUD()  { this.hud.setAttribute('hidden', ''); }

        /* ---------- HUD UPDATES ---------- */

        setScore(n) {
            this.hudScore.textContent = n;
            // Bump animation
            this.hudScore.classList.remove('bump');
            // Force reflow then re-add to retrigger
            // eslint-disable-next-line no-unused-expressions
            void this.hudScore.offsetWidth;
            this.hudScore.classList.add('bump');
        }

        setBest(n) {
            this.hudBest.textContent = n;
        }

        setCombo(n) {
            if (n >= 2) {
                this.comboValue.textContent = n;
                this.combo.classList.remove('show');
                void this.combo.offsetWidth;
                this.combo.classList.add('show');
            } else {
                this.combo.classList.remove('show');
            }
        }

        clearCombo() { this.combo.classList.remove('show'); }

        /* ---------- TOASTS ---------- */

        toast(title, body, icon = '🏆') {
            const t = document.createElement('div');
            t.className = 'toast';
            t.innerHTML = `
                <span class="toast__icon">${icon}</span>
                <span class="toast__text"><strong>${title}</strong>${body}</span>
            `;
            this.toasts.appendChild(t);
            // Remove after animation completes
            setTimeout(() => t.remove(), 3200);
        }

        /* ---------- COUNTDOWN ---------- */

        async runCountdown() {
            const numbers = ['3', '2', '1', '¡VAMOS!'];
            this.showOverlay('countdown');
            for (let i = 0; i < numbers.length; i++) {
                this.countdownNum.textContent = numbers[i];
                // Restart animation
                this.countdownNum.style.animation = 'none';
                void this.countdownNum.offsetWidth;
                this.countdownNum.style.animation = '';
                if (i === numbers.length - 1) audio.sfxCountdownGo();
                else audio.sfxCountdown();
                await new Promise(r => setTimeout(r, 700));
            }
            this.hideOverlay('countdown');
        }

        /* ---------- LOADING ---------- */

        setLoaderProgress(p) {
            const fill = document.getElementById('loader-fill');
            if (fill) fill.style.width = `${Math.round(p * 100)}%`;
        }

        hideLoader() {
            const el = this.screens.loading;
            if (!el) return;
            el.classList.add('fade-out');
            setTimeout(() => el.setAttribute('hidden', ''), 450);
        }

        /* ---------- GAME OVER ---------- */

        showGameOver(stats) {
            this.goScore.textContent = stats.score;
            this.goBest.textContent  = stats.best;

            // Determine medal
            const tier = GameData.MEDAL_TIERS.find(m => stats.score >= m.minScore) || GameData.MEDAL_TIERS[GameData.MEDAL_TIERS.length - 1];
            this.goMedal.setAttribute('data-tier', tier.tier);
            this.goMedalLabel.textContent = tier.label;

            // Stats line
            const newBest = stats.score > 0 && stats.score >= stats.best;
            const piecesHTML = [
                stats.maxCombo > 1 ? `<span class="gameover-stats__item"><strong>x${stats.maxCombo}</strong>combo</span>` : '',
                stats.duration ? `<span class="gameover-stats__item"><strong>${stats.duration.toFixed(1)}s</strong>tiempo</span>` : '',
                newBest ? `<span class="gameover-stats__item" style="color:var(--c-gold)"><strong>NUEVO RÉCORD</strong>¡felicidades!</span>` : '',
            ].filter(Boolean).join('');
            this.goStats.innerHTML = piecesHTML;

            this.show('gameover');
            this.hideHUD();
        }

        /* ---------- SKIN GRID ---------- */

        renderSkinGrid(onSelect) {
            const grid = document.getElementById('skins-grid');
            grid.innerHTML = '';
            const unlocked = SaveData.getUnlockedSkins();
            const selected = SaveData.getSelectedSkin();
            const bestScore = SaveData.getBest();

            GameData.SKINS.forEach(skin => {
                const isUnlocked = unlocked.includes(skin.id) ||
                                   (skin.unlock.type === 'score' && bestScore >= skin.unlock.value);
                if (isUnlocked && !unlocked.includes(skin.id)) {
                    SaveData.unlockSkin(skin.id);
                }
                const isSelected = selected === skin.id;

                const card = document.createElement('button');
                card.className = `skin-card${isSelected ? ' selected' : ''}${isUnlocked ? '' : ' locked'}`;
                card.innerHTML = `
                    <img class="skin-card__img" src="${skin.src}" alt="">
                    <div>
                        <div class="skin-card__name">${skin.name}</div>
                        <div class="skin-card__req">${isUnlocked ? skin.description : skin.description}</div>
                    </div>
                    ${!isUnlocked ? '<div class="skin-card__lock">🔒</div>' : ''}
                `;
                if (isUnlocked) {
                    card.addEventListener('click', () => {
                        audio.sfxButton();
                        onSelect(skin.id);
                        this.menuBird.src = skin.src;
                        // Re-render to update selection ring
                        this.renderSkinGrid(onSelect);
                    });
                }
                grid.appendChild(card);
            });
        }

        /* ---------- ACHIEVEMENTS LIST ---------- */

        renderAchievementList() {
            const list = document.getElementById('achievements-list');
            list.innerHTML = '';
            const unlocked = SaveData.getUnlockedAchievements();
            const counter  = document.getElementById('achievements-progress');
            counter.textContent = `${unlocked.length} / ${GameData.ACHIEVEMENTS.length}`;

            GameData.ACHIEVEMENTS.forEach(a => {
                const isUnlocked = unlocked.includes(a.id);
                const row = document.createElement('div');
                row.className = `ach-row${isUnlocked ? ' unlocked' : ''}`;
                row.innerHTML = `
                    <div class="ach-row__icon">${a.icon}</div>
                    <div>
                        <div class="ach-row__title">${a.name}</div>
                        <div class="ach-row__desc">${a.description}</div>
                    </div>
                    <div class="ach-row__check">${isUnlocked ? '✔' : '○'}</div>
                `;
                list.appendChild(row);
            });
        }

        /* ---------- SETTINGS UI ---------- */

        renderSettings() {
            const s = SaveData.getSettings();
            document.getElementById('set-music').checked = s.music;
            document.getElementById('set-sfx').checked   = s.sfx;
            document.getElementById('set-vibe').checked  = s.vibrate;
            document.getElementById('set-low').checked   = s.lowEffects;
            document.getElementById('set-night').checked = s.forceNight;
        }

        /* ---------- COSMETIC: animated sky orbs visibility ---------- */

        showSunMoon(showSun, showMoon) {
            this.skyOrbSun.style.opacity  = showSun  ? '1' : '0';
            this.skyOrbMoon.style.opacity = showMoon ? '1' : '0';
        }
    }

    window.UI = new UI();
})();
