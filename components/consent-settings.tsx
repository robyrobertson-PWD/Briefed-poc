"use client";

import { useEffect, useState, useCallback } from "react";
import { useSupabaseBrowserClient } from "@/lib/supabase/browser";
import { recordConsent } from "@/lib/actions/consent";
import { CONSENT_COPY } from "@/lib/consent/copy";

type CategoryState = { categoryId: string; granted: boolean };

export function ConsentSettings() {
  const supabase = useSupabaseBrowserClient();
  const [states, setStates] = useState<CategoryState[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Catalog of categories (world-readable) + this user's consent rows
    // (RLS-scoped — this is the read that exercises spec-v2 RLS policies).
    const [{ data: categories }, { data: consents }] = await Promise.all([
      supabase.from("consent_categories").select("id").order("id"),
      supabase
        .from("consents")
        .select("category_id, action, created_at")
        .order("created_at", { ascending: false }),
    ]);

    // Latest action per category = current state.
    const latest = new Map<string, string>();
    for (const row of consents ?? []) {
      const cid = row.category_id as string;
      if (!latest.has(cid)) latest.set(cid, row.action as string);
    }

    const next: CategoryState[] = (categories ?? []).map((c) => ({
      categoryId: c.id as string,
      granted: latest.get(c.id as string) === "grant",
    }));
    setStates(next);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (categoryId: string, currentlyGranted: boolean) => {
    setPending(categoryId);
    const res = await recordConsent(categoryId, currentlyGranted ? "revoke" : "grant");
    if (res.ok) await load();
    setPending(null);
  };

  if (loading) return <p style={{ color: "#888" }}>Loading your consent settings…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {states.map((s) => {
        const copy = CONSENT_COPY[s.categoryId];
        return (
          <div
            key={s.categoryId}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: 12 }}
          >
            <div style={{ maxWidth: 520 }}>
              <div style={{ fontWeight: 600 }}>{copy?.label ?? s.categoryId}</div>
              <div style={{ fontSize: 13, color: "#666" }}>{copy?.explanation}</div>
            </div>
            <button
              onClick={() => toggle(s.categoryId, s.granted)}
              disabled={pending === s.categoryId}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: s.granted ? "#166534" : "#fff",
                color: s.granted ? "#fff" : "#333",
                cursor: "pointer",
                minWidth: 96,
              }}
            >
              {pending === s.categoryId ? "…" : s.granted ? "Granted" : "Off"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
