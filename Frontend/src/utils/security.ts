export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 10000);
}

export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') {
    return '';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const cleaned = email.toLowerCase().trim().slice(0, 255);
  return emailRegex.test(cleaned) ? cleaned : '';
}

export function sanitizePhone(phone: string): string {
  if (typeof phone !== 'string') {
    return '';
  }
  return phone.replace(/\D/g, '').slice(0, 15);
}

export function sanitizeText(text: string, maxLength: number = 1000): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

/** Pour champs description / texte libre : garde les espaces pendant la saisie (pas de trim à chaque frappe). */
export function sanitizeDescription(text: string, maxLength: number = 1000): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text
    .replace(/[<>]/g, '')
    .slice(0, maxLength);
}

/**
 * Retourne une valeur truthy si l'utilisateur est connecté (session cookie httpOnly côté serveur).
 * Le token JWT n'est plus accessible depuis JavaScript — uniquement via cookie httpOnly.
 * On stocke un flag `isLoggedIn` en localStorage pour savoir si une session existe.
 */
export function getTokenFromStorage(): string | null {
  try {
    return localStorage.getItem('isLoggedIn') === 'true' ? 'authenticated' : null;
  } catch {
    return null;
  }
}

export function clearAuthData(): void {
  try {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
  } catch {
    // ignore
  }
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function validateFileType(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.some(type => {
    if (type.endsWith('/*')) {
      return file.type.startsWith(type.slice(0, -1));
    }
    return file.type === type;
  });
}

export function validateFileSize(file: File, maxSizeMB: number): boolean {
  return file.size <= maxSizeMB * 1024 * 1024;
}

const SAFE_IMAGE_PREFIXES = ['https://', 'http://', 'data:image/png', 'data:image/jpeg', 'data:image/jpg', 'data:image/gif', 'data:image/webp'] as const;
/** Retourne l'URL si elle est sûre pour img src, sinon chaîne vide (allowlist stricte, pas de blocklist partielle) */
export function getSafeImageSrc(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return '';
  const lower = trimmed.toLowerCase();
  const isSafe = SAFE_IMAGE_PREFIXES.some(p => lower.startsWith(p))
    || (trimmed.startsWith('/') && !trimmed.includes('//'));
  return isSafe ? trimmed : '';
}
/** @deprecated Utiliser getSafeImageSrc pour l'attribut src */
export function isSafeImageUrl(url: string | undefined | null): boolean {
  return getSafeImageSrc(url).length > 0;
}

export async function safeJsonResponse<T>(response: Response, fallback: T): Promise<T> {
  try {
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Réponse non-JSON reçue:', text.slice(0, 200));
      return fallback;
    }
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      return fallback;
    }
    return JSON.parse(text) as T;
  } catch (error) {
    console.error('Erreur lors du parsing JSON:', error);
    return fallback;
  }
}

