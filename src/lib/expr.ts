// Math expressions for plots (y = sin(x) + 2x^2 …), parsed into a small tree and evaluated directly.
// No eval / new Function: works under a strict Content-Security-Policy and can never run code.
// Supports + - * / ^ (or **), unary minus, implicit multiplication (2x, 3(x+1), (x+1)(x-1), 2pi),
// x or t as the variable, pi / π and e, and the functions below.
const FNS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, pow: Math.pow, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, min: Math.min, max: Math.max,
};
type Node = (x: number) => number;

export function compileExpr(src: string): (x: number) => number {
  const s = src.trim().toLowerCase().replace(/^(y|f\(x\))\s*=\s*/, "").replace(/π/g, "pi").replace(/\*\*/g, "^");
  let i = 0;
  const ws = () => { while (s[i] === " " || s[i] === "\t") i++; };
  const peek = () => { ws(); return s[i]; };
  const fail = (m: string): never => { throw new Error(m); };
  // expr := term (('+'|'-') term)*
  const expr = (): Node => {
    let a = term();
    for (;;) { const c = peek(); if (c === "+") { i++; const l = a, r = term(); a = (x) => l(x) + r(x); } else if (c === "-") { i++; const l = a, r = term(); a = (x) => l(x) - r(x); } else return a; }
  };
  // term := unary (('*'|'/'|implicit) unary)*
  const term = (): Node => {
    let a = unary();
    for (;;) {
      const c = peek();
      if (c === "*") { i++; const l = a, r = unary(); a = (x) => l(x) * r(x); }
      else if (c === "/") { i++; const l = a, r = unary(); a = (x) => l(x) / r(x); }
      else if (c !== undefined && (/[a-z(]/.test(c) || /[0-9.]/.test(c))) { const l = a, r = unary(); a = (x) => l(x) * r(x); } // 2x, (x)(x), x2
      else return a;
    }
  };
  // unary := '-' unary | power
  const unary = (): Node => { const c = peek(); if (c === "-") { i++; const v = unary(); return (x) => -v(x); } if (c === "+") { i++; return unary(); } return power(); };
  // power := atom ('^' unary)?   (right-associative: 2^3^2 = 2^9)
  const power = (): Node => { const b = atom(); if (peek() === "^") { i++; const e = unary(); return (x) => Math.pow(b(x), e(x)); } return b; };
  const atom = (): Node => {
    const c = peek();
    if (c === "(") { i++; const v = expr(); if (peek() !== ")") fail("Missing )"); i++; return v; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; const v = Number(num[0]); return () => v; }
    const id = /^[a-z_][a-z0-9_]*/.exec(s.slice(i));
    if (!id) fail(c === undefined ? "Expression ends too soon" : `Unexpected “${c}”`);
    let name = id![0];
    // split things like "pix" or "xsin" is not supported; but allow known name prefixes such as "2pi", "xpi" via implicit multiplication
    if (!(name in FNS) && !["x", "t", "pi", "e"].includes(name)) {
      const pre = ["pi", "x", "t", "e"].find((k) => name.startsWith(k));
      if (pre) name = pre; else fail("Unknown name: " + name);
    }
    i += name.length;
    if (name === "x" || name === "t") return (x) => x;
    if (name === "pi") return () => Math.PI;
    if (name === "e" && peek() !== "(") return () => Math.E;
    const f = FNS[name]; if (!f) fail("Unknown name: " + name);
    if (peek() !== "(") { const arg = power(); return (x) => f(arg(x)); } // sin x
    i++; const args: Node[] = [];
    if (peek() !== ")") { do { args.push(expr()); } while (peek() === "," && ++i); }
    if (peek() !== ")") fail("Missing )"); i++;
    return (x) => f(...args.map((a) => a(x)));
  };
  const tree = expr();
  if (peek() !== undefined) fail(`Unexpected “${peek()}”`);
  return (x) => { try { return Number(tree(x)); } catch { return NaN; } };
}

export const evalConst = (s: string) => compileExpr(s)(0);
