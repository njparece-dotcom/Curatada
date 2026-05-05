"use client";

import { RevalueProvider } from "@/lib/RevalueContext";
import RevalueBanner from "@/components/RevalueBanner";
import TopNav from "@/components/TopNav";
import Sidebar from "@/components/Sidebar";
import { UserModulesProvider, useUserModules } from "@/lib/UserModulesContext";
import ModuleSelectionModal from "@/components/ModuleSelectionModal";
import { ReactNode } from "react";

function AppShellInner({ children }: { children: ReactNode }) {
  const { needsSetup } = useUserModules();
  return (
    <RevalueProvider>
      <RevalueBanner />
      <TopNav />
      <div className="flex h-screen pt-16">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      {needsSetup && <ModuleSelectionModal />}
    </RevalueProvider>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <UserModulesProvider>
      <AppShellInner>{children}</AppShellInner>
    </UserModulesProvider>
  );
}
