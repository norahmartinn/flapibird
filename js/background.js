/* ============================================================
   background.js
   Multi-layer parallax background with day/night cycle, animated
   clouds and weather (rain, snow, wind streaks). Renders directly
   on the game canvas.
   ============================================================ */
(function () {
    'use strict';

    /* ============================================================
       PALETTES — 4 phases the sky cycles through with score.
       phase = (score % 80) / 80, mapped: 0-0.25 day, 0.25-0.5 dusk,
       0.5-0.75 night, 0.75-1 dawn
       ============================================================ */
    const SKY_PHASES = [
        // [topColor, midColor, bottomColor, sunOpacity, moonOpacity, starOpacity]
        { name: 'day',    top: '#7ec8f5', mid: '#b9e3ff', bot: '#dff5ff', sun: 1.0, moon: 0.0, stars: 0.0 },
        { name: 'dusk',   top: '#ff9a76', mid: '#ffb38a', bot: '#ffd2a8', sun: 0.8, moon: 0.2, stars: 0.0 },
        { name: 'night',  top: '#0b1d3a', mid: '#1e2a5a', bot: '#2c3675', sun: 0.0, moon: 1.0, stars: 1.0 },
        { name: 'dawn',   top: '#5b6db8', mid: '#a1a8d8', bot: '#ffd2a8', sun: 0.4, moon: 0.6, stars: 0.4 },
    ];

    function interpPhase(t) {
        // t in [0,1]; lerp between adjacent phases
        const idx = Math.floor(t * SKY_PHASES.length) % SKY_PHASES.length;
        const next = (idx + 1) % SKY_PHASES.length;
        const local = (t * SKY_PHASES.length) - Math.floor(t * SKY_PHASES.length);
        const a = SKY_PHASES[idx], b = SKY_PHASES[next];
        return {
            top: Utils.mixColors(a.top, b.top, local),
            mid: Utils.mixColors(a.mid, b.mid, local),
            bot: Utils.mixColors(a.bot, b.bot, local),
            sun: Utils.lerp(a.sun, b.sun, local),
            moon: Utils.lerp(a.moon, b.moon, local),
            stars: Utils.lerp(a.stars, b.stars, local),
            isNight: a.name === 'night' || b.name === 'night',
        };
    }

    /* ============================================================
       BACKGROUND
       ============================================================ */
    class Background {
        constructor(width, height, opts = {}) {
            this.w = width;
            this.h = height;
            this.lowEffects = !!opts.lowEffects;

            // Day/night phase 0..1
            this.phase = 0;          // current
            this.targetPhase = 0;    // smoothed target (driven by score)

            // Pre-generate stars (bake to offscreen for cheap reuse)
            this.starsCanvas = this._buildStars();

            // Clouds (parallax layer)
            this.clouds = [];
            for (let i = 0; i < 6; i++) {
                this.clouds.push({
                    x: Math.random() * width,
                    y: 50 + Math.random() * (height * 0.45),
                    s: 0.6 + Math.random() * 0.8,
                    speed: 8 + Math.random() * 14,
                    layer: Math.random() > 0.5 ? 'far' : 'near',
                });
            }

            // Mountains (back parallax)
            this.mountainsCanvas = this._buildMountains(width, height);
            this.mountainOffset = 0;

            // Hills (mid parallax)
            this.hillsCanvas = this._buildHills(width, height);
            this.hillOffset = 0;

            // Ground (front parallax)
            this.groundOffset = 0;
            this.groundY = height - 80;

            // Weather state
            this.weather = 'clear';   // clear | rain | snow | wind
            this.weatherPool = this._initWeatherPool();
            this.windStrength = 0;    // -1..1
        }

        setWeather(kind) {
            this.weather = kind;
            // Generate a fresh batch of particles where appropriate
            this.weatherPool = this._initWeatherPool();
            // Wind strength used to bend particles + push bird
            this.windStrength = kind === 'wind' ? (Math.random() < 0.5 ? -1 : 1) : 0;
        }

        getWindForce() {
            return this.weather === 'wind' ? this.windStrength * 30 : 0;
        }

        setScore(score, forceNight = false) {
            // Phase progresses every 20 points; forceNight pins to night phase
            if (forceNight) {
                this.targetPhase = 0.5; // pure night
                return;
            }
            this.targetPhase = ((score / 20) % 4) / 4;
        }

        /* ---------- BUILDERS (run once each) ---------- */
        _buildStars() {
            const c = document.createElement('canvas');
            c.width = this.w; c.height = this.h * 0.7;
            const ctx = c.getContext('2d');
            for (let i = 0; i < 60; i++) {
                const x = Math.random() * c.width;
                const y = Math.random() * c.height;
                const r = Math.random() * 1.4 + 0.4;
                ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + Math.random() * 0.6})`;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            return c;
        }

        _buildMountains(w, h) {
            const c = document.createElement('canvas');
            // Render twice the width so we can scroll seamlessly
            c.width = w * 2; c.height = h;
            const ctx = c.getContext('2d');
            // Soft far mountains silhouette
            ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.beginPath();
            const baseY = h * 0.62;
            ctx.moveTo(0, h);
            for (let x = 0; x <= c.width; x += 30) {
                const y = baseY - 60 - Math.sin(x * 0.012) * 40 - Math.sin(x * 0.04) * 18;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(c.width, h);
            ctx.closePath();
            ctx.fill();
            return c;
        }

        _buildHills(w, h) {
            const c = document.createElement('canvas');
            c.width = w * 2; c.height = h;
            const ctx = c.getContext('2d');
            ctx.fillStyle = 'rgba(80, 160, 100, 0.35)';
            ctx.beginPath();
            const baseY = h * 0.78;
            ctx.moveTo(0, h);
            for (let x = 0; x <= c.width; x += 18) {
                const y = baseY - 30 - Math.sin(x * 0.025) * 26 - Math.sin(x * 0.08) * 8;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(c.width, h);
            ctx.closePath();
            ctx.fill();
            return c;
        }

        _initWeatherPool() {
            const arr = [];
            const count = this.lowEffects ? 30 : 60;
            for (let i = 0; i < count; i++) {
                arr.push({
                    x: Math.random() * this.w,
                    y: Math.random() * this.h,
                    vx: 0,
                    vy: 0,
                    size: 0,
                });
            }
            return arr;
        }

        /* ---------- LOOP ---------- */
        update(dt, scrollSpeed) {
            // Smooth phase transition
            const diff = this.targetPhase - this.phase;
            // shortest-path on the 0..1 ring
            let delta = diff;
            if (delta > 0.5) delta -= 1;
            if (delta < -0.5) delta += 1;
            this.phase = (this.phase + delta * Math.min(1, dt * 0.4) + 1) % 1;

            // Parallax offsets
            this.mountainOffset = (this.mountainOffset + scrollSpeed * 0.10 * dt) % this.w;
            this.hillOffset     = (this.hillOffset     + scrollSpeed * 0.30 * dt) % this.w;
            this.groundOffset   = (this.groundOffset   + scrollSpeed * 1.00 * dt) % 32;

            // Clouds
            for (const cloud of this.clouds) {
                cloud.x -= cloud.speed * (cloud.layer === 'far' ? 0.4 : 0.8) * dt;
                if (cloud.x + 80 < 0) {
                    cloud.x = this.w + 30;
                    cloud.y = 50 + Math.random() * (this.h * 0.45);
                    cloud.s = 0.6 + Math.random() * 0.8;
                }
            }

            // Weather
            this._updateWeather(dt);
        }

        _updateWeather(dt) {
            if (this.weather === 'clear') return;
            const p = this.weatherPool;
            for (let i = 0; i < p.length; i++) {
                const part = p[i];
                if (this.weather === 'rain') {
                    part.vy = 850;
                    part.vx = -120;
                    part.size = 1;
                } else if (this.weather === 'snow') {
                    part.vy = 90 + (i % 5) * 20;
                    part.vx = -30 + Math.sin((part.y + i) * 0.05) * 30;
                    part.size = 2 + (i % 3);
                } else if (this.weather === 'wind') {
                    part.vy = 0;
                    part.vx = -250 - (i % 4) * 60;
                    part.size = 1;
                }
                part.x += part.vx * dt;
                part.y += part.vy * dt;
                if (part.y > this.h || part.x < -10) {
                    part.x = this.w + Math.random() * 30;
                    part.y = -10 + Math.random() * (this.weather === 'wind' ? this.h : 20);
                }
            }
        }

        /* ---------- RENDER ---------- */
        render(ctx) {
            const p = interpPhase(this.phase);

            // Sky gradient
            const grad = ctx.createLinearGradient(0, 0, 0, this.h);
            grad.addColorStop(0, p.top);
            grad.addColorStop(0.55, p.mid);
            grad.addColorStop(1, p.bot);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.w, this.h);

            // Stars
            if (p.stars > 0.05) {
                ctx.globalAlpha = p.stars;
                ctx.drawImage(this.starsCanvas, 0, 0);
                ctx.globalAlpha = 1;
            }

            // Sun / moon
            if (p.sun > 0.05) {
                this._renderOrb(ctx, this.w * 0.78, 100, 50, '#fff7c2', '#ffd93d', '#ff9d3d', p.sun);
            }
            if (p.moon > 0.05) {
                this._renderOrb(ctx, this.w * 0.22, 110, 38, '#ffffff', '#e0e8ff', '#a8b8e0', p.moon);
            }

            // Mountains (parallax)
            ctx.globalAlpha = 0.85;
            ctx.drawImage(this.mountainsCanvas, -this.mountainOffset, 0);
            ctx.drawImage(this.mountainsCanvas, -this.mountainOffset + this.w, 0);
            ctx.globalAlpha = 1;

            // Clouds (far)
            for (const cloud of this.clouds) if (cloud.layer === 'far') this._renderCloud(ctx, cloud, 0.55);

            // Hills (parallax)
            ctx.drawImage(this.hillsCanvas, -this.hillOffset, 0);
            ctx.drawImage(this.hillsCanvas, -this.hillOffset + this.w, 0);

            // Clouds (near)
            for (const cloud of this.clouds) if (cloud.layer === 'near') this._renderCloud(ctx, cloud, 0.85);

            // Weather (overlay)
            if (this.weather !== 'clear') this._renderWeather(ctx);

            // Ground strip
            this._renderGround(ctx, p);
        }

        _renderOrb(ctx, x, y, r, c1, c2, c3, alpha) {
            ctx.save();
            ctx.globalAlpha = alpha;
            const grad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.2, x, y, r);
            grad.addColorStop(0, c1);
            grad.addColorStop(0.6, c2);
            grad.addColorStop(1, c3);
            ctx.fillStyle = grad;
            ctx.shadowBlur = 30;
            ctx.shadowColor = c2;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        _renderCloud(ctx, cloud, opacity) {
            const { x, y, s } = cloud;
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.fillStyle = '#fff';
            // Soft blob made of 4 overlapping circles
            const r = 18 * s;
            ctx.beginPath();
            ctx.arc(x,         y,        r,         0, Math.PI * 2);
            ctx.arc(x + r * 1.0, y - r * 0.4, r * 0.9, 0, Math.PI * 2);
            ctx.arc(x + r * 1.8, y,        r * 1.0, 0, Math.PI * 2);
            ctx.arc(x + r * 0.5, y + r * 0.5, r * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        _renderWeather(ctx) {
            const p = this.weatherPool;
            ctx.save();
            if (this.weather === 'rain') {
                ctx.strokeStyle = 'rgba(170, 200, 255, 0.55)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                for (let i = 0; i < p.length; i++) {
                    const part = p[i];
                    ctx.moveTo(part.x, part.y);
                    ctx.lineTo(part.x - 6, part.y + 12);
                }
                ctx.stroke();
            } else if (this.weather === 'snow') {
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                for (let i = 0; i < p.length; i++) {
                    const part = p[i];
                    ctx.beginPath();
                    ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (this.weather === 'wind') {
                ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let i = 0; i < p.length; i++) {
                    const part = p[i];
                    ctx.moveTo(part.x, part.y);
                    ctx.lineTo(part.x + 22, part.y);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        _renderGround(ctx, phase) {
            // Soft green/grey strip behind everything else
            const groundColor = phase.isNight ? '#1a3a2a' : '#3a7a4a';
            const dirtColor   = phase.isNight ? '#3a2c1a' : '#7a5a3a';

            ctx.fillStyle = groundColor;
            ctx.fillRect(0, this.groundY, this.w, this.h - this.groundY);

            // Top stripe (lighter highlight)
            ctx.fillStyle = phase.isNight ? '#234d36' : '#52a566';
            ctx.fillRect(0, this.groundY, this.w, 6);

            // Tile pattern
            ctx.fillStyle = dirtColor;
            for (let x = -this.groundOffset; x < this.w; x += 32) {
                ctx.fillRect(x, this.groundY + 14, 16, 6);
                ctx.fillRect(x + 16, this.groundY + 28, 14, 5);
            }
        }
    }

    window.Background = Background;
})();
