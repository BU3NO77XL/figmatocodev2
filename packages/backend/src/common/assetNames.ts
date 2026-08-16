const cleanNodeId = (nodeId: string) =>
  nodeId.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "");

export const createImageAssetName = (nodeId: string, extension = "png") =>
  `image-${cleanNodeId(nodeId) || "asset"}.${extension}`;

export const createVectorAssetName = (
  nodeId: string,
  extension: "svg" | "png" = "svg",
) => `vector-${cleanNodeId(nodeId) || "asset"}.${extension}`;

export const getFlutterVectorAssetPath = (
  nodeId: string,
  screenName?: string,
) =>
  screenName
    ? `assets/${screenName}/vectors/${createVectorAssetName(nodeId)}`
    : `assets/vectors/${createVectorAssetName(nodeId)}`;
