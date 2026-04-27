/* ============================================================
   storage.js
   Persistent storage wrapper around localStorage with safe
   fallbacks (in-memory) and namespaced keys.
   ============================================================ */
(function () {
    'use strict';

    const NAMESPACE = 'flappi-pro:v1';
    const memoryFallback = {};
    let storageOk = true;

    // Probe for localStorage availability (private mode / sandboxed iframes can throw)
    try {
        const testKey = '__flappi_probe__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
    } catch (_) {
        storageOk = false;
    }

    function key(k) { return `${NAMESPACE}:${k}`; }

    const Storage = {

        /** Save a JSON-serializable value. */
        set(k, value) {
            const fullKey = key(k);
            try {
                if (storageOk) localStorage.setItem(fullKey, JSON.stringify(value));
                else memoryFallback[fullKey] = JSON.stringify(value);
            } catch (e) {
                // Quota exceeded etc. Fall back silently to memory.
                memoryFallback[fullKey] = JSON.stringify(value);
            }
        },

        /** Read with default. */
        get(k, defaultValue = null) {
            const fullKey = key(k);
            try {
                const raw = storageOk ? localStorage.getItem(fullKey) : memoryFallback[fullKey];
                if (raw == null) return defaultValue;
                return JSON.parse(raw);
            } catch (_) {
                return defaultValue;
            }
        },

        /** Remove a single key. */
        remove(k) {
            const fullKey = key(k);
            try {
                if (storageOk) localStorage.removeItem(fullKey);
                delete memoryFallback[fullKey];
            } catch (_) { /* noop */ }
        },

        /** Wipe all flappi-pro keys (used by "reset data"). */
        clearAll() {
            try {
                if (storageOk) {
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith(NAMESPACE)) localStorage.removeItem(k);
                    }
                }
                for (const k in memoryFallback) delete memoryFallback[k];
            } catch (_) { /* noop */ }
        },
    };

    /* ============================================================
       SAVE DATA — high-level accessors with defaults baked in.
       ============================================================ */
    const SaveData = {
        getBest()      { return Storage.get('bestScore', 0); },
        setBest(v)     { Storage.set('bestScore', v); },

        getCoins()     { return Storage.get('coins', 0); },
        addCoins(n)    { Storage.set('coins', SaveData.getCoins() + n); },

        getPlays()     { return Storage.get('plays', 0); },
        incrementPlays() { Storage.set('plays', SaveData.getPlays() + 1); },

        getTotalScore()  { return Storage.get('totalScore', 0); },
        addTotalScore(v) { Storage.set('totalScore', SaveData.getTotalScore() + v); },

        getSelectedSkin()  { return Storage.get('selectedSkin', 'bird1'); },
        setSelectedSkin(id){ Storage.set('selectedSkin', id); },

        getUnlockedSkins() { return Storage.get('unlockedSkins', ['bird1']); },
        unlockSkin(id) {
            const u = SaveData.getUnlockedSkins();
            if (!u.includes(id)) { u.push(id); Storage.set('unlockedSkins', u); return true; }
            return false;
        },

        getUnlockedAchievements() { return Storage.get('achievements', []); },
        unlockAchievement(id) {
            const a = SaveData.getUnlockedAchievements();
            if (!a.includes(id)) { a.push(id); Storage.set('achievements', a); return true; }
            return false;
        },

        getSettings() {
            return Storage.get('settings', {
                music: true,
                sfx: true,
                vibrate: true,
                lowEffects: false,
                forceNight: false,
                tutorialSeen: false,
            });
        },
        saveSettings(s) { Storage.set('settings', s); },
        updateSetting(k, v) {
            const s = SaveData.getSettings();
            s[k] = v;
            SaveData.saveSettings(s);
        },
    };

    window.Storage = Storage;
    window.SaveData = SaveData;
})();
