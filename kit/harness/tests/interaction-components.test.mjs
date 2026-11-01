import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const sourceUrl = new URL("../../src/interaction.tsx", import.meta.url);
const declarationUrl = new URL("../../dist/interaction.d.ts", import.meta.url);
const moduleUrl = new URL("../../dist/interaction.js", import.meta.url);

const source = await readFile(sourceUrl, "utf8");

test("interaction source keeps the public boundary domain-focused", () => {
  const expectedExports = [
    "Drawer",
    "DatePicker",
    "RangePicker",
    "RadioGroup",
    "CheckboxGroup",
    "Switch",
    "Upload",
    "TreeSelect"
  ];

  for (const component of expectedExports) {
    assert.match(source, new RegExp(`export function ${component}\\b`));
    assert.match(source, new RegExp(`export type ${component}Props\\b`));
  }
  assert.doesNotMatch(source, /export type[^;=]*\b(?:Dayjs|UploadFile|RcFile|RadioChangeEvent|CheckboxChangeEvent)\b/);
  assert.match(source, /onChange\?: \(value: string \| null\) => void/);
  assert.match(source, /onFilesSelected\?: \(files: File\[\]\) => void/);
  assert.match(source, /value=\{props\.value === undefined \? undefined : props\.value\}/);
});

test("drawer stays inside the provider and protects backdrop close by default", () => {
  assert.match(source, /closeOnBackdrop = false/);
  assert.match(source, /mask=\{\{ enabled: true, closable: closeOnBackdrop \}\}/);
  assert.match(source, /getContainer=\{portalContainer\}/);
  assert.match(source, /focusable=\{\{ focusTriggerAfterClose: true, trap: true \}\}/);
  assert.match(source, /destroyOnHidden=\{unmountOnClose\}/);
  assert.doesNotMatch(source, /\bdestroyOnClose=/);
  assert.doesNotMatch(source, /\bmaskClosable=/);
});

test("choice groups map semantic classes onto each option", () => {
  const radioGroup = source.match(/<AntRadio\.Group[\s\S]*?<\/AntRadio\.Group>/)?.[0] ?? "";
  const checkboxGroup = source.match(/<AntCheckbox\.Group[\s\S]*?<\/AntCheckbox\.Group>/)?.[0] ?? "";
  assert.ok(radioGroup);
  assert.ok(checkboxGroup);
  assert.doesNotMatch(radioGroup.match(/<AntRadio\.Group[\s\S]*?>/)?.[0] ?? "", /classNames=/);
  assert.doesNotMatch(checkboxGroup.match(/<AntCheckbox\.Group[\s\S]*?>/)?.[0] ?? "", /classNames=/);
  assert.match(radioGroup, /<AntRadio[\s\S]*?classNames=/);
  assert.match(checkboxGroup, /<AntCheckbox[\s\S]*?classNames=/);
});

test("upload selection cannot start an implicit request", () => {
  assert.match(source, /const handleBeforeUpload:[\s\S]*?return false;/);
  assert.match(source, /beforeUpload: handleBeforeUpload/);
  assert.doesNotMatch(source, /\baction:/);
  assert.doesNotMatch(source, /\bcustomRequest:/);
});

test("range picker keeps a cross-field draft until group blur and rolls invalid edits back", () => {
  assert.match(source, /const controlled = value !== undefined/);
  assert.match(source, /const currentRange:[^\n]+editing \? draft : committedRange/);
  assert.match(source, /const updateDraft = \(nextRange:[\s\S]*?setDraft\(nextRange\);[\s\S]*?setEditing\(true\);/);
  assert.match(source, /event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)/);
  assert.match(source, /className="rd-range-picker__boundary"[\s\S]*?className="rd-range-picker__presets"/);
  assert.match(source, /const finishEditing = \(nextRange: \[string, string\] = draft\) => \{[\s\S]*?commitRange\(nextRange\)[\s\S]*?setDraft\(committedRange\)/);
  assert.match(source, /querySelectorAll<HTMLInputElement>\("\.rd-range-picker__input"\)[\s\S]*?finishEditing\(\[inputs\[0\]\?\.value \?\? "", inputs\[1\]\?\.value \?\? ""\]\)/);
  const commitRange = source.match(/const commitRange = \(nextRange:[\s\S]*?\n  };/)?.[0] ?? "";
  assert.ok(commitRange);
  assert.match(source, /if \(!start \|\| !end\) return false/);
  assert.match(source, /normalizedMin && \(start < normalizedMin \|\| end < normalizedMin\)/);
  assert.match(source, /normalizedMax && \(start > normalizedMax \|\| end > normalizedMax\)/);
  assert.match(source, /return start <= end/);
  assert.ok(commitRange.indexOf("isCommittableRange(nextRange)") < commitRange.indexOf("setDraft(nextRange)"));
});

test("compiled declarations do not expose adapter types", async () => {
  const declaration = await readFile(declarationUrl, "utf8");
  assert.doesNotMatch(declaration, /\b(?:Dayjs|UploadFile|RcFile|RadioChangeEvent|CheckboxChangeEvent)\b/);
  assert.doesNotMatch(declaration, /from ["']antd["']/);
  assert.doesNotMatch(declaration, /from ["']dayjs["']/);
});

test("SSR markup has stable semantics and zero React warnings", async () => {
  const interaction = await import(`${moduleUrl.href}?test=${Date.now()}`);
  const warnings = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => warnings.push(args.map(String).join(" "));
  console.warn = (...args) => warnings.push(args.map(String).join(" "));

  try {
    const markup = renderToStaticMarkup(
      React.createElement("div", null,
        React.createElement(interaction.Drawer, {
          open: false,
          title: "详情",
          onClose: () => undefined
        }, "内容"),
        React.createElement(interaction.DatePicker, { label: "日期" }),
        React.createElement(interaction.RangePicker, {
          label: "受控时间范围",
          value: ["2026-07-01", "2026-07-15"]
        }),
        React.createElement(interaction.RangePicker, {
          label: "默认时间范围",
          defaultValue: ["2026-08-01", "2026-08-31"]
        }),
        React.createElement(interaction.RadioGroup, {
          label: "状态",
          options: [{ label: "启用", value: "enabled" }]
        }),
        React.createElement(interaction.CheckboxGroup, {
          label: "范围",
          options: [{ label: "全部", value: "all" }]
        }),
        React.createElement(interaction.Switch, { label: "启用" }),
        React.createElement(interaction.Upload, { label: "附件" }),
        React.createElement(interaction.TreeSelect, {
          label: "组织",
          options: [{ label: "总部", value: "root" }]
        })
      )
    );

    assert.match(markup, /rd-date-picker/);
    assert.match(markup, /rd-range-picker/);
    assert.match(markup, /aria-label="受控时间范围开始"[^>]*value="2026-07-01"/);
    assert.match(markup, /aria-label="受控时间范围结束"[^>]*value="2026-07-15"/);
    assert.match(markup, /aria-label="默认时间范围开始"[^>]*value="2026-08-01"/);
    assert.match(markup, /aria-label="默认时间范围结束"[^>]*value="2026-08-31"/);
    assert.match(markup, /role="radiogroup"/);
    assert.match(markup, /role="group"/);
    assert.match(markup, /role="switch"/);
    assert.match(markup, /type="file"/);
    assert.match(markup, /rd-tree-select/);
    assert.doesNotMatch(markup, /classNames=/);
    assert.deepEqual(warnings, []);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});
