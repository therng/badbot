import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";
import { ScanlineOverlay } from "./ScanlineOverlay";

export function ScreenBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0b0b0f", "#10101a", "#151529"]}
        style={StyleSheet.absoluteFillObject}
      />
      <ScanlineOverlay />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
