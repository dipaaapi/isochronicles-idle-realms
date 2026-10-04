class SoundFxManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private isBgmDisabled: boolean = false;
  private isSfxDisabled: boolean = false;
  // SFX bus (every sound effect connects here); music has its own bus so the
  // two toggles cut audio at the node level, not only when a sound starts.
  private masterGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private outGain: GainNode | null = null;
  private listeners: Set<(muted: boolean) => void> = new Set();
  
  // 0..1 volume per bus, persisted like the on/off toggles
  private musicVolume = 1;
  private sfxVolume = 1;
  // A YouTube / Spotify player is open: the procedural BGM steps aside (SFX stay)
  private isExternalMusicActive = false;

  private bgmOscillators: OscillatorNode[] = [];
  private bgmGain: GainNode | null = null;
  private isBgmPlaying: boolean = false;
  private currentBgmMode: 'LIVELY' | 'BATTLE' | 'BOSS' | 'NIGHT' | 'AMBIENT' | 'RAIN' | 'SNOW' | 'HEATWAVE' | 'TITLE' = 'TITLE';
  private bgmIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('isochronicle_audio_muted') : null;
    if (saved !== null) {
      this.isMuted = saved === 'true';
    }
    const savedBgm = typeof window !== 'undefined' ? localStorage.getItem('isochronicle_bgm_disabled') : null;
    if (savedBgm !== null) {
      this.isBgmDisabled = savedBgm === 'true';
    }
    const readVol = (key: string) => {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      const v = raw === null ? NaN : Number(raw);
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
    };
    this.musicVolume = readVol('isochronicle_music_volume');
    this.sfxVolume = readVol('isochronicle_sfx_volume');
    const savedSfx = typeof window !== 'undefined' ? localStorage.getItem('isochronicle_sfx_disabled') : null;
    if (savedSfx !== null) {
      this.isSfxDisabled = savedSfx === 'true';
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return null;

      this.ctx = new AudioCtxClass();
      this.outGain = this.ctx.createGain();
      this.outGain.connect(this.ctx.destination);
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.outGain);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.outGain);
      this.applyBusGains();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private applyBusGains(): void {
    if (!this.ctx || !this.outGain || !this.masterGain || !this.musicBus) return;
    const now = this.ctx.currentTime;
    this.outGain.gain.cancelScheduledValues(now);
    this.outGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, now);
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.isSfxDisabled ? 0 : this.sfxVolume, now);
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(this.isBgmDisabled || this.isExternalMusicActive ? 0 : this.musicVolume, now);
  }

  public setExternalMusicActive(active: boolean): void {
    this.isExternalMusicActive = active;
    this.applyBusGains();
  }

  public getMusicVolume(): number { return this.musicVolume; }
  public getSfxVolume(): number { return this.sfxVolume; }

  public setMusicVolume(v: number): void {
    this.musicVolume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('isochronicle_music_volume', String(this.musicVolume)); } catch { /* storage off */ }
    this.applyBusGains();
  }

  public setSfxVolume(v: number): void {
    this.sfxVolume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('isochronicle_sfx_volume', String(this.sfxVolume)); } catch { /* storage off */ }
    this.applyBusGains();
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsBgmDisabled(): boolean {
    return this.isBgmDisabled;
  }

  public getIsSfxDisabled(): boolean {
    return this.isSfxDisabled;
  }

  public toggleBgm(): boolean {
    this.isBgmDisabled = !this.isBgmDisabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('isochronicle_bgm_disabled', String(this.isBgmDisabled));
    }
    this.applyBusGains();
    if (this.isBgmDisabled) {
      this.stopBackgroundMusic();
    } else if (!this.isMuted) {
      this.playBackgroundMusic(this.currentBgmMode);
    }
    this.listeners.forEach((cb) => cb(this.isMuted));
    return this.isBgmDisabled;
  }

  public toggleSfx(): boolean {
    this.isSfxDisabled = !this.isSfxDisabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('isochronicle_sfx_disabled', String(this.isSfxDisabled));
    }
    this.applyBusGains();
    this.listeners.forEach((cb) => cb(this.isMuted));
    return this.isSfxDisabled;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('isochronicle_audio_muted', String(this.isMuted));
    }

    this.applyBusGains();
    
    if (this.isMuted) {
      this.stopBackgroundMusic();
    } else if (!this.isBgmDisabled) {
      this.playBackgroundMusic(this.currentBgmMode);
    }

    this.listeners.forEach((cb) => cb(this.isMuted));
    return this.isMuted;
  }

  public subscribeMute(callback: (muted: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public playBackgroundMusic(mode: 'LIVELY' | 'BATTLE' | 'BOSS' | 'NIGHT' | 'AMBIENT' | 'RAIN' | 'SNOW' | 'HEATWAVE' | 'TITLE' = 'LIVELY'): void {
    if (this.isMuted || this.isBgmDisabled) {
      this.currentBgmMode = mode;
      return;
    }
    
    if (this.isBgmPlaying && this.currentBgmMode === mode) return;
    
    if (this.isBgmPlaying) {
      this.stopBackgroundMusic();
    }

    const ctx = this.initContext();
    if (!ctx || !this.musicBus) return;

    this.isBgmPlaying = true;
    this.currentBgmMode = mode;
    this.bgmGain = ctx.createGain();
    this.bgmGain.connect(this.musicBus);

    let step = 0;

    if (mode === 'TITLE') {
      const melody = [261.63, 311.13, 392.00, 493.88, 523.25, 392.00, 311.13, 293.66];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);

      const droneOsc = ctx.createOscillator();
      const droneGain = ctx.createGain();
      droneOsc.type = 'sawtooth';
      droneOsc.frequency.setValueAtTime(65.41, ctx.currentTime);
      droneGain.gain.setValueAtTime(0.04, ctx.currentTime);
      droneOsc.connect(droneGain);
      droneGain.connect(this.bgmGain);
      droneOsc.start();
      this.bgmOscillators.push(droneOsc);

      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted || this.isBgmDisabled) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'triangle', 0.12, 0.45);

        if (step % 4 === 0) {
          this.playPluck(130.81, 'sawtooth', 0.08, 0.8);
        }
        step++;
      }, 380);
    } else if (mode === 'LIVELY') {
      const melody = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted || this.isBgmDisabled) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'sine', 0.15, 0.5);
        
        if (step % 6 === 0) {
           this.playPluck(130.81, 'triangle', 0.2, 1.2);
        }
        step++;
      }, 350);
    } else if (mode === 'BATTLE') {
      const melody = [220.00, 261.63, 293.66, 329.63, 293.66, 261.63];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted || this.isBgmDisabled) return;
        const note = melody[Math.floor(Math.random() * melody.length)];
        this.playPluck(note, 'triangle', 0.12, 0.3); 
        
        if (step % 2 === 0) {
           this.playPluck(110.00, 'square', 0.08, 0.4);
        }
        step++;
      }, 220);
    } else if (mode === 'BOSS') {
      // Driving minor ostinato with a war-drum pulse on every beat
      const melody = [110.0, 130.81, 146.83, 155.56, 146.83, 130.81, 123.47, 110.0];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted || this.isBgmDisabled) return;
        this.playPluck(melody[step % melody.length] * 2, 'sawtooth', 0.07, 0.25);
        this.playPluck(55, 'square', 0.1, 0.18);
        if (step % 4 === 2) this.playPluck(melody[(step + 3) % melody.length] * 4, 'triangle', 0.08, 0.4);
        step++;
      }, 190);
    } else if (mode === 'NIGHT') {
      // Sparse, low lullaby: slow arpeggio over a soft fifth drone
      const melody = [220.0, 261.63, 329.63, 261.63, 196.0, 246.94, 293.66, 246.94];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted || this.isBgmDisabled) return;
        this.playPluck(melody[step % melody.length], 'sine', 0.09, 1.4);
        if (step % 8 === 0) this.playPluck(110.0, 'triangle', 0.08, 3.0);
        if (Math.random() < 0.15) this.playPluck(1760 + Math.random() * 600, 'sine', 0.015, 0.3);
        step++;
      }, 700);
    } else if (mode === 'RAIN') {
      const melody = [293.66, 349.23, 440.00, 523.25, 440.00, 349.23, 293.66, 261.63];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted || this.isBgmDisabled) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'sine', 0.10, 0.7);
        
        if (step % 4 === 0) {
          this.playPluck(146.83, 'triangle', 0.12, 1.5);
        }
        if (Math.random() < 0.4) {
          const patter = 1800 + Math.random() * 600;
          this.playPluck(patter, 'sine', 0.03, 0.08);
        }
        step++;
      }, 450);
    } else if (mode === 'SNOW') {
      const melody = [523.25, 587.33, 659.25, 739.99, 783.99, 659.25, 523.25, 493.88];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted || this.isBgmDisabled) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'sine', 0.08, 1.0);
        
        if (step % 8 === 0) {
          this.playPluck(261.63, 'triangle', 0.10, 2.0);
        }
        if (Math.random() < 0.25) {
          this.playPluck(2200 + Math.random() * 800, 'sine', 0.02, 0.15);
        }
        step++;
      }, 600);
    } else if (mode === 'HEATWAVE') {
      const melody = [329.63, 349.23, 440.00, 415.30, 392.00, 349.23, 329.63, 311.13];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted || this.isBgmDisabled) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'triangle', 0.11, 0.45);
        
        if (step % 3 === 0) {
          this.playPluck(164.81, 'sawtooth', 0.06, 0.6);
        }
        if (Math.random() < 0.35) {
          this.playPluck(1500 + Math.random() * 500, 'sine', 0.025, 0.06);
        }
        step++;
      }, 300);
    } else {
      const frequencies = [130.81, 155.56, 196.00, 293.66];
      frequencies.forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.05 + Math.random() * 0.05, ctx.currentTime);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(2, ctx.currentTime); 
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
        
        osc.connect(this.bgmGain!);
        osc.start();
        lfo.start();
        this.bgmOscillators.push(osc, lfo);
      });
      this.bgmGain.gain.setValueAtTime(0.1, ctx.currentTime);
    }
  }

  private playPluck(frequency: number, type: OscillatorType, volume: number, duration: number) {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.bgmGain);
    
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }

  public stopBackgroundMusic(): void {
    this.isBgmPlaying = false;
    
    if (this.bgmIntervalId) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }

    this.bgmOscillators.forEach(osc => {
      try { osc.stop(); } catch(e) {}
    });
    this.bgmOscillators = [];
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
  }

  public playClick(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.05);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playGameStart(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const notes = [261.63, 392.0, 523.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx === notes.length - 1 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.05, startTime + 0.2);

      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }

  public playHarvest(nodeType: 'crystal' | 'wood' | 'stone' = 'crystal'): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    if (nodeType === 'crystal') {
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(659.25, now);
      osc2.frequency.setValueAtTime(1318.5, now);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    } else if (nodeType === 'wood') {
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(320, now);
      osc1.frequency.exponentialRampToValueAtTime(160, now + 0.12);
      osc2.frequency.setValueAtTime(480, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    } else {
      osc1.type = 'sawtooth';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    }

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.38);
    osc2.stop(now + 0.38);
  }

  public playDeposit(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, index) => {
      const startTime = now + index * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  }

  public playFanfare(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const chord = [587.33, 739.99, 880.0, 1174.66];

    chord.forEach((freq, idx) => {
      const startTime = now + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx === chord.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      const noteDuration = idx === chord.length - 1 ? 0.6 : 0.28;
      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + noteDuration + 0.05);
    });
  }

  public playGolemCheer(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(550, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.1);
    osc.frequency.setValueAtTime(1320, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playCoin(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    [1200, 1600].forEach((freq, idx) => {
      const startTime = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, startTime + 0.06);

      gain.gain.setValueAtTime(0.22, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.14);
    });
  }

  public playLaser(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playExplosion(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Filtered white-noise burst — shared by thunder and splashes. */
  private playNoise(duration: number, filterFreq: number, volume: number, attack: number = 0.005): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreq * 0.15), now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
  }

  /** Crack followed by a long low rumble; `intensity` < 1 for distant thunder. */
  public playThunder(intensity: number = 1): void {
    if (intensity > 0.6) this.playNoise(0.35, 4000, 0.35 * intensity);
    this.playNoise(2.4, 420, 0.4 * intensity, 0.12);
  }

  public playSplash(): void {
    this.playNoise(0.22, 2600, 0.08);
  }

  // ── Battle sounds ──────────────────────────────────────────────────────────
  // Throttled per kind so a big melee doesn't stack dozens of voices at once.
  private lastBattleSound: Record<string, number> = {};

  private battleReady(kind: string, gapMs: number): AudioContext | null {
    if (this.isMuted || this.isSfxDisabled) return null;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - (this.lastBattleSound[kind] ?? -Infinity) < gapMs) return null;
    this.lastBattleSound[kind] = nowMs;
    const ctx = this.initContext();
    return ctx && this.masterGain ? ctx : null;
  }

  /** Short decaying partial, used to build metallic ringing tones. */
  private ring(ctx: AudioContext, freq: number, volume: number, decay: number, type: OscillatorType = 'sine'): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * (0.97 + Math.random() * 0.06), now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + decay + 0.02);
  }

  /** Steel on steel: a bright noise transient plus inharmonic ringing partials. */
  public playSwordClang(): void {
    const ctx = this.battleReady('clang', 70);
    if (!ctx) return;
    this.playNoise(0.06, 7000, 0.22, 0.002);
    const base = 900 + Math.random() * 500;
    this.ring(ctx, base, 0.12, 0.35);
    this.ring(ctx, base * 2.76, 0.07, 0.25);
    this.ring(ctx, base * 5.4, 0.04, 0.15, 'triangle');
  }

  /** Heavy monster blow: low thump with a crunchy body. */
  public playMonsterBash(): void {
    const ctx = this.battleReady('bash', 80);
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140 + Math.random() * 30, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.24);
    this.playNoise(0.12, 900, 0.25, 0.003);
  }

  /** Battering a wall or building: wooden/stone bang with a short rattle. */
  public playWallBang(): void {
    const ctx = this.battleReady('bang', 110);
    if (!ctx) return;
    this.playNoise(0.18, 1600, 0.3, 0.002);
    this.ring(ctx, 180 + Math.random() * 40, 0.22, 0.2, 'triangle');
    this.ring(ctx, 420, 0.06, 0.12, 'square');
  }

  public playCastleHit(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.3);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playBreach(): void {
    if (this.isMuted || this.isSfxDisabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 1.2);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 1.5);
  }

  // ── UI & progression sounds ────────────────────────────────────────────────
  /** Quick arpeggio of tones; the shared body of most UI / progression cues. */
  private arp(kind: string, gapMs: number, notes: number[], step: number, type: OscillatorType, volume: number, decay: number): void {
    const ctx = this.battleReady(kind, gapMs);
    if (!ctx) return;
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + decay + 0.02);
    });
  }

  /** Soft tick for switching tabs. */
  public playTab(): void { this.arp('tab', 40, [1320], 0, 'triangle', 0.08, 0.05); }

  /** Two-note toggle: rising for on, falling for off. */
  public playToggle(on: boolean): void {
    this.arp('toggle', 60, on ? [660, 990] : [990, 660], 0.05, 'square', 0.05, 0.07);
  }

  /** Airy whoosh when a panel opens or closes. */
  public playPanel(open: boolean): void {
    if (!this.battleReady('panel', 120)) return;
    this.playNoise(0.18, open ? 2400 : 1400, 0.05, 0.04);
  }

  /** Dull buzz when something can't be afforded or done. */
  public playError(): void { this.arp('error', 150, [196, 147], 0.08, 'square', 0.07, 0.12); }

  /** Sparkling rise for buying an upgrade or research rank. */
  public playUpgrade(): void { this.arp('upgrade', 80, [523.25, 659.25, 783.99, 1046.5], 0.045, 'triangle', 0.12, 0.25); }

  /** Bright chime for learning a skill rank. */
  public playSkillLearn(): void { this.arp('skill', 80, [880, 1318.5, 1760], 0.06, 'sine', 0.12, 0.45); }

  /** Dark swell for summoning a General. */
  public playSummon(): void {
    this.arp('summon', 200, [130.81, 196.0, 261.63, 392.0], 0.09, 'sawtooth', 0.07, 0.6);
    this.playNoise(0.6, 900, 0.05, 0.3);
  }

  /** Shimmering cascade for Slime / Ent evolution. */
  public playEvolve(): void {
    this.arp('evolve', 300, [392, 523.25, 659.25, 783.99, 1046.5, 1318.5], 0.07, 'sine', 0.11, 0.7);
  }

  /** Gentle bell for heals and repairs. */
  public playHeal(): void { this.arp('heal', 250, [783.99, 1174.66], 0.08, 'sine', 0.06, 0.4); }

  /** Stone thud + chime when a building finishes. */
  public playBuildComplete(): void {
    if (!this.battleReady('built', 300)) return;
    this.playNoise(0.25, 500, 0.15, 0.005);
    this.arp('builtChime', 0, [659.25, 987.77, 1318.5], 0.08, 'triangle', 0.1, 0.5);
  }

  /** War horn at the start of a wave. */
  public playWaveHorn(): void {
    const ctx = this.battleReady('horn', 1500);
    if (!ctx) return;
    const now = ctx.currentTime;
    [110, 164.81].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * 0.94, now);
      osc.frequency.linearRampToValueAtTime(freq, now + 0.25);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.2);
      gain.gain.setValueAtTime(0.09, now + 1.0);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + 1.7);
    });
  }

  /** Triumphant phrase when a wave is cleared. */
  public playVictory(): void {
    this.arp('victory', 1500, [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5], 0.11, 'triangle', 0.13, 0.5);
  }

  /** Warbling hum when a rift portal opens. */
  public playPortalOpen(): void {
    if (!this.battleReady('portal', 800)) return;
    this.arp('portalTone', 0, [98, 92.5, 103.8, 87.3], 0.12, 'sine', 0.1, 0.5);
    this.playNoise(0.9, 600, 0.06, 0.3);
  }

  /** Short pop when an invader falls. */
  public playEnemyDeath(): void {
    const ctx = this.battleReady('enemyDeath', 60);
    if (!ctx) return;
    this.playNoise(0.12, 1800, 0.08, 0.002);
    this.ring(ctx, 220 + Math.random() * 80, 0.06, 0.18, 'triangle');
  }
}

export const soundFx = new SoundFxManager();

// Vite HMR cleanup
// @ts-ignore
if (import.meta.hot) {
  // @ts-ignore
  import.meta.hot.dispose(() => {
    soundFx.stopBackgroundMusic();
  });
}