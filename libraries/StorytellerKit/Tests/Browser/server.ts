import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { dirname, extname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const mounts = {
  "/harness/": resolve(here, "harness"),
  "/fixtures/": resolve(here, "fixtures"),
  "/reader/": resolve(here, "../../Sources/Kit/Resources/WebResources"),
  "/fonts/": resolve(here, "../../Sources/Kit/Resources/assets/fonts"),
}
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".json": "application/json",
}

const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    )
    const mount = Object.entries(mounts).find(([prefix]) =>
      path.startsWith(prefix),
    )
    if (!mount) {
      response.writeHead(404).end()
      return
    }
    const [prefix, root] = mount
    let file = resolve(root, path.slice(prefix.length))
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end()
      return
    }
    // Allows the same behavioral test to run against a git-show snapshot.
    if (
      path === "/reader/foliate-js/paginator.js" &&
      process.env.READER_PAGINATOR_PATH
    ) {
      file = resolve(process.env.READER_PAGINATOR_PATH)
    }
    if (!(await stat(file)).isFile()) throw new Error("Not a file")
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    })
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404).end()
  }
})

server.listen(Number(process.env.READER_TEST_PORT ?? 4179), "127.0.0.1")
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
