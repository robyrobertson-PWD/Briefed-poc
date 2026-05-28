// Server component. Spec v7 §4.7. Shows the W-2 income breakdown: base
// salary + variable components (24-month-averaged overtime / bonus /
// commission). Renders nothing for self-employment / 1099 paths — those
// have no income_components in the engine output (null).

import type { IncomeComponent } from "@/lib/income-calc/types";

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const LABELS: Record<IncomeComponent["name"], string> = {
  base: "Base salary",
  overtime: "Overtime (24-month average)",
  bonus: "Bonus (24-month average)",
  commission: "Commission (24-month average)",
};

export function IncomeComponentsCard({
  components,
}: {
  components: IncomeComponent[];
}) {
  if (components.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-300 p-4">
      <p className="font-semibold text-gray-900">How we got there</p>
      <ul className="mt-2 space-y-1 text-sm">
        {components.map((c) => (
          <li key={c.name} className="flex justify-between">
            <span className="text-gray-700">{LABELS[c.name]}</span>
            <span className="font-mono text-gray-900">
              ${formatMoney(c.monthly)}/mo
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
