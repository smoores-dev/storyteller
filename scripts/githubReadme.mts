import { readFile, writeFile } from "node:fs/promises"

const notice = `> [!IMPORTANT]
>
> This is a read-only mirror of
> [Storyteller on GitLab](https://gitlab.com/storyteller-platform/storyteller).
> Please open issues and contributions on
> [GitLab](https://gitlab.com/storyteller-platform/storyteller/-/issues), or
> come talk to us on [Discord](https://discord.gg/KhSvFqcrza).`

const relative = String.raw`(?!https?:|mailto:|#|/)`

const readme = await readFile("README.md", "utf-8")

const rebased = readme
  .replace(new RegExp(String.raw`(\b(?:src|href)=")${relative}`, "g"), "$1../")
  .replace(new RegExp(String.raw`(\]\()${relative}`, "g"), "$1../")

const [title, ...rest] = rebased.split("\n")

await writeFile(".github/README.md", [title, "", notice, ...rest].join("\n"))
