/**
 * Validation helpers for SPARQL endpoint URLs.
 *
 * Kept in a separate lib module so they can be unit-tested without pulling in
 * the pi ExtensionAPI or other framework dependencies.
 */

/**
 * Validates that `endpointUrl` is a well-formed HTTP or HTTPS URL.
 *
 * Returns `null` when the URL is acceptable, or a human-readable error string
 * when it is not. Only `http:` and `https:` protocols are permitted; other
 * schemes (`file:`, `javascript:`, `ftp:`, …) are rejected to prevent
 * unintended local-file access or protocol-handler abuse.
 *
 * Note: blocking private/internal IP ranges (SSRF at the network level) is
 * left to the deployment's network policy rather than handled here.
 */
export function validateEndpointUrl(endpointUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return `Invalid endpoint URL: ${endpointUrl}`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Endpoint URL must use http or https (got "${parsed.protocol}").`;
  }
  return null;
}
