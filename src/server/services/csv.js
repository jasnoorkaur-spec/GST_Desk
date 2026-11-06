export function toCsv(rows) {
  const esc = (value) => {
    const raw = String(value ?? '');
    const safe = (/^[\s]*[=+\-@]/u.test(raw) || /^[\t\r\n]/.test(raw)) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return rows.map((row) => row.map(esc).join(',')).join('\r\n');
}
