let clipboardContent = '';

export async function setStringAsync(text: string): Promise<boolean> {
  clipboardContent = text;
  return true;
}

export function setString(text: string): void {
  clipboardContent = text;
}

export async function getStringAsync(): Promise<string> {
  return clipboardContent;
}

export async function hasStringAsync(): Promise<boolean> {
  return clipboardContent.length > 0;
}
