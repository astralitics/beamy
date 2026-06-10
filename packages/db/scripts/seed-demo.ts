/**
 * Seed two demo tenants with realistic sample data so the app is fun to click
 * through — one construction workspace and one landscaping workspace, each with
 * clients, vendors, services, and a few projects (rooms/areas + work items).
 *
 * Targets the two orgs the dev/superuser can switch between:
 *   - Dev Workspace (construction)        00000000-…-000000000010
 *   - Green Valley Landscaping (landscaping) 00000000-…-000000000020
 *
 * Idempotent: every row is tagged `demo-seed`; a re-run deletes the prior demo
 * rows (projects cascade-delete their rooms + work items) before re-inserting,
 * so it never duplicates and never touches non-demo data (e.g. Polanco).
 *
 * Run with `pnpm --filter @beamy/db seed-demo`.
 */
import { and, arrayContains, eq, inArray } from "drizzle-orm";
import {
  clients,
  getDb,
  projects,
  rooms,
  services,
  vendors,
  workItems,
} from "../src/index";

const TAG = "demo-seed";
const money = (n: number) => n.toFixed(2);

type ClientSeed = { name: string; contact: string; address: string };
type VendorSeed = {
  name: string;
  trade: string;
  contact: string;
  email: string;
  rate: number;
};
type ServiceSeed = {
  name: string;
  unit: "hour" | "day" | "project" | "retainer" | "unit";
  rate: number;
  description: string;
};
type RoomSeed = { name: string; roomType: string; floor?: string; area?: number };
type ItemSeed = {
  description: string;
  trade: string;
  qty: number;
  unit: string;
  unitPrice: number;
  status:
    | "specified"
    | "approved"
    | "scheduled"
    | "in_progress"
    | "done";
};
type ProjectSeed = {
  name: string;
  type: string;
  status: "lead" | "active" | "on_hold" | "completed";
  client: string;
  address: string;
  contract: number | null;
  startedAt: string | null;
  rooms: RoomSeed[];
  items: ItemSeed[];
};
type Tenant = {
  orgId: string;
  ownerUserId: string;
  currency: string;
  clients: ClientSeed[];
  vendors: VendorSeed[];
  services: ServiceSeed[];
  projects: ProjectSeed[];
};

const CONSTRUCTION: Tenant = {
  orgId: "00000000-0000-0000-0000-000000000010",
  ownerUserId: "00000000-0000-0000-0000-000000000001",
  currency: "USD",
  clients: [
    { name: "Anderson Family", contact: "Mark Anderson", address: "412 Oakmont Dr, Austin, TX" },
    { name: "Brightwave Offices LLC", contact: "Priya Nair", address: "900 Congress Ave, Suite 1200, Austin, TX" },
    { name: "Marisol Hospitality Group", contact: "Carlos Vega", address: "55 Rainey St, Austin, TX" },
  ],
  vendors: [
    { name: "Lone Star Electric", trade: "electrical", contact: "Dwayne Ruiz", email: "ops@lonestarelectric.com", rate: 95 },
    { name: "ClearFlow Plumbing", trade: "plumbing", contact: "Sofia Reyes", email: "dispatch@clearflow.com", rate: 110 },
    { name: "Hill Country Drywall", trade: "drywall", contact: "Beto Marín", email: "hello@hcdrywall.com", rate: 65 },
    { name: "Apex Tile & Stone", trade: "tile", contact: "Grace Lim", email: "info@apextile.com", rate: 80 },
    { name: "Precision Painters", trade: "painting", contact: "Owen Patel", email: "book@precisionpaint.co", rate: 55 },
  ],
  services: [
    { name: "Design consultation", unit: "project", rate: 1500, description: "Initial scope + concept session with the client." },
    { name: "Permit expediting", unit: "project", rate: 850, description: "Filing and shepherding city permits." },
    { name: "Construction management", unit: "day", rate: 1200, description: "On-site supervision and trade coordination." },
    { name: "Final punch walkthrough", unit: "project", rate: 600, description: "Closeout inspection + punch list." },
  ],
  projects: [
    {
      name: "Anderson Kitchen Remodel",
      type: "residential_renovation",
      status: "active",
      client: "Anderson Family",
      address: "412 Oakmont Dr, Austin, TX",
      contract: 84000,
      startedAt: "2026-04-15",
      rooms: [
        { name: "Kitchen", roomType: "kitchen", floor: "1", area: 28 },
        { name: "Powder Room", roomType: "powder", floor: "1", area: 4 },
        { name: "Pantry", roomType: "other", floor: "1", area: 6 },
      ],
      items: [
        { description: "Demo existing cabinets + countertops", trade: "drywall", qty: 1, unit: "lot", unitPrice: 3200, status: "done" },
        { description: "Rough-in electrical for island + under-cabinet", trade: "electrical", qty: 1, unit: "lot", unitPrice: 4800, status: "approved" },
        { description: "Install quartz countertops", trade: "tile", qty: 42, unit: "sq ft", unitPrice: 78, status: "scheduled" },
        { description: "Tile backsplash", trade: "tile", qty: 36, unit: "sq ft", unitPrice: 22, status: "specified" },
        { description: "Paint walls + trim", trade: "painting", qty: 1, unit: "lot", unitPrice: 2600, status: "specified" },
      ],
    },
    {
      name: "Brightwave Suite 1200 Fit-Out",
      type: "commercial_fitout",
      status: "active",
      client: "Brightwave Offices LLC",
      address: "900 Congress Ave, Suite 1200, Austin, TX",
      contract: 240000,
      startedAt: "2026-03-02",
      rooms: [
        { name: "Open Workspace", roomType: "office", floor: "12", area: 180 },
        { name: "Conference Room", roomType: "office", floor: "12", area: 32 },
        { name: "Kitchenette", roomType: "kitchen", floor: "12", area: 14 },
      ],
      items: [
        { description: "Metal stud framing for partitions", trade: "framing", qty: 320, unit: "lin ft", unitPrice: 18, status: "done" },
        { description: "Hang + finish drywall", trade: "drywall", qty: 4200, unit: "sq ft", unitPrice: 3.1, status: "in_progress" },
        { description: "Power + data drops", trade: "electrical", qty: 48, unit: "ea", unitPrice: 145, status: "approved" },
        { description: "Luxury vinyl plank flooring", trade: "flooring", qty: 2100, unit: "sq ft", unitPrice: 6.5, status: "specified" },
      ],
    },
    {
      name: "Marisol Rainey St Buildout",
      type: "commercial_new",
      status: "lead",
      client: "Marisol Hospitality Group",
      address: "55 Rainey St, Austin, TX",
      contract: null,
      startedAt: null,
      rooms: [
        { name: "Dining Room", roomType: "dining", floor: "1", area: 90 },
        { name: "Kitchen", roomType: "kitchen", floor: "1", area: 40 },
        { name: "Bar", roomType: "other", floor: "1", area: 22 },
      ],
      items: [
        { description: "Site survey + feasibility", trade: "general_contractor", qty: 1, unit: "lot", unitPrice: 4500, status: "specified" },
      ],
    },
  ],
};

const LANDSCAPING: Tenant = {
  orgId: "00000000-0000-0000-0000-000000000020",
  ownerUserId: "00000000-0000-0000-0000-000000000002",
  currency: "USD",
  clients: [
    { name: "Riverside HOA", contact: "Janet Holloway", address: "Riverside Community, Round Rock, TX" },
    { name: "The Hutchins Residence", contact: "Tom Hutchins", address: "78 Cypress Bend, Westlake, TX" },
    { name: "Cedar Park Parks Dept", contact: "Dana Reyes", address: "600 N Bell Blvd, Cedar Park, TX" },
  ],
  vendors: [
    { name: "GreenScape Irrigation", trade: "irrigation", contact: "Hector Salas", email: "service@greenscape.com", rate: 85 },
    { name: "StoneWorks Hardscaping", trade: "hardscaping", contact: "Mia Donnelly", email: "build@stoneworks.co", rate: 95 },
    { name: "Canopy Tree Service", trade: "tree_service", contact: "Raj Mehta", email: "crew@canopytree.com", rate: 120 },
    { name: "EverGreen Lawn Care", trade: "lawn_care", contact: "Luke Branson", email: "hello@evergreenlawn.com", rate: 48 },
    { name: "Native Roots Planting", trade: "planting", contact: "Ana Solís", email: "plant@nativeroots.com", rate: 60 },
  ],
  services: [
    { name: "Landscape design", unit: "project", rate: 2200, description: "Site plan, planting palette, and 3D concept." },
    { name: "Seasonal cleanup", unit: "project", rate: 480, description: "Leaf removal, bed edging, and pruning." },
    { name: "Irrigation audit", unit: "project", rate: 350, description: "Zone-by-zone efficiency + leak check." },
    { name: "Monthly maintenance", unit: "retainer", rate: 300, description: "Mowing, trimming, and bed care, monthly." },
  ],
  projects: [
    {
      name: "Hutchins Backyard Redesign",
      type: "residential_landscape",
      status: "active",
      client: "The Hutchins Residence",
      address: "78 Cypress Bend, Westlake, TX",
      contract: 62000,
      startedAt: "2026-05-01",
      rooms: [
        { name: "Backyard", roomType: "backyard", area: 320 },
        { name: "Patio", roomType: "patio", area: 48 },
        { name: "Perennial Bed", roomType: "garden_bed", area: 36 },
        { name: "Zone 3 — Drip", roomType: "irrigation_zone" },
      ],
      items: [
        { description: "Grade + prep backyard for drainage", trade: "hardscaping", qty: 320, unit: "sq ft", unitPrice: 6, status: "done" },
        { description: "Lay flagstone patio", trade: "hardscaping", qty: 48, unit: "sq ft", unitPrice: 34, status: "in_progress" },
        { description: "Install drip irrigation zones", trade: "irrigation", qty: 4, unit: "zone", unitPrice: 650, status: "approved" },
        { description: "Plant perennial beds + shrubs", trade: "planting", qty: 36, unit: "ea", unitPrice: 42, status: "scheduled" },
        { description: "Lay sod — rear lawn", trade: "lawn_care", qty: 1800, unit: "sq ft", unitPrice: 1.2, status: "specified" },
      ],
    },
    {
      name: "Riverside Common Areas Refresh",
      type: "landscape_maintenance",
      status: "active",
      client: "Riverside HOA",
      address: "Riverside Community, Round Rock, TX",
      contract: 28000,
      startedAt: "2026-04-20",
      rooms: [
        { name: "Front Entrance", roomType: "front_yard", area: 140 },
        { name: "Common Lawn", roomType: "lawn", area: 900 },
        { name: "Walking Path", roomType: "walkway", area: 60 },
      ],
      items: [
        { description: "Renovate common lawn — aerate + overseed", trade: "lawn_care", qty: 900, unit: "sq ft", unitPrice: 0.9, status: "in_progress" },
        { description: "Refresh mulch in all beds", trade: "planting", qty: 18, unit: "cu yd", unitPrice: 55, status: "approved" },
        { description: "Crown-raise + trim entrance oaks", trade: "tree_service", qty: 6, unit: "ea", unitPrice: 180, status: "scheduled" },
      ],
    },
    {
      name: "Cedar Park Pollinator Garden",
      type: "garden_design",
      status: "lead",
      client: "Cedar Park Parks Dept",
      address: "600 N Bell Blvd, Cedar Park, TX",
      contract: null,
      startedAt: null,
      rooms: [
        { name: "Pollinator Bed", roomType: "planting_bed", area: 220 },
        { name: "Wildflower Strip", roomType: "garden_bed", area: 80 },
      ],
      items: [
        { description: "Native pollinator planting plan", trade: "planting", qty: 1, unit: "lot", unitPrice: 1800, status: "specified" },
      ],
    },
  ],
};

async function seedTenant(t: Tenant, label: string) {
  const db = getDb();
  const actor = `user:${t.ownerUserId}`;

  // ── idempotency: remove prior demo rows for this org ──
  const priorProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.orgId, t.orgId), arrayContains(projects.tags, [TAG])));
  const priorIds = priorProjects.map((p) => p.id);
  if (priorIds.length) {
    await db.delete(workItems).where(inArray(workItems.projectId, priorIds));
    await db.delete(rooms).where(inArray(rooms.projectId, priorIds));
    await db.delete(projects).where(inArray(projects.id, priorIds));
  }
  await db
    .delete(clients)
    .where(and(eq(clients.orgId, t.orgId), arrayContains(clients.tags, [TAG])));
  await db
    .delete(vendors)
    .where(and(eq(vendors.orgId, t.orgId), arrayContains(vendors.tags, [TAG])));
  await db
    .delete(services)
    .where(and(eq(services.orgId, t.orgId), arrayContains(services.tags, [TAG])));

  // ── clients ──
  const clientId = new Map<string, string>();
  for (const c of t.clients) {
    const [row] = await db
      .insert(clients)
      .values({
        orgId: t.orgId,
        name: c.name,
        primaryContact: c.contact,
        address: c.address,
        tags: [TAG],
        createdBy: actor,
        updatedBy: actor,
      })
      .returning({ id: clients.id });
    clientId.set(c.name, row!.id);
  }

  // ── vendors (keyed by trade for work-item assignment) ──
  const vendorByTrade = new Map<string, string>();
  for (const v of t.vendors) {
    const [row] = await db
      .insert(vendors)
      .values({
        orgId: t.orgId,
        name: v.name,
        trade: v.trade,
        primaryContact: v.contact,
        email: v.email,
        billingUnit: "hour",
        defaultRateAmount: money(v.rate),
        defaultRateCurrency: t.currency,
        tags: [TAG],
        createdBy: actor,
        updatedBy: actor,
      })
      .returning({ id: vendors.id });
    if (!vendorByTrade.has(v.trade)) vendorByTrade.set(v.trade, row!.id);
  }

  // ── services ──
  for (const s of t.services) {
    await db.insert(services).values({
      orgId: t.orgId,
      name: s.name,
      description: s.description,
      billingUnit: s.unit,
      defaultRateAmount: money(s.rate),
      defaultRateCurrency: t.currency,
      tags: [TAG],
      createdBy: actor,
      updatedBy: actor,
    });
  }

  // ── projects → rooms → work items ──
  for (const p of t.projects) {
    const [proj] = await db
      .insert(projects)
      .values({
        orgId: t.orgId,
        ownerUserId: t.ownerUserId,
        clientId: clientId.get(p.client) ?? null,
        name: p.name,
        projectType: p.type as never,
        status: p.status,
        address: p.address,
        contractAmount: p.contract === null ? null : money(p.contract),
        contractCurrency: p.contract === null ? null : t.currency,
        startedAt: p.startedAt,
        tags: [TAG],
        createdBy: actor,
        updatedBy: actor,
      })
      .returning({ id: projects.id });
    const projectId = proj!.id;

    for (const r of p.rooms) {
      await db.insert(rooms).values({
        orgId: t.orgId,
        projectId,
        name: r.name,
        roomType: r.roomType as never,
        floor: r.floor ?? null,
        floorAreaSqM: r.area === undefined ? null : money(r.area),
        createdBy: actor,
        updatedBy: actor,
      });
    }

    for (const it of p.items) {
      const total = it.qty * it.unitPrice;
      await db.insert(workItems).values({
        orgId: t.orgId,
        projectId,
        vendorId: vendorByTrade.get(it.trade) ?? null,
        trade: it.trade,
        description: it.description,
        qty: money(it.qty),
        unit: it.unit,
        unitPriceAmount: money(it.unitPrice),
        unitPriceCurrency: t.currency,
        totalAmount: money(total),
        totalCurrency: t.currency,
        status: it.status,
        createdBy: actor,
        updatedBy: actor,
      });
    }
  }

  console.log(
    `[seed-demo] ${label}: ${t.clients.length} clients, ${t.vendors.length} vendors, ${t.services.length} services, ${t.projects.length} projects (${t.projects.reduce((n, p) => n + p.rooms.length, 0)} rooms, ${t.projects.reduce((n, p) => n + p.items.length, 0)} work items)`,
  );
}

async function main() {
  await seedTenant(CONSTRUCTION, "Dev Workspace (construction)");
  await seedTenant(LANDSCAPING, "Green Valley Landscaping (landscaping)");
  console.log("[seed-demo] done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-demo] failed:", err);
    process.exit(1);
  });
