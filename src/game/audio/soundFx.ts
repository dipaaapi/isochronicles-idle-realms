class SoundFxManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  private listeners: Set<(muted: boolean) => void> = new Set();
  
  private bgmOscillators: OscillatorNode[] = [];
  private bgmGain: GainNode | null = null;
  private isBgmPlaying: boolean = false;
  private currentBgmMode: 'LIVELY' | 'BATTLE' | 'AMBIENT' | 'RAIN' | 'SNOW' | 'HEATWAVE' = 'LIVELY';
  private bgmIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const saved = localStorage.getItem('isochronicle_audio_muted');
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
    localStorage.setItem('isochronicle_audio_muted', String(this.isMuted));

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
    }
    
    if (this.isMuted) {
      this.stopBackgroundMusic();
    } else {
      // Re-initialize BGM if it was supposed to be playing
      this.playBackgroundMusic(this.currentBgmMode);
    }

    this.listeners.forEach((cb) => cb(this.isMuted));
    return this.isMuted;
  }

  public subscribeMute(callback: (muted: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public playBackgroundMusic(mode: 'LIVELY' | 'BATTLE' | 'AMBIENT' | 'RAIN' | 'SNOW' | 'HEATWAVE' = 'LIVELY'): void {
    if (this.isMuted) {
      this.currentBgmMode = mode;
      return;
    }
    
    // If already playing the requested mode, do nothing
    if (this.isBgmPlaying && this.currentBgmMode === mode) return;
    
    // If playing something else, stop it first
    if (this.isBgmPlaying) {
      this.stopBackgroundMusic();
    }

    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    this.isBgmPlaying = true;
    this.currentBgmMode = mode;
    this.bgmGain = ctx.createGain();
    
    this.bgmGain.connect(this.masterGain!);

    let step = 0;

    if (mode === 'LIVELY') {
      // Gentle, upbeat pentatonic music box (C Major Pentatonic)
      const melody = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63]; // C4, E4, G4, C5, G4, E4
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'sine', 0.15, 0.5);
        
        // Occasional soft bass note
        if (step % 6 === 0) {
           this.playPluck(130.81, 'triangle', 0.2, 1.2); // Low C3
        }
        step++;
      }, 350);
    } else if (mode === 'BATTLE') {
      // Tense, faster minor pentatonic (A Minor)
      const melody = [220.00, 261.63, 293.66, 329.63, 293.66, 261.63]; // A3, C4, D4, E4, D4, C4
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted) return;
        const note = melody[Math.floor(Math.random() * melody.length)]; // slightly chaotic
        this.playPluck(note, 'triangle', 0.12, 0.3); 
        
        // Steady marching bass
        if (step % 2 === 0) {
           this.playPluck(110.00, 'square', 0.08, 0.4); // Low A2
        }
        step++;
      }, 220);
    } else if (mode === 'RAIN') {
      // Melancholy D minor arpeggios with soft rain patter
      const melody = [293.66, 349.23, 440.00, 523.25, 440.00, 349.23, 293.66, 261.63]; // D4, F4, A4, C5, A4, F4, D4, C4
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'sine', 0.10, 0.7);
        
        // Soft bass drone every 4 steps
        if (step % 4 === 0) {
          this.playPluck(146.83, 'triangle', 0.12, 1.5); // D3
        }
        // Rain patter: random high-pitched tiny plucks
        if (Math.random() < 0.4) {
          const patter = 1800 + Math.random() * 600;
          this.playPluck(patter, 'sine', 0.03, 0.08);
        }
        step++;
      }, 450);
    } else if (mode === 'SNOW') {
      // Ethereal Lydian bell tones — crystalline and dreamy
      const melody = [523.25, 587.33, 659.25, 739.99, 783.99, 659.25, 523.25, 493.88]; // C5, D5, E5, F#5, G5, E5, C5, B4
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'sine', 0.08, 1.0);
        
        // Gentle sustained pad note
        if (step % 8 === 0) {
          this.playPluck(261.63, 'triangle', 0.10, 2.0); // C4
        }
        // Soft wind shimmer
        if (Math.random() < 0.25) {
          this.playPluck(2200 + Math.random() * 800, 'sine', 0.02, 0.15);
        }
        step++;
      }, 600);
    } else if (mode === 'HEATWAVE') {
      // Tense Phrygian with shimmering tremolo — oppressive heat
      const melody = [329.63, 349.23, 440.00, 415.30, 392.00, 349.23, 329.63, 311.13]; // E4, F4, A4, Ab4, G4, F4, E4, Eb4
      if (this.bgmIntervalId) clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = setInterval(() => {
        if (!this.ctx || this.isMuted) return;
        const note = melody[step % melody.length];
        this.playPluck(note, 'triangle', 0.11, 0.45);
        
        // Low rumble bass
        if (step % 3 === 0) {
          this.playPluck(164.81, 'sawtooth', 0.06, 0.6); // E3
        }
        // Heat shimmer: rapid tremolo chirps
        if (Math.random() < 0.35) {
          this.playPluck(1500 + Math.random() * 500, 'sine', 0.025, 0.06);
        }
        step++;
      }, 300);
    } else {
      // Soft ambient drone (C minor 9)
      const frequencies = [130.81, 155.56, 196.00, 293.66]; // C3, Eb3, G3, D4
      frequencies.forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        // Extremely subtle detune LFO
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
      // Lower volume for drones
      this.bgmGain.gain.setValueAtTime(0.1, ctx.currentTime);
    }
  }

  private playPluck(frequency: number, type: OscillatorType, volume: number, duration: number) {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    
    // Smooth ADSR Envelope to remove harsh clicks and pops
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.02); // quick attack
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration); // smooth decay
    
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

  /**
   * High-pitched, clean sine wave ping for button presses
   */
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

  /**
   * Gentle crystalline / wooden harmonic ping when Golem finishes mining
   */
  public playHarvest(nodeType: 'crystal' | 'wood' | 'stone' = 'crystal'): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    if (nodeType === 'crystal') {
      // Crystalline harmonic chime
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(659.25, now); // E5
      osc2.frequency.setValueAtTime(1318.5, now); // E6
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    } else if (nodeType === 'wood') {
      // Warm woody thud pop
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(320, now);
      osc1.frequency.exponentialRampToValueAtTime(160, now + 0.12);
      osc2.frequency.setValueAtTime(480, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    } else {
      // Crisp stone strike
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

  /**
   * Soft 4-note ascending chime when resources are deposited into Nexus Prime
   */
  public playDeposit(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

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

  /**
   * Melodic celebratory arpeggio for rank-ups and technology unlocks
   */
  public playFanfare(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    // D major chord: D5, F#5, A5, D6
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

  /**
   * Cute chirp / jump sound when a Golem is clicked directly
   */
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

  /**
   * Crisp double-clink coin sound for trading in the store
   */
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

  /**
   * High-tech laser sweep for automated defense turrets
   */
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

  /**
   * Impact explosion burst when an invader is eliminated
   */
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

  /**
   * Ominous metallic alarm thud when Castle / Nexus is hit
   */
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

  /**
   * Deep cosmic sunder rumble when Castle is breached
   */
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

// Vite HMR cleanup to stop overlapping music during hot-reloads
// @ts-ignore
if (import.meta.hot) {
  // @ts-ignore
  import.meta.hot.dispose(() => {
    soundFx.stopBackgroundMusic();
  });
}

