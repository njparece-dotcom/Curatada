"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ModuleKey = "guitars" | "watches" | "automobiles" | "collectibles";
export type ModulesState = Record<ModuleKey, boolean> | null; // null = not yet loaded

interface UserModulesContextValue {
  modules: ModulesState;
  needsSetup: boolean; // true when user has never configured modules
  setModules: (m: Record<ModuleKey, boolean>) => void;
  isEnabled: (key: ModuleKey) => boolean;
  loading: boolean;
}

const UserModulesContext = createContext<UserModulesContextValue>({
  modules: null,
  needsSetup: false,
  setModules: () => {},
  isEnabled: () => true,
  loading: true,
});

export function UserModulesProvider({ children }: { children: ReactNode }) {
  const [modules, setModulesState] = useState<ModulesState>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/modules")
      .then((r) => r.json())
      .then((data) => {
        if (data === null) {
          setNeedsSetup(true);
        } else {
          setModulesState(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setModules = (m: Record<ModuleKey, boolean>) => {
    setModulesState(m);
    setNeedsSetup(false);
  };

  const isEnabled = (key: ModuleKey) => {
    if (!modules) return true; // default show all while loading
    return modules[key] ?? false;
  };

  return (
    <UserModulesContext.Provider value={{ modules, needsSetup, setModules, isEnabled, loading }}>
      {children}
    </UserModulesContext.Provider>
  );
}

export function useUserModules() {
  return useContext(UserModulesContext);
}
