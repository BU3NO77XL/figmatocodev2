import { rgbTo6hex } from "../../common/color";

const composeStops = (fill: GradientPaint): string =>
  fill.gradientStops
    .map((stop) => {
      const color = rgbTo6hex(stop.color);
      return `${stop.position}f to Color(0xFF${color.toUpperCase()})`;
    })
    .join(", ");

export const composeColorValue = (color: RGB, opacity = 1): string => {
  const hex = rgbTo6hex(color).toUpperCase();
  if (opacity < 1) {
    const alpha = Math.round(opacity * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    return `Color(0x${alpha}${hex})`;
  }
  return `Color(0xFF${hex})`;
};

export const composeGradientValue = (fill: GradientPaint): string =>
  `Brush.linearGradient(
    listOf(${composeStops(fill)})
)`;

export const composeColor = (fill: Paint): string | null => {
  if (fill.type === "SOLID") {
    const color = rgbTo6hex(fill.color);
    if (fill.opacity !== undefined && fill.opacity < 1) {
      const alpha = Math.round(fill.opacity * 255)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
      return `background(Color(0x${alpha}${color.toUpperCase()}))`;
    }
    return `background(Color(0xFF${color.toUpperCase()}))`;
  } else if (fill.type === "GRADIENT_LINEAR") {
    // Convert gradient to Compose Brush
    const stops = fill.gradientStops
      .map((stop) => {
        const color = rgbTo6hex(stop.color);
        return `${stop.position}f to Color(0xFF${color.toUpperCase()})`;
      })
      .join(", ");

    return `background(Brush.linearGradient(
        listOf(${stops})
    ))`;
  } else if (fill.type === "GRADIENT_RADIAL") {
    const stops = fill.gradientStops
      .map((stop) => {
        const color = rgbTo6hex(stop.color);
        return `${stop.position}f to Color(0xFF${color.toUpperCase()})`;
      })
      .join(", ");

    return `background(Brush.radialGradient(
        listOf(${stops})
    ))`;
  }

  return null;
};
