import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import fetch from "node-fetch"
import YAML from "yaml"

const writes = new Map()
const gameUid = /^[1-9]\d*$/

async function getRoles(cookie) {
  try {
    const response = await fetch("https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie", {
      headers: { Cookie: cookie },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return []
    const result = await response.json()
    if (Number(result?.retcode) === 0 && Array.isArray(result.data?.list)) {
      return result.data.list.filter(role => gameUid.test(String(role?.game_uid ?? "")))
    }
  } catch {
    // 角色查询失败时，仍可更新已有 UID，并按通行证账号保存新凭据。
  }
  return []
}

async function writeStoken(file, fields, roles, signal) {
  let data = {}
  try {
    data = YAML.parse(await fs.readFile(file, "utf8")) ?? {}
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  if (typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid Stoken file")
  if (gameUid.test(String(data.uid ?? ""))) data = { [data.uid]: data }

  let indexed = false
  for (const [key, entry] of Object.entries(data)) {
    if (String(entry?.stuid) !== fields.stuid) continue
    data[key] = { ...entry, ...fields }
    indexed ||= gameUid.test(key)
  }
  for (const role of roles) {
    const uid = String(role.game_uid)
    const entry = data[uid]
    if (entry?.stuid && String(entry.stuid) !== fields.stuid) continue
    data[uid] = { is_sign: true, ...entry, ...fields, uid, region_name: role.region_name ?? entry?.region_name }
    indexed = true
  }

  const account = `account_${fields.stuid}`
  if (indexed) delete data[account]
  else data[account] = { ...data[account], ...fields }

  signal.throwIfAborted()
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
    await fs.writeFile(temporary, YAML.stringify(data), { encoding: "utf8", mode: 0o600, flag: "wx" })
    signal.throwIfAborted()
    await fs.rename(temporary, file)
  } finally {
    await fs.unlink(temporary).catch(() => {})
  }
  return indexed ? "game" : "account"
}

export async function saveXiaoyaoStoken(userId, sk, cookie, signal) {
  const plugin = path.join("plugins", "xiaoyao-cvs-plugin")
  try {
    if (!(await fs.stat(plugin)).isDirectory()) return "absent"
  } catch (error) {
    if (error.code === "ENOENT") return "absent"
    throw error
  }

  const id = String(userId)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid Stoken user ID")
  signal.throwIfAborted()
  const roles = await getRoles(cookie)
  signal.throwIfAborted()

  const file = path.resolve(plugin, "data", "yaml", `${id}.yaml`)
  const previous = writes.get(file) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(() => writeStoken(file, { ...sk, userId: id }, roles, signal))
  writes.set(file, next)
  try {
    return await next
  } finally {
    if (writes.get(file) === next) writes.delete(file)
  }
}
