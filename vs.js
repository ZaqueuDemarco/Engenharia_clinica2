/* Player VS - Multitracks
   Toca vários arquivos de áudio (faixas) em sincronia usando Web Audio API.
   As VS (músicas/sets) e suas faixas ficam salvas no navegador (IndexedDB),
   então depois de carregadas uma vez elas continuam disponíveis. */

(() => {
    "use strict";

    /* ---------- Banco local (IndexedDB) ---------- */

    const DB_NAME = "vsPlayerDB";
    const DB_VERSION = 1;
    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("songs")) {
                    db.createObjectStore("songs", { keyPath: "id", autoIncrement: true });
                }
                if (!db.objectStoreNames.contains("tracks")) {
                    const store = db.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
                    store.createIndex("songId", "songId", { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return dbPromise;
    }

    async function dbAdd(storeName, obj) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const req = tx.objectStore(storeName).add(obj);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbGetAll(storeName) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbGetTracksBySong(songId) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("tracks", "readonly");
            const req = tx.objectStore("tracks").index("songId").getAll(songId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbDelete(storeName, id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const req = tx.objectStore(storeName).delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function dbDeleteSongAndTracks(songId) {
        const tracks = await dbGetTracksBySong(songId);
        for (const t of tracks) {
            await dbDelete("tracks", t.id);
        }
        await dbDelete("songs", songId);
    }

    /* ---------- Motor de áudio ---------- */

    const engine = {
        ctx: null,
        masterGain: null,
        masterVolume: 1,
        tracks: [], // { id, name, blob, buffer, volume, muted, solo, gainNode, sourceNode }
        playing: false,
        startCtxTime: 0,
        startOffset: 0,
        rafId: null,
        onTick: null, // callback(position, duration)
        onEnded: null,

        ensureContext() {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = this.masterVolume;
                this.masterGain.connect(this.ctx.destination);
                for (const track of this.tracks) this._ensureTrackGain(track);
            }
        },

        _ensureTrackGain(track) {
            if (this.ctx && !track.gainNode) {
                track.gainNode = this.ctx.createGain();
                track.gainNode.connect(this.masterGain);
                this._applyTrackGain(track);
            }
        },

        async decodeTrack(track) {
            if (track.buffer) return track.buffer;
            this.ensureContext();
            const arrayBuffer = await track.blob.arrayBuffer();
            track.buffer = await this.ctx.decodeAudioData(arrayBuffer);
            return track.buffer;
        },

        async loadTracks(trackRecords) {
            this.stop();
            this.tracks = trackRecords.map(r => ({
                id: r.id,
                name: r.name,
                blob: r.blob,
                buffer: null,
                volume: 1,
                muted: false,
                solo: false,
                gainNode: null,
                sourceNode: null
            }));
            this.ensureContext();
            await Promise.all(this.tracks.map(t => this.decodeTrack(t)));
            for (const t of this.tracks) this._ensureTrackGain(t);
        },

        async addTrack(record) {
            const track = {
                id: record.id,
                name: record.name,
                blob: record.blob,
                buffer: null,
                volume: 1,
                muted: false,
                solo: false,
                gainNode: null,
                sourceNode: null
            };
            this.tracks.push(track);
            this.ensureContext();
            await this.decodeTrack(track);
            this._ensureTrackGain(track);
            if (this.playing) {
                const pos = this.getPosition();
                if (pos < track.buffer.duration) {
                    const source = this.ctx.createBufferSource();
                    source.buffer = track.buffer;
                    source.connect(track.gainNode);
                    source.start(this.ctx.currentTime, pos);
                    track.sourceNode = source;
                }
            }
            return track;
        },

        removeTrack(trackId) {
            const track = this.tracks.find(t => t.id === trackId);
            if (!track) return;
            if (track.sourceNode) {
                try { track.sourceNode.stop(); } catch (e) { /* já parado */ }
                track.sourceNode.disconnect();
            }
            if (track.gainNode) track.gainNode.disconnect();
            this.tracks = this.tracks.filter(t => t.id !== trackId);
        },

        getDuration() {
            return this.tracks.reduce((max, t) => t.buffer ? Math.max(max, t.buffer.duration) : max, 0);
        },

        getPosition() {
            if (this.playing) {
                return this.startOffset + (this.ctx.currentTime - this.startCtxTime);
            }
            return this.startOffset;
        },

        _applyTrackGain(track) {
            if (!track.gainNode) return;
            const anySolo = this.tracks.some(t => t.solo);
            const audible = anySolo ? track.solo : !track.muted;
            const gain = audible ? track.volume : 0;
            track.gainNode.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
        },

        setVolume(trackId, value) {
            const track = this.tracks.find(t => t.id === trackId);
            if (!track) return;
            track.volume = value;
            this._applyTrackGain(track);
        },

        toggleMute(trackId) {
            const track = this.tracks.find(t => t.id === trackId);
            if (!track) return;
            track.muted = !track.muted;
            for (const t of this.tracks) this._applyTrackGain(t);
        },

        toggleSolo(trackId) {
            const track = this.tracks.find(t => t.id === trackId);
            if (!track) return;
            track.solo = !track.solo;
            for (const t of this.tracks) this._applyTrackGain(t);
        },

        setMasterVolume(value) {
            this.masterVolume = value;
            if (this.masterGain) this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        },

        _stopSources() {
            for (const track of this.tracks) {
                if (track.sourceNode) {
                    try { track.sourceNode.stop(); } catch (e) { /* já parado */ }
                    track.sourceNode.disconnect();
                    track.sourceNode = null;
                }
            }
        },

        async play() {
            if (this.playing || this.tracks.length === 0) return;
            this.ensureContext();
            if (this.ctx.state === "suspended") await this.ctx.resume();

            const duration = this.getDuration();
            if (this.startOffset >= duration) this.startOffset = 0;

            for (const track of this.tracks) {
                if (!track.buffer) continue;
                if (this.startOffset >= track.buffer.duration) continue;
                this._ensureTrackGain(track);
                const source = this.ctx.createBufferSource();
                source.buffer = track.buffer;
                source.connect(track.gainNode);
                source.start(this.ctx.currentTime, this.startOffset);
                track.sourceNode = source;
            }

            this.startCtxTime = this.ctx.currentTime;
            this.playing = true;
            this._loop();
        },

        pause() {
            if (!this.playing) return;
            this.startOffset = this.getPosition();
            this._stopSources();
            this.playing = false;
            if (this.rafId) cancelAnimationFrame(this.rafId);
        },

        stop() {
            this._stopSources();
            this.playing = false;
            this.startOffset = 0;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            if (this.onTick) this.onTick(0, this.getDuration());
        },

        seek(position) {
            const duration = this.getDuration();
            const clamped = Math.max(0, Math.min(position, duration));
            const wasPlaying = this.playing;
            if (wasPlaying) this._stopSources();
            this.startOffset = clamped;
            this.playing = false;
            if (wasPlaying) {
                this.play();
            } else if (this.onTick) {
                this.onTick(clamped, duration);
            }
        },

        _loop() {
            if (!this.playing) return;
            const duration = this.getDuration();
            const pos = this.getPosition();
            if (this.onTick) this.onTick(pos, duration);
            if (pos >= duration && duration > 0) {
                this.stop();
                if (this.onEnded) this.onEnded();
                return;
            }
            this.rafId = requestAnimationFrame(() => this._loop());
        }
    };

    /* ---------- Estado da interface ---------- */

    const state = {
        songs: [],
        currentSongId: null,
        isSeeking: false
    };

    const el = {
        listaVs: document.getElementById("lista-vs"),
        btnNovaVs: document.getElementById("btn-nova-vs"),
        inputArquivos: document.getElementById("input-arquivos"),
        vsVazio: document.getElementById("vs-vazio"),
        vsConteudo: document.getElementById("vs-conteudo"),
        vsNomeAtual: document.getElementById("vs-nome-atual"),
        btnExcluirVs: document.getElementById("btn-excluir-vs"),
        dropZone: document.getElementById("drop-zone"),
        inputAddFaixa: document.getElementById("input-add-faixa"),
        listaFaixas: document.getElementById("lista-faixas"),
        btnPlay: document.getElementById("btn-play"),
        btnStop: document.getElementById("btn-stop"),
        tempoAtual: document.getElementById("tempo-atual"),
        tempoTotal: document.getElementById("tempo-total"),
        seek: document.getElementById("seek"),
        masterVolume: document.getElementById("master-volume")
    };

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) seconds = 0;
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function extensionlessName(fileName) {
        return fileName.replace(/\.[^/.]+$/, "");
    }

    /* ---------- Renderização ---------- */

    async function refreshSongList() {
        state.songs = await dbGetAll("songs");
        el.listaVs.innerHTML = "";
        if (state.songs.length === 0) {
            const li = document.createElement("li");
            li.className = "vazio";
            li.textContent = "Nenhuma VS ainda.";
            el.listaVs.appendChild(li);
            return;
        }
        for (const song of state.songs) {
            const li = document.createElement("li");
            li.dataset.id = song.id;
            if (song.id === state.currentSongId) li.classList.add("ativa");

            const nome = document.createElement("span");
            nome.className = "nome-vs";
            nome.textContent = song.name;
            li.appendChild(nome);

            const remover = document.createElement("button");
            remover.className = "remover-vs";
            remover.textContent = "✕";
            remover.title = "Excluir VS";
            li.appendChild(remover);

            el.listaVs.appendChild(li);
        }
    }

    function renderTrackRow(track) {
        const row = document.createElement("div");
        row.className = "faixa";
        row.dataset.id = track.id;

        row.innerHTML = `
            <span class="faixa-nome" title="${track.name}">${track.name}</span>
            <input type="range" class="faixa-volume" min="0" max="1" step="0.01" value="${track.volume}">
            <button class="faixa-mute ${track.muted ? "ativa" : ""}" title="Mudo">M</button>
            <button class="faixa-solo ${track.solo ? "ativa" : ""}" title="Solo">S</button>
            <button class="faixa-remover" title="Remover faixa">✕</button>
        `;
        return row;
    }

    function renderTracks() {
        el.listaFaixas.innerHTML = "";
        for (const track of engine.tracks) {
            el.listaFaixas.appendChild(renderTrackRow(track));
        }
        updateSeekBounds();
    }

    function updateSeekBounds() {
        const duration = engine.getDuration();
        el.seek.max = duration || 0;
        el.tempoTotal.textContent = formatTime(duration);
    }

    function updateTransportUI(position, duration) {
        if (!state.isSeeking) {
            el.seek.value = position;
        }
        el.tempoAtual.textContent = formatTime(position);
        el.tempoTotal.textContent = formatTime(duration);
    }

    /* ---------- Ações ---------- */

    async function criarNovaVs(files) {
        if (!files || files.length === 0) return;
        const sugestao = extensionlessName(files[0].name);
        const nome = window.prompt("Nome da VS (música):", sugestao) || sugestao;

        const songId = await dbAdd("songs", { name: nome, createdAt: Date.now() });
        for (const file of files) {
            await dbAdd("tracks", { songId, name: file.name, blob: file });
        }
        await refreshSongList();
        await selecionarVs(songId);
    }

    async function selecionarVs(songId) {
        engine.stop();
        state.currentSongId = songId;
        await refreshSongList();

        const song = state.songs.find(s => s.id === songId);
        el.vsVazio.style.display = "none";
        el.vsConteudo.style.display = "block";
        el.vsNomeAtual.textContent = song ? song.name : "";
        el.listaFaixas.innerHTML = '<p style="color:#888">Carregando faixas...</p>';

        const trackRecords = await dbGetTracksBySong(songId);
        await engine.loadTracks(trackRecords);

        renderTracks();
        el.btnPlay.textContent = "▶";
        updateTransportUI(0, engine.getDuration());
        el.masterVolume.value = engine.masterVolume;
    }

    async function excluirVsAtual() {
        if (state.currentSongId == null) return;
        const song = state.songs.find(s => s.id === state.currentSongId);
        const ok = window.confirm(`Excluir a VS "${song ? song.name : ""}" e todas as suas faixas?`);
        if (!ok) return;

        engine.stop();
        await dbDeleteSongAndTracks(state.currentSongId);
        state.currentSongId = null;
        engine.tracks = [];
        el.vsConteudo.style.display = "none";
        el.vsVazio.style.display = "flex";
        await refreshSongList();
    }

    async function excluirVsPorId(songId) {
        const song = state.songs.find(s => s.id === songId);
        const ok = window.confirm(`Excluir a VS "${song ? song.name : ""}" e todas as suas faixas?`);
        if (!ok) return;

        if (songId === state.currentSongId) {
            engine.stop();
            engine.tracks = [];
            state.currentSongId = null;
            el.vsConteudo.style.display = "none";
            el.vsVazio.style.display = "flex";
        }
        await dbDeleteSongAndTracks(songId);
        await refreshSongList();
    }

    async function adicionarFaixas(files) {
        if (!files || files.length === 0 || state.currentSongId == null) return;
        for (const file of files) {
            const id = await dbAdd("tracks", { songId: state.currentSongId, name: file.name, blob: file });
            await engine.addTrack({ id, name: file.name, blob: file });
        }
        renderTracks();
    }

    async function removerFaixa(trackId) {
        engine.removeTrack(trackId);
        await dbDelete("tracks", trackId);
        renderTracks();
    }

    /* ---------- Eventos ---------- */

    el.btnNovaVs.addEventListener("click", () => el.inputArquivos.click());
    el.inputArquivos.addEventListener("change", (e) => {
        criarNovaVs(Array.from(e.target.files));
        e.target.value = "";
    });

    el.listaVs.addEventListener("click", (e) => {
        const li = e.target.closest("li[data-id]");
        if (!li) return;
        const songId = Number(li.dataset.id);
        if (e.target.classList.contains("remover-vs")) {
            excluirVsPorId(songId);
        } else {
            selecionarVs(songId);
        }
    });

    el.btnExcluirVs.addEventListener("click", excluirVsAtual);

    el.inputAddFaixa.addEventListener("change", (e) => {
        adicionarFaixas(Array.from(e.target.files));
        e.target.value = "";
    });

    el.dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.dropZone.classList.add("arrastando");
    });
    el.dropZone.addEventListener("dragleave", () => {
        el.dropZone.classList.remove("arrastando");
    });
    el.dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        el.dropZone.classList.remove("arrastando");
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("audio/"));
        adicionarFaixas(files);
    });

    el.listaFaixas.addEventListener("input", (e) => {
        if (e.target.classList.contains("faixa-volume")) {
            const trackId = Number(e.target.closest(".faixa").dataset.id);
            engine.setVolume(trackId, Number(e.target.value));
        }
    });

    el.listaFaixas.addEventListener("click", (e) => {
        const row = e.target.closest(".faixa");
        if (!row) return;
        const trackId = Number(row.dataset.id);

        if (e.target.classList.contains("faixa-mute")) {
            engine.toggleMute(trackId);
            e.target.classList.toggle("ativa");
        } else if (e.target.classList.contains("faixa-solo")) {
            engine.toggleSolo(trackId);
            e.target.classList.toggle("ativa");
        } else if (e.target.classList.contains("faixa-remover")) {
            removerFaixa(trackId);
        }
    });

    el.btnPlay.addEventListener("click", async () => {
        if (engine.playing) {
            engine.pause();
            el.btnPlay.textContent = "▶";
        } else {
            await engine.play();
            el.btnPlay.textContent = "⏸";
        }
    });

    el.btnStop.addEventListener("click", () => {
        engine.stop();
        el.btnPlay.textContent = "▶";
    });

    el.seek.addEventListener("mousedown", () => { state.isSeeking = true; });
    el.seek.addEventListener("touchstart", () => { state.isSeeking = true; });

    el.seek.addEventListener("change", () => {
        engine.seek(Number(el.seek.value));
        state.isSeeking = false;
    });

    el.masterVolume.addEventListener("input", () => {
        engine.setMasterVolume(Number(el.masterVolume.value));
    });

    engine.onTick = updateTransportUI;
    engine.onEnded = () => { el.btnPlay.textContent = "▶"; };

    /* ---------- Início ---------- */

    refreshSongList();
})();
