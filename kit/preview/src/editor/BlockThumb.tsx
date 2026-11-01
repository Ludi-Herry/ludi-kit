// 替换候选的缩略图页（/editor/block-thumb?template=id）：在自己的 iframe 文档里用小豆盒主题与页面样式渲染候选模板，
// 右栏候选卡把它整页缩小当预览图。只读展示，不接收也不发任何消息。

import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import "../../../projects/tianshu-device-ops/generated/styles.css";
import { deviceOpsComponentStyles, deviceOpsTheme } from "../../../projects/tianshu-device-ops/theme";
import { templateById } from "./block-templates";

export default function BlockThumb() {
  const id = new URLSearchParams(window.location.search).get("template") ?? "";
  const template = templateById(id);
  return (
    <ConfigProvider {...deviceOpsComponentStyles} button={{ ...deviceOpsComponentStyles.button, autoInsertSpace: false }} locale={zhCN} theme={deviceOpsTheme}>
      <div className="device-ops-shell" style={{ boxSizing: "border-box", minHeight: "100vh", padding: 16, pointerEvents: "none" }}>
        <div className="device-ops-stack">{template ? template.render() : null}</div>
      </div>
    </ConfigProvider>
  );
}
