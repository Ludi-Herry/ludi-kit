# 主题规则

主题由项目合同和 design pack 决定。当前 kit design pack 定义 `vivid`、`calm` 和 `screen`；其他底座读取各自的主题合同。

## Kit consumer

`AIReadableProvider` 把主题写入根元素的 `data-theme` 属性，Token CSS 按该属性切换：

```tsx
<AIReadableProvider theme="vivid">
  <App />
</AIReadableProvider>
```

`ThemeToggle` 只用于 `vivid` 与 `calm` 的用户切换。`screen` 由态势大屏容器固定声明。

## 其他输出模式

`library-native` 和 `custom-native` 使用项目 `frontendFoundation` 登记的 provider、theme entry 和 reset。不要把 `AIReadableProvider` 强加给其他底座。

## 禁止

- 页面内部另建与项目合同平行的主题状态。
- 把主题值混入业务枚举。
- 用局部硬编码颜色模拟另一个主题。
- 让普通后台页面切换到 `screen`。
