import { useState, type ReactNode } from "react";
import type { ThemeConfig } from "antd";
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Drawer,
  Space,
  Typography
} from "antd";
import { ArrowLeftOutlined, InfoCircleOutlined, LockOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

export type GeneratedPageId = "platform-rbac-forbidden";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "tianshu-ops",
  "product": {
    "name": "天枢运营管理平台 · 账号与权限",
    "description": "供无访问权限的运营人员理解拦截原因，并安全返回工作台或联系管理员申请权限。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};



function PlatformRbacForbiddenPage() {
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <NativePageShell bare>
      <Card className="generated-permission-card" data-privacy-mode={"no-protected-data"}>
        <section className="generated-permission-state" aria-labelledby="generated-permission-title" aria-describedby="generated-permission-description">
          <div className="generated-permission-visual" aria-hidden="true">
            <strong>403</strong>
            <span className="generated-permission-shield">
              <SafetyCertificateOutlined />
              <LockOutlined className="generated-permission-lock" />
            </span>
          </div>
          <Typography.Title id="generated-permission-title" level={1}>无权访问账号与权限</Typography.Title>
          <Typography.Paragraph id="generated-permission-description" className="generated-permission-description">
            当前账号缺少 platform:rbac:read 权限，角色、用户与权限点数据未加载。请联系平台管理员申请权限，或返回工作台。
          </Typography.Paragraph>
          <div className="generated-permission-identifier">
            <InfoCircleOutlined aria-hidden="true" />
            <span>所需权限：</span>
            <code>platform:rbac:read</code>
          </div>
          <Space className="generated-permission-actions" size="middle" wrap>
            <Button
              data-testid="golden-permission-dashboard"
              href={"/dashboard"}
              icon={<ArrowLeftOutlined />}
              type="primary"
            >
              返回工作台
            </Button>
            <Button data-testid="golden-permission-request" onClick={() => setRequestOpen(true)}>
              联系管理员申请权限
            </Button>
          </Space>
        </section>
      </Card>
      <Drawer
        data-testid="golden-permission-request-panel"
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title={"申请账号与权限访问"}
        size="default"
        footer={
          <div className="generated-permission-panel-actions">
            <Button data-testid="golden-permission-request-close" onClick={() => setRequestOpen(false)}>
              我知道了
            </Button>
          </div>
        }
      >
        <Space orientation="vertical" size="large" className="generated-permission-panel">
          <Typography.Paragraph>请将所需权限标识发送给平台管理员，并说明访问账号与权限模块的业务需要。</Typography.Paragraph>
          <div className="generated-permission-panel__identifier">
            <Typography.Text type="secondary">所需权限</Typography.Text>
            <Typography.Text code copyable>platform:rbac:read</Typography.Text>
          </div>
          <Alert showIcon type="info" title={"此面板仅显示缺失权限标识和申请说明，不加载角色、用户或权限点数据。"} />
        </Space>
      </Drawer>
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "platform-rbac-forbidden", route: "/platform/rbac/forbidden-preview", title: "平台 · 账号与权限 · 无权限", pattern: "detail-page", component: PlatformRbacForbiddenPage }
];

function NativePageShell({ title, goal, action, actions, bare = false, children }: { title?: string; goal?: string; action?: string; actions?: ReactNode; bare?: boolean; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className={bare ? "generated-page generated-golden-page generated-permission-page" : "generated-page generated-golden-page"}>
        <Space orientation="vertical" size="large" className="generated-stack">
          {bare ? null : (
            <header className="generated-native-header">
              <div>
                <Typography.Title level={2}>{title}</Typography.Title>
                <Typography.Paragraph>{goal}</Typography.Paragraph>
              </div>
              {actions ?? (action ? <Button type="primary">{action}</Button> : null)}
            </header>
          )}
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}
