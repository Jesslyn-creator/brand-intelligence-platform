import "server-only";

export function requiredServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function optionalServerEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}
