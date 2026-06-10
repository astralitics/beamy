import type { Vertical } from "@beamy/shared";
import type { Locale, MessageKey } from "./messages";

/**
 * Per-vertical message overrides, layered on top of the base catalogs by
 * `useT`. The base copy (in messages.ts / pages.ts / pages2.ts) is the
 * construction vocabulary, so `construction` overrides nothing. `landscaping`
 * relabels the terms that differ — rooms→areas, materials→plants, etc.
 *
 * Resolution in useT: vertical[locale][key] → vertical.en[key] → base catalog.
 * Only keys that actually change need entries here; everything else falls
 * through to the shared base copy.
 */
type LocaleOverrides = Partial<Record<MessageKey, string>>;
type VerticalOverrides = Partial<Record<Locale, LocaleOverrides>>;

export const verticalMessages: Record<Vertical, VerticalOverrides> = {
  construction: {},
  landscaping: {
    en: {
      // project nav + section labels
      "project_nav.section.property": "Site documentation",
      "project_nav.rooms": "Areas",
      "project_nav.drawings": "Site plans",
      "project_nav.assets": "Installations",
      "project_nav.furniture": "Site furnishings",
      "project_nav.materials": "Plants & materials",
      // page titles
      "rooms.title": "Areas",
      "assets.title": "Installations",
      "furniture.title": "Site furnishings",
      "materials.title": "Plants & materials",
      // shared room/area labels across plan, proposals, intake
      "col.room": "Area",
      "room.fallback": "Area",
      "plan.rooms": "Areas",
      "plan.col.rooms": "Areas",
      "work_item.field.rooms": "Areas",
      "proposals.group.room": "Area",
      "proposal.col.rooms": "Areas",
      "intake.field.room": "Area",
      "intake.no_room": "No area",
      "placeholder.drawings.title": "Site plans",
      // rooms → areas (list, plan, work items)
      "filter.all_rooms": "All areas",
      "rooms.add": "Add area",
      "rooms.add_first": "Add the first area",
      "rooms.empty": "No areas yet.",
      "rooms.empty_filtered": "No areas match these filters.",
      "rooms.open": "Open area",
      "rooms.modal.title": "New area",
      "room.delete": "Delete this area",
      "plan.add_room": "Add area",
      "plan.rooms_lede":
        "Spatial anchor — each area hosts work items, installations, plants, and documents.",
      "plan.rooms_empty_prefix": "No areas yet. Click",
      "plan.remove_room_title": "Remove area",
      "plan.view.rooms": "By area",
      "plan.group.room": "Group by area",
      "work_item.no_rooms_hint":
        "No areas yet — add one in the Areas section below.",
      "work_item.no_rooms_assigned": "No areas assigned.",
      "materials.field.primary_room": "Primary area",
      // assets → installations
      "assets.add": "Add installation",
      "assets.add_first": "Add the first installation",
      "assets.empty": "No installations yet.",
      "assets.empty_filtered": "No installations match these filters.",
      "assets.open": "Open installation",
      "asset.new_title": "New installation",
      "asset.delete_confirm":
        'Delete installation "{name}"? This cannot be undone.',
      "asset.delete_title": "Delete installation",
      "detail.timeline_lede.asset":
        "Work done on this installation, in chronological order.",
      "detail.delete_asset": "Delete this installation",
      "bill.source.asset_event": "Installation event",
      "documents.tag.asset": "installation",
      // furniture → site furnishings
      "furniture.empty": "No site furnishings yet.",
      "furniture.delete_title": "Delete site furnishing",
      // materials → plants & materials (attic stock isn't a landscaping term)
      "materials.attic_stock": "leftover stock",
      "materials.field.attic_stock": "Leftover stock",
      "materials.field.attic_stock_location": "Leftover stock location",
      "assistant.footer":
        "v2 · queries installations, plants, money, activity on demand · results cached per turn",
    },
    "es-MX": {
      "project_nav.section.property": "Documentación del sitio",
      "project_nav.rooms": "Áreas",
      "project_nav.drawings": "Planos del sitio",
      "project_nav.assets": "Instalaciones",
      "project_nav.furniture": "Mobiliario exterior",
      "project_nav.materials": "Plantas y materiales",
      "rooms.title": "Áreas",
      "assets.title": "Instalaciones",
      "furniture.title": "Mobiliario exterior",
      "materials.title": "Plantas y materiales",
      "col.room": "Área",
      "room.fallback": "Área",
      "plan.rooms": "Áreas",
      "plan.col.rooms": "Áreas",
      "work_item.field.rooms": "Áreas",
      "proposals.group.room": "Área",
      "proposal.col.rooms": "Áreas",
      "intake.field.room": "Área",
      "intake.no_room": "Sin área",
      "placeholder.drawings.title": "Planos del sitio",
      "filter.all_rooms": "Todas las áreas",
      "rooms.add": "Agregar área",
      "rooms.add_first": "Agregar la primera área",
      "rooms.empty": "Aún no hay áreas.",
      "rooms.empty_filtered": "Ningún área coincide con los filtros.",
      "rooms.open": "Abrir área",
      "rooms.modal.title": "Nueva área",
      "room.delete": "Eliminar esta área",
      "plan.add_room": "Agregar área",
      "plan.rooms_lede":
        "Ancla espacial — cada área aloja órdenes de trabajo, instalaciones, plantas y documentos.",
      "plan.rooms_empty_prefix": "Aún no hay áreas. Haz clic en",
      "plan.remove_room_title": "Quitar área",
      "plan.view.rooms": "Por área",
      "plan.group.room": "Agrupar por área",
      "work_item.no_rooms_hint":
        "Aún no hay áreas — agrega una en la sección Áreas más abajo.",
      "work_item.no_rooms_assigned": "Sin áreas asignadas.",
      "materials.field.primary_room": "Área principal",
      "assets.add": "Agregar instalación",
      "assets.add_first": "Agregar la primera instalación",
      "assets.empty": "Aún no hay instalaciones.",
      "assets.empty_filtered": "Ninguna instalación coincide con los filtros.",
      "assets.open": "Abrir instalación",
      "asset.new_title": "Nueva instalación",
      "asset.delete_confirm":
        '¿Eliminar la instalación "{name}"? No se puede deshacer.',
      "asset.delete_title": "Eliminar instalación",
      "detail.timeline_lede.asset":
        "Trabajo realizado en esta instalación, en orden cronológico.",
      "detail.delete_asset": "Eliminar esta instalación",
      "bill.source.asset_event": "Evento de instalación",
      "documents.tag.asset": "instalación",
      "furniture.empty": "Aún no hay mobiliario exterior.",
      "furniture.delete_title": "Eliminar mobiliario exterior",
      "materials.attic_stock": "stock sobrante",
      "materials.field.attic_stock": "Stock sobrante",
      "materials.field.attic_stock_location": "Ubicación del stock sobrante",
      "assistant.footer":
        "v2 · consulta instalaciones, plantas, dinero y actividad bajo demanda · resultados en caché por turno",
    },
  },
};
