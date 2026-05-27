"use client";

// Spec v7 §3.7. First wizard step: pick employment type. Phase-1 supported
// types are clickable; Phase-2 types render disabled with a "Phase 2" badge
// so the user sees roadmap rather than a confusing "$0 qualifying" verdict
// downstream.

import { useState } from "react";
import { setEmploymentType } from "@/lib/actions/borrower-inputs";

interface OptionDef {
  value: string;
  label: string;
  description: string;
  disabled?: boolean;
}

const OPTIONS: OptionDef[] = [
  {
    value: "w2",
    label: "W-2 employee",
    description: "I get a paystub from one or more employers.",
  },
  {
    value: "1099",
    label: "1099 contractor",
    description: "I get 1099s and may file a Schedule C.",
  },
  {
    value: "sole_prop",
    label: "Sole proprietor",
    description: "I run my own business and file a Schedule C.",
  },
  {
    value: "s_corp",
    label: "S-corp owner",
    description: "Coming in Phase 2.",
    disabled: true,
  },
  {
    value: "partnership",
    label: "Partnership",
    description: "Coming in Phase 2.",
    disabled: true,
  },
  {
    value: "mixed",
    label: "Mixed income",
    description: "Coming in Phase 2.",
    disabled: true,
  },
];

export function EmploymentTypeStep() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPick = async (value: string) => {
    setBusy(true);
    setErr(null);
    const res = await setEmploymentType(value);
    if (!res.ok) {
      setErr(res.error);
      setBusy(false);
    }
    // On success: the server action revalidates /income and the page
    // re-renders with the next wizard state. This component unmounts;
    // no need to reset `busy`.
  };

  return (
    <div className="space-y-3">
      <p className="text-gray-600">How do you earn most of your income?</p>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={busy || o.disabled}
          onClick={() => onPick(o.value)}
          className={
            "w-full rounded-lg border p-4 text-left transition " +
            (o.disabled
              ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
              : "border-gray-300 hover:border-green-700 hover:bg-green-50 disabled:opacity-60")
          }
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold">{o.label}</span>
            {o.disabled ? (
              <span className="rounded bg-gray-200 px-2 py-0.5 text-xs">
                Phase 2
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm">{o.description}</p>
        </button>
      ))}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
