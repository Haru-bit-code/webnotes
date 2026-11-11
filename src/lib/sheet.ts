// Spreadsheet helpers: cell names (A1), and a small formula language:
//   =A1+B2*3   =SUM(A1:A9)   =AVERAGE(B2:D2)   =MIN() MAX() COUNT() ROUND(x, n) ABS() IF(cond, a, b)
//   operators + - * / ^, comparisons > < >= <= = <>, and & to join text.
import { Sheet } from "./types";

export const colName = (i: number) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const colIndex = (s: string) => s.toUpperCase().split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export const cellName = (r: number, c: number) => `${colName(c)}${r + 1}`;

type Val = number | string | boolean;
type Range = Val[];
class FormulaError extends Error {}

export function evaluateSheet(sheet: Sheet): string[][] {
  const memo = new Map<string, Val>(), busy = new Set<string>();
  const raw = (r: number, c: number) => sheet.rows[r]?.[c] ?? "";
  const valueAt = (r: number, c: number): Val => {
    const key = r + ":" + c;
    if (memo.has(key)) return memo.get(key)!;
    if (busy.has(key)) throw new FormulaError("#CYCLE");
    const s = raw(r, c).trim();
    let v: Val;
    if (s.startsWith("=")) { busy.add(key); try { v = run(s.slice(1)); } finally { busy.delete(key); } }
    else if (s !== "" && !isNaN(Number(s.replace(/,/g, "")))) v = Number(s.replace(/,/g, ""));
    else v = s;
    memo.set(key, v); return v;
  };

  function run(src: string): Val {
    let i = 0;
    const ws = () => { while (src[i] === " ") i++; };
    const peek = (t: string) => { ws(); return src.slice(i, i + t.length).toUpperCase() === t; };
    const eat = (t: string) => { if (peek(t)) { i += t.length; return true; } return false; };
    const num = (v: Val) => { if (typeof v === "number") return v; if (typeof v === "boolean") return v ? 1 : 0; if (v === "") return 0; const n = Number(v); if (isNaN(n)) throw new FormulaError("#VALUE"); return n; };
    const ref = (): [number, number] | null => { ws(); const m = /^\$?([A-Za-z]{1,3})\$?(\d+)/.exec(src.slice(i)); if (!m) return null; i += m[0].length; return [Number(m[2]) - 1, colIndex(m[1])]; };
    const cmp = (): Val => {
      let a = concat();
      for (;;) {
        const op = [">=", "<=", "<>", ">", "<", "="].find((o) => peek(o)); if (!op) return a;
        i += op.length; const b = concat();
        const x = typeof a === "number" || typeof b === "number" ? num(a) : String(a), y = typeof a === "number" || typeof b === "number" ? num(b) : String(b);
        a = op === ">=" ? x >= y : op === "<=" ? x <= y : op === "<>" ? x !== y : op === ">" ? x > y : op === "<" ? x < y : x === y;
      }
    };
    const concat = (): Val => { let a = add(); while (eat("&")) a = String(a) + String(add()); return a; };
    const add = (): Val => { let a = mul(); for (;;) { if (eat("+")) a = num(a) + num(mul()); else if (eat("-")) a = num(a) - num(mul()); else return a; } };
    const mul = (): Val => { let a = pow(); for (;;) { if (eat("*")) a = num(a) * num(pow()); else if (eat("/")) { const d = num(pow()); if (d === 0) throw new FormulaError("#DIV/0"); a = num(a) / d; } else return a; } };
    const pow = (): Val => { const a = unary(); return eat("^") ? Math.pow(num(a), num(pow())) : a; };
    const unary = (): Val => (eat("-") ? -num(unary()) : eat("+") ? num(unary()) : atom());
    const args = (): (Val | Range)[] => {
      const out: (Val | Range)[] = [];
      if (eat(")")) return out;
      do {
        const save = i, a = ref();
        if (a && eat(":")) { const b = ref(); if (!b) throw new FormulaError("#REF"); const vs: Val[] = []; for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++) for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) vs.push(valueAt(r, c)); out.push(vs); }
        else { i = save; out.push(cmp()); }
      } while (eat(","));
      if (!eat(")")) throw new FormulaError("#SYNTAX");
      return out;
    };
    const atom = (): Val => {
      ws();
      if (eat("(")) { const v = cmp(); if (!eat(")")) throw new FormulaError("#SYNTAX"); return v; }
      if (src[i] === '"') { const j = src.indexOf('"', i + 1); if (j < 0) throw new FormulaError("#SYNTAX"); const s = src.slice(i + 1, j); i = j + 1; return s; }
      const n = /^\d+(\.\d+)?/.exec(src.slice(i)); if (n) { i += n[0].length; return Number(n[0]); }
      const f = /^([A-Za-z]+)\s*\(/.exec(src.slice(i));
      if (f) {
        i += f[0].length; const name = f[1].toUpperCase(), a = args();
        const flat = a.flatMap((x) => (Array.isArray(x) ? x : [x]));
        const nums = flat.filter((v) => typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)))).map(Number);
        switch (name) {
          case "SUM": return nums.reduce((s, v) => s + v, 0);
          case "AVERAGE": case "AVG": if (!nums.length) throw new FormulaError("#DIV/0"); return nums.reduce((s, v) => s + v, 0) / nums.length;
          case "MIN": return nums.length ? Math.min(...nums) : 0;
          case "MAX": return nums.length ? Math.max(...nums) : 0;
          case "COUNT": return nums.length;
          case "COUNTA": return flat.filter((v) => v !== "").length;
          case "ROUND": { const p = 10 ** num((a[1] as Val) ?? 0); return Math.round(num(a[0] as Val) * p) / p; }
          case "ABS": return Math.abs(num(a[0] as Val));
          case "SQRT": return Math.sqrt(num(a[0] as Val));
          case "IF": return a[0] && (a[0] as Val) !== 0 && (a[0] as Val) !== "" ? (a[1] as Val) ?? true : (a[2] as Val) ?? false;
          default: throw new FormulaError("#NAME");
        }
      }
      if (/^TRUE\b/i.test(src.slice(i))) { i += 4; return true; }
      if (/^FALSE\b/i.test(src.slice(i))) { i += 5; return false; }
      const r = ref(); if (r) return valueAt(r[0], r[1]);
      throw new FormulaError("#SYNTAX");
    };
    const v = cmp(); ws();
    if (i < src.length) throw new FormulaError("#SYNTAX");
    return v;
  }

  return sheet.rows.map((row, r) => row.map((_, c) => {
    try { const v = valueAt(r, c); return typeof v === "number" ? String(Math.round(v * 1e10) / 1e10) : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v; }
    catch (e) { return e instanceof FormulaError ? e.message : "#ERROR"; }
  }));
}

export const blankSheet = (name = "Sheet 1", rows = 20, cols = 8): Sheet => ({ name, rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "")) });

/** text version of all sheets (computed values), used for search and the AI panel */
export const sheetsText = (sheets: Sheet[]) => sheets.map((s) => {
  const v = evaluateSheet(s).map((r) => r.join("\t").replace(/\t+$/, "")).filter((l) => l.trim()).join("\n");
  return sheets.length > 1 ? `${s.name}\n${v}` : v;
}).join("\n\n");
