/* ============================================================
   audio.js
   Audio manager built on top of the WebAudio API. Uses procedural
   synthesis for SFX (no extra audio files needed), plus a soft
   ambient pad for "music". Honors user mute settings + pause.
   ============================================================ */
(function () {
    'use strict';

    class AudioManager {
        constructor() {
            this.ctx = null;
            this.master = null;     // master gain
            this.sfxGain = null;    // sfx bus
            this.musicGain = null;  // music bus
            this.musicNodes = [];   // long-lived oscillator nodes for ambient pad

            this.sfxOn = true;
            this.musicOn = true;
            this.musicPlaying = false;

            // Defer creating the AudioContext until the first user gesture
            // (browsers require this — autoplay policy).
            this._initialized = false;
        }

        _ensure() {
            if (this._initialized) return;
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                this.ctx = new Ctx();
                this.master = this.ctx.createGain();
                this.master.gain.value = 0.7;
                this.master.connect(this.ctx.destination);

                this.sfxGain = this.ctx.createGain();
                this.sfxGain.gain.value = 0.6;
                this.sfxGain.connect(this.master);

                this.musicGain = this.ctx.createGain();
                this.musicGain.gain.value = 0.18;
                this.musicGain.connect(this.master);

                this._initialized = true;
            } catch (e) {
                console.warn('AudioContext unavailable', e);
            }
        }

        /** Resume context after a user gesture (mobile autoplay). */
        unlock() {
            this._ensure();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
        }

        setSfx(on)  { this.sfxOn = !!on; }
        setMusic(on){
            this.musicOn = !!on;
            if (on) this.startMusic();
            else this.stopMusic();
        }

        /* ---------- INTERNAL HELPERS ---------- */

        /** Quick envelope-shaped tone. Adds a tiny detuned partial for warmth. */
        _tone({ freq = 440, type = 'sine', dur = 0.18, attack = 0.005, release = 0.12, gain = 0.5, detune = 0, slideTo = null }) {
            if (!this.sfxOn || !this._initialized) return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = freq;
            if (detune) osc.detune.value = detune;

            if (slideTo != null) {
                osc.frequency.setValueAtTime(freq, t);
                osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
            }

            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + attack);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);

            osc.connect(g).connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + dur + release + 0.05);
        }

        /** Short noise burst — used for impacts/hits. */
        _noise({ dur = 0.18, gain = 0.4, lpf = 1200 }) {
            if (!this.sfxOn || !this._initialized) return;
            const ctx = this.ctx;
            const t = ctx.currentTime;
            const bufferSize = Math.floor(ctx.sampleRate * dur);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            }
            const src = ctx.createBufferSource();
            src.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = lpf;

            const g = ctx.createGain();
            g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

            src.connect(filter).connect(g).connect(this.sfxGain);
            src.start(t);
            src.stop(t + dur + 0.02);
        }

        /* ---------- SFX PUBLIC API ---------- */

        sfxJump() {
            // Quick rising "whoosh" + small thump
            this._tone({ freq: 520, slideTo: 720, type: 'triangle', dur: 0.08, release: 0.08, gain: 0.32 });
            this._tone({ freq: 220, slideTo: 320, type: 'sine',     dur: 0.06, release: 0.10, gain: 0.20, detune: 5 });
        }

        sfxScore() {
            // Two-note bright chime
            const t0 = this.ctx ? this.ctx.currentTime : 0;
            this._tone({ freq: 880, type: 'triangle', dur: 0.10, release: 0.18, gain: 0.34 });
            setTimeout(() => this._tone({ freq: 1320, type: 'triangle', dur: 0.10, release: 0.22, gain: 0.30 }), 60);
        }

        sfxCombo(level) {
            // Higher pitch as combo grows — caps out so it never stings.
            const base = 880 + Math.min(level, 8) * 70;
            this._tone({ freq: base, type: 'square',   dur: 0.06, release: 0.12, gain: 0.18 });
            this._tone({ freq: base * 1.5, type: 'sine', dur: 0.10, release: 0.18, gain: 0.22 });
        }

        sfxHit() {
            this._tone({ freq: 220, slideTo: 110, type: 'sawtooth', dur: 0.18, release: 0.15, gain: 0.4 });
            this._noise({ dur: 0.22, gain: 0.5, lpf: 800 });
        }

        sfxFall() {
            this._tone({ freq: 380, slideTo: 80, type: 'sawtooth', dur: 0.55, release: 0.25, gain: 0.32 });
        }

        sfxButton() {
            this._tone({ freq: 660, type: 'triangle', dur: 0.05, release: 0.06, gain: 0.16 });
        }

        sfxAchievement() {
            // Three-note arpeggio
            const notes = [660, 880, 1175];
            notes.forEach((f, i) => {
                setTimeout(() => this._tone({ freq: f, type: 'triangle', dur: 0.10, release: 0.18, gain: 0.28 }), i * 90);
            });
        }

        sfxCountdown() {
            this._tone({ freq: 660, type: 'square', dur: 0.08, release: 0.10, gain: 0.26 });
        }

        sfxCountdownGo() {
            this._tone({ freq: 880, type: 'square', dur: 0.12, release: 0.20, gain: 0.32 });
            this._tone({ freq: 1320, type: 'triangle', dur: 0.18, release: 0.30, gain: 0.28 });
        }

        /* ---------- AMBIENT MUSIC ----------
           A soft slow-evolving pad (two detuned oscillators + lpf
           on a slow LFO). Free, tiny on CPU, and inoffensive.
        ------------------------------------- */
        startMusic() {
            this._ensure();
            if (!this._initialized || !this.musicOn || this.musicPlaying) return;
            const ctx = this.ctx;
            const t = ctx.currentTime;

            // Two oscillators stacked a fifth apart, slightly detuned
            const o1 = ctx.createOscillator(); o1.type = 'sine';     o1.frequency.value = 220;
            const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 330; o2.detune.value = 6;
            const o3 = ctx.createOscillator(); o3.type = 'sine';     o3.frequency.value = 110; o3.detune.value = -4;

            // Lowpass filter modulated by a slow LFO for movement
            const lpf = ctx.createBiquadFilter();
            lpf.type = 'lowpass';
            lpf.frequency.value = 700;
            lpf.Q.value = 0.6;

            const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
            const lfoGain = ctx.createGain(); lfoGain.gain.value = 350;
            lfo.connect(lfoGain).connect(lpf.frequency);

            const fade = ctx.createGain();
            fade.gain.setValueAtTime(0, t);
            fade.gain.linearRampToValueAtTime(1, t + 1.5);

            o1.connect(lpf);
            o2.connect(lpf);
            o3.connect(lpf);
            lpf.connect(fade).connect(this.musicGain);

            o1.start(t); o2.start(t); o3.start(t); lfo.start(t);

            this.musicNodes = [o1, o2, o3, lfo, lpf, fade, lfoGain];
            this.musicPlaying = true;
        }

        stopMusic() {
            if (!this._initialized || !this.musicPlaying) return;
            const ctx = this.ctx;
            const t = ctx.currentTime;
            const fade = this.musicNodes[5];
            if (fade) {
                fade.gain.cancelScheduledValues(t);
                fade.gain.setValueAtTime(fade.gain.value, t);
                fade.gain.linearRampToValueAtTime(0, t + 0.6);
            }
            // Stop oscillators after fade
            const oscs = this.musicNodes.slice(0, 4);
            oscs.forEach(o => { try { o.stop(t + 0.65); } catch (_) {} });
            this.musicNodes = [];
            this.musicPlaying = false;
        }

        /** Lower volume during the gameover-slowmo flash. */
        duck(amount = 0.4, duration = 0.6) {
            if (!this._initialized) return;
            const t = this.ctx.currentTime;
            this.master.gain.cancelScheduledValues(t);
            this.master.gain.setValueAtTime(this.master.gain.value, t);
            this.master.gain.linearRampToValueAtTime(amount, t + 0.05);
            this.master.gain.linearRampToValueAtTime(0.7, t + duration);
        }
    }

    window.audio = new AudioManager();
})();
