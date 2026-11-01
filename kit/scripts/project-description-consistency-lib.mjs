export function assertProjectDescriptionConsistency(pagesDocument, descriptionDocument, label = "project") {
  if (pagesDocument?.projectId !== descriptionDocument?.projectId) {
    throw new Error(
      `${label}: projectId differs between pages.json and project-description.json`
    );
  }
  const pagesById = new Map((pagesDocument.pages ?? []).map((page) => [page.id, page]));
  const descriptionsById = new Map(
    (descriptionDocument.pages ?? []).map((page) => [page.id, page])
  );
  assertExactIdSet(pagesById, descriptionsById, label);

  for (const [pageId, page] of pagesById) {
    const description = descriptionsById.get(pageId);
    for (const field of ["id", "route", "title", "pattern"]) {
      assertEqual(page[field], description[field], `${label}: page ${pageId} field ${field}`);
    }
    assertEqual(
      page.intentCard?.primaryAction,
      description.intent?.primaryAction,
      `${label}: page ${pageId} field primaryAction`
    );
    assertEqual(
      JSON.stringify(page.componentPlan),
      JSON.stringify(description.componentPlan),
      `${label}: page ${pageId} field componentPlan`
    );
  }
}

function assertExactIdSet(pagesById, descriptionsById, label) {
  const pageIds = [...pagesById.keys()].sort();
  const descriptionIds = [...descriptionsById.keys()].sort();
  if (
    pageIds.length !== descriptionIds.length ||
    pageIds.some((pageId, index) => pageId !== descriptionIds[index])
  ) {
    throw new Error(`${label}: page ID sets differ between pages.json and project-description.json`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(actual)}, received ${JSON.stringify(expected)}`
    );
  }
}
