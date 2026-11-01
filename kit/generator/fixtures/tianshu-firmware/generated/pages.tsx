import type { ReactNode } from "react";
import type { ThemeConfig } from "antd";
import {
  Button,
  Card,
  ConfigProvider,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

export type GeneratedPageId = "production-firmware";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "tianshu-firmware-canary",
  "product": {
    "name": "天枢固件版本管理",
    "description": "供固件管理员检索版本、判断签名与灰度状态，并进入受控发布操作的生产履约页面。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

const nativeTheme: ThemeConfig = {
  cssVar: { key: "generated", prefix: "ant" },
  hashed: false
};

const productionFirmwareRows = [
  {
    "version": "v2.4.0-TJ-M1-beta",
    "model": "TJ-M1",
    "versionStatus": "测试中",
    "signatureStatus": "签名成功",
    "rollout": "—",
    "devices": 0,
    "publisher": "林嘉禾",
    "publishedAt": "—"
  },
  {
    "version": "v2.3.2-TJ-M1",
    "model": "TJ-M1",
    "versionStatus": "灰度中",
    "signatureStatus": "签名成功",
    "rollout": "25%",
    "devices": 1280,
    "publisher": "周启明",
    "publishedAt": "2026-07-16 18:20"
  },
  {
    "version": "v2.3.1-TJ-M1",
    "model": "TJ-M1",
    "versionStatus": "已全量",
    "signatureStatus": "签名成功",
    "rollout": "—",
    "devices": 4896,
    "publisher": "周启明",
    "publishedAt": "2026-07-11 10:08"
  },
  {
    "version": "v1.9.8-TJ-S1",
    "model": "TJ-S1",
    "versionStatus": "已回滚",
    "signatureStatus": "签名成功",
    "rollout": "—",
    "devices": 742,
    "publisher": "顾言",
    "publishedAt": "2026-07-04 15:36"
  },
  {
    "version": "v3.0.0-TJ-Pro-rc1",
    "model": "TJ-Pro",
    "versionStatus": "草稿",
    "signatureStatus": "未签名",
    "rollout": "—",
    "devices": 0,
    "publisher": "沈秋",
    "publishedAt": "—"
  },
  {
    "version": "v2.2.7-TJ-M1",
    "model": "TJ-M1",
    "versionStatus": "已停用",
    "signatureStatus": "签名失败",
    "rollout": "—",
    "devices": 315,
    "publisher": "周启明",
    "publishedAt": "2026-06-18 09:24"
  }
];

function ProductionFirmwarePage() {
  return (
    <NativePageShell title={"固件版本管理"} goal={"快速找到目标机型的固件版本，判断签名、灰度和发布状态，并进入受权限控制的下一步操作。"} action={"新建固件版本"}>
      <Card>
        <Form layout="inline">
          <Form.Item label={"固件版本号"} name={"firmwareVersion"}><Input placeholder={"输入版本号"} /></Form.Item>
          <Form.Item label={"机型"} name={"model"}><Select placeholder={"请选择机型"} options={[{"label":"TJ-M1","value":"tj-m1"},{"label":"TJ-S1","value":"tj-s1"},{"label":"TJ-Pro","value":"tj-pro"}]} /></Form.Item>
          <Form.Item label={"版本状态"} name={"versionStatus"}><Select placeholder={"请选择版本状态"} options={[{"label":"草稿","value":"draft"},{"label":"测试中","value":"testing"},{"label":"灰度中","value":"canary"},{"label":"已全量","value":"released"},{"label":"已回滚","value":"rolled_back"},{"label":"已停用","value":"deprecated"}]} /></Form.Item>
          <Form.Item label={"签名状态"} name={"signatureStatus"}><Select placeholder={"请选择签名状态"} options={[{"label":"未签名","value":"unsigned"},{"label":"签名中","value":"signing"},{"label":"签名成功","value":"signed"},{"label":"签名失败","value":"sign_failed"}]} /></Form.Item>
          <Form.Item><Button icon={<ReloadOutlined />}>筛选</Button></Form.Item>
        </Form>
      </Card>
      <Card title={"固件版本"} extra={<Button>导出版本列表</Button>}>
        <Table rowKey={"version"} dataSource={productionFirmwareRows} columns={[
  {
    "title": "固件版本号",
    "dataIndex": "version",
    "key": "version"
  },
  {
    "title": "机型",
    "dataIndex": "model",
    "key": "model"
  },
  {
    "title": "版本状态",
    "dataIndex": "versionStatus",
    "key": "versionStatus"
  },
  {
    "title": "签名状态",
    "dataIndex": "signatureStatus",
    "key": "signatureStatus"
  },
  {
    "title": "灰度比例",
    "dataIndex": "rollout",
    "key": "rollout"
  },
  {
    "title": "绑定设备数",
    "dataIndex": "devices",
    "key": "devices"
  },
  {
    "title": "发布人",
    "dataIndex": "publisher",
    "key": "publisher"
  },
  {
    "title": "发布时间",
    "dataIndex": "publishedAt",
    "key": "publishedAt"
  }
]} pagination={{ pageSize: 20, total: productionFirmwareRows.length }} />
      </Card>
    </NativePageShell>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "production-firmware", route: "/production/firmware", title: "固件版本管理", pattern: "list-page", component: ProductionFirmwarePage }
];

function NativePageShell({ title, goal, action, children }: { title: string; goal: string; action?: string; children: ReactNode }) {
  return (
    <ConfigProvider theme={nativeTheme}>
      <main className="generated-page">
        <Space orientation="vertical" size="large" className="generated-stack">
          <header className="generated-native-header">
            <div>
              <Typography.Title level={2}>{title}</Typography.Title>
              <Typography.Paragraph>{goal}</Typography.Paragraph>
            </div>
            {action ? <Button type="primary">{action}</Button> : null}
          </header>
          {children}
        </Space>
      </main>
    </ConfigProvider>
  );
}
