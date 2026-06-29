import config from "../Model/config.js"
import QR from "qrcode"
import _ from "lodash"
import crypto from "crypto"
import fetch from "node-fetch"
import sharp from "sharp"

const regex = "^#?(米哈?游社?登(录|陆|入)|登(录|陆|入)米哈?游社?)"
const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDDvekdPMHN3AYhm/vktJT+YJr7cI5DcsNKqdsx5DZX0gDuWFuIjzdwButrIYPNmRJ1G8ybDIF7oDW2eEpm5sMbL9zs
9ExXCdvqrn51qELbqj0XxtMTIpaCHFSI50PfPpTFV9Xt/hmyVwokoOXFlAEgCn+Q
CgGs52bFoYMtyi+xEQIDAQAB
-----END PUBLIC KEY-----`

function random_string(n) {
  return _.sampleSize("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", n).join("")
}

function encrypt_data(data) {
  return crypto
    .publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      data,
    )
    .toString("base64")
}

function md5(data) {
  return crypto.createHash("md5").update(data).digest("hex")
}

function genDeviceFp() {
  return md5(crypto.randomUUID()).slice(0, 13)
}

function ds(data) {
  const t = Math.floor(Date.now() / 1000)
  const r = random_string(6)
  const h = md5(`salt=JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS&t=${t}&r=${r}&b=${data}&q=`)
  return `${t},${r},${h}`
}

function request(url, { data, aigis, cookie } = {}) {
  const opts = {}
  if (data) {
    opts.method = "post"
    opts.body = JSON.stringify(data)
  }
  opts.headers = {
    "x-rpc-app_version": "2.104.0",
    DS: ds(opts.body ?? ""),
    "x-rpc-aigis": aigis,
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-rpc-game_biz": "bbs_cn",
    "x-rpc-sys_version": "12",
    "x-rpc-device_id": random_string(16),
    "x-rpc-device_fp": random_string(13),
    "x-rpc-device_name": random_string(16),
    "x-rpc-device_model": random_string(16),
    "x-rpc-app_id": "bll8iq97cem8",
    "x-rpc-client_type": "2",
    "User-Agent": "Hyperion/550 CFNetwork/3860.500.112 Darwin/25.4.0",
    Cookie: cookie,
  }
  return fetch(url, opts)
}

function app_request(url, { data, device_id }) {
  return fetch(url, {
    method: "post",
    body: data ? JSON.stringify(data) : "{}",
    headers: {
      "User-Agent": "Hyperion/551 CFNetwork/3860.500.112 Darwin/25.4.0",
      "Content-Type": "application/json",
      "x-rpc-app_id": "ddxf5dufpuyo",
      "x-rpc-client_type": "3",
      "x-rpc-game_biz": "bbs_cn",
      "x-rpc-device_id": device_id,
      "x-rpc-device_fp": genDeviceFp(),
      "x-rpc-device_name": "HUAWEI Nova",
      "x-rpc-device_model": "Nova 5 Pro",
      "x-rpc-device_os": "Android 12",
      "x-rpc-sdk_version": "2.54.0",
    },
  })
}

const web_headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  "x-rpc-app_id": "bll8iq97cem8",
  "x-rpc-client_type": "4",
  "x-rpc-game_biz": "bbs_cn",
  "x-rpc-device_id": crypto.randomUUID(),
  "x-rpc-device_fp": genDeviceFp(),
  "x-rpc-device_name": "Chrome",
  "x-rpc-device_model": "Chrome 120.0.0.0",
  "x-rpc-device_os": "Windows 10 64-bit",
  "x-rpc-sdk_version": "2.54.0",
}

const errorTips = [
  "登录失败，请检查日志\n如果【米哈游登录】无法使用，请尝试【米游社登录】\nhttps://git.trss.me/TRSS-Plugin",
  segment.button([
    { text: "米哈游登录", callback: "米哈游登录" },
    { text: "米游社登录", callback: "米游社登录" },
  ]),
]
const accounts = {}
const Running = {}

async function makeStyledQR(qrUrl, qqNum, bot) {
  const SIZE = 520
  const BORDER = 28
  const AVATAR_RATIO = 0.22

  const qrBuf = await QR.toBuffer(qrUrl, {
    width: SIZE,
    margin: 2,
    errorCorrectionLevel: "H",
    color: {
      dark: "#1a1a2e",
      light: "#f8faff",
    },
  })

  const CARD = SIZE + BORDER * 2
  const cardBg = Buffer.from(`
    <svg width="${CARD}" height="${CARD}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="#1a1a2e"/>
          <stop offset="50%"  stop-color="#16213e"/>
          <stop offset="100%" stop-color="#0f3460"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect width="${CARD}" height="${CARD}" rx="28" ry="28" fill="url(#bg)"/>
      <rect x="3" y="3" width="${CARD - 6}" height="${CARD - 6}"
            rx="25" ry="25"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            stroke-width="1.5"/>
      <circle cx="40"          cy="40"          r="4" fill="rgba(100,160,255,0.6)" filter="url(#glow)"/>
      <circle cx="${CARD - 40}" cy="40"          r="4" fill="rgba(100,160,255,0.6)" filter="url(#glow)"/>
      <circle cx="40"          cy="${CARD - 40}" r="4" fill="rgba(100,160,255,0.6)" filter="url(#glow)"/>
      <circle cx="${CARD - 40}" cy="${CARD - 40}" r="4" fill="rgba(100,160,255,0.6)" filter="url(#glow)"/>
    </svg>
  `)

  const qrRounded = await sharp(qrBuf)
    .resize(SIZE, SIZE)
    .composite([{
      input: Buffer.from(`
        <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${SIZE}" height="${SIZE}" rx="18" ry="18" fill="white"/>
        </svg>`),
      blend: "dest-in",
    }])
    .png()
    .toBuffer()

  let composite = await sharp({
    create: { width: CARD, height: CARD, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: cardBg },
      { input: qrRounded, left: BORDER, top: BORDER },
    ])
    .png()
    .toBuffer()

  const avatarSize = Math.round(SIZE * AVATAR_RATIO)
  const padding = 9
  const bgSize = avatarSize + padding * 2
  const ringThick = 3

  let avatarComposite
  try {
    let avatarUrl
    try {
      avatarUrl = await bot.pickFriend(qqNum).getAvatarUrl()
    } catch (err) {
      try {
        avatarUrl = await bot.pickMember(qqNum, qqNum).getAvatarUrl()
      } catch (err2) {
        avatarUrl = `http://q1.qlogo.cn/g?b=qq&nk=${qqNum}&s=640`
      }
    }
    
    const avatarResp = await fetch(avatarUrl, { timeout: 10000 })
    if (!avatarResp.ok) throw new Error(`avatar ${avatarResp.status}`)
    const avatarRaw = Buffer.from(await avatarResp.arrayBuffer())

    const circleMask = Buffer.from(
      `<svg><circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2}" fill="white"/></svg>`,
    )
    const avatarCircle = await sharp(avatarRaw)
      .resize(avatarSize, avatarSize, { fit: "cover" })
      .composite([{ input: circleMask, blend: "dest-in" }])
      .png()
      .toBuffer()

    const glowRing = Buffer.from(`
      <svg width="${bgSize}" height="${bgSize}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="${bgSize / 2}" cy="${bgSize / 2}" r="${bgSize / 2 - 1}"
                fill="none"
                stroke="rgba(100,160,255,0.85)"
                stroke-width="${ringThick}"
                filter="url(#glow)"/>
        <circle cx="${bgSize / 2}" cy="${bgSize / 2}" r="${bgSize / 2 - ringThick}"
                fill="white"/>
      </svg>
    `)

    avatarComposite = await sharp({
      create: { width: bgSize, height: bgSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: glowRing },
        { input: avatarCircle, left: padding, top: padding },
      ])
      .png()
      .toBuffer()

  } catch (err) {
    logger.warn(`[makeStyledQR] 头像获取失败 (${qqNum}):`, err.message)
    const fallbackSize = bgSize
    avatarComposite = Buffer.from(`
      <svg width="${fallbackSize}" height="${fallbackSize}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#2e74ff"/>
            <stop offset="100%" stop-color="#0e4ac4"/>
          </linearGradient>
        </defs>
        <circle cx="${fallbackSize / 2}" cy="${fallbackSize / 2}" r="${fallbackSize / 2 - 2}"
                fill="white" stroke="rgba(100,160,255,0.8)" stroke-width="3"/>
        <circle cx="${fallbackSize / 2}" cy="${fallbackSize / 2}" r="${fallbackSize / 2 - 12}"
                fill="url(#fg)"/>
        <text x="${fallbackSize / 2}" y="${fallbackSize / 2 + 7}"
              font-size="${Math.round(fallbackSize * 0.3)}"
              text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold">米</text>
      </svg>
    `)
  }

  const finalOffset = Math.round((CARD - bgSize) / 2)
  const final = await sharp(composite)
    .composite([{ input: avatarComposite, left: finalOffset, top: finalOffset }])
    .png()
    .toBuffer()

  return final
}

export class miHoYoLogin extends plugin {
  constructor() {
    super({
      name: "米哈游登录",
      dsc: "米哈游登录",
      event: "message",
      priority: 10,
      rule: [
        {
          reg: `(${regex}|^#(扫码|二维码|辅助)(登录|绑定|登陆))(终止)?$`,
          fnc: "miHoYoLoginQRCode",
        },
        {
          reg: `${regex}.+$`,
          fnc: "miHoYoLoginDetect",
        },
        {
          reg: "^#?(体力|(c|C)(oo)?k(ie)?|(s|S)(to)?k(en)?)(帮助|教程)$",
          fnc: "miHoYoLoginHelp",
        },
      ],
    })
  }

  miHoYoLoginDetect() {
    accounts[this.e.user_id] = this.e
    this.setContext("miHoYoLogin")
    this.reply("请发送密码", true, { recallMsg: 60 })
  }

  async crack_geetest(gt, challenge) {
    let res
    this.reply(
      `请完成验证：https://challenge.minigg.cn/manual/index.html?gt=${gt}&challenge=${challenge}`,
      true,
      { recallMsg: 60 },
    )
    for (let n = 1; n < 60; n++) {
      await Bot.sleep(5000)
      try {
        res = await fetch(`https://challenge.minigg.cn/manual/?callback=${challenge}`)
        res = await res.json()
        if (res.retcode === 200) return res.data
      } catch (err) {
        logger.error(this.e.logFnc, err)
      }
    }
    this.reply("验证超时", true, { recallMsg: 60 })
    return false
  }

  async miHoYoLogin() {
    if (!this.e.msg) return false
    this.finish("miHoYoLogin")
    if (Running[this.e.user_id]) {
      this.reply("有正在进行的登录操作，请完成后再试……", true, { recallMsg: 60 })
      return false
    }
    Running[this.e.user_id] = true

    const password = this.e.msg.trim()
    this.e = accounts[this.e.user_id]
    const account = this.e.msg.replace(new RegExp(regex), "").trim()

    const data = {
      account: encrypt_data(account),
      password: encrypt_data(password),
    }

    const url = "https://passport-api.miyoushe.com/account/ma-cn-passport/app/loginByPassword"
    let res = await request(url, { data, aigis: "" })
    const aigis_data = JSON.parse(res.headers.get("x-rpc-aigis"))
    res = await res.json()
    logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(res))}`)

    if (res.retcode === -3101) {
      logger.mark("${this.e.logFnc} 正在验证")
      const aigis_captcha_data = JSON.parse(aigis_data.data)
      const challenge = aigis_captcha_data.challenge
      const validate = await this.crack_geetest(aigis_captcha_data.gt, challenge)
      if (validate.geetest_validate) {
        logger.mark("${this.e.logFnc} 验证成功")
      } else {
        logger.error("${this.e.logFnc} 验证失败")
        Running[this.e.user_id] = false
        return false
      }

      const aigis =
        aigis_data.session_id +
        ";" +
        Buffer.from(
          JSON.stringify({
            geetest_challenge: challenge,
            geetest_seccode: validate.geetest_validate + "|jordan",
            geetest_validate: validate.geetest_validate,
          }),
        ).toString("base64")

      res = await request(url, { data, aigis })
      res = await res.json()
      logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(res))}`)
    }

    if (res.retcode !== 0) {
      this.reply(`错误：${JSON.stringify(res)}`, true, { recallMsg: 60 })
      Running[this.e.user_id] = false
      return false
    }
    const stoken = `stoken=${res.data.token.token};stuid=${res.data.user_info.aid};mid=${res.data.user_info.mid}`

    let cookie = await request(
      `https://passport-api.miyoushe.com/account/auth/api/getCookieAccountInfoBySToken?stoken=${res.data.token.token}&uid=${res.data.user_info.aid}`,
      { cookie: stoken },
    )
    cookie = await cookie.json()
    logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(cookie))}`)
    cookie = [
      `ltoken=${res.data.token.token};ltuid=${res.data.user_info.aid};cookie_token=${cookie.data.cookie_token};login_ticket=${res.data.login_ticket}`,
      stoken,
    ]
    for (const i of cookie) this.makeMessage(i)
    if (this.e.isPrivate)
      this.reply(
        await Bot.makeForwardArray([
          "登录完成，以下分别是 Cookie 和 Stoken，将会自动绑定",
          ...cookie,
        ]),
      )

    Running[this.e.user_id] = false
  }

  async miHoYoLoginQRCode() {
    if (this.e.msg.includes("终止")) {
      Running[this.e.user_id] = false
      return true
    }

    if (Running[this.e.user_id])
      return this.reply(
        [
          "请使用米游社扫码登录",
          Running[this.e.user_id],
          segment.button([{ text: "终止登录", callback: "米哈游登录终止" }]),
        ],
        true,
        {
          recallMsg: 60,
        },
      )
    Running[this.e.user_id] = true

    if (this.e.msg.includes("米游社")) return this.HyperionLogin()

    const device_id = random_string(16)
    let res, ticket
    try {
      res = await app_request(
        "https://passport-api.miyoushe.com/account/ma-cn-passport/app/createQRLogin",
        { device_id },
      )
      res = await res.json()
      logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(res))}`)

      const url = res.data.url
      ticket = res.data.ticket

      const qrPngBuf = await makeStyledQR(url, this.e.user_id, this.e.bot)
      const img = segment.image(`base64://${qrPngBuf.toString("base64")}`)

      Running[this.e.user_id] = img
      this.reply(
        [
          "请使用米游社扫码登录",
          img,
          segment.button([{ text: "终止登录", callback: "米哈游登录终止" }]),
        ],
        true,
        { recallMsg: 60 },
      )
    } catch (err) {
      Running[this.e.user_id] = false
      return logger.error(this.e.logFnc, err)
    }

    let data, Scanned
    for (let n = 1; n < 60; n++) {
      await Bot.sleep(5000)
      if (Running[this.e.user_id] === false)
        return this.reply(
          [
            "米哈游登录已终止",
            segment.button([
              { text: "米哈游登录", callback: "米哈游登录" },
              { text: "米游社登录", callback: "米游社登录" },
            ]),
          ],
          true,
          { recallMsg: 60 },
        )
      try {
        res = await app_request(
          "https://passport-api.miyoushe.com/account/ma-cn-passport/app/queryQRLoginStatus",
          {
            device_id,
            data: { ticket },
          },
        )
        res = await res.json()

        if (res.retcode !== 0) {
          Running[this.e.user_id] = false
          return this.reply(
            [
              "二维码已过期，请重新登录",
              segment.button([
                { text: "米哈游登录", callback: "米哈游登录" },
                { text: "米游社登录", callback: "米游社登录" },
              ]),
            ],
            true,
            { recallMsg: 60 },
          )
        }

        if (res.data.status === "Scanned" && !Scanned) {
          logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(res))}`)
          Scanned = true
          this.reply(
            [
              "二维码已扫描，请确认登录",
              segment.button([{ text: "终止登录", callback: "米哈游登录终止" }]),
            ],
            true,
            { recallMsg: 60 },
          )
        }

        if (res.data.status === "Confirmed") {
          logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(res))}`)
          break
        }
      } catch (err) {
        logger.error(this.e.logFnc, err)
      }
    }
    Running[this.e.user_id] = false

    const cookie = []
    try {
      if (!(res.data?.tokens && res.data?.user_info))
        return this.reply(errorTips, true, { recallMsg: 60 })

      const uid = res.data.user_info.aid || res.data.user_info.uid || res.data.user_info.account_id,
        token = (
          res.data.tokens.find(i => i.name === "stoken" || i.name === "stoken_v2") ||
          res.data.tokens[0]
        )?.token,
        mid = res.data.user_info.mid
      if (!(uid && token && mid)) return this.reply(errorTips, true, { recallMsg: 60 })

      cookie.push(`stoken=${token};stuid=${uid};mid=${mid}`)
      res = await request(
        `https://passport-api.miyoushe.com/account/auth/api/getCookieAccountInfoBySToken?stoken=${token}&uid=${uid}&mid=${mid}`,
        { cookie: cookie[0] },
      )
      res = await res.json()
      logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(res))}`)

      if (!res.data?.cookie_token) return this.reply(errorTips, true, { recallMsg: 60 })
      cookie.push(`ltoken=${token};ltuid=${uid};cookie_token=${res.data.cookie_token}`)
    } catch (err) {
      logger.error(this.e.logFnc, err)
      return this.reply(errorTips, true, { recallMsg: 60 })
    }

    for (const i of cookie) this.makeMessage(i)
    if (this.e.isPrivate)
      this.reply(
        await Bot.makeForwardArray([
          "登录完成，以下分别是 Cookie 和 Stoken，将会自动绑定",
          ...cookie,
        ]),
      )
  }

  async HyperionLogin() {
    let res, ticket
    try {
      res = await fetch(
        "https://passport-api.miyoushe.com/account/ma-cn-passport/web/createQRLogin",
        { headers: web_headers, method: "post", body: "{}" },
      )
      res = await res.json()
      logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(res))}`)

      const url = res.data.url
      ticket = res.data.ticket

      const qrPngBuf = await makeStyledQR(url, this.e.user_id, this.e.bot)
      const img = segment.image(`base64://${qrPngBuf.toString("base64")}`)

      Running[this.e.user_id] = img
      this.reply(
        [
          "请使用米游社扫码登录",
          img,
          segment.button([{ text: "终止登录", callback: "米游社登录终止" }]),
        ],
        true,
        { recallMsg: 60 },
      )
    } catch (err) {
      Running[this.e.user_id] = false
      logger.error(this.e.logFnc, err)
      return this.reply(errorTips, true, { recallMsg: 60 })
    }

    let cookie, Scanned
    for (let n = 1; n < 60; n++) {
      await Bot.sleep(5000)
      if (Running[this.e.user_id] === false)
        return this.reply(
          [
            "米游社登录已终止",
            segment.button([
              { text: "米哈游登录", callback: "米哈游登录" },
              { text: "米游社登录", callback: "米游社登录" },
            ]),
          ],
          true,
          { recallMsg: 60 },
        )
      try {
        res = await fetch(
          "https://passport-api.miyoushe.com/account/ma-cn-passport/web/queryQRLoginStatus",
          { headers: web_headers, method: "post", body: JSON.stringify({ ticket }) },
        )
        cookie = res.headers.getSetCookie()
        res = await res.json()

        if (res.retcode !== 0) {
          Running[this.e.user_id] = false
          return this.reply(
            [
              "二维码已过期，请重新登录",
              segment.button([
                { text: "米哈游登录", callback: "米哈游登录" },
                { text: "米游社登录", callback: "米游社登录" },
              ]),
            ],
            true,
            { recallMsg: 60 },
          )
        }

        if (res.data.status === "Scanned" && !Scanned) {
          logger.mark(`${this.e.logFnc} ${logger.blue(JSON.stringify(res))}`)
          Scanned = true
          this.reply(
            [
              "二维码已扫描，请确认登录",
              segment.button([{ text: "终止登录", callback: "米游社登录终止" }]),
            ],
            true,
            { recallMsg: 60 },
          )
        }

        if (res.data.status === "Confirmed") {
          logger.mark(
            `${this.e.logFnc} ${logger.blue(JSON.stringify(res))} ${logger.green(JSON.stringify(cookie))}`,
          )
          break
        }
      } catch (err) {
        logger.error(this.e.logFnc, err)
      }
    }
    Running[this.e.user_id] = false

    if (!cookie?.length) return this.reply(errorTips, true, { recallMsg: 60 })

    const seen = new Set()
    cookie = cookie
      .map(i => i.split(";")[0])
      .filter(c => {
        if (!c.includes("=")) return false
        const [name] = c.split("=")
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
      .join(";")
    this.makeMessage(cookie)
    if (this.e.isPrivate)
      this.reply(await Bot.makeForwardArray(["登录完成，以下是 Cookie，将会自动绑定", cookie]))
  }

  makeMessage(msg) {
    Bot.em("message.private.friend", {
      self_id: this.e.self_id,
      message_id: this.e.message_id,
      user_id: this.e.user_id,
      sender: this.e.sender,
      friend: this.e.friend,
      reply: (msg, quote, opts) => this.reply(msg, quote, { ...opts, recallMsg: 60 }),
      post_type: "message",
      message_type: "private",
      sub_type: "friend",
      message: [{ type: "text", text: msg }],
      raw_message: msg,
    })
  }

  miHoYoLoginHelp() {
    if (!config.miHoYoLogin.help) return false
    this.reply(
      [
        "优先发送【米哈游登录】\n如果无法登录发送【米游社登录】",
        segment.button([
          { text: "米哈游登录", callback: "米哈游登录" },
          { text: "米游社登录", callback: "米游社登录" },
        ]),
      ],
      true,
    )
  }
}
