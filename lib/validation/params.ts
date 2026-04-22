const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateId(id: string) {
  const value = String(id || "").trim();
  if (!UUID_RE.test(value)) {
    return { ok: false as const, error: "Invalid ID" };
  }
  return { ok: true as const, value };
}

export function validateDate(date: string) {
  const value = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false as const, error: "Invalid date format. Use YYYY-MM-DD." };
  }
  return { ok: true as const, value };
}
