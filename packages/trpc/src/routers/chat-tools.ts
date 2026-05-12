import type Anthropic from "@anthropic-ai/sdk";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import {
  assets,
  auditLog,
  bills,
  clients,
  getDb,
  invoices,
  materials,
  rooms,
  specItems,
  vendors,
} from "@beamy/db";
import {
  isBillOverdue,
  isInvoiceOverdue,
  type AssetCategory,
  type MaterialCategory,
  type SpecState,
  type SpecType,
} from "@beamy/shared";

/**
 * Chat tools — the read-only query surface the assistant can call when
 * answering a question. Each tool is scoped to the current project (and
 * org) via closure; no tool can leak data across the multi-tenancy
 * boundary. No tools mutate state in v1 — the assistant can ask, never
 * tell.
 *
 * Tool spec returned to Anthropic follows the `Anthropic.Tool` shape:
 *   { name, description, input_schema (JSON Schema) }
 *
 * The handler validates input loosely (Anthropic's schema enforces
 * shape) and returns a JSON-serializable result. Result is stringified
 * before going back to Claude.
 */

export type ToolContext = {
  orgId: string;
  projectId: string;
};

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

type ToolDef = {
  spec: Anthropic.Tool;
  handler: ToolHandler;
};

const ASSET_CATEGORIES = [
  "appliance",
  "fixture",
  "equipment",
  "hvac",
  "plumbing",
  "electrical",
  "lighting",
  "smart_home",
  "hardware",
  "structural",
  "other",
];

const MATERIAL_CATEGORIES = [
  "paint",
  "tile",
  "flooring",
  "stone",
  "wood",
  "drywall",
  "insulation",
  "cabinetry",
  "countertop",
  "grout",
  "sealant",
  "adhesive",
  "fastener",
  "other",
];

const SPEC_STATES = [
  "specified",
  "client_approved",
  "ordered",
  "received",
  "installed",
  "cancelled",
];

const TOOLS: Record<string, ToolDef> = {
  list_rooms: {
    spec: {
      name: "list_rooms",
      description:
        "List all rooms in the current project. Use when the user asks 'what rooms', or before filtering other lists by room.",
      input_schema: { type: "object", properties: {} },
    },
    handler: async (_input, { projectId }) => {
      const db = getDb();
      const rows = await db
        .select({
          id: rooms.id,
          name: rooms.name,
          roomType: rooms.roomType,
          notes: rooms.notes,
        })
        .from(rooms)
        .where(eq(rooms.projectId, projectId))
        .orderBy(asc(rooms.name));
      return rows;
    },
  },

  list_assets: {
    spec: {
      name: "list_assets",
      description:
        "List per-instance physical items installed on this project (appliances, fixtures, HVAC, plumbing, etc.). Each row has manufacturer, model, serial number, install date, warranty expiry. Use this to answer recall questions like 'what fridge in the kitchen?'.",
      input_schema: {
        type: "object",
        properties: {
          room_name: {
            type: "string",
            description:
              "Filter by room name. Case-insensitive partial match against the room name.",
          },
          category: {
            type: "string",
            enum: ASSET_CATEGORIES,
            description: "Filter by category.",
          },
          search: {
            type: "string",
            description:
              "Free-text search across name, manufacturer, model, and serial.",
          },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(assets.projectId, projectId),
        eq(assets.orgId, orgId),
      ];

      const cat = input.category as AssetCategory | undefined;
      if (cat) conditions.push(eq(assets.category, cat));

      const search = input.search as string | undefined;
      if (search) {
        const p = `%${search}%`;
        const c = or(
          ilike(assets.name, p),
          ilike(assets.manufacturer, p),
          ilike(assets.model, p),
          ilike(assets.serialNumber, p),
        );
        if (c) conditions.push(c);
      }

      const roomName = input.room_name as string | undefined;
      if (roomName) {
        const matched = await db
          .select({ id: rooms.id })
          .from(rooms)
          .where(
            and(
              eq(rooms.projectId, projectId),
              ilike(rooms.name, `%${roomName}%`),
            ),
          );
        if (matched.length === 0) return [];
        conditions.push(
          inArrayOrFalse(assets.roomId, matched.map((r) => r.id)),
        );
      }

      const rows = await db
        .select({
          asset: assets,
          room: rooms,
          vendor: vendors,
        })
        .from(assets)
        .leftJoin(rooms, eq(assets.roomId, rooms.id))
        .leftJoin(vendors, eq(assets.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(assets.updatedAt))
        .limit(50);

      return rows.map((r) => ({
        id: r.asset.id,
        name: r.asset.name,
        category: r.asset.category,
        room: r.room?.name ?? null,
        manufacturer: r.asset.manufacturer,
        model: r.asset.model,
        serialNumber: r.asset.serialNumber,
        installDate: r.asset.installDate,
        warrantyExpiresAt: r.asset.warrantyExpiresAt,
        vendor: r.vendor?.name ?? null,
        purchasePrice:
          r.asset.purchasePriceAmount && r.asset.purchasePriceCurrency
            ? `${r.asset.purchasePriceAmount} ${r.asset.purchasePriceCurrency}`
            : null,
      }));
    },
  },

  list_materials: {
    spec: {
      name: "list_materials",
      description:
        "List per-batch materials specified on this project (paint, tile, flooring, stone, etc.). Each row has manufacturer, product code, color, **lot number**, quantity, and attic-stock data. Use this to answer recall questions like 'what paint did we use in the primary bath?'.",
      input_schema: {
        type: "object",
        properties: {
          room_name: { type: "string" },
          category: {
            type: "string",
            enum: MATERIAL_CATEGORIES,
          },
          search: {
            type: "string",
            description:
              "Free-text search across name, manufacturer, product code, color, lot number.",
          },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(materials.projectId, projectId),
        eq(materials.orgId, orgId),
      ];

      const cat = input.category as MaterialCategory | undefined;
      if (cat) conditions.push(eq(materials.category, cat));

      const search = input.search as string | undefined;
      if (search) {
        const p = `%${search}%`;
        const c = or(
          ilike(materials.name, p),
          ilike(materials.manufacturer, p),
          ilike(materials.productCode, p),
          ilike(materials.colorName, p),
          ilike(materials.lotNumber, p),
        );
        if (c) conditions.push(c);
      }

      const roomName = input.room_name as string | undefined;
      if (roomName) {
        const matched = await db
          .select({ id: rooms.id })
          .from(rooms)
          .where(
            and(
              eq(rooms.projectId, projectId),
              ilike(rooms.name, `%${roomName}%`),
            ),
          );
        if (matched.length === 0) return [];
        conditions.push(
          inArrayOrFalse(materials.roomId, matched.map((r) => r.id)),
        );
      }

      const rows = await db
        .select({
          material: materials,
          room: rooms,
          vendor: vendors,
        })
        .from(materials)
        .leftJoin(rooms, eq(materials.roomId, rooms.id))
        .leftJoin(vendors, eq(materials.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(materials.updatedAt))
        .limit(50);

      return rows.map((r) => ({
        id: r.material.id,
        name: r.material.name,
        category: r.material.category,
        room: r.room?.name ?? null,
        manufacturer: r.material.manufacturer,
        productCode: r.material.productCode,
        colorName: r.material.colorName,
        lotNumber: r.material.lotNumber,
        quantity:
          r.material.quantity && r.material.quantityUnit
            ? `${r.material.quantity} ${r.material.quantityUnit}`
            : null,
        atticStock:
          r.material.atticStockQuantity && r.material.quantityUnit
            ? `${r.material.atticStockQuantity} ${r.material.quantityUnit}${
                r.material.atticStockLocation
                  ? ` @ ${r.material.atticStockLocation}`
                  : ""
              }`
            : null,
        vendor: r.vendor?.name ?? null,
        coverageNotes: r.material.coverageNotes,
      }));
    },
  },

  list_specs: {
    spec: {
      name: "list_specs",
      description:
        "List spec items — the planning + procurement layer. Each row has its lifecycle state (specified → client_approved → ordered → received → installed) plus catalog and client prices. Use to answer questions about what's been approved, ordered, or still pending.",
      input_schema: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: SPEC_STATES,
          },
          room_name: { type: "string" },
          spec_type: { type: "string", enum: ["asset", "material"] },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(specItems.projectId, projectId),
        eq(specItems.orgId, orgId),
      ];

      const state = input.state as SpecState | undefined;
      if (state) conditions.push(eq(specItems.state, state));

      const specType = input.spec_type as SpecType | undefined;
      if (specType) conditions.push(eq(specItems.specType, specType));

      const roomName = input.room_name as string | undefined;
      if (roomName) {
        const matched = await db
          .select({ id: rooms.id })
          .from(rooms)
          .where(
            and(
              eq(rooms.projectId, projectId),
              ilike(rooms.name, `%${roomName}%`),
            ),
          );
        if (matched.length === 0) return [];
        conditions.push(
          inArrayOrFalse(specItems.roomId, matched.map((r) => r.id)),
        );
      }

      const rows = await db
        .select({ spec: specItems, room: rooms, vendor: vendors })
        .from(specItems)
        .leftJoin(rooms, eq(specItems.roomId, rooms.id))
        .leftJoin(vendors, eq(specItems.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(specItems.updatedAt))
        .limit(50);

      return rows.map((r) => ({
        id: r.spec.id,
        name: r.spec.name,
        state: r.spec.state,
        specType: r.spec.specType,
        category: r.spec.category,
        room: r.room?.name ?? null,
        description: r.spec.description,
        catalogPrice:
          r.spec.catalogPriceAmount && r.spec.catalogPriceCurrency
            ? `${r.spec.catalogPriceAmount} ${r.spec.catalogPriceCurrency}`
            : null,
        clientPrice:
          r.spec.clientPriceAmount && r.spec.clientPriceCurrency
            ? `${r.spec.clientPriceAmount} ${r.spec.clientPriceCurrency}`
            : null,
        approvedAt: r.spec.approvedAt,
        orderedAt: r.spec.orderedAt,
        installedAt: r.spec.installedAt,
        vendor: r.vendor?.name ?? null,
      }));
    },
  },

  list_bills: {
    spec: {
      name: "list_bills",
      description:
        "List bills (money we owe vendors) on this project. Each row has amount, vendor, status (open/paid/void), due/paid dates, and a computed `overdue` flag.",
      input_schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "paid", "void"],
          },
          overdue_only: {
            type: "boolean",
            description: "Restrict to overdue (status=open, due_at < today).",
          },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(bills.projectId, projectId),
        eq(bills.orgId, orgId),
      ];
      const status = input.status as "open" | "paid" | "void" | undefined;
      if (status) conditions.push(eq(bills.status, status));

      const rows = await db
        .select({ bill: bills, vendor: vendors })
        .from(bills)
        .leftJoin(vendors, eq(bills.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(bills.dueAt), desc(bills.updatedAt))
        .limit(100);

      let mapped = rows.map((r) => ({
        id: r.bill.id,
        description: r.bill.description,
        billNumber: r.bill.billNumber,
        vendor: r.vendor?.name ?? null,
        amount: `${r.bill.amount} ${r.bill.currency}`,
        status: r.bill.status,
        issuedAt: r.bill.issuedAt,
        dueAt: r.bill.dueAt,
        paidAt: r.bill.paidAt,
        overdue: isBillOverdue(r.bill.status, r.bill.dueAt),
      }));
      if (input.overdue_only) mapped = mapped.filter((b) => b.overdue);
      return mapped;
    },
  },

  list_invoices: {
    spec: {
      name: "list_invoices",
      description:
        "List invoices (money clients owe us) on this project. Each row has amount, client, status (draft/sent/paid/void), dates, and a computed `overdue` flag.",
      input_schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "sent", "paid", "void"],
          },
          overdue_only: { type: "boolean" },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(invoices.projectId, projectId),
        eq(invoices.orgId, orgId),
      ];
      const status = input.status as
        | "draft"
        | "sent"
        | "paid"
        | "void"
        | undefined;
      if (status) conditions.push(eq(invoices.status, status));

      const rows = await db
        .select({ invoice: invoices, client: clients })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(desc(invoices.dueAt), desc(invoices.updatedAt))
        .limit(100);

      let mapped = rows.map((r) => ({
        id: r.invoice.id,
        description: r.invoice.description,
        invoiceNumber: r.invoice.invoiceNumber,
        client: r.client?.name ?? null,
        amount: `${r.invoice.amount} ${r.invoice.currency}`,
        status: r.invoice.status,
        issuedAt: r.invoice.issuedAt,
        sentAt: r.invoice.sentAt,
        dueAt: r.invoice.dueAt,
        paidAt: r.invoice.paidAt,
        overdue: isInvoiceOverdue(r.invoice.status, r.invoice.dueAt),
      }));
      if (input.overdue_only) mapped = mapped.filter((i) => i.overdue);
      return mapped;
    },
  },

  list_activity: {
    spec: {
      name: "list_activity",
      description:
        "List recent project-level audit log entries (last N). Useful for 'what changed last week' or 'who did X' questions.",
      input_schema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of entries to return (max 50, default 20).",
          },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const rawLimit = (input.limit as number | undefined) ?? 20;
      const limit = Math.max(1, Math.min(50, Math.floor(rawLimit)));
      const rows = await db
        .select({
          action: auditLog.action,
          actor: auditLog.actor,
          resourceType: auditLog.resourceType,
          resourceId: auditLog.resourceId,
          ts: auditLog.ts,
        })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.orgId, orgId),
            eq(auditLog.resourceType, "project"),
            eq(auditLog.resourceId, projectId),
          ),
        )
        .orderBy(desc(auditLog.ts))
        .limit(limit);
      return rows.map((r) => ({
        ts: r.ts.toISOString(),
        action: r.action,
        actor: r.actor,
      }));
    },
  },
};

/** Tool specs to pass to Anthropic. */
export const CHAT_TOOLS: Anthropic.Tool[] = Object.values(TOOLS).map(
  (t) => t.spec,
);

/** Look up + execute a tool by name. Throws if name is unknown. */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return await tool.handler(input, ctx);
}

// ────────────────────── helpers ──────────────────────

/**
 * Drizzle's `inArray` throws on empty arrays. Wrap it so empty lists
 * produce an unsatisfiable WHERE clause and the surrounding query
 * returns zero rows naturally.
 */
function inArrayOrFalse(column: AnyColumn, values: string[]): SQL {
  if (values.length === 0) return sql`false`;
  return inArray(column, values);
}
