export function generateRandomString(length: number) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function maskingText(text?: string) {
  if (!text) {
    return text;
  }
  if (text.length <= 4) {
    return text;
  }
  const maskedText = text.slice(0, 2) + '*'.repeat(text.length - 4) + text.slice(text.length - 2);
  return maskedText;
}

export function normalizeDirectusUrl(url: string): string {
  try {
    let cleanUrl = url.trim();
    if (!cleanUrl) return '';
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `http://${cleanUrl}`;
    }
    const urlParsed = new URL(cleanUrl);
    if (!urlParsed.origin || urlParsed.origin === 'null') {
      throw new Error('Invalid URL');
    }
    let full = urlParsed.href.replace(/\/+$/, '');
    full = full.replace(/\/admin(\/.*)?$/, '');
    return full;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

export function slugify(text?: string | null): string {
  if (text === null || text === undefined) {
    return 'flow';
  }
  const clean = String(text).trim();
  if (!clean) return 'flow';
  return (
    clean
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w.-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '') || 'flow'
  );
}
