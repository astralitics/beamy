import {
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { MAX_DOCUMENT_BYTES } from "@beamy/shared";
import { ConfirmDialog } from "../../components/ui";
import { trpc } from "../../lib/trpc";
import { useFormatters, useT } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type DocumentRow =
  inferRouterOutputs<AppRouter>["documents"]["list"][number];

/**
 * Documents — project-scoped file library. Contracts, warranties,
 * manufacturer spec sheets, photos. Upload writes via signed PUT
 * directly to Supabase Storage (no file bytes through tRPC).
 */
export default function ProjectDocuments() {
  const t = useT();
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [search, setSearch] = useState("");
  const list = trpc.documents.list.useQuery({
    projectId: project.id,
    search: search.trim() || undefined,
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            {t("documents.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {t("documents.lede")}
          </p>
        </div>
        <UploadButton projectId={project.id} />
      </div>

      <div className="mt-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("documents.search")}
          className="block w-full max-w-md rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
        />
      </div>

      <div className="mt-4">
        {list.isLoading ? (
          <p className="text-xs text-slate-500">{t("common.loading")}</p>
        ) : list.error ? (
          <p className="text-xs text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            {search.trim()
              ? t("documents.empty_filtered")
              : t("documents.empty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {list.data.map((d) => (
              <DocumentRowItem key={d.id} doc={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────── upload ──────────────────────

type UploadState =
  | { phase: "idle" }
  | { phase: "creating"; filename: string }
  | { phase: "uploading"; filename: string }
  | { phase: "error"; message: string };

function UploadButton({ projectId }: { projectId: string }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const utils = trpc.useUtils();
  const create = trpc.documents.create.useMutation();

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      setState({
        phase: "error",
        message: t("documents.error.too_large", {
          max: prettyBytes(MAX_DOCUMENT_BYTES),
        }),
      });
      return;
    }

    setState({ phase: "creating", filename: file.name });
    try {
      const result = await create.mutateAsync({
        projectId,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });

      setState({ phase: "uploading", filename: file.name });
      const putRes = await fetch(result.upload.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        throw new Error(
          t("documents.error.storage_failed", {
            status: putRes.status,
            statusText: putRes.statusText,
          }),
        );
      }

      utils.documents.list.invalidate({ projectId });
      setState({ phase: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ phase: "error", message });
    }
  }

  const busy = state.phase === "creating" || state.phase === "uploading";

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-50"
      >
        {busy
          ? state.phase === "creating"
            ? t("documents.preparing")
            : t("documents.uploading")
          : t("documents.upload")}
      </button>
      {state.phase === "uploading" && (
        <span className="font-mono text-[10px] text-slate-400">
          {state.filename}
        </span>
      )}
      {state.phase === "error" && (
        <span className="max-w-xs text-right text-[11px] text-rose-700">
          {state.message}
        </span>
      )}
    </div>
  );
}

// ────────────────────── row ──────────────────────

function DocumentRowItem({ doc }: { doc: DocumentRow }) {
  const t = useT();
  const fmt = useFormatters();
  const utils = trpc.useUtils();
  const remove = trpc.documents.remove.useMutation({
    onSuccess: () =>
      utils.documents.list.invalidate({ projectId: doc.projectId }),
  });
  const downloadMutation = useDownloadDocument();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-md border border-paper-200 bg-white p-3">
      <FileGlyph mimeType={doc.mimeType} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <button
            type="button"
            onClick={() => downloadMutation.run(doc.id)}
            className="block min-w-0 max-w-full truncate text-left font-medium text-blueprint-900 hover:text-safety-800"
            title={doc.name}
          >
            {doc.name}
          </button>
          {doc.room && (
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              · {doc.room.name}
            </span>
          )}
          {doc.asset && (
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              · {t("documents.tag.asset")} {doc.asset.name}
            </span>
          )}
          {doc.material && (
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              · {t("documents.tag.material")} {doc.material.name}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-wider text-slate-400">
          <span>{prettyBytes(doc.sizeBytes)}</span>
          <span>{doc.mimeType}</span>
          <span>{t("documents.uploaded_at", { date: fmt.date(doc.createdAt) })}</span>
        </div>
        {doc.description && (
          <p className="mt-1 text-xs text-slate-600">{doc.description}</p>
        )}
        {downloadMutation.error && (
          <p className="mt-1 text-[11px] text-rose-700">
            {downloadMutation.error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => downloadMutation.run(doc.id)}
          disabled={downloadMutation.isPending}
          className="text-xs text-slate-600 hover:text-blueprint-900 disabled:opacity-50"
        >
          {downloadMutation.isPending ? "…" : t("documents.download")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={remove.isPending}
          className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
        >
          {remove.isPending ? "…" : t("documents.delete")}
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t("documents.delete_title")}
          message={t("documents.delete_confirm", { name: doc.name })}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={remove.isPending}
          error={remove.error?.message}
          onConfirm={() => remove.mutate({ id: doc.id })}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

/**
 * Download helper — fetches a fresh signed URL via tRPC then opens it
 * in a new tab. Wrapped in a hook so the call surface is small.
 */
function useDownloadDocument() {
  const utils = trpc.useUtils();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(id: string) {
    setPending(true);
    setError(null);
    try {
      const { signedUrl } = await utils.documents.getDownloadUrl.fetch({ id });
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }
  return { run, isPending, error };
}

// ────────────────────── small bits ──────────────────────

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Pure-CSS file glyph. Mime-type → big-bucket label (PDF / IMG / DOC /
 * etc). Avoids pulling in an icon library and reads as a tiny drawing
 * stamp in the corner of each row.
 */
function FileGlyph({ mimeType }: { mimeType: string }): ReactNode {
  const label = mimeTypeLabel(mimeType);
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-paper-200 bg-paper-50 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
    </div>
  );
}

function mimeTypeLabel(mime: string): string {
  if (mime.startsWith("image/")) return "img";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "vid";
  if (mime.startsWith("audio/")) return "aud";
  if (mime.startsWith("text/")) return "txt";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "xls";
  if (mime.includes("word") || mime.includes("document")) return "doc";
  if (mime.includes("zip") || mime.includes("compressed")) return "zip";
  return "file";
}
