"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

// Global "hide dollar amounts everywhere" toggle. The state is mirrored to
// localStorage so it survives reloads on the same browser — deliberately not
// persisted to the DB because this is a per-device privacy convenience, not
// an account-level preference.

interface HideValuesContextValue {
  hideValues: boolean;
  toggle: () => void;
  setHideValues: (v: boolean) => void;
}

const HideValuesContext = createContext<HideValuesContextValue>({
  hideValues: false,
  toggle: () => {},
  setHideValues: () => {},
});

const STORAGE_KEY = "vault1:hide-values";
// One-shot migration: the localStorage key changed when the app was
// rebranded from Curatada to Vault 1. Read the old key on first mount and
// carry the value forward so users don't lose their hide-values preference.
// Safe to delete this constant + migration block once a few weeks have
// passed and existing users have rolled over.
const LEGACY_STORAGE_KEY = "curatada:hide-values";

export function HideValuesProvider({ children }: { children: ReactNode }) {
  // Default to false until we read from localStorage. The first paint may
  // briefly show values even if the user had them hidden — acceptable in
  // exchange for keeping this purely client-side.
  const [hideValues, setHideValuesState] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      let stored = window.localStorage.getItem(STORAGE_KEY);
      // Rebrand migration: carry forward the old key's value once.
      if (stored == null) {
        const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy != null) {
          window.localStorage.setItem(STORAGE_KEY, legacy);
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
          stored = legacy;
        }
      }
      if (stored === "1") setHideValuesState(true);
    } catch {
      // localStorage can throw in private modes etc; ignore
    }
  }, []);

  const setHideValues = useCallback((v: boolean) => {
    setHideValuesState(v);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
      }
    } catch {
      // ignore quota / private-mode errors
    }
  }, []);

  const toggle = useCallback(() => setHideValues(!hideValues), [hideValues, setHideValues]);

  return (
    <HideValuesContext.Provider value={{ hideValues, toggle, setHideValues }}>
      {children}
    </HideValuesContext.Provider>
  );
}

export function useHideValues() {
  return useContext(HideValuesContext);
}

// Convenience: a single formatter every currency site can call. Returns the
// masked placeholder when hideValues is on, the standard "—" when the value
// is missing, and a Currency-formatted string otherwise. Pass options to
// override decimal handling for sites that need fractional display.
export function useFormatMoney() {
  const { hideValues } = useHideValues();
  return (v: number | string | null | undefined, opts?: Intl.NumberFormatOptions) => {
    if (hideValues) return "$•••";
    if (v == null || v === "") return "—";
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
      ...opts,
    }).format(n);
  };
}
