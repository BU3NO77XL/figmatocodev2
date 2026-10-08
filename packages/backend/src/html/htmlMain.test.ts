import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginSettings } from "types";
import { clearWarnings } from "../common/commonConversionWarnings";
import { generateHTMLPreview } from "./htmlMain";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const svgMarkup =
  '<svg width="24" height="24"><path d="M0 0h24v24H0z" /></svg>';

let failExport = false;

vi.stubGlobal("figma", {
  getNodeByIdAsync: async (nodeId: string) => {
    if (failExport) {
      throw new Error(`Node ${nodeId} cannot be exported`);
    }
    return {
      exportAsync: async (options: { format?: string }) =>
        options.format === "SVG_STRING" ? svgMarkup : pngBytes,
    };
  },
  mixed: Symbol("figma.mixed"),
  ui: { postMessage: () => undefined },
});

const settings = {
  embedImages: false,
  embedVectors: false,
  framework: "Compose",
  htmlGenerationMode: "html",
  imagePlaceholderMode: "remote",
  showLayerNames: false,
  useColorVariables: false,
} as PluginSettings;

const makeImageNode = () =>
  ({
    constraints: { horizontal: "LEFT", vertical: "TOP" },
    fills: [{ scaleMode: "FILL", type: "IMAGE", visible: true }],
    height: 200,
    id: "12:34",
    name: "Hero",
    opacity: 1,
    parent: null,
    rotation: 0,
    type: "RECTANGLE",
    visible: true,
    width: 300,
    x: 0,
    y: 0,
  }) as unknown as SceneNode;

const makeVectorNode = () =>
  ({
    fills: [],
    height: 24,
    id: "55:66",
    name: "Icon",
    opacity: 1,
    parent: null,
    rotation: 0,
    type: "VECTOR",
    visible: true,
    width: 24,
    x: 0,
    y: 0,
  }) as unknown as SceneNode;

const makeSliderNodes = () => {
  const card = {
    constraints: { horizontal: "LEFT", vertical: "TOP" },
    fills: [],
    height: 200,
    id: "1:2",
    name: "Card",
    opacity: 1,
    rotation: 0,
    type: "RECTANGLE",
    visible: true,
    width: 300,
    x: 0,
    y: 0,
  } as unknown as SceneNode;

  const row = {
    children: [card],
    clipsContent: true,
    counterAxisAlignItems: "MIN",
    fills: [],
    height: 40,
    id: "1:1",
    itemSpacing: 16,
    layoutMode: "HORIZONTAL",
    name: "Slider",
    opacity: 1,
    primaryAxisAlignItems: "MIN",
    rotation: 0,
    type: "FRAME",
    visible: true,
    width: 390,
    x: 0,
    y: 0,
  } as unknown as SceneNode;

  const root = {
    children: [row],
    clipsContent: true,
    counterAxisAlignItems: "MIN",
    fills: [],
    height: 844,
    id: "1:0",
    layoutMode: "NONE",
    name: "Screen",
    opacity: 1,
    primaryAxisAlignItems: "MIN",
    rotation: 0,
    type: "FRAME",
    visible: true,
    width: 390,
    x: 0,
    y: 0,
  } as unknown as SceneNode;

  (card as { parent?: unknown }).parent = row;
  (row as { parent?: unknown }).parent = root;

  return [root];
};

describe("generateHTMLPreview fidelity", () => {
  beforeEach(() => {
    clearWarnings();
    failExport = false;
  });

  it("embeds the real image pixels instead of a remote placeholder", async () => {
    const preview = await generateHTMLPreview([makeImageNode()], settings);

    expect(preview.content).toContain('src="data:image/png;base64,');
    expect(preview.content).not.toContain("placehold.co");
  });

  it("renders vector layers as SVG instead of an empty rectangle", async () => {
    const preview = await generateHTMLPreview([makeVectorNode()], settings);

    expect(preview.content).toContain("<svg");
  });

  it("falls back to a placeholder when the image cannot be exported", async () => {
    failExport = true;

    const preview = await generateHTMLPreview([makeImageNode()], settings);

    expect(preview.content).toContain("https://placehold.co/300x200");
  });

  it("sizes the preview root to the frame instead of stretching it", async () => {
    const preview = await generateHTMLPreview([makeImageNode()], settings);

    expect(preview.content).toContain("width: 300px");
    expect(preview.content).toContain("height: 200px");
    expect(preview.content).toContain("margin: auto");
    expect(preview.content).not.toContain("width: 100%");
    expect(preview.content).not.toContain("height: 100%");
  });

  it("keeps fixed auto-layout children from shrinking", async () => {
    const preview = await generateHTMLPreview(makeSliderNodes(), settings);

    expect(preview.content).toContain("flex-shrink: 0");
  });
});
