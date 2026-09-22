import 'server-only';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export function publicIPv4(ip: string) {
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  );
}
export async function retrieve(
  url: string,
  redirects = 0,
): Promise<{ url: string; title: string; text: string; checked_at: string }> {
  const u = new URL(url);
  if (
    u.protocol !== 'https:' ||
    (u.port && u.port !== '443') ||
    u.username ||
    u.password ||
    /[?&](?:key|token|secret|password)=/i.test(url) ||
    redirects > 3
  )
    throw new Error('Unsafe source URL.');
  const addresses = await lookup(u.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((a) => !publicIPv4(a.address)))
    throw new Error('Only public source addresses are allowed.');
  // Pin the checked address. Re-resolve and re-check every redirect to prevent DNS rebinding.
  const data = await new Promise<{ location?: string; html?: string }>(
    (resolve, reject) => {
      const req = https.get(
        u,
        {
          family: 4,
          timeout: 8000,
          headers: {
            'User-Agent': 'FieldworkLearning/1.0',
            Accept: 'text/html,text/plain',
          },
          lookup: (_hostname, _options, callback) =>
            callback(null, addresses[0].address, 4),
        },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            return resolve({ location: new URL(res.headers.location, u).href });
          }
          if (
            res.statusCode !== 200 ||
            !String(res.headers['content-type']).match(/text\/(html|plain)/)
          ) {
            res.resume();
            return reject(new Error('Source could not be verified.'));
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size > 700000) {
              req.destroy(new Error('Source too large.'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () =>
            resolve({ html: Buffer.concat(chunks).toString('utf8') }),
          );
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('Source timed out.')));
      req.on('error', reject);
    },
  );
  if (data.location) return retrieve(data.location, redirects + 1);
  const html = data.html || '';
  const title =
    html
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .slice(0, 200) || u.hostname;
  const text = html
    .replace(/<(script|style|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18000);
  if (text.length < 200)
    throw new Error('Source contains too little readable evidence.');
  return { url: u.href, title, text, checked_at: new Date().toISOString() };
}
