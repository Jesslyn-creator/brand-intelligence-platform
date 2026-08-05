export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      claim_test_run_items: {
        Args: {
          target_test_run_id: string;
          batch_size: number;
          worker_id: string;
          stale_after?: string;
        };
        Returns: Array<{
          id: string;
          project_id: string;
          test_run_id: string;
          prompt_version_id: string;
          repetition_index: number;
          claim_token: string;
          attempt_number: number;
        }>;
      };
      complete_test_run_item: {
        Args: {
          target_item_id: string;
          target_claim_token: string;
          target_response_id: string;
        };
        Returns: undefined;
      };
      fail_test_run_item: {
        Args: {
          target_item_id: string;
          target_claim_token: string;
          error_message: string;
        };
        Returns: undefined;
      };
      record_completed_analysis: {
        Args: Record<string, unknown>;
        Returns: string;
      };
    };
  };
};

export type Project = {
  id: string;
  organisation_id: string;
  project_name: string;
  market: string;
  default_language: string;
  active: boolean;
};

export type Brand = {
  id: string;
  organisation_id: string;
  brand_name: string;
};

export type BrandAlias = {
  id: string;
  brand_id: string;
  alias: string;
  normalized_alias: string;
  active: boolean;
};

export type BrandDomain = {
  id: string;
  brand_id: string;
  domain: string;
  normalized_domain: string;
  is_primary: boolean;
  active: boolean;
};

export type PromptSet = {
  id: string;
  project_id: string;
  prompt_set_name: string;
  description: string | null;
  active: boolean;
};

export type Prompt = {
  id: string;
  project_id: string;
  prompt_set_id: string;
  category: string;
  intent: string;
  market: string;
  language: string;
  active: boolean;
};

export type PromptVersion = {
  id: string;
  prompt_id: string;
  project_id: string;
  version_number: number;
  prompt_text: string;
  content_hash: string;
};

export type TestRun = {
  id: string;
  project_id: string;
  prompt_set_id: string;
  run_name: string;
  provider: string;
  model: string;
  status: string;
  repetitions: number;
  created_at: string;
};
