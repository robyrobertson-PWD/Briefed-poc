import { describe, expect, it } from "vitest";
import fixturesJson from "@/lib/income-calc/__fixtures__/v0.1.0.json";
import { compute } from "@/lib/income-calc/engine";
import { RULES_VERSION } from "@/lib/income-calc/version";
import type {
  EmploymentType,
  Form1099Doc,
  IncomeCalcInput,
  PayFrequency,
  PaystubInput,
  TaxReturnDoc,
  UserImputedYear,
  VariableIncomeInput,
} from "@/lib/income-calc/types";

interface FixtureDocument {
  document_type: string;
  extracted_fields: Record<string, unknown>;
}

interface Fixture {
  fixture_id: string;
  description: string;
  rules_version: string;
  inputs: {
    employment_type: string;
    paystub?: Record<string, unknown>;
    variable_income?: { months_ytd: number } & Record<string, unknown>;
    documents?: FixtureDocument[];
    user_imputed?: { years: Array<Record<string, unknown>> };
  };
  expected: {
    qualifying_income_monthly: number;
    qualifying_income_annual: number;
    applied_addbacks: unknown[];
    applied_haircuts: unknown[];
    method_results: Record<string, number>;
    flags: string[];
    missing_inputs: unknown[];
    income_components?: unknown[];
    reported_gross_1099?: number;
  };
}

const fixtures = fixturesJson as { rules_version: string; fixtures: Fixture[] };

// Translate the fixture's natural-language inputs into IncomeCalcInput.
// The fixtures are shaped for compute() directly — they skip the database
// assembly layer so engine correctness is testable without Supabase.
function toEngineInput(f: Fixture): IncomeCalcInput {
  const docs = f.inputs.documents ?? [];
  const paystub: PaystubInput | undefined = f.inputs.paystub
    ? ({
        parsed_document_field_id: `fixture:${f.fixture_id}:paystub`,
        ...(f.inputs.paystub as Partial<PaystubInput>),
        pay_frequency: f.inputs.paystub.pay_frequency as PayFrequency,
      } as PaystubInput)
    : undefined;
  const variable_income = f.inputs.variable_income as
    | VariableIncomeInput
    | undefined;
  const tax_returns: TaxReturnDoc[] = docs
    .filter((d) => d.document_type === "tax_return")
    .map(
      (d, i) =>
        ({
          parsed_document_field_id: `fixture:${f.fixture_id}:tax_return:${i}`,
          tax_year: d.extracted_fields.tax_year as number,
          ...(d.extracted_fields as Partial<TaxReturnDoc>),
        }) as TaxReturnDoc,
    );
  const forms_1099: Form1099Doc[] = docs
    .filter((d) => d.document_type === "form_1099")
    .map((d, i) => ({
      parsed_document_field_id: `fixture:${f.fixture_id}:1099:${i}`,
      tax_year: d.extracted_fields.tax_year as number,
      form_variant: d.extracted_fields.form_variant as string | undefined,
      nonemployee_compensation:
        (d.extracted_fields.nonemployee_compensation as number | undefined) ?? 0,
    }));
  const user_imputed = f.inputs.user_imputed
    ? {
        years: f.inputs.user_imputed.years.map(
          (y) => ({ ...(y as unknown as UserImputedYear) }),
        ),
      }
    : undefined;
  return {
    employment_type: f.inputs.employment_type as EmploymentType,
    paystub,
    variable_income,
    tax_returns,
    forms_1099,
    user_imputed,
    inputs_used: { parsed_document_field_ids: [], borrower_input_ids: [] },
  };
}

describe("income-calc engine vs rules-v0.1.0 fixtures", () => {
  it("vendored fixtures match the engine's rules_version constant", () => {
    expect(fixtures.rules_version).toBe(RULES_VERSION);
  });

  for (const f of fixtures.fixtures) {
    it(f.fixture_id, () => {
      const out = compute(toEngineInput(f));
      expect(out.qualifying_income_monthly).toBe(
        f.expected.qualifying_income_monthly,
      );
      expect(out.qualifying_income_annual).toBe(
        f.expected.qualifying_income_annual,
      );
      expect(out.applied_addbacks).toEqual(f.expected.applied_addbacks);
      expect(out.applied_haircuts).toEqual(f.expected.applied_haircuts);
      expect(out.method_results).toEqual(f.expected.method_results);
      // Flags are a SET — order shouldn't matter; sort both sides.
      expect([...out.flags].sort()).toEqual([...f.expected.flags].sort());
      expect(out.missing_inputs).toEqual(f.expected.missing_inputs);
      if (f.expected.income_components !== undefined) {
        expect(out.income_components).toEqual(f.expected.income_components);
      }
      if (f.expected.reported_gross_1099 !== undefined) {
        expect(out.reported_gross_1099).toBe(f.expected.reported_gross_1099);
      }
    });
  }
});
