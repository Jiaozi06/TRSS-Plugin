import QR from "qrcode"

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
          fnc: "QRCode"
        }
      ]
    })
  }

  async QRCode(e) {
    const msg = this.e.msg.replace("二维码", "").trim()
    
    if (msg.includes("已扫描") || msg.includes("已失效")) {
      logger.mark(`[二维码生成] 检测到跳过关键词，跳过生成`)
      return false
    }
    
    logger.mark(`[二维码生成] 信息：${logger.blue(msg)}`)
    const img = (await QR.toDataURL(msg)).replace("data:image/png;base64,", "base64://")
    await this.reply(segment.image(img), true)
  }
}
