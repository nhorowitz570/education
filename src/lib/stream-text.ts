// Splits text into sentence-sized units, keeping each unit's trailing space.
// While the text is still being written, the unfinished tail is held back,
// unless it has run long, in which case it is released at a clause break so
// a long sentence doesn't sit invisible.
const END = /[.!?…:;]["”’)\]]*\s+|\n/g;
export function sentences(text: string, writing: boolean): string[] {
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(END)) {
    const end = m.index! + m[0].length;
    out.push(text.slice(last, end));
    last = end;
  }
  const tail = text.slice(last);
  if (!writing) {
    if (tail) out.push(tail);
  } else if (tail.length > 140) {
    const cut = Math.max(tail.lastIndexOf(', '), tail.lastIndexOf(' — '), tail.lastIndexOf(' – '));
    if (cut > 60) out.push(tail.slice(0, cut + 2));
  }
  // A unit with an unbalanced ** or ` would render its marker; hold it back.
  if (writing && out.length) {
    const joined = out.join('');
    if ((joined.match(/\*\*/g) || []).length % 2 || (joined.match(/`/g) || []).length % 2) out.pop();
  }
  return out;
}
