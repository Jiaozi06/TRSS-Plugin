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
    const msg = this.e.msg.replace("二维码", "").trim()
    await this.reply(await renderQR(msg), true)
  }
}
