/** Browser-safe coordination between speaker and microphone. */
export class HalfDuplexController {
  private isSpeakingState = false;
  private isListeningState = false;
  private lastSpokenAt = 0;
  private readonly ECHO_GUARD_DELAY_MS = 300;

  get isSpeaking(): boolean { return this.isSpeakingState; }
  get isListening(): boolean { return this.isListeningState; }
  onAudioPlaybackStart(): void { this.isSpeakingState = true; this.isListeningState = false; }
  onAudioPlaybackEnd(): void { this.isSpeakingState = false; this.lastSpokenAt = Date.now(); }
  onMicPress(): { shouldPauseSpeaker: boolean } {
    const shouldPauseSpeaker = this.isSpeakingState;
    this.isSpeakingState = false;
    this.isListeningState = true;
    return { shouldPauseSpeaker };
  }
  onMicRelease(): void { this.isListeningState = false; }
  canSafelyListen(): boolean {
    return !this.isSpeakingState && !this.isListeningState && Date.now() - this.lastSpokenAt >= this.ECHO_GUARD_DELAY_MS;
  }
}
