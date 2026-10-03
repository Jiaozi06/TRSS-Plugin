import { renderPath } from "../Model/render-path.js"
import { consoleData } from "../Model/console-card.js"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"
import { AnsiUp } from "ansi_up"
const ansi_up = new AnsiUp()

const { htmlDir, tplFile } = renderPath("Code")
const path = `${process.env.HOME}/../`
const cmdPath = `${path}Main.sh`
const errorTips = "请使用脚本安装，再使用此功能\nhttps://git.trss.me/TRSS-Plugin"

export class Script extends plugin {
  constructor() {
    super({
      name: "脚本执行",
      dsc: "脚本执行",
      event: "message",
      priority: -Infinity,
      rule: [
        {
          reg: "^脚本执行.+",
          fnc: "Script",
          permission: "master",
        },
      ],
    })
  }

  async execTask(e, cmd) {
    if (!this.e.isMaster) return false
    const started = Date.now()
    const ret = await Bot.exec(cmd)
    const display = consoleData({
      command: this.e.msg.replace("脚本执行", "").trim(),
      language: "bash",
      failed: !!ret.error,
      duration: Date.now() - started,
    })

    if (ret.stdout) {
      const Code = await ansi_up.ansi_to_html(ret.stdout.trim())
      const img = await puppeteer.screenshot("Code", { ...display, tplFile, htmlDir, Code })
      await this.reply(img, true)
    }

    if (ret.stderr) {
      const Code = await ansi_up.ansi_to_html(ret.stderr.trim())
      const img = await puppeteer.screenshot("Code", {
        ...display,
        stream: "STDERR",
        tplFile,
        htmlDir,
        Code,
      })
      await this.reply(["标准错误输出：", img], true)
    }

    if (ret.error) {
      logger.error(`脚本执行错误：${logger.red(ret.error)}`)
      await this.reply(`脚本执行错误：${ret.error}`, true)
      await this.reply(errorTips)
    }
  }

  async Script(e) {
    if (!this.e.isMaster) return false
    const msg = this.e.msg.replace("脚本执行", "").trim()
    const cmd = ["bash", cmdPath, "cmd", msg]
    await this.execTask(e, cmd)
  }
}
