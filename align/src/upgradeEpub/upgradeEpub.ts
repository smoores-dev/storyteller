import { Epub } from "@storyteller-platform/epub"

export interface UpgradeEpubOptions {
  removeNcx?: boolean | undefined
}

export async function upgradeEpub(
  input: string,
  output: string,
  { removeNcx = false }: UpgradeEpubOptions,
) {
  using epub = await Epub.upgrade(input, { outputPath: output, removeNcx })

  await epub.saveAndClose()
}
