"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useUserModules } from "@/lib/UserModulesContext";
import ManageCollectionsModal from "@/components/ManageCollectionsModal";

export default function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isEnabled } = useUserModules();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showManageCollections, setShowManageCollections] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDashboardActive = pathname === "/";
  const isGuitarsActive = pathname.startsWith("/guitars");
  const isWatchesActive = pathname.startsWith("/watches");
  const isAutosActive = pathname.startsWith("/automobiles");
  const isCollectiblesActive = pathname.startsWith("/collectibles");

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const userInitial = session?.user?.name
    ? session.user.name.charAt(0).toUpperCase()
    : session?.user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-[#0c0e10] border-b border-border">
      {/* Left — Wordmark + nav */}
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center flex-shrink-0 group">
          <span className="font-headline text-xl font-bold text-accent tracking-widest uppercase">
            Curatada
          </span>
        </Link>

        {/* Center nav links */}
        <div className="hidden md:flex items-center gap-1">
          <Link
            href="/"
            className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
              isDashboardActive
                ? "text-accent border-b-2 border-accent"
                : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
            }`}
          >
            Dashboard
          </Link>
          {isEnabled("guitars") && (
            <Link
              href="/guitars"
              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                isGuitarsActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
              }`}
            >
              Guitars
            </Link>
          )}
          {isEnabled("watches") && (
            <Link
              href="/watches"
              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                isWatchesActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
              }`}
            >
              Watches
            </Link>
          )}
          {isEnabled("automobiles") && (
            <Link
              href="/automobiles"
              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                isAutosActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
              }`}
            >
              Automobiles
            </Link>
          )}
          {isEnabled("collectibles") && (
            <Link
              href="/collectibles"
              className={`px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                isCollectiblesActive
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-dim hover:text-text hover:bg-surface-2 rounded"
              }`}
            >
              Collectibles
            </Link>
          )}
        </div>
      </div>

      {/* Right — Search + User menu */}
      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center gap-2 bg-surface-2 border border-border px-3 py-1.5 rounded-lg">
          <svg className="w-3.5 h-3.5 text-text-dim flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search archives..."
            className="bg-transparent border-none outline-none text-sm text-text placeholder-text-dim w-40 font-label"
          />
        </div>

        {/* User avatar/menu */}
        {session?.user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="w-8 h-8 rounded-full bg-accent text-[#0c0e10] font-bold text-sm flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
              aria-label="User menu"
            >
              {userInitial}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 w-52 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-medium text-text truncate">{session.user.name || "User"}</p>
                  <p className="text-xs text-text-muted truncate">{session.user.email}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); setShowManageCollections(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-dim hover:text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                  Manage Collections
                </button>
                <div className="border-t border-border/50" />
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-dim hover:text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>

    {showManageCollections && (
      <ManageCollectionsModal onClose={() => setShowManageCollections(false)} />
    )}
    </>
  );
}
