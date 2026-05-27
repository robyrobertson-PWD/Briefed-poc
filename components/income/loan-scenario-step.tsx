"use client";

// Spec v7 §3.8. Second wizard step: capture price / down_payment /
// interest_rate / term_years. Live-previews the monthly P&I as the user
// types using the pure module from PR 4a (lib/loan-calc/payment).
//
// `import type` on LoanScenarioState keeps lib/borrower-inputs/read.ts
// (which transitively pulls server-only) erased at the client bundle.

import { useMemo, useState } from "react";
import { saveLoanScenario } from "@/lib/actions/borrower-inputs";
import { computeMonthlyPI } from "@/lib/loan-calc/payment";
import type { LoanScenarioState } from "@/lib/borrower-inputs/read";

export function LoanScenarioStep({ current }: { current: LoanScenarioState }) {
  const [price, setPrice] = useState<number>(current.price ?? 500000);
  const [downPayment, setDownPayment] = useState<number>(
    current.down_payment ?? 100000,
  );
  const [interestRate, setInterestRate] = useState<number>(
    current.interest_rate ?? 7.25,
  );
  const [termYears, setTermYears] = useState<number>(current.term_years ?? 30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => {
    try {
      return computeMonthlyPI({
        price,
        down_payment: downPayment,
        interest_rate: interestRate,
        term_years: termYears,
      });
    } catch {
      return null;
    }
  }, [price, downPayment, interestRate, termYears]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await saveLoanScenario({
      price,
      down_payment: downPayment,
      interest_rate: interestRate,
      term_years: termYears,
    });
    if (!res.ok) {
      setErr(res.error);
      setBusy(false);
    }
    // On success: server action revalidates /income; component unmounts.
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <NumberField
        label="Home price"
        value={price}
        onChange={setPrice}
        prefix="$"
        min={1}
      />
      <NumberField
        label="Down payment"
        value={downPayment}
        onChange={setDownPayment}
        prefix="$"
        min={0}
      />
      <NumberField
        label="Interest rate"
        value={interestRate}
        onChange={setInterestRate}
        suffix="%"
        min={0}
        step={0.125}
      />
      <NumberField
        label="Term (years)"
        value={termYears}
        onChange={setTermYears}
        min={1}
        max={50}
        step={1}
        integer
      />
      {preview ? (
        <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
          Estimated monthly payment (principal &amp; interest):{" "}
          <strong className="text-gray-900">
            $
            {preview.monthly_payment_pi.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </strong>
        </div>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-green-700 px-6 py-2 font-semibold text-white hover:bg-green-800 disabled:bg-gray-400"
      >
        {busy ? "Saving…" : "Continue"}
      </button>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </form>
  );
}

// Small reusable number input. Kept local in PR 4b; PR 4c will likely
// extract to a shared util when LoanScenarioEdit also needs it.
function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-700">
        {props.label}
      </span>
      <div className="mt-1 flex items-center rounded border border-gray-300 focus-within:border-green-700">
        {props.prefix ? (
          <span className="px-2 text-gray-500">{props.prefix}</span>
        ) : null}
        <input
          type="number"
          inputMode={props.integer ? "numeric" : "decimal"}
          className="w-full px-2 py-2 outline-none"
          value={Number.isFinite(props.value) ? props.value : ""}
          min={props.min}
          max={props.max}
          step={props.step ?? (props.integer ? 1 : "any")}
          onChange={(e) => {
            const raw = e.target.value;
            const n = props.integer ? parseInt(raw, 10) : parseFloat(raw);
            props.onChange(Number.isFinite(n) ? n : 0);
          }}
        />
        {props.suffix ? (
          <span className="px-2 text-gray-500">{props.suffix}</span>
        ) : null}
      </div>
    </label>
  );
}
