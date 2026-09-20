import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate';

const PREFIX = 'HICI-GZIP-1:';

/** Storage-only encoding; the validated version-1 scenario envelope is unchanged. */
export function encodeSaveJson(json: string): string {
  if (json.length < 128_000) return json;
  const bytes = gzipSync(strToU8(json), { level: 6, mtime: 0 });
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return PREFIX + btoa(binary);
}

/** Legacy plain JSON saves remain readable. Corrupt payloads throw before mutation. */
export function decodeSaveJson(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const binary = atob(stored.slice(PREFIX.length));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return strFromU8(gunzipSync(bytes));
}
