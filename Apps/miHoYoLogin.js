import config from "../Model/config.js"
import { renderQR } from "../Model/qr-card.js"
import _ from "lodash"
import crypto from "crypto"
import fetch from "node-fetch"
import { setTimeout as delay } from "node:timers/promises"
import { createLoginSession } from "../Model/miHoYo-qr-login.js"
import { refreshLoginAccounts, saveLoginAccount } from "../Model/miHoYo-accounts.js"
import { saveXiaoyaoStoken } from "../Model/xiaoyao-stoken.js"

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
const refreshing = new Set()
const gameNames = new Map([
  ["hk4e_cn", "原神"],
  ["hkrpg_cn", "崩坏：星穹铁道"],
  ["nap_cn", "绝区零"],
  ["bh3_cn", "崩坏3"],
  ["bh2_cn", "崩坏学园2"],
  ["nxx_cn", "未定事件簿"],
])
const refreshMessages = {
  success: "Cookie 刷新成功",
  missingMid: "请求异常：Stoken 缺少 mid，请重新扫码登录",
  changed: "请求异常：Stoken 已变更，请重新刷新",
  failed: "请求异常：Cookie 换票失败，请稍后重试或重新扫码登录",
}
const bindingHelpLine = /(?:^|\r?\n)[ \t]*(?:使用命令说明|更多帮助(?:请)?查看)[ \t]*#云崽帮助[。！!]?[ \t]*(?=\r?\n|$)/g

function removeBindingHelp(message) {
  if (typeof message === "string") return message.replace(bindingHelpLine, "")
  if (Array.isArray(message)) {
    return message.flatMap(part => {
      if (typeof part !== "string" || !part) return [part]
      const text = part.replace(bindingHelpLine, "")
      return text ? [text] : []
    })
  }
  return message
}

export class miHoYoLogin extends plugin {
  constructor() {
    super({
      name: "米哈游登录",
      dsc: "米哈游登录",
      event: "message",
      priority: -11451,
      rule: [
        {
          reg: `(${regex}|^#(扫码|二维码|辅助)(登录|绑定|登陆))(终止)?$`,
          fnc: "miHoYoLoginQRCode",
        },
        {
          reg: /^#(原神|星铁|绝区零)?刷新c(oo)?k(ie)?$/i,
          fnc: "refreshCk",
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

  async refreshCk() {
    const userId = String(this.e.user_id)
    if (refreshing.has(userId)) {
      await this.reply("已有正在进行的 Cookie 刷新")
      return true
    }

    refreshing.add(userId)
    try {
      const results = await refreshLoginAccounts(userId)
      if (!results.length) {
        await this.reply("请先绑定 Stoken\n发送【#扫码登录】绑定米游社账号")
        return true
      }
      const messages = results.map(({ uid, roles, status, cookie }, index) => {
        if (cookie) this.makeMessage(cookie, { silent: true })
        const accounts = roles.map(({ uid, game, region }) => {
          const name = gameNames.get(game)
          return `${name ? `【${name}】` : ""}UID：${uid}${region ? `（${region}）` : ""}`
        })
        if (!accounts.length) accounts.push(this.e.isGroup ? `米游社账号 ${index + 1}` : `米游社账号：${uid}`)
        return [...accounts, refreshMessages[status]].join("\n")
      })
      const success = results.filter(result => result.status === "success").length
      messages.unshift(`刷新CK结果\n共 ${results.length} 个账号，成功 ${success} 个，未完成 ${results.length - success} 个`)
      const contact = this.e.isGroup ? this.e.group : this.e.friend
      let forward
      try {
        forward = typeof contact?.makeForwardMsg === "function"
          ? await contact.makeForwardMsg(messages.map(message => ({ message, nickname: this.e.bot?.nickname, user_id: this.e.self_id })))
          : await Bot.makeForwardArray(messages)
      } catch {}
      await this.reply(forward || messages.join("\n\n"))
    } catch {
      logger.error("[刷新Cookie]刷新失败")
      await this.reply("Cookie刷新失败，请稍后重试或重新扫码登录")
    } finally {
      refreshing.delete(userId)
    }
    return true
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
    const userId = String(this.e.user_id)
    const existing = qrSessions.get(userId)
    const loginButton = segment.button([
      { text: "米哈游登录", callback: "米哈游登录" },
      { text: "米游社登录", callback: "米游社登录" },
    ])
    const expired = ["二维码已过期，请重新登录", loginButton]
    const errorTips = [
      "登录失败，请检查日志\n如果【米哈游登录】无法使用，请尝试【米游社登录】\nhttps://git.trss.me/TRSS-Plugin",
      loginButton,
    ]
    const reply = message => this.reply(message, true, { recallMsg: 60 })

    if (this.e.msg.endsWith("终止")) {
      if (existing) {
        existing.controller.abort()
        qrSessions.delete(userId)
        await reply([`${existing.command}已终止`, loginButton])
      }
      return true
    }

    const chat = JSON.stringify([this.e.self_id, this.e.isGroup ? this.e.group_id : null])
    if (existing || Running[userId]) {
      if (existing?.card && existing.chat === chat) await reply(existing.card)
      else await reply("有正在进行的登录操作，请完成后再试……")
      return true
    }

    const command = this.e.msg.includes("米游社") ? "米游社登录" : "米哈游登录"
    const cancelButton = segment.button([{ text: "终止登录", callback: `${command}终止` }])
    const controller = new AbortController()
    const session = { controller, command, chat }
    const { signal } = controller
    const deadline = setTimeout(() => controller.abort("timeout"), 120_000)
    qrSessions.set(userId, session)

    let stage = "获取二维码"
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
      session.card = ["请使用米游社扫码登录", image, cancelButton]
      if (await reply(session.card) === false) return true

      let scanned = false
      while (!signal.aborted) {
        stage = "查询二维码"
        await delay(5000, undefined, { signal })
        const data = await login.query(ticket)
        signal.throwIfAborted()
        const status = data?.status || data?.stat
        if (status === "Created") continue
        if (status === "Scanned") {
          if (!scanned) {
            scanned = true
            await reply(["二维码已扫描，请确认登录", cancelButton])
          }
          continue
        }
        if (status !== "Confirmed") {
          await reply(expired)
          return true
        }

        stage = "获取绑定凭据"
        const { cookie, stoken, sk } = await login.credentials(data)
        signal.throwIfAborted()
        stage = "保存登录凭据"
        await saveLoginAccount(this.e.user_id, sk, cookie, signal)
        let saved
        try {
          saved = await saveXiaoyaoStoken(this.e.user_id, sk, cookie, signal)
        } catch {
          signal.throwIfAborted()
          logger.warn("[米哈游登录] 无法保存逍遥 Stoken")
        }
        signal.throwIfAborted()
        if (saved === "absent") this.makeMessage(stoken)
        this.makeMessage(cookie, { hideBindingHelp: true })
        if (!saved) await reply("Stoken 保存失败，Cookie 已提交绑定，请检查逍遥数据目录")
        if (saved === "account") await reply("Stoken 已保存到通行证账号，暂未关联游戏 UID")
        if (this.e.isPrivate && !this.e.isGroup) {
          const result = command === "米游社登录"
            ? ["登录完成，以下是 Cookie，将会自动绑定", cookie]
            : ["登录完成，以下分别是 Cookie 和 Stoken，将会自动绑定", cookie, stoken]
          await this.reply(await Bot.makeForwardArray(result))
        }
        return true
      }
      signal.throwIfAborted()
    } catch {
      if (!signal.aborted || signal.reason === "timeout") {
        logger.warn(`[米哈游登录] ${stage}${signal.aborted ? "超时" : "失败"}`)
        await reply(stage === "查询二维码" && !signal.aborted ? expired : errorTips)
      }
    } finally {
      clearTimeout(deadline)
      if (qrSessions.get(userId) === session) qrSessions.delete(userId)
    }
    return true
  }

  makeMessage(msg, { hideBindingHelp = false, silent = false } = {}) {
    Bot.em("message.private.friend", {
      self_id: this.e.self_id,
      message_id: this.e.message_id,
      user_id: this.e.user_id,
      sender: this.e.sender,
      friend: this.e.friend,
      reply: (msg, quote, opts) => {
        if (silent) return false
        const message = hideBindingHelp ? removeBindingHelp(msg) : msg
        if (hideBindingHelp && (message === "" || (Array.isArray(message) && message.length === 0))) return false
        return this.reply(message, quote, { ...opts, recallMsg: 60 })
      },
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
