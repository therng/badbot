import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenBackground } from "../../src/components/ScreenBackground";
import { Sparkline } from "../../src/components/Sparkline";
import { TimeframeSelector } from "../../src/components/TimeframeSelector";
import { getAccountOverview } from "../../src/lib/api";
import { formatCurrency, formatDateTime, formatNumber, formatPercent, formatSignedCurrency } from "../../src/lib/format";
import type { AccountOverviewResponse, Timeframe } from "../../src/lib/types";
import { colors, fonts, radii, spacing } from "../../src/theme";

const DEFAULT_TIMEFRAME: Timeframe = "1m";

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Array.isArray(id) ? id[0] : id;
  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  const [overview, setOverview] = useState<AccountOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const data = await getAccountOverview(accountId, timeframe);
        if (mounted) {
          setOverview(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to load account");
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
  }, [accountId, timeframe]);

  const sparkValues = useMemo(() => overview?.balanceCurve.map((point) => point.y) ?? [], [overview]);
  const sparkWidth = Math.max(260, Math.min(360, Dimensions.get("window").width - spacing.lg * 2));

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Loading overview...</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && overview && (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>{overview.account.owner_name ?? "Unknown Owner"}</Text>
              <Text style={styles.subtitle}>#{overview.account.account_number}</Text>
              <Text style={styles.meta}>Last update {formatDateTime(overview.account.last_updated)}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Balance Curve</Text>
              {sparkValues.length > 1 ? (
                <Sparkline values={sparkValues} width={sparkWidth} height={90} />
              ) : (
                <Text style={styles.muted}>No curve data for this timeframe.</Text>
              )}
              <TimeframeSelector value={timeframe} onChange={setTimeframe} />
            </View>

            <View style={styles.metricsGrid}>
              <Metric label="Balance" value={formatCurrency(overview.account.balance, overview.account.currency)} />
              <Metric label="Equity" value={formatCurrency(overview.account.equity, overview.account.currency)} />
              <Metric
                label="Floating P/L"
                value={formatSignedCurrency(overview.account.floating_pl, overview.account.currency)}
                tone={overview.account.floating_pl}
              />
              <Metric label="Margin Level" value={formatNumber(overview.account.margin_level, 2)} />
              <Metric label="Period Growth" value={formatPercent(overview.kpis.periodGrowth, 2)} />
              <Metric label="Drawdown" value={formatPercent(overview.kpis.drawdown, 2)} tone={-1} />
              <Metric label="Win %" value={formatPercent(overview.kpis.winPercent, 1)} />
              <Metric label="Trades" value={formatNumber(overview.kpis.trades, 0)} />
            </View>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const tint = tone === undefined ? colors.text : tone > 0 ? colors.gain : tone < 0 ? colors.loss : colors.text;
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  meta: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
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
    backgroundColor: "rgba(20,20,32,0.9)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    letterSpacing: 1,
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metricCard: {
    width: "48%",
    backgroundColor: "rgba(26,26,40,0.9)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
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
