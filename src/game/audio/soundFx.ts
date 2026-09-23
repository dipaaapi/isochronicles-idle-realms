class SoundFxManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  private listeners: Set<(muted: boolean) => void> = new Set();
  
  private bgmOscillators: OscillatorNode[] = [];
  private bgmGain: GainNode | null = null;
  private isBgmPlaying: boolean = false;
  private currentBgmMode: 'LIVELY' | 'BATTLE' | 'AMBIENT' | 'RAIN' | 'SNOW' | 'HEATWAVE' | 'TITLE' = 'TITLE';
  private bgmIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('isochronicle_audio_muted') : null;
    if (saved !== null) {
      this.isMuted = saved === 'true';
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return null;

      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('isochronicle_audio_muted', String(this.isMuted));
    }

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
    }
    
    if (this.isMuted) {
      this.stopBackgroundMusic();
    } else {
      this.playBackgroundMusic(this.currentBgmMode);
    }

    this.listeners.forEach((cb) => cb(this.isMuted));
    return this.isMuted;
  }

  public subscribeMute(callback: (muted: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public playBackgroundMusic(mode: 'LIVELY' | 'BATTLE' | 'AMBIENT' | 'RAIN' | 'SNOW' | 'HEATWAVE' | 'TITLE' = 'LIVELY'): void {
    if (this.isMuted) {
      this.currentBgmMode = mode;
      return;
    }
    
    if (this.isBgmPlaying && this.currentBgmMode === mode) return;
    
    if (this.isBgmPlaying) {
      this.stopBackgroundMusic();
    }

    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    this.isBgmPlaying = true;
    this.currentBgmMode = mode;
    this.bgmGain = ctx.createGain();
    this.bgmGain.connect(this.masterGain);

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
        if (!this.ctx || this.isMuted) return;
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
        if (!this.ctx || this.isMuted) return;
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
        if (!this.ctx || this.isMuted) return;
        const note = melody[Math.floor(Math.random() * melody.length)];
        this.playPluck(note, 'triangle', 0.12, 0.3); 
        
        if (step % 2 === 0) {
           this.playPluck(110.00, 'square', 0.08, 0.4);
        }
        step++;
      }, 220);
    } else if (mode === 'RAIN') {
      const melody = [293.66, 349.23, 440.00, 523.25, 440.00, 349.23, 293.66, 261.63];
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted) return;
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
        if (!this.ctx || this.isMuted) return;
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
        if (!this.ctx || this.isMuted) return;
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
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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

  public playCastleHit(): void {
    if (this.isMuted) return;
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
    if (this.isMuted) return;
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