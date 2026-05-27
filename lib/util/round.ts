// Half-up rounding to N decimals. Symmetric about zero (unlike JS Math.round,
// which rounds .5 towards +Infinity). Shared by lib/income-calc and lib/loan-calc.
export function roundHalfUp(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(n) * factor + 0.5)) / factor;
}
