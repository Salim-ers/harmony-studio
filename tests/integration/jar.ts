/** Magasin de cookies partagé (remplace next/headers pendant les tests d'intégration). */
export const jar = new Map<string, string>();
