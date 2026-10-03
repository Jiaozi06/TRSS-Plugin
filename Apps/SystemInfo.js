import { renderPath } from "../Model/render-path.js"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"
import { AnsiUp } from "ansi_up"
import os from "node:os"
import { pbkdf2 } from "node:crypto"
import { promisify } from "node:util"

const ansi = new AnsiUp()
const { htmlDir, tplFile } = renderPath("Code")
let running = false

export class SystemInfo extends plugin {
  constructor() {
    super({
      name: "系统信息",
      dsc: "本机系统信息与轻量测试",
      event: "message",
      priority: 10,
      rule: [
        { reg: "^#?系统信息$", fnc: "SystemInfo", permission: "master" },
        { reg: "^#?系统信息图片$", fnc: "SystemInfoPic", permission: "master" },
        { reg: "^#?系统测试$", fnc: "SystemBench", permission: "master" },
      ],
    })
  }
  info() {
    return [
      `系统  ${os.type()} ${os.release()} · ${os.arch()}`,
      `处理器  ${os.cpus()[0]?.model || "未知"} · ${os.cpus().length} 核`,
      `内存  可用 ${(os.freemem() / 2 ** 30).toFixed(2)} / ${(os.totalmem() / 2 ** 30).toFixed(2)} GB`,
      `运行时  Node.js ${process.version}`,
      `系统运行  ${(os.uptime() / 3600).toFixed(1)} 小时`,
    ].join("\n")
  }
  async picture(text, title) {
    if (!this.e.isMaster) return false
    const img = await puppeteer.screenshot("TRSS-SystemInfo", {
      tplFile,
      htmlDir,
      Code: ansi.ansi_to_html(text),
      title,
    })
    return this.reply(img || text, true)
  }
  SystemInfo() {
    if (!this.e.isMaster) return false
    return this.reply(this.info(), true)
  }
  SystemInfoPic() {
    if (!this.e.isMaster) return false
    return this.picture(this.info(), "系统信息")
  }
  async SystemBench() {
    if (!this.e.isMaster) return false
    if (running) return this.reply("正在测试，请稍等……", true)
    running = true
    try {
      const start = performance.now()
      await promisify(pbkdf2)("TRSS-local-benchmark", "local-only", 100000, 32, "sha256")
      return await this.picture(
        `${this.info()}\n\nPBKDF2-SHA256 · 100,000 次\n耗时  ${(performance.now() - start).toFixed(1)} ms\n\n轻量本机测试，不代表完整性能评分。`,
        "本机性能测试",
      )
    } finally {
      running = false
    }
  }
}
