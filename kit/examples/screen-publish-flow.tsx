import { useState } from "react";
import { Badge, Button, Card, FormSection, Input, PageHeader, PageLayout, Stepper } from "@ai-readable/kit";

export function ScreenPublishFlowExample() {
  const [step, setStep] = useState("template");
  const steps = [
    { key: "template", title: "选择模板" },
    { key: "config", title: "页面配置" },
    { key: "review", title: "检查与投放" }
  ];

  return (
    <PageLayout>
      <PageHeader title="大屏投放" description="三步完成模板选择、配置与检查。" />
      <Stepper items={steps} currentKey={step} />
      {step === "template" ? <Card title="安全监控模板"><Button onClick={() => setStep("config")}>使用模板</Button></Card> : null}
      {step === "config" ? <FormSection title="页面配置"><Input label="页面名称" /><Button onClick={() => setStep("review")}>检查配置</Button></FormSection> : null}
      {step === "review" ? <Card title="投放检查"><Badge variant="warning">等待投放 API 接入</Badge><Button disabled>开始投放</Button></Card> : null}
    </PageLayout>
  );
}
