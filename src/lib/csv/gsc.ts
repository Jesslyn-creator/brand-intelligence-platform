import Papa from "papaparse";

export const GSC_CSV_MAX_BYTES = 1_000_000;
export const GSC_CSV_MAX_DATA_ROWS = 5_000;

export type GscCsvImportContext = {
  market: string;
  language: string;
  sourceFileName?: string | null;
};

export type GscEvidenceDraft = {
  sourceType: "gsc_csv";
  sourceRecordReference: string;
  evidenceText: string;
  sourceDate: string | null;
  sourceUrl: string | null;
  market: string;
  language: string;
  metrics: {
    query: string;
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    position: number | null;
    page: string | null;
    country: string | null;
    device: string | null;
    date: string | null;
  };
};

export type GscCsvValidRow = {
  dataRowNumber: number;
  evidence: GscEvidenceDraft;
  rawPreviewRow: Record<string, string>;
};

export type GscCsvInvalidRow = {
  dataRowNumber: number;
  messages: string[];
  rawPreviewRow: Record<string, string>;
};

export type GscCsvPreviewSummary = {
  totalRows: number;
  validRowCount: number;
  invalidRowCount: number;
};

export type GscCsvPreview = {
  validRows: GscCsvValidRow[];
  invalidRows: GscCsvInvalidRow[];
  summary: GscCsvPreviewSummary;
  fileErrors: string[];
};

type CanonicalHeader = "query" | "clicks" | "impressions" | "ctr" | "position" | "page" | "country" | "device" | "date";
type ParsedRow = Record<string, string>;

const OPTIONAL_HEADERS = new Set<CanonicalHeader>(["clicks", "impressions", "ctr", "position", "page", "country", "device", "date"]);
const INTEGER_PATTERN = /^(0|[1-9]\d*|[1-9]\d{0,2}(,\d{3})+)$/;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function parseGscCsvPreview(csvText: string, context: GscCsvImportContext): GscCsvPreview {
  const fileErrors = validateFileInput(csvText, context);
  if (fileErrors.length) return emptyPreview(fileErrors);

  const headerErrors = validateHeaderRow(csvText);
  if (headerErrors.length) return emptyPreview(headerErrors);

  const parsed = Papa.parse<ParsedRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader
  });

  if (parsed.errors.length) {
    // Stage 2A rejects structural Papa Parse errors at file level. Row-level recovery can be revisited once imports write batches.
    return emptyPreview(parsed.errors.map((error) => `CSV parse error: ${error.message}`));
  }

  const rows = parsed.data.filter((row) => Object.values(row).some((value) => typeof value === "string" && value.trim()));
  if (rows.length === 0) return emptyPreview(["CSV contains no data rows."]);
  if (rows.length > GSC_CSV_MAX_DATA_ROWS) {
    return emptyPreview([`CSV contains ${rows.length} data rows, which exceeds the limit of ${GSC_CSV_MAX_DATA_ROWS}.`]);
  }

  const headers = Object.keys(rows[0] ?? {});
  const headerMap = resolveHeaders(headers);
  if (!headerMap.query) {
    return emptyPreview(["Unsupported GSC CSV: a Query column is required."]);
  }

  const validRows: GscCsvValidRow[] = [];
  const invalidRows: GscCsvInvalidRow[] = [];

  rows.forEach((row, index) => {
    const dataRowNumber = index + 1;
    const rawPreviewRow = sanitizeRawPreviewRow(row);
    const normalized = normalizeRow(row, headerMap, context, dataRowNumber);

    if (normalized.messages.length) {
      invalidRows.push({
        dataRowNumber,
        messages: normalized.messages,
        rawPreviewRow
      });
      return;
    }

    validRows.push({
      dataRowNumber,
      evidence: normalized.evidence,
      rawPreviewRow
    });
  });

  return {
    validRows,
    invalidRows,
    summary: {
      totalRows: rows.length,
      validRowCount: validRows.length,
      invalidRowCount: invalidRows.length
    },
    fileErrors: []
  };
}

export function normalizeGscHeader(header: string): string {
  return normalizeHeader(header);
}

function validateFileInput(csvText: string, context: GscCsvImportContext): string[] {
  const errors: string[] = [];
  if (!csvText.trim()) errors.push("CSV is empty.");
  if (!context.market.trim()) errors.push("market is required.");
  if (!context.language.trim()) errors.push("language is required.");

  const byteCount = new TextEncoder().encode(csvText).byteLength;
  if (byteCount > GSC_CSV_MAX_BYTES) {
    errors.push(`CSV is ${byteCount} bytes, which exceeds the limit of ${GSC_CSV_MAX_BYTES}.`);
  }

  return errors;
}

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function validateHeaderRow(csvText: string): string[] {
  const parsedHeader = Papa.parse<string[]>(csvText, {
    preview: 1,
    skipEmptyLines: true
  });

  if (parsedHeader.errors.length) {
    return parsedHeader.errors.map((error) => `CSV parse error: ${error.message}`);
  }

  const headerRow = parsedHeader.data[0] ?? [];
  const seenHeaders = new Set<string>();
  const duplicatedHeaders = new Set<string>();

  for (const header of headerRow) {
    const normalized = normalizeHeader(header ?? "");
    if (!normalized) continue;
    if (seenHeaders.has(normalized)) duplicatedHeaders.add(normalized);
    seenHeaders.add(normalized);
  }

  return Array.from(duplicatedHeaders).map((header) => `Duplicate normalized header: ${header}.`);
}

function resolveHeaders(headers: string[]): Partial<Record<CanonicalHeader, string>> {
  const resolved: Partial<Record<CanonicalHeader, string>> = {};
  for (const header of headers) {
    if (header === "query") resolved.query = header;
    if (OPTIONAL_HEADERS.has(header as CanonicalHeader)) resolved[header as CanonicalHeader] = header;
  }
  return resolved;
}

function normalizeRow(
  row: ParsedRow,
  headers: Partial<Record<CanonicalHeader, string>>,
  context: GscCsvImportContext,
  dataRowNumber: number
): { evidence: GscEvidenceDraft; messages: string[] } {
  const messages: string[] = [];
  const query = cleanText(valueFor(row, headers.query));
  const page = cleanOptionalText(valueFor(row, headers.page));
  const country = cleanOptionalText(valueFor(row, headers.country));
  const device = cleanOptionalText(valueFor(row, headers.device));
  const date = parseIsoDate(valueFor(row, headers.date), "date", messages);
  const clicks = parseNonNegativeInteger(valueFor(row, headers.clicks), "clicks", messages);
  const impressions = parseNonNegativeInteger(valueFor(row, headers.impressions), "impressions", messages);
  const ctr = parseCtr(valueFor(row, headers.ctr), messages);
  const position = parsePositiveNumber(valueFor(row, headers.position), "position", messages);

  if (!query) messages.push("Query is required.");

  return {
    messages,
    evidence: {
      sourceType: "gsc_csv",
      sourceRecordReference: `${cleanSourceFileName(context.sourceFileName) ?? "unspecified-file"}#row-${dataRowNumber}`,
      evidenceText: query,
      sourceDate: date,
      sourceUrl: page,
      market: context.market.trim(),
      language: context.language.trim(),
      metrics: {
        query,
        clicks,
        impressions,
        ctr,
        position,
        page,
        country,
        device,
        date
      }
    }
  };
}

function valueFor(row: ParsedRow, header: string | undefined): string {
  if (!header) return "";
  return row[header] ?? "";
}

function cleanText(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function cleanOptionalText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function cleanSourceFileName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return cleanOptionalText(value);
}

function sanitizeRawPreviewRow(row: ParsedRow): ParsedRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cleanText(value ?? "")]));
}

function parseNonNegativeInteger(value: string, fieldName: string, messages: string[]): number | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  if (!INTEGER_PATTERN.test(cleaned)) {
    messages.push(`${fieldName} must be a non-negative integer.`);
    return null;
  }
  return Number(cleaned.replace(/,/g, ""));
}

function parseCtr(value: string, messages: string[]): number | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;

  const hasPercentSign = cleaned.endsWith("%");
  const numericText = hasPercentSign ? cleaned.slice(0, -1).trim() : cleaned;
  if (!DECIMAL_PATTERN.test(numericText)) {
    messages.push("CTR must be a decimal between 0 and 1 or a percentage such as 12.5%.");
    return null;
  }

  const numericValue = Number(numericText);
  if (!Number.isFinite(numericValue)) {
    messages.push("CTR must be finite.");
    return null;
  }

  if (!hasPercentSign && numericValue > 1) {
    messages.push("CTR values greater than 1 must include a percent sign.");
    return null;
  }

  const ctr = hasPercentSign ? numericValue / 100 : numericValue;
  if (ctr < 0 || ctr > 1) {
    messages.push("CTR must resolve to a value from 0 through 1.");
    return null;
  }

  return ctr;
}

function parsePositiveNumber(value: string, fieldName: string, messages: string[]): number | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  if (!DECIMAL_PATTERN.test(cleaned)) {
    messages.push(`${fieldName} must be a positive number.`);
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    messages.push(`${fieldName} must be a positive number.`);
    return null;
  }

  return parsed;
}

function parseIsoDate(value: string, fieldName: string, messages: string[]): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const parsed = new Date(`${cleaned}T00:00:00.000Z`);
  if (!ISO_DATE_PATTERN.test(cleaned) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== cleaned) {
    messages.push(`${fieldName} must be an ISO date in YYYY-MM-DD format.`);
    return null;
  }
  return cleaned;
}

function emptyPreview(fileErrors: string[]): GscCsvPreview {
  return {
    validRows: [],
    invalidRows: [],
    summary: {
      totalRows: 0,
      validRowCount: 0,
      invalidRowCount: 0
    },
    fileErrors
  };
}
