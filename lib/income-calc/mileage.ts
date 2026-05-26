// IRS standard-mileage depreciation component, $/mile, by tax year.
// Versioned with RULES_VERSION (rules-v0.1.0). Adding new years => new
// rules version (driven by the Income-Calc Specialist + IRS notice).
export const MILEAGE_DEPRECIATION_RATE_BY_YEAR: Readonly<Record<number, number>> = {
  2021: 0.26,
  2022: 0.26,
  2023: 0.28,
  2024: 0.30,
  2025: 0.33,
};

export function mileageDepreciationRate(taxYear: number): number {
  const rate = MILEAGE_DEPRECIATION_RATE_BY_YEAR[taxYear];
  if (rate === undefined) {
    throw new Error(
      `no mileage depreciation rate published for tax year ${taxYear} in rules-v0.1.0`,
    );
  }
  return rate;
}
