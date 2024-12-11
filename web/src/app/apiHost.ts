export const apiHost = "http://localhost:8001"
// export const apiHost = process.env["STORYTELLER_API_HOST"] ?? ""

export const rootPath = process.env["STORYTELLER_ROOT_PATH"] ?? ""

export const proxyRootPath = `${process.env["STORYTELLER_ROOT_PATH"] ?? ""}/api`
