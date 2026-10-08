import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginSettings } from "types";
import { clearWarnings, warnings } from "../common/commonConversionWarnings";
import { composeMain } from "./composeMain";

vi.stubGlobal("figma", { mixed: Symbol("figma.mixed") });

const makeSettings = (
  imagePlaceholderMode: "remote" | "asset",
  composeGenerationMode: "snippet" | "screen",
): PluginSettings =>
  ({
    framework: "Compose",
    composeGenerationMode,
    imagePlaceholderMode,
  }) as PluginSettings;

const imageNode = {
  fills: [{ scaleMode: "FILL", type: "IMAGE", visible: true }],
  height: 200,
  id: "12:34",
  name: "Hero",
  parent: null,
  type: "RECTANGLE",
  visible: true,
  width: 300,
} as unknown as SceneNode;

const vectorNode = {
  height: 24,
  id: "55:66",
  name: "Icon",
  parent: null,
  type: "VECTOR",
  visible: true,
  width: 24,
} as unknown as SceneNode;

const booleanNode = {
  height: 48,
  id: "77:88",
  name: "Merged",
  parent: null,
  type: "BOOLEAN_OPERATION",
  visible: true,
  width: 48,
} as unknown as SceneNode;

const imageFillWarning = "Image fills are replaced with placeholders in Compose";
const vectorWarning = "VectorNodes are not fully supported in Compose";

describe("Compose image fills", () => {
  beforeEach(clearWarnings);

  it("renders remote image placeholders instead of dropping them", () => {
    const code = composeMain([imageNode], makeSettings("remote", "snippet"));

    expect(code).toContain(
      'rememberAsyncImagePainter("https://placehold.co/300x200")',
    );
    expect(code).toContain("contentScale = ContentScale.Crop");
    expect(code).toContain("modifier = Modifier.width(300.dp).height(200.dp)");
    expect([...warnings]).not.toContain(imageFillWarning);
  });

  it("adds the Coil import to the screen template", () => {
    const code = composeMain([imageNode], makeSettings("remote", "screen"));

    expect(code).toContain("import coil.compose.rememberAsyncImagePainter");
    expect(code).toContain("fun HeroScreen()");
    expect([...warnings]).not.toContain(imageFillWarning);
  });

  it("exports image fills as drawable placeholders when downloading", () => {
    const code = composeMain([imageNode], makeSettings("asset", "snippet"));

    expect(code).toContain('painterResource("__FIGMA_IMAGE_12%3A34__")');
    expect(code).not.toContain("rememberAsyncImagePainter");
    expect([...warnings]).not.toContain(imageFillWarning);
  });
});

describe("Compose vector nodes", () => {
  beforeEach(clearWarnings);

  it("renders vectors as drawable images instead of warning", () => {
    const code = composeMain([vectorNode], makeSettings("remote", "snippet"));

    expect(code).toContain("painterResource(R.drawable.vector_icon_55_66)");
    expect(code).toContain("modifier = Modifier.width(24.dp).height(24.dp)");
    expect([...warnings]).not.toContain(vectorWarning);
  });

  it("exports vector placeholders when downloading a project", () => {
    const code = composeMain([vectorNode], makeSettings("asset", "snippet"));

    expect(code).toContain('painterResource("__FIGMA_VECTOR_55%3A66__")');
    expect([...warnings]).not.toContain(vectorWarning);
  });

  it("renders boolean operation vectors too", () => {
    const code = composeMain(
      [booleanNode],
      makeSettings("remote", "snippet"),
    );

    expect(code).toContain("painterResource(R.drawable.vector_merged_77_88)");
    expect([...warnings]).not.toContain(vectorWarning);
  });
});
