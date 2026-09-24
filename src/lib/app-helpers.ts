import type { View } from "@/lib/app-types";

export function goTo(view: View) {
  window.location.hash = encodeURIComponent(view);
}

export function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function formatIcsDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDatetimeLocal(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
export function repairCzechMojibake(value: string) {
  const replacements: Record<string, string> = {
    "√°": "á",
    "√Å": "Á",
    "ƒç": "č",
    "ƒå": "Č",
    "ƒè": "ď",
    "ƒé": "Ď",
    "√©": "é",
    "√â": "É",
    "ƒõ": "ě",
    "ƒö": "Ě",
    "√≠": "í",
    "√ç": "Í",
    "≈à": "ň",
    "≈á": "Ň",
    "√≥": "ó",
    "√ì": "Ó",
    "≈ô": "ř",
    "≈ò": "Ř",
    "≈°": "š",
    "≈†": "Š",
    "≈•": "ť",
    "≈§": "Ť",
    "√∫": "ú",
    "√ö": "Ú",
    "≈Ø": "ů",
    "≈Æ": "Ů",
    "√Ω": "ý",
    "√ù": "Ý",
    "≈æ": "ž",
    "≈Ω": "Ž",
  };
  return Object.entries(replacements).reduce(
    (text, [broken, fixed]) => text.replaceAll(broken, fixed),
    value,
  );
}

export function parseCsvRow(row: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const next = row[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function utf16LeBlob(content: string, type: string) {
  const bytes = new Uint8Array(content.length * 2 + 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    bytes[index * 2 + 2] = code & 0xff;
    bytes[index * 2 + 3] = code >> 8;
  }
  return new Blob([bytes], { type });
}
export function downloadCsv(rows: string[], filename: string) {
  const parsedRows = rows.map((row) =>
    parseCsvRow(row).map((cell) => repairCzechMojibake(cell)),
  );
  const columnCount = Math.max(1, ...parsedRows.map((row) => row.length));
  const dataRowCount = Math.max(1, parsedRows.length);
  const filterRange = `R3C1:R${dataRowCount + 2}C${columnCount}`;
  const generatedAt = new Date().toLocaleString("cs-CZ");
  const tableRows = [
    `<tr class="export-title"><td colspan="${columnCount}">NEOVIA export, ${escapeHtml(generatedAt)}</td></tr>`,
    `<tr class="export-filter"><td colspan="${columnCount}">Filtr a hledání: v Excelu použij šipky v hlavičce tabulky nebo zkratku Ctrl+F. AutoFilter je připravený pro celý rozsah dat.</td></tr>`,
    ...parsedRows.map((row, rowIndex) => {
      const tag = rowIndex === 0 ? "th" : "td";
      return `<tr>${Array.from({ length: columnCount }, (_, cellIndex) => {
        const cell = row[cellIndex] || "";
        return `<${tag}>${escapeHtml(cell)}</${tag}>`;
      }).join("")}</tr>`;
    }),
  ].join("");
  const workbook = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-16" />
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook>
<x:ExcelWorksheets>
<x:ExcelWorksheet>
<x:Name>Export</x:Name>
<x:WorksheetOptions>
<x:Selected/>
<x:FreezePanes/>
<x:FrozenNoSplit/>
<x:SplitHorizontal>3</x:SplitHorizontal>
<x:TopRowBottomPane>3</x:TopRowBottomPane>
<x:ActivePane>2</x:ActivePane>
<x:AutoFilter x:Range="${filterRange}"/>
</x:WorksheetOptions>
</x:ExcelWorksheet>
</x:ExcelWorksheets>
</x:ExcelWorkbook>
</xml><![endif]-->
<style>
body { font-family: Arial, sans-serif; }
table { border-collapse: collapse; }
th, td {
  border: 1px solid #9fb8b7;
  padding: 6px 8px;
  vertical-align: top;
  white-space: nowrap;
  mso-number-format: "\\@";
}
th {
  background: #0b7d70;
  color: #ffffff;
  font-weight: 700;
}
.export-title td {
  background: #e6f4f1;
  color: #173739;
  font-weight: 700;
  font-size: 13px;
}
.export-filter td {
  background: #fff6df;
  color: #6a5114;
  font-weight: 700;
}
</style>
</head>
<body><table>${tableRows}</table></body></html>`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    utf16LeBlob(workbook, "application/vnd.ms-excel;charset=utf-16le"),
  );
  link.download = filename.replace(/\.csv$/i, ".xls");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
