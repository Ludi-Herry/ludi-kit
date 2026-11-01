import { Button, PageLayout } from "@ai-readable/kit";

const pagePlans = [
  {
    id: "fixture",
    route: "/fixture",
    title: "Fixture",
    pattern: "detail-page",
    intentCard: { primaryAction: "创建" }
  },
  {
    id: "global",
    route: "/global",
    title: "Global",
    pattern: "detail-page",
    intentCard: { primaryAction: "创建" }
  },
  {
    id: "assignment",
    route: "/assignment",
    title: "Assignment",
    pattern: "detail-page",
    intentCard: { primaryAction: "创建" }
  }
];

const pageById = Object.fromEntries(pagePlans.map((page) => [page.id, page]));
const rows = [{ intentCard: { primaryAction: "停用" } }];
const page = { intentCard: { primaryAction: "停用" } };

function GlobalPageAction() {
  return <Button>{page.intentCard.primaryAction}</Button>;
}

function ShadowActionPage({ page }: { page: (typeof pagePlans)[number] }) {
  const record = { status: "active" };
  return (
    <PageLayout>
      {rows.map((page) => <Button>{page.intentCard.primaryAction}</Button>)}
      {record.status === "active" ? <Button>停用</Button> : <Button>启用</Button>}
    </PageLayout>
  );
}

function GlobalPageActionPage({ page }: { page: (typeof pagePlans)[number] }) {
  const record = { status: "active" };
  return (
    <PageLayout>
      <GlobalPageAction />
      <span>{page.title}</span>
      {record.status === "active" ? <Button>停用</Button> : <Button>启用</Button>}
    </PageLayout>
  );
}

function AssignmentPageActionPage({ page }: { page: (typeof pagePlans)[number] }) {
  const record = { status: "active" };
  let alias: (typeof pagePlans)[number];
  alias = page;
  alias.intentCard.primaryAction = "停用";
  return (
    <PageLayout>
      <Button>{page.intentCard.primaryAction}</Button>
      {record.status === "active" ? <Button>停用</Button> : <Button>启用</Button>}
    </PageLayout>
  );
}

const generatedComponents = {
  fixture: () => <ShadowActionPage page={pageById["fixture"]} />,
  global: () => <GlobalPageActionPage page={pageById["global"]} />,
  assignment: () => <AssignmentPageActionPage page={pageById["assignment"]} />
};

export const generatedProjectPages = pagePlans.map((page) => ({
  id: page.id,
  route: page.route,
  title: page.title,
  pattern: page.pattern,
  component: generatedComponents[page.id]
}));
