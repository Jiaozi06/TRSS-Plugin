// 仅解析引号和空格，不执行变量替换、管道或 shell 表达式。
export function parseArgs(text) {
  const args = []
  let token = "",
    quote = "",
    started = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === "\\" && (text[i + 1] === quote || text[i + 1] === "\\")) {
      token += text[++i]
      started = true
    } else if (quote) {
      if (char === quote) quote = ""
      else token += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started) args.push(token)
      token = ""
      started = false
    } else {
      token += char
      started = true
    }
  }
  if (quote) throw new Error("参数引号未闭合")
  if (started) args.push(token)
  return args
}
