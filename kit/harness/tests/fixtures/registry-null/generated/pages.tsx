const pagePlans = [
  {
    "id": "fixture",
    "route": "/fixture",
    "title": "Fixture",
    "pattern": "detail-page"
  }
];

const pageById = Object.fromEntries(pagePlans.map((page) => [page.id, page]));

function FixturePage({ page }: { page: (typeof pagePlans)[number] }) {
  return <main>{page.title}</main>;
}

const generatedComponents = {
  "fixture": () => null
};

export const generatedProjectPages = pagePlans.map((page) => ({
  id: page.id,
  route: page.route,
  title: page.title,
  pattern: page.pattern,
  component: generatedComponents[page.id]
}));
