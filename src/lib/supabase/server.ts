import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { requiredServerEnv } from "@/lib/env.server";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requiredServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as never);
          });
        }
      }
    }
  );
}

export function createSupabaseServiceClient() {
  return createClient(
    requiredServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
