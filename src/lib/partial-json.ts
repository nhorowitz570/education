// Best-effort parser for a JSON document that is still streaming in.
//
// Structured model output arrives as JSON text deltas. This returns the value
// described so far: an unterminated string *value* is kept (so prose can be
// shown word by word), while an unterminated key, number or literal is dropped
// until it completes. Open objects and arrays are closed.
export function parsePartialJson<T = unknown>(src: string): T | undefined {
  type Frame = { t: '{' | '['; expectKey: boolean };
  const stack: Frame[] = [];
  const closers = () =>
    stack
      .map((f) => (f.t === '{' ? '}' : ']'))
      .reverse()
      .join('');
  let inString = false,
    stringIsKey = false,
    escaped = false,
    best: string | null = null;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') {
        inString = false;
        if (!stringIsKey) best = src.slice(0, i + 1) + closers();
      }
      continue;
    }
    const top = stack[stack.length - 1];
    switch (c) {
      case '"':
        inString = true;
        stringIsKey = !!top && top.t === '{' && top.expectKey;
        break;
      case '{':
      case '[':
        stack.push({ t: c, expectKey: c === '{' });
        best = src.slice(0, i + 1) + closers();
        break;
      case '}':
      case ']':
        stack.pop();
        best = src.slice(0, i + 1) + closers();
        break;
      case ':':
        if (top) top.expectKey = false;
        break;
      case ',':
        // The previous value is complete.
        best = src.slice(0, i) + closers();
        if (top?.t === '{') top.expectKey = true;
        break;
    }
  }

  const attempts: string[] = [];
  if (inString && !stringIsKey) {
    // Drop a dangling escape so the synthetic closing quote is not escaped.
    const body = src
      .replace(/\\u[0-9a-fA-F]{0,3}$/, '')
      .replace(/(?<!\\)(\\\\)*\\$/, (m) => m.slice(0, -1));
    attempts.push(body + '"' + closers());
  } else if (!inString && stack.length === 0 && src.trim()) {
    attempts.push(src);
  }
  if (best) attempts.push(best);
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try the next, more conservative cut */
    }
  }
  return undefined;
}
