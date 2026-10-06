"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Note } from "@/lib/types";
import { AISettings, INSIGHT_META, Insight, Msg, PROVIDERS, PROVIDER_IDS, ProviderId, Usage, chatStream, freeFirst, friendlyError, isReady, listModels, resolve, reviewNote, stripThink } from "@/lib/ai";
import { Preview } from "./Preview";

const QUICK: [string, string][] = [
  ["💡 Ideas", "Suggest 4 concrete ideas, extensions or experiments for this note."],
  ["❓ Ask me", "Ask me the 3 sharpest questions that would improve my thinking on this note."],
  ["⚠️ Check", "Check this note for errors: maths, units, logic, statistics, code. Be specific."],
  ["📝 Summarise", "Summarise this note in a few bullet points."],
  ["🔗 Connect", "How does this note connect to my other notes? Name them."],
  ["➡️ Next steps", "What should I do next? Give a short prioritised list."],
];

const sigOf = (n: Note | null) => (n ? n.title + "\u0001" + n.body + "\u0001" + JSON.stringify((n.drawing ?? []).map((e) => [e.t, e.text, e.expr, Math.round(e.x), Math.round(e.y)])) : "");

export function AIPanel({ ai, setAI, notes, note, onInsert, onClose }: {
  ai: AISettings; setAI: (s: AISettings) => void; notes: Note[]; note: Note | null;
  onInsert: (text: string) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<"insights" | "chat">("insights");
  const [showCfg, setShowCfg] = useState(false);
  const [cfgProv, setCfgProv] = useState<ProviderId>(ai.chat);
  const [modelList, setModelList] = useState<string[]>([]);
  const [modelMsg, setModelMsg] = useState("");
  const [insights, setInsights] = useState<Record<string, Insight[]>>({});
  const [chats, setChats] = useState<Record<string, Msg[]>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"" | "review" | "chat">("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<Usage>({ input: 0, output: 0, cached: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const lastReview = useRef<{ sig: string; at: number }>({ sig: "", at: 0 });
  const insightsRef = useRef(insights); insightsRef.current = insights;
  const notesRef = useRef(notes); notesRef.current = notes;
  const aiRef = useRef(ai); aiRef.current = ai;
  const endRef = useRef<HTMLDivElement>(null);

  const id = note?.id ?? "_none";
  const msgs = chats[id] ?? [];
  const cards = insights[id] ?? [];
  const sig = useMemo(() => sigOf(note), [note]);
  const hasKey = isReady(ai, "chat");
  const reviewReady = isReady(ai, "review");
  const setCfg = (patch: Partial<AISettings["providers"][ProviderId]>) => setAI({ ...ai, providers: { ...ai.providers, [cfgProv]: { ...ai.providers[cfgProv], ...patch } } });
  const info = PROVIDERS[cfgProv], cfg = ai.providers[cfgProv];
  const fetchModels = async () => { setModelMsg("Fetching…"); try { const m = await listModels(ai, cfgProv); setModelList(m); setModelMsg(`${m.length} models found`); } catch (e) { setModelMsg(friendlyError(e)); } };
  useEffect(() => { setModelList([]); setModelMsg(""); }, [cfgProv]);
  const rv = resolve(ai, "review");
  const [revList, setRevList] = useState<string[]>([]);
  const [revMsg, setRevMsg] = useState("");
  const fetchReviewModels = async () => { setRevMsg("Fetching…"); try { const m = await listModels(ai, rv.id); setRevList(m); setRevMsg(`${m.length} models found`); } catch (e) { setRevMsg(friendlyError(e)); } };
  useEffect(() => { setRevList([]); setRevMsg(""); }, [rv.id]);
  const addUse = (u: Usage) => setUsage((p) => ({ input: p.input + u.input, output: p.output + u.output, cached: p.cached + u.cached }));

  const runReview = useCallback(async (noteId: string, signature: string) => {
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    lastReview.current = { sig: signature, at: Date.now() };
    setBusy("review"); setError(""); setStatus("Thinking about this note…");
    try {
      const prev = insightsRef.current[noteId] ?? [];
      const { insights: out, usage: u } = await reviewNote(aiRef.current, notesRef.current, noteId, prev, ac.signal);
      if (ac.signal.aborted) return;
      setInsights((p) => ({ ...p, [noteId]: out }));
      addUse(u); setStatus(out.length ? `Reviewed ${new Date().toLocaleTimeString()}` : "Nothing to add yet – keep writing.");
    } catch (e) {
      if (!ac.signal.aborted) { setError(friendlyError(e)); setStatus(""); }
    } finally { if (abortRef.current === ac) { setBusy(""); } }
  }, []);

  // live auto-review: when you pause typing
  useEffect(() => {
    if (!ai.autoReview || !reviewReady || !note || sig.length < 40) return;
    if (sig === lastReview.current.sig) return;
    setStatus("Waiting for you to pause…");
    const wait = Math.max(5000, 30000 - (Date.now() - lastReview.current.at));
    const t = setTimeout(() => runReview(note.id, sig), wait);
    return () => clearTimeout(t);
  }, [sig, ai.autoReview, reviewReady, note, runReview]);

  useEffect(() => { abortRef.current?.abort(); lastReview.current = { sig: "", at: 0 }; setBusy(""); setError(""); setStatus(""); }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, tab]);

  const send = async (q: string) => {
    q = q.trim(); if (!q || !hasKey || busy === "chat") return;
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    const history = chats[id] ?? [];
    setChats((p) => ({ ...p, [id]: [...history, { role: "user", content: q }, { role: "assistant", content: "" }] }));
    setDraft(""); setTab("chat"); setBusy("chat"); setError("");
    let acc = "";
    try {
      const u = await chatStream(ai, notes, note?.id ?? null, history, q, (t) => {
        acc += t; setChats((p) => ({ ...p, [id]: [...(p[id] ?? []).slice(0, -1), { role: "assistant", content: acc }] }));
      }, ac.signal);
      addUse(u);
    } catch (e) { if (!ac.signal.aborted) setError(friendlyError(e)); }
    finally { if (abortRef.current === ac) setBusy(""); }
  };

  const stop = () => { abortRef.current?.abort(); setBusy(""); };
  const dismiss = (i: number) => setInsights((p) => ({ ...p, [id]: (p[id] ?? []).filter((_, k) => k !== i) }));
  const canInsert = note?.kind === "doc";

  return (
    <div className="bg-panel bd flex h-full w-full flex-col border-l text-sm">
      <div className="bd flex items-center gap-1 border-b px-3 py-2">
        <span className="accent-text font-semibold">✨ Assistant</span>
        <span className="ml-auto" />
        <button className={`btn ${showCfg || !hasKey ? "accent-bg" : ""}`} title="AI settings" onClick={() => setShowCfg((v) => !v)}>⚙</button>
        <button className="btn" title="Hide (⌘J)" onClick={onClose}>✕</button>
      </div>

      {(showCfg || !hasKey) && (
        <div className="bd max-h-[60vh] space-y-2 overflow-y-auto border-b p-3">
          {!hasKey && <p className="muted text-xs">Pick an AI provider and paste its API key. Keys are stored only in this browser and sent straight to that provider – never to this app&apos;s server. Anyone with access to this browser could read them, so use keys with spend limits.</p>}
          <label className="flex items-center justify-between gap-2"><span>Chat uses</span>
            <select className="bd rounded border px-2 py-1" value={ai.chat} onChange={(e) => { setAI({ ...ai, chat: e.target.value as ProviderId }); setCfgProv(e.target.value as ProviderId); }}>
              {PROVIDER_IDS.map((id) => <option key={id} value={id}>{PROVIDERS[id].label}</option>)}</select></label>
          <label className="flex items-center justify-between gap-2"><span>Live insights use</span>
            <select className="bd rounded border px-2 py-1" value={ai.review} onChange={(e) => setAI({ ...ai, review: e.target.value as AISettings["review"] })}>
              <option value="same">Same as chat</option>{PROVIDER_IDS.map((id) => <option key={id} value={id}>{PROVIDERS[id].label}</option>)}</select></label>
          <div className="bd space-y-2 rounded-lg border p-2">
            <label className="flex items-center justify-between gap-2"><b>Set up</b>
              <select className="bd rounded border px-2 py-1" value={cfgProv} onChange={(e) => setCfgProv(e.target.value as ProviderId)}>
                {PROVIDER_IDS.map((id) => <option key={id} value={id}>{PROVIDERS[id].label}{ai.providers[id].apiKey || !PROVIDERS[id].needsKey ? " ✓" : ""}</option>)}</select></label>
            <p className="muted text-xs">{info.hint}{info.keyUrl && <> Get a key at <b>{info.keyUrl}</b>.</>}</p>
            {info.needsKey && <input type="password" autoComplete="off" className="bd w-full rounded border px-2 py-1" placeholder={cfg.apiKey ? "Key saved ✓ – paste to replace" : "API key"}
              onChange={(e) => { if (e.target.value.trim()) { setCfg({ apiKey: e.target.value.trim() }); e.target.value = ""; setError(""); } }} />}
            {info.kind === "openai" && <input className="bd w-full rounded border px-2 py-1" placeholder="Base URL (…/v1)" value={cfg.baseUrl} onChange={(e) => setCfg({ baseUrl: e.target.value })} />}
            <div className="flex gap-1">
              <input list="ai-models" className="bd min-w-0 flex-1 rounded border px-2 py-1" placeholder="Model name" value={cfg.model} onChange={(e) => setCfg({ model: e.target.value })} />
              <datalist id="ai-models">{freeFirst([...info.models, ...modelList]).map((m) => <option key={m} value={m} />)}</datalist>
              {info.kind === "openai" && <button className="btn" title="List the models this key can use" onClick={fetchModels}>Fetch models</button>}
            </div>
            {modelMsg && <p className="muted text-xs">{modelMsg}</p>}
            <label className="flex items-center justify-between gap-2"><span>Notes context</span>
              <select className="bd rounded border px-2 py-1" value={cfg.ctxChars} onChange={(e) => setCfg({ ctxChars: +e.target.value })}>
                <option value={0}>None (current note only)</option><option value={12000}>Small (~3k tokens)</option><option value={30000}>Medium (~8k)</option><option value={100000}>Large (~25k)</option></select></label>
            {cfgProv !== "anthropic" && <p className="muted text-xs">Free tiers have small token limits – keep this small if you see rate-limit errors.</p>}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2"><span>Insights model</span>
              <div className="flex min-w-0 flex-1 gap-1">
                <input list="ai-review-models" className="bd min-w-0 flex-1 rounded border px-2 py-1" placeholder={`Same as ${resolve({ ...ai, reviewModel: "" }, "review").cfg.model || "chat model"}`}
                  value={ai.reviewModel} onChange={(e) => setAI({ ...ai, reviewModel: e.target.value })} />
                <datalist id="ai-review-models">{freeFirst([...rv.info.models, ...revList]).map((m) => <option key={m} value={m} />)}</datalist>
                {rv.info.kind === "openai" && <button className="btn" title="List the models this key can use" onClick={fetchReviewModels}>Fetch models</button>}
              </div></div>
            {revMsg && <p className="muted text-xs">{revMsg}</p>}
          </div>
          <label className="flex items-center justify-between gap-2"><span>Auto-review when I pause typing</span>
            <input type="checkbox" checked={ai.autoReview} onChange={(e) => setAI({ ...ai, autoReview: e.target.checked })} /></label>
          <label className="flex items-center justify-between gap-2"><span>Let it read my other notes</span>
            <input type="checkbox" checked={ai.includeAll} onChange={(e) => setAI({ ...ai, includeAll: e.target.checked })} /></label>
          <p className="muted text-xs">Now: chat → {resolve(ai, "chat").info.label} · {resolve(ai, "chat").cfg.model || "no model"}; insights → {resolve(ai, "review").info.label} · {resolve(ai, "review").cfg.model || "no model"}. Used this session: {usage.input.toLocaleString()} in ({usage.cached.toLocaleString()} cached) · {usage.output.toLocaleString()} out tokens (some providers don&apos;t report usage).</p>
        </div>
      )}

      <div className="bd flex border-b">
        {(["insights", "chat"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 px-3 py-2 capitalize ${tab === t ? "active-row font-semibold" : "muted"}`}>
            {t}{t === "insights" && cards.length > 0 ? ` (${cards.length})` : ""}</button>))}
      </div>

      {error && <div className="mx-3 mt-2 rounded border border-red-500/50 p-2 text-xs text-red-400">{error}</div>}

      {tab === "insights" ? (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          <div className="flex items-center gap-2">
            <span className="muted flex-1 text-xs">{!reviewReady ? "Set up a provider in ⚙ to start." : !note ? "Open a note to get insights." : busy === "review" ? "⏳ " + status : status || (ai.autoReview ? "Live: updates after you pause." : "Auto-review is off.")}</span>
            <button className="btn" disabled={!reviewReady || !note || busy === "review"} onClick={() => note && runReview(note.id, sig)}>↻ Refresh</button>
          </div>
          {cards.length === 0 && hasKey && busy !== "review" && <p className="muted text-xs">Insights – ideas, questions, things to check, connections and answers – appear here as you write.</p>}
          {cards.map((c, i) => (
            <div key={i} className="bd rounded-lg border p-2">
              <div className="mb-1 flex items-center gap-1 text-xs"><span>{INSIGHT_META[c.type].icon}</span><b>{INSIGHT_META[c.type].label}</b>
                <button className="muted ml-auto" title="Dismiss" onClick={() => dismiss(i)}>✕</button></div>
              <Preview body={c.text} notes={notes} className="!p-0 text-[0.92em]" />
              <div className="mt-1 flex gap-1">
                <button className="btn" onClick={() => send(`Tell me more about this, and help me act on it: "${c.text}"`)}>Discuss</button>
                {canInsert && <button className="btn" onClick={() => onInsert(`> ${INSIGHT_META[c.type].icon} **${INSIGHT_META[c.type].label}:** ${c.text.replace(/\n/g, " ")}`)}>Add to note</button>}
              </div>
            </div>))}
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {msgs.length === 0 && <p className="muted text-xs">Ask anything about this note or all your notes. Try a quick action below.</p>}
            {msgs.map((m, i) => m.role === "user" ? (
              <div key={i} className="active-row ml-6 rounded-lg px-3 py-2 whitespace-pre-wrap">{m.content}</div>
            ) : (
              <div key={i}>
                {m.content ? <Preview body={stripThink(m.content)} notes={notes} className="!p-0" /> : <span className="muted">…</span>}
                {m.content && busy !== "chat" && canInsert && <button className="btn mt-1" onClick={() => onInsert(stripThink(m.content).split("\n").map((l) => "> " + l).join("\n"))}>Insert into note</button>}
              </div>))}
            <div ref={endRef} />
          </div>
          <div className="bd flex flex-wrap gap-1 border-t p-2">
            {QUICK.map(([l, q]) => <button key={l} className="btn" disabled={!hasKey || busy === "chat"} onClick={() => send(q)}>{l}</button>)}
            {msgs.length > 0 && <button className="btn" onClick={() => setChats((p) => ({ ...p, [id]: [] }))}>Clear</button>}
          </div>
          <div className="bd flex gap-1 border-t p-2">
            <textarea rows={2} className="bd min-w-0 flex-1 resize-none rounded border px-2 py-1" placeholder={hasKey ? "Ask a question… (⌘/Ctrl+Enter)" : "Set up a provider in ⚙ first"} disabled={!hasKey}
              value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(draft); } }} />
            {busy === "chat" ? <button className="btn" onClick={stop}>■</button> : <button className="btn accent-bg" disabled={!hasKey || !draft.trim()} onClick={() => send(draft)}>Send</button>}
          </div>
        </>
      )}
    </div>
  );
}
