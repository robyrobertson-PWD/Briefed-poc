// Typed read helpers for the wizard router. Server-only by transitive
// dependency on lib/supabase/server (which carries the `server-only` import).
// Intentionally does NOT add its own `import "server-only"` so that
// `import type` from client components stays a zero-runtime erasure.
//
// Spec v7 §3.4: the wizard at /income reads three slices of state per request
// — employment_type (string), loan_scenario (4 numeric fields), and whether
// any document has been confirmed yet — to decide which step to render.

import { createServerClient } from "@/lib/supabase/server";
import type {
  EmploymentType,
  IncomeCalcOutput,
} from "@/lib/income-calc/types";

export interface LoanScenarioState {
  price: number | null;
  down_payment: number | null;
  interest_rate: number | null;
  term_years: number | null;
}

export function isLoanScenarioComplete(s: LoanScenarioState): boolean {
  return (
    typeof s.price === "number" &&
    typeof s.down_payment === "number" &&
    typeof s.interest_rate === "number" &&
    typeof s.term_years === "number"
  );
}

// Returns the LATEST borrower_inputs value for a given (scope, field, tax_year).
// Caller must handle the null case. Latest-wins-via-created_at_desc-limit-1 is
// the engine's read contract for borrower_inputs (mirrors assembleInput).
async function latestValue(
  profileId: string,
  scope: string,
  field: string,
  tax_year: number | null = null,
): Promise<unknown> {
  const supabase = createServerClient();
  // Build the filter chain first, then attach order/limit at the end.
  // (Calling .is()/.eq() after .limit() trips the PostgrestTransformBuilder
  // type chain — the spec's sketch had this in the wrong order.)
  const base = supabase
    .from("borrower_inputs")
    .select("value, created_at")
    .eq("profile_id", profileId)
    .eq("scope", scope)
    .eq("field", field);
  const filtered =
    tax_year === null ? base.is("tax_year", null) : base.eq("tax_year", tax_year);
  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`borrower_inputs read failed: ${error.message}`);
  return data?.[0]?.value ?? null;
}

export async function getEmploymentType(
  profileId: string,
): Promise<EmploymentType | null> {
  const v = await latestValue(profileId, "profile", "employment_type");
  return typeof v === "string" ? (v as EmploymentType) : null;
}

export async function getLoanScenario(
  profileId: string,
): Promise<LoanScenarioState> {
  const fields = ["price", "down_payment", "interest_rate", "term_years"] as const;
  const values = await Promise.all(
    fields.map((f) => latestValue(profileId, "loan_scenario", f)),
  );
  return {
    price: typeof values[0] === "number" ? values[0] : null,
    down_payment: typeof values[1] === "number" ? values[1] : null,
    interest_rate: typeof values[2] === "number" ? values[2] : null,
    term_years: typeof values[3] === "number" ? values[3] : null,
  };
}

// Whether the profile has at least one CONFIRMED parsed_document_fields row
// (a paystub, tax_return, or 1099 the borrower has accepted or corrected).
export async function hasConfirmedDocument(profileId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from("parsed_document_fields")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .in("user_confirmation_status", ["confirmed", "corrected"]);
  if (error)
    throw new Error(`parsed_document_fields read failed: ${error.message}`);
  return (count ?? 0) > 0;
}

// -----------------------------------------------------------------
// income_outputs read helper (PR 4c, spec v7 §4.3)
// -----------------------------------------------------------------
// The persisted row's shape. `derivation` is NOT a column — the engine joins
// it into `output_explanation` before persisting. `output_explanation` is
// nullable in the schema (defaulted null at insert time), so we relax it
// from IncomeCalcOutput's required-string contract. The jsonb columns
// (applied_addbacks, applied_haircuts, flags, method_results,
// income_components, missing_inputs) hold the engine's typed shapes at
// runtime — the boundary cast in getLatestIncomeOutput honors this.
export interface IncomeOutputRow
  extends Omit<IncomeCalcOutput, "derivation" | "output_explanation"> {
  id: string;
  engine_version: string;
  rules_version: string;
  input_snapshot_sha256: string;
  output_explanation: string | null;
  created_at: string;
}

export async function getLatestIncomeOutput(
  profileId: string,
): Promise<IncomeOutputRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("income_outputs")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`income_outputs read failed: ${error.message}`);
  if (!data) return null;
  // Cast at the boundary: jsonb columns are typed as `Json` by supabase
  // typegen but the engine writes them as the structured shapes referenced
  // in IncomeCalcOutput. Same pattern as engine.ts's `as unknown as Json`
  // on the write path, reversed.
  return data as unknown as IncomeOutputRow;
}
