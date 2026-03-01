/**
 * Analytics Umami - Événements pour Le Clos de la Reine
 * Umami est RGPD-friendly (pas de cookies, pas de données personnelles)
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, string | number | boolean>) => void;
    };
  }
}

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  try {
    if (typeof window !== 'undefined' && typeof window.umami?.track === 'function') {
      const data = params
        ? Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
          )
        : undefined;
      window.umami.track(eventName, data);
    }
  } catch {
    /* Umami non disponible */
  }
}
