import { z } from "zod";

/**
 * Project = one client engagement (kitchen reno, ground-up custom, commercial
 * fit-out, full design package). The container under which assets, materials,
 * rooms, drawings, RFIs, change orders, bills, todos all live.
 *
 * The recall demo (M2) runs against this hierarchy:
 *   project → rooms → assets / materials
 *
 * v1 keeps it light: no project_members (per-project ACL deferred per D-3),
 * no project_phases (phase is a soft tag — D-41 — comes later), no
 * substantial_completion_signed_document_id (documents table doesn't exist
 * yet — fills in at M8).
 */

export const projectStatusSchema = z.enum([
  "lead",
  "active",
  "on_hold",
  "completed",
  "archived",
]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectTypeSchema = z.enum([
  "residential_renovation",
  "residential_new",
  "commercial_fitout",
  "commercial_new",
  "interior_design",
  "tenant_improvement",
  "other",
]);
export type ProjectType = z.infer<typeof projectTypeSchema>;

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  residential_renovation: "Residential renovation",
  residential_new: "Residential new build",
  commercial_fitout: "Commercial fit-out",
  commercial_new: "Commercial new build",
  interior_design: "Interior design",
  tenant_improvement: "Tenant improvement",
  other: "Other",
};

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const projectCreateInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    clientId: z.string().uuid().optional(),
    address: z.string().trim().max(500).optional(),
    projectType: projectTypeSchema.default("residential_renovation"),
    contractAmount: moneyAmount.optional(),
    contractCurrency: currencyCode.optional(),
    startedAt: isoDate.optional(),
    notes: z.string().trim().max(10000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  })
  .superRefine((val, ctx) => {
    const hasAmount = val.contractAmount !== undefined;
    const hasCurrency = val.contractCurrency !== undefined;
    if (hasAmount !== hasCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "contractAmount and contractCurrency must be set together",
        path: ["contractAmount"],
      });
    }
  });
export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>;

export const projectUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    clientId: z.string().uuid().nullable().optional(),
    address: z.string().trim().max(500).optional(),
    projectType: projectTypeSchema.optional(),
    contractAmount: moneyAmount.nullable().optional(),
    contractCurrency: currencyCode.nullable().optional(),
    startedAt: isoDate.nullable().optional(),
    substantialCompletionAt: isoDate.nullable().optional(),
    closedOutAt: isoDate.nullable().optional(),
    notes: z.string().trim().max(10000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  }),
});
export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>;

export const projectListInputSchema = z.object({
  status: projectStatusSchema.optional(),
  projectType: projectTypeSchema.optional(),
  clientId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
});
export type ProjectListInput = z.infer<typeof projectListInputSchema>;

export const projectIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type ProjectIdInput = z.infer<typeof projectIdInputSchema>;

// ─────────────────── rooms ───────────────────

export const roomTypeSchema = z.enum([
  "kitchen",
  "primary_bath",
  "bath",
  "powder",
  "living",
  "dining",
  "family",
  "bedroom",
  "primary_bedroom",
  "office",
  "mudroom",
  "laundry",
  "garage",
  "basement",
  "attic",
  "mechanical",
  "hallway",
  "stairs",
  "exterior",
  "yard",
  "other",
]);
export type RoomType = z.infer<typeof roomTypeSchema>;

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  kitchen: "Kitchen",
  primary_bath: "Primary bath",
  bath: "Bath",
  powder: "Powder room",
  living: "Living room",
  dining: "Dining room",
  family: "Family room",
  bedroom: "Bedroom",
  primary_bedroom: "Primary bedroom",
  office: "Office",
  mudroom: "Mudroom",
  laundry: "Laundry",
  garage: "Garage",
  basement: "Basement",
  attic: "Attic",
  mechanical: "Mechanical",
  hallway: "Hallway",
  stairs: "Stairs",
  exterior: "Exterior",
  yard: "Yard",
  other: "Other",
};

export const roomCreateInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
  roomType: roomTypeSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type RoomCreateInput = z.infer<typeof roomCreateInputSchema>;

export const roomUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    roomType: roomTypeSchema.optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
});
export type RoomUpdateInput = z.infer<typeof roomUpdateInputSchema>;

export const roomIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type RoomIdInput = z.infer<typeof roomIdInputSchema>;

export const roomListInputSchema = z.object({
  projectId: z.string().uuid(),
});
export type RoomListInput = z.infer<typeof roomListInputSchema>;
