import { retrieveTopFill } from "../common/retrieveFill";
import { Paint as ApiPaint } from "../api_types";
import { getCommonRadius } from "../common/commonRadius";
import { getPlaceholderImage } from "../common/images";
import { composeSize } from "./builderImpl/composeSize";
import { composeBorder } from "./builderImpl/composeBorder";
import { composeColor } from "./builderImpl/composeColor";
import { composeShadow } from "./builderImpl/composeShadow";
import { composePadding } from "./builderImpl/composePadding";

export const composeContainer = (
  node: SceneNode & MinimalBlendMixin,
  child: string,
  imagePlaceholderMode: "remote" | "asset" = "remote",
): string => {
  // Safety check for node dimensions
  if ("width" in node && "height" in node) {
    if ((node.width <= 0 || node.height <= 0) && !child) {
      return "// Invalid node dimensions";
    }
  }

  const modifiers: string[] = [];
  let containerType = "Box";
  let imagePlaceholder: string | null = null;

  // Determine if we need a specific container type
  if ("fills" in node) {
    const topFill = retrieveTopFill(
      node.fills as unknown as readonly ApiPaint[],
    );
    if (topFill) {
      if (topFill.type === "IMAGE" && imagePlaceholderMode === "asset") {
        imagePlaceholder = getPlaceholderImage(
          "width" in node ? node.width : 0,
          "height" in node ? node.height : 0,
          node.id,
          "asset",
        );
      } else {
        // Background color or gradient
        const backgroundModifier = composeColor(topFill as unknown as Paint);
        if (backgroundModifier) {
          modifiers.push(backgroundModifier);
        }
      }
    }
  }

  // Size modifiers
  const sizeModifier = composeSize(node);
  if (sizeModifier) {
    modifiers.push(sizeModifier);
  }

  // Border radius
  let shape = null;
  if ("cornerRadius" in node || "topLeftRadius" in node) {
    const radius = getCommonRadius(node);
    if ("all" in radius && radius.all > 0) {
      shape = `RoundedCornerShape(${radius.all}.dp)`;
      modifiers.push(`clip(${shape})`);
    } else if ("topLeft" in radius) {
      shape = `RoundedCornerShape(
        topStart = ${radius.topLeft}.dp,
        topEnd = ${radius.topRight}.dp,
        bottomEnd = ${radius.bottomRight}.dp,
        bottomStart = ${radius.bottomLeft}.dp
    )`;
      modifiers.push(`clip(${shape})`);
    }
  }

  // Border
  if ("strokes" in node && node.strokes.length > 0) {
    const borderModifier = composeBorder(node, shape);
    if (borderModifier) {
      modifiers.push(borderModifier);
    }
  }

  // Shadow/elevation
  if ("effects" in node && node.effects.length > 0) {
    const shadowModifier = composeShadow(node.effects);
    if (shadowModifier) {
      modifiers.push(shadowModifier);
    }
  }

  // Padding (if this is a container with children)
  if ("paddingLeft" in node) {
    const paddingModifier = composePadding(node);
    if (paddingModifier) {
      modifiers.push(paddingModifier);
    }
  }

  // Build modifier chain
  const modifierChain =
    modifiers.length > 0
      ? `modifier = Modifier${modifiers.map((m) => `.${m}`).join("")}`
      : "";

  // Generate container
  if (imagePlaceholder) {
    const imageWidget = `Image(
    painter = painterResource("${imagePlaceholder}"),
    contentDescription = null,
    modifier = Modifier.matchParentSize()
)`;

    if (child) {
      if (modifierChain) {
        return `${containerType}(
    ${modifierChain}
) {
    ${imageWidget}
    ${child}
}`;
      }
      return `${containerType} {
    ${imageWidget}
    ${child}
}`;
    }

    if (modifierChain) {
      return `Image(
    painter = painterResource("${imagePlaceholder}"),
    contentDescription = null,
    ${modifierChain}
)`;
    }
    return `Image(
    painter = painterResource("${imagePlaceholder}"),
    contentDescription = null
)`;
  }

  if (child) {
    if (modifierChain) {
      return `${containerType}(
    ${modifierChain}
) {
    ${child}
}`;
    } else {
      return `${containerType} {
    ${child}
}`;
    }
  } else {
    // Empty container
    if (modifierChain) {
      return `Spacer(${modifierChain})`;
    } else {
      return `Spacer(modifier = Modifier.size(0.dp))`;
    }
  }
};
