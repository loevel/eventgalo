"use client";

import { useState, type FormEvent } from "react";
import { Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { api } from "@/lib/api";

interface QA {
  question: string;
  answer: string;
}

/** Widget public : les invités posent une question, répondue par l'IA à partir des infos de l'événement. */
export function EventAsk({ slug, suggestions = [] }: { slug: string; suggestions?: string[] }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(q: string) {
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ answer: string }>(`/api/public/events/${slug}/ask`, {
        method: "POST",
        body: { question: q },
        auth: false,
      });
      setHistory((h) => [...h, { question: q, answer: res.answer }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  async function ask(e: FormEvent) {
    e.preventDefault();
    await send(question.trim());
  }

  // Une fois la conversation entamée, les amorces n'ont plus d'utilité : elles
  // servent à franchir le premier pas, pas à meubler.
  const showSuggestions = suggestions.length > 0 && history.length === 0;

  return (
    <div className="card" style={{ margin: 0 }}>
      <h3 style={{ marginTop: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
        <MessageCircleQuestion size={15} /> Une question ?
      </h3>
      {history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
          {history.map((qa, i) => (
            <div key={i}>
              <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 13 }}>{qa.question}</p>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{qa.answer}</p>
            </div>
          ))}
        </div>
      )}
      {showSuggestions && (
        <div className="ask-chips">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" disabled={busy} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={ask} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ex. : Y a-t-il un parking ?"
          maxLength={300}
          disabled={busy}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" className="btn btn-accent btn-sm" disabled={busy || !question.trim()} aria-label="Envoyer">
          {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
        </button>
      </form>
      {error && (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 12, color: "var(--err)" }}>{error}</p>
      )}
    </div>
  );
}
