"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { ensureProfile } from "@/lib/profile";
import { runAndPersist } from "@/lib/income-calc/engine";
import type { IncomeCalcOutput } from "@/lib/income-calc/types";

type Ok = { ok: true; outputId: string; output: IncomeCalcOutput };
type Err = { ok: false; error: string };

export async function runIncomeCalc(args: {
  displaySurface: "aha_screen" | "dashboard_capacity_pillar";
}): Promise<Ok | Err> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not authenticated" };
  const { profileId } = await ensureProfile();
  try {
    const { outputId, output } = await runAndPersist({
      profileId,
      displaySurface: args.displaySurface,
    });
    return { ok: true, outputId, output };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "income-calc failed",
    };
  }
}
