import hljs from "@highlightjs/cdn-assets/highlight.min.js"

// 仅生成展示数据，不参与命令执行或权限判断。
export function consoleData({
  command = "",
  language = "text",
  failed = false,
  duration,
  title = "",
} = {}) {
  const now = new Date()
  const Command = command
    ? hljs.getLanguage(language)
      ? hljs.highlight(command, { language }).value
      : command.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : ""
  return {
    Command,
    language: language.toUpperCase(),
    title,
    state: failed ? "error" : "success",
    stateLabel: failed ? "ERROR" : "COMPLETE",
    clock: now.toLocaleTimeString("en-GB", { timeZone: "Asia/Shanghai", hour12: false }),
    calendar: now.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
    duration: Number.isFinite(duration) ? `${Math.max(0, Math.round(duration))} ms` : "",
  }
}
