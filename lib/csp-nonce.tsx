"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The per-request CSP nonce, handed down from the root layout.
 *
 * Next.js adds the nonce to its own inline scripts automatically, but a
 * hand-written `<script>` needs it explicitly. A context keeps that
 * prop out of every component between the layout and the script.
 */
const CspNonceContext = createContext<string | undefined>(undefined);

export function CspNonceProvider({
  nonce,
  children,
}: {
  nonce: string | undefined;
  children: ReactNode;
}) {
  return <CspNonceContext.Provider value={nonce}>{children}</CspNonceContext.Provider>;
}

export function useCspNonce(): string | undefined {
  return useContext(CspNonceContext);
}
