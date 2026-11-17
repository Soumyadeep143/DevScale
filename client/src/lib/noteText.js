// A note is one free-text field. Its title is the first non-empty line, the preview the rest.
export function splitNote(content) {
  const lines = String(content || '').split('\n');
  const i = lines.findIndex((l) => l.trim());
  const title = i === -1 ? 'Untitled note' : lines[i].replace(/^#+\s*/, '').trim();
  const preview = i === -1 ? '' : lines.slice(i + 1).join(' ').trim();
  return { title, preview };
}

// Notes carry a visibility ('personal' | 'peer') once the notes-sharing migration is applied; rows
// without it (an older database) are personal.
export const noteVisibility = (n) => n?.visibility || 'personal';
