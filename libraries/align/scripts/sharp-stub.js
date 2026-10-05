// Stand-in for the `sharp` package inside the standalone executable. We don't
// actually use sharp, so it's not worth the effort/space to bundle.
export default function sharp() {
  throw new Error(
    "Image processing with sharp is not available in the stalign standalone executable.",
  )
}
