// Server component. Spec v7 §4.6. Side-by-side Fannie/Freddie cards.
// Phase 1 emits identical figures from both agencies; the disclaimer at the
// bottom names this. Phase 2 will fan out when method_results actually
// diverge (commission 2106, K-1, rental).

import type { MethodResults } from "@/lib/income-calc/types";

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function MethodResultsCard({
  methodResults,
}: {
  methodResults: MethodResults;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AgencyCard
        name="Fannie Mae"
        monthly={methodResults.fannie_monthly}
        annual={methodResults.fannie_annual}
      />
      <AgencyCard
        name="Freddie Mac"
        monthly={methodResults.freddie_monthly}
        annual={methodResults.freddie_annual}
      />
      <p className="col-span-full text-xs text-gray-500">
        Phase 1: both agencies use the same arithmetic, so the figures match.
        They&rsquo;ll diverge when commission expenses, K-1 distributions, and
        rental income enter the picture.
      </p>
    </div>
  );
}

function AgencyCard({
  name,
  monthly,
  annual,
}: {
  name: string;
  monthly: number;
  annual: number;
}) {
  return (
    <div className="rounded-lg border border-gray-300 p-4">
      <p className="text-sm font-semibold text-gray-600">
        {name} sees your income as
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        ${formatMoney(monthly)}/mo
      </p>
      <p className="text-sm text-gray-500">${formatMoney(annual)}/yr</p>
    </div>
  );
}
