import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

export function renderPath(name) {
  const directory = fileURLToPath(new URL(`../Resources/${name}/`, import.meta.url))
  return { htmlDir: pathToFileURL(directory).href, tplFile: path.join(directory, `${name}.html`) }
}
