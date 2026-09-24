// Lets the iPhone app use this domain's passkeys (associated domains).
// Apple fetches it through its CDN, so it must be plain JSON with no redirect.
const TEAM = process.env.APPLE_TEAM_ID || 'WB5QDXNHR8';
const APP = `${TEAM}.${process.env.APNS_TOPIC || 'co.nhorowitz.fieldwork'}`;

export const dynamic = 'force-static';

export function GET() {
  return Response.json(
    { webcredentials: { apps: [APP] } },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
