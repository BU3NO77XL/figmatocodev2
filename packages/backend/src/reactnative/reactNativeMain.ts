import { createVectorAssetName } from "../common/assetNames";
import { addWarning } from "../common/commonConversionWarnings";
import { htmlColor } from "../html/builderImpl/htmlColor";
import { getPlaceholderImage } from "../common/images";
import { getVisibleNodes } from "../common/nodeVisibility";
import { indentString } from "../common/indentString";
import {
  commonLetterSpacing,
  commonLineHeight,
} from "../common/commonTextHeightSpacing";
import {
  numberToFixedString,
  stringToClassName,
} from "../common/numToAutoFixed";
import { getCommonRadius } from "../common/commonRadius";
import { commonPadding } from "../common/commonPadding";
import { retrieveTopFill } from "../common/retrieveFill";
import { PluginSettings, StyledTextSegmentSubset } from "types";

type LayoutModeLike = "NONE" | "HORIZONTAL" | "VERTICAL" | null;
type RNStyleObject = Record<string, string | number | boolean>;
type RNStyleValue = string | number | boolean | RNStyleObject;
type RNStyle = Record<string, RNStyleValue | undefined>;

type RenderContext = {
  styleIndex: number;
  styles: Array<{ key: string; value: string }>;
  componentNames: Set<string>;
  extractedComponents: Array<{ name: string; code: string }>;
  usesGradient: boolean;
  usesVector: boolean;
  usesBlur: boolean;
};

const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const toComponentName = (value: string) => {
  const name = stringToClassName(value || "Screen") || "Screen";
  return name.endsWith("Screen") ? name : `${name}Screen`;
};

const toLocalComponentName = (
  value: string,
  usedNames: Set<string>,
  fallback = "Section",
) => {
  const baseName = stringToClassName(value || fallback) || fallback;
  let candidate = baseName;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}${index}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
};

const isContainerNode = (
  node: SceneNode,
): node is SceneNode & Partial<ChildrenMixin> =>
  "children" in node && Array.isArray(node.children);

const styleToCode = (style: RNStyle) => {
  const entries = Object.entries(style).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return "{}";
  }

  return `{ ${entries
    .map(([key, value]) =>
      typeof value === "number" || typeof value === "boolean"
        ? `${key}: ${value}`
        : typeof value === "string"
          ? `${key}: ${JSON.stringify(value)}`
          : `${key}: ${styleToCode(value)}`,
    )
    .join(", ")} }`;
};

const addStyle = (context: RenderContext, prefix: string, style: RNStyle) => {
  const key = `${prefix}${context.styleIndex++}`;
  context.styles.push({ key, value: styleToCode(style) });
  return key;
};

const getImageFill = (node: SceneNode): ImagePaint | undefined => {
  if (
    !("fills" in node) ||
    node.fills === figma.mixed ||
    !Array.isArray(node.fills)
  ) {
    return undefined;
  }

  return [...node.fills]
    .reverse()
    .find((fill) => fill.visible !== false && fill.type === "IMAGE") as
    | ImagePaint
    | undefined;
};

const getSolidFillColor = (node: SceneNode) => {
  if (
    !("fills" in node) ||
    node.fills === figma.mixed ||
    !Array.isArray(node.fills)
  ) {
    return undefined;
  }

  const fill = retrieveTopFill(node.fills as any);
  if (!fill || fill.type !== "SOLID") {
    return undefined;
  }

  return htmlColor(fill.color, fill.opacity ?? 1);
};

const getGradientFill = (node: SceneNode): GradientPaint | undefined => {
  if (
    !("fills" in node) ||
    node.fills === figma.mixed ||
    !Array.isArray(node.fills)
  ) {
    return undefined;
  }

  const fill = retrieveTopFill(node.fills as any);
  if (
    !fill ||
    (fill.type !== "GRADIENT_LINEAR" &&
      fill.type !== "GRADIENT_RADIAL" &&
      fill.type !== "GRADIENT_ANGULAR" &&
      fill.type !== "GRADIENT_DIAMOND")
  ) {
    return undefined;
  }

  return fill as GradientPaint;
};

const getResizeMode = (fill?: ImagePaint) => {
  switch (fill?.scaleMode) {
    case "FIT":
      return "contain";
    case "STRETCH":
      return "stretch";
    default:
      return "cover";
  }
};

const getBorderStyle = (node: SceneNode): RNStyle => {
  if (
    !("strokes" in node) ||
    node.strokes === figma.mixed ||
    !Array.isArray(node.strokes)
  ) {
    return {};
  }

  const stroke = [...node.strokes]
    .reverse()
    .find((fill) => fill.visible !== false && fill.type === "SOLID");

  if (!stroke || !("strokeWeight" in node) || node.strokeWeight <= 0) {
    return {};
  }

  return {
    borderColor: htmlColor(stroke.color, stroke.opacity ?? 1),
    borderWidth: Number(numberToFixedString(node.strokeWeight)),
  };
};

const radiusToStyle = (node: SceneNode): RNStyle => {
  if (node.type === "ELLIPSE") {
    return {
      borderRadius: Math.min(node.width, node.height) / 2,
    };
  }

  const radius = getCommonRadius(node);
  if ("all" in radius) {
    return radius.all > 0 ? { borderRadius: radius.all } : {};
  }

  return {
    borderTopLeftRadius: radius.topLeft,
    borderTopRightRadius: radius.topRight,
    borderBottomRightRadius: radius.bottomRight,
    borderBottomLeftRadius: radius.bottomLeft,
  };
};

const textAlignMap: Record<TextAlignHorizontal, string> = {
  CENTER: "center",
  JUSTIFIED: "justify",
  LEFT: "left",
  RIGHT: "right",
};

const textDecorationMap: Partial<Record<TextDecoration, string>> = {
  STRIKETHROUGH: "line-through",
  UNDERLINE: "underline",
};

const textTransformMap: Partial<Record<TextCase, string>> = {
  LOWER: "lowercase",
  TITLE: "capitalize",
  UPPER: "uppercase",
};

const fontWeightFromStyle = (style?: string) => {
  if (!style) {
    return undefined;
  }

  const normalizedStyle = style.toLowerCase();
  if (normalizedStyle.includes("thin")) return "100";
  if (
    normalizedStyle.includes("extralight") ||
    normalizedStyle.includes("ultralight")
  )
    return "200";
  if (normalizedStyle.includes("light")) return "300";
  if (normalizedStyle.includes("medium")) return "500";
  if (
    normalizedStyle.includes("semibold") ||
    normalizedStyle.includes("demibold")
  )
    return "600";
  if (
    normalizedStyle.includes("extrabold") ||
    normalizedStyle.includes("ultrabold")
  )
    return "800";
  if (normalizedStyle.includes("black") || normalizedStyle.includes("heavy"))
    return "900";
  if (normalizedStyle.includes("bold")) return "700";
  return "400";
};

const getShadowEffects = (node: SceneNode) =>
  "effects" in node && Array.isArray(node.effects)
    ? node.effects.filter(
        (effect) =>
          effect.visible !== false &&
          (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW"),
      )
    : [];

const getLayerBlurEffect = (node: SceneNode) =>
  "effects" in node && Array.isArray(node.effects)
    ? node.effects.find(
        (effect): effect is BlurEffect =>
          effect.visible !== false &&
          effect.type === "LAYER_BLUR" &&
          effect.radius > 0,
      )
    : undefined;

const getBackgroundBlurEffect = (node: SceneNode) =>
  "effects" in node && Array.isArray(node.effects)
    ? node.effects.find(
        (effect): effect is BlurEffect =>
          effect.visible !== false &&
          effect.type === "BACKGROUND_BLUR" &&
          effect.radius > 0,
      )
    : undefined;

const getDropShadowEffect = (node: SceneNode) => {
  const shadows = getShadowEffects(node);
  if (shadows.length > 1) {
    addWarning(
      "React Native currently applies only the first visible Figma shadow per layer",
    );
  }

  const innerShadow = shadows.find((effect) => effect.type === "INNER_SHADOW");
  if (innerShadow) {
    addWarning(
      "Inner shadows are not natively supported in React Native and are ignored in the export",
    );
  }

  return shadows.find(
    (effect): effect is DropShadowEffect => effect.type === "DROP_SHADOW",
  );
};

const getShadowStyle = (node: SceneNode): RNStyle => {
  const shadow = getDropShadowEffect(node);
  if (!shadow) {
    return {};
  }

  return {
    shadowColor: htmlColor(shadow.color, 1),
    shadowOpacity: Number(numberToFixedString(shadow.color.a)),
    shadowRadius: Number(numberToFixedString(shadow.radius)),
    shadowOffset: {
      width: Number(numberToFixedString(shadow.offset.x)),
      height: Number(numberToFixedString(shadow.offset.y)),
    },
    elevation: Math.max(
      1,
      Math.round(Math.abs(shadow.offset.y) + shadow.radius / 2),
    ),
  };
};

const getTextShadowStyle = (node: TextNode): RNStyle => {
  const shadow = getDropShadowEffect(node);
  if (!shadow) {
    return {};
  }

  return {
    textShadowColor: htmlColor(shadow.color, shadow.color.a),
    textShadowRadius: Number(numberToFixedString(shadow.radius)),
    textShadowOffset: {
      width: Number(numberToFixedString(shadow.offset.x)),
      height: Number(numberToFixedString(shadow.offset.y)),
    },
  };
};

const getBackgroundBlurRadius = (node: SceneNode) => {
  const blur = getBackgroundBlurEffect(node);
  return blur ? Number(numberToFixedString(blur.radius)) : undefined;
};

const getBaseStyle = (node: SceneNode, parentLayoutMode: LayoutModeLike) => {
  const style: RNStyle = {};

  const usesAbsolutePosition =
    parentLayoutMode === "NONE" ||
    ("layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE");

  const isAutoLayoutContainer =
    "layoutMode" in node && node.layoutMode && node.layoutMode !== "NONE";
  const primaryAxisSizingMode =
    isAutoLayoutContainer && "primaryAxisSizingMode" in node
      ? node.primaryAxisSizingMode
      : undefined;
  const counterAxisSizingMode =
    isAutoLayoutContainer && "counterAxisSizingMode" in node
      ? node.counterAxisSizingMode
      : undefined;

  const omitWidth =
    (isAutoLayoutContainer &&
      ((node.layoutMode === "HORIZONTAL" && primaryAxisSizingMode === "AUTO") ||
        (node.layoutMode === "VERTICAL" &&
          counterAxisSizingMode === "AUTO"))) ||
    (parentLayoutMode === "VERTICAL" &&
      "layoutAlign" in node &&
      node.layoutAlign === "STRETCH");
  const omitHeight =
    (isAutoLayoutContainer &&
      ((node.layoutMode === "VERTICAL" && primaryAxisSizingMode === "AUTO") ||
        (node.layoutMode === "HORIZONTAL" &&
          counterAxisSizingMode === "AUTO"))) ||
    (parentLayoutMode === "HORIZONTAL" &&
      "layoutAlign" in node &&
      node.layoutAlign === "STRETCH");

  if (!omitWidth) {
    style.width = Number(numberToFixedString(node.width));
  }

  if (!omitHeight) {
    style.height = Number(numberToFixedString(node.height));
  }

  if (usesAbsolutePosition) {
    style.position = "absolute";
    style.left = Number(numberToFixedString(node.x));
    style.top = Number(numberToFixedString(node.y));
  }

  if (
    "opacity" in node &&
    typeof node.opacity === "number" &&
    node.opacity !== 1
  ) {
    style.opacity = Number(numberToFixedString(node.opacity));
  }

  if (parentLayoutMode !== "NONE" && "layoutGrow" in node && node.layoutGrow) {
    style.flexGrow = node.layoutGrow;
    style.flexShrink = 1;
  }

  if (parentLayoutMode !== "NONE" && "layoutAlign" in node) {
    switch (node.layoutAlign) {
      case "STRETCH":
        style.alignSelf = "stretch";
        break;
      case "MIN":
        style.alignSelf = "flex-start";
        break;
      case "CENTER":
        style.alignSelf = "center";
        break;
      case "MAX":
        style.alignSelf = "flex-end";
        break;
    }
  }

  return style;
};

const getLayoutStyle = (node: SceneNode): RNStyle => {
  if (!("layoutMode" in node) || node.layoutMode === "NONE") {
    return {};
  }

  const style: RNStyle = {
    flexDirection: node.layoutMode === "HORIZONTAL" ? "row" : "column",
    alignItems:
      node.counterAxisAlignItems === "MIN"
        ? "flex-start"
        : node.counterAxisAlignItems === "MAX"
          ? "flex-end"
          : "center",
    justifyContent:
      node.primaryAxisAlignItems === "MIN"
        ? "flex-start"
        : node.primaryAxisAlignItems === "MAX"
          ? "flex-end"
          : node.primaryAxisAlignItems === "SPACE_BETWEEN"
            ? "space-between"
            : "center",
  };

  const padding = commonPadding(node);
  if (padding) {
    if ("all" in padding) {
      style.padding = padding.all;
    } else if ("horizontal" in padding) {
      style.paddingHorizontal = padding.horizontal;
      style.paddingVertical = padding.vertical;
    } else {
      style.paddingLeft = padding.left;
      style.paddingRight = padding.right;
      style.paddingTop = padding.top;
      style.paddingBottom = padding.bottom;
    }
  }

  if (node.itemSpacing > 0) {
    if (node.layoutWrap === "WRAP") {
      if (node.layoutMode === "HORIZONTAL") {
        style.columnGap = Number(numberToFixedString(node.itemSpacing));
      } else {
        style.rowGap = Number(numberToFixedString(node.itemSpacing));
      }
    } else {
      style.gap = Number(numberToFixedString(node.itemSpacing));
    }
  }

  if (node.layoutWrap === "WRAP") {
    style.flexWrap = "wrap";
    if (node.counterAxisSpacing > 0) {
      if (node.layoutMode === "HORIZONTAL") {
        style.rowGap = Number(numberToFixedString(node.counterAxisSpacing));
      } else {
        style.columnGap = Number(numberToFixedString(node.counterAxisSpacing));
      }
    }

    if (node.counterAxisAlignContent === "SPACE_BETWEEN") {
      style.alignContent = "space-between";
    }
  }

  return style;
};

const getContainerStyle = (
  node: SceneNode,
  parentLayoutMode: LayoutModeLike,
): RNStyle => {
  const style: RNStyle = {
    ...getBaseStyle(node, parentLayoutMode),
    ...getLayoutStyle(node),
    ...getBorderStyle(node),
    ...radiusToStyle(node),
    ...getShadowStyle(node),
  };

  const backgroundColor = getSolidFillColor(node);
  if (backgroundColor) {
    style.backgroundColor = backgroundColor;
  }

  if (!("layoutMode" in node) || node.layoutMode === "NONE") {
    if (isContainerNode(node)) {
      style.position = style.position ?? "relative";
    }
  }

  if ("clipsContent" in node && node.clipsContent) {
    style.overflow = "hidden";
  }

  return style;
};

const getLinearGradientProps = (fill: GradientPaint) => {
  const [start, end] = fill.gradientHandlePositions;
  return {
    colors: fill.gradientStops.map((stop) =>
      htmlColor(stop.color, stop.color.a * (fill.opacity ?? 1)),
    ),
    locations: fill.gradientStops.map((stop) =>
      Number(numberToFixedString(stop.position)),
    ),
    start: {
      x: Number(numberToFixedString(start.x)),
      y: Number(numberToFixedString(start.y)),
    },
    end: {
      x: Number(numberToFixedString(end.x)),
      y: Number(numberToFixedString(end.y)),
    },
  };
};

const getTextStyleFromSegment = (
  node: TextNode,
  segment: Pick<
    StyledTextSegmentSubset,
    | "fills"
    | "fontName"
    | "fontSize"
    | "fontWeight"
    | "letterSpacing"
    | "lineHeight"
    | "textCase"
    | "textDecoration"
  >,
  _parentLayoutMode: LayoutModeLike,
): RNStyle => {
  const fontStyleValue = segment.fontName.style?.toLowerCase().includes("italic")
    ? "italic"
    : "normal";
  const style: RNStyle = {
    color:
      Array.isArray(segment.fills) && segment.fills.length > 0
        ? htmlColor(
            (segment.fills.find((fill) => fill.type === "SOLID") as SolidPaint)
              ?.color ?? { r: 0, g: 0, b: 0 },
            (segment.fills.find((fill) => fill.type === "SOLID") as SolidPaint)
              ?.opacity ?? 1,
          )
        : getSolidFillColor(node) ?? "#000000",
    fontFamily: segment.fontName.family,
    fontStyle: fontStyleValue,
    fontWeight:
      typeof segment.fontWeight === "number"
        ? String(segment.fontWeight)
        : fontWeightFromStyle(segment.fontName.style),
    textDecorationLine: textDecorationMap[segment.textDecoration],
    textTransform: textTransformMap[segment.textCase],
    ...getTextShadowStyle(node),
  };

  if (typeof segment.fontSize === "number") {
    style.fontSize = Number(numberToFixedString(segment.fontSize));
  }

  if (segment.lineHeight && "unit" in segment.lineHeight) {
    const lineHeight = commonLineHeight(segment.lineHeight, segment.fontSize);
    if (lineHeight > 0) {
      style.lineHeight = Number(numberToFixedString(lineHeight));
    }
  }

  if (segment.letterSpacing && "unit" in segment.letterSpacing) {
    const letterSpacing = commonLetterSpacing(
      segment.letterSpacing,
      segment.fontSize,
    );
    if (letterSpacing !== 0) {
      style.letterSpacing = Number(numberToFixedString(letterSpacing));
    }
  }

  return style;
};

const renderTextSegments = (
  context: RenderContext,
  node: TextNode,
  parentLayoutMode: LayoutModeLike,
) => {
  const segments = (node as any).styledTextSegments as
    | StyledTextSegmentSubset[]
    | undefined;
  if (!segments || segments.length <= 1) {
    return null;
  }

  const rootStyle: RNStyle = {
    ...getBaseStyle(node, parentLayoutMode),
    textAlign: textAlignMap[node.textAlignHorizontal],
  };
  const rootStyleKey = addStyle(context, "text", rootStyle);
  const nestedSegments = segments
    .map((segment) => {
      const segmentStyleKey = addStyle(
        context,
        "textSegment",
        getTextStyleFromSegment(node, segment, parentLayoutMode),
      );
      let text = segment.characters;
      if (segment.textCase === "LOWER") {
        text = text.toLowerCase();
      } else if (segment.textCase === "UPPER") {
        text = text.toUpperCase();
      } else if (segment.textCase === "TITLE") {
        text = text.replace(
          /\b(\p{L})(\p{L}*)/gu,
          (_match, first: string, rest: string) =>
            `${first.toUpperCase()}${rest.toLowerCase()}`,
        );
      }

      return `<Text style={styles.${segmentStyleKey}}>${"`"}${escapeText(
        text,
      )}${"`"}</Text>`;
    })
    .join("");

  return `<Text style={styles.${rootStyleKey}}>${nestedSegments}</Text>`;
};

const renderText = (
  context: RenderContext,
  node: TextNode,
  parentLayoutMode: LayoutModeLike,
) => {
  const layerBlur = getLayerBlurEffect(node);
  if (layerBlur) {
    addWarning(
      "Text layer blur is not natively supported in React Native and is ignored in the export",
    );
  }

  const segmentedText = renderTextSegments(context, node, parentLayoutMode);
  if (segmentedText) {
    return segmentedText;
  }

  const fontName =
    node.fontName !== figma.mixed && node.fontName ? node.fontName : undefined;
  const style = {
    ...getBaseStyle(node, parentLayoutMode),
    ...getTextStyleFromSegment(
    node,
    {
      fills:
        node.fills !== figma.mixed && Array.isArray(node.fills) ? node.fills : [],
      fontName: fontName ?? { family: "System", style: "Regular" },
      fontSize: node.fontSize,
      fontWeight:
        typeof (node as any).fontWeight === "number"
          ? (node as any).fontWeight
          : Number(fontWeightFromStyle(fontName?.style) ?? "400"),
      letterSpacing: node.letterSpacing,
      lineHeight: node.lineHeight,
      textCase: node.textCase,
      textDecoration: node.textDecoration,
    },
    parentLayoutMode,
  )};
  style.textAlign = textAlignMap[node.textAlignHorizontal];

  const styleKey = addStyle(context, "text", style);
  let text = node.characters;
  if (node.textCase === "LOWER") {
    text = text.toLowerCase();
  } else if (node.textCase === "UPPER") {
    text = text.toUpperCase();
  }
  return `<Text style={styles.${styleKey}}>${"`"}${escapeText(text)}${"`"}</Text>`;
};

const renderVector = (
  context: RenderContext,
  node: SceneNode,
  parentLayoutMode: LayoutModeLike,
) => {
  context.usesVector = true;
  const styleKey = addStyle(context, "vector", {
    ...getBaseStyle(node, parentLayoutMode),
  });
  const assetName = createVectorAssetName(node.id).replace(/\.svg$/i, "");
  return `<FigmaVector assetName="${assetName}" width={${numberToFixedString(node.width)}} height={${numberToFixedString(node.height)}} style={styles.${styleKey}} />`;
};

const renderImage = (
  context: RenderContext,
  node: SceneNode,
  fill: ImagePaint,
  parentLayoutMode: LayoutModeLike,
  overlayChildren?: string,
) => {
  const placeholder = getPlaceholderImage(
    node.width,
    node.height,
    node.id,
    "asset",
  );
  const containerStyleKey = addStyle(
    context,
    "imageContainer",
    getContainerStyle(node, parentLayoutMode),
  );

  if (!overlayChildren) {
    return `<Image source={require("${placeholder}")} resizeMode="${getResizeMode(fill)}" style={styles.${containerStyleKey}} />`;
  }

  const overlayStyleKey = addStyle(context, "imageOverlay", {
    ...radiusToStyle(node),
  });

  return `<View style={styles.${containerStyleKey}}>
  <Image source={require("${placeholder}")} resizeMode="${getResizeMode(fill)}" style={[StyleSheet.absoluteFillObject, styles.${overlayStyleKey}]} />
${indentString(overlayChildren, 2)}
</View>`;
};

const renderGradient = (
  context: RenderContext,
  node: SceneNode,
  gradient: GradientPaint,
  parentLayoutMode: LayoutModeLike,
  children?: string,
) => {
  if (gradient.type !== "GRADIENT_LINEAR") {
    addWarning(
      "Only linear gradients are fully supported in React Native; other gradients use a solid fallback",
    );
    const fallbackStyleKey = addStyle(context, "gradientFallback", {
      ...getContainerStyle(node, parentLayoutMode),
      backgroundColor: htmlColor(
        gradient.gradientStops[0]?.color ?? { r: 0, g: 0, b: 0 },
        gradient.gradientStops[0]?.color.a ?? 1,
      ),
    });

    return children
      ? `<View style={styles.${fallbackStyleKey}}>
${indentString(children, 2)}
</View>`
      : `<View style={styles.${fallbackStyleKey}} />`;
  }

  context.usesGradient = true;
  const styleKey = addStyle(
    context,
    "gradient",
    getContainerStyle(node, parentLayoutMode),
  );
  const props = getLinearGradientProps(gradient);
  return `<LinearGradient colors={${JSON.stringify(props.colors)}} locations={${JSON.stringify(props.locations)}} start={${styleToCode(
    props.start,
  )}} end={${styleToCode(props.end)}} style={styles.${styleKey}}>
${children ? indentString(children, 2) : ""}
</LinearGradient>`;
};

const renderNode = (
  context: RenderContext,
  node: SceneNode,
  parentLayoutMode: LayoutModeLike,
): string => {
  if (
    (node as any).canBeFlattened ||
    node.type === "VECTOR" ||
    node.type === "BOOLEAN_OPERATION"
  ) {
    return renderVector(context, node, parentLayoutMode);
  }

  if (node.type === "TEXT") {
    return renderText(context, node, parentLayoutMode);
  }

  const childLayoutMode: LayoutModeLike =
    "layoutMode" in node && node.layoutMode !== "NONE"
      ? node.layoutMode
      : "NONE";
  const children = isContainerNode(node)
    ? getVisibleNodes(node.children)
        .map((child) => renderNode(context, child, childLayoutMode))
        .join("\n")
    : "";
  const imageFill = getImageFill(node);

  if (imageFill) {
    return renderImage(
      context,
      node,
      imageFill,
      parentLayoutMode,
      children || undefined,
    );
  }

  const gradientFill = getGradientFill(node);
  if (gradientFill) {
    return renderGradient(
      context,
      node,
      gradientFill,
      parentLayoutMode,
      children || undefined,
    );
  }

  const styleKey = addStyle(
    context,
    node.type === "LINE" ? "line" : "view",
    getContainerStyle(node, parentLayoutMode),
  );
  const backgroundBlurRadius = getBackgroundBlurRadius(node);

  if (getLayerBlurEffect(node)) {
    addWarning(
      "Layer blur on non-text React Native layers is not natively supported and is ignored in the export",
    );
  }

  if (children) {
    if (backgroundBlurRadius) {
      context.usesBlur = true;
      return `<View style={styles.${styleKey}}>
  <BlurView intensity={${Math.min(
    100,
    Math.max(1, Math.round(backgroundBlurRadius * 4)),
  )}} tint="default" style={StyleSheet.absoluteFillObject} />
${indentString(children, 2)}
</View>`;
    }
    return `<View style={styles.${styleKey}}>
${indentString(children, 2)}
</View>`;
  }

  if (backgroundBlurRadius) {
    context.usesBlur = true;
    return `<View style={styles.${styleKey}}>
  <BlurView intensity={${Math.min(
    100,
    Math.max(1, Math.round(backgroundBlurRadius * 4)),
  )}} tint="default" style={StyleSheet.absoluteFillObject} />
</View>`;
  }

  return `<View style={styles.${styleKey}} />`;
};

const shouldExtractAsComponent = (node: SceneNode) =>
  isContainerNode(node) &&
  getVisibleNodes(node.children).length > 0 &&
  node.type !== "TEXT" &&
  node.type !== "VECTOR" &&
  node.type !== "BOOLEAN_OPERATION";

const renderTopLevelNode = (context: RenderContext, node: SceneNode) => {
  if (!shouldExtractAsComponent(node)) {
    return renderNode(context, node, null);
  }

  const componentName = toLocalComponentName(
    node.name || "Section",
    context.componentNames,
  );
  const componentBody = renderNode(context, node, null);
  context.extractedComponents.push({
    name: componentName,
    code: `function ${componentName}() {\n  return (\n${indentString(
      componentBody,
      4,
    )}\n  );\n}`,
  });
  return `<${componentName} />`;
};

export const reactNativeMain = (
  sceneNode: ReadonlyArray<SceneNode>,
  _settings: PluginSettings,
): string => {
  const componentName = toComponentName(sceneNode[0]?.name || "Screen");
  const context: RenderContext = {
    styleIndex: 0,
    styles: [],
    componentNames: new Set([componentName, "FigmaVector"]),
    extractedComponents: [],
    usesGradient: false,
    usesVector: false,
    usesBlur: false,
  };

  const children = getVisibleNodes(sceneNode)
    .map((node) => renderTopLevelNode(context, node))
    .join("\n");

  const rootStyleKey = addStyle(context, "screen", {
    position: "relative",
    flexGrow: 1,
  });
  const styleSheet = context.styles
    .map((style) => `  ${style.key}: ${style.value},`)
    .join("\n");

  return `import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
${context.usesGradient ? 'import { LinearGradient } from "expo-linear-gradient";\n' : ""}${context.usesBlur ? 'import { BlurView } from "expo-blur";\n' : ""}${context.usesVector ? 'import { SvgXml } from "react-native-svg";\n' : ""}
${
  context.usesVector
    ? `const FIGMA_VECTOR_XML: Record<string, string> = __FIGMA_VECTOR_XML__;
const FIGMA_VECTOR_FALLBACKS: Record<string, any> = __FIGMA_VECTOR_FALLBACKS__;

export function FigmaVector({
  assetName,
  width,
  height,
  style,
}: {
  assetName: string;
  width: number;
  height: number;
  style?: any;
}) {
  const xml = FIGMA_VECTOR_XML[assetName];
  if (xml) {
    return <SvgXml xml={xml} width={width} height={height} style={style} />;
  }

  const source = FIGMA_VECTOR_FALLBACKS[assetName];
  if (source) {
    return (
      <Image
        source={source}
        resizeMode="contain"
        style={[style, { width, height }]}
      />
    );
  }

  return <View style={[style, { width, height }]} />;
}

`
    : ""
}export const styles = StyleSheet.create({
${styleSheet}
});

${context.extractedComponents.map((component) => component.code).join("\n\n")}

export default function ${componentName}() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.${rootStyleKey}}>
${indentString(children, 4)}
      </View>
    </ScrollView>
  );
}
`;
};
