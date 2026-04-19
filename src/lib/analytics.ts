"use client";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

function pushDataLayer(event: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.dataLayer) {
    return;
  }

  window.dataLayer.push(event);
}

/**
 * GA4 / GTM Event helper
 */
export const trackEvent = (eventName: string, eventParams?: Record<string, unknown>) => {
  pushDataLayer({
    event: eventName,
    ...eventParams,
  });
};

/**
 * Consent Mode v2 Management
 * Default is 'denied' for all categories to ensure privacy compliance.
 */
export type ConsentType = "analytics_storage" | "ad_storage" | "ad_user_data" | "ad_personalization";

export const updateConsent = (consent: Record<ConsentType, "granted" | "denied">) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("consent", "update", consent);

    // Also push to dataLayer for GTM triggers
    pushDataLayer({
      event: "consent_update",
      consent_settings: consent,
    });
  }
};

/**
 * Dashboard specific events
 */
export const trackDashboardInteraction = (action: string, label: string, value?: unknown) => {
  trackEvent("dashboard_interaction", {
    interaction_action: action,
    interaction_label: label,
    interaction_value: value,
  });
};

export const trackTimeframeChange = (accountName: string, timeframe: string) => {
  trackDashboardInteraction("change_timeframe", `${accountName}: ${timeframe}`, timeframe);
};

export const trackKpiExpand = (accountName: string, kpi: string) => {
  trackDashboardInteraction("expand_kpi", `${accountName}: ${kpi}`, kpi);
};

export const trackRefresh = (source: "pull" | "manual" | "resume") => {
  trackDashboardInteraction("refresh_data", source);
};

export const trackAccountSwipe = (accountName: string, index: number) => {
  trackDashboardInteraction("swipe_account", accountName, index);
};
