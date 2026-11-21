import { Fragment } from 'react';

// Renders the small slice of markdown the assistant uses (**bold**, *italic*, `code`, "- " bullets,
// "# " headings) as real React elements. Nothing is injected as HTML, so model output can't add markup.
const INLINE = /(\*\*[^*\n]+?\*\*|`[^`\n]+?`|(?<![*\w])\*[^*\n]+?\*(?!\w)|__[^_\n]+?__)/g;

export function renderInline(text) {
  return String(text).split(INLINE).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i} className="rounded px-1 text-[0.85em]" style={{ background: 'var(--surface)' }}>{part.slice(1, -1)}</code>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function ChatText({ text }) {
  const blocks = [];
  let list = null;
  String(text).replace(/\r\n/g, '\n').split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) { list = []; blocks.push({ type: 'list', items: list }); }
      list.push(bullet[1]);
      return;
    }
    list = null;
    if (!line.trim()) return;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(heading ? { type: 'heading', text: heading[1] } : { type: 'p', text: line });
  });

  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.type === 'list') {
          return <ul key={i} className="list-disc pl-5 space-y-1">{b.items.map((t, j) => <li key={j}>{renderInline(t)}</li>)}</ul>;
        }
        if (b.type === 'heading') return <p key={i} className="font-semibold">{renderInline(b.text)}</p>;
        return <p key={i}>{renderInline(b.text)}</p>;
      })}
    </div>
  );
}
