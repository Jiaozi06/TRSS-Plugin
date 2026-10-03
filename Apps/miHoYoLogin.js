import config from "../Model/config.js"
import crypto from "node:crypto"
import fetch from "node-fetch"
import { renderQR } from "../Model/qr-card.js"

const regex = "^#?(米哈?游社?登(录|陆|入)|登(录|陆|入)米哈?游社?)"
const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDDvekdPMHN3AYhm/vktJT+YJr7cI5DcsNKqdsx5DZX0gDuWFuIjzdwButrIYPNmRJ1G8ybDIF7oDW2eEpm5sMbL9zs
9ExXCdvqrn51qELbqj0XxtMTIpaCHFSI50PfPpTFV9Xt/hmyVwokoOXFlAEgCn+Q
CgGs52bFoYMtyi+xEQIDAQAB
-----END PUBLIC KEY-----`

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

function ds(data) {
  const t = Math.floor(Date.now() / 1000)
  const r = random(6)
  const h = md5(`salt=JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS&t=${t}&r=${r}&b=${data}&q=`)
  return `${t},${r},${h}`
}

function request(url, { data, aigis, cookie } = {}) {
  const opts = { redirect: "error", signal: AbortSignal.timeout(15000) }
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
    "x-rpc-device_id": random(16),
    "x-rpc-device_fp": random(13),
    "x-rpc-device_name": random(16),
    "x-rpc-device_model": random(16),
    "x-rpc-app_id": "bll8iq97cem8",
    "x-rpc-client_type": "2",
    "User-Agent": "Hyperion/550 CFNetwork/3860.500.112 Darwin/25.4.0",
    Cookie: cookie,
  }
  return fetch(url, opts)
}

const api = "https://passport-api.mihoyo.com"
const sessions = new Map()
const random = n => crypto.randomBytes(n).toString("hex").slice(0, n)
const keyOf = e => `${e.self_id}:${e.user_id}`

async function json(response) {
  if (!response.ok) throw new Error("登录服务响应失败")
  const result = await response.json()
  if (result.retcode !== 0) throw new Error("登录请求失败或二维码过期")
  return result.data
}

function appRequest(path, deviceId, data = {}) {
  return fetch(`${api}/account/ma-cn-passport/app/${path}`, {
    method: "POST",
    body: JSON.stringify(data),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "HYPContainer/1.3.3.182",
      "x-rpc-app_id": "ddxf5dufpuyo",
      "x-rpc-client_type": "3",
      "x-rpc-device_id": deviceId,
    },
  })
}

function webRequest(path, deviceId, data = {}) {
  return fetch(`${api}/account/ma-cn-passport/web/${path}`, {
    method: "POST",
    body: JSON.stringify(data),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "x-rpc-app_id": "bll8iq97cem8",
      "x-rpc-device_id": deviceId,
    },
  })
}

async function cookieFromToken(token, uid, mid) {
  const t = Math.floor(Date.now() / 1000),
    r = random(6)
  const hash = crypto
    .createHash("md5")
    .update(`salt=JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS&t=${t}&r=${r}&b=&q=`)
    .digest("hex")
  const query = new URLSearchParams({ stoken: token, uid, mid })
  return json(
    await fetch(`${api}/account/auth/api/getCookieAccountInfoBySToken?${query}`, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "x-rpc-app_version": "2.104.0",
        DS: `${t},${r},${hash}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-rpc-game_biz": "bbs_cn",
        "x-rpc-sys_version": "12",
        "x-rpc-device_id": random(16),
        "x-rpc-device_fp": random(13),
        "x-rpc-device_name": random(16),
        "x-rpc-device_model": random(16),
        "x-rpc-app_id": "bll8iq97cem8",
        "x-rpc-client_type": "2",
        "User-Agent": "Hyperion/550 CFNetwork/3860.500.112 Darwin/25.4.0",
        Cookie: `stoken=${token};stuid=${uid};mid=${mid}`,
      },
    }),
  )
}

export class miHoYoLogin extends plugin {
  constructor() {
    super({
      name: "米哈游登录",
      dsc: "扫码及账号密码登录",
      event: "message",
      priority: 10,
      rule: [
        {
          reg: `(${regex}|^#(扫码|二维码|辅助)(登录|绑定|登陆))(终止)?$`,
          fnc: "miHoYoLoginQRCode",
          log: false,
        },
        { reg: `${regex}.+$`, fnc: "miHoYoLoginDetect", log: false },
        { reg: "^#?(体力|(c|C)(oo)?k(ie)?|(s|S)(to)?k(en)?)(帮助|教程)$", fnc: "miHoYoLoginHelp" },
      ],
    })
  }

  miHoYoLoginDetect() {
    if (sessions.has(keyOf(this.e)))
      return this.reply("有正在进行的登录操作，请完成或终止后再试。", true)
    this.setContext("miHoYoLogin", false, 120)
    return this.reply("请发送密码", true, { recallMsg: 60 })
  }

  async crack_geetest(gt, challenge, session) {
    const query = new URLSearchParams({ gt, challenge })
    await this.reply(`请完成验证：https://challenge.minigg.cn/manual/index.html?${query}`, true, {
      recallMsg: 60,
    })
    for (let n = 1; n < 60 && session.active && Date.now() < session.expires; n++) {
      await Bot.sleep(5000)
      if (!session.active) return false
      try {
        const response = await fetch(
          `https://challenge.minigg.cn/manual/?${new URLSearchParams({ callback: challenge })}`,
          {
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          },
        )
        const result = await response.json()
        if (!session.active) return false
        if (result.retcode === 200 && result.data?.geetest_validate) return result.data
      } catch {
        // 保留原中转流程，网络异常不输出包含验证参数的完整错误。
      }
    }
    if (session.active) await this.reply("验证超时，请重新登录。", true, { recallMsg: 60 })
    return false
  }

  async miHoYoLogin(context) {
    if (!this.e.msg) return false
    if (!context || keyOf(context) !== keyOf(this.e) || context.group_id !== this.e.group_id)
      return this.reply("请在发起登录的会话中发送密码。", true, { recallMsg: 60 })
    this.finish("miHoYoLogin")
    if (new RegExp(`${regex}(终止)?$`).test(this.e.msg)) return this.miHoYoLoginQRCode()
    const key = keyOf(this.e)
    if (sessions.has(key)) return this.reply("有正在进行的登录操作，请完成或终止后再试。", true)
    const session = { active: true, expires: Date.now() + 300000 }
    sessions.set(key, session)
    const password = this.e.msg.trim()
    const account = context.msg.replace(new RegExp(regex), "").trim()
    this.e = context
    try {
      const data = { account: encrypt_data(account), password: encrypt_data(password) }
      const url = `${api}/account/ma-cn-passport/app/loginByPassword`
      let response = await request(url, { data, aigis: "" })
      const challengeHeader = response.headers.get("x-rpc-aigis")
      let result = await response.json()
      if (!session.active) return true
      if (result.retcode === -3101) {
        const aigisData = JSON.parse(challengeHeader)
        const captcha =
          typeof aigisData.data === "string" ? JSON.parse(aigisData.data) : aigisData.data
        const validate = await this.crack_geetest(captcha.gt, captcha.challenge, session)
        if (!validate || !session.active) return true
        const aigis = `${aigisData.session_id};${Buffer.from(
          JSON.stringify({
            geetest_challenge: captcha.challenge,
            geetest_seccode: `${validate.geetest_validate}|jordan`,
            geetest_validate: validate.geetest_validate,
          }),
        ).toString("base64")}`
        response = await request(url, { data, aigis })
        result = await response.json()
      }
      if (!session.active) return true
      if (result.retcode !== 0) throw new Error("登录失败")
      const { token, user_info: user, login_ticket: ticket } = result.data || {}
      if (!token?.token || !user?.aid || !user.mid) throw new Error("未取得授权凭据")
      const cookie = await cookieFromToken(token.token, String(user.aid), user.mid)
      if (!cookie?.cookie_token) throw new Error("未取得 Cookie")
      if (!session.active) return true
      const credentials = [
        `ltoken=${token.token};ltuid=${user.aid};cookie_token=${cookie.cookie_token}${ticket ? `;login_ticket=${ticket}` : ""}`,
        `stoken=${token.token};stuid=${user.aid};mid=${user.mid}`,
      ]
      for (const credential of credentials) this.makeMessage(credential)
      await this.reply("登录完成，已提交账号绑定。", true, { recallMsg: 60 })
    } catch {
      if (session.active)
        await this.reply("账号密码登录失败，请检查输入或重新完成验证。", true, { recallMsg: 60 })
    } finally {
      if (sessions.get(key) === session) sessions.delete(key)
      session.active = false
    }
    return true
  }

  async miHoYoLoginQRCode() {
    const key = keyOf(this.e)
    const previous = sessions.get(key)
    if (this.e.msg.includes("终止")) {
      if (previous) previous.active = false
      sessions.delete(key)
      return this.reply("本次登录已终止。", true)
    }
    if (previous)
      return this.reply(previous.image || "有正在进行的登录操作，请稍等或终止后重试。", true, {
        recallMsg: 60,
      })
    const session = { active: true, deviceId: random(16), expires: Date.now() + 180000 }
    sessions.set(key, session)
    try {
      await this.login(session, this.e.msg.includes("米游社"))
    } catch {
      // 响应、异常 URL、Cookie、Stoken 和 ticket 均不写入日志或回显。
      if (session.active)
        await this.reply("登录失败或二维码已过期，请重新发起扫码登录。", true, { recallMsg: 60 })
    } finally {
      if (sessions.get(key) === session) sessions.delete(key)
      session.active = false
    }
    return true
  }

  async login(session, web) {
    const request = web ? webRequest : appRequest
    const created = await json(await request("createQRLogin", session.deviceId))
    if (!created?.url || !created.ticket || new URL(created.url).protocol !== "https:")
      throw new Error("无有效二维码")
    const image = await renderQR(created.url, {
      login: true,
      userId: this.e.user_id,
      botId: this.e.self_id,
    })
    if (!session.active) return
    session.image = image
    await this.reply(image, true, { recallMsg: 180 })
    let scanned = false
    while (session.active && Date.now() < session.expires) {
      await Bot.sleep(5000)
      if (!session.active) return
      const response = await request("queryQRLoginStatus", session.deviceId, {
        ticket: created.ticket,
      })
      const result = await json(response)
      if (!session.active) return
      if (result.status === "Scanned" && !scanned) {
        scanned = true
        await this.reply("二维码已扫描，请在手机上确认登录。", true, { recallMsg: 60 })
      }
      if (result.status !== "Confirmed") continue
      let credentials
      if (web) {
        const cookies =
          response.headers.getSetCookie?.() || response.headers.raw?.()["set-cookie"] || []
        const cookie = cookies.map(value => value.split(";")[0]).join(";")
        if (!cookie || !/(?:cookie_token|ltoken)=/.test(cookie)) throw new Error("未取得授权凭据")
        credentials = [cookie]
      } else {
        const uid = result.user_info?.aid || result.user_info?.uid || result.user_info?.account_id
        const mid = result.user_info?.mid
        const token = result.tokens?.find(
          value => value.name === "stoken" || value.name === "stoken_v2",
        )?.token
        if (!uid || !mid || !token) throw new Error("未取得授权凭据")
        const cookie = await cookieFromToken(token, String(uid), mid)
        if (!cookie?.cookie_token) throw new Error("未取得 Cookie")
        credentials = [
          `stoken=${token};stuid=${uid};mid=${mid}`,
          `ltoken=${token};ltuid=${uid};cookie_token=${cookie.cookie_token}`,
        ]
      }
      if (!session.active) return
      for (const credential of credentials) this.makeMessage(credential)
      await this.reply("扫码授权完成，已提交账号绑定。", true, { recallMsg: 60 })
      return
    }
    if (session.active)
      await this.reply("二维码已过期，请重新发起扫码登录。", true, { recallMsg: 60 })
  }

  makeMessage(msg) {
    // 沿用云崽的本机绑定事件；凭据仅交给已安装的账号绑定插件。
    Bot.em("message.private.friend", {
      self_id: this.e.self_id,
      message_id: this.e.message_id,
      user_id: this.e.user_id,
      sender: this.e.sender,
      friend: this.e.friend,
      reply: (message, quote, opts) => this.reply(message, quote, { ...opts, recallMsg: 60 }),
      post_type: "message",
      message_type: "private",
      sub_type: "friend",
      message: [{ type: "text", text: msg }],
      raw_message: msg,
    })
  }

  miHoYoLoginHelp() {
    if (!config.miHoYoLogin.help) return false
    return this.reply(
      "扫码登录：发送「米哈游登录」或「米游社登录」。\n账号密码登录：发送「米哈游登录 + 账号」，再按提示发送密码；需要验证时打开提示的验证码链接。",
      true,
    )
  }
}
