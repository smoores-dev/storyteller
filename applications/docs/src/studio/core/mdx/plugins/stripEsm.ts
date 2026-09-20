import type { Root } from "mdast"
import type { Plugin } from "unified"
import { visit } from "unist-util-visit"

interface EstreeLike {
  type: string
  body: Array<{
    type: string
    source?: { value?: unknown }
    specifiers?: Array<{ type: string; local: { name: string } }>
  }>
}

interface MdxjsEsm {
  type: "mdxjsEsm"
  value: string
  data?: { estree?: EstreeLike }
}

export interface CodeImport {
  specifier: string
  defaultBinding: string | null
  namedBindings: Array<{ local: string; imported: string }>
}

export interface StripEsmOptions {
  resolveAsset: (specifier: string) => string | null
  codeImports?: CodeImport[]
}

const CODE_EXTENSIONS = /\.(m?[jt]sx?|json|css|scss)$/i

function isCodeSpecifier(specifier: string) {
  return (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    CODE_EXTENSIONS.test(specifier)
  )
}

function isAssetSpecifier(specifier: string) {
  return (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !CODE_EXTENSIONS.test(specifier)
  )
}

interface ImportSpecifierLike {
  type: string
  local: { name: string }
  imported?: { name: string }
}

function collectCodeImport(
  specifier: string,
  specifiers: ImportSpecifierLike[],
  out: CodeImport[] | undefined,
) {
  if (!out) return

  const defaultSpec = specifiers.find(
    (s) => s.type === "ImportDefaultSpecifier",
  )

  const namedSpecs = specifiers.filter((s) => s.type === "ImportSpecifier")

  out.push({
    specifier,
    defaultBinding: defaultSpec?.local.name ?? null,
    namedBindings: namedSpecs.map((s) => ({
      local: s.local.name,
      imported: s.imported?.name ?? s.local.name,
    })),
  })
}

function constExport(name: string, value: string): MdxjsEsm {
  return {
    type: "mdxjsEsm",
    value: `export const ${name} = ${JSON.stringify(value)}`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ExportNamedDeclaration",
            specifiers: [],
            source: null,
            declaration: {
              type: "VariableDeclaration",
              kind: "const",
              declarations: [
                {
                  type: "VariableDeclarator",
                  id: { type: "Identifier", name },
                  init: { type: "Literal", value, raw: JSON.stringify(value) },
                },
              ],
            },
          },
        ],
      } as unknown as EstreeLike,
    },
  }
}

export const remarkStripEsm: Plugin<[StripEsmOptions], Root> = (options) => {
  return (tree) => {
    const replacements: Array<{
      node: MdxjsEsm
      index: number
      parent: { children: unknown[] }
      next: MdxjsEsm[]
    }> = []
    visit(tree, "mdxjsEsm", (node, index, parent) => {
      if (index === undefined || !parent) return
      const esm = node as unknown as MdxjsEsm
      const body = esm.data?.estree?.body ?? []
      const next: MdxjsEsm[] = []
      let keepOriginal = false
      for (const statement of body) {
        if (statement.type !== "ImportDeclaration") {
          keepOriginal = true
          continue
        }

        const specifier = String(statement.source?.value ?? "")
        const specifiers = (statement.specifiers ?? []) as ImportSpecifierLike[]

        if (isCodeSpecifier(specifier)) {
          collectCodeImport(specifier, specifiers, options.codeImports)
          continue
        }

        if (!isAssetSpecifier(specifier)) continue

        const defaultSpecifier = specifiers.find(
          (s) => s.type === "ImportDefaultSpecifier",
        )

        const resolved = options.resolveAsset(specifier)

        if (defaultSpecifier && resolved) {
          next.push(constExport(defaultSpecifier.local.name, resolved))
        } else if (!resolved) {
          // unresolved extensionless import, likely a component
          collectCodeImport(specifier, specifiers, options.codeImports)
        }
      }
      if (keepOriginal && next.length === 0) return
      replacements.push({
        node: esm,
        index,
        parent: parent as unknown as { children: unknown[] },
        next: keepOriginal ? [esm, ...next] : next,
      })
    })
    for (const { index, parent, next } of replacements.reverse()) {
      parent.children.splice(index, 1, ...next)
    }
  }
}
