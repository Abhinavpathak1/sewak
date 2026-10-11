"use client";

import { ArrowUp, Bot, LoaderCircle, RotateCcw, Square, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type AssistantReply = {
  mode: "llm" | "local";
  retrieval: "vector" | "keyword";
  objective: string;
  relatedCases: { id: number; title: string; locationText: string; stage: number; affectedCount: number; areaMatch: boolean }[];
  citations: { type: "case" | "official"; title: string; url: string; snippet: string }[];
};

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "Hi! Tell me what civic issue you’re facing and where. I’ll look for related Sewak cases and suggest next steps.",
};

const SUGGESTIONS = [
  "Why is the water supply unreliable?",
  "Are there open road problems near me?",
];

function renderMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\/cases\/\d+)/g);
  return parts.map((part, index) => {
    const caseLink = part.match(/^\/cases\/(\d+)$/);
    if (caseLink) return <Link key={index} className="link" href={part}>case #{caseLink[1]}</Link>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

function isAssistantReply(value: unknown): value is AssistantReply {
  if (!value || typeof value !== "object" ||
      !("mode" in value) || (value.mode !== "llm" && value.mode !== "local") ||
      !("retrieval" in value) || (value.retrieval !== "vector" && value.retrieval !== "keyword") ||
      !("objective" in value) || typeof value.objective !== "string" ||
      !("relatedCases" in value) || !Array.isArray(value.relatedCases) ||
      !("citations" in value) || !Array.isArray(value.citations)) return false;
  return value.relatedCases.every((item) =>
    !!item && typeof item === "object" && "id" in item && typeof item.id === "number" &&
    "title" in item && typeof item.title === "string" && "locationText" in item &&
    typeof item.locationText === "string" && "stage" in item && typeof item.stage === "number" &&
    "affectedCount" in item && typeof item.affectedCount === "number" &&
    "areaMatch" in item && typeof item.areaMatch === "boolean")
    && value.citations.every((item) =>
      !!item && typeof item === "object" && "type" in item &&
      (item.type === "official" || item.type === "case") && "title" in item &&
      typeof item.title === "string" && "url" in item && typeof item.url === "string" &&
      (item.type === "case" ? item.url.startsWith("/cases/") : item.url.startsWith("https://")) &&
      "snippet" in item && typeof item.snippet === "string");
}

export function SewakChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function sendMessage(content: string) {
    const question = content.trim();
    if (!question || loading) return;
    const history = [...messages, { role: "user" as const, content: question }].slice(-12);
    setMessages(history);
    setDraft("");
    setError("");
    setReply(null);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages([...history, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload: unknown = await response.json();
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "The assistant request failed. Please try again.";
        throw new Error(message);
      }
      if (!response.body) throw new Error("The assistant response could not be streamed.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "";
      let sawMetadata = false;
      let sawError = false;
      let assistantText = "";

      const processLine = (line: string) => {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
          return;
        }
        if (!line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (!data) return;
        const payload: unknown = JSON.parse(data);
        if (eventName === "metadata") {
          if (!isAssistantReply(payload)) throw new Error("The assistant returned invalid source metadata.");
          setReply(payload);
          sawMetadata = true;
        } else if (eventName === "token") {
          if (!payload || typeof payload !== "object" || !("token" in payload) || typeof payload.token !== "string") {
            throw new Error("The assistant returned an invalid stream chunk.");
          }
          assistantText = `${assistantText}${payload.token}`.slice(0, 4000);
          setMessages((current) => [...current.slice(0, -1), { role: "assistant", content: assistantText }]);
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
        } else if (eventName === "error") {
          const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The assistant could not complete this request.";
          setError(message);
          sawError = true;
        }
        eventName = "";
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
        if (done) break;
      }
      if (buffer) processLine(buffer);
      if (sawError) {
        setMessages((current) => current.at(-1)?.content ? current.slice(-12) : current.slice(0, -1));
      } else if (!sawMetadata || !assistantText) {
        throw new Error("The assistant stream ended before an answer was complete.");
      }
    } catch (sendError) {
      if (sendError instanceof Error && sendError.name === "AbortError") {
        setMessages((current) => current.at(-1)?.content ? current.slice(-12) : current.slice(0, -1));
      } else {
        setError(sendError instanceof Error ? sendError.message : "The assistant request failed. Please try again.");
        setMessages((current) => current.at(-1)?.content ? current.slice(-12) : current.slice(0, -1));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  function resetChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([WELCOME]);
    setReply(null);
    setDraft("");
    setError("");
  }

  return (
    <section className="card widget sewak-chat" aria-labelledby="sewak-chat-title">
      <header className="sewak-chat-header">
        <div className="sewak-chat-avatar"><Bot size={18} aria-hidden /></div>
        <div className="sewak-chat-heading">
          <h3 id="sewak-chat-title">Sewak assistant</h3>
          <span>Grounded in Ward 24 community cases</span>
        </div>
        <button type="button" className="sewak-chat-reset" onClick={resetChat} aria-label="Start a new chat" title="Start a new chat">
          <RotateCcw size={15} aria-hidden />
        </button>
      </header>

      <div className="sewak-chat-messages" ref={scrollRef} aria-live="polite" aria-label="Conversation">
        {messages.map((message, index) => (
          <div key={`${index}-${message.role}`} className={`sewak-chat-message ${message.role}`}>
            <span className="sewak-chat-message-icon" aria-hidden>
              {message.role === "assistant" ? <Bot size={14} /> : <UserRound size={14} />}
            </span>
            <div className="sewak-chat-bubble">{renderMessage(message.content)}</div>
          </div>
        ))}
        {loading && (
          <div className="sewak-chat-message assistant" role="status">
            <span className="sewak-chat-message-icon" aria-hidden><Bot size={14} /></span>
            <div className="sewak-chat-bubble sewak-chat-loading"><LoaderCircle size={15} aria-hidden /> {reply ? "Sewak agent is answering…" : "Retrieving Sewak context…"}</div>
          </div>
        )}
      </div>

      {reply && (
        <div className="sewak-chat-context">
          <div className="sewak-chat-meta">
            <span>Objective: <strong>{reply.objective}</strong></span>
            <span>{reply.mode === "llm" ? "NVIDIA AI · grounded" : "Local match · NVIDIA not configured"}</span>
            <span>{reply.retrieval === "vector" ? "pgvector RAG" : "Keyword retrieval"}</span>
          </div>
          {reply.relatedCases.length > 0 && (
            <div>
              <div className="sewak-chat-context-label">Related cases</div>
              <ul className="sewak-chat-links">
                {reply.relatedCases.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    <Link href={`/cases/${item.id}`}>{item.title}</Link>
                    <span>{item.locationText} · {item.affectedCount} affected</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reply.citations.length > 0 && (
            <div className="sewak-chat-sources">
              <div className="sewak-chat-context-label">Sources</div>
              {reply.citations.map((citation) => (
                citation.type === "case"
                  ? <Link key={citation.url} href={citation.url} title={citation.snippet}>{citation.title}</Link>
                  : <a key={citation.url} href={citation.url} target="_blank" rel="noopener noreferrer" title={citation.snippet}>{citation.title}</a>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="sewak-chat-error" role="alert">{error}</p>}
      {messages.length === 1 && (
        <div className="sewak-chat-suggestions" aria-label="Suggested questions">
          {SUGGESTIONS.map((suggestion) => (
            <button type="button" className="chip" key={suggestion} disabled={loading} onClick={() => void sendMessage(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form className="sewak-chat-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="sewak-chat-input">Ask Sewak a question</label>
        <textarea
          id="sewak-chat-input"
          rows={2}
          maxLength={1500}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about a civic issue…"
          disabled={loading}
        />
        {loading ? (
          <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop response">
            <Square size={15} aria-hidden /> <span>Stop</span>
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!draft.trim()} aria-label="Send message">
            <ArrowUp size={17} aria-hidden /> <span>Send</span>
          </button>
        )}
      </form>
      <p className="sewak-chat-note">Answers use Sewak case data and may be AI-generated. Verify advice with official sources.</p>
    </section>
  );
}
