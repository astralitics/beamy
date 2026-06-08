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
import { useFormatters, useT } from "../../lib/i18n";
import { ConfirmDialog } from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type ChatMessage = inferRouterOutputs<AppRouter>["chat"]["list"][number];

/**
 * Assistant — per-project chat with Claude. Server-side prompt builder
 * stuffs the latest project state into the system prompt each turn, so
 * the assistant always sees current data: project facts, rooms,
 * bills/invoices, recent activity.
 *
 * v1 mechanics: non-streaming (single mutation returns the full reply),
 * no tool use, conversation persisted in chat_messages.
 */
export default function ProjectAssistant() {
  const t = useT();
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [draft, setDraft] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);
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
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            {t("assistant.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {t("assistant.lede")}
          </p>
        </div>
        {list.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            disabled={reset.isPending}
            className="rounded-md border border-paper-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-paper-50 disabled:opacity-50"
          >
            {t("assistant.reset")}
          </button>
        )}
      </div>

      {confirmingReset && (
        <ConfirmDialog
          title={t("assistant.reset_title")}
          message={t("assistant.reset_confirm")}
          confirmLabel={t("assistant.reset")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={reset.isPending}
          error={reset.error?.message}
          onConfirm={() => {
            reset.mutate({ projectId: project.id });
            setConfirmingReset(false);
          }}
          onClose={() => setConfirmingReset(false)}
        />
      )}

      {/* Scrollable transcript */}
      <div
        ref={scrollerRef}
        className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-md border border-paper-200 bg-paper-50/40 p-4"
      >
        {messages.isLoading ? (
          <p className="text-xs text-slate-500">{t("common.loading")}</p>
        ) : list.length === 0 ? (
          <EmptyHint projectName={project.name} />
        ) : (
          list.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        {send.isPending && <ThinkingBubble />}
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
          placeholder={t("assistant.composer_placeholder")}
          className="flex-1 resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none"
          disabled={send.isPending}
        />
        <button
          type="submit"
          disabled={send.isPending || draft.trim().length === 0}
          className="rounded-md bg-blueprint-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-blueprint-800 disabled:opacity-50"
        >
          {send.isPending ? "…" : t("assistant.send")}
        </button>
      </form>

      <p className="mt-2 text-[10px] text-slate-400">
        {t("assistant.footer")}
      </p>
    </div>
  );
}

// ────────────────────── thinking bubble ──────────────────────

/**
 * Bubble shown while the assistant is mid-tool-loop. Cycles through
 * a friendly set of states so the wait doesn't feel dead — the actual
 * tool sequence isn't streamed back, so this is a UI affordance only.
 */
function ThinkingBubble() {
  const t = useT();
  const [phase, setPhase] = useState(0);
  const phases = [
    t("assistant.thinking.thinking"),
    t("assistant.thinking.looking_up"),
    t("assistant.thinking.cross_checking"),
    t("assistant.thinking.putting_together"),
  ];
  useEffect(() => {
    const id = setInterval(
      () => setPhase((p) => (p + 1) % phases.length),
      1400,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-blueprint-100 bg-blueprint-50/80 px-3 py-2 text-sm">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
          {t("assistant.role.assistant")}
        </p>
        <p className="mt-1 flex items-center gap-2 leading-relaxed text-slate-500">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-safety-700" />
          {phases[phase]}
        </p>
      </div>
    </div>
  );
}

// ────────────────────── bubble ──────────────────────

function Bubble({ msg }: { msg: ChatMessage }) {
  const t = useT();
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
            {isUser ? t("assistant.role.you") : t("assistant.role.assistant")}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
            {fmt.time(msg.createdAt)}
          </p>
        </div>
        <p className="mt-1 whitespace-pre-wrap leading-relaxed">
          {msg.content}
        </p>
      </div>
    </div>
  );
}

function EmptyHint({ projectName }: { projectName: string }) {
  const t = useT();
  const suggestions = [
    t("assistant.suggestion.summarize", { name: projectName }),
    t("assistant.suggestion.cheapest_bids"),
    t("assistant.suggestion.overdue_plan"),
    t("assistant.suggestion.quote_total"),
  ];
  return (
    <div className="mx-auto max-w-md py-6 text-center">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
        {t("assistant.empty_eyebrow")}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        {t("assistant.empty_hint")}
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
