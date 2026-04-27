/* ============================================================
   utils.js
   Small, dependency-free helpers shared across the codebase.
   Exposed on window.Utils so other plain <script> files can use
   them without an ES module setup.
   ============================================================ */
(function () {
    'use strict';

    const Utils = {

        /** Linear interpolate between a and b by t in [0,1]. */
        lerp(a, b, t) { return a + (b - a) * t; },

        /** Clamp v between min and max. */
        clamp(v, min, max) { return v < min ? min : v > max ? max : v; },

        /** Random float in [min, max). */
        rand(min, max) { return Math.random() * (max - min) + min; },

        /** Random int in [min, max] inclusive. */
        randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

        /** Random pick from array. */
        pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

        /** Smooth easing — easeOutCubic. */
        easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },

        /** Smooth easing — easeInOutQuad. */
        easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },

        /** Detect if user is on a touch-primary device. */
        isTouchDevice() {
            return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        },

        /** Detect mobile / small screen for performance tuning. */
        isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                || window.innerWidth < 600;
        },

        /** Trigger device vibration if available and enabled. */
        vibrate(pattern) {
            if (!navigator.vibrate) return;
            try { navigator.vibrate(pattern); } catch (_) { /* iOS may throw */ }
        },

        /** Convert hex color to rgba() string with alpha. */
        hexToRgba(hex, alpha = 1) {
            const h = hex.replace('#', '');
            const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        },

        /** Mix two hex colors at t in [0,1]; returns "rgb(...)". */
        mixColors(hex1, hex2, t) {
            const parse = h => {
                h = h.replace('#', '');
                if (h.length === 3) h = h.split('').map(c => c + c).join('');
                const n = parseInt(h, 16);
                return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            };
            const [r1, g1, b1] = parse(hex1);
            const [r2, g2, b2] = parse(hex2);
            const r = Math.round(r1 + (r2 - r1) * t);
            const g = Math.round(g1 + (g2 - g1) * t);
            const b = Math.round(b1 + (b2 - b1) * t);
            return `rgb(${r}, ${g}, ${b})`;
        },

        /** Axis-aligned bounding box collision. */
        aabb(a, b) {
            return a.x < b.x + b.w &&
                   a.x + a.w > b.x &&
                   a.y < b.y + b.h &&
                   a.y + a.h > b.y;
        },

        /** Format big numbers, e.g. 1234 -> "1,234". */
        formatNumber(n) {
            return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        },
    };

    window.Utils = Utils;
})();
