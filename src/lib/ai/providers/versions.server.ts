import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let lockfilePackages: Record<string, { version?: string }> | undefined;

function readLockfilePackages() {
  if (!lockfilePackages) {
    const lockfile = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8"));
    lockfilePackages = lockfile.packages ?? {};
  }
  return lockfilePackages ?? {};
}

export function installedPackageVersion(packageName: string): string | null {
  const packages = readLockfilePackages();
  return packages[`node_modules/${packageName}`]?.version ?? null;
}
