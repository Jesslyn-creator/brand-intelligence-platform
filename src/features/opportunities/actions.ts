"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findNormalizedTopicDuplicates } from "./queries.server";
import { PromptOpportunityValidationError, validatePromptOpportunityCreateInput } from "./validation";

type SupabaseActionClient = Awaited<ReturnType<typeof createSupabaseServerClient>> & {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: Error | null;
    }>;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

type DuplicateWarning = {
  id: string;
  topic: string;
  status: string;
  market: string;
  language: string;
};

export type CreatePromptOpportunityActionResult =
  | { ok: true; kind: "created"; opportunityId: string }
  | { ok: false; kind: "duplicate_warning"; message: string; duplicates: DuplicateWarning[] }
  | { ok: false; kind: "validation_error" | "auth_error" | "permission_error" | "database_error" | "unknown_error"; message: string; fieldErrors?: Record<string, string> };

export async function createPromptOpportunityFromEvidenceAction(formData: FormData): Promise<CreatePromptOpportunityActionResult> {
  try {
    const supabase = await createSupabaseServerClient() as SupabaseActionClient;
    const authResult = await supabase.auth.getUser();
    if (authResult.error || !authResult.data.user) {
      return { ok: false, kind: "auth_error", message: "Sign in before creating prompt opportunities." };
    }

    const parsed = parseFormData(formData);
    const validated = validatePromptOpportunityCreateInput(parsed);

    const duplicates = await findNormalizedTopicDuplicates({
      projectId: validated.projectId,
      topic: validated.topic,
      market: validated.market,
      language: validated.language
    });

    if (duplicates.length > 0 && !validated.duplicateWarningAcknowledged) {
      return {
        ok: false,
        kind: "duplicate_warning",
        message: "A matching active opportunity already exists for this topic, market, and language.",
        duplicates: duplicates.map((duplicate) => ({
          id: duplicate.id,
          topic: duplicate.topic,
          status: duplicate.status,
          market: duplicate.market,
          language: duplicate.language
        }))
      };
    }

    const { data, error } = await supabase.rpc("create_prompt_opportunity_with_evidence", {
      target_project_id: validated.projectId,
      target_topic: validated.topic,
      target_market: validated.market,
      target_language: validated.language,
      target_evidence_record_ids: validated.evidenceRecordIds,
      target_intent: validated.intent
    });

    if (error) return mapDatabaseError(error);
    if (typeof data !== "string") {
      return { ok: false, kind: "database_error", message: "Prompt opportunity could not be created. Try again later." };
    }

    return { ok: true, kind: "created", opportunityId: data };
  } catch (error) {
    return mapUnexpectedError(error);
  }
}

function parseFormData(formData: FormData) {
  return {
    projectId: stringField(formData, "project_id"),
    topic: stringField(formData, "topic"),
    market: stringField(formData, "market"),
    language: stringField(formData, "language"),
    intent: stringField(formData, "intent") ?? "unknown",
    evidenceRecordIds: stringFields(formData, "evidence_record_ids"),
    duplicateWarningAcknowledged: parseDuplicateWarningAck(stringField(formData, "duplicate_warning_ack"))
  };
}

function stringField(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

function stringFields(formData: FormData, key: string): Array<string | null> {
  return formData.getAll(key).map((value) => typeof value === "string" ? value : null);
}

function parseDuplicateWarningAck(value: string | null): boolean {
  if (value == null || value.trim() === "") return false;
  return value.trim() === "true" || value.trim() === "1";
}

function mapUnexpectedError(error: unknown): CreatePromptOpportunityActionResult {
  if (error instanceof PromptOpportunityValidationError) {
    return {
      ok: false,
      kind: "validation_error",
      message: error.message,
      fieldErrors: error.fieldErrors
    };
  }

  if (isAuthenticationError(error)) {
    return { ok: false, kind: "auth_error", message: "Sign in before creating prompt opportunities." };
  }

  if (isPermissionError(error)) {
    return { ok: false, kind: "permission_error", message: "You do not have access to create an opportunity for this project." };
  }

  if (isDatabaseLikeError(error)) return mapDatabaseError(error);

  return { ok: false, kind: "unknown_error", message: "Prompt opportunity could not be created. Try again later." };
}

function mapDatabaseError(error: unknown): CreatePromptOpportunityActionResult {
  if (isPermissionError(error)) {
    return { ok: false, kind: "permission_error", message: "You do not have access to create an opportunity for this project." };
  }

  return { ok: false, kind: "database_error", message: "Prompt opportunity could not be created. Check the selected evidence and try again." };
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("authenticated") || message.includes("auth session") || message.includes("jwt");
}

function isPermissionError(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return code === "42501" || code === "PGRST301" || message.includes("permission denied") || message.includes("row-level security") || message.includes("rls") || message.includes("not accessible");
}

function isDatabaseLikeError(error: unknown): boolean {
  return !!error && !(error instanceof Error) && typeof error === "object" && ("code" in error || "details" in error || "hint" in error || "message" in error);
}

function errorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
}

function errorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : error instanceof Error ? error.message : "";
}



