// Engine type contracts. Pure module — no I/O, no Supabase, no Anthropic.
// rules.ts and engine.ts both consume these; the test runner imports them too.

export type EmploymentType =
  | "w2"
  | "1099"
  | "sole_prop"
  | "s_corp"          // Phase 2 — flagged not_yet_supported
  | "partnership"     // Phase 2 — flagged not_yet_supported
  | "mixed";          // Phase 2 — flagged not_yet_supported

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export type Provenance = "extracted" | "user_provided";

export type MissingInputSeverity = "critical" | "informational";

export interface MissingInput {
  scope: string;
  field: string;
  severity: MissingInputSeverity;
  reason: string;
}

export interface AppliedAddback {
  name: string;
  tax_year: number;
  amount: number;
}

export interface AppliedHaircut {
  name: string;
  reason: string;
  from: number;
  to: number;
  decline_pct: number;
}

export interface MethodResults {
  fannie_monthly: number;
  freddie_monthly: number;
  fannie_annual: number;
  freddie_annual: number;
}

export interface IncomeComponent {
  name: "base" | "overtime" | "bonus" | "commission";
  monthly: number;
}

// All informational flags. NEVER blockers — the engine returns a deterministic
// number alongside, the flags shape downstream UX. Source of truth for this
// union; rules.ts and engine.ts both import it.
export type CalcFlag =
  | "has_missing_inputs"
  | "pending_schedule_c"
  | "user_imputed_unverified"
  | "1099_accepted_as_supporting_document"
  | "1099_income_derived_from_schedule_c"
  | "insufficient_history_self_employment"
  | "documentation_incomplete"
  | "commission_ge_25pct_requires_tax_returns"
  | "employment_type_pending"
  | "not_yet_supported";

// -----------------------------------------------------------------
// Input shape — assembled by engine.assembleInput() from the database
// (parsed_document_fields ∪ borrower_inputs, latest-wins per scope/field).
// -----------------------------------------------------------------
export interface PaystubInput {
  parsed_document_field_id: string;
  pay_period_start?: string;
  pay_period_end?: string;
  pay_date?: string;
  pay_frequency?: PayFrequency;
  base_pay_current?: number;
  base_pay_ytd?: number;
  gross_pay_current?: number;
  gross_pay_ytd?: number;
  net_pay_current?: number;
  hourly_rate?: number;
  hours_worked_current?: number;
  overtime_current?: number;
  overtime_ytd?: number;
  bonus_current?: number;
  bonus_ytd?: number;
  commission_current?: number;
  commission_ytd?: number;
}

export interface VariableIncomeBlock {
  prior_year_amount: number;
  ytd_amount: number;
}

export interface VariableIncomeInput {
  months_ytd?: number;
  overtime?: VariableIncomeBlock;
  bonus?: VariableIncomeBlock;
  commission?: VariableIncomeBlock;
}

export interface TaxReturnDoc {
  parsed_document_field_id: string;
  tax_year: number;
  schedule_c_net_profit?: number;
  schedule_c_depreciation?: number;
  schedule_c_depletion?: number;
  schedule_c_amortization_casualty?: number;
  schedule_c_business_use_home?: number;
  schedule_c_business_miles?: number;
  meals_entertainment_nondeductible?: number;
  nonrecurring_other_income?: number;
}

export interface Form1099Doc {
  parsed_document_field_id: string;
  tax_year: number;
  form_variant?: string;
  nonemployee_compensation: number;
}

export interface UserImputedYear {
  tax_year: number;
  estimated_net_profit?: number;
  estimated_depreciation?: number;
  estimated_depletion?: number;
  estimated_amortization_casualty?: number;
  estimated_business_use_of_home?: number;
  estimated_business_miles?: number;
  estimated_meals_entertainment_nondeductible?: number;
  estimated_nonrecurring_other_income?: number;
}

export interface IncomeCalcInput {
  employment_type?: EmploymentType;
  paystub?: PaystubInput;
  variable_income?: VariableIncomeInput;
  tax_returns: TaxReturnDoc[];
  forms_1099: Form1099Doc[];
  user_imputed?: { years: UserImputedYear[] };
  // Provenance ledger for the canonical input hash + audit trail.
  inputs_used: {
    parsed_document_field_ids: string[];
    borrower_input_ids: string[];
  };
}

export interface IncomeCalcOutput {
  qualifying_income_monthly: number;
  qualifying_income_annual: number;
  applied_addbacks: AppliedAddback[];
  applied_haircuts: AppliedHaircut[];
  method_results: MethodResults;
  flags: CalcFlag[];
  missing_inputs: MissingInput[];
  income_components: IncomeComponent[] | null;
  reported_gross_1099: number | null;
  output_explanation: string;
  derivation: string[];
}
