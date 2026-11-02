/**
 * Utility functions for evaluating math expressions in input fields.
 * Supports +, -, *, /, (), %, decimals with . or ,, and 'x'/'X' for multiplication.
 * Safe pure parser: no eval() or new Function(), 100% CSP-safe.
 */

export function evaluateMathExpression(rawExpr: string): number | null {
  if (!rawExpr || typeof rawExpr !== 'string') return null;

  let expr = rawExpr.trim();
  if (!expr) return null;

  // Replace 'x' or 'X' with '*'
  expr = expr.replace(/x/gi, '*');

  // Replace percentage operations like "1000 + 21%" or "1000 - 15%"
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*%/g, (_, base, op, pct) => {
    return `${base} ${op} (${base} * ${pct} / 100)`;
  });

  // Replace standalone percentages like "500 * 20%" or "(20%)" -> "(20 / 100)"
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1 / 100)');

  // Handle commas and dots for decimals
  if (expr.includes('.') && expr.includes(',')) {
    const lastDot = expr.lastIndexOf('.');
    const lastComma = expr.lastIndexOf(',');
    if (lastComma > lastDot) {
      // 1.500,50 -> 1500.50
      expr = expr.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // 1,500.50 -> 1500.50
      expr = expr.replace(/,/g, '');
    }
  } else {
    // Only commas: replace with dot
    expr = expr.replace(/,/g, '.');
  }

  // Tokenize
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      tokens.push(numStr);
      continue;
    }
    // Any unrecognized character means invalid expression
    return null;
  }

  if (tokens.length === 0) return null;

  let pos = 0;

  function parsePrimary(): number | null {
    if (pos >= tokens.length) return null;
    const token = tokens[pos];

    if (token === '(') {
      pos++;
      const val = parseExpr();
      if (val === null) return null;
      if (pos >= tokens.length || tokens[pos] !== ')') return null;
      pos++; // consume ')'
      return val;
    }

    if (token === '+' || token === '-') {
      pos++;
      const factor = parseFactor();
      if (factor === null) return null;
      return token === '-' ? -factor : factor;
    }

    const num = Number(token);
    if (isNaN(num)) return null;
    pos++;
    return num;
  }

  function parseFactor(): number | null {
    if (pos >= tokens.length) return null;
    const token = tokens[pos];
    if (token === '+' || token === '-') {
      pos++;
      const f = parseFactor();
      if (f === null) return null;
      return token === '-' ? -f : f;
    }
    return parsePrimary();
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;

    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos];
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      if (op === '*') {
        left = left * right;
      } else {
        if (right === 0) return null; // Avoid division by zero
        left = left / right;
      }
    }
    return left;
  }

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;

    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos];
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      if (op === '+') {
        left = left + right;
      } else {
        left = left - right;
      }
    }
    return left;
  }

  const result = parseExpr();
  if (result === null || pos < tokens.length) {
    return null;
  }

  // Round to 2 decimal places to avoid IEEE 754 precision issues
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

export function hasMathOperation(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  return /[+\-*/xX%]/.test(val);
}
