import { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, X } from 'lucide-react';
import { useJobs } from '../context/JobsContext';
import { fetchNotes } from '../lib/api';

const PALETTE = {
  light: {
    edge: 'rgba(11,11,11,0.16)',
    text: '#52514e',
    company: '#0891b2',
    note: '#a855f7',
    stage: {
      lead: '#898781', applied: '#2a78d6', interviewing: '#c98500', offer: '#0ca30c', rejected: '#d03b3b',
    },
  },
  dark: {
    edge: 'rgba(255,255,255,0.16)',
    text: '#c3c2b7',
    company: '#22d3ee',
    note: '#c084fc',
    stage: {
      lead: '#a8a6a0', applied: '#3987e5', interviewing: '#fab219', offer: '#0ca30c', rejected: '#e66767',
    },
  },
};

const STAGE_LABEL = { lead: 'Lead', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected' };

// One physics step, shared by the per-frame animation loop and the
// reduced-motion pre-settle pass below — kept outside the component so
// neither caller needs a live closure over React state.
function stepPhysics(nodes, edges) {
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    if (a.fixed) continue;
    let fx = 0, fy = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const distSq = Math.max(dx * dx + dy * dy, 25);
      const f = REPULSION / distSq;
      const dist = Math.sqrt(distSq);
      fx += (dx / dist) * f;
      fy += (dy / dist) * f;
    }
    fx -= a.x * CENTER_K;
    fy -= a.y * CENTER_K;
    a.fx = fx; a.fy = fy;
  }

  edges.forEach((e) => {
    const dx = e.target.x - e.source.x, dy = e.target.y - e.source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const diff = (dist - e.len) * SPRING_K;
    const ux = dx / dist, uy = dy / dist;
    if (!e.source.fixed) { e.source.fx += ux * diff; e.source.fy += uy * diff; }
    if (!e.target.fixed) { e.target.fx -= ux * diff; e.target.fy -= uy * diff; }
  });

  nodes.forEach((node) => {
    if (node.fixed) return;
    node.vx = (node.vx + (node.fx || 0)) * DAMPING;
    node.vy = (node.vy + (node.fy || 0)) * DAMPING;
    node.x += node.vx;
    node.y += node.vy;
  });
}

const R = { stage: 11, company: 9, job: 6, note: 6 };
const IDEAL_LEN = { jobCompany: 65, jobStage: 105, noteJob: 90 };
const REPULSION = 1600;
const SPRING_K = 0.02;
const CENTER_K = 0.0015;
const DAMPING = 0.86;

function buildGraph(jobs, notes) {
  const nodes = [];
  const edges = [];
  const companySeen = new Set();
  const stageSeen = new Set();

  jobs.forEach((j) => {
    const company = (j.company || 'Unknown').trim() || 'Unknown';
    const cid = 'company:' + company.toLowerCase();
    if (!companySeen.has(cid)) {
      companySeen.add(cid);
      nodes.push({ id: cid, type: 'company', label: company, r: R.company });
    }

    const sid = 'stage:' + (j.status || 'lead');
    if (!stageSeen.has(sid)) {
      stageSeen.add(sid);
      nodes.push({ id: sid, type: 'stage', label: STAGE_LABEL[j.status] || j.status, status: j.status, r: R.stage });
    }

    const jid = 'job:' + j.id;
    nodes.push({ id: jid, type: 'job', label: j.role || 'Role', sublabel: company, status: j.status, r: R.job, job: j });
    edges.push({ source: jid, target: cid, len: IDEAL_LEN.jobCompany });
    edges.push({ source: jid, target: sid, len: IDEAL_LEN.jobStage });
  });

  notes.forEach((n) => {
    const nid = 'note:' + n.id;
    const text = String(n.content || '');
    const label = text.trim().slice(0, 36) || 'Note';
    nodes.push({ id: nid, type: 'note', label, r: R.note, note: n });

    const lower = text.toLowerCase();
    jobs.forEach((j) => {
      const company = (j.company || '').toLowerCase().trim();
      if (company && company.length > 2 && lower.includes(company)) {
        edges.push({ source: nid, target: 'job:' + j.id, len: IDEAL_LEN.noteJob });
      }
    });
  });

  return { nodes, edges };
}

export default function GraphView({ theme, onOpen, onOpenNotes }) {
  const { jobs } = useJobs();
  const [notes, setNotes] = useState([]);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const simRef = useRef({ nodes: [], nodesById: new Map(), edges: [] });
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const pointerRef = useRef({ mode: null, node: null, startX: 0, startY: 0, moved: false });
  const focusRef = useRef(null);
  const rafRef = useRef(null);
  const [previewNote, setPreviewNote] = useState(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchNotes().then((data) => { if (!cancelled) setNotes(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => buildGraph(jobs, notes), [jobs, notes]);

  // Merge fresh data into the running simulation, keeping x/y/velocity for
  // nodes that already existed so the layout doesn't jump every poll cycle.
  useEffect(() => {
    const prevById = simRef.current.nodesById;
    const nodes = rawNodes.map((n) => {
      const prev = prevById.get(n.id);
      if (prev) return { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy, fixed: prev.fixed };
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 120;
      return { ...n, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, vx: 0, vy: 0, fixed: false };
    });
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const edges = rawEdges
      .map((e) => ({ ...e, source: nodesById.get(e.source), target: nodesById.get(e.target) }))
      .filter((e) => e.source && e.target);
    simRef.current = { nodes, nodesById, edges };

    // Someone with prefers-reduced-motion set shouldn't see the layout
    // crawl into place — settle it synchronously up front instead, before
    // the first draw, then the per-frame loop below leaves it alone.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < 250; i++) stepPhysics(nodes, edges);
    }
  }, [rawNodes, rawEdges]);

  // Physics + draw loop. Runs continuously (settles naturally once
  // velocities go near zero) — cheap at personal-tracker node counts.
  // Skips the ambient force simulation under prefers-reduced-motion (the
  // layout was already pre-settled above); dragging still works either way
  // since a dragged node is marked `fixed` and gets its position set
  // directly from the pointer, never from force integration.
  useEffect(() => {
    const palette = PALETTE[theme === 'dark' ? 'dark' : 'light'];
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    function tick() {
      const { nodes, edges } = simRef.current;
      if (!reduceMotion) stepPhysics(nodes, edges);
      draw(palette);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [theme]);

  function neighborsOf(id) {
    const { edges } = simRef.current;
    const set = new Set([id]);
    edges.forEach((e) => {
      if (e.source.id === id) set.add(e.target.id);
      if (e.target.id === id) set.add(e.source.id);
    });
    return set;
  }

  function draw(palette) {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { scale, offsetX, offsetY } = viewRef.current;
    ctx.save();
    ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
    ctx.scale(scale, scale);

    const { nodes, edges } = simRef.current;
    const focus = focusRef.current;
    const active = focus ? neighborsOf(focus) : null;

    edges.forEach((e) => {
      const dim = active && !(active.has(e.source.id) && active.has(e.target.id));
      ctx.globalAlpha = dim ? 0.06 : 0.5;
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.moveTo(e.source.x, e.source.y);
      ctx.lineTo(e.target.x, e.target.y);
      ctx.stroke();
    });

    nodes.forEach((node) => {
      const dim = active && !active.has(node.id);
      ctx.globalAlpha = dim ? 0.15 : 1;
      let color = palette.company;
      if (node.type === 'stage') color = palette.stage[node.status] || palette.company;
      else if (node.type === 'job') color = palette.stage[node.status] || palette.company;
      else if (node.type === 'note') color = palette.note;

      const r = focus === node.id ? node.r + 2 : node.r;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (node.type === 'company' || node.type === 'stage') {
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = palette.edge;
        ctx.stroke();
      }

      if (!dim && scale > 0.45) {
        ctx.globalAlpha = dim ? 0.15 : 0.95;
        ctx.fillStyle = palette.text;
        ctx.font = `${node.type === 'stage' ? '600 ' : ''}${11 / Math.min(scale, 1.4)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + r + 12 / scale);
      }
    });

    ctx.restore();
  }

  function toWorld(clientX, clientY) {
    const wrap = wrapRef.current;
    const rect = wrap.getBoundingClientRect();
    const { scale, offsetX, offsetY } = viewRef.current;
    const px = clientX - rect.left - wrap.clientWidth / 2 - offsetX;
    const py = clientY - rect.top - wrap.clientHeight / 2 - offsetY;
    return { x: px / scale, y: py / scale };
  }

  function hitTest(worldX, worldY) {
    const { nodes } = simRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const dx = node.x - worldX, dy = node.y - worldY;
      if (dx * dx + dy * dy <= (node.r + 5) * (node.r + 5)) return node;
    }
    return null;
  }

  function handlePointerDown(e) {
    const world = toWorld(e.clientX, e.clientY);
    const hit = hitTest(world.x, world.y);
    if (hit) {
      hit.fixed = true;
      pointerRef.current = { mode: 'drag', node: hit, startX: e.clientX, startY: e.clientY, moved: false };
    } else {
      pointerRef.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, moved: false, startOffsetX: viewRef.current.offsetX, startOffsetY: viewRef.current.offsetY };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    const p = pointerRef.current;
    if (!p.mode) return;
    const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;

    if (p.mode === 'drag' && p.node) {
      const world = toWorld(e.clientX, e.clientY);
      p.node.x = world.x;
      p.node.y = world.y;
      p.node.vx = 0;
      p.node.vy = 0;
    } else if (p.mode === 'pan') {
      viewRef.current.offsetX = p.startOffsetX + dx;
      viewRef.current.offsetY = p.startOffsetY + dy;
    }
  }

  function handlePointerUp() {
    const p = pointerRef.current;
    if (p.mode === 'drag' && p.node) {
      p.node.fixed = false;
      if (!p.moved) selectNode(p.node);
    } else if (p.mode === 'pan' && !p.moved) {
      focusRef.current = null;
      setPreviewNote(null);
      forceTick((t) => t + 1);
    }
    pointerRef.current = { mode: null, node: null, startX: 0, startY: 0, moved: false };
  }

  function selectNode(node) {
    focusRef.current = focusRef.current === node.id ? null : node.id;
    forceTick((t) => t + 1);
    if (node.type === 'job' && node.job) {
      onOpen?.(node.job);
    } else if (node.type === 'note' && node.note) {
      setPreviewNote(node.note);
    } else {
      setPreviewNote(null);
    }
  }

  // Attached natively (not via React's onWheel) with { passive: false } —
  // that's the only way to reliably guarantee preventDefault stops the page
  // from scrolling underneath the zoom, regardless of how a given React
  // version treats synthetic wheel listeners.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [rawNodes.length]);

  function handleWheel(e) {
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { scale, offsetX, offsetY } = viewRef.current;
    const worldX = (px - wrapRef.current.clientWidth / 2 - offsetX) / scale;
    const worldY = (py - wrapRef.current.clientHeight / 2 - offsetY) / scale;
    const newScale = Math.min(3, Math.max(0.3, scale * (1 - e.deltaY * 0.001)));
    viewRef.current.scale = newScale;
    viewRef.current.offsetX = px - wrapRef.current.clientWidth / 2 - worldX * newScale;
    viewRef.current.offsetY = py - wrapRef.current.clientHeight / 2 - worldY * newScale;
  }

  const hasData = rawNodes.length > 0;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Share2 size={18} style={{ color: 'var(--brand)' }} /> Connections
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Jobs link to their company and pipeline stage; notes link to any job they mention. Drag to rearrange,
          scroll to zoom, click a node to focus it and open the job or note.
        </p>
      </div>

      <div
        ref={wrapRef}
        className="relative rounded-xl border overflow-hidden touch-none"
        style={{ height: '65vh', minHeight: 420, background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}
      >
        {!hasData ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Add a job to see its connections here.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        )}

        <div className="absolute bottom-2.5 left-2.5 flex flex-wrap gap-2.5 text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: 'color-mix(in oklab, var(--surface) 85%, transparent)', color: 'var(--text-muted)', backdropFilter: 'blur(4px)' }}>
          <LegendDot color="var(--status-applied)" label="Job" />
          <LegendDot color={theme === 'dark' ? '#22d3ee' : '#0891b2'} label="Company" />
          <LegendDot color={theme === 'dark' ? '#c084fc' : '#a855f7'} label="Note" />
        </div>

        {previewNote && (
          <div className="absolute top-2.5 right-2.5 max-w-xs rounded-lg border p-3 text-xs" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-md)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Note</span>
              <button onClick={() => setPreviewNote(null)} className="w-7 h-7 -m-1 rounded-md flex items-center justify-center hover:opacity-70" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                <X size={13} />
              </button>
            </div>
            <p className="whitespace-pre-wrap mb-2" style={{ color: 'var(--text-secondary)' }}>{previewNote.content}</p>
            <button onClick={() => onOpenNotes?.()} className="text-xs font-medium" style={{ color: 'var(--brand)' }}>
              Open in Notes →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
