// A tiny arithmetic evaluator for interactive `sim` visuals. It parses the
// formula into an AST once; there is no eval and no access to globals.
type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'call'; fn: keyof typeof FUNCS; args: Node[] };

const FUNCS = {
  min: (...a: number[]) => Math.min(...a),
  max: (...a: number[]) => Math.max(...a),
  round: (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  abs: (x: number) => Math.abs(x),
};

export class FormulaError extends Error {}

export function compile(src: string): (vars: Record<string, number>) => number {
  if (src.length > 300) throw new FormulaError('Formula too long');
  const tokens = src.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?|[a-z_][a-z0-9_]*|[()+\-*/^,]|\S/gi) || [];
  let i = 0;
  const peek = () => tokens[i],
    take = (t?: string) => {
      const tok = tokens[i++];
      if (t && tok !== t) throw new FormulaError(`Expected ${t}`);
      return tok;
    };
  const expr = (): Node => {
    let a = term();
    while (peek() === '+' || peek() === '-') {
      const op = take() as '+' | '-';
      a = { k: 'bin', op, a, b: term() };
    }
    return a;
  };
  const term = (): Node => {
    let a = power();
    while (peek() === '*' || peek() === '/') {
      const op = take() as '*' | '/';
      a = { k: 'bin', op, a, b: power() };
    }
    return a;
  };
  const power = (): Node => {
    const a = unary();
    if (peek() === '^') {
      take();
      return { k: 'bin', op: '^', a, b: power() };
    }
    return a;
  };
  const unary = (): Node => {
    if (peek() === '-') {
      take();
      return { k: 'neg', a: unary() };
    }
    if (peek() === '+') take();
    return atom();
  };
  const atom = (): Node => {
    const t = take();
    if (t === undefined) throw new FormulaError('Unexpected end');
    if (t === '(') {
      const e = expr();
      take(')');
      return e;
    }
    if (/^\d/.test(t)) return { k: 'num', v: Number(t) };
    if (/^[a-z_]/i.test(t)) {
      const name = t.toLowerCase();
      if (peek() === '(') {
        if (!Object.hasOwn(FUNCS, name)) throw new FormulaError(`Unknown function ${name}`);
        take('(');
        const args: Node[] = [];
        if (peek() !== ')') {
          args.push(expr());
          while (peek() === ',') {
            take();
            args.push(expr());
          }
        }
        take(')');
        return { k: 'call', fn: name as keyof typeof FUNCS, args };
      }
      return { k: 'var', name };
    }
    throw new FormulaError(`Unexpected ${t}`);
  };
  const ast = expr();
  if (i < tokens.length) throw new FormulaError(`Unexpected ${tokens[i]}`);
  const run = (n: Node, vars: Record<string, number>): number => {
    switch (n.k) {
      case 'num':
        return n.v;
      case 'var':
        if (!Object.hasOwn(vars, n.name) || typeof vars[n.name] !== 'number')
          throw new FormulaError(`Unknown input ${n.name}`);
        return vars[n.name];
      case 'neg':
        return -run(n.a, vars);
      case 'call':
        return (FUNCS[n.fn] as (...a: number[]) => number)(
          ...n.args.map((a) => run(a, vars)),
        );
      case 'bin': {
        const a = run(n.a, vars),
          b = run(n.b, vars);
        return n.op === '+'
          ? a + b
          : n.op === '-'
            ? a - b
            : n.op === '*'
              ? a * b
              : n.op === '/'
                ? a / b
                : a ** b;
      }
    }
  };
  return (vars) => run(ast, vars);
}
