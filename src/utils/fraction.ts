/** 小節内位置を正確に扱うための既約分数ユーティリティ */

export interface Frac {
  /** 分子（0以上） */
  n: number;
  /** 分母（1以上） */
  d: number;
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** 既約分数を作る */
export function frac(n: number, d: number): Frac {
  if (d <= 0) throw new Error('denominator must be positive');
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export function fracEq(a: Frac, b: Frac): boolean {
  return a.n * b.d === b.n * a.d;
}

export function fracToNumber(f: Frac): number {
  return f.n / f.d;
}
