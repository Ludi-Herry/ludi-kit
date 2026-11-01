export function validateDashboardContentFidelityContract(page, foundation) {
  if (!page.content.contentFidelity) return;
  if (foundation.outputMode !== "library-native" || foundation.framework.name !== "react" || foundation.foundation.id !== "antd") {
    throw new Error(`page ${page.id} dashboard content fidelity requires library-native React + AntD`);
  }
  if (page.pattern !== "dashboard-page" || page.content.analytics) {
    throw new Error(`page ${page.id} dashboard content fidelity only supports a basic dashboard-page`);
  }
  if (page.intent.secondaryActions.length === 0) {
    throw new Error(`page ${page.id} dashboard content fidelity requires at least one secondary action`);
  }
  const missingDelta = page.content.metrics.find((metric) => typeof metric.delta !== "string" || metric.delta.trim() === "");
  if (missingDelta) {
    throw new Error(`page ${page.id} dashboard content fidelity requires a non-empty delta for metric ${missingDelta.label}`);
  }
}

export function assertGeneratedDashboardContentFidelity(description, source) {
  const results = [];
  for (const page of description.pages.filter((entry) => Boolean(entry.content.contentFidelity))) {
    const requiredCopy = [
      ...page.content.metrics.map((metric) => ({
        text: metric.delta,
        marker: `>${escapeJsxText(metric.delta)}</Typography.Text>`
      })),
      ...page.intent.secondaryActions.map((action) => ({
        text: action,
        marker: `<Button>${escapeJsxText(action)}</Button>`
      }))
    ];
    const forbiddenCopy = ["验收标准", ...page.intent.successCriteria];
    const missingRequiredCopy = requiredCopy.filter((entry) => !source.includes(entry.marker)).map((entry) => entry.text);
    const presentForbiddenCopy = forbiddenCopy.filter((text) => source.includes(text));
    if (missingRequiredCopy.length || presentForbiddenCopy.length) {
      throw new Error(
        `page ${page.id} generated content fidelity failed: missing=${JSON.stringify(missingRequiredCopy)} presentForbidden=${JSON.stringify(presentForbiddenCopy)}`
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
