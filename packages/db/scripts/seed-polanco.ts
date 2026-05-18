/**
 * Seed a second sample project — "Polanco Office TI" — so the workspace
 * has more than just Rubén Darío to play with.
 *
 * Different vibe from Rubén Darío:
 *   - Tenant improvement (commercial), not residential renovation
 *   - Smaller scope (~7 rooms vs 16, ~4 vendors vs 16)
 *   - Demonstrates a real bid package: two painters competing for the
 *     same scope, one already awarded (which auto-promotes its work
 *     items to `approved` so they show up on the Plan).
 *
 * Idempotent — re-running checks for existing rows by natural key.
 * Run with `pnpm --filter @beamy/db seed-polanco`.
 */
import { and, eq } from "drizzle-orm";
import {
  bidPackages,
  bids,
  clients,
  getDb,
  projects,
  rooms,
  vendorContacts,
  vendors,
  workItems,
} from "../src/index";

const DEV_ORG_ID = "00000000-0000-0000-0000-000000000010";
const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
const ACTOR = `user:${DEV_USER_ID}`;

const PROJECT_NAME = "Polanco Office TI";
const CLIENT_NAME = "Lumen Studio";

// ─────────────────────── data ───────────────────────

const CLIENT = {
  name: CLIENT_NAME,
  primaryContact: "Daniela Bravo",
  address: "Av. Tamaulipas 141, Condesa, CDMX",
  notes: "Boutique branding studio. ~14 employees, growing.",
};

const PROJECT = {
  name: PROJECT_NAME,
  projectType: "tenant_improvement" as const,
  status: "active" as const,
  address: "Av. Presidente Masaryk 134, Piso 4, Polanco, CDMX",
  contractAmount: "1850000.00",
  contractCurrency: "MXN",
  startedAt: "2026-03-15",
  substantialCompletionAt: "2026-06-30",
  notes:
    "TI for Lumen Studio's new HQ floor. Brutalist-meets-warm direction; exposed concrete kept, walnut millwork accents.",
  tags: ["commercial", "ti", "polanco", "design-build"],
};

type RoomSeed = {
  name: string;
  roomType:
    | "kitchen"
    | "primary_bath"
    | "bath"
    | "powder"
    | "living"
    | "dining"
    | "family"
    | "bedroom"
    | "primary_bedroom"
    | "office"
    | "mudroom"
    | "laundry"
    | "garage"
    | "basement"
    | "attic"
    | "mechanical"
    | "hallway"
    | "stairs"
    | "exterior"
    | "yard"
    | "other";
  floor?: string;
  description?: string;
  floorAreaSqM?: string;
  ceilingHeightM?: string;
};

const ROOMS: RoomSeed[] = [
  {
    name: "Reception",
    roomType: "hallway",
    floor: "P4",
    description:
      "Entrance lobby with the receptionist desk and a small waiting area.",
    floorAreaSqM: "22.00",
    ceilingHeightM: "3.20",
  },
  {
    name: "Open workspace",
    roomType: "office",
    floor: "P4",
    description: "Main open floor — ~24 desks in clusters of 6.",
    floorAreaSqM: "168.00",
    ceilingHeightM: "3.20",
  },
  {
    name: "Conference — Tlacotalpan",
    roomType: "office",
    floor: "P4",
    description: "Large board room, seats 12, integrated A/V.",
    floorAreaSqM: "32.00",
    ceilingHeightM: "3.00",
  },
  {
    name: "Conference — Tepoztlán",
    roomType: "office",
    floor: "P4",
    description: "Smaller huddle room, seats 6.",
    floorAreaSqM: "18.00",
    ceilingHeightM: "3.00",
  },
  {
    name: "Phone booth — Mazunte",
    roomType: "office",
    floor: "P4",
    description: "Single-occupant call room with acoustic panels.",
    floorAreaSqM: "3.50",
    ceilingHeightM: "3.00",
  },
  {
    name: "Kitchenette",
    roomType: "kitchen",
    floor: "P4",
    description: "Pantry + breakfast bar + dishwasher.",
    floorAreaSqM: "14.00",
    ceilingHeightM: "3.00",
  },
  {
    name: "Restrooms",
    roomType: "bath",
    floor: "P4",
    description: "Two unisex restrooms.",
    floorAreaSqM: "11.00",
    ceilingHeightM: "3.00",
  },
];

type VendorSeed = {
  name: string;
  trade: string;
  contact: { name: string; phone?: string; email?: string };
};

const VENDORS: VendorSeed[] = [
  {
    name: "Maestros del Color",
    trade: "Pintura",
    contact: {
      name: "Luis Hernández",
      phone: "55 4421 0098",
      email: "luis@maestrosdelcolor.mx",
    },
  },
  {
    name: "Pinturas Sigma",
    trade: "Pintura",
    contact: {
      name: "Marisol Becerra",
      phone: "55 5512 8841",
      email: "ventas@pinturasigma.com",
    },
  },
  {
    name: "SEDME",
    trade: "Electricidad",
    contact: {
      name: "Carlos Mendoza",
      phone: "55 5601 3344",
      email: "cmendoza@sedme.mx",
    },
  },
  {
    name: "Acústica Profesional MX",
    trade: "Acústica + alfombras",
    contact: {
      name: "Patricia Olvera",
      phone: "55 3811 7720",
      email: "ventas@acusticaprofesional.mx",
    },
  },
  {
    name: "Ulises Maderas",
    trade: "Carpintería",
    contact: {
      name: "Ulises Ramírez",
      phone: "55 6612 3401",
      email: "ulises@ulisesmaderas.com",
    },
  },
];

type LineSeed = {
  ref: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  total: string;
};

type BidSeed = {
  vendorName: string;
  bidNumber: string;
  bidDate: string;
  validUntil: string;
  currency: string;
  subtotal: string;
  iva: string;
  total: string;
  ivaIncluded: boolean;
  flags: string[];
  notes?: string;
  packageName?: string; // when set, attach to a bid_package by name
  lines: LineSeed[];
};

const BIDS: BidSeed[] = [
  // ── Paint package: two competing quotes ──
  {
    vendorName: "Maestros del Color",
    bidNumber: "MDC-2026-0411",
    bidDate: "2026-04-11",
    validUntil: "2026-05-15",
    currency: "MXN",
    subtotal: "168000.00",
    iva: "26880.00",
    total: "194880.00",
    ivaIncluded: false,
    flags: [],
    packageName: "Paint — open workspace + meeting rooms",
    lines: [
      {
        ref: "MDC-1",
        description: "Sellador + 2 manos de Vinimex blanco mate en plafones",
        qty: "240",
        unit: "m²",
        unitPrice: "180.00",
        total: "43200.00",
      },
      {
        ref: "MDC-2",
        description:
          "2 manos de Comex Vinimex blanco hueso en muros, open workspace",
        qty: "320",
        unit: "m²",
        unitPrice: "165.00",
        total: "52800.00",
      },
      {
        ref: "MDC-3",
        description:
          "Acento de color terracota (Sherwin Williams SW 7588) en muros conferencia Tlacotalpan",
        qty: "48",
        unit: "m²",
        unitPrice: "320.00",
        total: "15360.00",
      },
      {
        ref: "MDC-4",
        description:
          "Esmalte negro mate en marcos metálicos de cancelería interior",
        qty: "62",
        unit: "ml",
        unitPrice: "420.00",
        total: "26040.00",
      },
      {
        ref: "MDC-5",
        description: "Detallado + protección de pisos durante obra",
        qty: "1",
        unit: "lote",
        unitPrice: "30600.00",
        total: "30600.00",
      },
    ],
  },
  {
    vendorName: "Pinturas Sigma",
    bidNumber: "PS-3349-26",
    bidDate: "2026-04-13",
    validUntil: "2026-05-15",
    currency: "MXN",
    subtotal: "182500.00",
    iva: "29200.00",
    total: "211700.00",
    ivaIncluded: false,
    flags: ["freight-not-included"],
    packageName: "Paint — open workspace + meeting rooms",
    notes:
      "Flete y andamio NO incluidos. Estima 3 semanas de trabajo nocturno.",
    lines: [
      {
        ref: "PS-1",
        description:
          "Aplicación de pintura base + acabado blanco mate en plafones (incluye lijado)",
        qty: "240",
        unit: "m²",
        unitPrice: "210.00",
        total: "50400.00",
      },
      {
        ref: "PS-2",
        description:
          "Pintura vinílica premium blanco hueso en muros del open workspace",
        qty: "320",
        unit: "m²",
        unitPrice: "175.00",
        total: "56000.00",
      },
      {
        ref: "PS-3",
        description:
          "Acento color terracota en conferencia Tlacotalpan (incluye sellado)",
        qty: "48",
        unit: "m²",
        unitPrice: "340.00",
        total: "16320.00",
      },
      {
        ref: "PS-4",
        description: "Esmalte alquidálico negro mate en cancelerías interiores",
        qty: "62",
        unit: "ml",
        unitPrice: "480.00",
        total: "29760.00",
      },
      {
        ref: "PS-5",
        description: "Limpieza fina + retoque final",
        qty: "1",
        unit: "lote",
        unitPrice: "30020.00",
        total: "30020.00",
      },
    ],
  },

  // ── Standalone bids ──
  {
    vendorName: "SEDME",
    bidNumber: "SDM-26-0118",
    bidDate: "2026-03-22",
    validUntil: "2026-05-22",
    currency: "MXN",
    subtotal: "324000.00",
    iva: "51840.00",
    total: "375840.00",
    ivaIncluded: false,
    flags: [],
    lines: [
      {
        ref: "E-01",
        description:
          "Tablero secundario 12 circuitos + interruptor termomagnético 3F-100A",
        qty: "1",
        unit: "ea",
        unitPrice: "42000.00",
        total: "42000.00",
      },
      {
        ref: "E-02",
        description:
          "Circuitos para 24 estaciones de trabajo (USB-C 60W + 2 contactos)",
        qty: "24",
        unit: "ea",
        unitPrice: "5400.00",
        total: "129600.00",
      },
      {
        ref: "E-03",
        description:
          "Luminarias LED 60×60 cm en plafón, 4000K, retícula falsa",
        qty: "36",
        unit: "ea",
        unitPrice: "2950.00",
        total: "106200.00",
      },
      {
        ref: "E-04",
        description:
          "Sensores de ocupación PIR en pasillos + restrooms (4)",
        qty: "4",
        unit: "ea",
        unitPrice: "1850.00",
        total: "7400.00",
      },
      {
        ref: "E-05",
        description: "Mano de obra, materiales menores, certificación",
        qty: "1",
        unit: "lote",
        unitPrice: "38800.00",
        total: "38800.00",
      },
    ],
  },
  {
    vendorName: "Acústica Profesional MX",
    bidNumber: "APX-046-26",
    bidDate: "2026-04-02",
    validUntil: "2026-05-30",
    currency: "MXN",
    subtotal: "287400.00",
    iva: "45984.00",
    total: "333384.00",
    ivaIncluded: false,
    flags: ["deposit-required"],
    notes: "50% de anticipo a la orden de compra.",
    lines: [
      {
        ref: "AC-01",
        description:
          "Plafón modular acústico Armstrong Optima 60×60 cm, NRC 0.95",
        qty: "212",
        unit: "m²",
        unitPrice: "780.00",
        total: "165360.00",
      },
      {
        ref: "AC-02",
        description:
          "Paneles acústicos pared fenólico negro 1.2×0.6 m en phone booth",
        qty: "12",
        unit: "ea",
        unitPrice: "2400.00",
        total: "28800.00",
      },
      {
        ref: "AC-03",
        description:
          "Alfombra modular Interface, color carbón, 50×50 cm",
        qty: "168",
        unit: "m²",
        unitPrice: "510.00",
        total: "85680.00",
      },
      {
        ref: "AC-04",
        description: "Mano de obra + instalación + ajuste de niveles",
        qty: "1",
        unit: "lote",
        unitPrice: "7560.00",
        total: "7560.00",
      },
    ],
  },
  {
    vendorName: "Ulises Maderas",
    bidNumber: "UM-2026-22",
    bidDate: "2026-04-08",
    validUntil: "2026-05-08",
    currency: "MXN",
    subtotal: "412000.00",
    iva: "65920.00",
    total: "477920.00",
    ivaIncluded: false,
    flags: [],
    notes:
      "Acabado en barniz mate al agua. Tiempo de entrega 5 semanas desde anticipo.",
    lines: [
      {
        ref: "C-01",
        description:
          "Counter de recepción en nogal americano, frente 2.80 m con repisa flotante",
        qty: "1",
        unit: "ea",
        unitPrice: "98000.00",
        total: "98000.00",
      },
      {
        ref: "C-02",
        description:
          "Librero / divisor de open space, melamina con frente en nogal, 4.20×2.40 m",
        qty: "1",
        unit: "ea",
        unitPrice: "186000.00",
        total: "186000.00",
      },
      {
        ref: "C-03",
        description:
          "Gabinetes superiores + barra de kitchenette, frente nogal, encimera de cuarzo Caesarstone",
        qty: "1",
        unit: "ea",
        unitPrice: "104000.00",
        total: "104000.00",
      },
      {
        ref: "C-04",
        description: "Acabado, herrajes Blum, instalación + ajustes",
        qty: "1",
        unit: "lote",
        unitPrice: "24000.00",
        total: "24000.00",
      },
    ],
  },
];

// Bid we'll award after creation. Maestros del Color wins paint.
const AWARD_BID_NUMBER = "MDC-2026-0411";

// ─────────────────────── helpers ───────────────────────

async function findOrCreateClient(): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.orgId, DEV_ORG_ID), eq(clients.name, CLIENT.name)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(clients)
    .values({
      orgId: DEV_ORG_ID,
      name: CLIENT.name,
      primaryContact: CLIENT.primaryContact,
      address: CLIENT.address,
      status: "active",
      notes: CLIENT.notes,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning({ id: clients.id });
  if (!row) throw new Error("Failed to insert client");
  console.log(`  + client: ${CLIENT.name}`);
  return row.id;
}

async function findOrCreateProject(clientId: string): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.orgId, DEV_ORG_ID), eq(projects.name, PROJECT.name)),
    )
    .limit(1);
  if (existing[0]) {
    console.log(`  · project exists: ${PROJECT.name}`);
    return existing[0].id;
  }
  const [row] = await db
    .insert(projects)
    .values({
      orgId: DEV_ORG_ID,
      clientId,
      ownerUserId: DEV_USER_ID,
      name: PROJECT.name,
      projectType: PROJECT.projectType,
      status: PROJECT.status,
      address: PROJECT.address,
      contractAmount: PROJECT.contractAmount,
      contractCurrency: PROJECT.contractCurrency,
      startedAt: PROJECT.startedAt,
      substantialCompletionAt: PROJECT.substantialCompletionAt,
      notes: PROJECT.notes,
      tags: PROJECT.tags,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning({ id: projects.id });
  if (!row) throw new Error("Failed to insert project");
  console.log(`  + project: ${PROJECT.name}`);
  return row.id;
}

async function seedRooms(projectId: string) {
  const db = getDb();
  let inserted = 0;
  let existing = 0;
  for (const r of ROOMS) {
    const found = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.projectId, projectId), eq(rooms.name, r.name)))
      .limit(1);
    if (found[0]) {
      existing++;
      continue;
    }
    await db.insert(rooms).values({
      orgId: DEV_ORG_ID,
      projectId,
      name: r.name,
      roomType: r.roomType,
      floor: r.floor ?? null,
      description: r.description ?? null,
      floorAreaSqM: r.floorAreaSqM ?? null,
      ceilingHeightM: r.ceilingHeightM ?? null,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
    inserted++;
  }
  console.log(`  rooms: +${inserted} new, ${existing} existing`);
}

async function seedVendors(): Promise<Map<string, string>> {
  const db = getDb();
  const map = new Map<string, string>();
  let inserted = 0;
  let existing = 0;
  for (const v of VENDORS) {
    const found = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.orgId, DEV_ORG_ID), eq(vendors.name, v.name)))
      .limit(1);
    if (found[0]) {
      map.set(v.name, found[0].id);
      existing++;
      continue;
    }
    const [row] = await db
      .insert(vendors)
      .values({
        orgId: DEV_ORG_ID,
        name: v.name,
        trade: v.trade,
        primaryContact: v.contact.name,
        email: v.contact.email ?? null,
        phone: v.contact.phone ?? null,
        status: "active",
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: vendors.id });
    if (!row) throw new Error(`Failed to insert vendor ${v.name}`);
    map.set(v.name, row.id);
    await db.insert(vendorContacts).values({
      orgId: DEV_ORG_ID,
      vendorId: row.id,
      name: v.contact.name,
      email: v.contact.email ?? null,
      phone: v.contact.phone ?? null,
      isPrimary: true,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
    inserted++;
  }
  console.log(`  vendors: +${inserted} new, ${existing} existing`);
  return map;
}

async function seedPackages(projectId: string): Promise<Map<string, string>> {
  const db = getDb();
  const map = new Map<string, string>();
  const names = new Set(BIDS.map((b) => b.packageName).filter(Boolean));
  for (const name of names) {
    if (!name) continue;
    const found = await db
      .select({ id: bidPackages.id })
      .from(bidPackages)
      .where(
        and(
          eq(bidPackages.projectId, projectId),
          eq(bidPackages.name, name),
        ),
      )
      .limit(1);
    if (found[0]) {
      map.set(name, found[0].id);
      continue;
    }
    const [row] = await db
      .insert(bidPackages)
      .values({
        orgId: DEV_ORG_ID,
        projectId,
        name,
        scope:
          "Pintura completa del piso (plafones, muros, acentos, esmaltes en marcos).",
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning({ id: bidPackages.id });
    if (!row) throw new Error(`Failed to insert package ${name}`);
    map.set(name, row.id);
    console.log(`  + package: ${name}`);
  }
  return map;
}

async function seedBidsAndLines(
  projectId: string,
  vendorMap: Map<string, string>,
  packageMap: Map<string, string>,
): Promise<Map<string, string>> {
  const db = getDb();
  const bidIdByNumber = new Map<string, string>();
  let bidsInserted = 0;
  let bidsExisting = 0;
  let linesInserted = 0;

  for (const b of BIDS) {
    const vendorId = vendorMap.get(b.vendorName);
    if (!vendorId) throw new Error(`Missing vendor ${b.vendorName}`);
    const packageId = b.packageName ? packageMap.get(b.packageName) ?? null : null;

    const found = await db
      .select({ id: bids.id })
      .from(bids)
      .where(
        and(
          eq(bids.projectId, projectId),
          eq(bids.vendorId, vendorId),
          eq(bids.bidNumber, b.bidNumber),
        ),
      )
      .limit(1);

    let bidId: string;
    if (found[0]) {
      bidId = found[0].id;
      bidsExisting++;
    } else {
      const [row] = await db
        .insert(bids)
        .values({
          orgId: DEV_ORG_ID,
          projectId,
          vendorId,
          packageId,
          trade: VENDORS.find((v) => v.name === b.vendorName)?.trade ?? null,
          bidNumber: b.bidNumber,
          bidDate: b.bidDate,
          validUntil: b.validUntil,
          subtotalAmount: b.subtotal,
          ivaAmount: b.iva,
          totalAmount: b.total,
          currency: b.currency,
          ivaIncluded: b.ivaIncluded,
          status: "comparing",
          flags: b.flags,
          notes: b.notes ?? null,
          createdBy: ACTOR,
          updatedBy: ACTOR,
        })
        .returning({ id: bids.id });
      if (!row) throw new Error(`Failed to insert bid ${b.bidNumber}`);
      bidId = row.id;
      bidsInserted++;
    }
    bidIdByNumber.set(b.bidNumber, bidId);

    for (const li of b.lines) {
      const lineExisting = await db
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.projectId, projectId),
            eq(workItems.bidId, bidId),
            eq(workItems.ref, li.ref),
          ),
        )
        .limit(1);
      if (lineExisting[0]) continue;
      await db.insert(workItems).values({
        orgId: DEV_ORG_ID,
        projectId,
        bidId,
        vendorId,
        trade: VENDORS.find((v) => v.name === b.vendorName)?.trade ?? null,
        ref: li.ref,
        description: li.description,
        qty: li.qty,
        unit: li.unit,
        unitPriceAmount: li.unitPrice,
        unitPriceCurrency: b.currency,
        totalAmount: li.total,
        totalCurrency: b.currency,
        status: "specified",
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
      linesInserted++;
    }
  }
  console.log(
    `  bids: +${bidsInserted} new, ${bidsExisting} existing  ·  work_items: +${linesInserted} new`,
  );
  return bidIdByNumber;
}

async function awardOne(
  projectId: string,
  bidIdByNumber: Map<string, string>,
) {
  const db = getDb();
  const winnerId = bidIdByNumber.get(AWARD_BID_NUMBER);
  if (!winnerId) {
    console.log(`  · award skipped (bid ${AWARD_BID_NUMBER} not found)`);
    return;
  }
  // Idempotent: only award if currently in comparing state.
  const winnerRow = await db
    .select()
    .from(bids)
    .where(eq(bids.id, winnerId))
    .limit(1);
  if (!winnerRow[0]) return;
  if (winnerRow[0].status === "accepted") {
    console.log(`  · award skipped (${AWARD_BID_NUMBER} already accepted)`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  // Mark winner accepted
  await db
    .update(bids)
    .set({
      status: "accepted",
      decidedAt: today,
      updatedAt: new Date(),
      updatedBy: ACTOR,
    })
    .where(eq(bids.id, winnerId));
  // Mark sibling bids in same package rejected
  if (winnerRow[0].packageId) {
    const siblings = await db
      .select({ id: bids.id })
      .from(bids)
      .where(
        and(
          eq(bids.packageId, winnerRow[0].packageId),
          eq(bids.projectId, projectId),
        ),
      );
    for (const s of siblings) {
      if (s.id === winnerId) continue;
      await db
        .update(bids)
        .set({
          status: "rejected",
          decidedAt: today,
          updatedAt: new Date(),
          updatedBy: ACTOR,
        })
        .where(eq(bids.id, s.id));
    }
    // Mark package awarded
    await db
      .update(bidPackages)
      .set({
        status: "awarded",
        awardedBidId: winnerId,
        awardedAt: today,
        updatedAt: new Date(),
        updatedBy: ACTOR,
      })
      .where(eq(bidPackages.id, winnerRow[0].packageId));
  }
  // Promote winner's work_items specified → approved
  await db
    .update(workItems)
    .set({
      status: "approved",
      updatedAt: new Date(),
      updatedBy: ACTOR,
    })
    .where(
      and(
        eq(workItems.bidId, winnerId),
        eq(workItems.status, "specified"),
      ),
    );
  console.log(`  + awarded ${AWARD_BID_NUMBER} (Maestros del Color)`);
}

// ─────────────────────── main ───────────────────────

async function main() {
  console.log(`Seeding ${PROJECT_NAME}…`);
  const clientId = await findOrCreateClient();
  const projectId = await findOrCreateProject(clientId);
  console.log(`Project ${projectId}`);

  console.log("Rooms…");
  await seedRooms(projectId);

  console.log("Vendors…");
  const vendorMap = await seedVendors();

  console.log("Bid packages…");
  const packageMap = await seedPackages(projectId);

  console.log("Bids + line items…");
  const bidIdByNumber = await seedBidsAndLines(
    projectId,
    vendorMap,
    packageMap,
  );

  console.log("Award (Paint package)…");
  await awardOne(projectId, bidIdByNumber);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
