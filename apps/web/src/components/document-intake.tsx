import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  MAX_DOCUMENT_BYTES,
  type BillExtraction,
  type QuoteExtraction,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import {
  AmountInput,
  Button,
  Field,
  Input,
  Modal,
  MoneyInput,
  Select,
  Textarea,
} from "./ui";

/**
 * DocumentIntake — AI document intake (factura / cotización).
 *
 * Self-contained wizard: pick a PDF/photo → upload it the normal way
 * (`documents.create` + signed PUT) → `extraction.extract*` returns a
 * draft → the user reviews/edits an editable form → save to
 * `bills.create` / `bids.createWithLines`. Nothing is stored until the
 * user confirms. The uploaded file is linked back to the saved record
 * for "ver original".
 *
 * Mount it conditionally from a page (`{importing && <DocumentIntake
 * kind="bill" … />}`); it renders its own Modal and calls `onClose`
 * when done or cancelled.
 */
type Kind = "bill" | "quote";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";
const SUPPORTED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

type Stage =
  | { step: "pick" }
  | { step: "working"; label: string }
  | { step: "error"; message: string }
  | {
      step: "confirm";
      documentId: string;
      fileName: string;
      draft: BillExtraction | QuoteExtraction;
    };

export function DocumentIntake({
  kind,
  projectId,
  defaultCurrency = "MXN",
  onClose,
}: {
  kind: Kind;
  projectId: string;
  defaultCurrency?: string;
  onClose: () => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ step: "pick" });

  const createDoc = trpc.documents.create.useMutation();
  const extractBill = trpc.extraction.extractBill.useMutation();
  const extractQuote = trpc.extraction.extractQuote.useMutation();

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    if (file.size > MAX_DOCUMENT_BYTES) {
      setStage({
        step: "error",
        message: t("documents.error.too_large", {
          max: `${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB`,
        }),
      });
      return;
    }
    const mimeType = file.type || "application/octet-stream";
    if (!SUPPORTED.has(mimeType)) {
      setStage({ step: "error", message: t("intake.error.unsupported") });
      return;
    }

    try {
      // 1. Create the document row + mint a signed upload URL.
      setStage({ step: "working", label: t("intake.uploading") });
      const res = await createDoc.mutateAsync({
        projectId,
        name: file.name,
        mimeType,
        sizeBytes: file.size,
      });

      // 2. PUT the bytes straight to Storage (never through tRPC).
      const put = await fetch(res.upload.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": mimeType },
      });
      if (!put.ok) {
        throw new Error(
          t("documents.error.storage_failed", {
            status: put.status,
            statusText: put.statusText,
          }),
        );
      }

      // 3. Ask the model to read the document back out of Storage.
      setStage({ step: "working", label: t("intake.extracting") });
      const out =
        kind === "bill"
          ? await extractBill.mutateAsync({
              projectId,
              documentId: res.document.id,
            })
          : await extractQuote.mutateAsync({
              projectId,
              documentId: res.document.id,
            });

      setStage({
        step: "confirm",
        documentId: out.documentId,
        fileName: file.name,
        draft: out.draft,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStage({ step: "error", message });
    }
  }

  if (stage.step === "confirm") {
    const shared = {
      projectId,
      documentId: stage.documentId,
      sourceName: stage.fileName,
      defaultCurrency,
      onClose,
    };
    return kind === "bill" ? (
      <BillConfirm draft={stage.draft as BillExtraction} {...shared} />
    ) : (
      <QuoteConfirm draft={stage.draft as QuoteExtraction} {...shared} />
    );
  }

  const working = stage.step === "working";
  return (
    <Modal
      title={t(kind === "bill" ? "intake.bill.title" : "intake.quote.title")}
      subtitle={t("intake.pick.lede")}
      onClose={onClose}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFile}
      />
      {working ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <Spinner />
          <p className="text-[15px] text-ink-700">{stage.label}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-ink-200 bg-paper-50 px-6 py-10 text-center">
          <Button variant="primary" onClick={() => fileRef.current?.click()}>
            {t("intake.pick.choose")}
          </Button>
          <p className="text-xs text-ink-400">{t("intake.pick.hint")}</p>
          {stage.step === "error" && (
            <p className="text-sm text-rose-600">{stage.message}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────── bill confirm ───────────────────────────

function BillConfirm({
  draft,
  projectId,
  documentId,
  sourceName,
  defaultCurrency,
  onClose,
}: ConfirmProps<BillExtraction>) {
  const t = useT();
  const vendorsQ = trpc.vendors.list.useQuery({ status: "active" });
  const utils = trpc.useUtils();

  const [vendorId, setVendorId] = useState("");
  const [vendorTouched, setVendorTouched] = useState(false);
  const [billNumber, setBillNumber] = useState(draft.billNumber ?? "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [amount, setAmount] = useState(cleanMoney(draft.amount));
  const [currency, setCurrency] = useState(
    cleanCurrency(draft.currency) || defaultCurrency,
  );
  const [issuedAt, setIssuedAt] = useState(draft.issuedAt ?? "");
  const [dueAt, setDueAt] = useState(draft.dueAt ?? "");
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  // Preselect the vendor whose name best matches the detected one.
  useEffect(() => {
    if (vendorTouched) return;
    const m = matchByName(draft.vendorName, vendorsQ.data ?? []);
    if (m) setVendorId(m);
  }, [vendorsQ.data, draft.vendorName, vendorTouched]);

  const create = trpc.bills.create.useMutation({
    onSuccess: () => {
      utils.bills.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount.trim() || currency.trim().length !== 3) {
      setError(t("intake.error.amount_currency"));
      return;
    }
    create.mutate({
      projectId,
      vendorId: vendorId || undefined,
      billNumber: billNumber.trim() || undefined,
      description: description.trim() || undefined,
      amount: amount.trim(),
      currency: currency.trim().toUpperCase(),
      issuedAt: issuedAt || undefined,
      dueAt: dueAt || undefined,
      notes: notes.trim() || undefined,
      sourceDocumentId: documentId,
    });
  }

  return (
    <Modal
      title={t("intake.bill.title")}
      subtitle={t("intake.confirm.source", { name: sourceName })}
      onClose={onClose}
      size="lg"
      footer={
        <ConfirmFooter
          error={error}
          saving={create.isPending}
          formId="intake-bill-form"
          saveLabel={t("intake.confirm.save_bill")}
          onClose={onClose}
        />
      }
    >
      <form
        id="intake-bill-form"
        onSubmit={onSubmit}
        className="grid gap-5 sm:grid-cols-2"
      >
        <Field label={t("col.description")} wide>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
        </Field>
        <Field
          label={t("col.vendor")}
          hint={!vendorId && draft.vendorName
              ? t("intake.detected", { name: draft.vendorName })
              : undefined}
        >
          <Select
            value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value);
              setVendorTouched(true);
            }}
          >
            <option value="">{t("intake.no_vendor")}</option>
            {vendorsQ.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("intake.field.number")}>
          <Input
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
          />
        </Field>
        <Field label={t("col.amount")} required wide>
          <MoneyInput
            amount={amount}
            currency={currency}
            onAmountChange={setAmount}
            onCurrencyChange={setCurrency}
            required
            format
          />
        </Field>
        <Field label={t("intake.field.issued")}>
          <Input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </Field>
        <Field label={t("col.due")}>
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label={t("intake.field.notes")} wide>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </Field>
      </form>
    </Modal>
  );
}

// ────────────────────────── quote confirm ───────────────────────────

interface LineDraft {
  description: string;
  ref: string;
  qty: string;
  unit: string;
  unitPriceAmount: string;
  totalAmount: string;
  /** Detected room name from extraction, resolved to roomId once rooms load. */
  roomName: string;
  roomId: string;
}

function QuoteConfirm({
  draft,
  projectId,
  documentId,
  sourceName,
  defaultCurrency,
  onClose,
}: ConfirmProps<QuoteExtraction>) {
  const t = useT();
  const vendorsQ = trpc.vendors.list.useQuery({ status: "active" });
  const utils = trpc.useUtils();

  const [vendorId, setVendorId] = useState("");
  const [vendorTouched, setVendorTouched] = useState(false);
  const [trade, setTrade] = useState(draft.trade ?? "");
  const [bidNumber, setBidNumber] = useState(draft.bidNumber ?? "");
  const [bidDate, setBidDate] = useState(draft.bidDate ?? "");
  const [validUntil, setValidUntil] = useState(draft.validUntil ?? "");
  const [subtotal, setSubtotal] = useState(cleanMoney(draft.subtotalAmount));
  const [iva, setIva] = useState(cleanMoney(draft.ivaAmount));
  const [total, setTotal] = useState(cleanMoney(draft.totalAmount));
  const [deposit, setDeposit] = useState(cleanMoney(draft.depositAmount));
  const [currency, setCurrency] = useState(
    cleanCurrency(draft.currency) || defaultCurrency,
  );
  const [ivaIncluded, setIvaIncluded] = useState(draft.ivaIncluded ?? false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(
    (draft.lines ?? []).map((l) => {
      const qty = cleanMoney(l.qty);
      let unitPriceAmount = cleanMoney(l.unitPriceAmount);
      let totalAmount = cleanMoney(l.totalAmount);
      // Fallback: fill a missing unit price / line total from the other
      // and the quantity (the model derives this too; this guarantees it).
      const q = Number(qty);
      if (q > 0) {
        if (!unitPriceAmount && totalAmount) {
          unitPriceAmount = (Number(totalAmount) / q).toFixed(2);
        } else if (!totalAmount && unitPriceAmount) {
          totalAmount = (Number(unitPriceAmount) * q).toFixed(2);
        }
      }
      return {
        description: l.description ?? "",
        ref: l.ref ?? "",
        qty,
        unit: l.unit ?? "",
        unitPriceAmount,
        totalAmount,
        roomName: l.room ?? "",
        roomId: "",
      };
    }),
  );
  const [error, setError] = useState<string | null>(null);

  // Preselect the vendor whose name best matches the detected one.
  useEffect(() => {
    if (vendorTouched) return;
    const m = matchByName(draft.vendorName, vendorsQ.data ?? []);
    if (m) setVendorId(m);
  }, [vendorsQ.data, draft.vendorName, vendorTouched]);

  // Match each line's detected room name to one of the project's rooms,
  // once they load. Only fills lines the user hasn't set.
  const roomsQ = trpc.projects.listRooms.useQuery({ projectId });
  const roomsMatched = useRef(false);
  useEffect(() => {
    if (roomsMatched.current || !roomsQ.data || roomsQ.data.length === 0)
      return;
    roomsMatched.current = true;
    setLines((prev) =>
      prev.map((l) =>
        l.roomId || !l.roomName
          ? l
          : { ...l, roomId: matchByName(l.roomName, roomsQ.data!) },
      ),
    );
  }, [roomsQ.data]);

  const create = trpc.bids.createWithLines.useMutation({
    onSuccess: () => {
      utils.bids.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }
  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        description: "",
        ref: "",
        qty: "",
        unit: "",
        unitPriceAmount: "",
        totalAmount: "",
        roomName: "",
        roomId: "",
      },
    ]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Toggling "prices include IVA" re-derives subtotal / IVA / total from
  // the line-item prices (the base) at the standard 16% rate, so the grand
  // total reflects whether IVA is already baked into the listed prices.
  function applyIvaIncluded(checked: boolean) {
    setIvaIncluded(checked);
    const lineSum = lines.reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
    const base = lineSum > 0 ? lineSum : Number(subtotal) || Number(total) || 0;
    if (base <= 0) return;
    if (checked) {
      // Prices already include IVA → total is the base; back out the IVA.
      const sub = base / (1 + IVA_RATE);
      setSubtotal(sub.toFixed(2));
      setIva((base - sub).toFixed(2));
      setTotal(base.toFixed(2));
    } else {
      // Prices are pre-IVA → add IVA on top of the base.
      const ivaAmt = base * IVA_RATE;
      setSubtotal(base.toFixed(2));
      setIva(ivaAmt.toFixed(2));
      setTotal((base + ivaAmt).toFixed(2));
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const anyMoney = !!(
      subtotal.trim() ||
      iva.trim() ||
      total.trim() ||
      deposit.trim()
    );
    const cur = currency.trim().toUpperCase();
    if (anyMoney && cur.length !== 3) {
      setError(t("intake.error.currency"));
      return;
    }

    // Keep rows that carry any data; every kept row needs a description.
    const meaningful = lines.filter(
      (l) =>
        l.description.trim() ||
        l.qty.trim() ||
        l.unitPriceAmount.trim() ||
        l.totalAmount.trim(),
    );
    if (meaningful.some((l) => !l.description.trim())) {
      setError(t("intake.error.line_needs_desc"));
      return;
    }
    const lineHasMoney = meaningful.some(
      (l) => l.unitPriceAmount.trim() || l.totalAmount.trim(),
    );
    if (lineHasMoney && cur.length !== 3) {
      setError(t("intake.error.currency"));
      return;
    }

    create.mutate({
      projectId,
      vendorId: vendorId || undefined,
      trade: trade.trim() || undefined,
      bidNumber: bidNumber.trim() || undefined,
      bidDate: bidDate || undefined,
      validUntil: validUntil || undefined,
      subtotalAmount: subtotal.trim() || undefined,
      ivaAmount: iva.trim() || undefined,
      totalAmount: total.trim() || undefined,
      depositAmount: deposit.trim() || undefined,
      currency: anyMoney || lineHasMoney ? cur : undefined,
      ivaIncluded,
      notes: notes.trim() || undefined,
      sourceDocumentId: documentId,
      lines: meaningful.map((l) => ({
        description: l.description.trim(),
        ref: l.ref.trim() || undefined,
        qty: l.qty.trim() || undefined,
        unit: l.unit.trim() || undefined,
        unitPriceAmount: l.unitPriceAmount.trim() || undefined,
        totalAmount: l.totalAmount.trim() || undefined,
        roomId: l.roomId || undefined,
      })),
    });
  }

  return (
    <Modal
      title={t("intake.quote.title")}
      subtitle={t("intake.confirm.source", { name: sourceName })}
      onClose={onClose}
      size="xl"
      footer={
        <ConfirmFooter
          error={error}
          saving={create.isPending}
          formId="intake-quote-form"
          saveLabel={t("intake.confirm.save_quote")}
          onClose={onClose}
        />
      }
    >
      <form id="intake-quote-form" onSubmit={onSubmit}>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label={t("col.vendor")}
            hint={!vendorId && draft.vendorName
              ? t("intake.detected", { name: draft.vendorName })
              : undefined}
          >
            <Select
              value={vendorId}
              onChange={(e) => {
                setVendorId(e.target.value);
                setVendorTouched(true);
              }}
            >
              <option value="">{t("intake.no_vendor")}</option>
              {vendorsQ.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("intake.field.trade")}>
            <Input value={trade} onChange={(e) => setTrade(e.target.value)} />
          </Field>
          <Field label={t("intake.field.number")}>
            <Input
              value={bidNumber}
              onChange={(e) => setBidNumber(e.target.value)}
            />
          </Field>
          <Field label={t("intake.field.date")}>
            <Input
              type="date"
              value={bidDate}
              onChange={(e) => setBidDate(e.target.value)}
            />
          </Field>
          <Field label={t("intake.field.valid_until")}>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="section-label">{t("intake.lines.title")}</p>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              {t("intake.lines.add")}
            </Button>
          </div>
          {lines.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink-200 bg-paper-50 px-4 py-6 text-center text-sm text-ink-500">
              {t("intake.lines.empty")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-ink-200/70">
              <table className="w-full text-[13px]">
                <thead className="border-b border-ink-100 bg-paper-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">
                      {t("intake.line.description")}
                    </th>
                    <th className="w-16 px-2 py-2 font-medium">
                      {t("intake.line.qty")}
                    </th>
                    <th className="w-20 px-2 py-2 font-medium">
                      {t("intake.line.unit")}
                    </th>
                    <th className="w-28 px-2 py-2 text-right font-medium">
                      {t("intake.line.unit_price")}
                    </th>
                    <th className="w-28 px-2 py-2 text-right font-medium">
                      {t("intake.line.total")}
                    </th>
                    <th className="w-40 px-2 py-2 font-medium">
                      {t("intake.field.room")}
                    </th>
                    <th className="w-8 px-1 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b border-ink-50 last:border-0">
                      <td className="px-2 py-1.5">
                        <input
                          value={l.description}
                          onChange={(e) =>
                            setLine(i, { description: e.target.value })
                          }
                          className={cellCls}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={l.qty}
                          onChange={(e) => setLine(i, { qty: e.target.value })}
                          className={`${cellCls} text-right`}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={l.unit}
                          onChange={(e) => setLine(i, { unit: e.target.value })}
                          className={cellCls}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <AmountInput
                          value={l.unitPriceAmount}
                          onChange={(v) => setLine(i, { unitPriceAmount: v })}
                          className={`${cellCls} text-right`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <AmountInput
                          value={l.totalAmount}
                          onChange={(v) => setLine(i, { totalAmount: v })}
                          className={`${cellCls} text-right`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={l.roomId}
                          onChange={(e) =>
                            setLine(i, { roomId: e.target.value })
                          }
                          className={cellCls}
                        >
                          <option value="">—</option>
                          {roomsQ.data?.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          aria-label={t("intake.lines.remove")}
                          className="text-ink-400 hover:text-rose-600"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="section-label mb-2">{t("intake.totals.title")}</p>
          <div className="rounded-lg border border-ink-200/70 bg-paper-50 px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("intake.field.subtotal")}>
                <AmountInput value={subtotal} onChange={setSubtotal} />
              </Field>
              <Field label={t("intake.field.iva")}>
                <AmountInput value={iva} onChange={setIva} />
              </Field>
              <Field label={t("intake.field.deposit")}>
                <AmountInput value={deposit} onChange={setDeposit} />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={ivaIncluded}
                onChange={(e) => applyIvaIncluded(e.target.checked)}
                className="h-4 w-4"
              />
              {t("intake.field.iva_included")}
            </label>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-ink-200 pt-4">
              <span className="font-display text-lg text-ink-900">
                {t("intake.field.total")}
              </span>
              <div className="w-60">
                <MoneyInput
                  amount={total}
                  currency={currency}
                  onAmountChange={setTotal}
                  onCurrencyChange={setCurrency}
                  placeholder="0.00"
                  format
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <Field label={t("intake.field.notes")}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────────── shared bits ──────────────────────────

interface ConfirmProps<TDraft> {
  draft: TDraft;
  projectId: string;
  documentId: string;
  sourceName: string;
  defaultCurrency: string;
  onClose: () => void;
}

function ConfirmFooter({
  error,
  saving,
  formId,
  saveLabel,
  onClose,
}: {
  error: string | null;
  saving: boolean;
  formId: string;
  saveLabel: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-rose-600">{error}</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form={formId} variant="primary" disabled={saving}>
          {saving ? t("common.saving") : saveLabel}
        </Button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink-200 border-t-ink-900" />
  );
}

/** Mexican IVA rate, used to re-derive totals when "prices include IVA". */
const IVA_RATE = 0.16;

const cellCls =
  "block w-full rounded border border-ink-200 bg-white px-2 h-8 text-[13px] text-ink-900 focus:border-ink-900 focus:outline-none focus:ring-1 focus:ring-ink-900/10";

/**
 * Normalize a company name for fuzzy matching: lowercase, strip accents,
 * drop legal suffixes (S.A. de C.V. / S. de R.L.) and punctuation.
 */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\bs\.?\s*a\.?\s*(?:de\s*c\.?\s*v\.?)?\b/g, " ")
    .replace(/\bs\.?\s*de\s*r\.?\s*l\.?(?:\s*de\s*c\.?\s*v\.?)?\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-matching vendor id for an extracted vendor name, or "" when none
 * is a confident match (≥ 0.5). Tries exact → containment → token overlap.
 */
function matchByName(
  name: string | undefined,
  vendors: { id: string; name: string }[],
): string {
  const target = normalizeName(name ?? "");
  if (!target) return "";
  let bestId = "";
  let bestScore = 0;
  for (const v of vendors) {
    const cand = normalizeName(v.name);
    if (!cand) continue;
    let score = 0;
    if (cand === target) score = 1;
    else if (cand.includes(target) || target.includes(cand)) score = 0.85;
    else {
      const a = new Set(target.split(" "));
      const b = new Set(cand.split(" "));
      const inter = [...a].filter((x) => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      score = union ? inter / union : 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = v.id;
    }
  }
  return bestScore >= 0.5 ? bestId : "";
}

/** Strip currency symbols / thousands separators from a drafted amount. */
function cleanMoney(v: string | undefined): string {
  if (!v) return "";
  return v.replace(/[^0-9.\-]/g, "");
}

/** Uppercase a drafted currency; keep it only if it's a 3-letter code. */
function cleanCurrency(v: string | undefined): string {
  if (!v) return "";
  const up = v.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(up) ? up : "";
}
