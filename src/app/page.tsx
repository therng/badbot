import DashboardClient from "@/components/trading-monitor/DashboardClient";

export default async function HomePage() {
  // Artificial delay to allow the candle animation to loop 3 times (3s per loop)
  await new Promise((resolve) => setTimeout(resolve, 9000));

  return <DashboardClient />;
}
