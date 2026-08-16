import { beforeEach, describe, expect, it } from "vitest";
import type { PluginSettings } from "types";
import { clearWarnings, warnings } from "../common/commonConversionWarnings";
import { flutterMain } from "./flutterMain";

const settings = {
  flutterGenerationMode: "fullApp",
  framework: "Flutter",
  imagePlaceholderMode: "asset",
} as PluginSettings;

describe("Flutter vector assets", () => {
  beforeEach(clearWarnings);

  it("generates an SVG asset widget instead of dropping a vector", () => {
    const node = {
      canBeFlattened: true,
      height: 24,
      id: "55:66",
      name: "Icon",
      type: "VECTOR",
      visible: true,
      width: 24,
    } as unknown as SceneNode;

    const code = flutterMain([node], settings);

    expect(code).toContain("import 'package:flutter_svg/flutter_svg.dart';");
    expect(code).toContain("class FigmaIcon extends StatelessWidget");
    expect(code).toContain("SvgPicture.asset(");
    expect(code).toContain('"assets/vectors/vector-55-66.svg"');
    expect([...warnings]).not.toContain(
      "VectorNodes are not supported in Flutter",
    );
  });
});
