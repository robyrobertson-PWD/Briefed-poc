// Server component. Spec v7 §4.4. Stitches the aha screen together:
// verdict (computed against the loan scenario), dual-agency cards,
// income-components breakdown, missing-inputs checklist, and the
// inline loan-scenario edit. Renders gracefully when the engine has
// never run yet (output is null).

import type { EmploymentType } from "@/lib/income-calc/types";
import type {
  IncomeOutputRow,
  LoanScenarioState,
} from "@/lib/borrower-inputs/read";
import {
  computeMonthlyPI,
  computeVerdict,
  neededMonthlyIncomeForPayment,
} from "@/lib/loan-calc/payment";
import { VerdictCard } from "./verdict-card";
import { MethodResultsCard } from "./method-results-card";
import { IncomeComponentsCard } from "./income-components-card";
import { MissingInputsList } from "./missing-inputs-list";
import { LoanScenarioEdit } from "./loan-scenario-edit";

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AhaScreen(props: {
  output: IncomeOutputRow | null;
  employmentType: EmploymentType;
  loanScenario: LoanScenarioState;
}) {
  const s = props.loanScenario;
  // /income's router gates on isLoanScenarioComplete(s), so the four values
  // are non-null here; the `as number` casts honor that runtime guarantee.
  const payment = computeMonthlyPI({
    price: s.price as number,
    down_payment: s.down_payment as number,
    interest_rate: s.interest_rate as number,
    term_years: s.term_years as number,
  });
  const needed = neededMonthlyIncomeForPayment(payment.monthly_payment_pi);
  const verdict = computeVerdict({
    qualifying_monthly: props.output?.qualifying_income_monthly ?? 0,
    needed_monthly: needed,
  });

  return (
    <div className="space-y-6">
      <VerdictCard
        verdict={verdict}
        loanScenario={s}
        paymentPI={payment.monthly_payment_pi}
        engineFlags={props.output?.flags ?? []}
      />

      {props.output ? (
        <MethodResultsCard methodResults={props.output.method_results} />
      ) : null}

      {props.output?.income_components &&
      props.output.income_components.length > 0 ? (
        <IncomeComponentsCard components={props.output.income_components} />
      ) : null}

      {props.output?.reported_gross_1099 != null ? (
        <div className="rounded-lg bg-gray-50 p-4 text-sm">
          <strong>1099 gross income:</strong> $
          {formatMoney(props.output.reported_gross_1099)}/yr
          <p className="mt-1 text-gray-600">
            This is informational only. Qualifying income comes from your
            Schedule C (or a verified estimate), not from the gross 1099.
          </p>
        </div>
      ) : null}

      {props.output && props.output.missing_inputs.length > 0 ? (
        <MissingInputsList
          missingInputs={props.output.missing_inputs}
          taxYearHint={inferTaxYearForUserImputed(props.output)}
        />
      ) : null}

      <LoanScenarioEdit current={s} />

      <ComingSoonPillars />
    </div>
  );
}

// Helper kept for future expansion per spec §4.4. Each MissingInputsList row
// currently infers tax_year from its own scope (e.g., 'user_imputed:2023'),
// so the hint at the orchestrator level is a no-op. Wired through so that
// when the contract matures we can hoist year inference here.
function inferTaxYearForUserImputed(_output: IncomeOutputRow): undefined {
  return undefined;
}

function ComingSoonPillars() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
      <p className="font-semibold text-gray-700">Next: the full picture</p>
      <p className="mt-1">
        Qualifying income is the first of four pillars lenders look at.
        Briefed will add credit, the property, and your reserves in upcoming
        releases.
      </p>
    </div>
  );
}
