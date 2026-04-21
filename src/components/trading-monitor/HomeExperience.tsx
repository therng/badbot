"use client";

import { useCallback, useSyncExternalStore } from "react";

import AILoginGate, { readAuthenticatedFlag } from "@/components/trading-monitor/AILoginGate";
import DashboardClient from "@/components/trading-monitor/DashboardClient";

const AUTH_EVENT = "analytic:ai-session-change";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = () => onChange();
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function getClientSnapshot() {
  return readAuthenticatedFlag();
}

function getServerSnapshot() {
  return false;
}

export default function HomeExperience() {
  const authenticated = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const handleEnter = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_EVENT));
    }
  }, []);

  return (
    <>
      <DashboardClient />
      {!authenticated ? <AILoginGate onEnter={handleEnter} /> : null}
    </>
  );
}
