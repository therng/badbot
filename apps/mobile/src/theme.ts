import { Platform } from "react-native";

export const colors = {
  background: "#0b0b0f",
  surface: "#141420",
  surfaceAlt: "#1a1a28",
  border: "#26263a",
  text: "#f2f2f5",
  textMuted: "#b4b4c0",
  accent: "#5de4c7",
  accentAlt: "#7aa2f7",
  gain: "#5de4c7",
  loss: "#f06b6b",
  warn: "#f1d96a",
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
};

export const fonts = {
  heading: Platform.select({
    ios: "Avenir Next",
    android: "sans-serif-condensed",
    default: "Avenir Next",
  }),
  body: Platform.select({
    ios: "Avenir Next",
    android: "sans-serif",
    default: "Avenir Next",
  }),
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "Menlo",
  }),
};
