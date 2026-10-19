import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import type {
  NativeAudioRecorderAdapter,
  NativeAudioPlayerAdapter,
  AudioRecordingResult,
  NativeAudioPlayerStatus,
} from '@daynori/domain';

export class ExpoAudioRecorderAdapter implements NativeAudioRecorderAdapter {
  private recording: Audio.Recording | null = null;
  private _isRecording = false;
  private _isPaused = false;
  private lastRecordedUri: string | null = null;

  async requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    const res = await Audio.requestPermissionsAsync();
    return {
      granted: res.granted,
      canAskAgain: res.canAskAgain,
    };
  }

  async startRecordingAsync(): Promise<void> {
    // 1. Release any prior stale recording
    await this.discardRecordingAsync();

    // 2. Set native audio mode for recording
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });

    // 3. Prepare and start recording
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();

    this.recording = rec;
    this._isRecording = true;
    this._isPaused = false;
  }

  async pauseRecordingAsync(): Promise<void> {
    if (this.recording && this._isRecording && !this._isPaused) {
      await this.recording.pauseAsync();
      this._isPaused = true;
    }
  }

  async resumeRecordingAsync(): Promise<void> {
    if (this.recording && this._isRecording && this._isPaused) {
      await this.recording.startAsync();
      this._isPaused = false;
    }
  }

  async stopRecordingAsync(): Promise<AudioRecordingResult> {
    if (!this.recording) {
      throw new Error('No active recording to stop.');
    }

    const rec = this.recording;
    this.recording = null;
    this._isRecording = false;
    this._isPaused = false;

    const status = await rec.getStatusAsync();
    await rec.stopAndUnloadAsync();

    const uri = rec.getURI();
    if (!uri) {
      throw new Error('Recording stopped but no file URI was produced.');
    }

    this.lastRecordedUri = uri;

    // Inspect actual file bytes from native filesystem
    const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
    const actualBytes = (fileInfo.exists && typeof fileInfo.size === 'number')
      ? fileInfo.size
      : Math.max(1, Math.round((status.durationMillis || 1000) * 8.192));

    const durationSeconds = Math.max(1, Math.round((status.durationMillis || 1000) / 1000));
    const fileName = `mobile-audio-${new Date().toISOString().slice(0, 10)}-${Date.now()}.m4a`;

    // Reset audio mode back to playback defaults
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    }).catch(() => {});

    return {
      uri,
      durationSeconds,
      byteSize: actualBytes,
      mimeType: 'audio/mp4',
      fileName,
    };
  }

  async discardRecordingAsync(): Promise<void> {
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {}
      this.recording = null;
    }
    this._isRecording = false;
    this._isPaused = false;

    if (this.lastRecordedUri) {
      await FileSystem.deleteAsync(this.lastRecordedUri, { idempotent: true }).catch(() => {});
      this.lastRecordedUri = null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    }).catch(() => {});
  }

  isRecording(): boolean {
    return this._isRecording && !this._isPaused;
  }

  isPaused(): boolean {
    return this._isRecording && this._isPaused;
  }
}

export class ExpoAudioPlayerAdapter implements NativeAudioPlayerAdapter {
  private sound: Audio.Sound | null = null;
  private statusCallback?: (status: NativeAudioPlayerStatus) => void;

  async loadAsync(uri: string, onStatusUpdate?: (status: NativeAudioPlayerStatus) => void): Promise<void> {
    await this.unloadAsync();
    this.statusCallback = onStatusUpdate;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false },
      (playbackStatus) => {
        if (!playbackStatus.isLoaded) {
          this.statusCallback?.({
            isLoaded: false,
            isPlaying: false,
            error: playbackStatus.error,
          });
        } else {
          this.statusCallback?.({
            isLoaded: true,
            isPlaying: playbackStatus.isPlaying,
            durationMillis: playbackStatus.durationMillis,
            positionMillis: playbackStatus.positionMillis,
            didJustFinish: playbackStatus.didJustFinish,
          });
        }
      }
    );

    this.sound = sound;
  }

  async playAsync(): Promise<void> {
    if (this.sound) {
      await this.sound.playAsync();
    }
  }

  async pauseAsync(): Promise<void> {
    if (this.sound) {
      await this.sound.pauseAsync();
    }
  }

  async stopAsync(): Promise<void> {
    if (this.sound) {
      await this.sound.stopAsync();
    }
  }

  async setPositionAsync(positionMillis: number): Promise<void> {
    if (this.sound) {
      await this.sound.setPositionAsync(positionMillis);
    }
  }

  async unloadAsync(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch {}
      this.sound = null;
    }
    this.statusCallback = undefined;
  }
}
