/**
 * proposal-html — server-side HTML renderer for client proposals.
 *
 * Produces a single self-contained .html document (inline styles +
 * one small inline script) that the firm shares with the client. The
 * artifact is the source of truth — to revise, regenerate.
 *
 * The lines ship with three grouping dimensions (work type / vendor /
 * room) baked onto each row, plus a toggle the client can flip without
 * us regenerating. Per-group subtotals recompute on the fly. A
 * `<noscript>`-free flat table renders server-side first so the
 * document is legible even before the script runs (and when printing).
 *
 * Print-friendly @media rules let the client hit Cmd-P and get a
 * presentable PDF without a headless browser server-side.
 */

export interface ProposalRenderLine {
  ref: string | null;
  description: string;
  qty: string | null;
  unit: string | null;
  /** Pre-formatted unit price (already includes currency). */
  unitPrice: string | null;
  /** Pre-formatted line total (already includes currency). */
  total: string | null;
  /** Numeric line total, for client-side per-group subtotals. */
  totalNum: number | null;
  rooms: string[];
  vendorName: string | null;
  trade: string | null;
}

export interface ProposalRenderAdjustment {
  /** Left-hand label, e.g. "Markup (10%)" or "Discount (5%)". */
  label: string;
  /** Pre-formatted amount (already includes currency + sign hint). */
  amountFormatted: string;
}

export interface ProposalRenderInput {
  /** Public number like "PROP-2026-0001". */
  number: string;
  projectName: string;
  projectAddress: string | null;
  clientName: string | null;
  title: string;
  introText: string | null;
  expiresAt: string | null;
  currency: string;
  /** Date string YYYY-MM-DD. */
  issuedOn: string;
  lines: ProposalRenderLine[];
  /** Initial grouping dimension baked into the artifact. */
  groupBy: "work_type" | "vendor" | "room" | "none";
  /** Pre-formatted subtotal (sum of line totals, before adjustments). */
  subtotalFormatted: string;
  /** Optional proposal-level markup row. */
  markup?: ProposalRenderAdjustment;
  /** Optional discount row (amount already prefixed with "−"). */
  discount?: ProposalRenderAdjustment;
  /** Pre-formatted bottom-line total string (already includes currency). */
  totalFormatted: string;
  /** Org display name for the header. */
  orgName: string;
}

/**
 * Render the proposal to an HTML string. No DB or storage calls here —
 * kept pure so it's easy to test and to re-render from a snapshot.
 */
export function renderProposalHtml(input: ProposalRenderInput): string {
  // Server-rendered flat table — legible before the script runs.
  const flatRows = input.lines.map(renderLineRow).join("");

  // The dataset the toggle script regroups. Escape "<" so a stray
  // "</script>" in user content can't break out of the script tag.
  const lineData = input.lines.map((l) => ({
    ref: l.ref,
    description: l.description,
    qty: l.qty,
    unit: l.unit,
    unitPrice: l.unitPrice,
    total: l.total,
    totalNum: l.totalNum,
    rooms: l.rooms,
    gWork: l.trade ? cap(l.trade) : "Other",
    gVendor: l.vendorName ?? "Unassigned",
    gRoom: l.rooms.length > 0 ? l.rooms.join(" + ") : "—",
  }));
  const dataJson = JSON.stringify(lineData).replace(/</g, "\\u003c");

  const adjustments = [
    `<div class="trow"><span class="t-label">Subtotal</span><span class="t-value">${escape(input.subtotalFormatted)}</span></div>`,
    input.markup
      ? `<div class="trow"><span class="t-label">${escape(input.markup.label)}</span><span class="t-value">${escape(input.markup.amountFormatted)}</span></div>`
      : "",
    input.discount
      ? `<div class="trow"><span class="t-label">${escape(input.discount.label)}</span><span class="t-value">${escape(input.discount.amountFormatted)}</span></div>`
      : "",
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(input.title)} · ${escape(input.number)}</title>
  <meta name="generator" content="Beamy">
  <style>${STYLES}</style>
</head>
<body>
  <article class="proposal">
    <header class="title-block">
      <div class="stamp">
        <span class="number">${escape(input.number)}</span>
        <span class="sep">|</span>
        <span class="issued">issued ${escape(input.issuedOn)}</span>
      </div>
      <h1 class="title">${escape(input.title)}</h1>
      <dl class="facts">
        <div class="fact"><dt>Project</dt><dd>${escape(input.projectName)}</dd></div>
        ${input.projectAddress ? `<div class="fact"><dt>Address</dt><dd>${escape(input.projectAddress)}</dd></div>` : ""}
        ${input.clientName ? `<div class="fact"><dt>Client</dt><dd>${escape(input.clientName)}</dd></div>` : ""}
        ${input.expiresAt ? `<div class="fact"><dt>Expires</dt><dd>${escape(input.expiresAt)}</dd></div>` : ""}
        <div class="fact"><dt>Currency</dt><dd>${escape(input.currency)}</dd></div>
      </dl>
    </header>

    ${input.introText ? `<section class="intro"><p>${escape(input.introText).replace(/\n/g, "<br>")}</p></section>` : ""}

    <div class="group-toggle" role="group" aria-label="Group line items by">
      <span class="gt-label">Group by</span>
      <button type="button" data-dim="work_type">Work type</button>
      <button type="button" data-dim="vendor">Vendor</button>
      <button type="button" data-dim="room">Room</button>
      <button type="button" data-dim="none">None</button>
    </div>

    <div id="lines">
      <section class="section">
        <table class="lines">
          <thead>
            <tr>
              <th class="ref">Ref</th>
              <th class="desc">Description</th>
              <th class="qty">Qty</th>
              <th class="price">Unit</th>
              <th class="total">Total</th>
            </tr>
          </thead>
          <tbody>${flatRows}</tbody>
        </table>
      </section>
    </div>

    <footer class="bottom-line">
      <div class="totals">
        ${adjustments}
        <div class="trow grand"><span class="t-label">Total</span><span class="t-value">${escape(input.totalFormatted)}</span></div>
      </div>
    </footer>

    <p class="sig">Prepared by ${escape(input.orgName)} — generated by Beamy.</p>
  </article>
  <script>
  (function () {
    var LINES = ${dataJson};
    var CURRENCY = ${JSON.stringify(input.currency)};
    var INITIAL = ${JSON.stringify(input.groupBy)};
    var KEYS = { work_type: "gWork", vendor: "gVendor", room: "gRoom" };
    var fmt = null;
    try {
      fmt = new Intl.NumberFormat("en-US", {
        style: "currency", currency: CURRENCY,
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });
    } catch (e) { fmt = null; }
    function money(n) {
      if (n == null) return "";
      return fmt ? fmt.format(n) : n.toFixed(2) + " " + CURRENCY;
    }
    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function rowHtml(l) {
      var rooms = l.rooms && l.rooms.length
        ? '<div class="rooms">' + l.rooms.map(function (r) { return '<span class="room">' + esc(r) + "</span>"; }).join("") + "</div>"
        : "";
      return "<tr>" +
        '<td class="ref">' + (l.ref ? esc(l.ref) : "") + "</td>" +
        '<td class="desc"><div class="desc-text">' + esc(l.description) + "</div>" + rooms + "</td>" +
        '<td class="qty">' + (l.qty ? esc(l.qty) + (l.unit ? " " + esc(l.unit) : "") : "") + "</td>" +
        '<td class="price">' + (l.unitPrice ? esc(l.unitPrice) : "") + "</td>" +
        '<td class="total">' + (l.total ? esc(l.total) : "") + "</td>" +
        "</tr>";
    }
    function sectionHtml(label, lines) {
      var sub = 0, has = false;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].totalNum != null) { sub += lines[i].totalNum; has = true; }
      }
      var head = label ? '<h2 class="section-label">' + esc(label) + "</h2>" : "";
      var foot = has
        ? '<tr class="subtotal"><td class="ref"></td><td class="desc">Subtotal</td><td class="qty"></td><td class="price"></td><td class="total">' + money(sub) + "</td></tr>"
        : "";
      return '<section class="section">' + head +
        '<table class="lines"><thead><tr>' +
        '<th class="ref">Ref</th><th class="desc">Description</th><th class="qty">Qty</th><th class="price">Unit</th><th class="total">Total</th>' +
        "</tr></thead><tbody>" + lines.map(rowHtml).join("") + foot + "</tbody></table></section>";
    }
    function render(dim) {
      var container = document.getElementById("lines");
      if (!container) return;
      var html;
      if (dim === "none" || !KEYS[dim]) {
        html = sectionHtml(null, LINES);
      } else {
        var key = KEYS[dim], order = [], groups = {};
        for (var i = 0; i < LINES.length; i++) {
          var g = LINES[i][key] || "—";
          if (!groups[g]) { groups[g] = []; order.push(g); }
          groups[g].push(LINES[i]);
        }
        html = order.map(function (g) { return sectionHtml(g, groups[g]); }).join("");
      }
      container.innerHTML = html;
      var btns = document.querySelectorAll(".group-toggle button");
      for (var j = 0; j < btns.length; j++) {
        btns[j].classList.toggle("active", btns[j].getAttribute("data-dim") === dim);
      }
    }
    var bar = document.querySelector(".group-toggle");
    if (bar) {
      bar.addEventListener("click", function (e) {
        var d = e.target && e.target.getAttribute && e.target.getAttribute("data-dim");
        if (d) render(d);
      });
    }
    render(INITIAL);
  })();
  </script>
</body>
</html>`;
}

function renderLineRow(line: ProposalRenderLine): string {
  return `
    <tr>
      <td class="ref">${line.ref ? escape(line.ref) : ""}</td>
      <td class="desc">
        <div class="desc-text">${escape(line.description)}</div>
        ${
          line.rooms.length > 0
            ? `<div class="rooms">${line.rooms.map((r) => `<span class="room">${escape(r)}</span>`).join("")}</div>`
            : ""
        }
      </td>
      <td class="qty">${line.qty ? escape(line.qty) + (line.unit ? ` ${escape(line.unit)}` : "") : ""}</td>
      <td class="price">${line.unitPrice ? escape(line.unitPrice) : ""}</td>
      <td class="total">${line.total ? escape(line.total) : ""}</td>
    </tr>
  `;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STYLES = `
  :root {
    --ink: #1f2a3a;
    --rule: #d8dde6;
    --paper: #ffffff;
    --paper-2: #f7f8fa;
    --muted: #6b7588;
    --accent: #d97706;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--paper-2); color: var(--ink); font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.45; }
  .proposal { max-width: 880px; margin: 32px auto; background: var(--paper); border: 1px solid var(--rule); }

  .title-block { padding: 24px 32px; border-bottom: 1px solid var(--rule); }
  .stamp { font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted); }
  .stamp .number { color: var(--ink); font-weight: 600; }
  .stamp .sep { margin: 0 8px; color: var(--rule); }
  .title { margin: 12px 0 16px; font-size: 28px; font-weight: 600; letter-spacing: -0.01em; }

  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1px; background: var(--rule); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); margin: 16px -32px 0; padding: 0; }
  .facts .fact { background: var(--paper); padding: 10px 32px; }
  .facts dt { font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted); margin: 0; }
  .facts dd { font-size: 13px; font-weight: 500; margin: 4px 0 0; }

  .intro { padding: 20px 32px; border-bottom: 1px solid var(--rule); }
  .intro p { margin: 0; color: var(--ink); }

  .group-toggle { display: flex; align-items: center; gap: 6px; padding: 12px 32px; border-bottom: 1px solid var(--rule); background: var(--paper-2); }
  .group-toggle .gt-label { font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-right: 4px; }
  .group-toggle button { font: inherit; font-size: 11px; cursor: pointer; padding: 4px 12px; border: 1px solid var(--rule); background: var(--paper); color: var(--muted); border-radius: 999px; transition: all 0.12s; }
  .group-toggle button:hover { color: var(--ink); border-color: var(--muted); }
  .group-toggle button.active { background: var(--ink); color: #fff; border-color: var(--ink); }

  .section { padding: 20px 32px; border-bottom: 1px solid var(--rule); }
  .section-label { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); margin: 0 0 12px; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines th { text-align: left; font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--rule); font-weight: 600; }
  table.lines td { padding: 10px 8px; vertical-align: top; border-bottom: 1px solid var(--paper-2); }
  table.lines .ref { width: 60px; font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-size: 11px; color: var(--muted); }
  table.lines .desc-text { font-weight: 500; }
  table.lines .rooms { margin-top: 4px; }
  table.lines .room { display: inline-block; margin-right: 4px; padding: 1px 6px; background: var(--paper-2); border-radius: 999px; font-size: 10px; font-family: SFMono-Regular, ui-monospace, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  table.lines .qty { width: 90px; text-align: right; font-family: SFMono-Regular, ui-monospace, Menlo, monospace; }
  table.lines .price { width: 120px; text-align: right; font-family: SFMono-Regular, ui-monospace, Menlo, monospace; }
  table.lines .total { width: 140px; text-align: right; font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-weight: 600; }
  table.lines tr.subtotal td { border-top: 1px solid var(--rule); border-bottom: 0; color: var(--muted); font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  table.lines tr.subtotal .total { color: var(--ink); }

  .bottom-line { padding: 20px 32px; background: var(--paper-2); border-top: 2px solid var(--ink); }
  .totals { margin-left: auto; max-width: 320px; }
  .totals .trow { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; }
  .totals .t-label { font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .totals .t-value { font-family: SFMono-Regular, ui-monospace, Menlo, monospace; font-size: 14px; }
  .totals .grand { border-top: 1px solid var(--rule); margin-top: 6px; padding-top: 10px; }
  .totals .grand .t-label { color: var(--ink); }
  .totals .grand .t-value { font-size: 24px; font-weight: 600; }

  .sig { padding: 16px 32px 24px; color: var(--muted); font-size: 11px; }

  @media print {
    body, html { background: var(--paper); }
    .proposal { margin: 0; border: 0; max-width: none; }
    .group-toggle { display: none; }
    .section, .title-block, .intro, .bottom-line { page-break-inside: avoid; }
  }
`;
