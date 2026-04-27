/* ============================================================
   entities.js
   Bird and Pipe game entities. Both pure data + render.
   - Bird has refined physics (terminal velocity, momentum-based
     rotation, squash-and-stretch on flap).
   - Pipes self-render with caps, shading and a soft outline so
     they read clearly against any sky phase.
   ============================================================ */
(function () {
    'use strict';

    /* ============================================================
       BIRD
       ============================================================ */
    class Bird {
        constructor(x, y, image, tint = '#FFD93D') {
            this.x = x;
            this.y = y;
            this.startY = y;
            this.w = 50;
            this.h = 40;

            this.image = image;
            this.tint = tint;

            // Physics
            this.vy = 0;
            this.gravity = 1500;     // px/s²  — feels punchy at 60fps with dt=1/60
            this.jumpVel = -480;     // px/s   — initial flap velocity
            this.terminalVel = 720;  // px/s   — clamp on falling
            this.rotation = 0;       // radians

            // Visual feedback
            this.squash = 1;         // x-scale
            this.stretch = 1;        // y-scale
            this.flapTimer = 0;      // wing animation phase
            this.alive = true;

            // Idle bobbing (used pre-game)
            this.idleTime = 0;
        }

        flap() {
            this.vy = this.jumpVel;
            this.flapTimer = 0.18;
            this.squash = 1.15;
            this.stretch = 0.9;
        }

        die() {
            this.alive = false;
        }

        /** Apply external wind force (px/s² on vx). Bird only moves on Y so this
         *  translates to a tiny vertical "drift" pull instead. */
        applyWind(force, dt) {
            // Tiny vertical pulse for visual juice — not a heavy game-changer
            this.vy += force * 0.06 * dt;
        }

        /** Idle pre-game animation (gentle bob + wing flap). */
        updateIdle(dt) {
            this.idleTime += dt;
            this.y = this.startY + Math.sin(this.idleTime * 3.2) * 8;
            this.rotation = Math.sin(this.idleTime * 3.2) * 0.05;
            this.flapTimer = (this.flapTimer + dt) % 0.4;
        }

        update(dt) {
            // Gravity + terminal velocity
            this.vy += this.gravity * dt;
            if (this.vy > this.terminalVel) this.vy = this.terminalVel;
            this.y += this.vy * dt;

            // Rotation: head up while rising, head down while falling
            // Smoothly interpolated from -0.5 (jump apex) to +1.4 (steep dive)
            const targetRot = Utils.clamp(this.vy / 600, -0.5, 1.4);
            this.rotation += (targetRot - this.rotation) * Math.min(1, dt * 8);

            // Squash/stretch decay back to neutral
            this.squash += (1 - this.squash) * Math.min(1, dt * 12);
            this.stretch += (1 - this.stretch) * Math.min(1, dt * 12);

            // Flap timer for wing pose
            if (this.flapTimer > 0) this.flapTimer -= dt;
        }

        /** AABB for collision (slightly tighter than the sprite). */
        getBounds() {
            const pad = 4;
            return {
                x: this.x - this.w / 2 + pad,
                y: this.y - this.h / 2 + pad,
                w: this.w - pad * 2,
                h: this.h - pad * 2,
            };
        }

        render(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.scale(this.squash, this.stretch);

            // Drop shadow under the bird (subtle)
            ctx.save();
            ctx.translate(2, 4);
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(0, 0, this.w * 0.45, this.h * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            if (this.image && this.image.complete && this.image.naturalWidth > 0) {
                ctx.drawImage(this.image, -this.w / 2, -this.h / 2, this.w, this.h);
            } else {
                // Fallback: simple yellow circle (loading state)
                ctx.fillStyle = this.tint;
                ctx.beginPath();
                ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    /* ============================================================
       PIPE PAIR
       Each Pipe represents the gap obstacle pair. We render both
       top and bottom segments here for clarity, and expose AABBs.
       ============================================================ */
    class Pipe {
        constructor(x, gapY, gapHeight, canvasHeight, kind = 'green') {
            this.x = x;
            this.w = 70;                 // pipe width
            this.gapY = gapY;            // pixel: top of the gap
            this.gapH = gapHeight;       // pixel: height of the gap
            this.canvasHeight = canvasHeight;

            this.scored = false;         // has the bird passed it yet
            this.kind = kind;            // 'green' | 'rust' | 'crystal' (variants)
            this.spawnTime = 0;          // for entrance animation

            // Birth animation: pipe slides up briefly into place
            this.entranceProgress = 0;   // 0 -> 1 (animates in)
        }

        /** AABB collision rectangles (top + bottom). */
        getBounds() {
            return {
                top:    { x: this.x, y: 0,                          w: this.w, h: this.gapY },
                bottom: { x: this.x, y: this.gapY + this.gapH,      w: this.w, h: this.canvasHeight - (this.gapY + this.gapH) },
            };
        }

        update(dt, scrollSpeed) {
            this.x -= scrollSpeed * dt;
            if (this.entranceProgress < 1) {
                this.entranceProgress = Math.min(1, this.entranceProgress + dt * 4);
            }
        }

        /** Has the pipe just been scored on this frame? */
        checkScore(birdX) {
            if (!this.scored && birdX > this.x + this.w / 2) {
                this.scored = true;
                return true;
            }
            return false;
        }

        /** Is the pipe fully off-screen on the left? */
        isGone() { return this.x + this.w < -20; }

        /** ---------- RENDER ---------- */
        render(ctx) {
            // Entrance animation: subtle Y offset
            const off = (1 - Utils.easeOutCubic(this.entranceProgress)) * -10;

            ctx.save();
            ctx.translate(0, off);

            const palette = this._palette();

            // Bottom pipe body
            const bottomY = this.gapY + this.gapH;
            const bottomH = this.canvasHeight - bottomY;
            this._drawPipeBody(ctx, this.x, bottomY, this.w, bottomH, palette, 'bottom');

            // Top pipe body
            this._drawPipeBody(ctx, this.x, 0, this.w, this.gapY, palette, 'top');

            ctx.restore();
        }

        _palette() {
            switch (this.kind) {
                case 'rust':    return { mid: '#c97a3a', light: '#e6a05a', dark: '#7d4a18', edge: '#3a1f08' };
                case 'crystal': return { mid: '#5fc8d8', light: '#a8e6f0', dark: '#2a7e92', edge: '#0e3a4a' };
                case 'green':
                default:        return { mid: '#5fc05a', light: '#83de7e', dark: '#2e7a30', edge: '#1a3f1a' };
            }
        }

        _drawPipeBody(ctx, x, y, w, h, p, side) {
            // Vertical 3-stop gradient gives a tube-like rounded look
            const grad = ctx.createLinearGradient(x, 0, x + w, 0);
            grad.addColorStop(0,    p.dark);
            grad.addColorStop(0.4,  p.mid);
            grad.addColorStop(0.55, p.light);
            grad.addColorStop(1,    p.dark);

            ctx.fillStyle = grad;
            ctx.fillRect(x, y, w, h);

            // Outline
            ctx.strokeStyle = p.edge;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

            // Cap (the chunky lip near the gap)
            const capH = 30;
            const capW = w + 12;
            const capX = x - 6;
            const capY = side === 'top' ? y + h - capH : y;

            const capGrad = ctx.createLinearGradient(capX, 0, capX + capW, 0);
            capGrad.addColorStop(0,    p.dark);
            capGrad.addColorStop(0.4,  p.mid);
            capGrad.addColorStop(0.55, p.light);
            capGrad.addColorStop(1,    p.dark);
            ctx.fillStyle = capGrad;
            ctx.fillRect(capX, capY, capW, capH);
            ctx.strokeStyle = p.edge;
            ctx.strokeRect(capX + 0.5, capY + 0.5, capW - 1, capH - 1);

            // Highlight stripe on the cap top
            ctx.fillStyle = p.light;
            ctx.fillRect(capX + 4, side === 'top' ? capY + 4 : capY + 4, capW - 8, 3);
        }
    }

    window.Bird = Bird;
    window.Pipe = Pipe;
})();
