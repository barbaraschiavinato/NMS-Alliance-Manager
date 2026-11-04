"use client";

import { createContext, useContext, type ReactNode } from "react";

const AlmanacCacheOnlyContext = createContext(false);

export function AlmanacCacheOnly({ children }: Readonly<{ children: ReactNode }>) {
  return <AlmanacCacheOnlyContext.Provider value={true}>{children}</AlmanacCacheOnlyContext.Provider>;
}

export function useAlmanacCacheOnly() {
  return useContext(AlmanacCacheOnlyContext);
}
