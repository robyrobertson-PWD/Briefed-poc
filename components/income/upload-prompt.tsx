// Server component. Shown after employment_type + loan_scenario are set but
// before any document has been confirmed. Surfaces the loan summary + a CTA
// to /documents. PR 4b state 3.

import Link from "next/link";
import type { EmploymentType } from "@/lib/income-calc/types";
import type { LoanScenarioState } from "@/lib/borrower-inputs/read";
import {
  computeMonthlyPI,
  neededMonthlyIncomeForPayment,
} from "@/lib/loan-calc/payment";

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

const UPLOAD_COPY: Record<EmploymentType, string> = {
  w2: "Upload your two most recent paystubs and your most recent W-2.",
  sole_prop: "Upload your two most recent tax returns (Schedule C).",
  "1099":
    "Upload your most recent 1099 and (if available) your tax return with Schedule C.",
  s_corp: "Upload the income documents you have.",
  partnership: "Upload the income documents you have.",
  mixed: "Upload the income documents you have.",
};

export function UploadPrompt(props: {
  employmentType: EmploymentType;
  loanScenario: LoanScenarioState;
  notice?: string;
}) {
  const s = props.loanScenario;
  const complete =
    typeof s.price === "number" &&
    typeof s.down_payment === "number" &&
    typeof s.interest_rate === "number" &&
    typeof s.term_years === "number";

  // `complete` narrows all four to `number` for the engine, but TS doesn't
  // track that across object access — assert here, guarded by the runtime
  // check above.
  const payment = complete
    ? computeMonthlyPI({
        price: s.price as number,
        down_payment: s.down_payment as number,
        interest_rate: s.interest_rate as number,
        term_years: s.term_years as number,
      })
    : null;
  const needed = payment
    ? neededMonthlyIncomeForPayment(payment.monthly_payment_pi)
    : null;

  return (
    <div className="space-y-6">
      {payment && needed && complete ? (
        <div className="rounded-lg border border-green-700 bg-green-50 p-4">
          <p className="text-sm text-gray-700">
            For your <strong>${formatInt(s.price as number)}</strong> home with{" "}
            <strong>${formatInt(s.down_payment as number)}</strong> down at{" "}
            <strong>{s.interest_rate}%</strong> over{" "}
            <strong>{s.term_years} years</strong>:
          </p>
          <p className="mt-2 text-gray-900">
            Monthly payment (P&amp;I):{" "}
            <strong>${formatMoney(payment.monthly_payment_pi)}</strong>
          </p>
          <p className="text-gray-900">
            Income needed to qualify (at 45% DTI):{" "}
            <strong>${formatMoney(needed)}/mo</strong>
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-300 p-4">
        <h2 className="font-semibold text-gray-900">
          Now, let&rsquo;s see if you qualify.
        </h2>
        <p className="mt-1 text-sm text-gray-700">
          {UPLOAD_COPY[props.employmentType]}
        </p>
        <Link
          href="/documents"
          className="mt-3 inline-block rounded-lg bg-green-700 px-6 py-2 font-semibold text-white hover:bg-green-800"
        >
          Upload documents
        </Link>
      </div>

      {props.notice ? (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {props.notice}
        </div>
      ) : null}
    </div>
  );
}
