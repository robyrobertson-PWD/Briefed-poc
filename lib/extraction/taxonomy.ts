export type DocumentType =
  | "paystub"
  | "w2"
  | "form_1099"
  | "tax_return"
  | "bank_statement"
  | "other";

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "paystub",
  "w2",
  "form_1099",
  "tax_return",
  "bank_statement",
  "other",
] as const;

// Expected field keys per document type — used to steer the prompt only. NOT a
// hard schema; the model returns a flat object and the jsonb stores it as-is.
// Final taxonomy is owned by the Income-Calc Specialist; this is provisional so
// v5 isn't blocked. The parsed_document_fields.extracted_fields jsonb absorbs
// later changes without a migration.
export const PROVISIONAL_FIELDS: Record<DocumentType, string[]> = {
  paystub: [
    "employer_name",
    "pay_period_start",
    "pay_period_end",
    "pay_date",
    "pay_frequency",
    "gross_pay_current",
    "gross_pay_ytd",
    "net_pay_current",
  ],
  w2: [
    "employer_name",
    "tax_year",
    "wages_box1",
    "federal_income_tax_withheld_box2",
    "social_security_wages_box3",
    "medicare_wages_box5",
  ],
  form_1099: [
    "payer_name",
    "tax_year",
    "form_variant",
    "nonemployee_compensation",
    "other_income",
  ],
  tax_return: [
    "tax_year",
    "filing_status",
    "total_income",
    "adjusted_gross_income",
    "schedule_c_net_profit",
    "schedule_e_income",
    "k1_ordinary_income",
  ],
  bank_statement: [
    "institution_name",
    "statement_period_start",
    "statement_period_end",
    "total_deposits",
    "recurring_deposit_candidates",
  ],
  other: [],
};

// Forced tool-use schema. Permissive on extracted_fields so the taxonomy can
// change without editing this schema.
export const EXTRACTION_TOOL = {
  name: "record_extracted_income_fields",
  description: "Return the income-relevant fields read from the document.",
  input_schema: {
    type: "object",
    properties: {
      document_type_detected: { type: "string" },
      extracted_fields: {
        type: "object",
        description: "Flat map of field key -> value read from the document.",
      },
      overall_confidence: {
        type: "number",
        description: "0.0-1.0 overall extraction confidence.",
      },
      extraction_warnings: {
        type: "array",
        items: { type: "string" },
        description:
          "Self-reported uncertainties (e.g. unreadable totals). NOT a fraud judgment.",
      },
    },
    required: ["extracted_fields", "overall_confidence"],
    additionalProperties: false,
  },
} as const;

export function buildExtractionPrompt(docType: DocumentType): string {
  const wanted = PROVISIONAL_FIELDS[docType];
  return [
    `You are reading a user-supplied ${docType.replace("_", " ")} to extract income-relevant fields.`,
    wanted.length
      ? `Look for these fields where present: ${wanted.join(", ")}.`
      : `Extract any income-relevant fields you find.`,
    `Return numeric amounts as plain numbers (no currency symbols or commas). Use ISO dates (YYYY-MM-DD).`,
    `If a field is absent or unreadable, omit it rather than guessing.`,
    `CRITICAL PRIVACY RULE: never return Social Security numbers, full bank/account numbers, or any dependent names/DOBs/SSNs. If you see them, ignore them — do not place them in any field.`,
    `Call the record_extracted_income_fields tool with your result.`,
  ].join(" ");
}
