import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenBackground } from "../src/components/ScreenBackground";
import { getAccounts } from "../src/lib/api";
import { formatCurrency, formatDateTime, formatSignedCurrency } from "../src/lib/format";
import type { SerializedAccount } from "../src/lib/types";
import { colors, fonts, radii, spacing } from "../src/theme";

export default function AccountListScreen() {
  const [accounts, setAccounts] = useState<SerializedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getAccounts();
        if (mounted) {
          setAccounts(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load accounts");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Financial Noir</Text>
          <Text style={styles.subtitle}>Live MT5 account pulse</Text>
        </View>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Loading accounts...</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && accounts.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.muted}>No accounts found.</Text>
          </View>
        )}

        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </ScrollView>
    </ScreenBackground>
  );
}

function AccountCard({ account }: { account: SerializedAccount }) {
  const statusColor = account.status === "Active" ? colors.accent : colors.textMuted;
  return (
    <Link href={`/accounts/${account.id}`} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardOwner}>{account.owner_name ?? "Unknown Owner"}</Text>
            <Text style={styles.cardAccount}>#{account.account_number}</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={[styles.statusText, { color: statusColor }]}>{account.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <Metric label="Balance" value={formatCurrency(account.balance, account.currency)} />
          <Metric label="Equity" value={formatCurrency(account.equity, account.currency)} />
        </View>
        <View style={styles.metricRow}>
          <Metric
            label="Floating P/L"
            value={formatSignedCurrency(account.floating_pl, account.currency)}
            tone={account.floating_pl}
          />
          <Metric label="Updated" value={formatDateTime(account.last_updated)} />
        </View>
      </Pressable>
    </Link>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const tint = tone === undefined ? colors.text : tone > 0 ? colors.gain : tone < 0 ? colors.loss : colors.text;
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.text,
    letterSpacing: 1.2,
  },
  subtitle: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 14,
  },
  centered: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  muted: {
    color: colors.textMuted,
    fontFamily: fonts.body,
  },
  errorBox: {
    backgroundColor: "rgba(240,107,107,0.12)",
    borderColor: "rgba(240,107,107,0.4)",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.loss,
    fontFamily: fonts.body,
  },
  card: {
    backgroundColor: "rgba(20,20,32,0.92)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    borderColor: colors.accentAlt,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardOwner: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.text,
  },
  cardAccount: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  metric: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  metricValue: {
    fontFamily: fonts.mono,
    color: colors.text,
    fontSize: 16,
  },
});
