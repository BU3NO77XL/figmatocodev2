import { describe, expect, it } from "vitest";
import { reactNativeMain } from "./reactNativeMain";

Object.assign(globalThis, {
  figma: { mixed: Symbol("mixed") },
});

const solidFill = {
  type: "SOLID",
  visible: true,
  opacity: 1,
  color: { r: 1, g: 1, b: 1 },
};

describe("reactNativeMain", () => {
  it("maps richer typography and text shadow styles", () => {
    const code = reactNativeMain(
      [
        {
          id: "1:1",
          type: "TEXT",
          name: "Title",
          x: 0,
          y: 0,
          width: 240,
          height: 40,
          visible: true,
          opacity: 1,
          characters: "Olá mundo",
          fills: [solidFill],
          fontName: { family: "Inter", style: "Bold Italic" },
          fontSize: 24,
          lineHeight: { unit: "PIXELS", value: 32 },
          letterSpacing: { unit: "PERCENT", value: 10 },
          textAlignHorizontal: "CENTER",
          textDecoration: "UNDERLINE",
          textCase: "UPPER",
          effects: [
            {
              type: "DROP_SHADOW",
              visible: true,
              offset: { x: 2, y: 4 },
              radius: 8,
              spread: 0,
              color: { r: 0, g: 0, b: 0, a: 0.3 },
              blendMode: "NORMAL",
              showShadowBehindNode: false,
            },
          ],
        } as any,
      ],
      {} as any,
    );

    expect(code).toContain('fontFamily: "Inter"');
    expect(code).toContain('fontStyle: "italic"');
    expect(code).toContain('fontWeight: "700"');
    expect(code).toContain('textDecorationLine: "underline"');
    expect(code).toContain('textTransform: "uppercase"');
    expect(code).toContain("lineHeight: 32");
    expect(code).toContain("letterSpacing: 2.4");
    expect(code).toContain('textShadowColor: "rgba(0, 0, 0, 0.30)"');
    expect(code).toContain("textShadowRadius: 8");
    expect(code).toContain("textShadowOffset: { width: 2, height: 4 }");
  });

  it("maps auto-layout wrap, cross-axis spacing, growth and shadows", () => {
    const code = reactNativeMain(
      [
        {
          id: "2:1",
          type: "FRAME",
          name: "Cards",
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          visible: true,
          opacity: 1,
          layoutMode: "HORIZONTAL",
          layoutWrap: "WRAP",
          primaryAxisAlignItems: "MIN",
          counterAxisAlignItems: "MIN",
          counterAxisAlignContent: "SPACE_BETWEEN",
          primaryAxisSizingMode: "FIXED",
          counterAxisSizingMode: "FIXED",
          itemSpacing: 16,
          counterAxisSpacing: 24,
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 8,
          paddingBottom: 8,
          fills: [solidFill],
          strokes: [],
          strokeWeight: 0,
          effects: [
            {
              type: "DROP_SHADOW",
              visible: true,
              offset: { x: 0, y: 6 },
              radius: 12,
              spread: 0,
              color: { r: 0, g: 0, b: 0, a: 0.2 },
              blendMode: "NORMAL",
              showShadowBehindNode: false,
            },
          ],
          children: [
            {
              id: "2:2",
              type: "RECTANGLE",
              name: "Card",
              x: 0,
              y: 0,
              width: 120,
              height: 72,
              visible: true,
              opacity: 1,
              layoutGrow: 1,
              layoutAlign: "STRETCH",
              fills: [solidFill],
              strokes: [],
              strokeWeight: 0,
            },
          ],
        } as any,
      ],
      {} as any,
    );

    expect(code).toContain('flexWrap: "wrap"');
    expect(code).toContain("columnGap: 16");
    expect(code).toContain("rowGap: 24");
    expect(code).toContain('alignContent: "space-between"');
    expect(code).toContain("shadowOpacity: 0.2");
    expect(code).toContain("shadowRadius: 12");
    expect(code).toContain("shadowOffset: { width: 0, height: 6 }");
    expect(code).toContain("elevation: 12");
    expect(code).toContain("flexGrow: 1");
    expect(code).toContain("flexShrink: 1");
    expect(code).toContain('alignSelf: "stretch"');
  });

  it("renders nested text segments and blur imports when needed", () => {
    const code = reactNativeMain(
      [
        {
          id: "3:1",
          type: "FRAME",
          name: "GlassCard",
          x: 0,
          y: 0,
          width: 280,
          height: 120,
          visible: true,
          opacity: 1,
          fills: [solidFill],
          strokes: [],
          strokeWeight: 0,
          effects: [
            {
              type: "BACKGROUND_BLUR",
              visible: true,
              radius: 12,
              boundVariables: {},
            },
          ],
          children: [
            {
              id: "3:2",
              type: "TEXT",
              name: "Mixed",
              x: 16,
              y: 20,
              width: 200,
              height: 32,
              visible: true,
              opacity: 1,
              characters: "Hello World",
              fills: [solidFill],
              fontName: { family: "Inter", style: "Regular" },
              fontSize: 16,
              lineHeight: { unit: "PIXELS", value: 20 },
              letterSpacing: { unit: "PIXELS", value: 0 },
              textAlignHorizontal: "LEFT",
              textDecoration: "NONE",
              textCase: "ORIGINAL",
              styledTextSegments: [
                {
                  characters: "Hello ",
                  fills: [
                    {
                      type: "SOLID",
                      visible: true,
                      opacity: 1,
                      color: { r: 1, g: 0, b: 0 },
                    },
                  ],
                  fontName: { family: "Inter", style: "Bold" },
                  fontSize: 16,
                  fontWeight: 700,
                  lineHeight: { unit: "PIXELS", value: 20 },
                  letterSpacing: { unit: "PIXELS", value: 0 },
                  textCase: "ORIGINAL",
                  textDecoration: "NONE",
                },
                {
                  characters: "World",
                  fills: [
                    {
                      type: "SOLID",
                      visible: true,
                      opacity: 1,
                      color: { r: 0, g: 0, b: 1 },
                    },
                  ],
                  fontName: { family: "Inter", style: "Italic" },
                  fontSize: 16,
                  fontWeight: 400,
                  lineHeight: { unit: "PIXELS", value: 20 },
                  letterSpacing: { unit: "PIXELS", value: 0 },
                  textCase: "UPPER",
                  textDecoration: "UNDERLINE",
                },
              ],
            },
          ],
        } as any,
      ],
      {} as any,
    );

    expect(code).toContain('import { BlurView } from "expo-blur";');
    expect(code).toContain("<BlurView intensity={48}");
    expect(code).toContain("<Text style={styles.text0}>");
    expect(code).toContain("<Text style={styles.textSegment1}>`Hello `</Text>");
    expect(code).toContain('<Text style={styles.textSegment2}>`WORLD`</Text>');
    expect(code).toContain('textDecorationLine: "underline"');
    expect(code).toContain('fontStyle: "italic"');
  });

  it("extracts top-level named containers into local reusable components", () => {
    const code = reactNativeMain(
      [
        {
          id: "4:1",
          type: "FRAME",
          name: "Header",
          x: 0,
          y: 0,
          width: 320,
          height: 96,
          visible: true,
          opacity: 1,
          fills: [solidFill],
          strokes: [],
          strokeWeight: 0,
          children: [
            {
              id: "4:2",
              type: "TEXT",
              name: "Title",
              x: 16,
              y: 32,
              width: 120,
              height: 24,
              visible: true,
              opacity: 1,
              characters: "Dashboard",
              fills: [solidFill],
              fontName: { family: "Inter", style: "Bold" },
              fontSize: 18,
              lineHeight: { unit: "PIXELS", value: 24 },
              letterSpacing: { unit: "PIXELS", value: 0 },
              textAlignHorizontal: "LEFT",
              textDecoration: "NONE",
              textCase: "ORIGINAL",
            },
          ],
        } as any,
      ],
      {} as any,
    );

    expect(code).toContain("function Header()");
    expect(code).toContain("<Header />");
    expect(code).toContain('<View style={styles.view1}>');
    expect(code).toContain('<Text style={styles.text0}>`Dashboard`</Text>');
  });
});
