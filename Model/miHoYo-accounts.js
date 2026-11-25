import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"
import { exchangeCookie, getGameRoles } from "./miHoYo-qr-login.js"

const pending = new Map()

function withAccounts(userId, work) {
  const id = String(userId)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid login user ID")

  const file = path.resolve("data", "TRSS-Plugin", "mihoyo", `${id}.json`)
  const previous = pending.get(file) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    const text = await readOptional(file)
    const accounts = text === undefined ? {} : JSON.parse(text)
    if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) {
      throw new Error("Invalid login account file")
    }
    return work(file, accounts, id)
  })
  pending.set(file, next)
  return next.finally(() => {
    if (pending.get(file) === next) pending.delete(file)
  })
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, "utf8")
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
}

async function readXiaoyaoAccounts(id) {
  const file = path.join("plugins", "xiaoyao-cvs-plugin", "data", "yaml", `${id}.yaml`)
  const text = await readOptional(file)
  if (text === undefined) return {}

  const data = YAML.parse(text)
  if (!data || typeof data !== "object" || Array.isArray(data)) return {}
  const entries = data.stuid ? [[data.uid, data]] : Object.entries(data)
  const accounts = {}
  for (const [key, entry] of entries) {
    const stuid = String(entry?.stuid ?? "")
    if (!/^[1-9]\d*$/.test(stuid) || typeof entry.stoken !== "string" || !entry.stoken) continue
    if (entry.userId != null && String(entry.userId) !== id) continue
    const mid = entry.mid || entry.ltmid_v2 || entry.account_mid_v2
    const roles = accounts[stuid]?.roles ?? []
    const uid = String(entry.uid || key || "")
    if (/^[1-9]\d*$/.test(uid) && !roles.some(role => role.uid === uid)) {
      roles.push({ uid, region: entry.region_name })
    }
    if (!accounts[stuid]?.mid) accounts[stuid] = { stuid, stoken: entry.stoken, mid, device: entry.device, roles }
  }
  return accounts
}

async function writeAccounts(file, accounts, signal) {
  const temporary = `${file}.${randomUUID()}.tmp`
  signal?.throwIfAborted()
  try {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    await fs.writeFile(temporary, JSON.stringify(accounts, null, 2), { mode: 0o600, flag: "wx" })
    signal?.throwIfAborted()
    await fs.rename(temporary, file)
  } finally {
    await fs.unlink(temporary).catch(() => {})
  }
}

export function saveLoginAccount(userId, sk, cookie, signal) {
  return withAccounts(userId, (file, accounts) => {
    accounts[sk.stuid] = { ...sk, cookie, roles: accounts[sk.stuid]?.roles }
    return writeAccounts(file, accounts, signal)
  })
}

export function refreshLoginAccounts(userId) {
  return withAccounts(userId, async (file, accounts, id) => {
    const legacy = await readXiaoyaoAccounts(id).catch(error => {
      if (Object.keys(accounts).length) return {}
      throw error
    })
    const results = []
    const updated = []
    for (const [uid, sk] of Object.entries({ ...legacy, ...accounts })) {
      const roles = sk?.roles?.length ? sk.roles : legacy[uid]?.roles ?? []
      const result = { uid, roles, status: "failed" }
      results.push(result)
      if (!sk?.mid || ["null", "undefined"].includes(sk.mid)) {
        result.status = "missingMid"
        continue
      }
      try {
        const credentials = await exchangeCookie({ ...sk, stuid: uid }, AbortSignal.timeout(20000))
        const account = { ...sk, ...credentials, stuid: uid }
        updated.push({ account, result, migrated: !Object.hasOwn(accounts, uid) })
      } catch {
        // 其他账号仍继续刷新。
      }
    }

    await Promise.all(updated.map(async ({ account, result }) => {
      const roles = await getGameRoles(account.cookie)
      if (roles.length) {
        result.roles = roles.map(role => ({ uid: String(role.game_uid), game: role.game_biz, region: role.region_name }))
      }
    }))
    const current = updated.some(entry => entry.migrated) ? await readXiaoyaoAccounts(id).catch(() => ({})) : {}
    let saved = false
    for (const { account, result, migrated } of updated) {
      const uid = account.stuid
      if (migrated && (current[uid]?.stoken !== account.stoken || current[uid]?.mid !== account.mid)) {
        result.status = "changed"
        continue
      }
      accounts[uid] = { ...account, roles: result.roles }
      result.cookie = account.cookie
      result.status = "success"
      saved = true
    }
    if (saved) await writeAccounts(file, accounts)
    return results
  })
}
