import config from "../Model/config.js"
import { renderQR } from "../Model/qr-card.js"
import _ from "lodash"
import crypto from "crypto"
import fetch from "node-fetch"
import { setTimeout as delay } from "node:timers/promises"
import { createLoginSession } from "../Model/miHoYo-qr-login.js"

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

const accounts = {}
const Running = {}
const qrSessions = new Map()

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
    if (Running[this.e.user_id] || qrSessions.has(String(this.e.user_id))) {
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

    const url = "https://passport-api.mihoyo.com/account/ma-cn-passport/app/loginByPassword"
    let res = await request(url, { data, aigis: "" })
    const aigis_data = JSON.parse(res.headers.get("x-rpc-aigis"))
    res = await res.json()
    logger.mark(`${this.e.logFnc} 登录接口响应已收到`)

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
      logger.mark(`${this.e.logFnc} 登录接口响应已收到`)
    }

    if (res.retcode !== 0) {
      this.reply(`错误：${JSON.stringify(res)}`, true, { recallMsg: 60 })
      Running[this.e.user_id] = false
      return false
    }
    const stoken = `stoken=${res.data.token.token};stuid=${res.data.user_info.aid};mid=${res.data.user_info.mid}`

    let cookie = await request(
      `https://passport-api.mihoyo.com/account/auth/api/getCookieAccountInfoBySToken?stoken=${res.data.token.token}&uid=${res.data.user_info.aid}`,
      { cookie: stoken },
    )
    cookie = await cookie.json()
    logger.mark(`${this.e.logFnc} 登录接口响应已收到`)
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
    if (this.e.isGroup || !this.e.isPrivate) {
      await this.reply("请私聊发送「米哈游登录」")
      return true
    }

    const userId = String(this.e.user_id)
    const existing = qrSessions.get(userId)
    if (this.e.msg.endsWith("终止")) {
      if (existing) {
        existing.controller.abort()
        qrSessions.delete(userId)
        await this.reply("扫码登录已终止")
      } else {
        await this.reply("当前没有待确认的扫码登录")
      }
      return true
    }

    if (existing || Running[userId]) {
      await this.reply("有正在进行的登录操作，请完成后再试")
      return true
    }

    const controller = new AbortController()
    const session = { controller }
    const { signal } = controller
    const deadline = setTimeout(() => controller.abort("timeout"), 120_000)
    qrSessions.set(userId, session)

    const cancelButton = segment.button([{ text: "终止登录", callback: "米哈游登录终止" }])
    let failure = "获取二维码失败"
    try {
      const login = createLoginSession(signal)
      const { url, ticket } = await login.create()
      const image = await renderQR(url, {
        login: true,
        userId: this.e.user_id,
        botId: this.e.self_id,
        style: config.miHoYoLogin.qrStyle,
      })
      signal.throwIfAborted()
      const sent = await this.reply(
        ["请使用米游社扫码，并在手机上确认登录", image, cancelButton],
        true,
        { recallMsg: 120 },
      )
      if (sent === false) return true

      let scanned = false
      while (!signal.aborted) {
        failure = "二维码查询失败或已过期"
        await delay(5000, undefined, { signal })
        const data = await login.query(ticket)
        signal.throwIfAborted()
        const status = data?.status || data?.stat
        if (status === "Created") continue
        if (status === "Scanned") {
          if (!scanned) {
            scanned = true
            await this.reply(["二维码已扫描，请确认登录", cancelButton], true, { recallMsg: 60 })
          }
          continue
        }
        if (status !== "Confirmed") {
          await this.reply("二维码已失效或登录已取消，请重新发送「米哈游登录」")
          return true
        }

        failure = "扫码已确认，但获取绑定凭据失败"
        const { cookie, stoken } = await login.credentials(data)
        signal.throwIfAborted()
        // 沿用宿主私聊绑定事件，交由已安装的 Cookie / Stoken 插件处理。
        this.makeMessage(stoken)
        this.makeMessage(cookie)
        await this.reply(
          await Bot.makeForwardArray(["扫码登录完成，已提交自动绑定。以下是 Cookie 和 Stoken。", cookie, stoken]),
          true,
          { recallMsg: 60 },
        )
        return true
      }
      signal.throwIfAborted()
    } catch {
      if (signal.reason === "timeout") {
        await this.reply("扫码登录超时，请重新发送「米哈游登录」")
      } else if (!signal.aborted) {
        await this.reply(`${failure}，请重新发送「米哈游登录」`)
      }
    } finally {
      clearTimeout(deadline)
      if (qrSessions.get(userId) === session) qrSessions.delete(userId)
    }
    return true
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
        "请私聊发送【米哈游登录】或【米游社登录】，并使用米游社扫码",
        segment.button([
          { text: "米哈游登录", callback: "米哈游登录" },
          { text: "米游社登录", callback: "米游社登录" },
        ]),
      ],
      true,
    )
  }
}
