"use client";

// Spec v7 §4.9. Inline loan-scenario edit on the aha screen. Collapsed by
// default to a one-line summary; expands to the same NumberField form as
// LoanScenarioStep. Reuses saveLoanScenario from PR 4b — the engine
// re-runs and the verdict re-renders on success.

import { useMemo, useState } from "react";
import { saveLoanScenario } from "@/lib/actions/borrower-inputs";
import { computeMonthlyPI } from "@/lib/loan-calc/payment";
import type { LoanScenarioState } from "@/lib/borrower-inputs/read";
import { NumberField } from "./number-field";

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function LoanScenarioEdit({
  current,
}: {
  current: LoanScenarioState;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<number>(current.price ?? 0);
  const [down, setDown] = useState<number>(current.down_payment ?? 0);
  const [rate, setRate] = useState<number>(current.interest_rate ?? 0);
  const [term, setTerm] = useState<number>(current.term_years ?? 30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => {
    try {
      return computeMonthlyPI({
        price,
        down_payment: down,
        interest_rate: rate,
        term_years: term,
      });
    } catch {
      return null;
    }
  }, [price, down, rate, term]);

  if (!open) {
    return (
      <div className="rounded-lg border border-gray-300 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Your loan</p>
            <p className="text-sm text-gray-600">
              ${current.price?.toLocaleString("en-US") ?? "—"} home,{" "}
              ${current.down_payment?.toLocaleString("en-US") ?? "—"} down,{" "}
              {current.interest_rate ?? "—"}% over {current.term_years ?? "—"} years
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-semibold text-green-700 hover:text-green-800"
          >
            Different home?
          </button>
        </div>
      </div>
    );
  }

  const onSave = async () => {
    setBusy(true);
    setErr(null);
    const res = await saveLoanScenario({
      price,
      down_payment: down,
      interest_rate: rate,
      term_years: term,
    });
    if (!res.ok) {
      setErr(res.error);
      setBusy(false);
      return;
    }
    setOpen(false);
    setBusy(false);
    // The server action revalidated /income; the parent server component
    // re-reads the loan scenario + the new income_outputs and re-renders.
  };

  return (
    <div className="space-y-4 rounded-lg border border-gray-300 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Update your loan</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
      <NumberField
        label="Home price"
        value={price}
        onChange={setPrice}
        prefix="$"
        min={1}
      />
      <NumberField
        label="Down payment"
        value={down}
        onChange={setDown}
        prefix="$"
        min={0}
      />
      <NumberField
        label="Interest rate"
        value={rate}
        onChange={setRate}
        suffix="%"
        min={0}
        step={0.125}
      />
      <NumberField
        label="Term (years)"
        value={term}
        onChange={setTerm}
        min={1}
        max={50}
        step={1}
        integer
      />
      {preview ? (
        <div className="rounded bg-gray-50 p-3 text-sm text-gray-700">
          New estimated monthly payment (P&amp;I):{" "}
          <strong className="text-gray-900">
            ${formatMoney(preview.monthly_payment_pi)}
          </strong>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:bg-gray-400"
      >
        {busy ? "Saving…" : "Save & recalculate"}
      </button>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
