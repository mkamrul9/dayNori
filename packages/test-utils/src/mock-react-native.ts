type ExpoShim = {
  EventEmitter: new () => {
    addListener: () => { remove: () => void };
    removeListener: () => void;
    emit: () => void;
  };
  modules: Record<string, unknown>;
  ExpoModulesCore: Record<string, unknown>;
};
const globalWithExpo = globalThis as typeof globalThis & { expo?: ExpoShim };
if (typeof globalThis !== 'undefined' && !globalWithExpo.expo) {
  globalWithExpo.expo = {
    EventEmitter: class MockEventEmitter {
      addListener() {
        return { remove: () => {} };
      }
      removeListener() {}
      emit() {}
    },
    modules: {},
    ExpoModulesCore: {},
  };
}

export const StyleSheet = {
  create: <T>(styles: T): T => styles,
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
};

export const Text = 'Text';
export const View = 'View';
export const Image = 'Image';
export const SafeAreaView = 'SafeAreaView';
export const Pressable = 'Pressable';
export const TouchableOpacity = 'Pressable';
export const Modal = 'Modal';
export const ScrollView = 'ScrollView';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';
export const ActivityIndicator = 'ActivityIndicator';
export const TextInput = 'TextInput';
export const StatusBar = 'StatusBar';

export const Platform = {
  OS: 'android',
  select: (objs: Record<string, unknown>) => objs['android'] ?? objs['default'],
};

// BackHandler mock with event dispatching for testing hardware back press
const backPressListeners: Array<() => boolean> = [];
export const BackHandler = {
  addEventListener: (_eventName: string, handler: () => boolean) => {
    backPressListeners.push(handler);
    return {
      remove: () => {
        const idx = backPressListeners.indexOf(handler);
        if (idx !== -1) backPressListeners.splice(idx, 1);
      },
    };
  },
  removeEventListener: (_eventName: string, handler: () => boolean) => {
    const idx = backPressListeners.indexOf(handler);
    if (idx !== -1) backPressListeners.splice(idx, 1);
  },
  exitApp: () => {},
  // Test helper to simulate hardware back button press
  _mockPressBack: (): boolean => {
    for (let i = backPressListeners.length - 1; i >= 0; i--) {
      const listener = backPressListeners[i];
      if (listener && listener()) {
        return true; // handled
      }
    }
    return false; // unhandled (system exit)
  },
  _clearListeners: () => {
    backPressListeners.length = 0;
  },
};

// AppState mock with lifecycle event dispatching
type AppStateListener = (state: string) => void;
const appStateListeners: Array<AppStateListener> = [];
export const AppState = {
  currentState: 'active',
  addEventListener: (_eventName: string, handler: AppStateListener) => {
    appStateListeners.push(handler);
    return {
      remove: () => {
        const idx = appStateListeners.indexOf(handler);
        if (idx !== -1) appStateListeners.splice(idx, 1);
      },
    };
  },
  _mockSetAppState: (newState: string) => {
    AppState.currentState = newState;
    appStateListeners.forEach((l) => l(newState));
  },
  _clearListeners: () => {
    AppState.currentState = 'active';
    appStateListeners.length = 0;
  },
};

// Dimensions mock
let mockDimensions = { width: 360, height: 800, scale: 2, fontScale: 1 };
const dimensionListeners: Array<() => void> = [];
export const Dimensions = {
  get: (_dim: string) => mockDimensions,
  set: (dims: Partial<typeof mockDimensions>) => {
    mockDimensions = { ...mockDimensions, ...dims };
    dimensionListeners.forEach((l) => l());
  },
  addEventListener: (_eventName: string, handler: () => void) => {
    dimensionListeners.push(handler);
    return {
      remove: () => {
        const idx = dimensionListeners.indexOf(handler);
        if (idx !== -1) dimensionListeners.splice(idx, 1);
      },
    };
  },
};

// Linking mock for cold/warm deep-linking
type LinkingListener = (event: { url: string }) => void;
const linkingListeners: Array<LinkingListener> = [];
let initialUrl: string | null = null;
export const Linking = {
  getInitialURL: () => Promise.resolve(initialUrl),
  setInitialURL: (url: string | null) => {
    initialUrl = url;
  },
  addEventListener: (_eventName: string, handler: LinkingListener) => {
    linkingListeners.push(handler);
    return {
      remove: () => {
        const idx = linkingListeners.indexOf(handler);
        if (idx !== -1) linkingListeners.splice(idx, 1);
      },
    };
  },
  canOpenURL: (_url: string) => Promise.resolve(true),
  openURL: (_url: string) => Promise.resolve(),
  _mockEmitUrl: (url: string) => {
    linkingListeners.forEach((l) => l({ url }));
  },
  _clearListeners: () => {
    linkingListeners.length = 0;
    initialUrl = null;
  },
};

// AccessibilityInfo mock with dynamic reduction support
let reduceMotionEnabled = false;
type ReduceMotionListener = (enabled: boolean) => void;
const reduceMotionListeners: Array<ReduceMotionListener> = [];
export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(reduceMotionEnabled),
  setReduceMotion: (enabled: boolean) => {
    reduceMotionEnabled = enabled;
    reduceMotionListeners.forEach((l) => l(enabled));
  },
  addEventListener: (eventName: string, handler: ReduceMotionListener) => {
    if (eventName === 'reduceMotionChanged') {
      reduceMotionListeners.push(handler);
    }
    return {
      remove: () => {
        const idx = reduceMotionListeners.indexOf(handler);
        if (idx !== -1) reduceMotionListeners.splice(idx, 1);
      },
    };
  },
};
