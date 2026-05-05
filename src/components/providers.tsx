"use client";

import React from "react";

/**
 * Root providers wrapper.
 * Add client-side providers here (e.g. NextThemes, QueryClient, TooltipProvider, ToastProvider)
 * to keep the layout.tsx strictly a server component.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
