"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type SupabaseAny = ReturnType<typeof createSupabaseServiceClient> & { from: (table: string) => any };

function client(): SupabaseAny {
  return createSupabaseServiceClient() as SupabaseAny;
}

function splitList(value: FormDataEntryValue | null): string[] {
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function requiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

async function replaceBrandMetadata(supabase: SupabaseAny, brandId: string, aliases: string[], domains: string[]) {
  await supabase.from("brand_aliases").delete().eq("brand_id", brandId);
  await supabase.from("brand_domains").delete().eq("brand_id", brandId);

  if (aliases.length) {
    const { error } = await supabase.from("brand_aliases").insert(aliases.map((alias) => ({ brand_id: brandId, alias, active: true })));
    if (error) throw error;
  }

  if (domains.length) {
    const { error } = await supabase.from("brand_domains").insert(
      domains.map((domain, index) => ({
        brand_id: brandId,
        domain,
        is_primary: index === 0,
        active: true
      }))
    );
    if (error) throw error;
  }
}

export async function saveTargetBrand(formData: FormData) {
  const supabase = client();
  const projectId = requiredString(formData, "project_id");
  const organisationId = requiredString(formData, "organisation_id");
  const brandName = requiredString(formData, "brand_name");
  const brandId = formData.get("brand_id");
  const aliases = splitList(formData.get("aliases"));
  const domains = splitList(formData.get("domains"));

  let targetBrandId = typeof brandId === "string" && brandId ? brandId : "";

  if (targetBrandId) {
    const { error } = await supabase.from("brands").update({ brand_name: brandName }).eq("id", targetBrandId).eq("organisation_id", organisationId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("brands").insert({ organisation_id: organisationId, brand_name: brandName }).select("id").single();
    if (error) throw error;
    targetBrandId = data.id;
    const { error: linkError } = await supabase.from("project_brands").insert({
      project_id: projectId,
      organisation_id: organisationId,
      brand_id: targetBrandId,
      brand_role: "target",
      active: true
    });
    if (linkError) throw linkError;
  }

  await replaceBrandMetadata(supabase, targetBrandId, aliases, domains);
  revalidatePath("/");
}

export async function addCompetitorBrand(formData: FormData) {
  const supabase = client();
  const projectId = requiredString(formData, "project_id");
  const organisationId = requiredString(formData, "organisation_id");
  const { data: brand, error } = await supabase
    .from("brands")
    .insert({ organisation_id: organisationId, brand_name: requiredString(formData, "brand_name") })
    .select("id")
    .single();

  if (error) throw error;

  await replaceBrandMetadata(supabase, brand.id, splitList(formData.get("aliases")), splitList(formData.get("domains")));

  const { error: linkError } = await supabase.from("project_brands").insert({
    project_id: projectId,
    organisation_id: organisationId,
    brand_id: brand.id,
    brand_role: "competitor",
    active: true
  });
  if (linkError) throw linkError;
  revalidatePath("/");
}
