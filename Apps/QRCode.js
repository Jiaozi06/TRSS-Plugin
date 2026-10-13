import { renderQR } from "../Model/qr-card.js"

export class QRCode extends plugin {
  constructor() {
    super({
      name: "二维码生成",
      dsc: "二维码生成",
      event: "message",
      priority: 10,
      rule: [
        {
          reg: "^二维码.+",
          fnc: "QRCode",
        },
      ],
    })
  }

  async QRCode(e) {
    // 忽略其他机器人发送的二维码过期提示。
    if (this.e.msg.includes("二维码已过期")) return false
    const msg = this.e.msg.replace("二维码", "").trim()
    await this.reply(await renderQR(msg), true)
  }
}
