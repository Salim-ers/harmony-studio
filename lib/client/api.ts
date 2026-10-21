'use client';
/** Appels à l'API privée depuis l'interface. Les erreurs serveur sont remontées telles quelles (déjà génériques). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = options;
  const init: RequestInit = { cache: 'no-store', credentials: 'same-origin', ...rest };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers = { 'Content-Type': 'application/json', ...(rest.headers ?? {}) };
    init.method = init.method ?? 'POST';
  }
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError('Connexion impossible : vérifiez votre réseau.', 0);
  }
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('application/json') ? await response.json() : null;
  if (response.status === 401 && (data as { code?: string } | null)?.code === 'NON_AUTHENTIFIE') {
    if (typeof window !== 'undefined' && window.location.pathname !== '/') window.location.href = `/?suite=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError('Session expirée : reconnectez-vous.', 401);
  }
  if (!response.ok) throw new ApiError((data as { error?: string } | null)?.error ?? `Erreur ${response.status}`, response.status, (data as { code?: string } | null)?.code);
  return data as T;
}

/** Téléchargement d'un fichier généré côté serveur (ZIP, CSV, JSON). */
export async function download(path: string, fallbackName: string) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    let message = `Erreur ${response.status}`;
    try { message = ((await response.json()) as { error?: string }).error ?? message; } catch { /* ignore */ }
    throw new ApiError(message, response.status);
  }
  const blob = await response.blob();
  const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
