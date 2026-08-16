import { beforeEach, describe, expect, it } from "vitest";
import {
  addWarning,
  clearWarnings,
  previewWarnings,
  warnings,
  withWarningScope,
} from "./commonConversionWarnings";

describe("conversion warning scopes", () => {
  beforeEach(clearWarnings);

  it("keeps preview failures out of target conversion warnings", async () => {
    addWarning("Target warning");
    await withWarningScope("preview", async () => {
      addWarning("Preview SVG warning");
    });

    expect([...warnings]).toEqual(["Target warning"]);
    expect([...previewWarnings]).toEqual(["Preview SVG warning"]);
  });

  it("restores the conversion scope after a preview failure", async () => {
    await expect(
      withWarningScope("preview", async () => {
        throw new Error("preview failed");
      }),
    ).rejects.toThrow("preview failed");

    addWarning("Target warning");
    expect([...warnings]).toEqual(["Target warning"]);
  });
});
