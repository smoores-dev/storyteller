export const apiHost = process.env["STORYTELLER_API_HOST"] ?? ""

export const publicApiHost =
  process.env["PUBLIC_STORYTELLER_API_HOST"] ?? apiHost
