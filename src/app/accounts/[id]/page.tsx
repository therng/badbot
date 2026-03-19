import AccountDetailClient from "@/components/trading-monitor/AccountDetailClient";

export default function AccountDetailPage({ params }: { params: { id: string } }) {
  return <AccountDetailClient accountId={params.id} />;
}
