// Accept "k7m2qx", "PEER-K7M2QX" or " peer-k7m2qx " — the server still validates it.
export function normalizePeerCode(input) {
  const v = String(input || '').trim().toUpperCase();
  if (!v) return '';
  return v.startsWith('PEER-') ? v : `PEER-${v}`;
}
