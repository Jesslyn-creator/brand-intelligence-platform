import { createClient } from "@supabase/supabase-js";

function readArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : undefined;
}

function required(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
const adminEmail = required("admin email", readArg("email") || process.env.DEFAULT_ADMIN_EMAIL);
const organisationName = readArg("organisation") || process.env.DEFAULT_ORGANISATION_NAME || "Internal Admin Organisation";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function findUserByEmail(email) {
  const matches = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    matches.push(...data.users.filter((user) => user.email?.toLowerCase() === email.toLowerCase()));
    if (data.users.length < perPage) break;
    page += 1;
  }

  if (matches.length === 0) throw new Error(`No Supabase Auth user found for ${email}`);
  if (matches.length > 1) throw new Error(`Multiple Supabase Auth users found for ${email}; refusing ambiguous bootstrap`);
  return matches[0];
}

async function findOrCreateOrganisation(name) {
  const { data: existing, error } = await supabase
    .from("organisations")
    .select("*")
    .eq("organisation_name", name);

  if (error) throw error;
  if (existing.length > 1) throw new Error(`Multiple organisations named "${name}" exist; refusing ambiguous bootstrap`);
  if (existing.length === 1) return existing[0];

  const { data: created, error: createError } = await supabase
    .from("organisations")
    .insert({ organisation_name: name })
    .select("*")
    .single();

  if (createError) throw createError;
  return created;
}

const user = await findUserByEmail(adminEmail);
const organisation = await findOrCreateOrganisation(organisationName);

const { error: membershipError } = await supabase.from("organisation_members").upsert(
  {
    organisation_id: organisation.id,
    user_id: user.id,
    member_role: "admin"
  },
  {
    onConflict: "organisation_id,user_id"
  }
);

if (membershipError) throw membershipError;

console.log(`Admin bootstrap complete for ${adminEmail} in organisation "${organisation.organisation_name}".`);
