import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import english from "./locales/en.json";
import portuguese from "./locales/pt-BR.json";

export type Language = "en" | "pt-BR";
type Replacements = Record<string, string | number>;
type Catalog = Record<string, unknown>;

const STORAGE_KEY = "figma-to-code-language";
const catalogs: Record<Language, Catalog> = {
  en: english,
  "pt-BR": portuguese,
};

const lookup = (catalog: Catalog, key: string): string | undefined => {
  const value = key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, catalog);
  return typeof value === "string" ? value : undefined;
};

const interpolate = (value: string, replacements: Replacements = {}) =>
  value.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    replacements[key] === undefined ? `{{${key}}}` : String(replacements[key]),
  );

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, replacements?: Replacements, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider = ({ children }: React.PropsWithChildren) => {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "pt-BR") setLanguageState(saved);
    } catch {
      // The plugin still works when storage is unavailable.
    }
  }, []);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // Keep the in-memory selection when storage is unavailable.
    }
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, replacements, fallback) =>
        interpolate(
          lookup(catalogs[language], key) ??
            lookup(catalogs.en, key) ??
            fallback ??
            key,
          replacements,
        ),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
};
