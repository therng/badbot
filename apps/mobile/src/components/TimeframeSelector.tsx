import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts, radii, spacing } from "../theme";
import type { Timeframe } from "../lib/types";

const TIMEFRAMES: Array<{ value: Timeframe; label: string }> = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "ALL" },
];

export function TimeframeSelector({ value, onChange }: { value: Timeframe; onChange: (next: Timeframe) => void }) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {TIMEFRAMES.map((option) => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.pill, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
  },
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pill: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: "rgba(20,20,32,0.6)",
  },
  pillActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(93,228,199,0.16)",
  },
  pillText: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
  },
  pillTextActive: {
    color: colors.text,
  },
});
