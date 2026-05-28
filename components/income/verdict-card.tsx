// Server component. Spec v7 §4.5. Renders the qualifying-vs-needed verdict
// or — if the engine emitted a "soft" flag — a nudge toward what's still
// missing instead of yelling "$0 qualifying" at the user.
//
// Branch precedence:
//   1. not_yet_supported (s_corp / partnership / mixed) wins copy
//   2. pending_schedule_c (1099 Path B/C, no Schedule C yet)
//   3. employment_type_pending (no employment_type captured)
//   4. normal verdict (qualified / short / no_loan / no_income)

import type { CalcFlag } from "@/lib/income-calc/types";
import type { Verdict } from "@/lib/loan-calc/payment";
import type { LoanScenarioState } from "@/lib/borrower-inputs/read";

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function VerdictCard(props: {
  verdict: Verdict;
  loanScenario: LoanScenarioState;
  paymentPI: number;
  engineFlags: CalcFlag[];
}) {
  // Soft-state paths take precedence over the arithmetic verdict.
  if (props.engineFlags.includes("not_yet_supported")) {
    return (
      <SoftCard
        headline="We don't yet support your employment type"
        body="We're adding more employment types soon. For now, your file would need a manual review."
      />
    );
  }
  if (props.engineFlags.includes("pending_schedule_c")) {
    return (
      <SoftCard
        headline="We need a bit more from you"
        body="We've accepted your 1099 as a supporting document. To compute your qualifying income, share your Schedule C or estimate your net profit below."
      />
    );
  }
  if (props.engineFlags.includes("employment_type_pending")) {
    return (
      <SoftCard
        headline="Tell us your employment type"
        body="Pick how you earn most of your income so we can route your file correctly."
      />
    );
  }

  const { verdict } = props;
  const tone =
    verdict.status === "qualified"
      ? {
          border: "border-green-700",
          bg: "bg-green-50",
          text: "text-green-900",
          headline: "You qualify",
        }
      : verdict.status === "short"
        ? {
            border: "border-red-600",
            bg: "bg-red-50",
            text: "text-red-900",
            headline: `You're short by $${formatMoney(Math.abs(verdict.gap))}/mo`,
          }
        : verdict.status === "no_income"
          ? {
              border: "border-amber-300",
              bg: "bg-amber-50",
              text: "text-amber-900",
              headline: "We need your income documents to compute a verdict",
            }
          : {
              border: "border-gray-300",
              bg: "bg-gray-50",
              text: "text-gray-900",
              headline: "Enter loan details to see your verdict",
            };

  return (
    <div className={`rounded-lg border-2 ${tone.border} ${tone.bg} p-6`}>
      <h2 className={`text-2xl font-bold ${tone.text}`}>{tone.headline}</h2>
      <div className="mt-3 space-y-1 text-sm text-gray-700">
        <p>
          Monthly payment (P&amp;I):{" "}
          <strong>${formatMoney(props.paymentPI)}</strong>
        </p>
        <p>
          Income needed (45% DTI):{" "}
          <strong>${formatMoney(verdict.needed_monthly)}/mo</strong>
        </p>
        <p>
          Your qualifying income:{" "}
          <strong>${formatMoney(verdict.qualifying_monthly)}/mo</strong>
        </p>
      </div>
    </div>
  );
}

function SoftCard({ headline, body }: { headline: string; body: string }) {
  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-6">
      <h2 className="text-xl font-bold text-amber-900">{headline}</h2>
      <p className="mt-2 text-amber-900">{body}</p>
    </div>
  );
}
