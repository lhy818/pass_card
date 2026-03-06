// ===================== SOUND ENGINE (Web Audio API) =====================
// All sounds are procedurally generated — no external audio files needed.

const SFX = (() => {
    let ctx = null;

    function getCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // Utility: create a gain node that fades out
    function envelope(audioCtx, attack = 0.01, decay = 0.3, volume = 0.3) {
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + attack + decay);
        gain.connect(audioCtx.destination);
        return gain;
    }

    // ---- CARD SELECT (soft click) ----
    function cardSelect() {
        const c = getCtx();
        const osc = c.createOscillator();
        const g = envelope(c, 0.005, 0.08, 0.15);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.06);
        osc.connect(g);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + 0.1);
    }

    // ---- CARD PASS (swoosh) ----
    function cardPass() {
        const c = getCtx();
        const bufferSize = c.sampleRate * 0.25;
        const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * Math.sin(t * 30);
        }
        const src = c.createBufferSource();
        src.buffer = buffer;

        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2000, c.currentTime);
        filter.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.2);
        filter.Q.value = 2;

        const g = c.createGain();
        g.gain.setValueAtTime(0.25, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);

        src.connect(filter);
        filter.connect(g);
        g.connect(c.destination);
        src.start();
    }

    // ---- DEAL CARDS (realistic card flick sound) ----
    // Simulates the crisp snap of cards being flicked off a deck
    function singleCardFlick(audioCtx, startTime) {
        // A card flick is a very short (~30-60ms) burst of noise
        // shaped with a sharp attack and fast decay, filtered to sound papery
        const duration = 0.04 + Math.random() * 0.025; // 40-65ms
        const bufferSize = Math.floor(audioCtx.sampleRate * duration);
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const t = i / bufferSize;
            // Sharp attack (first 10%), then quick exponential decay
            let amp;
            if (t < 0.1) {
                amp = t / 0.1; // fast ramp up
            } else {
                amp = Math.pow(1 - (t - 0.1) / 0.9, 2.5); // quick decay
            }
            // Noise with slight tonal character (paper vibration)
            data[i] = (Math.random() * 2 - 1) * amp;
        }

        const src = audioCtx.createBufferSource();
        src.buffer = buffer;

        // Highpass — removes low rumble, keeps the crisp snap
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1800 + Math.random() * 600;
        hp.Q.value = 0.7;

        // Bandpass — accentuate the papery mid-high frequencies
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'peaking';
        bp.frequency.value = 3500 + Math.random() * 1000;
        bp.gain.value = 6;
        bp.Q.value = 1.5;

        // Gain with slight random volume variation
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.28 + Math.random() * 0.08, startTime);

        src.connect(hp);
        hp.connect(bp);
        bp.connect(g);
        g.connect(audioCtx.destination);
        src.start(startTime);
    }

    function dealCards() {
        const c = getCtx();
        const numCards = 6 + Math.floor(Math.random() * 3); // 6-8 card flicks
        for (let i = 0; i < numCards; i++) {
            // Slightly irregular timing like a real dealer
            const delay = i * (80 + Math.random() * 40); // 80-120ms apart
            setTimeout(() => {
                singleCardFlick(c, c.currentTime);
            }, delay);
        }
    }

    // ---- BUTTON CLICK (UI feedback) ----
    function buttonClick() {
        const c = getCtx();
        const osc = c.createOscillator();
        const g = envelope(c, 0.003, 0.1, 0.12);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.05);
        osc.connect(g);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + 0.12);
    }

    // ---- SHOWDOWN REVEAL (dramatic rising chord) ----
    function showdownReveal() {
        const c = getCtx();
        const freqs = [220, 277, 330, 440, 554];
        freqs.forEach((f, i) => {
            setTimeout(() => {
                const osc = c.createOscillator();
                const g = envelope(c, 0.02, 0.8, 0.08);
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, c.currentTime);
                osc.connect(g);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.9);
            }, i * 80);
        });
    }

    // ---- WIN FANFARE (triumphant rising arpeggio) ----
    function winFanfare() {
        const c = getCtx();
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
        notes.forEach((f, i) => {
            setTimeout(() => {
                const osc = c.createOscillator();
                const osc2 = c.createOscillator();
                const g = envelope(c, 0.01, 0.5, 0.1);
                osc.type = 'sine';
                osc.frequency.value = f;
                osc2.type = 'triangle';
                osc2.frequency.value = f * 1.002; // slight detune for richness
                osc.connect(g);
                osc2.connect(g);
                osc.start(c.currentTime);
                osc2.start(c.currentTime);
                osc.stop(c.currentTime + 0.6);
                osc2.stop(c.currentTime + 0.6);
            }, i * 120);
        });
    }

    // ---- LOSE SOUND (descending wobble) ----
    function loseBuzzer() {
        const c = getCtx();
        const osc = c.createOscillator();
        const g = envelope(c, 0.01, 0.6, 0.15);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.5);

        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        osc.connect(filter);
        filter.connect(g);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + 0.7);
    }

    // ---- NOTIFICATION CHIME (for join/room events) ----
    function notifyChime() {
        const c = getCtx();
        const notes = [880, 1100];
        notes.forEach((f, i) => {
            setTimeout(() => {
                const osc = c.createOscillator();
                const g = envelope(c, 0.005, 0.2, 0.1);
                osc.type = 'sine';
                osc.frequency.value = f;
                osc.connect(g);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.25);
            }, i * 120);
        });
    }

    // ---- COUNTDOWN TICK ----
    function tick() {
        const c = getCtx();
        const osc = c.createOscillator();
        const g = envelope(c, 0.001, 0.04, 0.08);
        osc.type = 'sine';
        osc.frequency.value = 1000;
        osc.connect(g);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + 0.05);
    }

    // ---- RULE CHOSEN (magical sparkle) ----
    function ruleChosen() {
        const c = getCtx();
        const freqs = [1200, 1600, 2000, 2400];
        freqs.forEach((f, i) => {
            setTimeout(() => {
                const osc = c.createOscillator();
                const g = envelope(c, 0.005, 0.15, 0.06);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(f * 0.8, c.currentTime + 0.12);
                osc.connect(g);
                osc.start(c.currentTime);
                osc.stop(c.currentTime + 0.18);
            }, i * 50);
        });
    }

    return {
        cardSelect,
        cardPass,
        dealCards,
        buttonClick,
        showdownReveal,
        winFanfare,
        loseBuzzer,
        notifyChime,
        tick,
        ruleChosen
    };
})();
