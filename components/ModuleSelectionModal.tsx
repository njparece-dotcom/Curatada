"use client";
import { useState } from "react";
import { useUserModules, ModuleKey } from "@/lib/UserModulesContext";

const MODULES: { key: ModuleKey; label: string; description: string; icon: React.ReactNode }[] = [
  {
    key: "guitars",
    label: "Guitars",
    description: "Track guitars, amps, and pedals",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
    ),
  },
  {
    key: "watches",
    label: "Watches",
    description: "Monitor your timepiece collection",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "automobiles",
    label: "Automobiles",
    description: "Log vehicles, mileage, and value",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l2-6h14l2 6M1 16h22M5 16v2M19 16v2M8 10h8" />
      </svg>
    ),
  },
  {
    key: "collectibles",
    label: "Collectibles",
    description: "Fine art, memorabilia, and more",
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 7h6l-5 4 2 7-6-4-6 4 2-7-5-4h6z" />
      </svg>
    ),
  },
];

export default function ModuleSelectionModal() {
  const { setModules } = useUserModules();
  const [selected, setSelected] = useState<Record<ModuleKey, boolean>>({
    guitars: true,
    watches: true,
    automobiles: true,
    collectibles: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = (key: ModuleKey) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    const enabledCount = Object.values(selected).filter(Boolean).length;
    if (enabledCount === 0) {
      setError("Please select at least one collection.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/user/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules: selected }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setModules(selected);
    } catch {
      setError("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-lg shadow-2xl mx-4">
        <h1 className="font-headline text-2xl font-bold text-accent tracking-widest uppercase mb-1">
          Welcome to Vault 1
        </h1>
        <p className="text-text-dim text-sm mb-6">
          Choose which collections you&apos;d like to manage. You can change this anytime in settings.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {MODULES.map(({ key, label, description, icon }) => {
            const enabled = selected[key];
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`flex flex-col items-start gap-2 p-4 rounded-xl border transition-all duration-200 text-left ${
                  enabled
                    ? "border-accent bg-surface-2 text-text"
                    : "border-border bg-surface text-text-dim hover:bg-surface-2"
                }`}
              >
                <div className={enabled ? "text-accent" : "text-text-dim"}>
                  {icon}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${enabled ? "text-text" : "text-text-dim"}`}>{label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{description}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-auto ${enabled ? "border-accent bg-accent" : "border-border"}`}>
                  {enabled && (
                    <svg className="w-2.5 h-2.5 text-[#0c0e10]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full vault-gradient text-on-primary font-bold text-sm uppercase tracking-widest py-3 rounded-xl shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {saving ? "Saving..." : "Enter The Vault"}
        </button>
      </div>
    </div>
  );
}
