import { beforeEach, describe, expect, it } from "vitest";
import type { PluginSettings } from "types";
import { clearWarnings, warnings } from "../common/commonConversionWarnings";
import { swiftuiMain } from "./swiftuiMain";

const settings = {
  framework: "SwiftUI",
  imagePlaceholderMode: "asset",
  swiftUIGenerationMode: "preview",
} as PluginSettings;

describe("SwiftUI vector assets", () => {
  beforeEach(clearWarnings);

  it("generates a resizable asset image instead of dropping a vector", () => {
    const node = {
      canBeFlattened: true,
      height: 24,
      id: "55:66",
      name: "Icon",
      parent: null,
      type: "VECTOR",
      visible: true,
      width: 24,
    } as unknown as SceneNode;

    const code = swiftuiMain([node], settings);

    expect(code).toContain('Image("vector-55-66")');
    expect(code).toContain(".resizable()");
    expect(code).toContain(".scaledToFit()");
    expect([...warnings]).not.toContain(
      "VectorNodes are not supported in SwiftUI",
    );
  });
});
