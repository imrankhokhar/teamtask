/** Human-readable local date/time for UI display. */
export function formatDateTime(value?: string | number | Date | null): string {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Formats YYYY-MM-DDTHH:mm (or ISO) for reminder fields. */
export function formatReminderLabel(local: string): string {
  if (!local) return '';
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5])
    );
    return formatDateTime(d);
  }
  return formatDateTime(local) || local;
}
