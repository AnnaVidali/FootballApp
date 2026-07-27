"use client";

import React, { createContext, useContext, useCallback, useMemo } from "react";
import {
  type Locale,
  type TranslationDictionary,
  getDictionary,
  t as translate,
} from "./i18n";

interface LocaleContextValue {
  locale: Locale;
  dict: TranslationDictionary;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const dict = useMemo(() => getDictionary(locale), [locale]);

  const tFn = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(dict, key, params),
    [dict]
  );

  const value = useMemo(
    () => ({ locale, dict, t: tFn }),
    [locale, dict, tFn]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocaleContext() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocaleContext must be used within a LocaleProvider");
  }
  return ctx;
}
