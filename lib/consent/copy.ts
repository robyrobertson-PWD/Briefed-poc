// PLACEHOLDER per-purpose consent copy. Designer + Regulatory own the final
// strings (trust voice, verb discipline). Do not treat as final.
// The hash of the exact string shown to the user is stored on each consent
// record for tamper-evidence, so changing a string here changes the hash going
// forward — which is the intended audit behavior.

export const CONSENT_COPY: Record<string, { label: string; explanation: string }> = {
  identifiers:    { label: "Identifiers",                   explanation: "[PLACEHOLDER] We use your name, email, phone, and account ID to operate your account." },
  bank:           { label: "Bank account data",             explanation: "[PLACEHOLDER] Connect your bank via Plaid so we can see your verified income. Not yet active." },
  payroll:        { label: "Payroll data",                  explanation: "[PLACEHOLDER] Connect your payroll provider to confirm your employment income. Not yet active." },
  tax_return:     { label: "Tax return data",               explanation: "[PLACEHOLDER] Upload tax returns so we can calculate your real qualifying income. Not yet active." },
  bureau_v15:     { label: "Credit bureau data",            explanation: "[PLACEHOLDER] Coming soon. Credit-report data from a consumer reporting agency." },
  ssn_identity:   { label: "SSN for identity verification", explanation: "[PLACEHOLDER] We use the last 4 of your SSN only to confirm your identity, then discard it." },
  derived_income: { label: "Your income calculation",       explanation: "[PLACEHOLDER] We retain your calculated qualifying income so you can see it over time." },
  marketing:      { label: "Product emails",                explanation: "[PLACEHOLDER] Occasional product and educational emails. Opt out anytime." },
  income_docs_uploaded: { label: "Uploaded income documents", explanation: "[PLACEHOLDER] We parse documents you upload — paystubs, 1099s, tax returns, bank statements — to calculate your income. We do not store your SSN." },
};

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
