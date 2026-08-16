import { Warning } from "types";

export const warnings = new Set<Warning>();
export const previewWarnings = new Set<Warning>();

export type WarningScope = "conversion" | "preview";

let activeScope: WarningScope = "conversion";

export const addWarning = (warning: Warning) => {
  const target = activeScope === "preview" ? previewWarnings : warnings;
  if (target.has(warning) === false) {
    console.warn(warning);
  }
  target.add(warning);
};

export const clearWarnings = () => {
  warnings.clear();
  previewWarnings.clear();
};

export const withWarningScope = async <T>(
  scope: WarningScope,
  operation: () => Promise<T>,
): Promise<T> => {
  const previousScope = activeScope;
  activeScope = scope;
  try {
    return await operation();
  } finally {
    activeScope = previousScope;
  }
};
