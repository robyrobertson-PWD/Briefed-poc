"use client";

// Shared number input used by LoanScenarioStep (PR 4b) and LoanScenarioEdit
// (PR 4c). Extracted on PR 4c to avoid duplicating the ~30-line markup. Pure
// presentational — owns no state, takes value/onChange/decorators only.

export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-700">
        {props.label}
      </span>
      <div className="mt-1 flex items-center rounded border border-gray-300 focus-within:border-green-700">
        {props.prefix ? (
          <span className="px-2 text-gray-500">{props.prefix}</span>
        ) : null}
        <input
          type="number"
          inputMode={props.integer ? "numeric" : "decimal"}
          className="w-full px-2 py-2 outline-none"
          value={Number.isFinite(props.value) ? props.value : ""}
          min={props.min}
          max={props.max}
          step={props.step ?? (props.integer ? 1 : "any")}
          onChange={(e) => {
            const raw = e.target.value;
            const n = props.integer ? parseInt(raw, 10) : parseFloat(raw);
            props.onChange(Number.isFinite(n) ? n : 0);
          }}
        />
        {props.suffix ? (
          <span className="px-2 text-gray-500">{props.suffix}</span>
        ) : null}
      </div>
    </label>
  );
}
