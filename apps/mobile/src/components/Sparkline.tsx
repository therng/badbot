import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors } from "../theme";

interface SparklineProps {
  values: number[];
  width: number;
  height: number;
}

export function Sparkline({ values, width, height }: SparklineProps) {
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });

  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  const trendingUp = values[values.length - 1] >= values[0];
  const stroke = trendingUp ? colors.gain : colors.loss;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
          <Stop offset="100%" stopColor={stroke} stopOpacity={0.9} />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="none" stroke="url(#spark)" strokeWidth={2} />
    </Svg>
  );
}
