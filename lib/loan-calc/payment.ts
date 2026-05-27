// Loan-calc — payment math, DTI math, qualifying-vs-needed verdict. Pure
// module; no I/O, no Supabase, no Anthropic. Surfaced from /income's aha
// screen (PR 4c) and used by the loan-scenario step's live preview (PR 4b).
//
// Phase 1 simplifications (locked by Engineering Architect, spec v7 top
// matter):
//   - Back-end DTI only; no front-end check, no PITI (P&I only).
//   - DTI ceiling hardcoded at 0.45 (DTI_CEILING_PHASE_1).
//   - Fannie/Freddie/FHA/VA divergence comes in a later spec when
//     income method_results actually diverge.

import { roundHalfUp } from "@/lib/util/round";

export interface LoanScenario {
  price: number; // home price, dollars
  down_payment: number; // dollars
  interest_rate: number; // annual percentage, e.g., 7.25
  term_years: number; // integer, e.g., 30
}

export interface PaymentResult {
  principal: number; // price - down_payment
  monthly_payment_pi: number; // principal & interest only (no PITI in Phase 1)
}

// Standard amortization formula. r = monthly rate, n = number of payments.
// Edge cases:
//   principal <= 0  →  zeros out (down_payment >= price)
//   r === 0         →  straight-line (principal / n)
//   n <= 0          →  zeros out (term_years <= 0)
export function computeMonthlyPI(s: LoanScenario): PaymentResult {
  const principal = s.price - s.down_payment;
  if (principal <= 0) return { principal: 0, monthly_payment_pi: 0 };
  if (!Number.isFinite(s.interest_rate) || !Number.isFinite(s.term_years)) {
    throw new Error("interest_rate and term_years must be finite numbers");
  }
  const n = s.term_years * 12;
  if (n <= 0) return { principal, monthly_payment_pi: 0 };
  const r = s.interest_rate / 100 / 12;
  if (r === 0) {
    return { principal, monthly_payment_pi: roundHalfUp(principal / n, 2) };
  }
  const payment =
    (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
  return { principal, monthly_payment_pi: roundHalfUp(payment, 2) };
}

// Phase 1 hardcoded ceiling. Agency-aware ceilings (Fannie vs Freddie, FHA,
// VA) come in a future spec when method_results actually diverge.
export const DTI_CEILING_PHASE_1 = 0.45;

export function neededMonthlyIncomeForPayment(
  monthly_payment: number,
  dti_ceiling: number = DTI_CEILING_PHASE_1,
): number {
  if (dti_ceiling <= 0) throw new Error("dti_ceiling must be > 0");
  return roundHalfUp(monthly_payment / dti_ceiling, 2);
}

export type VerdictStatus = "qualified" | "short" | "no_loan" | "no_income";

export interface Verdict {
  status: VerdictStatus;
  qualifying_monthly: number;
  needed_monthly: number;
  // qualifying - needed. Positive = surplus, negative = shortfall.
  gap: number;
}

export function computeVerdict(args: {
  qualifying_monthly: number;
  needed_monthly: number;
}): Verdict {
  const { qualifying_monthly, needed_monthly } = args;
  if (needed_monthly <= 0) {
    return { status: "no_loan", qualifying_monthly, needed_monthly, gap: 0 };
  }
  if (qualifying_monthly <= 0) {
    return {
      status: "no_income",
      qualifying_monthly,
      needed_monthly,
      gap: -needed_monthly,
    };
  }
  if (qualifying_monthly >= needed_monthly) {
    return {
      status: "qualified",
      qualifying_monthly,
      needed_monthly,
      gap: roundHalfUp(qualifying_monthly - needed_monthly, 2),
    };
  }
  return {
    status: "short",
    qualifying_monthly,
    needed_monthly,
    gap: roundHalfUp(qualifying_monthly - needed_monthly, 2), // negative
  };
}
