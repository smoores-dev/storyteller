/**
 * Project-specific lint rules, loaded by Oxlint through the `jsPlugins` field
 * of `.oxlintrc.json`.
 */

const noTmpdir = {
  meta: {
    docs: {
      description:
        "Use `scratchPath()` from `@storyteller-platform/fs` instead of os.tmpdir()",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        const isBare = callee.type === "Identifier" && callee.name === "tmpdir"
        const isMember =
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "tmpdir"
        if (isBare || isMember)
          context.report({
            node,
            message:
              "Use `scratchPath()` from `@storyteller-platform/fs` instead",
          })
      },
    }
  },
}

const noReactHookFormWatch = {
  meta: {
    docs: {
      description:
        "Do not use form.watch, it does not work with the React compiler",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          /form/i.test(node.object.name) &&
          node.property.type === "Identifier" &&
          node.property.name === "watch"
        )
          context.report({
            node,
            message:
              "Do not use form.watch, it does not work with the React compiler. Use react-hook-form's useWatch instead.",
          })
      },
    }
  },
}

const noNextIntlUseTranslations = {
  meta: {
    docs: {
      description:
        "Do not use next-intl's useTranslations hook, it won't automatically create correct markup",
    },
  },
  create(context) {
    return {
      Identifier(node) {
        if (node.name === "useTranslations")
          context.report({
            node,
            message:
              "Do not use next-intl's useTranslations hook, it won't automatically create correct markup. Use useTranslation instead. If you need plain text, use t.plain instead.",
          })
      },
    }
  },
}

const noHeavyBarrelImport = {
  meta: {
    type: "problem",
    docs: {
      description: "Import heavy packages through a subpath",
    },
    schema: [
      {
        type: "object",
        properties: {
          packages: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ packages: [] }],
  },
  create(context) {
    const packages = new Set(context.options[0]?.packages ?? [])
    if (packages.size === 0) return {}

    function check(node, kind, specifiers) {
      if (!node.source || !packages.has(node.source.value)) return
      if (kind === "type") return
      if (
        specifiers?.length &&
        specifiers.every((specifier) => specifier.importKind === "type")
      )
        return
      context.report({
        node: node.source,
        message: `\`${node.source.value}\` ends up re-exporting everything, which causes next to crash. Import from a more specific subpath instead.`,
      })
    }

    return {
      ImportDeclaration(node) {
        check(node, node.importKind, node.specifiers)
      },
      ExportNamedDeclaration(node) {
        check(node, node.exportKind, node.specifiers)
      },
      ExportAllDeclaration(node) {
        check(node, node.exportKind)
      },
    }
  },
}

export default {
  meta: { name: "storyteller" },
  rules: {
    "no-tmpdir": noTmpdir,
    "no-react-hook-form-watch": noReactHookFormWatch,
    "no-next-intl-use-translations": noNextIntlUseTranslations,
    "no-heavy-barrel-import": noHeavyBarrelImport,
  },
}
