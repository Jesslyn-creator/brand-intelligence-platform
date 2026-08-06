import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";

const root = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default undefined;",
      shortCircuit: true
    };
  }

  if (specifier === "next/headers") {
    return {
      url: "data:text/javascript,export async function cookies(){ throw new Error('next/headers cookies() is not available in evidence repository tests'); }",
      shortCircuit: true
    };
  }

  if (specifier.startsWith("@/")) {
    return resolveExistingTsPath(join(root, "src", specifier.slice(2)));
  }

  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const basePath = dirname(fileURLToPath(context.parentURL));
    const targetPath = resolvePath(basePath, specifier);
    const resolved = resolveExistingTsPathOrNull(targetPath);
    if (resolved) return resolved;
  }

  return nextResolve(specifier, context);
}

function resolveExistingTsPath(targetPath) {
  const resolved = resolveExistingTsPathOrNull(targetPath);
  if (!resolved) {
    throw new Error(`Unable to resolve test module path: ${targetPath}`);
  }
  return resolved;
}

function resolveExistingTsPathOrNull(targetPath) {
  for (const candidate of [targetPath, `${targetPath}.ts`, `${targetPath}.tsx`, `${targetPath}.mjs`, join(targetPath, "index.ts")]) {
    if (existsSync(candidate)) {
      return {
        url: pathToFileURL(candidate).href,
        shortCircuit: true
      };
    }
  }
  return null;
}
