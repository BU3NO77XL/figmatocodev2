import copy from "copy-to-clipboard";
import Preview from "./components/Preview";
import GradientsPanel from "./components/GradientsPanel";
import ColorsPanel from "./components/ColorsPanel";
import CodePanel from "./components/CodePanel";
import EmptyState from "./components/EmptyState";
import About from "./components/About";
import WarningsPanel from "./components/WarningsPanel";
import {
  Framework,
  DownloadProjectFormat,
  HTMLPreview,
  LinearGradientConversion,
  PluginSettings,
  SolidColorConversion,
  Warning,
} from "types";
import {
  preferenceOptions,
  selectPreferenceOptions,
} from "./codegenPreferenceOptions";
import Loading from "./components/Loading";
import { useEffect, useState } from "react";
import { InfoIcon, LanguagesIcon } from "lucide-react";
import React from "react";
import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import { TooltipProvider } from "./components/ui/tooltip";
import { I18nProvider, Language, useI18n } from "./i18n";

type PluginUIProps = {
  code: string;
  htmlPreview: HTMLPreview;
  warnings: Warning[];
  selectedFramework: Framework;
  setSelectedFramework: (framework: Framework) => void;
  settings: PluginSettings | null;
  onPreferenceChanged: (
    key: keyof PluginSettings,
    value: PluginSettings[keyof PluginSettings],
  ) => void;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  isLoading: boolean;
  onDownloadProject?: (format: DownloadProjectFormat) => void;
  isDownloadingProject?: boolean;
  projectDownloadError?: string | null;
};

const frameworks: Framework[] = [
  "HTML",
  "Tailwind",
  "Flutter",
  "SwiftUI",
  "ReactNative",
];
const frameworkLabels: Record<Framework, string> = {
  Compose: "Compose",
  Flutter: "Flutter",
  HTML: "HTML",
  ReactNative: "React Native",
  SwiftUI: "SwiftUI",
  Tailwind: "Tailwind",
};
const LOADING_INDICATOR_DELAY_MS = 250;

const DelayedLoading = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setVisible(true),
      LOADING_INDICATOR_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return visible ? <Loading /> : null;
};

type FrameworkTabsProps = {
  frameworks: Framework[];
  selectedFramework: Framework;
  setSelectedFramework: (framework: Framework) => void;
  showAbout: boolean;
  setShowAbout: (show: boolean) => void;
};

const FrameworkTabs = ({
  frameworks,
  selectedFramework,
  setSelectedFramework,
  showAbout,
  setShowAbout,
}: FrameworkTabsProps) => {
  return (
    <div className="grid w-full grid-cols-3 gap-1 min-[420px]:grid-cols-5">
      {frameworks.map((tab) => (
        <Button
          variant="ghost"
          size="sm"
          key={`tab ${tab}`}
          aria-pressed={selectedFramework === tab && !showAbout}
          className={`h-8 w-full rounded-md px-2 text-[12px] leading-none min-[420px]:text-[11px] ${
            selectedFramework === tab && !showAbout
              ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
              : "bg-muted text-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90"
          }`}
          onClick={() => {
            setSelectedFramework(tab as Framework);
            setShowAbout(false);
          }}
        >
          {frameworkLabels[tab]}
        </Button>
      ))}
    </div>
  );
};

const PluginUIContent = (props: PluginUIProps) => {
  const { language, setLanguage, t } = useI18n();
  const [showAbout, setShowAbout] = useState(false);

  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewViewMode, setPreviewViewMode] = useState<
    "desktop" | "mobile" | "precision"
  >("precision");
  const [previewBgColor, setPreviewBgColor] = useState<"white" | "black">(
    "white",
  );

  if (props.isLoading) {
    return <DelayedLoading />;
  }

  const isEmpty = props.code === "";
  const warnings = props.warnings ?? [];

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
        <div className="px-2 py-1.5 dark:bg-card">
          <div className="mb-1.5 flex justify-end gap-1">
            <label className="relative flex h-7 w-[118px] items-center gap-1 rounded-md bg-neutral-100 px-1.5 text-neutral-900 shadow-sm ring-1 ring-neutral-200 transition-colors duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-neutral-200 hover:text-neutral-950 dark:bg-neutral-800/90 dark:text-neutral-200 dark:ring-white/10 dark:hover:bg-neutral-600 dark:hover:text-white dark:hover:ring-white/20">
              <LanguagesIcon
                size={14}
                className="pointer-events-none shrink-0"
              />
              <span className="sr-only">{t("language.label")}</span>
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as Language)
                }
                aria-label={t("language.label")}
                title={t("language.label")}
                className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[11px] font-medium text-neutral-900 outline-none dark:text-neutral-100"
              >
                <option value="en">{t("language.english")}</option>
                <option value="pt-BR">{t("language.portuguese")}</option>
              </select>
            </label>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 rounded-md ${
                showAbout
                  ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                  : "bg-muted text-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90"
              }`}
              onClick={() => {
                setShowAbout(!showAbout);
              }}
              aria-label={t("navigation.about")}
              aria-pressed={showAbout}
            >
              <InfoIcon size={15} />
            </Button>
          </div>
          <div className="rounded-lg bg-muted p-0.5 dark:bg-card">
            <FrameworkTabs
              frameworks={frameworks}
              selectedFramework={props.selectedFramework}
              setSelectedFramework={props.setSelectedFramework}
              showAbout={showAbout}
              setShowAbout={setShowAbout}
            />
          </div>
        </div>
        <div
          style={{
            height: 1,
            width: "100%",
            backgroundColor: "rgba(255,255,255,0.12)",
          }}
        ></div>
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {showAbout ? (
            <About
              useOldPluginVersion={props.settings?.useOldPluginVersion2025}
              onPreferenceChanged={props.onPreferenceChanged}
            />
          ) : isEmpty ? (
            <div className="flex min-h-full items-center justify-center">
              <EmptyState />
            </div>
          ) : (
            <div className="flex flex-col items-center px-4 pt-3 pb-2 gap-2 dark:bg-transparent">
              {props.htmlPreview && (
                <Preview
                  htmlPreview={props.htmlPreview}
                  expanded={previewExpanded}
                  setExpanded={setPreviewExpanded}
                  viewMode={previewViewMode}
                  setViewMode={setPreviewViewMode}
                  bgColor={previewBgColor}
                  setBgColor={setPreviewBgColor}
                />
              )}

              {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

              <CodePanel
                code={props.code}
                selectedFramework={props.selectedFramework}
                preferenceOptions={preferenceOptions}
                selectPreferenceOptions={selectPreferenceOptions}
                settings={props.settings}
                onPreferenceChanged={props.onPreferenceChanged}
                onDownloadProject={props.onDownloadProject}
                isDownloadingProject={props.isDownloadingProject}
                projectDownloadError={props.projectDownloadError}
              />

              {props.colors.length > 0 && (
                <div className="mt-3 w-full">
                  <ColorsPanel
                    colors={props.colors}
                    onColorClick={(value) => {
                      copy(value);
                    }}
                  />
                </div>
              )}

              {props.gradients.length > 0 && (
                <div className="mt-3 w-full">
                  <GradientsPanel
                    gradients={props.gradients}
                    onColorClick={(value) => {
                      copy(value);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
};

export const PluginUI = (props: PluginUIProps) => (
  <I18nProvider>
    <PluginUIContent {...props} />
  </I18nProvider>
);
