/**
 * Locale-aware labels for the shared domain enums.
 *
 * The English label maps live in `@beamy/shared` (`*_LABELS`). This module
 * adds the es-MX side and exposes `useLabels()` — a hook returning typed
 * resolver functions that pick EN or es-MX based on the active locale.
 *
 * Why here and not in `messages.ts`: these are ~150 enum values keyed by
 * domain unions, so co-locating them with their `@beamy/shared` types keeps
 * them exhaustively type-checked (a missing value is a compile error) and
 * keeps the `t()` catalog focused on free-form UI copy.
 *
 * Usage:
 *   const L = useLabels();
 *   <Pill>{L.bidStatus(bid.status)}</Pill>
 */
import {
  BID_STATUS_LABELS,
  BID_FLAG_LABELS,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_DEPENDENCY_KIND_LABELS,
  ASSET_CATEGORY_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_EVENT_TYPE_LABELS,
  FURNITURE_CATEGORY_LABELS,
  FURNITURE_STATUS_LABELS,
  FURNITURE_EVENT_TYPE_LABELS,
  MATERIAL_CATEGORY_LABELS,
  MATERIAL_UNIT_LABELS,
  ROOM_TYPE_LABELS,
  PROJECT_TYPE_LABELS,
  PROJECT_PHASE_LABELS,
  PROJECT_SECTION_LABELS,
  CHANGE_ORDER_STATUS_LABELS,
  CHANGE_ORDER_LINE_KIND_LABELS,
  PROPOSAL_STATUS_LABELS,
  BILL_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  type BidStatus,
  type WorkItemStatus,
  type WorkItemDependencyKind,
  type AssetCategory,
  type AssetStatus,
  type AssetEventType,
  type FurnitureCategory,
  type FurnitureStatus,
  type FurnitureEventType,
  type MaterialCategory,
  type MaterialUnit,
  type RoomType,
  type ProjectType,
  type ProjectPhase,
  type ProjectSection,
  type ChangeOrderStatus,
  type ChangeOrderLineKind,
  type ProposalStatus,
  type BillStatus,
  type InvoiceStatus,
} from "@beamy/shared";
import { useLocale } from "./locale-context";

// ── es-MX maps (Mexican construction Spanish) ────────────────────

const ES_BID_STATUS: Record<BidStatus, string> = {
  received: "Recibida",
  comparing: "Comparando",
  accepted: "En curso",
  completed: "Completada",
  rejected: "Rechazada",
  expired: "Vencida",
};

const ES_BID_FLAG: Record<string, string> = {
  "validity-likely-expired": "Vigencia probablemente vencida",
  "freight-not-included": "Flete no incluido",
  "deposit-required": "Requiere anticipo",
  "missing-cotizacion-only-credentials": "Faltan datos (solo cotización)",
};

const ES_WORK_ITEM_STATUS: Record<WorkItemStatus, string> = {
  specified: "Especificada",
  approved: "Aprobada",
  scheduled: "Programada",
  in_progress: "En progreso",
  done: "Terminada",
  accepted: "Aceptada",
  cancelled: "Cancelada",
};

const ES_WORK_ITEM_DEP_KIND: Record<WorkItemDependencyKind, string> = {
  finish_to_start: "Fin → inicio",
  start_to_start: "Inicio → inicio",
  finish_to_finish: "Fin → fin",
};

const ES_ASSET_CATEGORY: Record<AssetCategory, string> = {
  appliance: "Electrodoméstico",
  fixture: "Accesorio fijo",
  equipment: "Equipo",
  hvac: "Climatización",
  plumbing: "Plomería",
  electrical: "Eléctrico",
  lighting: "Iluminación",
  smart_home: "Casa inteligente",
  hardware: "Herrajes",
  structural: "Estructural",
  other: "Otro",
};

const ES_ASSET_STATUS: Record<AssetStatus, string> = {
  planned: "Planeado",
  installed: "Instalado",
  under_repair: "En reparación",
  removed: "Retirado",
  retired: "Dado de baja",
};

const ES_ASSET_EVENT: Record<AssetEventType, string> = {
  installed: "Instalado",
  serviced: "Mantenimiento",
  repaired: "Reparado",
  inspected: "Inspeccionado",
  warranty_claimed: "Garantía reclamada",
  removed: "Retirado",
  reinstalled: "Reinstalado",
  retired: "Dado de baja",
  note: "Nota",
};

const ES_FURNITURE_CATEGORY: Record<FurnitureCategory, string> = {
  seating: "Asientos",
  tables: "Mesas",
  storage: "Almacenaje",
  beds: "Camas",
  lighting: "Iluminación",
  rugs: "Tapetes",
  art: "Arte",
  mirrors: "Espejos",
  decor: "Decoración",
  other: "Otro",
};

const ES_FURNITURE_STATUS: Record<FurnitureStatus, string> = {
  planned: "Planeado",
  selected: "Seleccionado",
  ordered: "Pedido",
  delivered: "Entregado",
  placed: "Colocado",
  returned: "Devuelto",
  retired: "Dado de baja",
};

const ES_FURNITURE_EVENT: Record<FurnitureEventType, string> = {
  selected: "Seleccionado",
  ordered: "Pedido",
  delivered: "Entregado",
  placed: "Colocado",
  moved: "Movido",
  cleaned: "Limpiado",
  reupholstered: "Retapizado",
  repaired: "Reparado",
  returned: "Devuelto",
  retired: "Dado de baja",
  note: "Nota",
};

const ES_MATERIAL_CATEGORY: Record<MaterialCategory, string> = {
  paint: "Pintura",
  tile: "Azulejo",
  flooring: "Piso",
  stone: "Piedra",
  wood: "Madera",
  drywall: "Tablaroca",
  insulation: "Aislante",
  cabinetry: "Carpintería",
  countertop: "Cubierta",
  grout: "Boquilla",
  sealant: "Sellador",
  adhesive: "Adhesivo",
  fastener: "Fijación",
  other: "Otro",
};

const ES_MATERIAL_UNIT: Record<MaterialUnit, string> = {
  gallon: "gal",
  quart: "qt",
  sq_ft: "ft²",
  sq_m: "m²",
  linear_ft: "ft lin",
  linear_m: "m lin",
  each: "pza",
  lb: "lb",
  kg: "kg",
  box: "caja",
  pallet: "tarima",
  other: "unidad",
};

const ES_ROOM_TYPE: Record<RoomType, string> = {
  kitchen: "Cocina",
  primary_bath: "Baño principal",
  bath: "Baño",
  powder: "Medio baño",
  living: "Sala",
  dining: "Comedor",
  family: "Sala familiar",
  bedroom: "Recámara",
  primary_bedroom: "Recámara principal",
  office: "Oficina",
  mudroom: "Vestíbulo",
  laundry: "Lavandería",
  garage: "Cochera",
  basement: "Sótano",
  attic: "Ático",
  mechanical: "Cuarto de máquinas",
  hallway: "Pasillo",
  stairs: "Escaleras",
  exterior: "Exterior",
  yard: "Jardín",
  other: "Otro",
};

const ES_PROJECT_TYPE: Record<ProjectType, string> = {
  residential_renovation: "Remodelación residencial",
  residential_new: "Obra nueva residencial",
  commercial_fitout: "Adecuación comercial",
  commercial_new: "Obra nueva comercial",
  interior_design: "Diseño de interiores",
  tenant_improvement: "Mejora de local",
  other: "Otro",
};

const ES_PROJECT_PHASE: Record<ProjectPhase, string> = {
  onboarding: "Alta",
  preparing_proposal: "Preparando propuesta",
  proposal_sent: "Propuesta enviada",
  proposal_approved: "Propuesta aprobada",
  work_ongoing: "Obra en curso",
  work_in_review: "Obra en revisión",
  completed: "Completado",
};

const ES_PROJECT_SECTION: Record<ProjectSection, string> = {
  property: "Documentación del inmueble",
  work_proposal: "Propuesta de obra",
  execution: "Ejecución",
};

const ES_CHANGE_ORDER_STATUS: Record<ChangeOrderStatus, string> = {
  drafted: "Borrador",
  sent: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  void: "Anulada",
};

const ES_CHANGE_ORDER_KIND: Record<ChangeOrderLineKind, string> = {
  add: "Agregar",
  modify: "Modificar",
  remove: "Quitar",
};

const ES_PROPOSAL_STATUS: Record<ProposalStatus, string> = {
  drafted: "Borrador",
  sent: "Enviada",
  accepted: "Aceptada",
  rejected: "Rechazada",
  superseded: "Reemplazada",
};

const ES_BILL_STATUS: Record<BillStatus, string> = {
  open: "Abierta",
  paid: "Pagada",
  void: "Anulada",
};

const ES_INVOICE_STATUS: Record<InvoiceStatus, string> = {
  draft: "Borrador",
  sent: "Enviada",
  paid: "Pagada",
  void: "Anulada",
};

/** Kebab-case slug → "Sentence case" fallback for unknown bid flags. */
function humanizeSlug(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * `useLabels()` — locale-aware resolvers for the shared domain enums.
 * Each resolver returns the es-MX label when the active locale is Spanish,
 * otherwise the English label from `@beamy/shared`.
 */
export function useLabels() {
  const { locale } = useLocale();
  const es = locale === "es-MX" || locale.startsWith("es");

  const pick =
    <K extends string>(en: Record<K, string>, esMap: Record<K, string>) =>
    (k: K): string =>
      (es ? esMap[k] ?? en[k] : en[k]) ?? String(k);

  return {
    bidStatus: pick(BID_STATUS_LABELS, ES_BID_STATUS),
    bidFlag: (slug: string): string =>
      (es ? ES_BID_FLAG[slug] : BID_FLAG_LABELS[slug]) ?? humanizeSlug(slug),
    workItemStatus: pick(WORK_ITEM_STATUS_LABELS, ES_WORK_ITEM_STATUS),
    workItemDepKind: pick(
      WORK_ITEM_DEPENDENCY_KIND_LABELS,
      ES_WORK_ITEM_DEP_KIND,
    ),
    assetCategory: pick(ASSET_CATEGORY_LABELS, ES_ASSET_CATEGORY),
    assetStatus: pick(ASSET_STATUS_LABELS, ES_ASSET_STATUS),
    assetEvent: pick(ASSET_EVENT_TYPE_LABELS, ES_ASSET_EVENT),
    furnitureCategory: pick(FURNITURE_CATEGORY_LABELS, ES_FURNITURE_CATEGORY),
    furnitureStatus: pick(FURNITURE_STATUS_LABELS, ES_FURNITURE_STATUS),
    furnitureEvent: pick(FURNITURE_EVENT_TYPE_LABELS, ES_FURNITURE_EVENT),
    materialCategory: pick(MATERIAL_CATEGORY_LABELS, ES_MATERIAL_CATEGORY),
    materialUnit: pick(MATERIAL_UNIT_LABELS, ES_MATERIAL_UNIT),
    roomType: pick(ROOM_TYPE_LABELS, ES_ROOM_TYPE),
    projectType: pick(PROJECT_TYPE_LABELS, ES_PROJECT_TYPE),
    projectPhase: pick(PROJECT_PHASE_LABELS, ES_PROJECT_PHASE),
    projectSection: pick(PROJECT_SECTION_LABELS, ES_PROJECT_SECTION),
    changeOrderStatus: pick(CHANGE_ORDER_STATUS_LABELS, ES_CHANGE_ORDER_STATUS),
    changeOrderKind: pick(CHANGE_ORDER_LINE_KIND_LABELS, ES_CHANGE_ORDER_KIND),
    proposalStatus: pick(PROPOSAL_STATUS_LABELS, ES_PROPOSAL_STATUS),
    billStatus: pick(BILL_STATUS_LABELS, ES_BILL_STATUS),
    invoiceStatus: pick(INVOICE_STATUS_LABELS, ES_INVOICE_STATUS),
  };
}
