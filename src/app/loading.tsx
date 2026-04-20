import { AnalyticLaunchScreen } from "@/components/trading-monitor/shared";

export default function Loading() {
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";
  return (
    <main className="monitor-page">
      <div className="monitor-shell app-shell">
        <AnalyticLaunchScreen variant={isMaintenanceMode ? "maintenance" : "loading"} />
      </div>
    </main>
  );
}
