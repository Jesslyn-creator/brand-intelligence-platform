"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { parsePromptCsv } from "@/lib/csv/prompts";
import { sha256Text } from "@/lib/hash";

type SupabaseAny = ReturnType<typeof createSupabaseServiceClient> & { from: (table: string) => any };

function client(): SupabaseAny {
  return createSupabaseServiceClient() as SupabaseAny;
}

function requiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

export async function createPromptSet(formData: FormData) {
  const supabase = client();
  const { error } = await supabase.from("prompt_sets").insert({
    project_id: requiredString(formData, "project_id"),
    prompt_set_name: requiredString(formData, "prompt_set_name"),
    description: typeof formData.get("description") === "string" ? String(formData.get("description")).trim() : null,
    active: true
  });
  if (error) throw error;
  revalidatePath("/");
}

export async function importPromptCsv(formData: FormData) {
  const supabase = client();
  const projectId = requiredString(formData, "project_id");
  const promptSetId = requiredString(formData, "prompt_set_id");
  const market = requiredString(formData, "market");
  const language = requiredString(formData, "language");
  const csvText = requiredString(formData, "csv_text");
  const prompts = parsePromptCsv(csvText);

  for (const row of prompts) {
    const { data: prompt, error } = await supabase
      .from("prompts")
      .insert({
        project_id: projectId,
        prompt_set_id: promptSetId,
        category: row.category,
        intent: row.intent,
        market: row.market ?? market,
        language: row.language ?? language,
        active: true
      })
      .select("id")
      .single();

    if (error) throw error;

    const { error: versionError } = await supabase.from("prompt_versions").insert({
      project_id: projectId,
      prompt_id: prompt.id,
      version_number: 1,
      prompt_text: row.prompt_text,
      content_hash: await sha256Text(row.prompt_text)
    });

    if (versionError) throw versionError;
  }

  revalidatePath("/");
}
