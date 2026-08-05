import Papa from "papaparse";

export type ImportedPrompt = {
  prompt_text: string;
  category: string;
  intent: string;
  market?: string;
  language?: string;
};

export function parsePromptCsv(csvText: string): ImportedPrompt[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase()
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }

  return parsed.data.map((row, index) => {
    const promptText = row.prompt_text?.trim() || row.prompt?.trim();
    if (!promptText) {
      throw new Error(`Row ${index + 2} is missing prompt_text`);
    }

    return {
      prompt_text: promptText,
      category: row.category?.trim() || "Uncategorised",
      intent: row.intent?.trim() || "General",
      market: row.market?.trim() || undefined,
      language: row.language?.trim() || undefined
    };
  });
}
