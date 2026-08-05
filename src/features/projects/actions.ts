"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type SupabaseAny = ReturnType<typeof createSupabaseServiceClient> & { from: (table: string) => any };

function client(): SupabaseAny {
  return createSupabaseServiceClient() as SupabaseAny;
}

function requiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

export async function createProject(formData: FormData) {
  const supabase = client();
  const organisationId = requiredString(formData, "organisation_id");
  const { error } = await supabase.from("projects").insert({
    organisation_id: organisationId,
    project_name: requiredString(formData, "project_name"),
    market: requiredString(formData, "market"),
    default_language: requiredString(formData, "default_language"),
    active: true
  });

  if (error) throw error;
  revalidatePath("/");
}
