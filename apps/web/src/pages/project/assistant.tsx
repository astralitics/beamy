import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type ChatMessage = inferRouterOutputs<AppRouter>["chat"]["list"][number];

/**
 * Assistant — per-project chat with Claude. Server-side prompt builder
 * stuffs the latest project state into the system prompt each turn, so
 * the assistant always sees current data: project facts, rooms, open
 * specs, bills/invoices, recent activity.
 *
 * v1 mechanics: non-streaming (single mutation returns the full reply),
 * no tool use, conversation persisted in chat_messages.
 */
export default function ProjectAssistant() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [draft, setDraft] = useState("");
  const messages = trpc.chat.list.useQuery({ projectId: project.id });
  const utils = trpc.useUtils();
  const send = trpc.chat.send.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate({ projectId: project.id });
    },
  });
  const reset = trpc.chat.reset.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate({ projectId: project.id });
    },
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages change.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.data, send.isPending]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate({ projectId: project.id, content });
    setDraft("");
    // Keep focus for fast follow-ups.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter newlines.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const list = messages.data ?? [];

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-[480px] flex-col">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-blueprint-900">
            Project assistant
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Knows this project — rooms, specs, money, recent activity. Ask
            it about <em className="not-italic">"what fridge did we spec for the kitchen?"</em>{" "}
            or <em className="not-italic">"are we under contract on bills so far?"</em>.
          </p>
        </div>
        {list.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Clear the chat history for this project?")) {
                reset.mutate({ projectId: project.id });
              }
            }}
            disabled={reset.isPending}
            className="rounded-md border border-paper-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-paper-50 disabled:opacity-50"
          >
            Reset
          </button>
        )}
      </div>

      {/* Scrollable transcript */}
      <div
        ref={scrollerRef}
        className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-md border border-paper-200 bg-paper-50/40 p-4"
      >
        {messages.isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyHint projectName={project.name} />
        ) : (
          list.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        {send.isPending && (
          <Bubble
            msg={{
              id: "pending",
              role: "assistant",
              content: "…",
              createdAt: new Date(),
            } as unknown as ChatMessage}
            pending
          />
        )}
        {send.error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
            {send.error.message}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={submit}
        className="mt-3 flex items-end gap-2 rounded-md border border-paper-200 bg-white p-2"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Ask anything about this project. Enter to send · Shift+Enter for newline."
          className="flex-1 resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none"
          disabled={send.isPending}
        />
        <button
          type="submit"
          disabled={send.isPending || draft.trim().length === 0}
          className="rounded-md bg-blueprint-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-blueprint-800 disabled:opacity-50"
        >
          {send.isPending ? "…" : "Send"}
        </button>
      </form>

      <p className="mt-2 text-[10px] text-slate-400">
        v1 · sees current project state · no tool use yet · responses cached
        once per turn
      </p>
    </div>
  );
}

// ────────────────────── bubble ──────────────────────

function Bubble({ msg, pending }: { msg: ChatMessage; pending?: boolean }) {
  const fmt = useFormatters();
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${
          isUser
            ? "border-paper-200 bg-white text-blueprint-900"
            : "border-blueprint-100 bg-blueprint-50/80 text-blueprint-900"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
            {isUser ? "you" : "assistant"}
          </p>
          {!pending && (
            <p className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
              {fmt.time(msg.createdAt)}
            </p>
          )}
        </div>
        <p
          className={`mt-1 whitespace-pre-wrap leading-relaxed ${
            pending ? "text-slate-400" : ""
          }`}
        >
          {msg.content}
        </p>
      </div>
    </div>
  );
}

function EmptyHint({ projectName }: { projectName: string }) {
  const suggestions = [
    `What rooms are in the ${projectName}?`,
    "Which specs are still open?",
    "What's the most overdue bill right now?",
    "Summarize the last week of activity.",
  ];
  return (
    <div className="mx-auto max-w-md py-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
        Project assistant · v1
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Try a question, or pick one to get started:
      </p>
      <ul className="mt-3 space-y-1.5 text-left">
        {suggestions.map((s) => (
          <li
            key={s}
            className="rounded-md border border-paper-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            "{s}"
          </li>
        ))}
      </ul>
    </div>
  );
}
