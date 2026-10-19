export namespace Audio {
  export const RecordingOptionsPresets = {
    HIGH_QUALITY: {
      android: {},
      ios: {},
      web: {},
    },
  };

  export const requestPermissionsAsync = async () => ({
    granted: true,
    canAskAgain: true,
    status: 'granted',
    expires: 'never',
  });

  export const setAudioModeAsync = async () => {};

  export class Recording {
    private _uri = 'file:///mock_recording.m4a';
    private _status = {
      canRecord: true,
      isRecording: false,
      durationMillis: 5000,
    };

    async prepareToRecordAsync(_options?: unknown) {
      return this._status;
    }

    async startAsync() {
      this._status.isRecording = true;
      return this._status;
    }

    async pauseAsync() {
      this._status.isRecording = false;
      return this._status;
    }

    async stopAndUnloadAsync() {
      this._status.isRecording = false;
      return this._status;
    }

    async getStatusAsync() {
      return this._status;
    }

    getURI() {
      return this._uri;
    }
  }

  export class Sound {
    static async createAsync(
      source: { uri: string },
      initialStatus?: { shouldPlay?: boolean },
      onPlaybackStatusUpdate?: (status: any) => void
    ) {
      const sound = new Sound(source.uri, onPlaybackStatusUpdate);
      return {
        sound,
        status: {
          isLoaded: true,
          isPlaying: !!initialStatus?.shouldPlay,
          durationMillis: 10000,
          positionMillis: 0,
        },
      };
    }

    constructor(
      public uri: string,
      public onPlaybackStatusUpdate?: (status: any) => void
    ) {}

    async playAsync() {
      this.onPlaybackStatusUpdate?.({
        isLoaded: true,
        isPlaying: true,
        durationMillis: 10000,
        positionMillis: 0,
      });
    }

    async pauseAsync() {
      this.onPlaybackStatusUpdate?.({
        isLoaded: true,
        isPlaying: false,
        durationMillis: 10000,
        positionMillis: 0,
      });
    }

    async stopAsync() {
      this.onPlaybackStatusUpdate?.({
        isLoaded: true,
        isPlaying: false,
        durationMillis: 10000,
        positionMillis: 0,
      });
    }

    async setPositionAsync(pos: number) {
      this.onPlaybackStatusUpdate?.({
        isLoaded: true,
        isPlaying: false,
        durationMillis: 10000,
        positionMillis: pos,
      });
    }

    async unloadAsync() {
      this.onPlaybackStatusUpdate?.({
        isLoaded: false,
      });
    }
  }
}
