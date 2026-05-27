import { describe, expect, it } from "vitest";
import {
  computeMonthlyPI,
  computeVerdict,
  DTI_CEILING_PHASE_1,
  neededMonthlyIncomeForPayment,
} from "@/lib/loan-calc/payment";

describe("computeMonthlyPI", () => {
  it("$500K / $100K down / 7.25% / 30yr → ~$2,728.71/mo P&I", () => {
    const { monthly_payment_pi } = computeMonthlyPI({
      price: 500000,
      down_payment: 100000,
      interest_rate: 7.25,
      term_years: 30,
    });
    expect(monthly_payment_pi).toBeCloseTo(2728.71, 1);
  });

  it("0% interest falls back to straight-line", () => {
    const { monthly_payment_pi } = computeMonthlyPI({
      price: 120000,
      down_payment: 0,
      interest_rate: 0,
      term_years: 10,
    });
    expect(monthly_payment_pi).toBe(1000);
  });

  it("down_payment >= price → $0 payment, $0 principal", () => {
    const { principal, monthly_payment_pi } = computeMonthlyPI({
      price: 500000,
      down_payment: 500000,
      interest_rate: 7.25,
      term_years: 30,
    });
    expect(principal).toBe(0);
    expect(monthly_payment_pi).toBe(0);
  });
});

describe("neededMonthlyIncomeForPayment", () => {
  it("uses 0.45 DTI ceiling by default", () => {
    expect(neededMonthlyIncomeForPayment(2728.71)).toBe(6063.8);
  });

  it("respects override", () => {
    expect(neededMonthlyIncomeForPayment(2728.71, 0.36)).toBeCloseTo(
      7579.75,
      1,
    );
  });

  it("DTI_CEILING_PHASE_1 is 0.45", () => {
    expect(DTI_CEILING_PHASE_1).toBe(0.45);
  });
});

describe("computeVerdict", () => {
  it("qualifying >= needed → 'qualified', positive gap", () => {
    const v = computeVerdict({
      qualifying_monthly: 7500,
      needed_monthly: 6063.8,
    });
    expect(v.status).toBe("qualified");
    expect(v.gap).toBeCloseTo(1436.2, 1);
  });

  it("qualifying < needed → 'short', negative gap", () => {
    const v = computeVerdict({
      qualifying_monthly: 5000,
      needed_monthly: 6063.8,
    });
    expect(v.status).toBe("short");
    expect(v.gap).toBeCloseTo(-1063.8, 1);
  });

  it("needed = 0 → 'no_loan'", () => {
    const v = computeVerdict({ qualifying_monthly: 7500, needed_monthly: 0 });
    expect(v.status).toBe("no_loan");
  });

  it("qualifying = 0 + needed > 0 → 'no_income'", () => {
    const v = computeVerdict({
      qualifying_monthly: 0,
      needed_monthly: 6063.8,
    });
    expect(v.status).toBe("no_income");
    expect(v.gap).toBeCloseTo(-6063.8, 1);
  });
});
