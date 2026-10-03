import QR from "qrcode"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"
import TemplateRenderer from "../../../lib/renderer/Renderer.js"
import { randomUUID } from "node:crypto"
import { unlink } from "node:fs/promises"

const tplFile = "TRSS-Plugin:inline-qr-card"
TemplateRenderer.html[tplFile] = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>
*{box-sizing:border-box}body{margin:0;width:720px;background:#f7f5f0;color:#252b3d;font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif}
#container{width:720px;padding:32px;background:#f7f5f0}.heading{padding:22px 24px;border:1px solid #e8e4dd;border-radius:24px;margin-bottom:22px}.eyebrow{font-size:11px;letter-spacing:3px;color:#a68c7c;margin-bottom:10px}h1{font-size:29px;margin:0 0 10px;letter-spacing:1px}.subtitle{font-size:15px;color:#8d8a85}
.card{background:#fff;border:1px solid #eeebe6;border-radius:24px;padding:26px;box-shadow:0 5px 16px #30271909}.frame{border:3px solid #d99a8d;border-radius:25px;padding:8px;background:#fff}.qr{display:block;width:100%;height:auto}.identity{display:table;margin:24px auto 12px;padding:10px 20px;border-radius:30px;background:#f7f5f1;border:1px solid #ece7df;font-size:14px;color:#9a8d7b}.identity b{color:#756754;letter-spacing:1px}.expiry{text-align:center;color:#aaa398;font-size:13px}
.notes{margin-top:20px;background:#fff;border:1px solid #eeebe6;border-radius:20px;padding:20px 24px;font-size:14px;line-height:1.9;color:#89857f}.notes p{margin:4px 0}.important{color:#b65a4e;font-weight:600}.footer{margin-top:22px;display:flex;justify-content:space-between;font-size:11px;letter-spacing:2px;color:#aaa297}
</style></head><body><main id="container"><header class="heading"><div class="eyebrow">TRSS / {{if login}}ACCOUNT{{else}}QRCODE{{/if}}</div><h1>{{title}}</h1><div class="subtitle">{{subtitle}}</div></header><section class="card"><div class="frame"><img class="qr" src="{{qr}}"></div>{{if identity}}<div class="identity">标识码 &nbsp; <b>{{identity}}</b></div>{{/if}}<div class="expiry">{{if login}}请尽快扫码，过期后重新获取{{else}}长按识别或使用相机扫描{{/if}}</div></section>{{if login}}<section class="notes"><p class="important">· 请核对标识码，仅扫描本人发起的登录二维码。</p><p>· 使用米游社 App 扫码，并在手机上确认登录。</p><p>· 授权凭据将用于机器人账号绑定，请勿转发此二维码。</p><p>· 发送「米哈游登录终止」可取消本次登录。</p></section>{{/if}}<footer class="footer"><span>TRSS PLUGIN</span><span>{{if login}}SCAN & CONFIRM{{else}}SCAN & DISCOVER{{/if}}</span></footer></main></body></html>`

export function qrSvg(text) {
  const { modules } = QR.create(text, { errorCorrectionLevel: "H" })
  const n = modules.size
  const quiet = 4
  const size = n + quiet * 2
  const shapes = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="white"/>`,
  ]
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!modules.get(y, x)) continue
      const finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
      const px = x + quiet,
        py = y + quiet
      if (finder) {
        const localX = x >= n - 7 ? x - (n - 7) : x
        const localY = y >= n - 7 ? y - (n - 7) : y
        const color = localY >= 5 && localX >= 3 ? "#326caa" : "#bd4d40"
        shapes.push(`<rect x="${px}" y="${py}" width="1" height="1" fill="${color}"/>`)
      } else if (modules.isReserved(y, x)) {
        shapes.push(`<rect x="${px}" y="${py}" width="1" height="1" fill="#29354b"/>`)
      } else {
        shapes.push(`<circle cx="${px + 0.5}" cy="${py + 0.5}" r=".48" fill="#252b42"/>`)
      }
    }
  return shapes.join("") + "</svg>"
}

export function cardData(text, { login = false, userId = "", botId = "" } = {}) {
  return {
    login,
    title: login ? "米游社扫码登录" : "二维码",
    subtitle: login ? "用米游社 App 扫码并在手机上确认" : "把信息放进一张清晰的卡片",
    identity: login ? `${botId || "Bot"}:${String(userId)}` : "",
    qr: `data:image/svg+xml;base64,${Buffer.from(qrSvg(text)).toString("base64")}`,
  }
}

export async function renderQR(text, options = {}) {
  const saveId = randomUUID()
  try {
    const image = await puppeteer.screenshot("TRSS-QRCode", {
      ...cardData(text, options),
      tplFile,
      saveId,
      imgType: "png",
      pageGotoParams: { waitUntil: "load", timeout: 30000 },
    })
    if (image) return image
  } catch {
    logger.warn("[TRSS 二维码] 卡片渲染失败，使用标准二维码")
  } finally {
    await unlink(`temp/html/TRSS-QRCode/${saveId}.html`).catch(() => {})
  }
  return segment.image(
    await QR.toBuffer(text, { errorCorrectionLevel: "H", width: 640, margin: 4 }),
  )
}
