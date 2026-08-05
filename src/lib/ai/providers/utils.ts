export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || value;
}

export function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return normalizeDomain(value);
  }
}

export function citationFromUrl(url: string, nativeCitation: unknown, metadata: Record<string, unknown> = {}) {
  const normalizedUrl = normalizeUrl(url);
  const domain = domainFromUrl(normalizedUrl);
  return {
    url,
    normalized_url: normalizedUrl,
    domain,
    normalized_domain: normalizeDomain(domain),
    native_citation: nativeCitation,
    provider_metadata: metadata
  };
}

export function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown provider error";
}
