import { parseCSV } from "../../utils/csv";

export async function parseImportRows(request: Request) {
  const body = await request.json().catch(() => ({}));
  const csvText = typeof (body as any)?.csv === "string" ? (body as any).csv : "";
  return parseCSV(csvText);
}

