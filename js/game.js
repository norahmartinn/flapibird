/* ============================================================
   game.js
   The main Game class. Owns the canvas, the state machine, and
   the update/render loop. Composes Bird + Pipes + Background +
   Particles + Audio + UI.

   STATE MACHINE
   -------------
       LOADING -> MENU -> COUNTDOWN -> PLAYING <-> PAUSED
                                        |
                                        v
                                    GAME_OVER -> MENU / COUNTDOWN
   ============================================================ */
(function () {
    'use strict';

    const STATE = {
        LOADING:    'loading',
        MENU:       'menu',
        COUNTDOWN:  'countdown',
        PLAYING:    'playing',
        PAUSED:     'paused',
        GAME_OVER:  'gameover',
    };

    class Game {
        constructor() {
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false });

            // Canvas logical size (we'll handle DPR scaling in resize())
            this.LOGICAL_W = 480;
            this.LOGICAL_H = 800;

            // State
            this.state = STATE.LOADING;
            this.lastTime = 0;
            this.accumulator = 0;
            this.timeScale = 1;          // for slow-motion
            this.shakeMagnitude = 0;     // current screen shake magnitude
            this.shakeTime = 0;

            // Game objects
            this.background = null;
            this.particles = null;
            this.bird = null;
            this.pipes = [];
            this.images = {};            // skin id -> Image

            // Run state
            this.score = 0;
            this.combo = 0;
            this.maxCombo = 0;
            this.lastScoreTime = 0;
            this.runStartTime = 0;
            this.scoreWithWeather = 0;
            this.totalJumps = 0;

            // Difficulty
            this.scrollSpeed = 150;      // px/s
            this.pipeGap = 200;          // px
            this.pipeInterval = 1.6;     // s
            this.timeSinceLastPipe = 0;

            // Settings (loaded once)
            this.settings = SaveData.getSettings();
        }

        /* ============================================================
           BOOT
           ============================================================ */

        async boot() {
            this.resize();
            window.addEventListener('resize', () => this.resize());

            // Preload all skin images
            await this._preloadAssets();

            // Build background + particles
            this.background = new Background(this.LOGICAL_W, this.LOGICAL_H, { lowEffects: this.settings.lowEffects });
            this.particles  = new ParticleSystem(this.settings.lowEffects ? 120 : 240);

            // Apply settings to audio
            audio.setSfx(this.settings.sfx);
            // Music starts on first user gesture (autoplay policy)

            // Wire UI buttons
            this._wireUI();

            // Subscribe to input
            input.on('flap', () => this._onFlap());
            input.on('pause-toggle', () => this._togglePause());
            input.on('restart', () => {
                if (this.state === STATE.GAME_OVER) this._startCountdown();
            });
            input.on('window-blur', () => {
                if (this.state === STATE.PLAYING) this._togglePause();
            });

            // Hide loader, show menu
            UI.hideLoader();
            UI.show('menu');
            this.state = STATE.MENU;

            // Initial sky orbs based on time of day for ambience
            const h = new Date().getHours();
            UI.showSunMoon(h >= 6 && h < 19, !(h >= 6 && h < 19));

            // Start the loop
            requestAnimationFrame((t) => this._loop(t));
        }

        async _preloadAssets() {
            const total = GameData.SKINS.length;
            let loaded = 0;
            const load = (skin) => new Promise((resolve) => {
                const img = new Image();
                img.onload = () => { loaded++; UI.setLoaderProgress(loaded / total); resolve(); };
                img.onerror = () => { loaded++; UI.setLoaderProgress(loaded / total); resolve(); };
                img.src = skin.src;
                this.images[skin.id] = img;
            });
            await Promise.all(GameData.SKINS.map(load));
            // Tiny fake delay so the loader doesn't flash
            await new Promise(r => setTimeout(r, 350));
        }

        /* ============================================================
           UI WIRING
           ============================================================ */

        _wireUI() {
            const click = (id, fn) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', () => { audio.unlock(); audio.sfxButton(); fn(); });
            };

            // Menu
            click('btn-play',         () => this._startCountdown());
            click('btn-skins',        () => { UI.renderSkinGrid((id) => SaveData.setSelectedSkin(id)); UI.show('skins'); });
            click('btn-achievements', () => { UI.renderAchievementList(); UI.show('achievements'); });
            click('btn-settings',     () => { UI.renderSettings(); UI.show('settings'); });

            // Pause
            click('btn-pause',                () => this._togglePause());
            click('btn-resume',               () => this._togglePause());
            click('btn-restart-from-pause',   () => this._startCountdown());
            click('btn-menu-from-pause',      () => this._goToMenu());

            // Game over
            click('btn-retry',     () => this._startCountdown());
            click('btn-go-menu',   () => this._goToMenu());
            click('btn-go-share',  () => this._share());

            // Settings switches
            const bindSwitch = (id, key, onChange) => {
                const el = document.getElementById(id);
                el.addEventListener('change', () => {
                    SaveData.updateSetting(key, el.checked);
                    this.settings = SaveData.getSettings();
                    if (onChange) onChange(el.checked);
                });
            };
            bindSwitch('set-music', 'music', (on) => audio.setMusic(on));
            bindSwitch('set-sfx',   'sfx',   (on) => audio.setSfx(on));
            bindSwitch('set-vibe',  'vibrate');
            bindSwitch('set-low',   'lowEffects', (on) => {
                this.particles.max = on ? 120 : 240;
            });
            bindSwitch('set-night', 'forceNight');

            // Reset data
            const resetBtn = document.getElementById('btn-reset-data');
            if (resetBtn) resetBtn.addEventListener('click', () => {
                if (confirm('¿Borrar todos los datos guardados? Esto incluye récord, skins y logros.')) {
                    Storage.clearAll();
                    this.settings = SaveData.getSettings();
                    UI.renderSettings();
                    UI.setBest(SaveData.getBest());
                    audio.sfxButton();
                }
            });
        }

        /* ============================================================
           RESIZE & DPR
           ============================================================ */

        resize() {
            // Make the canvas's pixel buffer match the device pixel ratio
            // for crisp rendering, while CSS keeps it at 100% width.
            const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
            const cssRect = this.canvas.getBoundingClientRect();

            // If parent layout hasn't settled, fall back to logical size.
            const cssW = cssRect.width  || this.LOGICAL_W;
            const cssH = cssRect.height || this.LOGICAL_H;

            this.canvas.width  = Math.round(cssW * dpr);
            this.canvas.height = Math.round(cssH * dpr);

            // We render in logical coordinates (LOGICAL_W x LOGICAL_H)
            // and scale up uniformly. This keeps gameplay consistent
            // across devices while still rendering crisply.
            const scaleX = this.canvas.width  / this.LOGICAL_W;
            const scaleY = this.canvas.height / this.LOGICAL_H;
            this.renderScale = Math.min(scaleX, scaleY);

            this.ctx.imageSmoothingEnabled = false; // pixel-art friendly
        }

        /* ============================================================
           STATE TRANSITIONS
           ============================================================ */

        _goToMenu() {
            this.state = STATE.MENU;
            this.timeScale = 1;
            this.shakeMagnitude = 0;
            UI.hideHUD();
            UI.clearCombo();
            UI.show('menu');
            // Sync menu bird to current skin
            const skin = GameData.SKINS.find(s => s.id === SaveData.getSelectedSkin()) || GameData.SKINS[0];
            UI.menuBird.src = skin.src;
        }

        async _startCountdown() {
            // Reset run
            this._resetRun();

            UI.hideAll();
            UI.showHUD();
            UI.setBest(SaveData.getBest());
            UI.setScore(0);

            this.state = STATE.COUNTDOWN;

            // Start music (unlocks audio context)
            audio.unlock();
            if (this.settings.music) audio.startMusic();

            await UI.runCountdown();

            // After countdown, show tutorial briefly if first time
            if (!this.settings.tutorialSeen) {
                UI.showOverlay('tutorial');
                SaveData.updateSetting('tutorialSeen', true);
            }

            this.state = STATE.PLAYING;
            this.runStartTime = performance.now();
        }

        _resetRun() {
            // Pick a random weather mode for this run (low odds for non-clear)
            const weatherTypes = GameData.WEATHER_TYPES;
            const totalWeight = weatherTypes.reduce((s, w) => s + w.weight, 0);
            let r = Math.random() * totalWeight;
            let weather = 'clear';
            for (const w of weatherTypes) {
                r -= w.weight;
                if (r <= 0) { weather = w.id; break; }
            }
            this.background.setWeather(weather);
            this.background.setScore(0, this.settings.forceNight);
            this.background.lowEffects = this.settings.lowEffects;

            // Reset state
            this.score = 0;
            this.combo = 0;
            this.maxCombo = 0;
            this.scoreWithWeather = 0;
            this.totalJumps = 0;
            this.lastScoreTime = 0;

            // Build bird
            const skinId = SaveData.getSelectedSkin();
            const skin = GameData.SKINS.find(s => s.id === skinId) || GameData.SKINS[0];
            const img = this.images[skin.id];
            this.bird = new Bird(this.LOGICAL_W * 0.28, this.LOGICAL_H * 0.42, img, skin.tint);

            // Reset pipes
            this.pipes = [];
            this.timeSinceLastPipe = 0;

            // Reset difficulty
            this.scrollSpeed = 150;
            this.pipeGap = 200;
            this.pipeInterval = 1.6;

            // Particles cleared
            this.particles.clear();

            // Time effects
            this.timeScale = 1;
            this.shakeMagnitude = 0;
        }

        _togglePause() {
            if (this.state === STATE.PLAYING) {
                this.state = STATE.PAUSED;
                UI.showOverlay('pause');
                audio.duck(0.3, 0.4);
            } else if (this.state === STATE.PAUSED) {
                this.state = STATE.PLAYING;
                UI.hideOverlay('pause');
                audio.duck(0.7, 0.3);
            }
        }

        async _gameOver() {
            this.state = STATE.GAME_OVER;
            audio.sfxHit();
            audio.sfxFall();
            audio.duck(0.25, 1.2);

            // Vibrate on hit
            if (this.settings.vibrate) Utils.vibrate([20, 60, 30]);

            // Particle burst at the bird position
            const tint = this.bird.tint || '#fff';
            this.particles.burst(this.bird.x, this.bird.y, tint, this.settings.lowEffects ? 14 : 30);

            // Slow motion
            this.timeScale = 0.35;
            // Screen shake
            this.shakeMagnitude = 10;
            this.shakeTime = 0.5;

            // Stats
            const duration = (performance.now() - this.runStartTime) / 1000;
            const stats = {
                score: this.score,
                best: Math.max(SaveData.getBest(), this.score),
                maxCombo: this.maxCombo,
                duration,
            };

            // Update save data
            const isNewBest = this.score > SaveData.getBest();
            if (isNewBest) SaveData.setBest(this.score);
            SaveData.incrementPlays();
            SaveData.addTotalScore(this.score);

            // Try unlock skins purely on score
            for (const skin of GameData.SKINS) {
                if (skin.unlock.type === 'score' && this.score >= skin.unlock.value) {
                    if (SaveData.unlockSkin(skin.id)) {
                        UI.toast('SKIN DESBLOQUEADA', skin.name, '🎁');
                        audio.sfxAchievement();
                    }
                }
            }

            // Try unlock achievements
            this._checkAchievements(true);

            // Wait a moment for slow-mo + screen shake to be appreciated,
            // then show the game over screen
            await new Promise(r => setTimeout(r, 950));
            this.timeScale = 1;
            UI.showGameOver(stats);
        }

        _checkAchievements(includeFinal = false) {
            const ctx = {
                score: this.score,
                maxCombo: this.maxCombo,
                totalJumps: this.totalJumps,
                plays: SaveData.getPlays(),
                totalScore: SaveData.getTotalScore(),
                playedAtNight: this.background.phase >= 0.5 && this.background.phase < 0.75,
                selectedSkin: SaveData.getSelectedSkin(),
                scoreWithWeather: this.scoreWithWeather,
            };
            for (const a of GameData.ACHIEVEMENTS) {
                if (SaveData.getUnlockedAchievements().includes(a.id)) continue;
                if (a.condition(ctx)) {
                    SaveData.unlockAchievement(a.id);
                    UI.toast(a.name, a.description, a.icon);
                    audio.sfxAchievement();
                }
            }
        }

        async _share() {
            const text = `¡He hecho ${this.score} puntos en Flappi Pro! ¿Puedes superarme? 🐦`;
            try {
                if (navigator.share) {
                    await navigator.share({ title: 'Flappi Pro', text });
                } else if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    UI.toast('COPIADO', 'Texto copiado al portapapeles', '📋');
                }
            } catch (_) {
                // user cancelled — silent
            }
        }

        /* ============================================================
           INPUT HANDLERS
           ============================================================ */

        _onFlap() {
            audio.unlock();
            if (this.state === STATE.MENU) {
                // Tapping anywhere on the canvas in the menu starts a run
                this._startCountdown();
                return;
            }
            if (this.state === STATE.GAME_OVER) {
                // Quick "tap to retry" after the game over has been shown
                if (Date.now() - this._lastGameOverTime > 600) {
                    this._startCountdown();
                }
                return;
            }
            if (this.state !== STATE.PLAYING) return;

            // Tutorial overlay disappears at first flap
            UI.hideOverlay('tutorial');

            this.bird.flap();
            this.totalJumps++;
            audio.sfxJump();

            // Tiny trail puff
            if (!this.settings.lowEffects) {
                this.particles.trail(this.bird.x - 14, this.bird.y + 4, 'rgba(255,255,255,0.55)');
            }
        }

        /* ============================================================
           UPDATE / RENDER LOOP — fixed-step with interpolation accumulator
           ============================================================ */

        _loop(now) {
            const rawDt = Math.min((now - this.lastTime) / 1000, 1 / 30); // cap at 30fps so bg tabs don't break physics
            this.lastTime = now;
            const dt = rawDt * this.timeScale;

            this.update(dt);
            this.render();

            requestAnimationFrame((t) => this._loop(t));
        }

        update(dt) {
            // Shake decay
            if (this.shakeTime > 0) {
                this.shakeTime -= dt;
                this.shakeMagnitude *= 0.9;
                if (this.shakeTime <= 0) this.shakeMagnitude = 0;
            }

            // Background always animates (even on menu) for life
            const scrollSpeed = (this.state === STATE.PLAYING || this.state === STATE.GAME_OVER || this.state === STATE.COUNTDOWN)
                ? this.scrollSpeed
                : 40; // gentle drift on menu
            this.background.update(dt, scrollSpeed);
            this.particles.update(dt);

            if (this.state === STATE.MENU) {
                // Idle bird preview animates
                if (this.bird) this.bird.updateIdle(dt);
                return;
            }

            if (this.state === STATE.COUNTDOWN) {
                // Bird hovers (no gravity yet)
                this.bird.updateIdle(dt);
                return;
            }

            if (this.state !== STATE.PLAYING && this.state !== STATE.GAME_OVER) return;

            if (this.state === STATE.PLAYING) {
                // Difficulty scaling: increment speed every 10 points,
                // tighten gap up to a floor, shorten interval up to a floor.
                const tier = Math.floor(this.score / 10);
                this.scrollSpeed  = 150 + tier * 14;            // up to ~290 at score 100
                this.pipeGap      = Math.max(140, 200 - tier * 4);
                this.pipeInterval = Math.max(1.05, 1.6 - tier * 0.05);

                // Spawn pipes
                this.timeSinceLastPipe += dt;
                if (this.timeSinceLastPipe >= this.pipeInterval) {
                    this.timeSinceLastPipe = 0;
                    this._spawnPipe();
                }

                // Bird update
                this.bird.update(dt);
                // Wind nudge
                this.bird.applyWind(this.background.getWindForce(), dt);

                // Bird trail (subtle)
                if (!this.settings.lowEffects && Math.random() < 0.6) {
                    this.particles.trail(this.bird.x - 18, this.bird.y + 2, Utils.hexToRgba(this.bird.tint, 0.35));
                }

                // Update pipes + collision + scoring
                for (let i = this.pipes.length - 1; i >= 0; i--) {
                    const pipe = this.pipes[i];
                    pipe.update(dt, this.scrollSpeed);

                    // Score
                    if (pipe.checkScore(this.bird.x)) {
                        this._onScore(pipe);
                    }

                    if (pipe.isGone()) this.pipes.splice(i, 1);
                }

                // Collisions
                this._checkCollisions();
            }
        }

        _spawnPipe() {
            const margin = 100;        // distance from canvas top/bottom
            const groundY = this.LOGICAL_H - 80;
            const minY = margin;
            const maxY = groundY - this.pipeGap - margin;

            const gapY = Utils.rand(minY, maxY);
            // Pipe variants — small chance of crystal/rust mostly visual
            const kindRoll = Math.random();
            const kind = kindRoll < 0.05 ? 'crystal' : (kindRoll < 0.15 ? 'rust' : 'green');

            this.pipes.push(new Pipe(this.LOGICAL_W + 50, gapY, this.pipeGap, this.LOGICAL_H, kind));
        }

        _checkCollisions() {
            // Ground / ceiling
            const groundY = this.LOGICAL_H - 80;
            if (this.bird.y + this.bird.h / 2 >= groundY) {
                this.bird.y = groundY - this.bird.h / 2;
                this._gameOver();
                return;
            }
            if (this.bird.y - this.bird.h / 2 <= 0) {
                this.bird.y = this.bird.h / 2;
                this.bird.vy = 0;
            }

            // Pipes
            const bb = this.bird.getBounds();
            for (const pipe of this.pipes) {
                const rects = pipe.getBounds();
                if (Utils.aabb(bb, rects.top) || Utils.aabb(bb, rects.bottom)) {
                    this._gameOver();
                    return;
                }
            }
        }

        _onScore(pipe) {
            // Increment + combo logic
            const now = performance.now();
            if (now - this.lastScoreTime < 1500 && this.lastScoreTime !== 0) this.combo++;
            else this.combo = 1;
            this.lastScoreTime = now;
            this.maxCombo = Math.max(this.maxCombo, this.combo);

            this.score++;
            UI.setScore(this.score);

            if (this.combo >= 2) {
                UI.setCombo(this.combo);
                audio.sfxCombo(this.combo);
            }
            audio.sfxScore();

            if (this.settings.vibrate) Utils.vibrate(15);

            // Particles at the gap center
            const gapCenterY = pipe.gapY + pipe.gapH / 2;
            const gapCenterX = pipe.x + pipe.w / 2;
            this.particles.sparkle(gapCenterX, gapCenterY, '#FFD93D', this.settings.lowEffects ? 6 : 14);
            this.particles.ring(this.bird.x, this.bird.y, 'rgba(255,217,61,0.85)', 80);
            this.particles.scoreText(this.bird.x, this.bird.y - 24,
                this.combo >= 2 ? `+${this.combo}` : '+1',
                this.combo >= 2 ? '#FFD93D' : '#fff'
            );

            // Track weather-scored
            if (this.background.weather !== 'clear') this.scoreWithWeather++;

            // Update background phase
            this.background.setScore(this.score, this.settings.forceNight);

            // Run achievement check (live — for score-based ones)
            this._checkAchievements();
        }

        /* ============================================================
           RENDER
           ============================================================ */

        render() {
            const ctx = this.ctx;

            // 1. Reset transform and CLEAR THE ENTIRE CANVAS in physical pixels.
            //    Critical: when the canvas aspect ratio doesn't match LOGICAL_W/H,
            //    only a sub-rect gets re-drawn each frame. Without this clear, the
            //    leftover area shows uninitialized buffer garbage.
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#0a0e1f';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // 2. Compute the centered "letterbox" offset so the logical area
            //    (LOGICAL_W x LOGICAL_H) sits in the middle of the canvas.
            const drawW = this.LOGICAL_W * this.renderScale;
            const drawH = this.LOGICAL_H * this.renderScale;
            const offsetX = (this.canvas.width  - drawW) / 2;
            const offsetY = (this.canvas.height - drawH) / 2;

            // 3. Apply uniform scale + centering + screen shake.
            const shakeX = this.shakeMagnitude ? (Math.random() - 0.5) * this.shakeMagnitude * this.renderScale : 0;
            const shakeY = this.shakeMagnitude ? (Math.random() - 0.5) * this.shakeMagnitude * this.renderScale : 0;
            ctx.setTransform(this.renderScale, 0, 0, this.renderScale, offsetX + shakeX, offsetY + shakeY);

            // Background
            this.background.render(ctx);

            // Pipes
            for (const pipe of this.pipes) pipe.render(ctx);

            // Bird (only after we have one)
            if (this.bird) this.bird.render(ctx);

            // Particles on top
            this.particles.render(ctx);

            // Subtle vignette around the edges
            if (!this.settings.lowEffects) this._renderVignette(ctx);

            // On game over: red tint flash
            if (this.state === STATE.GAME_OVER && this.timeScale < 1) {
                ctx.fillStyle = 'rgba(255, 80, 80, 0.10)';
                ctx.fillRect(0, 0, this.LOGICAL_W, this.LOGICAL_H);
            }
        }

        _renderVignette(ctx) {
            const grad = ctx.createRadialGradient(
                this.LOGICAL_W / 2, this.LOGICAL_H / 2, this.LOGICAL_H * 0.4,
                this.LOGICAL_W / 2, this.LOGICAL_H / 2, this.LOGICAL_H * 0.7
            );
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.35)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.LOGICAL_W, this.LOGICAL_H);
        }
    }

    window.Game = Game;
    window.GameStates = STATE;
})();
