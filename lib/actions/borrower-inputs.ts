"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profile";
import { runAndPersist } from "@/lib/income-calc/engine";
import type { EmploymentType } from "@/lib/income-calc/types";
import type { Json } from "@/lib/supabase/types";

type Ok = { ok: true };
type Err = { ok: false; error: string };

// Append-only INSERT into borrower_inputs. Never UPDATE — latest-wins reads
// surface the most recent row at lookup time. Re-runs the income engine
// after a successful write so /income reflects the new state on next render.
// Engine errors are swallowed (return ok:true for the borrower-input write
// itself); the aha screen renders whatever the latest income_outputs row
// looks like, including partial states with flags.
async function insertAndRecompute(args: {
  profileId: string;
  scope: string;
  field: string;
  tax_year: number | null;
  value: unknown;
  created_via: "confirmation_step" | "manual_entry";
}): Promise<Ok | Err> {
  const supabase = createServerClient();
  const { error } = await supabase.from("borrower_inputs").insert({
    profile_id: args.profileId,
    scope: args.scope,
    field: args.field,
    tax_year: args.tax_year,
    value: args.value as unknown as Json,
    created_via: args.created_via,
  });
  if (error) return { ok: false, error: error.message };

  try {
    await runAndPersist({
      profileId: args.profileId,
      displaySurface: "aha_screen",
    });
  } catch {
    // engine failed; the write itself succeeded. The /income page will read
    // the latest income_outputs row (if any) at render time.
  }
  revalidatePath("/income");
  return { ok: true };
}

// -----------------------------------------------------------------
// setEmploymentType — scope='profile', field='employment_type',
// tax_year=null. One-shot pick at /income landing.
// -----------------------------------------------------------------
const ALLOWED_EMPLOYMENT_TYPES: EmploymentType[] = [
  "w2",
  "1099",
  "sole_prop",
  "s_corp",
  "partnership",
  "mixed",
];

export async function setEmploymentType(
  employment_type: string,
): Promise<Ok | Err> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not authenticated" };
  if (!ALLOWED_EMPLOYMENT_TYPES.includes(employment_type as EmploymentType)) {
    return { ok: false, error: "invalid employment_type" };
  }
  const { profileId } = await ensureProfile();
  return insertAndRecompute({
    profileId,
    scope: "profile",
    field: "employment_type",
    tax_year: null,
    value: employment_type,
    created_via: "confirmation_step",
  });
}

// -----------------------------------------------------------------
// saveLoanScenario — 4-field write in a single Supabase insert call.
// All-or-nothing: validates each field first, then inserts the batch.
// Partial failure leaves prior values in place (latest-wins read still
// surfaces them).
// -----------------------------------------------------------------
export async function saveLoanScenario(args: {
  price: number;
  down_payment: number;
  interest_rate: number;
  term_years: number;
}): Promise<Ok | Err> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not authenticated" };

  if (!Number.isFinite(args.price) || args.price <= 0)
    return { ok: false, error: "price must be > 0" };
  if (!Number.isFinite(args.down_payment) || args.down_payment < 0)
    return { ok: false, error: "down_payment must be >= 0" };
  if (args.down_payment > args.price)
    return { ok: false, error: "down_payment cannot exceed price" };
  if (
    !Number.isFinite(args.interest_rate) ||
    args.interest_rate < 0 ||
    args.interest_rate > 50
  )
    return { ok: false, error: "interest_rate must be between 0 and 50" };
  if (
    !Number.isInteger(args.term_years) ||
    args.term_years < 1 ||
    args.term_years > 50
  )
    return {
      ok: false,
      error: "term_years must be an integer between 1 and 50",
    };

  const { profileId } = await ensureProfile();
  const supabase = createServerClient();
  const rows = [
    { field: "price", value: args.price },
    { field: "down_payment", value: args.down_payment },
    { field: "interest_rate", value: args.interest_rate },
    { field: "term_years", value: args.term_years },
  ].map((r) => ({
    profile_id: profileId,
    scope: "loan_scenario",
    field: r.field,
    tax_year: null,
    value: r.value as unknown as Json,
    created_via: "confirmation_step" as const,
  }));

  const { error } = await supabase.from("borrower_inputs").insert(rows);
  if (error) return { ok: false, error: error.message };

  try {
    await runAndPersist({ profileId, displaySurface: "aha_screen" });
  } catch {
    /* see insertAndRecompute for rationale */
  }
  revalidatePath("/income");
  return { ok: true };
}

// -----------------------------------------------------------------
// saveBorrowerInput — generic single-row write. Used by PR 4c's
// missing-inputs checklist; exposed now so the action surface is
// stable from the start.
// -----------------------------------------------------------------
const SCOPE_REGEX = /^[a-z_]+(\.[a-z_]+)?(:[0-9]{4})?$/;
const FIELD_REGEX = /^[a-z_]+$/;

export async function saveBorrowerInput(args: {
  scope: string;
  field: string;
  tax_year: number | null;
  value: number | string | boolean;
}): Promise<Ok | Err> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not authenticated" };
  if (!SCOPE_REGEX.test(args.scope)) return { ok: false, error: "invalid scope" };
  if (!FIELD_REGEX.test(args.field)) return { ok: false, error: "invalid field" };
  if (args.tax_year !== null) {
    if (
      !Number.isInteger(args.tax_year) ||
      args.tax_year < 2000 ||
      args.tax_year > 2100
    ) {
      return { ok: false, error: "invalid tax_year" };
    }
  }
  const { profileId } = await ensureProfile();
  return insertAndRecompute({
    profileId,
    scope: args.scope,
    field: args.field,
    tax_year: args.tax_year,
    value: args.value,
    created_via: "confirmation_step",
  });
}
