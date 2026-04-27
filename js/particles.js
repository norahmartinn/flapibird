/* ============================================================
   particles.js
   Pooled particle system. Cheap to spawn, fixed pool size to
   avoid GC pressure during long sessions. Supports simple
   physics + a few render styles (circle, spark, feather).
   ============================================================ */
(function () {
    'use strict';

    const POOL_SIZE = 220; // upper bound; mobile-friendly

    class Particle {
        constructor() {
            this.alive = false;
            this.reset();
        }
        reset() {
            this.x = 0; this.y = 0;
            this.vx = 0; this.vy = 0;
            this.gravity = 0;
            this.life = 0; this.maxLife = 1;
            this.size = 4;
            this.color = '#fff';
            this.kind = 'circle';
            this.rotation = 0;
            this.rotSpeed = 0;
            this.fade = true;
            this.shrink = false;
            this.alive = false;
        }
        update(dt) {
            if (!this.alive) return;
            this.vy += this.gravity * dt;
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.rotation += this.rotSpeed * dt;
            this.life -= dt;
            if (this.life <= 0) this.alive = false;
        }
        render(ctx) {
            if (!this.alive) return;
            const t = Math.max(0, this.life / this.maxLife);
            const alpha = this.fade ? t : 1;
            const sizeNow = this.shrink ? this.size * t : this.size;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(this.x, this.y);

            switch (this.kind) {
                case 'spark': {
                    // 4-pointed star spark
                    ctx.rotate(this.rotation);
                    ctx.fillStyle = this.color;
                    ctx.shadowColor = this.color;
                    ctx.shadowBlur = sizeNow * 2;
                    ctx.beginPath();
                    const s = sizeNow;
                    ctx.moveTo(0, -s);
                    ctx.lineTo(s * 0.3, -s * 0.3);
                    ctx.lineTo(s, 0);
                    ctx.lineTo(s * 0.3, s * 0.3);
                    ctx.lineTo(0, s);
                    ctx.lineTo(-s * 0.3, s * 0.3);
                    ctx.lineTo(-s, 0);
                    ctx.lineTo(-s * 0.3, -s * 0.3);
                    ctx.closePath();
                    ctx.fill();
                    break;
                }
                case 'feather': {
                    // Tiny rotating "leaf" shape
                    ctx.rotate(this.rotation);
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, sizeNow, sizeNow * 0.45, 0, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }
                case 'plus': {
                    // "+1" floating text — used for score
                    ctx.font = `bold ${sizeNow}px "Lilita One", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = this.color;
                    ctx.shadowColor = 'rgba(0,0,0,0.4)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetY = 2;
                    ctx.fillText(this.text || '+1', 0, 0);
                    break;
                }
                case 'ring': {
                    // expanding ring (used at score moments)
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, sizeNow * (1 - t) * this.maxRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                }
                default: {
                    // circle
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.arc(0, 0, sizeNow, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.restore();
        }
    }

    class ParticleSystem {
        constructor(maxParticles = POOL_SIZE) {
            this.pool = [];
            this.max = maxParticles;
            for (let i = 0; i < maxParticles; i++) this.pool.push(new Particle());
            this.cursor = 0;
        }

        /** Get an inactive particle from the pool (round-robin overwrite). */
        _acquire() {
            // First try to find a dead one near the cursor
            for (let i = 0; i < this.pool.length; i++) {
                const idx = (this.cursor + i) % this.pool.length;
                if (!this.pool[idx].alive) {
                    this.cursor = (idx + 1) % this.pool.length;
                    return this.pool[idx];
                }
            }
            // All in use — overwrite oldest (cursor)
            const p = this.pool[this.cursor];
            this.cursor = (this.cursor + 1) % this.pool.length;
            return p;
        }

        spawn(opts) {
            const p = this._acquire();
            p.reset();
            p.alive = true;
            Object.assign(p, opts);
            p.maxLife = p.life;
            return p;
        }

        /* ---------- HIGH-LEVEL EFFECTS ---------- */

        /** A poof of feathers + dust (collision). */
        burst(x, y, color = '#fff', count = 24) {
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 80 + Math.random() * 220;
                this.spawn({
                    x, y,
                    vx: Math.cos(a) * speed,
                    vy: Math.sin(a) * speed - 60,
                    gravity: 600,
                    life: 0.6 + Math.random() * 0.5,
                    size: 3 + Math.random() * 4,
                    color,
                    kind: 'feather',
                    rotation: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 12,
                    shrink: true,
                });
            }
            // dust circles
            for (let i = 0; i < count / 2; i++) {
                this.spawn({
                    x, y,
                    vx: (Math.random() - 0.5) * 200,
                    vy: -Math.random() * 120,
                    gravity: 300,
                    life: 0.4 + Math.random() * 0.3,
                    size: 4 + Math.random() * 5,
                    color: 'rgba(255,255,255,0.6)',
                    kind: 'circle',
                    shrink: true,
                });
            }
        }

        /** Sparkles when scoring through a pipe gap. */
        sparkle(x, y, color = '#FFD93D', count = 10) {
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 60 + Math.random() * 130;
                this.spawn({
                    x, y,
                    vx: Math.cos(a) * speed,
                    vy: Math.sin(a) * speed,
                    gravity: 80,
                    life: 0.5 + Math.random() * 0.4,
                    size: 4 + Math.random() * 4,
                    color,
                    kind: 'spark',
                    rotation: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 8,
                    shrink: true,
                });
            }
        }

        /** A small expanding ring at the bird position when it scores. */
        ring(x, y, color = 'rgba(255,217,61,0.9)', radius = 60) {
            this.spawn({
                x, y,
                life: 0.35,
                size: 1,
                maxRadius: radius,
                color,
                kind: 'ring',
                fade: true,
            });
        }

        /** "+1" floating text. */
        scoreText(x, y, text = '+1', color = '#fff') {
            this.spawn({
                x, y,
                vx: 0,
                vy: -90,
                gravity: 30,
                life: 0.7,
                size: 22,
                color,
                kind: 'plus',
                text,
                shrink: false,
                fade: true,
            });
        }

        /** Subtle trail behind the bird as it moves. */
        trail(x, y, color = 'rgba(255,255,255,0.7)') {
            this.spawn({
                x: x + (Math.random() - 0.5) * 6,
                y: y + (Math.random() - 0.5) * 6,
                vx: (Math.random() - 0.5) * 30,
                vy: (Math.random() - 0.5) * 30,
                gravity: 10,
                life: 0.3 + Math.random() * 0.2,
                size: 2 + Math.random() * 2,
                color,
                kind: 'circle',
                shrink: true,
            });
        }

        /* ---------- LOOP ---------- */
        update(dt) {
            for (let i = 0; i < this.pool.length; i++) this.pool[i].update(dt);
        }

        render(ctx) {
            for (let i = 0; i < this.pool.length; i++) this.pool[i].render(ctx);
        }

        clear() {
            for (let i = 0; i < this.pool.length; i++) this.pool[i].alive = false;
        }
    }

    window.ParticleSystem = ParticleSystem;
})();
