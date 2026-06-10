import { z } from "zod";
import type { RoomType, ProjectType } from "./projects";
import type { MaterialCategory } from "./materials";
import type { AssetCategory } from "./assets";
import type { FurnitureCategory } from "./furniture";

/**
 * Vertical = the product flavor a workspace runs as. Beamy ships one codebase,
 * one schema, two verticals: the original construction/remodeling product and a
 * landscaping spin-off. `orgs.vertical` is the single source of truth (set when
 * an invite provisions a workspace); everything domain-specific — terminology,
 * nav copy, and which enum values the UI offers — is config-discriminated off it.
 *
 * The DB columns are widened unions (a room can be a "kitchen" OR a "garden_bed");
 * the *_BY_VERTICAL maps below pick which slice each vertical actually offers in
 * dropdowns. New rows are still validated against the full union, so data created
 * under one vertical never fails to read under another.
 */
export const VERTICALS = ["construction", "landscaping"] as const;
export const verticalSchema = z.enum(VERTICALS);
export type Vertical = z.infer<typeof verticalSchema>;

export const VERTICAL_LABELS: Record<Vertical, string> = {
  construction: "Construction & Remodeling",
  landscaping: "Landscaping",
};

// ─────────────────── enum option sets per vertical ───────────────────

export const ROOM_TYPES_BY_VERTICAL: Record<Vertical, RoomType[]> = {
  construction: [
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
  ],
  landscaping: [
    "front_yard",
    "backyard",
    "side_yard",
    "garden_bed",
    "planting_bed",
    "lawn",
    "patio",
    "deck",
    "driveway",
    "walkway",
    "pool_area",
    "irrigation_zone",
    "exterior",
    "other",
  ],
};

export const PROJECT_TYPES_BY_VERTICAL: Record<Vertical, ProjectType[]> = {
  construction: [
    "residential_renovation",
    "residential_new",
    "commercial_fitout",
    "commercial_new",
    "interior_design",
    "tenant_improvement",
    "other",
  ],
  landscaping: [
    "residential_landscape",
    "commercial_landscape",
    "hardscape_install",
    "irrigation_install",
    "garden_design",
    "lawn_renovation",
    "landscape_maintenance",
    "other",
  ],
};

export const MATERIAL_CATEGORIES_BY_VERTICAL: Record<
  Vertical,
  MaterialCategory[]
> = {
  construction: [
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
  ],
  landscaping: [
    "plant",
    "tree",
    "shrub",
    "sod",
    "mulch",
    "soil",
    "gravel",
    "stone",
    "paver",
    "edging",
    "fertilizer",
    "other",
  ],
};

export const ASSET_CATEGORIES_BY_VERTICAL: Record<Vertical, AssetCategory[]> = {
  construction: [
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
  ],
  landscaping: [
    "irrigation",
    "drainage",
    "hardscape",
    "water_feature",
    "pump",
    "lighting",
    "equipment",
    "structural",
    "other",
  ],
};

export const FURNITURE_CATEGORIES_BY_VERTICAL: Record<
  Vertical,
  FurnitureCategory[]
> = {
  construction: [
    "seating",
    "tables",
    "storage",
    "beds",
    "lighting",
    "rugs",
    "art",
    "mirrors",
    "decor",
    "other",
  ],
  landscaping: [
    "planters",
    "outdoor_seating",
    "tables",
    "fire_features",
    "shade_structures",
    "outdoor_lighting",
    "decor",
    "other",
  ],
};

/**
 * Suggested vendor trades per vertical. The DB column is free text — these only
 * seed the dropdown, firms can type anything. Keep alphabetized within a vertical.
 */
export const TRADES_BY_VERTICAL: Record<Vertical, readonly string[]> = {
  construction: [
    "cabinetry",
    "carpentry",
    "cleaning",
    "concrete",
    "demolition",
    "drywall",
    "electrical",
    "excavation",
    "fire_protection",
    "flooring",
    "framing",
    "garage_door",
    "general_contractor",
    "glazing",
    "hvac",
    "insulation",
    "landscape",
    "masonry",
    "millwork",
    "painting",
    "plumbing",
    "roofing",
    "security",
    "siding",
    "solar",
    "tile",
    "windows_doors",
    "other",
  ],
  landscaping: [
    "cleaning",
    "drainage",
    "excavation",
    "fencing",
    "general_contractor",
    "grading",
    "hardscaping",
    "irrigation",
    "landscape",
    "landscape_lighting",
    "lawn_care",
    "masonry",
    "planting",
    "sod_install",
    "tree_service",
    "other",
  ],
};
