import DashboardClient from "@/components/trading-monitor/DashboardClient";

export default async function HomePage() {
  // Artificial delay to showcase the new terminal loading screen
  await new Promise((resolve) => setTimeout(resolve, 3500));

  return <DashboardClient />;
}
