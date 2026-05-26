import "server-only";
import { createHash } from "node:crypto";

import { createServerClient } from "@/lib/supabase/server";
import {
  computeScheduleCYear,
  computeSelfEmployment,
  computeW2,
  monthsYtdFromPayPeriodEnd,
  presentDualAgency,
  roundHalfUp,
} from "@/lib/income-calc/rules";
import { ENGINE_VERSION, RULES_VERSION } from "@/lib/income-calc/version";
import type { Json } from "@/lib/supabase/types";
import type {
  CalcFlag,
  EmploymentType,
  Form1099Doc,
  IncomeCalcInput,
  IncomeCalcOutput,
  MissingInput,
  PaystubInput,
  TaxReturnDoc,
  UserImputedYear,
} from "@/lib/income-calc/types";

// -----------------------------------------------------------------
// assembleInput — joins parsed_document_fields (confirmed/corrected only)
// with borrower_inputs (latest-wins per (scope, field, tax_year)).
// -----------------------------------------------------------------

type IncomeDocJoinRow = {
  id: string;
  extracted_fields: Json;
  tax_year: number | null;
  user_confirmation_status: string;
  income_document_id: string;
  income_documents:
    | { document_type: string; pay_date: string | null; period_end?: string | null }
    | { document_type: string; pay_date: string | null; period_end?: string | null }[];
};

function asDoc(
  d: IncomeDocJoinRow["income_documents"],
): { document_type: string; pay_date: string | null; period_end?: string | null } {
  return Array.isArray(d) ? d[0] : d;
}

export async function assembleInput(profileId: string): Promise<IncomeCalcInput> {
  const supabase = createServerClient();

  const { data: parsed, error: parsedErr } = await supabase
    .from("parsed_document_fields")
    .select(
      "id, extracted_fields, tax_year, user_confirmation_status, income_document_id, income_documents!inner(document_type, pay_date, period_end)",
    )
    .eq("profile_id", profileId)
    .in("user_confirmation_status", ["confirmed", "corrected"]);
  if (parsedErr)
    throw new Error(`parsed_document_fields read failed: ${parsedErr.message}`);

  const { data: bi, error: biErr } = await supabase
    .from("borrower_inputs")
    .select("id, scope, field, tax_year, value, created_via, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (biErr) throw new Error(`borrower_inputs read failed: ${biErr.message}`);

  // Latest-wins per (scope, field, tax_year). The "order desc + first-wins"
  // pattern is the engine's read contract for borrower_inputs.
  type BiRow = NonNullable<typeof bi>[number];
  const latestBorrowerInput = new Map<string, BiRow>();
  const usedBorrowerInputIds: string[] = [];
  for (const row of bi ?? []) {
    const k = `${row.scope}::${row.field}::${row.tax_year ?? "null"}`;
    if (!latestBorrowerInput.has(k)) {
      latestBorrowerInput.set(k, row);
      usedBorrowerInputIds.push(row.id as string);
    }
  }
  const lookupBI = (
    scope: string,
    field: string,
    tax_year: number | null = null,
  ): unknown =>
    latestBorrowerInput.get(`${scope}::${field}::${tax_year ?? "null"}`)
      ?.value as unknown;

  const employment_type = lookupBI("profile", "employment_type") as
    | EmploymentType
    | undefined;

  const parsedRows = (parsed ?? []) as unknown as IncomeDocJoinRow[];

  // Most recent paystub (by pay_date desc, then period_end desc).
  const paystubs = parsedRows.filter(
    (r) => asDoc(r.income_documents).document_type === "paystub",
  );
  paystubs.sort((a, b) => {
    const ad = asDoc(a.income_documents);
    const bd = asDoc(b.income_documents);
    const aKey = ad.pay_date ?? ad.period_end ?? "";
    const bKey = bd.pay_date ?? bd.period_end ?? "";
    return bKey.localeCompare(aKey);
  });

  let paystub: PaystubInput | undefined;
  const usedParsedIds: string[] = [];
  if (paystubs[0]) {
    const f = (paystubs[0].extracted_fields ?? {}) as Record<string, unknown>;
    paystub = {
      parsed_document_field_id: paystubs[0].id,
      ...(f as Partial<PaystubInput>),
    };
    usedParsedIds.push(paystubs[0].id);
  }

  const tax_returns: TaxReturnDoc[] = parsedRows
    .filter((r) => asDoc(r.income_documents).document_type === "tax_return")
    .map((r) => {
      const f = (r.extracted_fields ?? {}) as Record<string, unknown>;
      usedParsedIds.push(r.id);
      return {
        parsed_document_field_id: r.id,
        tax_year: (r.tax_year ?? (f.tax_year as number)) as number,
        ...(f as Partial<TaxReturnDoc>),
      };
    })
    .filter((d) => typeof d.tax_year === "number");

  const forms_1099: Form1099Doc[] = parsedRows
    .filter((r) => asDoc(r.income_documents).document_type === "form_1099")
    .map((r) => {
      const f = (r.extracted_fields ?? {}) as Record<string, unknown>;
      usedParsedIds.push(r.id);
      return {
        parsed_document_field_id: r.id,
        tax_year: (r.tax_year ?? (f.tax_year as number)) as number,
        form_variant: f.form_variant as string | undefined,
        nonemployee_compensation:
          (f.nonemployee_compensation as number | undefined) ?? 0,
      };
    })
    .filter((d) => typeof d.tax_year === "number");

  // variable_income block: months_ytd from the paystub's pay_period_end;
  // per-type YTD from paystub fields; prior_year_amount from borrower_inputs.
  let variable_income: IncomeCalcInput["variable_income"];
  const pe = paystub?.pay_period_end;
  if (paystub && pe) {
    const months_ytd = monthsYtdFromPayPeriodEnd(pe);
    variable_income = { months_ytd };
    const vtypes: Array<"overtime" | "bonus" | "commission"> = [
      "overtime",
      "bonus",
      "commission",
    ];
    for (const v of vtypes) {
      const ytdKey = `${v}_ytd` as const;
      const ytd_amount = paystub[ytdKey] as number | undefined;
      const prior_year_amount = lookupBI(
        `variable_income.${v}`,
        "prior_year_amount",
      ) as number | undefined;
      if (typeof ytd_amount === "number" && typeof prior_year_amount === "number") {
        variable_income[v] = { prior_year_amount, ytd_amount };
      }
    }
  }

  // user_imputed years — flatten borrower_inputs rows under scope='user_imputed:<year>'.
  const userImputedYears = new Map<number, UserImputedYear>();
  for (const row of latestBorrowerInput.values()) {
    if (row.scope.startsWith("user_imputed:") && typeof row.tax_year === "number") {
      const y = row.tax_year;
      if (!userImputedYears.has(y)) userImputedYears.set(y, { tax_year: y });
      const yr = userImputedYears.get(y);
      if (yr) {
        (yr as unknown as Record<string, unknown>)[row.field] =
          row.value as unknown as number;
      }
    }
  }
  const user_imputed =
    userImputedYears.size > 0
      ? {
          years: Array.from(userImputedYears.values()).sort(
            (a, b) => b.tax_year - a.tax_year,
          ),
        }
      : undefined;

  return {
    employment_type,
    paystub,
    variable_income,
    tax_returns,
    forms_1099,
    user_imputed,
    inputs_used: {
      parsed_document_field_ids: usedParsedIds,
      borrower_input_ids: usedBorrowerInputIds,
    },
  };
}

// -----------------------------------------------------------------
// enumerateMissingInputs — rules-v0.1.0 §6.20
// -----------------------------------------------------------------
export function enumerateMissingInputs(input: IncomeCalcInput): MissingInput[] {
  const missing: MissingInput[] = [];
  const need = (m: MissingInput) => missing.push(m);

  // profile
  if (!input.employment_type) {
    need({
      scope: "profile",
      field: "employment_type",
      severity: "critical",
      reason: "borrower must confirm employment type before the engine can route",
    });
  }

  // paystub
  if (input.paystub) {
    if (typeof input.paystub.base_pay_current !== "number") {
      need({
        scope: "paystub",
        field: "base_pay_current",
        severity: "critical",
        reason: "required for base income",
      });
    }
    if (!input.paystub.pay_frequency) {
      need({
        scope: "paystub",
        field: "pay_frequency",
        severity: "critical",
        reason: "required to annualize base income",
      });
    }
    const informational: Array<keyof PaystubInput> = [
      "base_pay_ytd",
      "gross_pay_current",
      "pay_period_end",
    ];
    for (const f of informational) {
      if (input.paystub[f] === undefined) {
        need({
          scope: "paystub",
          field: f,
          severity: "informational",
          reason: "helpful for cross-check / YTD derivation",
        });
      }
    }
  }

  // variable_income blocks (only when present)
  const vi = input.variable_income;
  if (vi) {
    if (typeof vi.months_ytd !== "number") {
      need({
        scope: "variable_income",
        field: "months_ytd",
        severity: "critical",
        reason: "required for 24-mo averaging",
      });
    }
    const vtypes: Array<"overtime" | "bonus" | "commission"> = [
      "overtime",
      "bonus",
      "commission",
    ];
    for (const v of vtypes) {
      const blk = vi[v];
      if (blk) {
        if (typeof blk.prior_year_amount !== "number") {
          need({
            scope: `variable_income.${v}`,
            field: "prior_year_amount",
            severity: "critical",
            reason: "required for 24-mo averaging",
          });
        }
        if (typeof blk.ytd_amount !== "number") {
          need({
            scope: `variable_income.${v}`,
            field: "ytd_amount",
            severity: "critical",
            reason: "required for 24-mo averaging",
          });
        }
      }
    }
  }

  // tax_returns per supplied year (most-recent first, matches fixture order)
  const taxReturnsByYear = [...input.tax_returns].sort(
    (a, b) => b.tax_year - a.tax_year,
  );
  for (const y of taxReturnsByYear) {
    const scope = `tax_return:${y.tax_year}`;
    if (typeof y.schedule_c_net_profit !== "number") {
      need({
        scope,
        field: "schedule_c_net_profit",
        severity: "critical",
        reason: "required for self-employment qualifying income",
      });
    }
    const optional: Array<keyof TaxReturnDoc> = [
      "schedule_c_depreciation",
      "schedule_c_depletion",
      "schedule_c_amortization_casualty",
      "schedule_c_business_use_home",
      "schedule_c_business_miles",
      "meals_entertainment_nondeductible",
      "nonrecurring_other_income",
    ];
    for (const f of optional) {
      if (y[f] === undefined) {
        need({
          scope,
          field: f,
          severity: "informational",
          reason: "optional add-back/subtraction; confirm none if not applicable",
        });
      }
    }
  }

  // user_imputed per supplied year (most-recent first)
  const userImputedByYear = [...(input.user_imputed?.years ?? [])].sort(
    (a, b) => b.tax_year - a.tax_year,
  );
  for (const y of userImputedByYear) {
    const scope = `user_imputed:${y.tax_year}`;
    if (typeof y.estimated_net_profit !== "number") {
      need({
        scope,
        field: "estimated_net_profit",
        severity: "critical",
        reason: "required to compute a provisional figure",
      });
    }
    const optional: Array<keyof UserImputedYear> = [
      "estimated_depreciation",
      "estimated_depletion",
      "estimated_amortization_casualty",
      "estimated_business_use_of_home",
      "estimated_business_miles",
      "estimated_meals_entertainment_nondeductible",
      "estimated_nonrecurring_other_income",
    ];
    for (const f of optional) {
      if (y[f] === undefined) {
        need({
          scope,
          field: f,
          severity: "informational",
          reason:
            "optional borrower-imputed value; improves provisional figure accuracy",
        });
      }
    }
  }

  // Path C — 1099 supporting-only: enumerate the two ways out of pending as critical.
  if (
    input.employment_type === "1099" &&
    input.tax_returns.length === 0 &&
    (input.user_imputed?.years.length ?? 0) === 0
  ) {
    need({
      scope: "documents",
      field: "tax_return",
      severity: "critical",
      reason:
        "no Schedule C / tax return supplied; required to compute verified qualifying income",
    });
    need({
      scope: "user_imputed",
      field: "estimated_net_profit",
      severity: "critical",
      reason:
        "no borrower-imputed net supplied; required to compute a provisional figure",
    });
  }

  return missing;
}

// -----------------------------------------------------------------
// compute — pure routing over the input bundle.
// -----------------------------------------------------------------
export function compute(input: IncomeCalcInput): IncomeCalcOutput {
  const missing = enumerateMissingInputs(input);
  const flags: CalcFlag[] = [];
  let qualifyingMonthly = 0;
  let qualifyingAnnual = 0;
  let applied_addbacks: IncomeCalcOutput["applied_addbacks"] = [];
  let applied_haircuts: IncomeCalcOutput["applied_haircuts"] = [];
  let income_components: IncomeCalcOutput["income_components"] = null;
  let reported_gross_1099: IncomeCalcOutput["reported_gross_1099"] = null;
  const derivation: string[] = [];

  if (!input.employment_type) {
    flags.push("employment_type_pending");
  } else if (["s_corp", "partnership", "mixed"].includes(input.employment_type)) {
    flags.push("not_yet_supported");
    derivation.push(
      `employment_type=${input.employment_type} is not yet supported in rules-v0.1.0 (Phase 2 backlog).`,
    );
  } else if (input.employment_type === "w2") {
    if (input.paystub?.base_pay_current && input.paystub.pay_frequency) {
      const w2 = computeW2({
        paystub: {
          base_pay_current: input.paystub.base_pay_current,
          pay_frequency: input.paystub.pay_frequency,
        },
        variable_income:
          input.variable_income?.months_ytd !== undefined
            ? { ...input.variable_income, months_ytd: input.variable_income.months_ytd }
            : undefined,
      });
      // rules-v0.1.0 §2: MONTHLY is canonical for W-2. Round monthly first,
      // then derive annual = roundedMonthly * 12 so the two stored figures
      // are consistent with each other — fixtures depend on this.
      qualifyingMonthly = w2.monthly;
      qualifyingAnnual = roundHalfUp(qualifyingMonthly, 2) * 12;
      applied_haircuts = w2.applied_haircuts;
      flags.push(...w2.flags);
      income_components = w2.components;
      derivation.push(...w2.derivation_lines);
      derivation.push(
        `Annual = ${roundHalfUp(qualifyingMonthly, 2).toFixed(2)} x 12 = ${roundHalfUp(qualifyingAnnual, 2).toFixed(2)}`,
      );
    }
  } else {
    // sole_prop OR 1099 — both route through the Schedule C engine.
    const yearsFromReturns = input.tax_returns
      .filter((y) => typeof y.schedule_c_net_profit === "number")
      .map((y) =>
        computeScheduleCYear({
          tax_year: y.tax_year,
          schedule_c_net_profit: y.schedule_c_net_profit as number,
          schedule_c_depreciation: y.schedule_c_depreciation,
          schedule_c_depletion: y.schedule_c_depletion,
          schedule_c_amortization_casualty: y.schedule_c_amortization_casualty,
          schedule_c_business_use_home: y.schedule_c_business_use_home,
          schedule_c_business_miles: y.schedule_c_business_miles,
          meals_entertainment_nondeductible: y.meals_entertainment_nondeductible,
          nonrecurring_other_income: y.nonrecurring_other_income,
        }),
      );

    const yearsFromImputed = (input.user_imputed?.years ?? [])
      .filter((y) => typeof y.estimated_net_profit === "number")
      .map((y) =>
        computeScheduleCYear({
          tax_year: y.tax_year,
          schedule_c_net_profit: y.estimated_net_profit as number,
          schedule_c_depreciation: y.estimated_depreciation,
          schedule_c_depletion: y.estimated_depletion,
          schedule_c_amortization_casualty: y.estimated_amortization_casualty,
          schedule_c_business_use_home: y.estimated_business_use_of_home,
          schedule_c_business_miles: y.estimated_business_miles,
          meals_entertainment_nondeductible:
            y.estimated_meals_entertainment_nondeductible,
          nonrecurring_other_income: y.estimated_nonrecurring_other_income,
        }),
      );

    if (input.employment_type === "1099") {
      // reported_gross_1099 is informational on ALL 1099 paths (rules-v0.1.0
      // §6.17-§6.19). The "supporting_document" flag fires on Paths B and C
      // only — Path A (Schedule C present) raises 1099_income_derived_from_schedule_c.
      const grossSum = input.forms_1099.reduce(
        (acc, f) => acc + (f.nonemployee_compensation ?? 0),
        0,
      );
      reported_gross_1099 = roundHalfUp(grossSum, 2);

      if (yearsFromReturns.length > 0) {
        // Path A
        flags.push("1099_income_derived_from_schedule_c");
        derivation.push(
          `1099 nonemployee compensation present but NOT used directly; qualifying income derived from Schedule C net profit + add-backs (same path as sole proprietor). 1099 retained as a supporting document.`,
        );
        const se = computeSelfEmployment(yearsFromReturns);
        qualifyingAnnual = se.qualifying_annual;
        qualifyingMonthly = qualifyingAnnual / 12;
        applied_addbacks = se.applied_addbacks;
        applied_haircuts = se.applied_haircuts;
        flags.push(...se.flags);
        derivation.push(...se.derivation_lines);
        derivation.push(
          `Monthly = ${roundHalfUp(qualifyingAnnual, 2).toFixed(2)} / 12 = ${roundHalfUp(qualifyingMonthly, 2).toFixed(2)}`,
        );
      } else if (yearsFromImputed.length > 0) {
        // Path B
        flags.push("1099_accepted_as_supporting_document", "user_imputed_unverified");
        derivation.push(
          `No tax return supplied. 1099 retained as a supporting document; borrower-imputed net income used to compute a PROVISIONAL figure (user_imputed_unverified — not underwriting-grade until a Schedule C is provided).`,
        );
        const se = computeSelfEmployment(yearsFromImputed);
        qualifyingAnnual = se.qualifying_annual;
        qualifyingMonthly = qualifyingAnnual / 12;
        applied_addbacks = se.applied_addbacks;
        applied_haircuts = se.applied_haircuts;
        flags.push(...se.flags);
        derivation.push(...se.derivation_lines);
        derivation.push(
          `Monthly = ${roundHalfUp(qualifyingAnnual, 2).toFixed(2)} / 12 = ${roundHalfUp(qualifyingMonthly, 2).toFixed(2)}`,
        );
      } else {
        // Path C
        flags.push("1099_accepted_as_supporting_document", "pending_schedule_c");
        derivation.push(
          `1099 accepted and retained as a supporting document. Gross nonemployee compensation is NOT qualifying income; net self-employment income must come from a Schedule C (or a borrower-imputed estimate). Qualifying income is PENDING that input.`,
        );
      }
    } else {
      // sole_prop
      const se = computeSelfEmployment(yearsFromReturns);
      qualifyingAnnual = se.qualifying_annual;
      qualifyingMonthly = qualifyingAnnual / 12;
      applied_addbacks = se.applied_addbacks;
      applied_haircuts = se.applied_haircuts;
      flags.push(...se.flags);
      derivation.push(...se.derivation_lines);
      derivation.push(
        `Monthly = ${roundHalfUp(qualifyingAnnual, 2).toFixed(2)} / 12 = ${roundHalfUp(qualifyingMonthly, 2).toFixed(2)}`,
      );
    }
  }

  const monthlyR = roundHalfUp(qualifyingMonthly, 2);
  const annualR = roundHalfUp(qualifyingAnnual, 2);
  const method_results = presentDualAgency(qualifyingMonthly, qualifyingAnnual);
  derivation.push(
    `Dual-agency presentation (both shown, no lower-of selection): Fannie ${method_results.fannie_monthly.toFixed(2)}/mo, Freddie ${method_results.freddie_monthly.toFixed(2)}/mo (Phase 1: identical).`,
  );

  if (missing.length > 0) flags.push("has_missing_inputs");
  const critCount = missing.filter((m) => m.severity === "critical").length;
  const infoCount = missing.length - critCount;
  if (missing.length > 0) {
    derivation.push(
      `${missing.length} input field(s) absent (${critCount} critical, ${infoCount} informational); see missing_inputs.`,
    );
  }

  return {
    qualifying_income_monthly: monthlyR,
    qualifying_income_annual: annualR,
    applied_addbacks,
    applied_haircuts,
    method_results,
    flags,
    missing_inputs: missing,
    income_components,
    reported_gross_1099,
    output_explanation: derivation.join(" "),
    derivation,
  };
}

// -----------------------------------------------------------------
// canonicalInputHash — SHA-256 over a sorted-key serialization of the
// inputs that determined the output. Any change to inputs OR the
// rules/engine version produces a different hash.
// -----------------------------------------------------------------
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export function canonicalInputHash(input: IncomeCalcInput): string {
  const bundle = {
    engine_version: ENGINE_VERSION,
    rules_version: RULES_VERSION,
    employment_type: input.employment_type ?? null,
    paystub: input.paystub ?? null,
    variable_income: input.variable_income ?? null,
    tax_returns: input.tax_returns,
    forms_1099: input.forms_1099,
    user_imputed: input.user_imputed ?? null,
    inputs_used: input.inputs_used,
  };
  return createHash("sha256").update(stableStringify(bundle)).digest("hex");
}

// -----------------------------------------------------------------
// runAndPersist — assemble, compute, hash, insert into income_outputs.
// -----------------------------------------------------------------
export async function runAndPersist(args: {
  profileId: string;
  displaySurface: "aha_screen" | "dashboard_capacity_pillar";
}): Promise<{ outputId: string; output: IncomeCalcOutput }> {
  const input = await assembleInput(args.profileId);
  const output = compute(input);
  const hash = canonicalInputHash(input);

  const supabase = createServerClient();
  // jsonb columns: cast at the boundary (Json union is structurally stricter
  // than the engine's plain TS shapes; runtime values satisfy it). Same
  // pattern used in lib/actions/documents.ts.
  const { data: row, error } = await supabase
    .from("income_outputs")
    .insert({
      profile_id: args.profileId,
      input_document_ids: input.inputs_used.parsed_document_field_ids,
      input_bank_connection_ids: [],
      input_snapshot_sha256: hash,
      engine_version: ENGINE_VERSION,
      rules_version: RULES_VERSION,
      qualifying_income_monthly: output.qualifying_income_monthly,
      qualifying_income_annual: output.qualifying_income_annual,
      applied_addbacks: output.applied_addbacks as unknown as Json,
      applied_haircuts: output.applied_haircuts as unknown as Json,
      output_explanation: output.output_explanation,
      missing_inputs: output.missing_inputs as unknown as Json,
      method_results: output.method_results as unknown as Json,
      flags: output.flags as unknown as Json,
      income_components: output.income_components as unknown as Json,
      reported_gross_1099: output.reported_gross_1099,
      display_surface: args.displaySurface,
    })
    .select("id")
    .single();
  if (error || !row)
    throw new Error(
      `income_outputs insert failed: ${error?.message ?? "no row"}`,
    );
  return { outputId: row.id as string, output };
}
