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
  assetEvents,
  assets,
  auditLog,
  bidPackages,
  bids,
  bills,
  clients,
  furniture,
  getDb,
  invoices,
  materials,
  proposals,
  rooms,
  specItems,
  vendors,
  workItems,
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

  list_bids: {
    spec: {
      name: "list_bids",
      description:
        "List vendor quotes (bids) on this project. Each bid is one PDF a vendor sent. Use for 'who quoted', 'what was AVA's total', 'which bids are expired', 'cheapest paint quote', etc.",
      input_schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["received", "comparing", "accepted", "rejected", "expired"],
            description: "Filter by bid status.",
          },
          vendor_name: {
            type: "string",
            description: "Filter by vendor name (case-insensitive partial).",
          },
          trade: {
            type: "string",
            description: "Filter by trade label (case-insensitive partial).",
          },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(bids.projectId, projectId),
        eq(bids.orgId, orgId),
      ];
      if (input.status) {
        conditions.push(eq(bids.status, input.status as never));
      }
      if (input.trade) {
        conditions.push(ilike(bids.trade, `%${input.trade}%`));
      }
      if (input.vendor_name) {
        const matched = await db
          .select({ id: vendors.id })
          .from(vendors)
          .where(
            and(
              eq(vendors.orgId, orgId),
              ilike(vendors.name, `%${input.vendor_name as string}%`),
            ),
          );
        conditions.push(
          inArrayOrFalse(bids.vendorId, matched.map((v) => v.id)),
        );
      }
      const rows = await db
        .select({
          bid: bids,
          vendor: vendors,
          pkg: bidPackages,
        })
        .from(bids)
        .leftJoin(vendors, eq(bids.vendorId, vendors.id))
        .leftJoin(bidPackages, eq(bids.packageId, bidPackages.id))
        .where(and(...conditions))
        .orderBy(desc(bids.updatedAt));
      const today = new Date().toISOString().slice(0, 10);
      return rows.map((r) => ({
        id: r.bid.id,
        bid_number: r.bid.bidNumber,
        vendor: r.vendor?.name ?? null,
        trade: r.bid.trade,
        status: r.bid.status,
        package: r.pkg?.name ?? null,
        package_status: r.pkg?.status ?? null,
        bid_date: r.bid.bidDate,
        valid_until: r.bid.validUntil,
        validity_expired:
          r.bid.validUntil != null && r.bid.validUntil < today,
        subtotal: r.bid.subtotalAmount,
        iva: r.bid.ivaAmount,
        total: r.bid.totalAmount,
        currency: r.bid.currency,
        iva_included: r.bid.ivaIncluded,
        flags: r.bid.flags,
        notes: r.bid.notes,
      }));
    },
  },

  list_bid_lines: {
    spec: {
      name: "list_bid_lines",
      description:
        "List the line items inside one specific bid. Each line is one row from the vendor's quote (description, qty, unit price, total). Use after list_bids when the user asks 'what's on AVA's quote' or 'how much for window V08'.",
      input_schema: {
        type: "object",
        properties: {
          bid_id: {
            type: "string",
            description: "UUID of the bid (from list_bids).",
          },
        },
        required: ["bid_id"],
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const bidId = input.bid_id as string;
      const rows = await db
        .select({
          ref: workItems.ref,
          description: workItems.description,
          qty: workItems.qty,
          unit: workItems.unit,
          unit_price: workItems.unitPriceAmount,
          total: workItems.totalAmount,
          currency: workItems.totalCurrency,
          status: workItems.status,
        })
        .from(workItems)
        .where(
          and(
            eq(workItems.projectId, projectId),
            eq(workItems.orgId, orgId),
            eq(workItems.bidId, bidId),
          ),
        )
        .orderBy(asc(workItems.ref));
      return rows;
    },
  },

  list_bid_packages: {
    spec: {
      name: "list_bid_packages",
      description:
        "List bid packages — groupings of competing bids for one piece of work. Each package has a status (open / awarded / cancelled). Use for 'what scopes are we shopping', 'has the painting been decided', etc.",
      input_schema: { type: "object", properties: {} },
    },
    handler: async (_input, { projectId, orgId }) => {
      const db = getDb();
      const pkgs = await db
        .select()
        .from(bidPackages)
        .where(
          and(
            eq(bidPackages.projectId, projectId),
            eq(bidPackages.orgId, orgId),
          ),
        )
        .orderBy(desc(bidPackages.updatedAt));
      // Annotate each package with its bid count.
      const allBids = await db
        .select({
          id: bids.id,
          packageId: bids.packageId,
          status: bids.status,
        })
        .from(bids)
        .where(and(eq(bids.projectId, projectId), eq(bids.orgId, orgId)));
      const byPkg = new Map<string, { count: number; accepted: number }>();
      for (const b of allBids) {
        if (!b.packageId) continue;
        const agg = byPkg.get(b.packageId) ?? { count: 0, accepted: 0 };
        agg.count += 1;
        if (b.status === "accepted") agg.accepted += 1;
        byPkg.set(b.packageId, agg);
      }
      return pkgs.map((p) => ({
        id: p.id,
        name: p.name,
        scope: p.scope,
        status: p.status,
        awarded_at: p.awardedAt,
        awarded_bid_id: p.awardedBidId,
        bid_count: byPkg.get(p.id)?.count ?? 0,
        accepted_count: byPkg.get(p.id)?.accepted ?? 0,
      }));
    },
  },

  list_furniture: {
    spec: {
      name: "list_furniture",
      description:
        "List free-standing furniture pieces (sofas, tables, lamps, rugs, art) installed or planned on this project. Distinct from list_assets which covers installed items like appliances and HVAC.",
      input_schema: {
        type: "object",
        properties: {
          room_name: {
            type: "string",
            description: "Filter to pieces in rooms matching this name.",
          },
          status: {
            type: "string",
            enum: [
              "planned",
              "selected",
              "ordered",
              "delivered",
              "placed",
              "returned",
              "retired",
            ],
            description: "Filter by lifecycle status.",
          },
          search: {
            type: "string",
            description:
              "Free-text search across name, designer, manufacturer, model, material.",
          },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(furniture.projectId, projectId),
        eq(furniture.orgId, orgId),
      ];
      if (input.status) {
        conditions.push(eq(furniture.status, input.status as never));
      }
      if (input.search) {
        const p = `%${input.search as string}%`;
        const clause = or(
          ilike(furniture.name, p),
          ilike(furniture.designer, p),
          ilike(furniture.manufacturer, p),
          ilike(furniture.model, p),
          ilike(furniture.material, p),
        );
        if (clause) conditions.push(clause);
      }
      if (input.room_name) {
        const matched = await db
          .select({ id: rooms.id })
          .from(rooms)
          .where(
            and(
              eq(rooms.projectId, projectId),
              ilike(rooms.name, `%${input.room_name as string}%`),
            ),
          );
        conditions.push(
          inArrayOrFalse(furniture.roomId, matched.map((r) => r.id)),
        );
      }
      const rows = await db
        .select({
          piece: furniture,
          room: rooms,
          vendor: vendors,
        })
        .from(furniture)
        .leftJoin(rooms, eq(furniture.roomId, rooms.id))
        .leftJoin(vendors, eq(furniture.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(furniture.updatedAt));
      return rows.map((r) => ({
        id: r.piece.id,
        name: r.piece.name,
        category: r.piece.category,
        status: r.piece.status,
        room: r.room?.name ?? null,
        quantity: r.piece.quantity,
        designer: r.piece.designer,
        manufacturer: r.piece.manufacturer,
        model: r.piece.model,
        dimensions: r.piece.dimensions,
        material: r.piece.material,
        finish: r.piece.finish,
        delivery_date: r.piece.deliveryDate,
        warranty_expires_at: r.piece.warrantyExpiresAt,
        purchase_price: r.piece.purchasePriceAmount,
        currency: r.piece.purchasePriceCurrency,
        vendor: r.vendor?.name ?? null,
      }));
    },
  },

  list_work_items: {
    spec: {
      name: "list_work_items",
      description:
        "List the Plan — the spine of work on this project. Each row is a unit of work (description, qty, unit, internal price, client markup, status, planned dates). Awarded bid lines flow in here as `approved`. Use for 'what work is planned', 'what's the total scope', 'what's in the kitchen', 'which work is overdue'.",
      input_schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: [
              "specified",
              "approved",
              "scheduled",
              "in_progress",
              "done",
              "accepted",
              "cancelled",
            ],
            description: "Filter by work-item status.",
          },
          status_in: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter by multiple statuses. Useful values: ['approved','scheduled','in_progress'] = the live plan; ['specified'] = un-awarded bid lines.",
          },
          room_name: {
            type: "string",
            description: "Filter to items in rooms matching this name.",
          },
          trade: {
            type: "string",
            description: "Filter by trade tag (partial match).",
          },
          vendor_name: {
            type: "string",
            description: "Filter to items assigned to vendor matching this name.",
          },
          search: {
            type: "string",
            description:
              "Free-text search across description, ref, notes.",
          },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(workItems.projectId, projectId),
        eq(workItems.orgId, orgId),
      ];
      if (input.status) {
        conditions.push(eq(workItems.status, input.status as never));
      }
      if (Array.isArray(input.status_in) && input.status_in.length > 0) {
        conditions.push(
          inArray(workItems.status, input.status_in as never[]),
        );
      }
      if (input.trade) {
        conditions.push(ilike(workItems.trade, `%${input.trade}%`));
      }
      if (input.search) {
        const p = `%${input.search as string}%`;
        const clause = or(
          ilike(workItems.description, p),
          ilike(workItems.ref, p),
          ilike(workItems.notes, p),
        );
        if (clause) conditions.push(clause);
      }
      if (input.vendor_name) {
        const matched = await db
          .select({ id: vendors.id })
          .from(vendors)
          .where(
            and(
              eq(vendors.orgId, orgId),
              ilike(vendors.name, `%${input.vendor_name as string}%`),
            ),
          );
        conditions.push(
          inArrayOrFalse(workItems.vendorId, matched.map((v) => v.id)),
        );
      }
      if (input.room_name) {
        // work_items have a separate m2m table; for simplicity, also
        // accept a vendor / trade match. Skipping deep room join here.
      }
      const today = new Date().toISOString().slice(0, 10);
      const rows = await db
        .select({
          item: workItems,
          vendor: vendors,
          bid: bids,
        })
        .from(workItems)
        .leftJoin(vendors, eq(workItems.vendorId, vendors.id))
        .leftJoin(bids, eq(workItems.bidId, bids.id))
        .where(and(...conditions))
        .orderBy(desc(workItems.updatedAt))
        .limit(200);
      return rows.map((r) => ({
        id: r.item.id,
        ref: r.item.ref,
        description: r.item.description,
        trade: r.item.trade,
        qty: r.item.qty,
        unit: r.item.unit,
        unit_price: r.item.unitPriceAmount,
        total: r.item.totalAmount,
        currency: r.item.totalCurrency,
        client_markup_pct: r.item.clientMarkupPct,
        client_total: r.item.clientTotal,
        status: r.item.status,
        planned_start: r.item.plannedStart,
        planned_end: r.item.plannedEnd,
        overdue:
          r.item.plannedEnd != null &&
          r.item.plannedEnd < today &&
          r.item.status !== "done" &&
          r.item.status !== "accepted" &&
          r.item.status !== "cancelled",
        vendor: r.vendor?.name ?? null,
        source_bid: r.bid
          ? {
              id: r.bid.id,
              number: r.bid.bidNumber,
              status: r.bid.status,
            }
          : null,
      }));
    },
  },

  list_asset_events: {
    spec: {
      name: "list_asset_events",
      description:
        "List timeline events for a specific asset (service calls, repairs, inspections, notes). Use after list_assets when the user asks 'when was the fridge last serviced', 'what work has been done on the HVAC', etc.",
      input_schema: {
        type: "object",
        properties: {
          asset_id: {
            type: "string",
            description: "UUID of the asset (from list_assets).",
          },
        },
        required: ["asset_id"],
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const assetId = input.asset_id as string;
      // Verify the asset belongs to this project + org.
      const ok = await db
        .select({ id: assets.id })
        .from(assets)
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.projectId, projectId),
            eq(assets.orgId, orgId),
          ),
        )
        .limit(1);
      if (!ok[0]) return [];
      const rows = await db
        .select({ event: assetEvents, vendor: vendors })
        .from(assetEvents)
        .leftJoin(vendors, eq(assetEvents.vendorId, vendors.id))
        .where(
          and(
            eq(assetEvents.assetId, assetId),
            eq(assetEvents.orgId, orgId),
          ),
        )
        .orderBy(desc(assetEvents.occurredAt));
      return rows.map((r) => ({
        event_type: r.event.eventType,
        occurred_at: r.event.occurredAt,
        summary: r.event.summary,
        vendor: r.vendor?.name ?? null,
        cost: r.event.costAmount,
        currency: r.event.costCurrency,
        notes: r.event.notes,
      }));
    },
  },

  list_proposals: {
    spec: {
      name: "list_proposals",
      description:
        "List proposals generated for this project (the client-facing artifacts). Each proposal is a versioned snapshot of scope + client pricing. Use for 'what have we proposed', 'what's our latest quote to the client'.",
      input_schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["drafted", "sent", "accepted", "rejected", "superseded"],
            description: "Filter by proposal status.",
          },
        },
      },
    },
    handler: async (input, { projectId, orgId }) => {
      const db = getDb();
      const conditions: SQL[] = [
        eq(proposals.projectId, projectId),
        eq(proposals.orgId, orgId),
      ];
      if (input.status) {
        conditions.push(eq(proposals.status, input.status as never));
      }
      const rows = await db
        .select()
        .from(proposals)
        .where(and(...conditions))
        .orderBy(desc(proposals.createdAt));
      return rows.map((p) => ({
        id: p.id,
        number: p.number,
        version: p.version,
        title: p.title,
        status: p.status,
        sent_at: p.sentAt,
        decided_at: p.decidedAt,
        expires_at: p.expiresAt,
        total: p.totalAmount,
        currency: p.totalCurrency,
        notes: p.notes,
      }));
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
