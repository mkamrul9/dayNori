export const documentDirectory = 'file:///mock_docs/';
export const cacheDirectory = 'file:///mock_cache/';

export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
} as const;

export const getInfoAsync = async (uri: string) => ({
  exists: false,
  isDirectory: false,
  size: 0,
  uri,
});

export const makeDirectoryAsync = async () => {};
export const readAsStringAsync = async () => '';
export const writeAsStringAsync = async () => {};
export const deleteAsync = async () => {};
export const readDirectoryAsync = async () => [];
export const moveAsync = async () => {};
export const copyAsync = async () => {};
