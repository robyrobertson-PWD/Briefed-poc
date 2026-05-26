// Pure functions — no I/O, no Supabase, no Anthropic. Loadable by the test
// runner directly. Each exported function maps 1:1 to a rule_id in
// /Briefed CPO/income_calc_rules_v0.1.0.md §6 (rules-v0.1.0).

import type {
  AppliedAddback,
  AppliedHaircut,
  CalcFlag,
  IncomeComponent,
  MethodResults,
  PayFrequency,
  VariableIncomeBlock,
} from "./types";
import { mileageDepreciationRate } from "./mileage";

// -----------------------------------------------------------------
// Money & frequency helpers (rules-v0.1.0 §2)
// -----------------------------------------------------------------

// ROUND_HALF_UP for both positive and negative magnitudes. JS's built-in
// Math.round rounds .5 towards +Infinity (so -0.5 -> 0), which is NOT
// half-up. The explicit floor-of-(|n|*f + .5) is.
export function roundHalfUp(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.floor(Math.abs(n) * factor + 0.5)) / factor;
}

export function periodsPerYear(freq: PayFrequency): number {
  switch (freq) {
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "semimonthly":
      return 24;
    case "monthly":
      return 12;
  }
}

// rules-v0.1.0 §2: months_ytd derived from pay_period_end's calendar month.
// 'YYYY-MM-DD' — substring is sufficient and timezone-safe.
export function monthsYtdFromPayPeriodEnd(payPeriodEndISO: string): number {
  const month = Number.parseInt(payPeriodEndISO.slice(5, 7), 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(
      `invalid pay_period_end for months_ytd derivation: ${payPeriodEndISO}`,
    );
  }
  return month;
}

// -----------------------------------------------------------------
// 6.1 w2_base_income
// -----------------------------------------------------------------
export function w2BaseMonthly(args: {
  base_pay_current: number;
  pay_frequency: PayFrequency;
}): number {
  return (args.base_pay_current * periodsPerYear(args.pay_frequency)) / 12;
}

// -----------------------------------------------------------------
// 6.2 / 6.3 / 6.4 variable-income 24-mo averaging (overtime / commission / bonus)
// -----------------------------------------------------------------
export function variableIncome24MoAvgMonthly(args: {
  prior_year_amount: number;
  ytd_amount: number;
  months_ytd: number;
}): number {
  return (args.prior_year_amount + args.ytd_amount) / (12 + args.months_ytd);
}

// -----------------------------------------------------------------
// 6.5 declining_variable_income_haircut (overtime + commission only;
//     bonus is EXEMPT per rules-v0.1.0 §6.4).
// -----------------------------------------------------------------
export function variableIncomeWithHaircut(args: {
  vtype: "overtime" | "commission";
  block: VariableIncomeBlock;
  months_ytd: number;
}): { qualifying_monthly: number; haircut: AppliedHaircut | null } {
  const avg = variableIncome24MoAvgMonthly({
    prior_year_amount: args.block.prior_year_amount,
    ytd_amount: args.block.ytd_amount,
    months_ytd: args.months_ytd,
  });
  const run_rate = args.block.ytd_amount / args.months_ytd;
  const prior_yr_monthly = args.block.prior_year_amount / 12;
  if (run_rate < prior_yr_monthly) {
    const decline_pct = roundHalfUp(
      ((prior_yr_monthly - run_rate) / prior_yr_monthly) * 100,
      1,
    );
    return {
      qualifying_monthly: run_rate,
      haircut: {
        name: `declining_${args.vtype}_income`,
        // Fixture format: "...declined 30.0% vs prior year" — fixed 1-decimal.
        reason: `${args.vtype} run-rate declined ${decline_pct.toFixed(1)}% vs prior year`,
        from: roundHalfUp(avg, 2),
        to: roundHalfUp(run_rate, 2),
        decline_pct,
      },
    };
  }
  return { qualifying_monthly: avg, haircut: null };
}

// -----------------------------------------------------------------
// 6.6 w2_commission_25pct_gate — flag-only in Phase 1
// -----------------------------------------------------------------
export function commission25PctFlagApplies(args: {
  commission_monthly: number;
  total_monthly_income: number;
}): boolean {
  if (args.total_monthly_income <= 0) return false;
  return args.commission_monthly / args.total_monthly_income >= 0.25;
}

// -----------------------------------------------------------------
// 6.7-6.11 Schedule C add-backs, 6.12-6.13 subtractions.
// Returns adjusted annual + the applied_addbacks list (additive only —
// per fixtures, applied_addbacks does NOT carry subtraction entries;
// subtractions reduce 'adjusted' silently and surface only in derivation).
// -----------------------------------------------------------------
export interface ScheduleCYearResult {
  tax_year: number;
  adjusted_annual: number;
  applied_addbacks: AppliedAddback[];
  derivation_lines: string[];
}

export function computeScheduleCYear(year: {
  tax_year: number;
  schedule_c_net_profit: number;
  schedule_c_depreciation?: number;
  schedule_c_depletion?: number;
  schedule_c_amortization_casualty?: number;
  schedule_c_business_use_home?: number;
  schedule_c_business_miles?: number;
  meals_entertainment_nondeductible?: number;
  nonrecurring_other_income?: number;
}): ScheduleCYearResult {
  const lines: string[] = [];
  const addbacks: AppliedAddback[] = [];
  lines.push(
    `${year.tax_year}: Schedule C net profit (Line 31) = ${year.schedule_c_net_profit.toFixed(2)}`,
  );
  let adjusted = year.schedule_c_net_profit;

  // 6.7-6.10 additive add-backs (order matches fixtures: depreciation,
  // depletion, amortization_casualty, business_use_of_home, then mileage).
  type AdditiveField =
    | "schedule_c_depreciation"
    | "schedule_c_depletion"
    | "schedule_c_amortization_casualty"
    | "schedule_c_business_use_home";
  const additive: Array<[AdditiveField, AppliedAddback["name"]]> = [
    ["schedule_c_depreciation", "depreciation"],
    ["schedule_c_depletion", "depletion"],
    ["schedule_c_amortization_casualty", "amortization_casualty"],
    ["schedule_c_business_use_home", "business_use_of_home"],
  ];
  for (const [key, name] of additive) {
    const v = year[key];
    if (typeof v === "number" && v > 0) {
      adjusted += v;
      addbacks.push({ name, tax_year: year.tax_year, amount: roundHalfUp(v, 2) });
      lines.push(`${year.tax_year}: + ${name} = ${v.toFixed(2)}`);
    }
  }

  // 6.11 mileage depreciation
  if (
    typeof year.schedule_c_business_miles === "number" &&
    year.schedule_c_business_miles > 0
  ) {
    const rate = mileageDepreciationRate(year.tax_year);
    const mileAddback = roundHalfUp(year.schedule_c_business_miles * rate, 2);
    adjusted += mileAddback;
    addbacks.push({
      name: "mileage_depreciation",
      tax_year: year.tax_year,
      amount: mileAddback,
    });
    lines.push(
      `${year.tax_year}: + mileage depreciation = ${year.schedule_c_business_miles} mi x ${rate.toFixed(2)}/mi = ${mileAddback.toFixed(2)}`,
    );
  }

  // 6.12 / 6.13 subtractions — silent in applied_addbacks; visible in derivation.
  if (
    typeof year.meals_entertainment_nondeductible === "number" &&
    year.meals_entertainment_nondeductible > 0
  ) {
    adjusted -= year.meals_entertainment_nondeductible;
    lines.push(
      `${year.tax_year}: - meals/entertainment non-deductible = ${year.meals_entertainment_nondeductible.toFixed(2)}`,
    );
  }
  if (
    typeof year.nonrecurring_other_income === "number" &&
    year.nonrecurring_other_income > 0
  ) {
    adjusted -= year.nonrecurring_other_income;
    lines.push(
      `${year.tax_year}: - non-recurring other income = ${year.nonrecurring_other_income.toFixed(2)}`,
    );
  }

  lines.push(
    `${year.tax_year}: adjusted annual = ${roundHalfUp(adjusted, 2).toFixed(2)}`,
  );
  return {
    tax_year: year.tax_year,
    adjusted_annual: adjusted,
    applied_addbacks: addbacks,
    derivation_lines: lines,
  };
}

// -----------------------------------------------------------------
// 6.14 self_employment_two_year_average + 6.15 declining haircut
// + 6.16 insufficient-history gate
// -----------------------------------------------------------------
export interface SelfEmploymentResult {
  qualifying_annual: number;
  applied_addbacks: AppliedAddback[];
  applied_haircuts: AppliedHaircut[];
  flags: CalcFlag[];
  derivation_lines: string[];
}

export function computeSelfEmployment(
  years: ScheduleCYearResult[],
): SelfEmploymentResult {
  if (years.length === 0) {
    return {
      qualifying_annual: 0,
      applied_addbacks: [],
      applied_haircuts: [],
      flags: ["documentation_incomplete"],
      derivation_lines: [
        "No Schedule C years supplied; qualifying = 0.00 (documentation_incomplete).",
      ],
    };
  }
  const sorted = [...years].sort((a, b) => b.tax_year - a.tax_year);
  if (sorted.length === 1) {
    const only = sorted[0];
    return {
      qualifying_annual: only.adjusted_annual,
      applied_addbacks: only.applied_addbacks,
      applied_haircuts: [],
      flags: ["insufficient_history_self_employment"],
      derivation_lines: [
        ...only.derivation_lines,
        `Only one year supplied (${only.tax_year}); using single-year figure (flagged: <2yr history).`,
      ],
    };
  }
  const [current, prior] = sorted; // only most-recent two drive the calc (rules-v0.1.0 §6.14)
  const lines = [...current.derivation_lines, ...prior.derivation_lines];
  const avg = (current.adjusted_annual + prior.adjusted_annual) / 2;
  lines.push(
    `Two-year average = (${roundHalfUp(current.adjusted_annual, 2).toFixed(2)} + ${roundHalfUp(prior.adjusted_annual, 2).toFixed(2)}) / 2 = ${roundHalfUp(avg, 2).toFixed(2)}`,
  );
  if (current.adjusted_annual >= prior.adjusted_annual) {
    lines.push(
      `Most recent year >= prior year (flat/rising): use 2-yr average = ${roundHalfUp(avg, 2).toFixed(2)}`,
    );
    return {
      qualifying_annual: avg,
      applied_addbacks: [...current.applied_addbacks, ...prior.applied_addbacks],
      applied_haircuts: [],
      flags: [],
      derivation_lines: lines,
    };
  }
  // Declining: use current-year, NOT averaged-up (rules-v0.1.0 §6.15)
  const decline_pct = roundHalfUp(
    ((prior.adjusted_annual - current.adjusted_annual) / prior.adjusted_annual) *
      100,
    1,
  );
  lines.push(
    `Most recent year < prior year (declining ${decline_pct.toFixed(1)}%): use current-year (lower) figure = ${roundHalfUp(current.adjusted_annual, 2).toFixed(2)} instead of average ${roundHalfUp(avg, 2).toFixed(2)}`,
  );
  return {
    qualifying_annual: current.adjusted_annual,
    applied_addbacks: current.applied_addbacks,
    applied_haircuts: [
      {
        name: "declining_self_employment_income",
        // Fixture format: "...declined 28.0% YoY..." — fixed 1-decimal.
        reason: `net income declined ${decline_pct.toFixed(1)}% YoY; using current-year figure`,
        from: roundHalfUp(avg, 2),
        to: roundHalfUp(current.adjusted_annual, 2),
        decline_pct,
      },
    ],
    flags: [],
    derivation_lines: lines,
  };
}

// -----------------------------------------------------------------
// 6.21 dual_agency_presentation
// -----------------------------------------------------------------
export function presentDualAgency(
  monthly: number,
  annual: number,
): MethodResults {
  // Phase 1: Fannie and Freddie are identical. Phase 2 will diverge for
  // commission 2106, K-1, rental — at which point this fans out per type.
  return {
    fannie_monthly: roundHalfUp(monthly, 2),
    freddie_monthly: roundHalfUp(monthly, 2),
    fannie_annual: roundHalfUp(annual, 2),
    freddie_annual: roundHalfUp(annual, 2),
  };
}

// -----------------------------------------------------------------
// W-2 orchestrator (rules 6.1 - 6.6)
// -----------------------------------------------------------------
export interface W2Result {
  monthly: number;
  components: IncomeComponent[];
  applied_haircuts: AppliedHaircut[];
  flags: CalcFlag[];
  derivation_lines: string[];
}

export function computeW2(args: {
  paystub: {
    pay_frequency: PayFrequency;
    base_pay_current: number;
  };
  variable_income?: {
    months_ytd: number;
    overtime?: VariableIncomeBlock;
    bonus?: VariableIncomeBlock;
    commission?: VariableIncomeBlock;
  };
}): W2Result {
  const lines: string[] = [];
  const components: IncomeComponent[] = [];
  const haircuts: AppliedHaircut[] = [];
  const flags: CalcFlag[] = [];

  const baseMonthly = w2BaseMonthly(args.paystub);
  components.push({ name: "base", monthly: roundHalfUp(baseMonthly, 2) });
  lines.push(
    `Base: ${args.paystub.base_pay_current} (${args.paystub.pay_frequency}, ${periodsPerYear(args.paystub.pay_frequency)} periods/yr) x ${periodsPerYear(args.paystub.pay_frequency)} / 12 = ${roundHalfUp(baseMonthly, 2).toFixed(2)}/mo`,
  );

  let variableMonthly = 0;
  let commissionMonthlyForGate = 0; // tracked separately for the 25% gate
  const vi = args.variable_income;
  if (vi && typeof vi.months_ytd === "number" && vi.months_ytd > 0) {
    const months_ytd = vi.months_ytd;

    if (vi.overtime) {
      const avg = variableIncome24MoAvgMonthly({ ...vi.overtime, months_ytd });
      lines.push(
        `overtime: 24-mo avg = (prior ${vi.overtime.prior_year_amount} + YTD ${vi.overtime.ytd_amount}) / (12 + ${months_ytd}) = ${roundHalfUp(avg, 2).toFixed(2)}/mo`,
      );
      const { qualifying_monthly, haircut } = variableIncomeWithHaircut({
        vtype: "overtime",
        block: vi.overtime,
        months_ytd,
      });
      if (haircut) {
        lines.push(
          `overtime: declining (run-rate ${roundHalfUp(vi.overtime.ytd_amount / months_ytd, 2).toFixed(2)}/mo < prior-yr ${roundHalfUp(vi.overtime.prior_year_amount / 12, 2).toFixed(2)}/mo, -${haircut.decline_pct.toFixed(1)}%): use current run-rate = ${roundHalfUp(qualifying_monthly, 2).toFixed(2)}/mo`,
        );
        haircuts.push(haircut);
      } else {
        lines.push(
          `overtime: run-rate ${roundHalfUp(vi.overtime.ytd_amount / months_ytd, 2).toFixed(2)}/mo >= prior-yr ${roundHalfUp(vi.overtime.prior_year_amount / 12, 2).toFixed(2)}/mo (flat/rising): use 24-mo avg = ${roundHalfUp(qualifying_monthly, 2).toFixed(2)}/mo`,
        );
      }
      components.push({ name: "overtime", monthly: roundHalfUp(qualifying_monthly, 2) });
      variableMonthly += qualifying_monthly;
    }

    if (vi.commission) {
      const avg = variableIncome24MoAvgMonthly({ ...vi.commission, months_ytd });
      lines.push(
        `commission: 24-mo avg = (prior ${vi.commission.prior_year_amount} + YTD ${vi.commission.ytd_amount}) / (12 + ${months_ytd}) = ${roundHalfUp(avg, 2).toFixed(2)}/mo`,
      );
      const { qualifying_monthly, haircut } = variableIncomeWithHaircut({
        vtype: "commission",
        block: vi.commission,
        months_ytd,
      });
      if (haircut) {
        lines.push(
          `commission: declining (run-rate ${roundHalfUp(vi.commission.ytd_amount / months_ytd, 2).toFixed(2)}/mo < prior-yr ${roundHalfUp(vi.commission.prior_year_amount / 12, 2).toFixed(2)}/mo, -${haircut.decline_pct.toFixed(1)}%): use current run-rate = ${roundHalfUp(qualifying_monthly, 2).toFixed(2)}/mo`,
        );
        haircuts.push(haircut);
      } else {
        lines.push(
          `commission: run-rate ${roundHalfUp(vi.commission.ytd_amount / months_ytd, 2).toFixed(2)}/mo >= prior-yr ${roundHalfUp(vi.commission.prior_year_amount / 12, 2).toFixed(2)}/mo (flat/rising): use 24-mo avg = ${roundHalfUp(qualifying_monthly, 2).toFixed(2)}/mo`,
        );
      }
      components.push({ name: "commission", monthly: roundHalfUp(qualifying_monthly, 2) });
      variableMonthly += qualifying_monthly;
      commissionMonthlyForGate = qualifying_monthly;
    }

    if (vi.bonus) {
      // 6.4 bonus is straight-averaged AND exempt from the declining haircut.
      const avg = variableIncome24MoAvgMonthly({ ...vi.bonus, months_ytd });
      lines.push(
        `bonus: 24-mo avg = (prior ${vi.bonus.prior_year_amount} + YTD ${vi.bonus.ytd_amount}) / (12 + ${months_ytd}) = ${roundHalfUp(avg, 2).toFixed(2)}/mo`,
      );
      components.push({ name: "bonus", monthly: roundHalfUp(avg, 2) });
      variableMonthly += avg;
    }
  }

  const totalMonthly = baseMonthly + variableMonthly;

  // 6.6 commission ≥ 25% gate — checked AFTER all variable components are tallied.
  if (
    commissionMonthlyForGate > 0 &&
    commission25PctFlagApplies({
      commission_monthly: commissionMonthlyForGate,
      total_monthly_income: totalMonthly,
    })
  ) {
    flags.push("commission_ge_25pct_requires_tax_returns");
  }

  lines.push(
    `Total monthly = base ${roundHalfUp(baseMonthly, 2).toFixed(2)} + variable ${roundHalfUp(variableMonthly, 2).toFixed(2)} = ${roundHalfUp(totalMonthly, 2).toFixed(2)}`,
  );
  return {
    monthly: totalMonthly,
    components,
    applied_haircuts: haircuts,
    flags,
    derivation_lines: lines,
  };
}
