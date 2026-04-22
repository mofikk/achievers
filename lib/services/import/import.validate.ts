export type ImportType = "players" | "payments" | "attendance" | "stats" | "visitors" | "notes";

const SUPPORTED_TYPES = new Set<ImportType>([
  "players",
  "payments",
  "attendance",
  "stats",
  "visitors",
  "notes"
]);

export const allowedPositions = new Set([
  "FW", "CM", "CDM", "CAM", "LM", "RM", "CB", "RB", "LB", "LW", "RW", "GK", "DF", "MF"
]);

export function isSupportedImportType(type: string): type is ImportType {
  return SUPPORTED_TYPES.has(type as ImportType);
}

export function toBoolean(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "present" || raw === "paid";
}

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

