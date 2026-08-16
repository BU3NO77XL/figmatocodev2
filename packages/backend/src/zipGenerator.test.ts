import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  extractProjectImageNodeIds,
  generateProjectZip,
  injectReactNativeVectorHelpers,
  replaceProjectImagePlaceholders,
  replaceProjectVectorReferences,
} from "./zipGenerator";
import type { ProjectImage, ProjectVector } from "./zipGenerator";

const image: ProjectImage = {
  bytes: new Uint8Array([1, 2, 3]),
  name: "hero-12-34.png",
  nodeId: "12:34",
};
const placeholder = "__FIGMA_IMAGE_12%3A34__";
const pngVector: ProjectVector = {
  bytes: new Uint8Array([4, 5, 6]),
  format: "png",
  kind: "vector",
  name: "vector-55-66.png",
  nodeId: "55:66",
  fallbackReason: "Unsupported SVG filter",
};
const svgVector: ProjectVector = {
  bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  format: "svg",
  kind: "vector",
  name: "vector-55-66.svg",
  nodeId: "55:66",
};

const unzipProject = (zip: Uint8Array) => {
  const files = unzipSync(zip);
  return {
    files,
    text: (path: string) => strFromU8(files[path]),
    json: <T>(path: string) => JSON.parse(strFromU8(files[path])) as T,
  };
};

describe("project image references", () => {
  it("extracts and deduplicates encoded Figma node IDs", () => {
    expect([
      ...extractProjectImageNodeIds(`<img src="${placeholder}">${placeholder}`),
    ]).toEqual(["12:34"]);
  });

  it("uses AssetImage for Flutter assets", () => {
    expect(
      replaceProjectImagePlaceholders(
        `DecorationImage(image: NetworkImage("${placeholder}"))`,
        [image],
        "flutter",
        "home",
      ),
    ).toBe(
      'DecorationImage(image: AssetImage("assets/home/images/hero-12-34.png"))',
    );
  });

  it.each([
    ["html", "images/hero-12-34.png"],
    ["nextjs", "/images/hero-12-34.png"],
    ["reactnative", "../assets/figma-export/images/hero-12-34.png"],
    ["vite", "/images/hero-12-34.png"],
    ["swiftui", "hero-12-34"],
  ] as const)("resolves %s image paths", (format, expectedPath) => {
    expect(
      replaceProjectImagePlaceholders(
        `Image("${placeholder}")`,
        [image],
        format,
      ),
    ).toBe(`Image("${expectedPath}")`);
  });

  it("fails instead of substituting an unrelated image", () => {
    expect(() =>
      replaceProjectImagePlaceholders(`<img src="${placeholder}">`, [], "html"),
    ).toThrow("Missing exported image for Figma node 12:34");
  });

  it("uses a PNG widget when SVG export required a raster fallback", () => {
    const code = `SvgPicture.asset(\n          "assets/figma-export/vectors/vector-55-66.svg",\n          width: 24,\n)`;
    expect(
      replaceProjectVectorReferences(code, [pngVector], "figma-export"),
    ).toContain(
      'Image.asset(\n          "assets/figma-export/vectors/vector-55-66.png",',
    );
  });

  it("normalizes legacy Flutter vector paths into the screen asset namespace", () => {
    expect(
      replaceProjectVectorReferences(
        'SvgPicture.asset("assets/vectors/vector-55-66.svg")',
        [svgVector],
        "home",
      ),
    ).toBe('SvgPicture.asset("assets/home/vectors/vector-55-66.svg")');

    expect(
      replaceProjectVectorReferences(
        'SvgPicture.asset("assets/vectors/vector-55-66.svg")',
        [pngVector],
        "home",
      ),
    ).toBe('Image.asset("assets/home/vectors/vector-55-66.png")');
  });

  it("injects React Native vector helpers with SVG XML and PNG fallbacks", () => {
    const code = `const FIGMA_VECTOR_XML: Record<string, string> = __FIGMA_VECTOR_XML__;
const FIGMA_VECTOR_FALLBACKS: Record<string, any> = __FIGMA_VECTOR_FALLBACKS__;`;

    const injected = injectReactNativeVectorHelpers(
      code,
      [svgVector, pngVector],
      "home",
    );

    expect(injected).toContain('"vector-55-66": `<svg');
    expect(injected).toContain(
      '"vector-55-66": require("../assets/home/vectors/vector-55-66.png")',
    );
  });
});

describe("generated project archives", () => {
  it("creates a self-contained HTML project", () => {
    const project = unzipProject(
      generateProjectZip(
        '<img src="images/hero-12-34.png">',
        "HTML",
        [image],
        "html",
        "landing-page",
      ),
    );

    expect(project.text("landing-page/index.html")).toContain(
      '<img src="images/hero-12-34.png">',
    );
    expect(project.files["landing-page/images/hero-12-34.png"]).toEqual(
      image.bytes,
    );
    expect(project.text("landing-page/README.md")).toContain(
      "This export has no runtime dependencies and works offline.",
    );
    expect(project.text("landing-page/asset-manifest.json")).toContain(
      '"nodeId": "12:34"',
    );
  });

  it("creates Vite and Next.js projects with current, reproducible manifests", () => {
    const jsx = '<div className="p-4" style={{ color: "red" }}>Hello</div>';
    const vite = unzipProject(
      generateProjectZip(jsx, "Tailwind", [image], "vite", "dashboard"),
    );
    const next = unzipProject(
      generateProjectZip(jsx, "Tailwind", [image], "nextjs", "dashboard"),
    );

    expect(vite.text("src/App.tsx")).toContain(
      'import Dashboard from "./Dashboard";',
    );
    expect(vite.text("src/Dashboard.tsx")).toContain(jsx);
    expect(vite.text("src/Dashboard.tsx")).not.toContain('style="');
    expect(vite.text("package.json")).not.toContain('"latest"');
    expect(vite.files["public/images/hero-12-34.png"]).toEqual(image.bytes);

    expect(next.text("app/page.tsx")).toContain(
      'import Dashboard from "./Dashboard";',
    );
    expect(next.text("app/Dashboard.tsx")).toContain(jsx);
    expect(next.text("package.json")).not.toContain('"latest"');
    expect(next.files["postcss.config.mjs"]).toBeDefined();
    expect(next.files["public/images/hero-12-34.png"]).toEqual(image.bytes);

    const vitePackage = vite.json<{
      engines: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    }>("package.json");
    expect(vitePackage.engines).toEqual({ node: ">=24", pnpm: "^11" });
    expect(vitePackage.dependencies).toMatchObject({
      react: "^19.2.8",
      "react-dom": "^19.2.8",
    });
    expect(vitePackage.devDependencies).toMatchObject({
      "@tailwindcss/vite": "^4.3.3",
      "@typescript/native": "npm:typescript@^7.0.2",
      "@vitejs/plugin-react": "^6.0.5",
      tailwindcss: "4.3.3",
      typescript: "npm:@typescript/typescript6@^6.0.2",
      vite: "^8.2.0",
    });
    expect(vitePackage.scripts.typecheck).toBe("tsc --noEmit");
    expect(vite.text("README.md")).toContain("pnpm typecheck");
    expect(vite.text("tsconfig.json")).toContain('"vite/client"');

    const nextPackage = next.json<{
      engines: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    }>("package.json");
    expect(nextPackage.engines).toEqual({ node: ">=24", pnpm: "^11" });
    expect(nextPackage.dependencies).toMatchObject({
      next: "^16.2.12",
      react: "^19.2.8",
      "react-dom": "^19.2.8",
    });
    expect(nextPackage.devDependencies).toMatchObject({
      "@tailwindcss/postcss": "^4.3.3",
      "@types/node": "^26.1.2",
      "@typescript/native": "npm:typescript@^7.0.2",
      postcss: "^8.5.25",
      tailwindcss: "4.3.3",
      typescript: "npm:@typescript/typescript6@^6.0.2",
    });
    expect(nextPackage.scripts.typecheck).toBe("tsc --noEmit");
    expect(next.text("README.md")).toContain("pnpm build");
    expect(next.text("pnpm-workspace.yaml")).toContain("sharp: true");
    expect(next.text("tsconfig.json")).toContain('"jsx": "react-jsx"');
    expect(next.text("tsconfig.json")).toContain(".next/dev/types/**/*.ts");
  });

  it("creates Flutter and SwiftUI asset structures referenced by source", () => {
    const flutter = unzipProject(
      generateProjectZip(
        `import 'package:flutter/material.dart';

void main() {
  runApp(const FigmaToCodeApp());
}

class FigmaToCodeApp extends StatelessWidget {
  const FigmaToCodeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const Placeholder();
  }
}

const AssetImage("assets/mobile-app/images/hero-12-34.png")`,
        "Flutter",
        [image],
        "flutter",
        "mobile-app",
      ),
    );
    const swiftui = unzipProject(
      generateProjectZip(
        'Image("hero-12-34")',
        "SwiftUI",
        [image],
        "swiftui",
        "mobile-app",
      ),
    );

    expect(flutter.text("lib/main.dart")).toContain(
      "import './mobile_app.dart';",
    );
    expect(flutter.text("lib/mobile_app.dart")).toContain(
      'AssetImage("assets/mobile-app/images/hero-12-34.png")',
    );
    expect(flutter.text("pubspec.yaml")).toContain(
      "- assets/mobile-app/images/",
    );
    expect(flutter.files["assets/mobile-app/images/hero-12-34.png"]).toEqual(
      image.bytes,
    );
    expect(flutter.text("README.md")).toContain("flutter pub get");
    expect(flutter.text("README.md")).toContain("lib/mobile_app.dart");
    expect(flutter.text("asset-manifest.json")).toContain('"kind": "image"');

    expect(swiftui.text("mobile-app/ContentView.swift")).toContain(
      "MobileApp()",
    );
    expect(swiftui.text("mobile-app/MobileApp.swift")).toContain(
      'Image("hero-12-34")',
    );
    expect(
      swiftui.files[
        "mobile-app/Assets.xcassets/hero-12-34.imageset/hero-12-34.png"
      ],
    ).toEqual(image.bytes);
    expect(
      swiftui.text(
        "mobile-app/Assets.xcassets/hero-12-34.imageset/Contents.json",
      ),
    ).toContain('"filename": "hero-12-34.png"');
    expect(swiftui.text("mobile-app/README.md")).toContain(
      "Review previews, accessibility labels, dynamic type",
    );
  });

  it("packages Flutter vectors and declares flutter_svg", () => {
    const project = unzipProject(
      generateProjectZip(
        `import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

void main() {
  runApp(const FigmaToCodeApp());
}

class FigmaToCodeApp extends StatelessWidget {
  const FigmaToCodeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset("assets/icons/vectors/vector-55-66.svg");
  }
}`,
        "Flutter",
        [svgVector],
        "flutter",
        "icons",
      ),
    );

    expect(project.text("pubspec.yaml")).toContain("flutter_svg: ^2.2.4");
    expect(project.text("pubspec.yaml")).toContain("- assets/icons/vectors/");
    expect(project.files["assets/icons/vectors/vector-55-66.svg"]).toEqual(
      svgVector.bytes,
    );
    expect(project.text("asset-manifest.json")).toContain('"kind": "vector"');
  });

  it("packages a compilable PNG fallback for failed Flutter SVGs", () => {
    const rawCode = `SvgPicture.asset(\n          "assets/fallback/vectors/vector-55-66.svg",\n          width: 24,\n)`;
    const resolvedCode = replaceProjectVectorReferences(
      rawCode,
      [pngVector],
      "fallback",
    );
    const project = unzipProject(
      generateProjectZip(
        `import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

void main() {
  runApp(const FigmaToCodeApp());
}

class FigmaToCodeApp extends StatelessWidget {
  const FigmaToCodeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ${resolvedCode};
  }
}`,
        "Flutter",
        [pngVector],
        "flutter",
        "fallback",
      ),
    );

    expect(project.text("lib/fallback.dart")).toContain(
      'Image.asset(\n          "assets/fallback/vectors/vector-55-66.png",',
    );
    expect(project.files["assets/fallback/vectors/vector-55-66.png"]).toEqual(
      pngVector.bytes,
    );
    expect(project.text("asset-manifest.json")).toContain(
      '"source": "rasterized-vector"',
    );
  });

  it("packages SwiftUI vectors in an asset catalog", () => {
    const project = unzipProject(
      generateProjectZip(
        'Image("vector-55-66")',
        "SwiftUI",
        [svgVector],
        "swiftui",
        "icons",
      ),
    );
    const imageSet = "icons/Assets.xcassets/vector-55-66.imageset";

    expect(project.files[`${imageSet}/vector-55-66.svg`]).toEqual(
      svgVector.bytes,
    );
    expect(project.text(`${imageSet}/Contents.json`)).toContain(
      '"preserves-vector-representation": true',
    );
    expect(project.text("icons/asset-manifest.json")).toContain(
      `${imageSet}/vector-55-66.svg`,
    );
  });

  it("creates a React Native Expo project organized by screen name", () => {
    const project = unzipProject(
      generateProjectZip(
        injectReactNativeVectorHelpers(
          `import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ position: "relative" }}>
        <Image source={require("../assets/home/images/hero-12-34.png")} style={{ width: 100, height: 100 }} />
        <FigmaVector assetName="vector-55-66" width={24} height={24} />
      </View>
    </ScrollView>
  );
}
`,
          [svgVector, pngVector],
          "home",
        ),
        "ReactNative",
        [image, svgVector, pngVector],
        "reactnative",
        "home",
      ),
    );

    expect(project.text("App.tsx")).toContain('import Home from "./src/Home";');
    expect(project.text("src/Home.tsx")).toContain(
      'require("../assets/home/images/hero-12-34.png")',
    );
    expect(project.text("src/Home.tsx")).toContain(
      '<FigmaVector assetName="vector-55-66" width={24} height={24} />',
    );
    expect(project.files["assets/home/images/hero-12-34.png"]).toEqual(
      image.bytes,
    );
    expect(project.files["assets/home/vectors/vector-55-66.svg"]).toEqual(
      svgVector.bytes,
    );
    expect(project.files["assets/home/vectors/vector-55-66.png"]).toEqual(
      pngVector.bytes,
    );
    expect(project.text("README.md")).toContain("src/Home.tsx");
    expect(project.text("package.json")).toContain('"expo-blur"');
  });
});
