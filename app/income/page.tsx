// Spec v7 §3.6. Wizard router: reads borrower state per request and renders
// the appropriate step. Transitions happen via revalidatePath('/income')
// after each server-action write.
//
// State machine (first match wins):
//   1. no employment_type            → EmploymentTypeStep
//   2. employment_type but no loan_scenario → LoanScenarioStep
//   3. both set, no confirmed document → UploadPrompt
//   4. ready (PR 4c will replace this with the aha screen) → UploadPrompt + notice

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/profile";
import {
  getEmploymentType,
  getLoanScenario,
  hasConfirmedDocument,
  isLoanScenarioComplete,
} from "@/lib/borrower-inputs/read";
import { EmploymentTypeStep } from "@/components/income/employment-type-step";
import { LoanScenarioStep } from "@/components/income/loan-scenario-step";
import { UploadPrompt } from "@/components/income/upload-prompt";

export const dynamic = "force-dynamic"; // read state per request

export default async function IncomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { profileId } = await ensureProfile();
  const [employmentType, loanScenario, hasDocs] = await Promise.all([
    getEmploymentType(profileId),
    getLoanScenario(profileId),
    hasConfirmedDocument(profileId),
  ]);

  // State 1: no employment_type
  if (!employmentType) {
    return (
      <PageShell title="Let's get started">
        <EmploymentTypeStep />
      </PageShell>
    );
  }

  // State 2: no complete loan_scenario
  if (!isLoanScenarioComplete(loanScenario)) {
    return (
      <PageShell title="Tell us about the loan">
        <LoanScenarioStep current={loanScenario} />
      </PageShell>
    );
  }

  // State 3: no confirmed documents yet
  if (!hasDocs) {
    return (
      <PageShell title="Upload your income documents">
        <UploadPrompt
          employmentType={employmentType}
          loanScenario={loanScenario}
        />
      </PageShell>
    );
  }

  // State 4: aha screen (PR 4c). For now, render UploadPrompt with a notice.
  return (
    <PageShell title="Your pre-qual estimate">
      <UploadPrompt
        employmentType={employmentType}
        loanScenario={loanScenario}
        notice="Aha screen coming in PR 4c. For now, your documents are confirmed."
      />
    </PageShell>
  );
}

function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">{title}</h1>
      {children}
    </main>
  );
}
