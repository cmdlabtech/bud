const enc = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(prefix: string, bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return prefix + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomId(): string {
  return crypto.randomUUID();
}

export function randomDigits(n: number): string {
  const b = new Uint32Array(n);
  crypto.getRandomValues(b);
  return [...b].map(x => String(x % 10)).join('');
}

// Constant-time compare of two equal-length hex digests.
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
