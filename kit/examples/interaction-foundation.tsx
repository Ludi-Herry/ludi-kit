import { useState } from "react";
import {
  Button,
  CheckboxGroup,
  DatePicker,
  Drawer,
  FormSection,
  RadioGroup,
  RangePicker,
  Switch,
  TreeSelect,
  Upload,
  type UploadItem
} from "@ai-readable/kit";

const organizationOptions = [
  {
    label: "示例集团",
    value: "group",
    children: [
      { label: "安全运营部", value: "security" },
      { label: "平台研发部", value: "platform" }
    ]
  }
];

export function InteractionFoundationExample() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [organization, setOrganization] = useState<string | null>("security");

  return (
    <FormSection
      actions={<Button onClick={() => setDrawerOpen(true)}>打开编辑抽屉</Button>}
      description="字段值保持业务字符串，上传只交付本地文件选择结果。"
      title="计划配置"
    >
      <RangePicker
        defaultValue={["2026-07-15", "2026-07-31"]}
        label="有效期"
      />
      <DatePicker defaultValue="2026-07-15T10:30" label="发布时间" mode="datetime" />
      <RadioGroup
        defaultValue="manual"
        label="执行方式"
        options={[
          { label: "人工确认", value: "manual" },
          { label: "自动执行", value: "automatic" }
        ]}
      />
      <CheckboxGroup
        defaultValue={["failure"]}
        label="通知条件"
        options={[
          { label: "执行成功", value: "success" },
          { label: "执行失败", value: "failure" }
        ]}
      />
      <TreeSelect
        label="归属组织"
        options={organizationOptions}
        searchable
        value={organization}
        onChange={setOrganization}
      />
      <Switch defaultChecked label="启用计划" />
      <Upload
        accept={[".csv"]}
        items={uploads}
        label="名单文件"
        maxCount={1}
        onFilesSelected={(files) => setUploads(files.map((file) => ({ id: file.name, name: file.name, status: "pending" })))}
        onRemove={() => setUploads([])}
      />

      <Drawer
        footer={<><Button variant="outline" onClick={() => setDrawerOpen(false)}>取消</Button><Button onClick={() => setDrawerOpen(false)}>保存</Button></>}
        open={drawerOpen}
        title="编辑计划"
        onClose={() => setDrawerOpen(false)}
      >
        <p>抽屉承载短编辑流程，关闭后焦点返回触发按钮。</p>
      </Drawer>
    </FormSection>
  );
}
