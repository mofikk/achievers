export function parseCSV(text: string) {
  const input = String(text || "").trim();
  if (!input) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header || "").trim());
  const dataRows = rows.slice(1).filter((cols) =>
    cols.some((value) => String(value || "").trim() !== "")
  );

  return dataRows.map((cols) => {
    const out: Record<string, string> = {};
    headers.forEach((header, index) => {
      out[header] = String(cols[index] || "").trim();
    });
    return out;
  });
}
