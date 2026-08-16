import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearWarnings, warnings } from "../common/commonConversionWarnings";
import { renderAndAttachSVG } from "./altNodeUtils";

describe("SVG rendering fallback", () => {
  beforeEach(() => {
    clearWarnings();
    vi.unstubAllGlobals();
  });

  it("uses an inline PNG without a warning when SVG export fails", async () => {
    const exportAsync = vi.fn<
      (settings: { format: string }) => Promise<string | Uint8Array>
    >(async (settings) => {
      if (settings.format === "SVG_STRING") {
        throw { message: "SVG renderer unavailable" };
      }
      return new Uint8Array([137, 80, 78, 71]);
    });
    vi.stubGlobal("figma", {
      getNodeByIdAsync: vi
        .fn<() => Promise<{ exportAsync: typeof exportAsync }>>()
        .mockResolvedValue({ exportAsync }),
      ui: { postMessage: vi.fn<(message: unknown) => void>() },
    });
    const node = {
      canBeFlattened: true,
      height: 24,
      id: "55:66",
      name: "Icon",
      type: "VECTOR",
      width: 24,
    };

    const result = await renderAndAttachSVG(node);

    expect(exportAsync).toHaveBeenCalledTimes(3);
    expect(result.svg).toContain('<img src="data:image/png;base64,');
    expect(result.svg).toContain('width="24" height="24"');
    expect([...warnings]).toEqual([]);
  });
});
