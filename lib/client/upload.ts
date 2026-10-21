'use client';
import { api } from './api';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'];

/**
 * Envoi PRIVÉ d'un média en blocs de 1 Mo vers Harmony Studio (jamais vers un stockage public).
 * Le serveur vérifie la signature binaire réelle, crée les dérivés et conserve l'original.
 */
export async function uploadMedia(file: File, onProgress?: (ratio: number) => void) {
  const mime = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  if (!ACCEPTED.includes(mime)) throw new Error(`${file.name} : format non accepté (JPEG, PNG, WebP, AVIF ou PDF). Pour une photo HEIC d’iPhone, exportez-la en JPEG.`);
  const init = await api<{ id: string; parts: number; chunkBytes: number }>('/api/media/uploads', { json: { name: file.name, size: file.size, mime } });
  for (let i = 0; i < init.parts; i++) {
    const chunk = file.slice(i * init.chunkBytes, (i + 1) * init.chunkBytes);
    await api(`/api/media/uploads/${init.id}/${i}`, { method: 'PUT', body: chunk, headers: { 'Content-Type': 'application/octet-stream' } });
    onProgress?.((i + 1) / (init.parts + 1));
  }
  const done = await api<{ id: string; mime: string; width: number | null; height: number | null }>(`/api/media/uploads/${init.id}/complete`, { method: 'POST' });
  onProgress?.(1);
  return done;
}
