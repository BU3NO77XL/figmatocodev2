const cleanNodeId = (nodeId: string) =>
  nodeId.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "");

const cleanNodeName = (nodeName: string) =>
  nodeName
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();

export const createImageAssetName = (nodeId: string, extension = "png") =>
  `image-${cleanNodeId(nodeId) || "asset"}.${extension}`;

export const createVectorAssetName = (
  nodeId: string,
  extension: "svg" | "png" = "svg",
  nodeName?: string,
) => {
  const cleanId = cleanNodeId(nodeId) || "asset";
  if (nodeName) {
    const cleanName = cleanNodeName(nodeName) || "asset";
    return `vector-${cleanName}-${cleanId}.${extension}`;
  }
  return `vector-${cleanId}.${extension}`;
};

export const getFlutterVectorAssetPath = (
  nodeId: string,
  screenName?: string,
  nodeName?: string,
) =>
  screenName
    ? `assets/${screenName}/vectors/${createVectorAssetName(nodeId, "svg", nodeName)}`
    : `assets/vectors/${createVectorAssetName(nodeId, "svg", nodeName)}`;
