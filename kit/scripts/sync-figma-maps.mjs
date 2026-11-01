import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const figmaDir = resolve(root, "figma");
const componentsManifest = readJson("components.manifest.json");
const tokensManifest = readJson("tokens.manifest.json");

function readJson(file) {
  return JSON.parse(readFileSync(resolve(root, file), "utf8"));
}

function writeJson(file, data) {
  writeFileSync(resolve(root, file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function buildComponentMap() {
  return {
    version: componentsManifest.version,
    status: "code-first",
    note: "Code-first Figma alignment map. Add nodeId values after connecting a real Figma library.",
    importEntry: componentsManifest.importEntry,
    components: componentsManifest.components.map((component) => ({
      codeComponent: component.name,
      figmaComponent: component.figma?.component ?? component.name,
      importFrom: component.importFrom,
      category: component.category,
      layoutRole: component.layoutRole,
      requiredProps: component.requiredProps,
      optionalProps: component.optionalProps,
      variants: component.variants,
      figmaVariants: component.figma?.variants ?? [],
      examples: component.examples,
      nodeId: null,
      source: "components.manifest.json"
    }))
  };
}

function buildVariablesMap() {
  return {
    version: tokensManifest.version,
    status: "code-first",
    note: "Code token to Figma variable names. Values live in src/styles.css; this file records semantic alignment.",
    variables: Object.entries(flattenTokenGroups(tokensManifest)).map(([token, item]) => ({
      token,
      category: token.split(".")[0],
      figmaVariable: tokenToFigmaVariable(token),
      cssVariable: item.css,
      usage: item.usage,
      doNotUseFor: item.doNotUseFor ?? [],
      nodeId: null,
      source: "tokens.manifest.json"
    }))
  };
}

function buildVariantsMap() {
  return {
    version: componentsManifest.version,
    status: "code-first",
    note: "Figma variant property to code prop mapping. Add nodeId values after binding real Figma components.",
    mappings: componentsManifest.components.flatMap((component) =>
      (component.figma?.variants ?? []).map((figmaProperty) => {
        const spec = variantSpecs[component.name]?.[figmaProperty];
        if (!spec) {
          throw new Error(`Missing Figma variant mapping spec for ${component.name}.${figmaProperty}`);
        }
        return variantMapping(
          component.name,
          component.figma?.component ?? component.name,
          figmaProperty,
          spec.props,
          spec.values
        );
      })
    )
  };
}

const rawVariantSpecs = {
  Button: {
    Variant: { prop: "variant", values: enumValues("primary", "secondary", "outline", "ghost", "danger") },
    Size: { prop: "size", values: { Small: "sm", Medium: "md", Large: "lg" } },
    State: {
      props: ["disabled", "loading"],
      values: {
        Default: { disabled: false, loading: false },
        Disabled: { disabled: true, loading: false },
        Loading: { disabled: false, loading: true }
      }
    }
  },
  ConfirmDialog: {
    Tone: { prop: "danger", values: { Default: false, Danger: true } }
  },
  Drawer: {
    Size: { prop: "size", values: { Small: "sm", Medium: "md", Large: "lg" } }
  },
  ImportFlow: {
    Status: { prop: "status", values: enumValues("ready", "processing", "success", "error") }
  },
  Input: {
    State: fieldStateSpec()
  },
  Textarea: {
    State: fieldStateSpec()
  },
  Select: {
    State: fieldStateSpec()
  },
  DatePicker: {
    Mode: { prop: "mode", values: enumValues("date", "datetime", "time") },
    State: { prop: "status", values: { Default: "default", Error: "error" } }
  },
  RangePicker: {
    Mode: { prop: "mode", values: enumValues("date", "datetime", "time") },
    State: { prop: "status", values: { Default: "default", Error: "error" } }
  },
  RadioGroup: {
    Layout: { prop: "layout", values: enumValues("horizontal", "vertical") },
    State: { prop: "status", values: { Default: "default", Error: "error" } }
  },
  CheckboxGroup: {
    Layout: { prop: "layout", values: enumValues("horizontal", "vertical", "grid") },
    State: { prop: "status", values: { Default: "default", Error: "error" } }
  },
  Switch: {
    State: {
      props: ["checked", "loading"],
      values: {
        Off: { checked: false, loading: false },
        On: { checked: true, loading: false },
        Loading: { checked: false, loading: true }
      }
    }
  },
  Upload: {
    Type: { prop: "variant", values: { Button: "button", Drag: "drag" } },
    State: fieldStateSpec()
  },
  TreeSelect: {
    Selection: { prop: "selectionMode", values: enumValues("single", "multiple", "checkbox") },
    State: { prop: "status", values: { Default: "default", Error: "error" } }
  },
  Card: {
    Type: { prop: "variant", values: enumValues("default", "ghost") }
  },
  Badge: {
    Variant: {
      prop: "variant",
      values: enumValues(
        "primary",
        "secondary",
        "success",
        "warning",
        "danger",
        "info",
        "processing",
        "geekblue",
        "cyan",
        "purple"
      )
    },
    Appearance: { prop: "appearance", values: enumValues("solid", "soft", "outline") }
  },
  Tabs: {
    Type: { prop: "variant", values: enumValues("line", "card") }
  },
  SideNav: {
    State: { props: ["activeKey"], values: { Default: {}, Active: { activeKey: "activeKey" } } }
  },
  ThemeToggle: {
    Theme: { prop: "value", values: { Vivid: "vivid", Calm: "calm" } }
  },
  AppShell: {
    NavState: { prop: "collapsed", values: { Expanded: false, Collapsed: true } }
  },
  PageLayout: {
    Density: { prop: "density", values: enumValues("compact", "standard", "loose") }
  },
  PageHeader: {
    Type: { prop: "tabs", values: { Default: null, WithTabs: "tabs" } }
  },
  FilterPanel: {
    Layout: { prop: "variant", values: enumValues("inline", "grid") }
  },
  DataSection: {
    Density: { prop: "variant", values: enumValues("default", "dense") },
    State: {
      props: ["loading", "empty"],
      values: {
        Default: { loading: false },
        Loading: { loading: true },
        Empty: { loading: false, empty: "empty" }
      }
    }
  },
  BulkActionBar: {
    State: { prop: "selectedCount", values: { Hidden: 0, Visible: 1 } }
  },
  FormSection: {
    Type: { prop: "description", values: { Default: null, WithDescription: "description" } }
  },
  MetricCard: {
    Size: { prop: "variant", values: enumValues("default", "compact") },
    Trend: { prop: "trend", values: enumValues("up", "down", "flat") }
  },
  ChartFrame: {
    State: { prop: "state", values: enumValues("ready", "loading", "empty", "error") },
    Size: { prop: "size", values: { Small: "sm", Medium: "md", Large: "lg" } }
  },
  TrendChart: {
    Curve: { prop: "curve", values: enumValues("linear", "smooth") },
    Area: { prop: "area", values: { Off: false, On: true } }
  },
  BarChart: {
    Orientation: { prop: "orientation", values: enumValues("vertical", "horizontal") }
  },
  DonutChart: {
    Legend: { prop: "legendPosition", values: { Bottom: "bottom", Right: "right" } }
  },
  GaugeChart: {
    Band: { props: ["bands"], values: { Default: {} } }
  },
  DetailHeader: {
    Type: { prop: "status", values: { Default: null, WithStatus: "status" } }
  },
  DescriptionGrid: {
    Columns: { prop: "columns", values: { Two: 2, Three: 3, Four: 4 } }
  },
  DataGrid: {
    Density: { prop: "density", values: enumValues("default", "compact") },
    Selectable: { prop: "rowSelection", values: { Off: false, On: true } }
  },
  Pagination: {
    State: { prop: "disabled", values: { Default: false, Disabled: true } }
  },
  Table: {
    Density: { prop: "density", values: enumValues("default", "compact") }
  },
  Stepper: {
    State: { prop: "currentKey", values: { Active: "currentKey" } }
  }
};

export const variantSpecs = normalizeVariantSpecs(rawVariantSpecs);

function enumValues(...values) {
  return Object.fromEntries(values.map((value) => [toFigmaLabel(value), value]));
}

function fieldStateSpec() {
  return {
    props: ["status", "disabled"],
    values: {
      Default: { status: "default", disabled: false },
      Error: { status: "error", disabled: false },
      Disabled: { status: "default", disabled: true }
    }
  };
}

function normalizeVariantSpecs(specs) {
  return Object.fromEntries(
    Object.entries(specs).map(([component, axes]) => [
      component,
      Object.fromEntries(
        Object.entries(axes).map(([axis, spec]) => [
          axis,
          spec.props
            ? spec
            : {
                props: [spec.prop],
                values: Object.fromEntries(
                  Object.entries(spec.values).map(([figmaValue, propValue]) => [figmaValue, { [spec.prop]: propValue }])
                )
              }
        ])
      )
    ])
  );
}

function toFigmaLabel(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function variantMapping(codeComponent, figmaComponent, figmaProperty, props, values) {
  return {
    codeComponent,
    figmaComponent,
    figmaProperty,
    props,
    values,
    nodeId: null,
    source: "components.manifest.json"
  };
}

function flattenTokenGroups(manifest) {
  const result = {};
  for (const [group, value] of Object.entries(manifest)) {
    if (group === "version" || group === "note") continue;
    for (const [token, item] of Object.entries(value)) {
      result[token] = item;
    }
  }
  return result;
}

function tokenToFigmaVariable(token) {
  return token
    .split(".")
    .map((part) =>
      part
        .split("-")
        .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
        .join(" ")
    )
    .join("/");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  mkdirSync(figmaDir, { recursive: true });
  writeJson("figma/component-map.json", buildComponentMap());
  writeJson("figma/variables-map.json", buildVariablesMap());
  writeJson("figma/variants-map.json", buildVariantsMap());
  console.log("synced figma maps: component-map.json, variables-map.json, variants-map.json");
}
