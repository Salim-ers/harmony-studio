/** Export / import CSV des prospects (séparateur « ; », UTF-8 avec BOM pour Excel). */

export const EXPORT_COLUMNS: [string, string][] = [
  ['name', 'Nom'], ['activity', 'Activité'], ['city', 'Localisation'], ['location_verified', 'Localisation vérifiée'],
  ['strategy', 'Stratégie'], ['need_type', 'Besoin'], ['need_status', 'Statut du besoin'], ['confidence', 'Confiance'],
  ['score', 'Score indicatif'], ['status', 'Statut commercial'], ['platform', 'Plateforme'], ['source_url', 'URL source'],
  ['published_at', 'Publication'], ['created_at', 'Découverte'], ['website', 'Site web'], ['budget_text', 'Budget mentionné'],
  ['deadline', 'Échéance'], ['estimated_value', 'Valeur estimée (€)'], ['next_action', 'Prochaine action'], ['tags', 'Tags'],
  ['do_not_contact', 'Opposition'], ['evidence', 'Extrait de preuve'], ['notes', 'Notes'],
];

/** Neutralise l'injection de formules (=, +, -, @, tab, CR) à l'ouverture dans un tableur. */
export function csvCell(value: unknown) {
  let s = value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join(', ') : String(value ?? '');
  s = s.replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function toCsv(rows: Record<string, unknown>[]) {
  const header = EXPORT_COLUMNS.map(([, label]) => csvCell(label)).join(';');
  const lines = rows.map((r) => EXPORT_COLUMNS.map(([key]) => csvCell(typeof r[key] === 'boolean' ? (r[key] ? 'oui' : 'non') : r[key])).join(';'));
  return '﻿' + [header, ...lines].join('\r\n');
}

/** Parseur CSV tolérant (guillemets, « ; » ou « , »). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  name: ['nom', 'name', 'entreprise', 'enseigne', 'société', 'societe'],
  source_url: ['url', 'url source', 'source_url', 'lien', 'source'],
  city: ['ville', 'localisation', 'city', 'commune'],
  activity: ['activité', 'activite', 'secteur', 'métier', 'metier'],
  need_type: ['besoin', 'need', 'type de besoin'],
  status: ['statut', 'statut commercial', 'status'],
  website: ['site', 'site web', 'website'],
  notes: ['notes', 'note', 'commentaire'],
  tags: ['tags', 'étiquettes'],
  estimated_value: ['valeur', 'valeur estimée (€)', 'valeur estimée', 'montant'],
};

export type ImportedRow = Partial<Record<keyof typeof ALIASES, string>>;

export function mapImport(rows: string[][]): { items: ImportedRow[]; unknownColumns: string[] } {
  if (!rows.length) return { items: [], unknownColumns: [] };
  const header = rows[0].map((h) => h.replace(/^'/, '').trim().toLowerCase());
  const map: (keyof typeof ALIASES | null)[] = header.map((h) => (Object.entries(ALIASES).find(([, list]) => list.includes(h))?.[0] as keyof typeof ALIASES) ?? null);
  const unknownColumns = header.filter((_, i) => !map[i]);
  const items = rows.slice(1).map((r) => {
    const item: ImportedRow = {};
    r.forEach((value, i) => {
      const key = map[i];
      if (key) item[key] = value.replace(/^'(?=[=+\-@])/, '').trim();
    });
    return item;
  }).filter((x) => x.name);
  return { items, unknownColumns };
}
