// Safe math-expression compiler: only whitelisted names are allowed.
const FN = ["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "exp", "ln", "log", "log2",
  "sqrt", "cbrt", "abs", "pow", "floor", "ceil", "round", "sign", "min", "max"];
const MAP: Record<string, string> = { ln: "log", log: "log10" };

export function compileExpr(src: string): (x: number) => number {
  let s = src.trim().toLowerCase().replace(/^(y|f\(x\))\s*=\s*/, "").replace(/π/g, "pi").replace(/\^/g, "**");
  s = s.replace(/(\d)\s*(?=[a-df-z(])/g, "$1*").replace(/\)\s*(?=[a-z\d(])/g, ")*");
  s = s.replace(/[a-z_][a-z0-9_]*/g, (id) => {
    if (id === "x" || id === "t") return "x";
    if (id === "pi") return "Math.PI";
    if (id === "e") return "Math.E";
    if (FN.includes(id)) return "Math." + (MAP[id] ?? id);
    throw new Error("Unknown name: " + id);
  });
  if (!/^[0-9a-zA-Z_+\-*\/().,\s]*$/.test(s)) throw new Error("Bad character in expression");
  const f = new Function("x", "return (" + s + ")") as (x: number) => number;
  return (x) => { try { return Number(f(x)); } catch { return NaN; } };
}

export const evalConst = (s: string) => compileExpr(s)(0);
