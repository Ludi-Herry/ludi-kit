import {
  Button,
  FormSection,
  Input,
  PageHeader,
  PageLayout,
  Select,
  Stepper,
  Textarea
} from "@ai-readable/kit";

export function FormPageExample() {
  return (
    <PageLayout>
      <PageHeader title="新建项目" description="设置归属、范围与评审要求。" />
      <Stepper
        currentKey="basic"
        items={[
          { key: "basic", title: "基础信息" },
          { key: "review", title: "评审" }
        ]}
      />
      <FormSection title="基础信息" description="项目空间内通用的字段。">
        <Input label="项目名称" placeholder="请输入项目名称" />
        <Select
          label="负责人"
          placeholder="请选择负责人"
          options={[
            { label: "设计", value: "design" },
            { label: "研发", value: "engineering" }
          ]}
        />
        <Textarea label="范围说明" placeholder="请说明项目范围" />
      </FormSection>
      <div className="demo-actions">
        <Button variant="outline">取消</Button>
        <Button>保存</Button>
      </div>
    </PageLayout>
  );
}
