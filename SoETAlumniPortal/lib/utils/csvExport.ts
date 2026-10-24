/**
 * Utility for exporting administrative data to secure, standards-compliant CSV files.
 * Protects against CSV formula injection (OWASP guidelines),
 * handles Unicode characters with UTF-8 BOM, and properly quotes cells.
 */

export function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  let str = String(value);

  // Prevent CSV Formula Injection:
  // If cell starts with formula characters (=, +, -, @, tab, carriage return),
  // prefix with a single quote (') so spreadsheet engines treat it as literal text.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape double quotes by doubling them, and wrap if special characters are present
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function buildCsvContent(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const headerRow = headers.map((h) => sanitizeCsvCell(h)).join(',');
  const dataRows = rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(','));
  return [headerRow, ...dataRows].join('\r\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const csvString = buildCsvContent(headers, rows);
  // Add UTF-8 BOM (\uFEFF) so Excel correctly recognizes UTF-8 encoded characters
  const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

export async function downloadAdminCsvEndpoint(
  endpointUrl: string,
  defaultFilename: string
): Promise<void> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('token') || localStorage.getItem('access_token')
      : null;

  const res = await fetch(endpointUrl, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    let errMsg = 'Failed to download CSV export.';
    try {
      const errJson = await res.json();
      errMsg = errJson.detail || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  // Try to extract filename from Content-Disposition header
  let filename = defaultFilename;
  const disposition = res.headers.get('content-disposition');
  if (disposition) {
    const match = disposition.match(/filename=["']?([^"']+)["']?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = await res.blob();
  downloadBlob(blob, filename);
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
