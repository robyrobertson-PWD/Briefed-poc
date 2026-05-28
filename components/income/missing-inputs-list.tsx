"use client";

// Spec v7 §4.8. Renders each missing_input as a small inline form. On
// submit, calls saveBorrowerInput which re-runs the engine and revalidates
// /income. Two field-type special cases:
//   - field='tax_return' → renders a Link to /documents (Path C upload)
//   - everything else    → number input + Save button

import Link from "next/link";
import { useState } from "react";
import type { MissingInput } from "@/lib/income-calc/types";
import { saveBorrowerInput } from "@/lib/actions/borrower-inputs";

export function MissingInputsList(props: {
  missingInputs: MissingInput[];
  // Reserved for future use — currently each row infers tax_year from its
  // own scope (e.g., 'user_imputed:2023'). Kept on the props to match the
  // spec's signature.
  taxYearHint?: number;
}) {
  const grouped = groupByScope(props.missingInputs);
  return (
    <div className="rounded-lg border border-gray-300 p-4">
      <p className="font-semibold text-gray-900">Sharpen your estimate</p>
      <p className="mt-1 text-sm text-gray-600">
        Add any of the following to improve your qualifying-income figure.
        Items marked <em>required</em> are needed for a verified result.
      </p>
      <div className="mt-4 space-y-4">
        {Object.entries(grouped).map(([scope, items]) => (
          <ScopeBlock key={scope} scope={scope} items={items} />
        ))}
      </div>
    </div>
  );
}

function ScopeBlock({
  scope,
  items,
}: {
  scope: string;
  items: MissingInput[];
}) {
  // user_imputed:2023 → 2023; otherwise null (the row's not year-scoped).
  const taxYear = scope.includes(":")
    ? Number.parseInt(scope.split(":")[1], 10)
    : null;
  return (
    <div className="border-t border-gray-200 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {humanizeScope(scope)}
      </p>
      <div className="mt-2 space-y-2">
        {items.map((it) => (
          <MissingInputRow
            key={`${it.scope}.${it.field}`}
            input={it}
            taxYear={taxYear}
          />
        ))}
      </div>
    </div>
  );
}

function MissingInputRow({
  input,
  taxYear,
}: {
  input: MissingInput;
  taxYear: number | null;
}) {
  const [value, setValue] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // field='tax_return' is a documents-upload prompt, not a typed input.
  if (input.field === "tax_return") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="text-sm text-gray-800">
            {humanizeField(input.field)}
            {input.severity === "critical" ? (
              <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                required
              </span>
            ) : null}
          </p>
          <p className="text-xs text-gray-500">{input.reason}</p>
        </div>
        <Link
          href="/documents"
          className="rounded bg-green-700 px-3 py-1 text-sm font-semibold text-white hover:bg-green-800"
        >
          Upload
        </Link>
      </div>
    );
  }

  const onSubmit = async () => {
    setBusy(true);
    setErr(null);
    const n = parseFloat(value);
    if (!Number.isFinite(n)) {
      setErr("must be a number");
      setBusy(false);
      return;
    }
    const res = await saveBorrowerInput({
      scope: input.scope,
      field: input.field,
      tax_year: taxYear,
      value: n,
    });
    if (!res.ok) {
      setErr(res.error);
      setBusy(false);
    }
    // On success: server action revalidates /income; this row's parent
    // re-renders with a fresh income_outputs and the row likely disappears.
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <p className="text-sm text-gray-800">
          {humanizeField(input.field)}
          {input.severity === "critical" ? (
            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
              required
            </span>
          ) : null}
        </p>
        <p className="text-xs text-gray-500">{input.reason}</p>
      </div>
      <input
        type="text"
        inputMode="decimal"
        placeholder="$ amount"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <button
        type="button"
        disabled={busy || !value}
        onClick={onSubmit}
        className="rounded bg-green-700 px-3 py-1 text-sm font-semibold text-white hover:bg-green-800 disabled:bg-gray-400"
      >
        {busy ? "…" : "Save"}
      </button>
      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </div>
  );
}

// ----- helpers ----------------------------------------------------

function groupByScope(items: MissingInput[]): Record<string, MissingInput[]> {
  const out: Record<string, MissingInput[]> = {};
  for (const it of items) {
    (out[it.scope] ??= []).push(it);
  }
  return out;
}

function humanizeScope(scope: string): string {
  if (scope === "profile") return "About you";
  if (scope === "paystub") return "From your paystub";
  if (scope === "documents") return "Documents to upload";
  if (scope.startsWith("variable_income.")) {
    return `Variable income — ${scope.split(".")[1]}`;
  }
  if (scope.startsWith("tax_return:")) return `Tax return ${scope.split(":")[1]}`;
  if (scope.startsWith("user_imputed:")) {
    return `Your ${scope.split(":")[1]} estimate`;
  }
  return scope;
}

function humanizeField(field: string): string {
  // Expand this table as fields proliferate. Falling back to the raw field
  // name (underscores → spaces) is safe; this is just polish.
  const TABLE: Record<string, string> = {
    employment_type: "Employment type",
    base_pay_current: "Current base pay",
    base_pay_ytd: "Year-to-date base pay",
    gross_pay_current: "Current gross pay",
    pay_period_end: "Pay period end date",
    pay_frequency: "Pay frequency",
    months_ytd: "Months of YTD data",
    prior_year_amount: "Prior-year amount",
    ytd_amount: "Year-to-date amount",
    schedule_c_net_profit: "Schedule C net profit",
    schedule_c_depreciation: "Schedule C depreciation",
    schedule_c_depletion: "Schedule C depletion",
    schedule_c_amortization_casualty: "Amortization / casualty loss",
    schedule_c_business_use_home: "Business use of home (Form 8829)",
    schedule_c_business_miles: "Business miles driven",
    meals_entertainment_nondeductible: "Non-deductible meals/entertainment",
    nonrecurring_other_income: "Non-recurring income",
    estimated_net_profit: "Estimated net profit",
    estimated_depreciation: "Estimated depreciation",
    estimated_depletion: "Estimated depletion",
    estimated_amortization_casualty: "Estimated amortization / casualty",
    estimated_business_use_of_home: "Estimated business use of home",
    estimated_business_miles: "Estimated business miles",
    estimated_meals_entertainment_nondeductible:
      "Estimated meals/entertainment",
    estimated_nonrecurring_other_income: "Estimated non-recurring income",
    tax_return: "Tax return (Schedule C)",
  };
  return TABLE[field] ?? field.replace(/_/g, " ");
}
