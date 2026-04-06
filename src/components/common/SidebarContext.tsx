'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    if (stored === 'true') setCollapsed(true);
    setHydrated(true);
  }, []);

  // Persist to localStorage only after hydration so we don't overwrite the stored value on first render
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed, hydrated]);

  const toggle = () => setCollapsed((prev) => !prev);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
