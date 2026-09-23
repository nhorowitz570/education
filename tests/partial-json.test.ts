import { describe, it, expect } from 'vitest';
import { parsePartialJson } from '@/lib/partial-json';

describe('parsePartialJson', () => {
  it('reveals an unterminated string value as it streams', () => {
    expect(
      parsePartialJson('{"blocks":[{"type":"text","md":"Profit is not ca'),
    ).toEqual({ blocks: [{ type: 'text', md: 'Profit is not ca' }] });
  });
  it('holds back unfinished keys, numbers and literals', () => {
    expect(parsePartialJson('{"a":"x","b')).toEqual({ a: 'x' });
    expect(parsePartialJson('{"a":1,"b":12')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":1,"ok":tru')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":')).toEqual({});
  });
  it('closes nested containers', () => {
    expect(parsePartialJson('{"v":{"bars":[{"label":"Sold","value":8000},{')).toEqual({
      v: { bars: [{ label: 'Sold', value: 8000 }, {}] },
    });
  });
  it('handles escapes at the cut point', () => {
    expect(parsePartialJson('{"md":"a \\"quote\\')).toEqual({ md: 'a "quote' });
    expect(parsePartialJson('{"md":"x\\u00')).toEqual({ md: 'x' });
    expect(parsePartialJson('{"md":"line\\nnext')).toEqual({ md: 'line\nnext' });
  });
  it('returns complete documents unchanged', () => {
    const doc = { a: [1, 2, { b: null }], c: 'd' };
    expect(parsePartialJson(JSON.stringify(doc))).toEqual(doc);
  });
  it('returns undefined when nothing is parseable yet', () => {
    expect(parsePartialJson('')).toBeUndefined();
    expect(parsePartialJson('  ')).toBeUndefined();
  });
});
