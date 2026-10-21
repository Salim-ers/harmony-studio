export const fmtDate = (d?: string | Date | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  d ? new Intl.DateTimeFormat('fr-FR', opts).format(new Date(d)) : '—';
export const fmtDateTime = (d?: string | Date | null) => fmtDate(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtEuro = (n?: number | string | null) => (n === null || n === undefined || n === '' ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n)));
export const fmtUsd = (n?: number | string | null, digits = 2) => (n === null || n === undefined ? 'estimation indisponible' : `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`);
export const fmtNumber = (n?: number | string | null) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR'));
export function relative(d?: string | Date | null) {
  if (!d) return '—';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return 'à l’instant';
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return fmtDate(d);
}
export const isUrn = (u?: string | null) => !u || u.startsWith('urn:');
