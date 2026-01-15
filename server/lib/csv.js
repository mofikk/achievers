function parseCSV(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("CSV content is empty.");
  }

  const rows = [];
  let current = "";
  let inQuotes = false;
  const lines = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      i += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
      continue;
    }

    if (char !== "\r") {
      current += char;
    }
  }
  if (current) lines.push(current);

  lines.forEach((line) => {
    const fields = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === "\"" && quoted && next === "\"") {
        field += "\"";
        i += 1;
        continue;
      }
      if (char === "\"") {
        quoted = !quoted;
        continue;
      }
      if (char === "," && !quoted) {
        fields.push(field.trim());
        field = "";
        continue;
      }
      field += char;
    }
    fields.push(field.trim());
    rows.push(fields);
  });

  if (!rows.length) {
    throw new Error("CSV content is empty.");
  }

  const headers = rows[0].map((header) => header.trim());
  if (!headers.every((header) => header)) {
    throw new Error("CSV header row is required.");
  }

  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] !== undefined ? row[index] : "";
    });
    return obj;
  });
}

module.exports = { parseCSV };
