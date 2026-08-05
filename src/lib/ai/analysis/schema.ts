import { z } from "zod";

export const analysisSchemaVersion = "brand-visibility-v1";
export const analysisPromptVersion = "analysis-prompt-v1";

export const responseClassificationSchema = z.object({
  target_brand_mentioned: z.boolean(),
  target_brand_recommended: z.boolean(),
  target_brand_rank: z.number().int().positive().nullable(),
  recommendation_strength: z.number().min(0).max(1),
  official_domain_cited: z.boolean(),
  confidence_score: z.number().min(0).max(1),
  reasoning_summary: z.string(),
  competitor_mentions: z.array(
    z.object({
      brand_name: z.string(),
      mentioned: z.boolean(),
      recommended: z.boolean()
    })
  )
});

export type ResponseClassification = z.infer<typeof responseClassificationSchema>;

export function buildAnalysisInstruction(targetBrandName: string, competitorNames: string[]) {
  return [
    "Classify the answer for brand visibility evaluation.",
    "Use only the supplied answer text and citation domains.",
    `Target brand: ${targetBrandName}`,
    `Competitor brands: ${competitorNames.length ? competitorNames.join(", ") : "none"}`,
    "Return whether the target brand is mentioned, recommended, ranked, and whether an official domain is cited.",
    "Use confidence_score to reflect how clearly the answer supports the classification.",
    "Automated classification can be imperfect; produce a conservative confidence score when evidence is thin."
  ].join("\n");
}
