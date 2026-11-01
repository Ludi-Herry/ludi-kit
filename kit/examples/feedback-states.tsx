import { useState } from "react";
import { Button, ForbiddenState, ImportFlow, PageLayout } from "@ai-readable/kit";

export function ImportFlowExample() {
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<"ready" | "processing" | "success" | "error">("ready");

  return (
    <PageLayout>
      <ImportFlow
        accept=".xml,.xlsx"
        fileName={fileName}
        status={status}
        title="导入解析文件"
        description="选择一个 xml 或 xlsx 文件，校验通过后启用解析规则。"
        helpText="单次导入一个文件，处理期间请保持页面打开。"
        details={status === "success" ? "解析规则已启用。" : status === "error" ? "缺少必填字段 event_type。" : undefined}
        validationError={fileName.endsWith(".txt") ? "仅支持 .xml 或 .xlsx 文件。" : undefined}
        onFileSelect={(file) => setFileName(file?.name ?? "")}
        actions={
          <>
            {status === "error" ? <Button variant="outline" onClick={() => setStatus("ready")}>重新选择</Button> : null}
            {status === "ready" ? <Button disabled={!fileName} onClick={() => setStatus("processing")}>提交导入</Button> : null}
            {status === "processing" ? <Button loading>正在导入</Button> : null}
            {status === "success" ? <Button onClick={() => setStatus("ready")}>返回列表</Button> : null}
          </>
        }
      />
    </PageLayout>
  );
}

export function ForbiddenStateExample() {
  return (
    <PageLayout>
      <ForbiddenState
        description="当前账号缺少 platform:rbac:read 权限。请联系管理员申请，或返回工作台。"
        actions={<Button variant="outline">返回工作台</Button>}
      />
    </PageLayout>
  );
}
