export type FoundationOutputMode = "kit-consumer" | "library-native" | "custom-native";
export type FoundationProvider = "local" | "shadcn" | "antd" | "arco-react" | "tdesign-react" | "element-plus" | "figma";
export type FoundationDistribution = "package-native" | "source-registry" | "figma-mapped" | "workspace-package" | "local-package" | "project-source";

export type FoundationImportProfile = {
  outputMode: FoundationOutputMode;
  distribution: FoundationDistribution[];
  importRoot: string;
  allowedFoundationImports: string[];
  forbiddenGeneratedImports: string[];
};

export const foundationImportProfiles = {
  "kit-consumer": {
    outputMode: "kit-consumer",
    distribution: ["workspace-package", "local-package"],
    importRoot: "@ai-readable/kit",
    allowedFoundationImports: ["@ai-readable/kit"],
    forbiddenGeneratedImports: [
      "antd",
      "antd/",
      "@ant-design/",
      "@arco-design/",
      "@radix-ui/",
      "@/components/ui/",
      "components/ui/",
      "shadcn"
    ]
  },
  "library-native": {
    outputMode: "library-native",
    distribution: ["package-native"],
    importRoot: "contract.foundation.packageName",
    allowedFoundationImports: ["contract.foundation.packageName", "contract.icons.packageName"],
    forbiddenGeneratedImports: ["@ai-readable/kit", "@radix-ui/", "@/components/ui/", "components/ui/", "shadcn"]
  },
  "custom-native": {
    outputMode: "custom-native",
    distribution: ["source-registry", "figma-mapped", "workspace-package", "local-package", "project-source"],
    importRoot: "contract.imports.root",
    allowedFoundationImports: ["contract.imports.root"],
    forbiddenGeneratedImports: [
      "@ai-readable/kit",
      "antd",
      "antd/",
      "@ant-design/",
      "@arco-design/",
      "element-plus"
    ]
  }
} satisfies Record<FoundationOutputMode, FoundationImportProfile>;

export const foundationCandidateIds = [
  "antd",
  "arco-react",
  "tdesign-react",
  "element-plus",
  "shadcn",
  "figma",
  "local"
] satisfies FoundationProvider[];

export const foundationPolicy = {
  profiles: foundationImportProfiles,
  catalogCandidates: foundationCandidateIds
} as const;

export const kitConsumerProfile = foundationImportProfiles["kit-consumer"];

export const kitConsumerForbiddenGeneratedImports = [
    "antd",
    "antd/",
    "@ant-design/",
    "@arco-design/",
    "@radix-ui/",
    "@/components/ui/",
    "components/ui/",
    "shadcn"
  ] as const;

export { aiReadableAntdTheme } from "./antd-theme.js";
