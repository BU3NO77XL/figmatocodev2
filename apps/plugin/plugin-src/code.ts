import { tailwindCodeGenTextStyles } from "./../../../packages/backend/src/tailwind/tailwindMain";
import {
  run,
  flutterMain,
  tailwindMain,
  swiftuiMain,
  composeMain,
  reactNativeMain,
  htmlMain,
  extractProjectImageNodeIds,
  generateProjectZip,
  injectReactNativeVectorHelpers,
  postSettingsChanged,
  replaceProjectImagePlaceholders,
  replaceProjectVectorReferences,
} from "backend";
import { nodesToJSON } from "backend/src/altNodes/jsonNodeConversion";
import { oldConvertNodesToAltNodes } from "backend/src/altNodes/oldAltConversion";
import { exportNodeAsPNG } from "backend/src/common/images";
import {
  createImageAssetName,
  createVectorAssetName,
} from "backend/src/common/assetNames";
import { isLikelyIcon } from "backend/src/altNodes/iconDetection";
import type {
  ProjectAsset,
  ProjectImage,
  ProjectVector,
} from "backend/src/zipGenerator";
import { retrieveGenericSolidUIColors } from "backend/src/common/retrieveUI/retrieveColors";
import { flutterCodeGenTextStyles } from "backend/src/flutter/flutterMain";
import { htmlCodeGenTextStyles } from "backend/src/html/htmlMain";
import { swiftUICodeGenTextStyles } from "backend/src/swiftui/swiftuiMain";
import { composeCodeGenTextStyles } from "backend/src/compose/composeMain";
import {
  DownloadProjectFormat,
  PluginSettings,
  SettingWillChangeMessage,
} from "types";

let userPluginSettings: PluginSettings;

export const defaultPluginSettings: PluginSettings = {
  framework: "HTML",
  showLayerNames: false,
  useOldPluginVersion2025: false,
  responsiveRoot: false,
  flutterGenerationMode: "snippet",
  swiftUIGenerationMode: "snippet",
  composeGenerationMode: "snippet",
  reactNativeGenerationMode: "screen",
  roundTailwindValues: true,
  roundTailwindColors: true,
  useColorVariables: true,
  customTailwindPrefix: "",
  embedImages: false,
  embedVectors: false,
  htmlGenerationMode: "html",
  tailwindGenerationMode: "jsx",
  baseFontSize: 16,
  useTailwind4: true,
  thresholdPercent: 15,
  baseFontFamily: "",
  fontFamilyCustomConfig: {},
};

// A helper type guard to ensure the key belongs to the PluginSettings type
function isKeyOfPluginSettings(key: string): key is keyof PluginSettings {
  return key in defaultPluginSettings;
}

const getUserSettings = async () => {
  console.log("[DEBUG] getUserSettings - Starting to fetch user settings");
  const possiblePluginSrcSettings =
    (await figma.clientStorage.getAsync("userPluginSettings")) ?? {};
  console.log(
    "[DEBUG] getUserSettings - Raw settings from storage:",
    possiblePluginSrcSettings,
  );

  const updatedPluginSrcSettings = {
    ...defaultPluginSettings,
    ...Object.keys(defaultPluginSettings).reduce((validSettings, key) => {
      if (
        isKeyOfPluginSettings(key) &&
        key in possiblePluginSrcSettings &&
        typeof possiblePluginSrcSettings[key] ===
          typeof defaultPluginSettings[key]
      ) {
        validSettings[key] = possiblePluginSrcSettings[key] as any;
      }
      return validSettings;
    }, {} as Partial<PluginSettings>),
  };

  userPluginSettings = updatedPluginSrcSettings as PluginSettings;
  console.log("[DEBUG] getUserSettings - Final settings:", userPluginSettings);
  return userPluginSettings;
};

const initSettings = async () => {
  console.log("[DEBUG] initSettings - Initializing plugin settings");
  await getUserSettings();
  postSettingsChanged(userPluginSettings);
  console.log("[DEBUG] initSettings - Calling safeRun with settings");
  safeRun(userPluginSettings);
};

// Used to prevent running from happening again.
let isLoading = false;
let isDownloadingProject = false;
let rerunAfterDownload = false;
const safeRun = async (settings: PluginSettings) => {
  console.log(
    "[DEBUG] safeRun - Called with isLoading =",
    isLoading,
    "selectionCount =",
    figma.currentPage.selection.length,
  );
  if (isDownloadingProject) {
    rerunAfterDownload = true;
    return;
  }

  if (isLoading === false) {
    try {
      isLoading = true;
      console.log("[DEBUG] safeRun - Starting run execution");
      await run(settings);
      console.log("[DEBUG] safeRun - Run execution completed");
      // hack to make it not immediately set to false when complete. (executes on next frame)
      setTimeout(() => {
        console.log("[DEBUG] safeRun - Resetting isLoading to false");
        isLoading = false;
      }, 1);
    } catch (e) {
      console.log("[DEBUG] safeRun - Error caught in execution");
      isLoading = false; // Make sure to reset the flag on error
      if (e && typeof e === "object" && "message" in e) {
        const error = e as Error;
        console.log("error: ", error.stack);
        figma.ui.postMessage({ type: "error", error: error.message });
      } else {
        // Handle non-standard errors or unknown error types
        const errorMessage = String(e);
        console.log("Unknown error: ", errorMessage);
        figma.ui.postMessage({
          type: "error",
          error: errorMessage || "Unknown error occurred",
        });
      }

      // Send a message to reset the UI state
      figma.ui.postMessage({ type: "conversion-complete", success: false });
    }
  } else {
    console.log(
      "[DEBUG] safeRun - Skipping execution because isLoading =",
      isLoading,
    );
  }
};

const allowedFormatsByFramework: Record<
  "Compose" | "Flutter" | "HTML" | "SwiftUI" | "Tailwind" | "ReactNative",
  DownloadProjectFormat[]
> = {
  Compose: ["compose"],
  Flutter: ["flutter"],
  HTML: ["html", "nextjs", "vite"],
  ReactNative: ["reactnative"],
  SwiftUI: ["swiftui"],
  Tailwind: ["html", "nextjs", "vite"],
};

const toKebab = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const getRootSelectionName = (selection: readonly SceneNode[]) => {
  if (selection.length === 0) {
    return "figma-export";
  }

  if (selection.length === 1) {
    return toKebab(selection[0].name) || "figma-export";
  }

  return (
    toKebab(selection[0].parent?.name ?? "figma-selection") || "figma-selection"
  );
};

const isImageNode = (node: SceneNode): boolean => {
  if ("fills" in node) {
    const fills = node.fills;
    if (fills && fills !== figma.mixed && Array.isArray(fills)) {
      return fills.some((fill) => fill.type === "IMAGE");
    }
  }

  return false;
};

const getImagePaints = (node: SceneNode): ImagePaint[] => {
  if (!("fills" in node) || node.fills === figma.mixed) return [];
  return Array.isArray(node.fills)
    ? node.fills.filter((fill): fill is ImagePaint => fill.type === "IMAGE")
    : [];
};

const sniffImageExtension = (bytes: Uint8Array): string => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "gif";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return "png";
};

const hasActiveImageFilters = (paint: ImagePaint) =>
  !!paint.filters &&
  Object.values(paint.filters).some(
    (value) => typeof value === "number" && value !== 0,
  );

const exportOriginalImage = async (
  node: SceneNode,
): Promise<ProjectImage | null> => {
  const paints = getImagePaints(node);
  if (
    paints.length !== 1 ||
    !("fills" in node) ||
    !Array.isArray(node.fills) ||
    node.fills.length !== 1 ||
    !["FILL", "FIT"].includes(paints[0].scaleMode) ||
    hasActiveImageFilters(paints[0]) ||
    !paints[0].imageHash
  ) {
    return null;
  }

  const image = figma.getImageByHash(paints[0].imageHash);
  if (!image) return null;

  const bytes = await image.getBytesAsync();
  return {
    bytes,
    kind: "image",
    name: createImageAssetName(paints[0].imageHash, sniffImageExtension(bytes)),
    nodeId: node.id,
    source: "original",
  };
};

const exportProjectImages = async (
  selection: readonly SceneNode[],
  requiredNodeIds: ReadonlySet<string>,
  renderScale = 1,
): Promise<ProjectImage[]> => {
  const images: ProjectImage[] = [];
  const missingNodeIds = new Set(requiredNodeIds);

  const visit = async (node: SceneNode) => {
    if (node.visible === false) {
      return;
    }

    if (missingNodeIds.has(node.id)) {
      if (!isImageNode(node) || !("exportAsync" in node)) {
        throw new Error(
          `Node ${node.name || node.id} cannot be exported as an image.`,
        );
      }

      let exportedImage: ProjectImage | null = null;
      try {
        exportedImage = await exportOriginalImage(node);
      } catch (error) {
        console.warn(`Original image export failed for ${node.id}`, error);
      }

      if (!exportedImage) {
        const hasChildren = "children" in node && node.children.length > 0;
        exportedImage = {
          bytes: await exportNodeAsPNG(node, hasChildren, renderScale),
          kind: "image",
          name: createImageAssetName(node.id),
          nodeId: node.id,
          source: "rendered",
        };
      }
      images.push(exportedImage);
      missingNodeIds.delete(node.id);
    }

    if ("children" in node) {
      for (const child of node.children) {
        await visit(child);
      }
    }
  };

  for (const node of selection) {
    await visit(node);
  }

  if (missingNodeIds.size > 0) {
    throw new Error(
      `Could not find ${missingNodeIds.size} image layer${
        missingNodeIds.size === 1 ? "" : "s"
      } in the selected content.`,
    );
  }

  return images;
};

const collectImageNodeIds = (selection: readonly SceneNode[]) => {
  const nodeIds = new Set<string>();
  const visit = (node: SceneNode) => {
    if (node.visible === false) return;
    if (isImageNode(node)) nodeIds.add(node.id);
    if ("children" in node) node.children.forEach(visit);
  };
  selection.forEach(visit);
  return nodeIds;
};

const exportProjectVectors = async (
  selection: readonly SceneNode[],
  useLegacyDetection: boolean,
): Promise<ProjectVector[]> => {
  const vectors: ProjectVector[] = [];
  const legacyVectorTypes = new Set<NodeType>([
    "BOOLEAN_OPERATION",
    "POLYGON",
    "STAR",
    "VECTOR",
  ]);
  const isLegacyFlattenable = (node: SceneNode): boolean => {
    if (legacyVectorTypes.has(node.type)) return true;
    return (
      "children" in node &&
      node.children.length > 0 &&
      node.children.every(isLegacyFlattenable)
    );
  };

  const visit = async (node: SceneNode, parentFlattened = false) => {
    if (node.visible === false) return;
    const shouldFlatten =
      !parentFlattened &&
      (isLikelyIcon(node) || (useLegacyDetection && isLegacyFlattenable(node)));

    if (shouldFlatten && "exportAsync" in node) {
      let svgError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const svg = await node.exportAsync({ format: "SVG_STRING" });
          if (!svg.trim().startsWith("<svg")) {
            throw new Error("Figma returned invalid SVG content");
          }
          vectors.push({
            bytes: new TextEncoder().encode(svg),
            format: "svg",
            kind: "vector",
            name: createVectorAssetName(node.id, "svg", node.name),
            nodeId: node.id,
            nodeName: node.name,
          });
          svgError = undefined;
          break;
        } catch (error) {
          svgError = error;
        }
      }

      if (svgError) {
        const bytes = await node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 3 },
        });
        vectors.push({
          bytes,
          fallbackReason:
            svgError instanceof Error ? svgError.message : String(svgError),
          format: "png",
          kind: "vector",
          name: createVectorAssetName(node.id, "png", node.name),
          nodeId: node.id,
          nodeName: node.name,
        });
      }
    }

    if (!shouldFlatten && "children" in node) {
      for (const child of node.children) await visit(child, false);
    }
  };

  for (const node of selection) await visit(node);
  return vectors;
};

const getRequiredFlutterVectorAssetNames = (code: string) =>
  new Set(
    [...code.matchAll(/assets\/(?:[^/"']+\/)?vectors\/(vector-[^"']+\.svg)/g)]
      .map((match) => match[1])
      .filter(Boolean),
  );

const getVectorSvgAssetName = (vector: ProjectVector) =>
  vector.name.replace(/\.png$/i, ".svg");

const inferNodeIdFromVectorAssetName = (assetName: string) => {
  const cleanId = assetName
    .replace(/^vector-/i, "")
    .replace(/\.(svg|png)$/i, "");
  const parts = cleanId.split("-").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  // New format: vector-{name}-{id} where id is the last parts
  // Old format: vector-{id}
  // We need to reconstruct the node ID from the last parts
  // The node ID format is like "123:456" or "I123:456;789:abc"
  
  if (/^I\d+$/i.test(parts[0]) && parts.length >= 4) {
    // Format: I123-456-789-abc -> I123:456;789:abc
    return `${parts[0]}:${parts[1]};${parts[2]}:${parts.slice(3).join("-")}`;
  }

  // Format: 123-456 -> 123:456
  // Or with name prefix: name-123-456 -> 123:456
  // Take the last 2 parts as the node ID
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}:${parts[parts.length - 1]}`;
  }

  return null;
};

const exportRequiredFlutterVectorAssets = async (
  rawCode: string,
  registeredVectors: ProjectVector[],
): Promise<ProjectVector[]> => {
  const requiredAssetNames = getRequiredFlutterVectorAssetNames(rawCode);
  if (requiredAssetNames.size === 0) {
    return registeredVectors;
  }

  const vectorsBySvgAssetName = new Map(
    registeredVectors.map((vector) => [getVectorSvgAssetName(vector), vector]),
  );
  const resolvedVectors = [...registeredVectors];

  for (const assetName of requiredAssetNames) {
    if (vectorsBySvgAssetName.has(assetName)) {
      continue;
    }

    const nodeId = inferNodeIdFromVectorAssetName(assetName);
    const node = nodeId ? await figma.getNodeByIdAsync(nodeId) : null;
    if (
      !node ||
      !("exportAsync" in node) ||
      ("visible" in node && node.visible === false)
    ) {
      continue;
    }

    let vector: ProjectVector;
    try {
      const svg = await node.exportAsync({ format: "SVG_STRING" });
      if (!svg.trim().startsWith("<svg")) {
        throw new Error("Figma returned invalid SVG content");
      }
      vector = {
        bytes: new TextEncoder().encode(svg),
        format: "svg",
        kind: "vector",
        name: assetName,
        nodeId: node.id,
      };
    } catch (error) {
      vector = {
        bytes: await node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 3 },
        }),
        fallbackReason: error instanceof Error ? error.message : String(error),
        format: "png",
        kind: "vector",
        name: assetName.replace(/\.svg$/i, ".png"),
        nodeId: node.id,
      };
    }

    vectorsBySvgAssetName.set(assetName, vector);
    resolvedVectors.push(vector);
  }

  return resolvedVectors;
};

const getConvertedSelectionForDownload = async (
  nodes: readonly SceneNode[],
  pluginSettings: PluginSettings,
): Promise<SceneNode[]> => {
  if (nodes.length === 0) {
    return [];
  }

  const convertedSelection = pluginSettings.useOldPluginVersion2025
    ? oldConvertNodesToAltNodes(nodes, null)
    : await nodesToJSON(nodes, pluginSettings);
  return convertedSelection as unknown as SceneNode[];
};

const generateDownloadCode = async (
  nodes: readonly SceneNode[],
  format: DownloadProjectFormat,
  pluginSettings: PluginSettings,
) => {
  const convertedSelection = await getConvertedSelectionForDownload(
    nodes,
    pluginSettings,
  );

  if (convertedSelection.length === 0) {
    return "<div>No content to export</div>";
  }

  const settings = {
    ...pluginSettings,
    embedImages: false,
    imagePlaceholderMode: "asset" as const,
  };
  const isReactProject = format === "nextjs" || format === "vite";

  if (pluginSettings.framework === "Flutter") {
    return flutterMain(convertedSelection, {
      ...settings,
      flutterGenerationMode: "fullApp",
    });
  }

  if (pluginSettings.framework === "SwiftUI") {
    return swiftuiMain(convertedSelection, {
      ...settings,
      swiftUIGenerationMode: "struct",
    });
  }

  if (pluginSettings.framework === "Compose") {
    return composeMain(convertedSelection, {
      ...settings,
      composeGenerationMode: "screen",
    });
  }

  if (pluginSettings.framework === "ReactNative") {
    return reactNativeMain(convertedSelection, {
      ...settings,
      reactNativeGenerationMode: "screen",
    });
  }

  if (pluginSettings.framework === "Tailwind") {
    const result = await tailwindMain(convertedSelection, {
      ...settings,
      tailwindGenerationMode: isReactProject ? "jsx" : "html",
    });
    return result || "<div>Failed to generate Tailwind</div>";
  }

  const result = await htmlMain(
    convertedSelection,
    {
      ...settings,
      htmlGenerationMode: isReactProject ? "jsx" : "html",
    },
    true,
  );
  return result?.html || "<div>Failed to generate HTML</div>";
};

const downloadProject = async (format: DownloadProjectFormat) => {
  if (
    !["compose", "flutter", "html", "nextjs", "reactnative", "swiftui", "vite"].includes(
      format,
    )
  ) {
    throw new Error(`Invalid download format: ${format}.`);
  }

  const pluginSettings = { ...userPluginSettings };
  if (!allowedFormatsByFramework[pluginSettings.framework].includes(format)) {
    throw new Error(
      `${format} export is not available for ${pluginSettings.framework}.`,
    );
  }

  const selection = [...figma.currentPage.selection];
  if (selection.length === 0) {
    throw new Error("Please select at least one layer to export.");
  }
  const rootName = getRootSelectionName(selection);

  const registeredImages = await exportProjectImages(
    selection,
    collectImageNodeIds(selection),
    format === "flutter" ? 2 : 1,
  );
  const registeredVectors =
    format === "flutter" || format === "reactnative" || format === "swiftui"
      ? await exportProjectVectors(
          selection,
          pluginSettings.useOldPluginVersion2025,
        )
      : [];
  const rawCode = await generateDownloadCode(selection, format, pluginSettings);
  const availableVectors =
    format === "flutter"
      ? await exportRequiredFlutterVectorAssets(rawCode, registeredVectors)
      : registeredVectors;
  const requiredImageNodeIds = extractProjectImageNodeIds(rawCode);
  const images = registeredImages.filter((image) =>
    requiredImageNodeIds.has(image.nodeId),
  );
  const vectors = availableVectors.filter((vector) => {
    if (format === "flutter") {
      return getRequiredFlutterVectorAssetNames(rawCode).has(
        getVectorSvgAssetName(vector),
      );
    }
    if (format === "reactnative") {
      const assetName = createVectorAssetName(
        vector.nodeId,
        "svg",
        vector.nodeName,
      ).replace(/\.svg$/i, "");
      return rawCode.includes(`assetName="${assetName}"`);
    }
    const assetName = createVectorAssetName(
      vector.nodeId,
      "svg",
      vector.nodeName,
    ).replace(/\.svg$/i, "");
    return rawCode.includes(`Image("${assetName}")`);
  });
  const registeredVectorPaths = new Set(
    vectors.map((vector) => getVectorSvgAssetName(vector)),
  );
  const missingVectorPaths = [...getRequiredFlutterVectorAssetNames(rawCode)]
    .filter((assetName) => !registeredVectorPaths.has(assetName))
    .map((assetName) => `assets/vectors/${assetName}`);
  if (format === "flutter" && missingVectorPaths.length > 0) {
    throw new Error(
      `Could not export ${missingVectorPaths.length} vector asset${
        missingVectorPaths.length === 1 ? "" : "s"
      }: ${missingVectorPaths.join(", ")}`,
    );
  }
  const nonFlutterMissingVectorPaths = new Set(
    [...rawCode.matchAll(/assets\/vectors\/[^"']+\.svg/g)].map(
      (match) => match[0],
    ),
  );
  if (format !== "flutter" && nonFlutterMissingVectorPaths.size > 0) {
    throw new Error(
      `Could not export ${nonFlutterMissingVectorPaths.size} vector asset${
        nonFlutterMissingVectorPaths.size === 1 ? "" : "s"
      }: ${[...nonFlutterMissingVectorPaths].join(", ")}`,
    );
  }
  if (format === "swiftui") {
    const registeredSwiftAssets = new Set(
      vectors.map((vector) =>
        createVectorAssetName(vector.nodeId, "svg", vector.nodeName).replace(
          /\.svg$/i,
          "",
        ),
      ),
    );
    const requiredSwiftAssets = new Set(
      [...rawCode.matchAll(/Image\("(vector-[^"]+)"\)/g)].map(
        (match) => match[1],
      ),
    );
    const missingSwiftAssets = [...requiredSwiftAssets].filter(
      (name) => !registeredSwiftAssets.has(name),
    );
    if (missingSwiftAssets.length > 0) {
      throw new Error(
        `Could not export ${missingSwiftAssets.length} SwiftUI vector asset${
          missingSwiftAssets.length === 1 ? "" : "s"
        }: ${missingSwiftAssets.join(", ")}`,
      );
    }
  }
  const assets: ProjectAsset[] = [...images, ...vectors];
  const imageResolvedCode = replaceProjectImagePlaceholders(
    rawCode,
    images,
    format,
    rootName,
  );
  const code = replaceProjectVectorReferences(
    imageResolvedCode,
    assets,
    rootName,
  );
  const finalCode =
    format === "reactnative"
      ? injectReactNativeVectorHelpers(code, assets, rootName)
      : code;
  const uniqueAssetsByName = new Map(
    assets.map((asset) => [`${asset.kind ?? "image"}:${asset.name}`, asset]),
  );
  const rawAssetSize = [...uniqueAssetsByName.values()].reduce(
    (sum, asset) => sum + asset.bytes.byteLength,
    0,
  );
  const maxRawAssetSizeBytes = 25 * 1024 * 1024;
  if (rawAssetSize > maxRawAssetSizeBytes) {
    throw new Error(
      `Assets are too large (${Math.round(rawAssetSize / 1024 / 1024)}MB). Try selecting fewer images or smaller components.`,
    );
  }
  const zipData = generateProjectZip(
    finalCode,
    pluginSettings.framework,
    assets,
    format,
    rootName,
  );

  const maxMessageSizeBytes = 30 * 1024 * 1024;
  if (zipData.byteLength > maxMessageSizeBytes) {
    throw new Error(
      `Project too large (${Math.round(zipData.byteLength / 1024 / 1024)}MB). Try selecting fewer images or smaller components.`,
    );
  }

  const zip = zipData.buffer.slice(
    zipData.byteOffset,
    zipData.byteOffset + zipData.byteLength,
  );

  figma.ui.postMessage({
    type: "project-zip",
    zip,
    format,
    fileName: `${rootName}-${format}.zip`,
  });
};

const standardMode = async () => {
  console.log("[DEBUG] standardMode - Starting standard mode initialization");
  figma.showUI(__html__, { width: 450, height: 700, themeColors: true });
  let initialized = false;
  const initializeOnce = async () => {
    if (initialized) {
      return;
    }
    initialized = true;
    await initSettings();
  };

  // Listen for selection changes
  figma.on("selectionchange", () => {
    console.log(
      "[DEBUG] selectionchange event - New selection count:",
      figma.currentPage.selection.length,
    );
    safeRun(userPluginSettings);
  });

  // Listen for page changes
  figma.loadAllPagesAsync();
  figma.on("documentchange", () => {
    console.log("[DEBUG] documentchange event triggered");
    // Node: This was causing an infinite load when you try to export a background image from a group that contains children.
    // The reason for this is that the code will temporarily hide the children of the group in order to export a clean image
    // then restores the visibility of the children. This constitutes a document change so it's restarting the whole conversion.
    // In order to stop this, we disable safeRun() when doing conversions (while isLoading === true).
    safeRun(userPluginSettings);
  });

  figma.ui.onmessage = async (msg) => {
    console.log(
      "[DEBUG] figma.ui.onmessage",
      msg?.type ? `type=${msg.type}` : "unknown type",
    );

    if (msg.type === "ui-ready") {
      await initializeOnce();
    } else if (msg.type === "download-project") {
      if (isLoading) {
        figma.ui.postMessage({
          type: "project-download-error",
          error: "Please wait for the current conversion to finish.",
        });
        return;
      }

      if (isDownloadingProject) {
        figma.ui.postMessage({
          type: "project-download-error",
          error: "A project download is already in progress.",
        });
        return;
      }

      isDownloadingProject = true;
      try {
        await downloadProject(msg.format as DownloadProjectFormat);
      } catch (error) {
        console.error("Download project failed:", error);
        figma.ui.postMessage({
          type: "project-download-error",
          error: `Failed to create project: ${
            error instanceof Error ? error.message : "Unknown error occurred"
          }`,
        });
      } finally {
        isDownloadingProject = false;
        if (rerunAfterDownload) {
          rerunAfterDownload = false;
          void safeRun(userPluginSettings);
        }
      }
    } else if (msg.type === "pluginSettingWillChange") {
      const { key, value } = msg as SettingWillChangeMessage<unknown>;
      console.log(`[DEBUG] Setting changed: ${key} = ${value}`);
      (userPluginSettings as any)[key] = value;
      figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
      safeRun(userPluginSettings);
    } else if (msg.type === "get-selection-json") {
      console.log("[DEBUG] get-selection-json message received");

      const nodes = figma.currentPage.selection;
      if (nodes.length === 0) {
        figma.ui.postMessage({
          type: "selection-json",
          data: { message: "No nodes selected" },
        });
        return;
      }
      const result: {
        json?: SceneNode[];
        oldConversion?: any;
        newConversion?: any;
      } = {};

      try {
        result.json = (await Promise.all(
          nodes.map(
            async (node) =>
              (
                (await node.exportAsync({
                  format: "JSON_REST_V1",
                })) as any
              ).document,
          ),
        )) as SceneNode[];
      } catch (error) {
        console.error("Error exporting JSON:", error);
      }

      try {
        const newNodes = await nodesToJSON(nodes, userPluginSettings);
        const removeParent = (node: any) => {
          if (node.parent) {
            delete node.parent;
          }
          if (node.children) {
            node.children.forEach(removeParent);
          }
        };
        newNodes.forEach(removeParent);
        result.newConversion = newNodes;
      } catch (error) {
        console.error("Error in new conversion:", error);
      }

      const nodeJson = result;

      console.log(
        "[DEBUG] Exported node JSON:",
        `jsonCount=${result.json?.length ?? 0}`,
        `newConversionCount=${result.newConversion?.length ?? 0}`,
      );

      // Send the JSON data back to the UI
      figma.ui.postMessage({
        type: "selection-json",
        data: nodeJson,
      });
    }
  };
};

const codegenMode = async () => {
  console.log("[DEBUG] codegenMode - Starting codegen mode initialization");
  // figma.showUI(__html__, { visible: false });
  await getUserSettings();

  figma.codegen.on(
    "generate",
    async ({ language, node }: CodegenEvent): Promise<CodegenResult[]> => {
      console.log(
        `[DEBUG] codegen.generate - Language: ${language}, Node: id=${node.id}, type=${node.type}`,
      );

      const convertedSelection = await nodesToJSON([node], userPluginSettings);
      console.log(
        "[DEBUG] codegen.generate - Converted selection count:",
        convertedSelection.length,
      );

      switch (language) {
        case "html":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection as unknown as SceneNode[],
                  { ...userPluginSettings, htmlGenerationMode: "html" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];
        case "html_jsx":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection as unknown as SceneNode[],
                  { ...userPluginSettings, htmlGenerationMode: "jsx" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "html_svelte":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection as unknown as SceneNode[],
                  { ...userPluginSettings, htmlGenerationMode: "svelte" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "html_styled_components":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection as unknown as SceneNode[],
                  {
                    ...userPluginSettings,
                    htmlGenerationMode: "styled-components",
                  },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "tailwind":
        case "tailwind_jsx":
          return [
            {
              title: "Code",
              code: await tailwindMain(convertedSelection as unknown as SceneNode[], {
                ...userPluginSettings,
                tailwindGenerationMode:
                  language === "tailwind_jsx" ? "jsx" : "html",
              }),
              language: "HTML",
            },
            // {
            //   title: "Style",
            //   code: tailwindMain(convertedSelection, defaultPluginSettings),
            //   language: "HTML",
            // },
            {
              title: "Tailwind Colors",
              code: (await retrieveGenericSolidUIColors("Tailwind"))
                .map((d) => {
                  let str = `${d.hex};`;
                  if (d.colorName !== d.hex) {
                    str += ` // ${d.colorName}`;
                  }
                  if (d.meta) {
                    str += ` (${d.meta})`;
                  }
                  return str;
                })
                .join("\n"),
              language: "JAVASCRIPT",
            },
            {
              title: "Text Styles",
              code: tailwindCodeGenTextStyles(),
              language: "HTML",
            },
          ];
        case "flutter":
          return [
            {
              title: "Code",
              code: flutterMain(convertedSelection as unknown as SceneNode[], {
                ...userPluginSettings,
                flutterGenerationMode: "snippet",
              }),
              language: "SWIFT",
            },
            {
              title: "Text Styles",
              code: flutterCodeGenTextStyles(),
              language: "SWIFT",
            },
          ];
        case "swiftUI":
          return [
            {
              title: "SwiftUI",
              code: swiftuiMain(convertedSelection as unknown as SceneNode[], {
                ...userPluginSettings,
                swiftUIGenerationMode: "snippet",
              }),
              language: "SWIFT",
            },
            {
              title: "Text Styles",
              code: swiftUICodeGenTextStyles(),
              language: "SWIFT",
            },
          ];
        case "compose":
          return [
            {
              title: "Jetpack Compose",
              code: composeMain(convertedSelection as unknown as SceneNode[], {
                ...userPluginSettings,
                composeGenerationMode: "snippet",
              }),
              language: "KOTLIN",
            },
            {
              title: "Text Styles",
              code: composeCodeGenTextStyles(),
              language: "KOTLIN",
            },
          ];
        default:
          break;
      }

      const blocks: CodegenResult[] = [];
      return blocks;
    },
  );
};

switch (figma.mode) {
  case "default":
  case "inspect":
    console.log("[DEBUG] Starting plugin in", figma.mode, "mode");
    standardMode();
    break;
  case "codegen":
    console.log("[DEBUG] Starting plugin in codegen mode");
    codegenMode();
    break;
  default:
    console.log("[DEBUG] Unknown plugin mode:", figma.mode);
    break;
}
