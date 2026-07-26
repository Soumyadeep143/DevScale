export function isEmailStr(s) {
  return /@/.test(s || '') && !/\s/.test(s || '');
}

export function contactHref(contact) {
  if (!contact) return '';
  if (isEmailStr(contact)) return `mailto:${contact}`;
  return /^https?:\/\//.test(contact) ? contact : `https://${contact}`;
}
