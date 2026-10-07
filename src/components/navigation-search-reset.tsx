"use client";

import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

type NavigationSearchResetContextValue = Readonly<{
  resetVersion: number;
  resetSearch: () => void;
}>;

const NavigationSearchResetContext = createContext<NavigationSearchResetContextValue | null>(null);

export function NavigationSearchResetProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [resetVersion, setResetVersion] = useState(0);
  const resetSearch = useCallback(() => setResetVersion((version) => version + 1), []);
  const value = {
    resetVersion,
    resetSearch,
  };

  return <NavigationSearchResetContext.Provider value={value}>{children}</NavigationSearchResetContext.Provider>;
}

export function useNavigationSearchState(initialValue: string): readonly [string, Dispatch<SetStateAction<string>>] {
  const context = useContext(NavigationSearchResetContext);
  if (!context) throw new Error("useNavigationSearchState must be used inside NavigationSearchResetProvider");
  const [state, setState] = useState(() => ({ value: initialValue, resetVersion: context.resetVersion }));
  const search = state.resetVersion === context.resetVersion ? state.value : "";
  const setSearch = useCallback<Dispatch<SetStateAction<string>>>((nextValue) => {
    setState((current) => {
      const currentValue = current.resetVersion === context.resetVersion ? current.value : "";
      return {
        value: typeof nextValue === "function" ? nextValue(currentValue) : nextValue,
        resetVersion: context.resetVersion,
      };
    });
  }, [context.resetVersion]);

  return [search, setSearch];
}

export function useRequestSearchReset() {
  const context = useContext(NavigationSearchResetContext);
  if (!context) throw new Error("useRequestSearchReset must be used inside NavigationSearchResetProvider");
  return context.resetSearch;
}
