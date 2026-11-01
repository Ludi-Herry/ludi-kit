export function validateFormPresentationContract(page, foundation) {
  const presentation = page.content.formPresentation;
  if (!presentation) return;
  if (foundation.outputMode !== "library-native" || foundation.framework.name !== "react" || foundation.foundation.id !== "antd") {
    throw new Error(`page ${page.id} form presentation requires library-native React + AntD`);
  }
  if (page.pattern !== "form-page") {
    throw new Error(`page ${page.id} form presentation only supports form-page`);
  }
  if (!page.componentPlan.includes("Stepper") || !page.componentPlan.includes("FormSection")) {
    throw new Error(`page ${page.id} form presentation requires Stepper and FormSection in componentPlan`);
  }
  if (page.intent.secondaryActions.length === 0) {
    throw new Error(`page ${page.id} form presentation requires at least one secondary action`);
  }
  if (presentation.currentStep >= presentation.steps.length) {
    throw new Error(`page ${page.id} form presentation currentStep is outside steps`);
  }
  const fields = new Set(page.content.fields.map((field) => field.name));
  const sectionFieldNames = presentation.sections.flatMap((section) => section.fieldNames);
  const uniqueSectionFieldNames = new Set(sectionFieldNames);
  if (sectionFieldNames.length !== uniqueSectionFieldNames.size) {
    throw new Error(`page ${page.id} form presentation assigns a field more than once`);
  }
  const unknownField = sectionFieldNames.find((name) => !fields.has(name));
  if (unknownField) {
    throw new Error(`page ${page.id} form presentation references missing field ${unknownField}`);
  }
  const unassignedField = page.content.fields.find((field) => !uniqueSectionFieldNames.has(field.name));
  if (unassignedField) {
    throw new Error(`page ${page.id} form presentation does not assign field ${unassignedField.name}`);
  }
}

export function assertGeneratedFormContentFidelity(description, source) {
  const results = [];
  for (const page of description.pages.filter((entry) => Boolean(entry.content.formPresentation))) {
    const presentation = page.content.formPresentation;
    const requiredCopy = [
      ...presentation.steps.map((text) => ({ text, marker: `title: ${JSON.stringify(text)}` })),
      ...presentation.sections.map((section) => ({
        text: section.title,
        marker: `<Typography.Title level={4}>${escapeJsxText(section.title)}</Typography.Title>`
      })),
      ...page.intent.secondaryActions.map((text) => ({ text, marker: `<Button>${escapeJsxText(text)}</Button>` }))
    ];
    const forbiddenCopy = ["验收标准", ...page.intent.successCriteria];
    const missingRequiredCopy = requiredCopy.filter((entry) => !source.includes(entry.marker)).map((entry) => entry.text);
    const presentForbiddenCopy = forbiddenCopy.filter((text) => source.includes(text));
    if (missingRequiredCopy.length || presentForbiddenCopy.length) {
      throw new Error(
        `page ${page.id} generated form fidelity failed: missing=${JSON.stringify(missingRequiredCopy)} presentForbidden=${JSON.stringify(presentForbiddenCopy)}`
      );
    }
    results.push({
      pageId: page.id,
      requiredCopyCount: requiredCopy.length,
      forbiddenCopyCount: forbiddenCopy.length
    });
  }
  return results;
}

function escapeJsxText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("{", "&#123;").replaceAll("}", "&#125;");
}
