export async function formatMarkdown(
  source: string,
  path: string,
): Promise<string> {
  const [{ format }, markdown] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/markdown"),
  ])
  const formatted = await format(source, {
    parser: path.toLowerCase().endsWith(".mdx") ? "mdx" : "markdown",
    plugins: [markdown],
    proseWrap: "always",
    semi: false,
  })
  return formatted
}
