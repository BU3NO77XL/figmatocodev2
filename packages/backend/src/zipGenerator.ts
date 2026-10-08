import { zipSync } from "fflate";
import type { DownloadProjectFormat } from "types";
import { toAndroidDrawableFileName as toDrawableFileName } from "./common/assetNames";

export interface ProjectImage {
  name: string;
  bytes: Uint8Array;
  nodeId: string;
  kind?: "image";
  source?: "original" | "rendered";
}

export interface ProjectVector {
  name: string;
  bytes: Uint8Array;
  nodeId: string;
  nodeName?: string;
  kind: "vector";
  format: "svg" | "png";
  fallbackReason?: string;
}

export type ProjectAsset = ProjectImage | ProjectVector;

const IMAGE_PLACEHOLDER_PATTERN = /__FIGMA_IMAGE_(.*?)__/g;
const VECTOR_PLACEHOLDER_PATTERN = /__FIGMA_VECTOR_(.*?)__/g;
const isVectorAsset = (asset: ProjectAsset): asset is ProjectVector =>
  asset.kind === "vector";
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const GENERATED_PROJECT_ENGINES = {
  node: ">=24",
  pnpm: "^11",
} as const;

const GENERATED_PROJECT_VERSIONS = {
  next: "^16.2.12",
  react: "^19.2.8",
  reactDom: "^19.2.8",
  tailwindcss: "4.3.3",
  tailwindPostcss: "^4.3.3",
  tailwindVite: "^4.3.3",
  postcss: "^8.5.25",
  typesNode: "^26.1.2",
  typesReact: "^19.2.18",
  typesReactDom: "^19.2.4",
  typescript: "npm:@typescript/typescript6@^6.0.2",
  typescriptNative: "npm:typescript@^7.0.2",
  vite: "^8.2.0",
  viteReact: "^6.0.5",
} as const;

const GENERATED_ANDROID_VERSIONS = {
  activityCompose: "1.9.3",
  androidGradlePlugin: "8.7.3",
  compileSdk: 35,
  composeBom: "2024.12.01",
  gradle: "8.9",
  javaVersion: "17",
  jvmTarget: "17",
  kotlin: "2.1.0",
  minSdk: 24,
  targetSdk: 35,
} as const;

const removeExtension = (fileName: string) => fileName.replace(/\.[^.]+$/, "");
const toPackageName = (rootName: string) =>
  (rootName || "figma-export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "figma-export";
const toDartPackageName = (rootName: string) =>
  toPackageName(rootName).replace(/-/g, "_");
const toReactComponentName = (rootName: string) =>
  (rootName || "FigmaExport")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") || "FigmaExport";
const toDartFileName = (rootName: string) =>
  toDartPackageName(rootName || "figma_export");
const getFlutterAssetBasePath = (rootName: string) =>
  `assets/${toPackageName(rootName)}/`;
const getFlutterImageDirectory = (rootName: string) =>
  `${getFlutterAssetBasePath(rootName)}images/`;
const getFlutterVectorDirectory = (rootName: string) =>
  `${getFlutterAssetBasePath(rootName)}vectors/`;
const getReactNativeAssetDirectory = (rootName: string) =>
  `assets/${toPackageName(rootName)}/images/`;
const getReactNativeVectorDirectory = (rootName: string) =>
  `assets/${toPackageName(rootName)}/vectors/`;
const getReactNativeComponentDirectory = () => "src/components/";
const toAndroidPackageName = (rootName: string) => {
  const segments = toPackageName(rootName)
    .split("-")
    .filter(Boolean)
    .map((segment) => (/^[0-9]/.test(segment) ? `pkg${segment}` : segment));
  return `com.figmaexport.${segments.length > 0 ? segments.join(".") : "app"}`;
};
const getComposeSourceDirectory = (androidPackage: string) =>
  `${androidPackage.replace(/\./g, "/")}/`;
const getComposeDrawableDirectory = (rootName: string) =>
  `${rootName || "figma-export"}/app/src/main/res/drawable/`;
const toDrawableResource = (fileName: string) =>
  `R.drawable.${removeExtension(toDrawableFileName(fileName))}`;
const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const splitComposeScreenEntrypoint = (code: string) => {
  const entrypoint = /^\s*fun\s+(\w+)Screen\s*\(\s*\)/m.exec(code);
  return entrypoint ? entrypoint[1] : null;
};

const splitFlutterEntrypoint = (code: string) => {
  const entrypointPattern =
    /void main\(\)\s*\{\s*runApp\(const FigmaToCodeApp\(\)\);\s*\}\s*/m;
  if (!entrypointPattern.test(code)) {
    return null;
  }

  return code.replace(entrypointPattern, "").trimStart();
};

const encodeText = (text: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text);
  }

  const utf8 = unescape(encodeURIComponent(text));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i += 1) {
    bytes[i] = utf8.charCodeAt(i);
  }
  return bytes;
};

const writeJson = (value: unknown) =>
  encodeText(JSON.stringify(value, null, 2));

const isTailwindProject = (framework: string) => framework === "Tailwind";

const getImageCodePath = (
  image: ProjectImage,
  format: DownloadProjectFormat,
  rootName = "figma-export",
): string => {
  if (format === "reactnative") {
    return `../${getReactNativeAssetDirectory(rootName)}${image.name}`;
  }

  if (format === "compose") {
    return toDrawableResource(image.name);
  }

  return getImagePath(image, format, rootName);
};

const getImagePath = (
  image: ProjectImage,
  format: DownloadProjectFormat,
  rootName = "figma-export",
): string => {
  if (format === "flutter") {
    return `${getFlutterImageDirectory(rootName)}${image.name}`;
  }
  if (format === "swiftui") {
    return removeExtension(image.name);
  }
  if (format === "compose") {
    return `${getComposeDrawableDirectory(rootName)}${toDrawableFileName(image.name)}`;
  }
  if (format === "html") {
    return `images/${image.name}`;
  }
  return `/images/${image.name}`;
};

export const extractProjectImageNodeIds = (code: string): Set<string> => {
  const nodeIds = new Set<string>();
  for (const match of code.matchAll(IMAGE_PLACEHOLDER_PATTERN)) {
    nodeIds.add(decodeURIComponent(match[1]));
  }
  return nodeIds;
};

export const extractProjectVectorNodeIds = (code: string): Set<string> => {
  const nodeIds = new Set<string>();
  for (const match of code.matchAll(VECTOR_PLACEHOLDER_PATTERN)) {
    nodeIds.add(decodeURIComponent(match[1]));
  }
  return nodeIds;
};

export const replaceProjectImagePlaceholders = (
  code: string,
  images: ProjectImage[],
  format: DownloadProjectFormat,
  rootName = "figma-export",
): string => {
  const imagesByNodeId = new Map(images.map((image) => [image.nodeId, image]));
  const resolveImage = (encodedNodeId: string): ProjectImage => {
    const nodeId = decodeURIComponent(encodedNodeId);
    const image = imagesByNodeId.get(nodeId);
    if (!image) {
      throw new Error(`Missing exported image for Figma node ${nodeId}.`);
    }
    return image;
  };

  let replacedCode = code;
  if (format === "flutter") {
    replacedCode = replacedCode.replace(
      /NetworkImage\("__FIGMA_IMAGE_(.*?)__"\)/g,
      (_match, encodedNodeId: string) =>
        `AssetImage("${getImageCodePath(resolveImage(encodedNodeId), format, rootName)}")`,
    );
  } else if (format === "compose") {
    replacedCode = replacedCode.replace(
      /painterResource\("__FIGMA_IMAGE_(.*?)__"\)/g,
      (_match, encodedNodeId: string) =>
        `painterResource(${getImageCodePath(resolveImage(encodedNodeId), format, rootName)})`,
    );
  }

  replacedCode = replacedCode.replace(
    IMAGE_PLACEHOLDER_PATTERN,
    (_match, encodedNodeId: string) =>
      getImageCodePath(resolveImage(encodedNodeId), format, rootName),
  );

  if (replacedCode.includes("__FIGMA_IMAGE_")) {
    throw new Error("Failed to resolve every exported image reference.");
  }

  return replacedCode;
};

export const replaceProjectVectorReferences = (
  code: string,
  assets: ProjectAsset[],
  rootName = "figma-export",
  format: DownloadProjectFormat = "flutter",
): string => {
  let replacedCode = code;
  const vectorDirectory = getFlutterVectorDirectory(rootName);
  const vectors = assets.filter(isVectorAsset);

  if (format === "compose") {
    const vectorsByNodeId = new Map(
      vectors.map((vector) => [vector.nodeId, vector]),
    );
    replacedCode = replacedCode.replace(
      /painterResource\("__FIGMA_VECTOR_(.*?)__"\)/g,
      (_match, encodedNodeId: string) => {
        const nodeId = decodeURIComponent(encodedNodeId);
        const vector = vectorsByNodeId.get(nodeId);
        if (!vector) {
          throw new Error(`Missing exported vector for Figma node ${nodeId}.`);
        }
        return `painterResource(${toDrawableResource(vector.name)})`;
      },
    );

    if (replacedCode.includes("__FIGMA_VECTOR_")) {
      throw new Error("Failed to resolve every exported vector reference.");
    }

    return replacedCode;
  }

  for (const asset of assets) {
    if (!isVectorAsset(asset)) continue;

    const svgName = asset.name.replace(/\.(png|svg)$/i, ".svg");
    const svgPath = `${vectorDirectory}${svgName}`;
    const legacySvgPath = `assets/vectors/${svgName}`;
    const svgPathPattern = `(?:${escapeRegExp(svgPath)}|${escapeRegExp(
      legacySvgPath,
    )})`;

    if (asset.format === "svg") {
      replacedCode = replacedCode.replace(
        new RegExp(`"${svgPathPattern}"`, "g"),
        `"${svgPath}"`,
      );
      continue;
    }

    const pngPath = `${vectorDirectory}${asset.name}`;
    replacedCode = replacedCode.replace(
      new RegExp(`SvgPicture\\.asset\\((\\s*)"${svgPathPattern}"`, "g"),
      (_match, whitespace: string) => `Image.asset(${whitespace}"${pngPath}"`,
    );
  }

  return replacedCode;
};

const escapeTemplateLiteral = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

export const injectReactNativeVectorHelpers = (
  code: string,
  assets: ProjectAsset[],
  rootName = "figma-export",
) => {
  const vectors = assets.filter(isVectorAsset);
  const xmlMapEntries = vectors
    .filter((vector) => vector.format === "svg")
    .map(
      (vector) =>
        `"${removeExtension(vector.name)}": \`${escapeTemplateLiteral(
          new TextDecoder().decode(vector.bytes),
        )}\``,
    );
  const fallbackMapEntries = vectors
    .filter((vector) => vector.format === "png")
    .map(
      (vector) =>
        `"${removeExtension(vector.name)}": require("../${getReactNativeVectorDirectory(
          rootName,
        )}${vector.name}")`,
    );

  return code
    .replace(
      "__FIGMA_VECTOR_XML__",
      xmlMapEntries.length > 0 ? `{ ${xmlMapEntries.join(", ")} }` : "{}",
    )
    .replace(
      "__FIGMA_VECTOR_FALLBACKS__",
      fallbackMapEntries.length > 0
        ? `{ ${fallbackMapEntries.join(", ")} }`
        : "{}",
    );
};

const getBalancedBlockBounds = (
  source: string,
  startIndex: number,
  openChar: string,
  closeChar: string,
) => {
  let depth = 0;
  let started = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === openChar) {
      depth += 1;
      started = true;
    } else if (char === closeChar && started) {
      depth -= 1;
      if (depth === 0) {
        return { start: startIndex, end: index + 1 };
      }
    }
  }

  throw new Error("Failed to parse generated React Native source block.");
};

const findStylesBlock = (source: string) => {
  const start = (() => {
    const exported = source.indexOf(
      "export const styles = StyleSheet.create({",
    );
    if (exported >= 0) return exported;
    return source.indexOf("const styles = StyleSheet.create({");
  })();
  if (start === -1) {
    return null;
  }

  const braceStart = source.indexOf("{", start);
  const balanced = getBalancedBlockBounds(source, braceStart, "{", "}");
  let end = balanced.end;
  while (end < source.length && /\s/.test(source[end])) end += 1;
  if (source.slice(end, end + 2) === ");") {
    end += 2;
  }

  return {
    start,
    end,
    code: source.slice(start, end),
  };
};

const findDefaultComponentBlock = (source: string, componentName: string) => {
  const explicitToken = `export default function ${componentName}()`;
  const explicitStart = source.indexOf(explicitToken);
  const start =
    explicitStart >= 0
      ? explicitStart
      : source.search(/export default function\s+[A-Z][A-Za-z0-9_]*\(\)/);
  if (start === -1) {
    throw new Error(`Missing React Native screen component ${componentName}.`);
  }
  const braceStart = source.indexOf("{", start);
  const balanced = getBalancedBlockBounds(source, braceStart, "{", "}");
  return {
    start,
    end: balanced.end,
    code: source
      .slice(start, balanced.end)
      .replace(
        /export default function\s+[A-Z][A-Za-z0-9_]*\(\)/,
        `export default function ${componentName}()`,
      ),
  };
};

const findZeroArgFunctionBlocks = (source: string) => {
  const blocks: Array<{
    name: string;
    start: number;
    end: number;
    code: string;
  }> = [];
  const pattern = /function\s+([A-Z][A-Za-z0-9_]*)\(\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const name = match[1];
    const start = match.index;
    const braceStart = source.indexOf("{", start);
    const balanced = getBalancedBlockBounds(source, braceStart, "{", "}");
    blocks.push({
      name,
      start,
      end: balanced.end,
      code: source.slice(start, balanced.end),
    });
  }
  return blocks;
};

const buildReactNativeImports = (
  code: string,
  generatedImportPath: string,
  componentImports: string[] = [],
) => {
  const reactNativeSymbols = [
    "Image",
    "ScrollView",
    "StyleSheet",
    "Text",
    "View",
  ].filter((symbol) => {
    if (symbol === "StyleSheet") return code.includes("StyleSheet.");
    return code.includes(`<${symbol}`) || code.includes(`${symbol} `);
  });

  const imports = ['import React from "react";'];
  if (reactNativeSymbols.length > 0) {
    imports.push(
      `import { ${reactNativeSymbols.sort().join(", ")} } from "react-native";`,
    );
  }
  if (code.includes("LinearGradient")) {
    imports.push('import { LinearGradient } from "expo-linear-gradient";');
  }
  if (code.includes("BlurView")) {
    imports.push('import { BlurView } from "expo-blur";');
  }

  const generatedSymbols = ["styles"];
  if (code.includes("FigmaVector")) {
    generatedSymbols.push("FigmaVector");
  }
  imports.push(
    `import { ${generatedSymbols.join(", ")} } from "${generatedImportPath}";`,
  );

  for (const componentImport of componentImports) {
    imports.push(componentImport);
  }

  return `${imports.join("\n")}\n\n`;
};

const splitReactNativeGeneratedSource = (
  source: string,
  componentName: string,
) => {
  const stylesBlock = findStylesBlock(source);
  const screenBlock = findDefaultComponentBlock(source, componentName);
  const allFunctionBlocks = findZeroArgFunctionBlocks(
    source.slice(0, screenBlock.start),
  );

  const extractedComponentBlocks = allFunctionBlocks.filter(
    (block) => block.name !== "FigmaVector",
  );
  const helperStartCandidates = [
    source.indexOf("const FIGMA_VECTOR_XML"),
    source.indexOf("export function FigmaVector("),
    source.indexOf("function FigmaVector("),
  ].filter((index) => index >= 0);
  const helperStart =
    helperStartCandidates.length > 0
      ? Math.min(...helperStartCandidates)
      : (stylesBlock?.start ?? screenBlock.start);
  const helperCode = source
    .slice(helperStart, stylesBlock?.start ?? screenBlock.start)
    .trim();
  const normalizedHelperCode = helperCode.replace(
    /(^|\n)function FigmaVector\(/,
    "$1export function FigmaVector(",
  );
  const normalizedStylesCode = stylesBlock
    ? stylesBlock.code.replace(
        /^const styles = StyleSheet\.create\(/,
        "export const styles = StyleSheet.create(",
      )
    : "export const styles = StyleSheet.create({});";

  const generatedModule = `${buildReactNativeImports(
    `${stylesBlock?.code ?? normalizedStylesCode}\n${helperCode}`,
    "./generated",
  ).replace(
    `import { styles${helperCode.includes("FigmaVector") ? ", FigmaVector" : ""} } from "./generated";\n\n`,
    "",
  )}${normalizedHelperCode ? `${normalizedHelperCode}\n\n` : ""}${normalizedStylesCode}\n`;

  const componentImports = extractedComponentBlocks.map(
    (block) => `import ${block.name} from "./components/${block.name}";`,
  );
  const screenCode = `${buildReactNativeImports(
    screenBlock.code,
    "./generated",
    componentImports,
  )}${screenBlock.code}\n`;

  const componentFiles = extractedComponentBlocks.map((block) => ({
    fileName: `${getReactNativeComponentDirectory()}${block.name}.tsx`,
    content: `${buildReactNativeImports(block.code, "../generated")}export default ${block.code.replace(
      /^function\s+/,
      "function ",
    )}\n`,
  }));

  return {
    generatedModule,
    screenCode,
    componentFiles,
  };
};

export function generateProjectZip(
  code: string,
  framework: string,
  assets: ProjectAsset[],
  format: DownloadProjectFormat,
  rootName = "figma-export",
): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const usesTailwind = isTailwindProject(framework);
  const rootDir = rootName || "figma-export";
  const packageName = toPackageName(rootDir);
  const dartFileName = toDartFileName(rootDir);
  const reactComponentName = toReactComponentName(rootDir);
  const images = assets.filter((asset) => !isVectorAsset(asset));
  const vectors = assets.filter(isVectorAsset);

  if (format === "flutter") {
    const usesFlutterSvg = vectors.length > 0;
    const flutterAssetDirectories = [
      images.length > 0 ? `    - ${getFlutterImageDirectory(rootDir)}` : "",
      vectors.length > 0 ? `    - ${getFlutterVectorDirectory(rootDir)}` : "",
    ].filter(Boolean);
    const flutterAppSource = splitFlutterEntrypoint(code);
    files["pubspec.yaml"] = encodeText(`name: ${toDartPackageName(rootDir)}
description: Generated from Figma
publish_to: "none"
version: 0.0.1

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
${usesFlutterSvg ? "  flutter_svg: ^2.2.4\n" : ""}

dev_dependencies:
  flutter_test:
    sdk: flutter

flutter:
  uses-material-design: true
${
  flutterAssetDirectories.length > 0
    ? `  assets:\n${flutterAssetDirectories.join("\n")}\n`
    : ""
}
`);

    files["lib/main.dart"] = encodeText(
      flutterAppSource
        ? `import 'package:flutter/material.dart';\nimport './${dartFileName}.dart';\n\nvoid main() {\n  runApp(const FigmaToCodeApp());\n}\n`
        : code,
    );
    if (flutterAppSource) {
      files[`lib/${dartFileName}.dart`] = encodeText(flutterAppSource);
    }
    files["README.md"] = encodeText(`# ${rootDir}

Flutter source generated by Figma to Code.

## Requirements

- A current stable Flutter SDK
- A device, simulator, or supported desktop/web target

## Run the project

\`\`\`sh
flutter pub get
flutter run
\`\`\`

The project entry point is \`lib/main.dart\`, and the generated screen source is in \`lib/${dartFileName}.dart\`. Exported images are stored in \`${getFlutterImageDirectory(rootDir)}\`, vectors are stored in \`${getFlutterVectorDirectory(rootDir)}\`, and both are declared in \`pubspec.yaml\` when used. Asset provenance and fallback details are recorded in \`asset-manifest.json\`.

## Before shipping

Review responsive behavior, semantics, navigation, state management, and platform-specific styling. This export is a clean visual starting point, not a complete production application.
`);
    files[".gitignore"] = encodeText(`.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages
build/
`);
  } else if (format === "swiftui") {
    const swiftScreenFile = `${reactComponentName}.swift`;
    files[`${rootDir}/Assets.xcassets/Contents.json`] = writeJson({
      info: {
        author: "xcode",
        version: 1,
      },
    });
    files[`${rootDir}/README.md`] = encodeText(`# ${rootDir}

SwiftUI source generated by Figma to Code.

## Requirements

- A current stable Xcode release
- An iOS app target that uses SwiftUI

## Add it to Xcode

1. Create a new iOS app project using the SwiftUI interface.
2. Replace the generated \`ContentView.swift\` with this export's \`ContentView.swift\`.
3. Keep the generated screen implementation in \`${swiftScreenFile}\`.
4. Copy the image sets from \`Assets.xcassets\` into your app's asset catalog.
5. Build and run the app from Xcode.

## Before shipping

Review previews, accessibility labels, dynamic type, navigation, app state, and device-size behavior. The ZIP intentionally omits an \`.xcodeproj\` because Xcode project metadata is toolchain-specific and should be owned by your app.
`);
    files[`${rootDir}/ContentView.swift`] = encodeText(`import SwiftUI

struct ContentView: View {
  var body: some View {
    ${reactComponentName}()
  }
}
`);
    files[`${rootDir}/${swiftScreenFile}`] = encodeText(code);
  } else if (format === "html") {
    files[`${rootDir}/index.html`] = encodeText(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Figma Export</title>
    ${
      usesTailwind
        ? '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>'
        : ""
    }
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      img { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>
    ${code}
  </body>
</html>
`);
    files[`${rootDir}/README.md`] = encodeText(`# ${rootDir}

Static HTML generated by Figma to Code.

## Preview

Open \`index.html\` directly in a browser, or serve this directory with any static web server:

\`\`\`sh
python3 -m http.server 8080
\`\`\`

Then open <http://localhost:8080>.

Exported images are in \`images/\`.${
      usesTailwind
        ? " Tailwind CSS is loaded from a pinned browser CDN release, so an internet connection is required unless you replace it with a local build setup."
        : " This export has no runtime dependencies and works offline."
    }

## Before shipping

Review document semantics, keyboard behavior, responsive breakpoints, and image alternative text. The export reproduces the selected visual structure but cannot infer your product's behavior or content meaning.
`);
  } else if (format === "nextjs") {
    const nextScreenFile = `${reactComponentName}.tsx`;
    files["package.json"] = writeJson({
      name: packageName,
      private: true,
      version: "0.0.1",
      engines: GENERATED_PROJECT_ENGINES,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        typecheck: "tsc --noEmit",
      },
      dependencies: {
        next: GENERATED_PROJECT_VERSIONS.next,
        react: GENERATED_PROJECT_VERSIONS.react,
        "react-dom": GENERATED_PROJECT_VERSIONS.reactDom,
      },
      devDependencies: {
        "@types/node": GENERATED_PROJECT_VERSIONS.typesNode,
        "@types/react": GENERATED_PROJECT_VERSIONS.typesReact,
        "@types/react-dom": GENERATED_PROJECT_VERSIONS.typesReactDom,
        "@typescript/native": GENERATED_PROJECT_VERSIONS.typescriptNative,
        typescript: GENERATED_PROJECT_VERSIONS.typescript,
        ...(usesTailwind
          ? {
              "@tailwindcss/postcss":
                GENERATED_PROJECT_VERSIONS.tailwindPostcss,
              tailwindcss: GENERATED_PROJECT_VERSIONS.tailwindcss,
              postcss: GENERATED_PROJECT_VERSIONS.postcss,
            }
          : {}),
      },
    });

    files["next.config.ts"] =
      encodeText(`import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`);
    files["pnpm-workspace.yaml"] = encodeText(`allowBuilds:
  sharp: true
`);

    files["tsconfig.json"] = writeJson({
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "ES6"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "react-jsx",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./*"] },
      },
      include: [
        "next-env.d.ts",
        "**/*.ts",
        "**/*.tsx",
        ".next/types/**/*.ts",
        ".next/dev/types/**/*.ts",
      ],
      exclude: ["node_modules"],
    });

    files["app/globals.css"] = encodeText(
      usesTailwind
        ? `@import "tailwindcss";

img { max-width: 100%; height: auto; }
`
        : `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

img { max-width: 100%; height: auto; }
`,
    );

    if (usesTailwind) {
      files["postcss.config.mjs"] = encodeText(
        `export default { plugins: ["@tailwindcss/postcss"] };
`,
      );
    }

    files["app/layout.tsx"] = encodeText(`import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Figma Export",
  description: "Generated from Figma",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`);

    const mainAttributes = usesTailwind
      ? ' className="container mx-auto p-4"'
      : "";
    files["app/page.tsx"] =
      encodeText(`import ${reactComponentName} from "./${reactComponentName}";

export default function Page() {
  return (
    <${reactComponentName} />
  );
}
`);
    files[`app/${nextScreenFile}`] =
      encodeText(`export default function ${reactComponentName}() {
  return (
    <main${mainAttributes}>
      ${code}
    </main>
  );
}
`);
    files["README.md"] = encodeText(
      `# ${rootDir}

Next.js project generated by Figma to Code.

## Requirements

- Node.js >=24
- pnpm ^11

## Run the project

\`\`\`sh
pnpm install
pnpm dev
\`\`\`

Open <http://localhost:3000>. The generated entry page is in \`app/page.tsx\`, the generated screen is in \`app/${nextScreenFile}\`, global styles are in \`app/globals.css\`, and exported images are in \`public/images/\`.

The included \`pnpm-workspace.yaml\` permits only Next.js's \`sharp\` dependency to run its install script.

## Validate a production build

\`\`\`sh
pnpm typecheck
pnpm build
pnpm start
\`\`\`

## Before shipping

Review server/client component boundaries, metadata, responsive behavior, accessibility, data loading, and interactions. This export is intentionally dependency-light and does not invent application logic.
`,
    );
    files[".gitignore"] = encodeText(`node_modules/
.next/
out/
.env*
!.env.example
`);
  } else if (format === "vite") {
    const viteScreenFile = `${reactComponentName}.tsx`;
    files["package.json"] = writeJson({
      name: packageName,
      private: true,
      version: "0.0.1",
      type: "module",
      engines: GENERATED_PROJECT_ENGINES,
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
        typecheck: "tsc --noEmit",
      },
      dependencies: {
        react: GENERATED_PROJECT_VERSIONS.react,
        "react-dom": GENERATED_PROJECT_VERSIONS.reactDom,
      },
      devDependencies: {
        "@types/react": GENERATED_PROJECT_VERSIONS.typesReact,
        "@types/react-dom": GENERATED_PROJECT_VERSIONS.typesReactDom,
        "@typescript/native": GENERATED_PROJECT_VERSIONS.typescriptNative,
        "@vitejs/plugin-react": GENERATED_PROJECT_VERSIONS.viteReact,
        typescript: GENERATED_PROJECT_VERSIONS.typescript,
        vite: GENERATED_PROJECT_VERSIONS.vite,
        ...(usesTailwind
          ? {
              "@tailwindcss/vite": GENERATED_PROJECT_VERSIONS.tailwindVite,
              tailwindcss: GENERATED_PROJECT_VERSIONS.tailwindcss,
            }
          : {}),
      },
    });

    files["index.html"] = encodeText(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Figma Export</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

    files["src/main.tsx"] = encodeText(`import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
${usesTailwind ? 'import "./index.css";' : ""}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`);

    const mainAttributes = usesTailwind
      ? ' className="container mx-auto p-4"'
      : "";
    files["src/App.tsx"] =
      encodeText(`import ${reactComponentName} from "./${reactComponentName}";

export default function App() {
  return <${reactComponentName} />;
}
`);
    files[`src/${viteScreenFile}`] =
      encodeText(`export default function ${reactComponentName}() {
  return (
    <main${mainAttributes}>
      ${code}
    </main>
  );
}
`);

    files["vite.config.ts"] = encodeText(
      usesTailwind
        ? `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`
        : `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    );

    files["tsconfig.json"] = writeJson({
      compilerOptions: {
        jsx: "react-jsx",
        moduleResolution: "bundler",
        target: "ES2020",
        module: "ESNext",
        strict: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        types: ["vite/client"],
      },
      include: ["src"],
    });

    if (usesTailwind) {
      files["src/index.css"] = encodeText(`@import "tailwindcss";

img { max-width: 100%; height: auto; }
`);
    }

    files["README.md"] = encodeText(
      `# ${rootDir}

Vite and React project generated by Figma to Code.

## Requirements

- Node.js >=24
- pnpm ^11

## Run the project

\`\`\`sh
pnpm install
pnpm dev
\`\`\`

Open the URL printed by Vite. The generated entry app is in \`src/App.tsx\`, the generated screen is in \`src/${viteScreenFile}\`${
        usesTailwind ? ", Tailwind CSS is loaded from `src/index.css`," : ""
      } and exported images are in \`public/images/\`.

## Validate a production build

\`\`\`sh
pnpm typecheck
pnpm build
pnpm preview
\`\`\`

## Before shipping

Review component boundaries, responsive behavior, accessibility, state management, data loading, and interactions. This export is intentionally dependency-light and does not invent application logic.
`,
    );
    files[".gitignore"] = encodeText(`node_modules/
dist/
.env*
!.env.example
`);
  } else if (format === "compose") {
    const androidPackage = toAndroidPackageName(rootDir);
    const sourceDirectory = `${rootDir}/app/src/main/java/${getComposeSourceDirectory(androidPackage)}`;
    const screenEntrypoint = splitComposeScreenEntrypoint(code);
    const screenName = screenEntrypoint ?? reactComponentName;
    const screenFile = `${screenName}.kt`;
    const composeImports = screenEntrypoint
      ? `import ${androidPackage}.ui.${screenName}Screen\n`
      : "";
    const composeContent = screenEntrypoint
      ? `${screenName}Screen()`
      : "// Open the generated source in ui/ and call your top-level composable here.";

    files[`${rootDir}/settings.gradle.kts`] = encodeText(`pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "${escapeXml(rootDir)}"
include(":app")
`);
    files[`${rootDir}/build.gradle.kts`] = encodeText(`plugins {
    id("com.android.application") version "${GENERATED_ANDROID_VERSIONS.androidGradlePlugin}" apply false
    id("org.jetbrains.kotlin.android") version "${GENERATED_ANDROID_VERSIONS.kotlin}" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "${GENERATED_ANDROID_VERSIONS.kotlin}" apply false
}
`);
    files[`${rootDir}/gradle.properties`] = encodeText(`org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.parallel=true
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
`);
    files[`${rootDir}/gradle/wrapper/gradle-wrapper.properties`] = encodeText(`distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${GENERATED_ANDROID_VERSIONS.gradle}-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`);
    files[`${rootDir}/app/build.gradle.kts`] = encodeText(`plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${androidPackage}"
    compileSdk = ${GENERATED_ANDROID_VERSIONS.compileSdk}

    defaultConfig {
        applicationId = "${androidPackage}"
        minSdk = ${GENERATED_ANDROID_VERSIONS.minSdk}
        targetSdk = ${GENERATED_ANDROID_VERSIONS.targetSdk}
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_${GENERATED_ANDROID_VERSIONS.javaVersion}
        targetCompatibility = JavaVersion.VERSION_${GENERATED_ANDROID_VERSIONS.javaVersion}
    }

    kotlinOptions {
        jvmTarget = "${GENERATED_ANDROID_VERSIONS.jvmTarget}"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:${GENERATED_ANDROID_VERSIONS.composeBom}"))
    implementation("androidx.activity:activity-compose:${GENERATED_ANDROID_VERSIONS.activityCompose}")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
`);

    files[`${rootDir}/app/src/main/AndroidManifest.xml`] = encodeText(`<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
`);
    files[`${rootDir}/app/src/main/res/values/strings.xml`] = encodeText(`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapeXml(rootDir)}</string>
</resources>
`);
    files[`${sourceDirectory}MainActivity.kt`] = encodeText(`package ${androidPackage}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
${composeImports}
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ${composeContent}
        }
    }
}
`);
    files[`${sourceDirectory}ui/${screenFile}`] = encodeText(
      `package ${androidPackage}.ui\n\n${
        code.includes("painterResource(")
          ? `import ${androidPackage}.R\n\n`
          : ""
      }${code}\n`,
    );
    files[`${rootDir}/README.md`] = encodeText(`# ${rootDir}

Jetpack Compose (Kotlin) project generated by Figma to Code.

## Requirements

- Android Studio with the Android SDK (compileSdk ${GENERATED_ANDROID_VERSIONS.compileSdk})
- JDK ${GENERATED_ANDROID_VERSIONS.jvmTarget}

## Run the project

Open this folder in Android Studio, let it create the Gradle wrapper, then run the \`app\` configuration on a device or emulator.

From the command line, with Gradle ${GENERATED_ANDROID_VERSIONS.gradle}+ installed:

\`\`\`sh
gradle wrapper
./gradlew assembleDebug
\`\`\`

The launcher activity is \`app/src/main/java/${getComposeSourceDirectory(androidPackage)}MainActivity.kt\`, the generated screen is \`app/src/main/java/${getComposeSourceDirectory(androidPackage)}ui/${screenFile}\`, exported images and vector assets are in \`app/src/main/res/drawable/\`, and asset provenance is recorded in \`asset-manifest.json\`.

## Before shipping

Review responsive behavior, semantics, accessibility, navigation, state management, and platform-specific styling. This export is a clean visual starting point, not a complete production application.
`);
    files[`${rootDir}/.gitignore`] = encodeText(`*.iml
.gradle/
/local.properties
/.idea/
.DS_Store
/build
/captures
.externalNativeBuild
.cxx
`);
  } else {
    const rnScreenFile = `${reactComponentName}.tsx`;
    const reactNativeSource = splitReactNativeGeneratedSource(
      code,
      reactComponentName,
    );
    files["package.json"] = writeJson({
      name: packageName,
      private: true,
      version: "0.0.1",
      scripts: {
        start: "expo start",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web",
      },
      dependencies: {
        expo: "^55.0.0",
        "expo-blur": "~15.0.7",
        "expo-linear-gradient": "~16.0.0",
        react: GENERATED_PROJECT_VERSIONS.react,
        "react-dom": GENERATED_PROJECT_VERSIONS.reactDom,
        "react-native": "0.82.0",
        "react-native-svg": "^16.0.0",
        "react-native-web": "^0.21.0",
      },
      devDependencies: {
        "@expo/metro-runtime": "~6.1.0",
        "@types/react": GENERATED_PROJECT_VERSIONS.typesReact,
        "@typescript/native": GENERATED_PROJECT_VERSIONS.typescriptNative,
        typescript: GENERATED_PROJECT_VERSIONS.typescript,
      },
    });
    files["app.json"] = writeJson({
      expo: {
        name: reactComponentName,
        slug: packageName,
        version: "1.0.0",
        orientation: "portrait",
      },
    });
    files["babel.config.js"] = encodeText(`module.exports = function(api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
`);
    files["tsconfig.json"] = writeJson({
      extends: "expo/tsconfig.base",
      compilerOptions: {
        strict: true,
      },
    });
    files["App.tsx"] =
      encodeText(`import ${reactComponentName} from "./src/${reactComponentName}";

export default function App() {
  return <${reactComponentName} />;
}
`);
    files["src/generated.tsx"] = encodeText(reactNativeSource.generatedModule);
    files[`src/${rnScreenFile}`] = encodeText(reactNativeSource.screenCode);
    for (const componentFile of reactNativeSource.componentFiles) {
      files[componentFile.fileName] = encodeText(componentFile.content);
    }
    files["README.md"] = encodeText(`# ${rootDir}

Expo React Native project generated by Figma to Code.

## Requirements

- Node.js >=24
- pnpm ^11
- Expo Go or Android/iOS simulator

## Run the project

\`\`\`sh
pnpm install
pnpm start
\`\`\`

The generated entry app is in \`App.tsx\`, the generated screen is in \`src/${rnScreenFile}\`, shared React Native helpers and styles are in \`src/generated.tsx\`, extracted UI components are in \`${getReactNativeComponentDirectory()}\`, exported images are in \`${getReactNativeAssetDirectory(rootDir)}\`, and exported vector fallbacks are in \`${getReactNativeVectorDirectory(rootDir)}\`.

## Before shipping

Review navigation, touch targets, dynamic sizing, accessibility, and platform behavior. This export is a visual baseline for React Native, not a full production app.
`);
    files[".gitignore"] = encodeText(`node_modules/
.expo/
dist/
`);
  }

  for (const image of images) {
    if (format === "flutter") {
      files[`${getFlutterImageDirectory(rootDir)}${image.name}`] = image.bytes;
    } else if (format === "swiftui") {
      const assetName = removeExtension(image.name);
      files[`${rootDir}/Assets.xcassets/${assetName}.imageset/${image.name}`] =
        image.bytes;
      files[`${rootDir}/Assets.xcassets/${assetName}.imageset/Contents.json`] =
        writeJson({
          images: [
            {
              filename: image.name,
              idiom: "universal",
              scale: "1x",
            },
            {
              idiom: "universal",
              scale: "2x",
            },
            {
              idiom: "universal",
              scale: "3x",
            },
          ],
          info: {
            author: "xcode",
            version: 1,
          },
        });
    } else if (format === "compose") {
      files[
        `${getComposeDrawableDirectory(rootDir)}${toDrawableFileName(image.name)}`
      ] = image.bytes;
    } else if (format === "html") {
      files[`${rootDir}/images/${image.name}`] = image.bytes;
    } else if (format === "reactnative") {
      files[`${getReactNativeAssetDirectory(rootDir)}${image.name}`] =
        image.bytes;
    } else {
      files[`public/images/${image.name}`] = image.bytes;
    }
  }

  if (format === "flutter") {
    for (const vector of vectors) {
      files[`${getFlutterVectorDirectory(rootDir)}${vector.name}`] =
        vector.bytes;
    }
  } else if (format === "reactnative") {
    for (const vector of vectors) {
      files[`${getReactNativeVectorDirectory(rootDir)}${vector.name}`] =
        vector.bytes;
    }
  } else if (format === "swiftui") {
    for (const vector of vectors) {
      const assetName = removeExtension(vector.name);
      const imageSetPath = `${rootDir}/Assets.xcassets/${assetName}.imageset`;
      files[`${imageSetPath}/${vector.name}`] = vector.bytes;
      files[`${imageSetPath}/Contents.json`] = writeJson({
        images: [
          {
            filename: vector.name,
            idiom: "universal",
            scale: "1x",
          },
        ],
        info: {
          author: "xcode",
          version: 1,
        },
        ...(vector.format === "svg"
          ? { properties: { "preserves-vector-representation": true } }
          : {}),
      });
    }
  } else if (format === "compose") {
    for (const vector of vectors) {
      files[
        `${getComposeDrawableDirectory(rootDir)}${toDrawableFileName(vector.name)}`
      ] = vector.bytes;
    }
  }

  const manifestPath =
    format === "html" || format === "swiftui" || format === "compose"
      ? `${rootDir}/asset-manifest.json`
      : "asset-manifest.json";
  files[manifestPath] = writeJson({
    version: 1,
    assets: assets.map((asset) => ({
      byteLength: asset.bytes.byteLength,
      fallbackReason: isVectorAsset(asset) ? asset.fallbackReason : undefined,
      format: isVectorAsset(asset) ? asset.format : asset.name.split(".").pop(),
      kind: isVectorAsset(asset) ? "vector" : "image",
      name: asset.name,
      nodeId: asset.nodeId,
      path: isVectorAsset(asset)
        ? format === "swiftui"
          ? `${rootDir}/Assets.xcassets/${removeExtension(asset.name)}.imageset/${asset.name}`
          : format === "reactnative"
            ? `${getReactNativeVectorDirectory(rootDir)}${asset.name}`
            : format === "compose"
              ? `${getComposeDrawableDirectory(rootDir)}${toDrawableFileName(asset.name)}`
              : `${getFlutterVectorDirectory(rootDir)}${asset.name}`
        : format === "reactnative"
          ? `${getReactNativeAssetDirectory(rootDir)}${asset.name}`
          : getImagePath(asset, format, rootDir),
      source: isVectorAsset(asset)
        ? asset.format === "svg"
          ? "figma-svg"
          : "rasterized-vector"
        : asset.source,
    })),
  });

  try {
    return zipSync(files, { level: 6 });
  } catch (error) {
    console.error("Zip creation failed:", error);
    throw new Error(
      "Failed to create project archive. The project might be too large or complex.",
    );
  }
}
