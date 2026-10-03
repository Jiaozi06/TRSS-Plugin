import { renderPath } from "../Model/render-path.js"
import fs from "node:fs/promises"
import File from "../Model/file.js"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"
import MarkdownIt from "markdown-it"
const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

const { htmlDir, tplFile } = renderPath("Markdown")

export class Markdown extends plugin {
  constructor() {
    super({
      name: "Markdown",
      dsc: "Markdown",
      event: "message",
      priority: 10,
      rule: [
        {
          reg: "^md.+",
          fnc: "Markdown",
          permission: "master",
        },
      ],
    })
  }

  async Markdown(e) {
    if (!this.e.isMaster) return false
    const msg = this.e.msg.replace("md", "").trim()
    logger.mark(`[Markdown] 查看：${logger.blue(msg)}`)

    let mdFile = msg
    if (/^https?:\/\//.test(msg)) {
      mdFile = `${process.cwd()}/data/cache.md`
      const ret = await Bot.download(msg, mdFile)
      if (!ret) {
        await this.reply("文件下载错误", true)
        return false
      }
    }

    mdFile = await new File(this).choose(mdFile)
    if (!mdFile) {
      await this.reply("文件不存在", true)
      return false
    }

    const Markdown = md.render(await fs.readFile(mdFile, "utf-8"))
    const img = await puppeteer.screenshot("Markdown", {
      tplFile,
      htmlDir,
      Markdown,
      pageGotoParams: {
        waitUntil: "networkidle2",
      },
    })

    await this.reply(img, true)
  }
}
