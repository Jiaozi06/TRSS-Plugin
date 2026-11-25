import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"
import { exchangeCookie } from "./miHoYo-qr-login.js"

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
  const entries = data.stuid ? [data] : Object.values(data)
  const accounts = {}
  for (const entry of entries) {
    const stuid = String(entry?.stuid ?? "")
    if (!/^[1-9]\d*$/.test(stuid) || typeof entry.stoken !== "string" || !entry.stoken) continue
    if (entry.userId != null && String(entry.userId) !== id) continue
    const mid = entry.mid || entry.ltmid_v2 || entry.account_mid_v2
    if (!accounts[stuid]?.mid) {
      accounts[stuid] = { stuid, stoken: entry.stoken, mid, device: entry.device }
    }
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
    accounts[sk.stuid] = { ...sk, cookie }
    return writeAccounts(file, accounts, signal)
  })
}

export function refreshLoginAccounts(userId) {
  return withAccounts(userId, async (file, accounts, id) => {
    const legacy = await readXiaoyaoAccounts(id).catch(error => {
      if (Object.keys(accounts).length) return {}
      throw error
    })
    const updated = []
    const migrated = new Map()
    let missingMid = 0
    let failed = 0
    for (const [uid, sk] of Object.entries({ ...legacy, ...accounts })) {
      if (!sk?.mid || ["null", "undefined"].includes(sk.mid)) {
        missingMid++
        continue
      }
      try {
        const credentials = await exchangeCookie({ ...sk, stuid: uid }, AbortSignal.timeout(20000))
        const account = { ...sk, ...credentials, stuid: uid }
        if (Object.hasOwn(accounts, uid)) updated.push(account)
        else migrated.set(uid, account)
      } catch {
        failed++
      }
    }

    if (migrated.size) {
      const current = await readXiaoyaoAccounts(id).catch(() => ({}))
      for (const [uid, account] of migrated) {
        if (current[uid]?.stoken !== account.stoken || current[uid]?.mid !== account.mid) failed++
        else updated.push(account)
      }
    }
    if (updated.length) {
      for (const account of updated) accounts[account.stuid] = account
      await writeAccounts(file, accounts)
    }
    return { cookies: updated.map(account => account.cookie), missingMid, failed }
  })
}
