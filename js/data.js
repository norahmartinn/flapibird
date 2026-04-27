/* ============================================================
   data.js
   Static game data: bird skins, achievement definitions, weather
   types. Pure config — no game logic here.
   ============================================================ */
(function () {
    'use strict';

    /* ---------- BIRD SKINS ---------- */
    // Each skin has visual config + unlock requirement.
    // `tint` lets us tinting trail particles to match the bird.
    const SKINS = [
        {
            id: 'bird1',
            name: 'ROBIN',
            src: 'assets/bird1.png',
            tint: '#4cd6ff',
            unlock: { type: 'default' },
            description: 'El clásico. Siempre disponible.',
        },
        {
            id: 'bird2',
            name: 'OWL',
            src: 'assets/bird2.png',
            tint: '#a07050',
            unlock: { type: 'score', value: 10 },
            description: 'Anota 10 puntos para desbloquear.',
        },
        {
            id: 'bird3',
            name: 'WIZARD',
            src: 'assets/bird3.png',
            tint: '#b388ff',
            unlock: { type: 'score', value: 25 },
            description: 'Anota 25 puntos para desbloquear.',
        },
        {
            id: 'bird4',
            name: 'PHOENIX',
            src: 'assets/bird4.png',
            tint: '#ff7a3d',
            unlock: { type: 'score', value: 50 },
            description: 'Anota 50 puntos para desbloquear.',
        },
    ];

    /* ---------- ACHIEVEMENTS ---------- */
    // condition() runs after each scoring event / collision and
    // is given the live game stats from game.js.
    const ACHIEVEMENTS = [
        {
            id: 'first-flight',
            name: 'PRIMER VUELO',
            description: 'Haz tu primer salto.',
            icon: '🐣',
            condition: (s) => s.totalJumps >= 1,
        },
        {
            id: 'score-5',
            name: 'BUEN INICIO',
            description: 'Consigue 5 puntos en una partida.',
            icon: '⭐',
            condition: (s) => s.score >= 5,
        },
        {
            id: 'score-10',
            name: 'EN RUMBO',
            description: 'Consigue 10 puntos en una partida.',
            icon: '🎯',
            condition: (s) => s.score >= 10,
        },
        {
            id: 'score-25',
            name: 'EXPERTO',
            description: 'Consigue 25 puntos en una partida.',
            icon: '🏅',
            condition: (s) => s.score >= 25,
        },
        {
            id: 'score-50',
            name: 'LEYENDA',
            description: 'Consigue 50 puntos en una partida.',
            icon: '👑',
            condition: (s) => s.score >= 50,
        },
        {
            id: 'score-100',
            name: 'INMORTAL',
            description: 'Consigue 100 puntos en una partida.',
            icon: '💎',
            condition: (s) => s.score >= 100,
        },
        {
            id: 'combo-5',
            name: 'EN RACHA',
            description: 'Consigue una racha de combo x5.',
            icon: '🔥',
            condition: (s) => s.maxCombo >= 5,
        },
        {
            id: 'plays-10',
            name: 'PERSISTENTE',
            description: 'Juega 10 partidas.',
            icon: '🔄',
            condition: (s) => s.plays >= 10,
        },
        {
            id: 'night-owl',
            name: 'BÚHO NOCTURNO',
            description: 'Juega durante el ciclo nocturno.',
            icon: '🌙',
            condition: (s) => s.playedAtNight,
        },
        {
            id: 'phoenix-rises',
            name: 'AVE FÉNIX',
            description: 'Equipa la skin Phoenix.',
            icon: '🔥',
            condition: (s) => s.selectedSkin === 'bird4',
        },
        {
            id: 'storm-rider',
            name: 'RIDER DE TORMENTA',
            description: 'Anota 10 puntos con clima activo.',
            icon: '⛈️',
            condition: (s) => s.scoreWithWeather >= 10,
        },
        {
            id: 'total-100',
            name: 'COLECCIONISTA',
            description: 'Acumula 100 puntos en total.',
            icon: '📈',
            condition: (s) => s.totalScore >= 100,
        },
    ];

    /* ---------- WEATHER MODES ---------- */
    // Probabilities are picked when starting a new run. Some
    // modes are rare ("events") — handled in game.js.
    const WEATHER_TYPES = [
        { id: 'clear', weight: 60 },
        { id: 'rain',  weight: 18 },
        { id: 'snow',  weight: 10 },
        { id: 'wind',  weight: 12 },
    ];

    /* ---------- MEDAL TIERS ---------- */
    const MEDAL_TIERS = [
        { tier: 'platinum', minScore: 50, label: '¡INSANO!' },
        { tier: 'gold',     minScore: 25, label: '¡INCREÍBLE!' },
        { tier: 'silver',   minScore: 10, label: '¡BIEN HECHO!' },
        { tier: 'bronze',   minScore:  5, label: 'BUEN INTENTO' },
        { tier: 'none',     minScore:  0, label: 'SIGUE INTENTANDO' },
    ];

    window.GameData = { SKINS, ACHIEVEMENTS, WEATHER_TYPES, MEDAL_TIERS };
})();
