import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, X } from 'lucide-react';
import { askAI, ApiError } from '../lib/api';

const QUICK_PROMPTS = [
  'How many jobs have I applied to today?',
  'Where am I failing, and what should my strategy be?',
  "Summarize what's in my rejected applications",
  'What should I follow up on this week?',
];

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function ask(question) {
    if (!question.trim() || loading) return;
    setInput('');
    const history = messages.filter((m) => m.role === 'user' || m.role === 'ai');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const answer = await askAI(question, history);
      setMessages((m) => [...m, { role: 'ai', text: answer }]);
    } catch (err) {
      const isConfig = err instanceof ApiError && /GROQ_API_KEY|Groq/i.test(err.message);
      setMessages((m) => [...m, {
        role: 'error',
        text: isConfig
          ? err.message
          : (err.message || 'Something went wrong asking the assistant.'),
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-40 bottom-5 right-5 w-13 h-13 rounded-full flex items-center justify-center text-white transition-transform hover:scale-105"
        style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-lg)', width: 52, height: 52 }}
        aria-label="Open AI assistant"
      >
        <Sparkles size={22} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-5"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full sm:w-[400px] h-[85vh] sm:h-[min(640px,85vh)] rounded-t-2xl sm:rounded-2xl border flex flex-col"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <Sparkles size={16} style={{ color: 'var(--brand)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Assistant</h2>
              </div>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                <X size={16} />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Ask about your pipeline — I can see every job's status and your notes.
                  </p>
                  <div className="space-y-1.5">
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        onClick={() => ask(q)}
                        className="w-full text-left text-xs rounded-lg px-3 py-2 border hover:opacity-80"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--surface-2)' }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap"
                    style={
                      m.role === 'user'
                        ? { background: 'var(--brand)', color: 'white' }
                        : m.role === 'error'
                        ? { background: 'color-mix(in oklab, var(--status-rejected) 12%, var(--surface))', color: 'var(--status-rejected)' }
                        : { background: 'var(--surface-2)', color: 'var(--text-primary)' }
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-xl px-3 py-2 text-sm flex items-center gap-2" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                    <Loader2 size={13} className="animate-spin" /> Thinking…
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); ask(input); }}
              className="flex items-center gap-2 p-3 border-t shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your job search…"
                className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white disabled:opacity-50 shrink-0"
                style={{ background: 'var(--brand)' }}
                aria-label="Send"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
