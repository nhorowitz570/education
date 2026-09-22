// Cross-site request forgery guard for cookie-authenticated mutations.
//
// The request must come from the origin that is actually serving it. That
// origin is derived from the request itself (Host / X-Forwarded-Host), so the
// same build works on 127.0.0.1, localhost, Vercel deployment URLs, team
// aliases and custom domains. Comparing against one configured constant broke
// every write whenever the app was reached through any other hostname.
function serialize(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function servingOrigin(request: Request) {
  const url = new URL(request.url),
    host =
      request.headers.get('x-forwarded-host')?.split(',')[0].trim() ||
      request.headers.get('host') ||
      url.host,
    proto =
      request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
      url.protocol.replace(':', '');
  return serialize(`${proto}://${host}`);
}

export function allowedOrigins(request: Request) {
  const configured = [
    process.env.NEXT_PUBLIC_APP_URL,
    ...(process.env.APP_ALLOWED_ORIGINS || '').split(','),
  ].map((v) => serialize(v?.trim()));
  return new Set(
    [servingOrigin(request), ...configured].filter((v): v is string => !!v),
  );
}

export function crossSite(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  // Fetch Metadata is authoritative in every current browser.
  const site = request.headers.get('sec-fetch-site');
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = request.headers.get('origin');
  // Browsers always send Origin on cross-origin POSTs; a request with neither
  // header is not a browser-driven forgery (it cannot carry the victim's
  // SameSite cookies), so it falls through to normal authentication.
  if (!origin) return false;
  return !allowedOrigins(request).has(serialize(origin) || 'null');
}
