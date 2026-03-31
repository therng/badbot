import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import { StyleSheet, View } from "react-native";

export function ScanlineOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Svg height="100%" width="100%">
        <Defs>
          <Pattern id="scanlines" width={4} height={4} patternUnits="userSpaceOnUse">
            <Rect width={4} height={1} fill="rgba(255,255,255,0.04)" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#scanlines)" />
      </Svg>
    </View>
  );
}
