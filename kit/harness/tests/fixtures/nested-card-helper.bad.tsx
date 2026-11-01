import { Card, PageLayout } from "@ai-readable/kit";

const InnerCard = ({ show }: { show: boolean }) => show ? <Card /> : null;
const CardWrapper = ({ children }: { children: unknown }) => <Card>{children}</Card>;
const CardAliasWrapper = ({ children: content }: { children: unknown }) => <Card>{content}</Card>;

function Bridge() {
  return <InnerCard show />;
}

export function NestedCardHelperPage() {
  const LocalBridge = () => <Bridge />;
  return (
    <PageLayout>
      <Card>
        <LocalBridge />
      </Card>
    </PageLayout>
  );
}

export function CardHelperOutsidePage() {
  return (
    <PageLayout>
      <Bridge />
    </PageLayout>
  );
}

export function NestedCardChildrenPage() {
  return (
    <PageLayout>
      <CardWrapper>
        <Card />
      </CardWrapper>
    </PageLayout>
  );
}

export function NestedCardAliasedChildrenPage() {
  return (
    <PageLayout>
      <CardAliasWrapper>
        <Card />
      </CardAliasWrapper>
    </PageLayout>
  );
}
