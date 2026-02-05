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

export function validateToken(token: string | null): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) {
      return false;
    }
    const expirationTime = payload.exp * 1000;
    return Date.now() < expirationTime;
  } catch {
    return false;
  }
}

export function getTokenFromStorage(): string | null {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return null;
    }
    if (!validateToken(token)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return null;
    }
    return token;
  } catch {
    return null;
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

