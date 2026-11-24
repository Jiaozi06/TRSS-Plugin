import crypto from "node:crypto"
import fetch from "node-fetch"

const qrApi = "https://passport-api.miyoushe.com/account/ma-cn-passport/app"
const exchangeApi = "https://passport-api.mihoyo.com/account/ma-cn-session/app/exchange"
const appId = "bll8iq97cem8"
const appVersion = "2.119.0"
const sdkVersion = "2.44.0"

async function post(url, headers, body, signal, stage) {
  let result
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
      redirect: "error",
      signal,
    })
    if (!response.ok) throw new Error()
    result = await response.json()
  } catch {
    if (signal.aborted) throw signal.reason
    throw new Error(`${stage}请求失败`)
  }
  if (result?.retcode !== 0 && result?.retcode !== "0") {
    throw new Error(`${stage}失败或已失效`)
  }
  return result.data
}

function usableCredential(value) {
  return typeof value === "string" && value.trim() === value &&
    !/[;\r\n]/.test(value) && !["", "undefined", "null"].includes(value)
}

export function createLoginSession(signal) {
  const device = crypto.randomBytes(16).toString("hex").toUpperCase()
  const lifecycle = crypto.randomUUID()
  const qrHeaders = {
    "x-rpc-device_os": "Windows 10 64-bit",
    "x-rpc-lifecycle_id": "ad09f4ea50",
    "x-rpc-app_id": appId,
    "x-rpc-device_id": device,
    "x-rpc-device_name": "Sony XQ-BC52",
    "x-rpc-device_fp": "38d805974f6af",
    "x-rpc-client_type": "4",
    "x-rpc-game_biz": "bbs_cn",
    "x-rpc-sdk_version": "2.54.0",
    "x-rpc-device_model": "XQ-BC52",
    "x-rpc-csm_source": "myself",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  }

  async function exchange(stoken, mid, uid, target) {
    // 签名使用实际发送的请求体，包括通行证 SDK 的字符转义。
    const body = JSON.stringify({
      dst_token_type: target,
      src_token: { token: stoken, token_type: 1 },
      mid,
    }).replace(/[<>&='\u2028\u2029]/gu, char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"))
    const time = Math.floor(Date.now() / 1000)
    const nonce = crypto.randomBytes(3).toString("hex")
    const hash = crypto.createHash("md5")
      .update(`salt=JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS&t=${time}&r=${nonce}&b=${body}&q=`)
      .digest("hex")
    const data = await post(exchangeApi, {
      Accept: "application/json",
      "User-Agent": `Mozilla/5.0 (Linux; Android 12; XQ-BC52) miHoYoBBS/${appVersion}`,
      "x-rpc-app_version": appVersion,
      "x-rpc-client_type": "2",
      "x-rpc-app_id": appId,
      "x-rpc-device_id": device,
      "x-rpc-device_fp": "38d805974f6af",
      "x-rpc-device_name": "Sony%20XQ-BC52",
      "x-rpc-device_model": "XQ-BC52",
      "x-rpc-game_biz": "bbs_cn",
      "x-rpc-sys_version": "12",
      "x-rpc-sdk_version": sdkVersion,
      "x-rpc-account_version": sdkVersion,
      "x-rpc-lifecycle_id": lifecycle,
      DS: `${time},${nonce},${hash}`,
    }, body, signal, "Cookie 换票")
    const token = data?.token
    if (!usableCredential(token?.token) ||
        (token.token_type != null && Number(token.token_type) !== target) ||
        (data.user_info?.aid != null && String(data.user_info.aid) !== uid)) {
      throw new Error("Cookie 换票返回的凭据不完整或账号不一致")
    }
    return token.token
  }

  return {
    async create() {
      const data = await post(`${qrApi}/createQRLogin`, qrHeaders, "{}", signal, "获取二维码")
      let url
      try {
        url = new URL(data?.url)
      } catch {
        throw new Error("扫码接口未返回有效二维码")
      }
      const ticket = data.ticket || url.searchParams.get("ticket")
      if (!usableCredential(ticket)) throw new Error("扫码接口未返回有效票据")
      return { url: data.url, ticket }
    },

    async query(ticket) {
      return post(`${qrApi}/queryQRLoginStatus`, qrHeaders, JSON.stringify({ ticket }), signal, "查询二维码")
    },

    async credentials(data) {
      const { aid, mid } = data.user_info ?? {}
      const uid = String(aid ?? "")
      const tokens = Array.isArray(data.tokens) ? data.tokens : []
      const token = tokens.find(item => Number(item?.token_type) === 1) ??
        (tokens.length === 1 && tokens[0]?.token_type == null ? tokens[0] : undefined)
      if (!/^[1-9]\d*$/.test(uid) || !usableCredential(mid) || !usableCredential(token?.token)) {
        throw new Error("扫码返回的账号凭据不完整")
      }

      const ltoken = await exchange(token.token, mid, uid, 2)
      const cookieToken = await exchange(token.token, mid, uid, 4)
      const cookie = `ltuid_v2=${uid};account_id_v2=${uid};ltoken_v2=${ltoken};cookie_token_v2=${cookieToken};ltmid_v2=${mid};account_mid_v2=${mid};`
      const stoken = `stoken=${token.token};stuid=${uid};mid=${mid};ltoken=${ltoken}`
      return { cookie, stoken }
    },
  }
}
