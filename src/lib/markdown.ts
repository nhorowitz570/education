import { dateSchema } from './plan';
export function markdownHints(text: string) {
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.slice(0, 200);
  const dates = [...new Set(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])]
    .filter((s) => dateSchema.safeParse(s).success)
    .sort();
  const zone = text.match(
    /\b(?:America|Europe|Asia|Africa|Australia|Pacific)\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/,
  )?.[0];
  return {
    title: heading,
    dates,
    timezone: zone,
    headings: [...text.matchAll(/^#{2,4}\s+(.+)$/gm)]
      .slice(0, 100)
      .map((m) => m[1].slice(0, 300)),
  };
}
