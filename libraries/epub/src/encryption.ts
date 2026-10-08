import { type Document } from "@xmldom/xmldom"

import { findXmlChildByNameNS, NS } from "./xml.ts"

export interface EncryptionSummary {
  contentAlgorithms: string[]
  keyWrappingAlgorithms: string[]
  keyRetrievalTypes: string[]
  encryptedKeyCount: number
  encryptedContentCount: number
}

export function summarizeEncryptionDocument(doc: Document): EncryptionSummary {
  const encryption = doc.documentElement
  if (!encryption || encryption.localName !== "encryption") {
    throw new Error(
      `META-INF/encryption.xml is missing root encryption element`,
    )
  }

  const summary: EncryptionSummary = {
    contentAlgorithms: [],
    keyWrappingAlgorithms: [],
    keyRetrievalTypes: [],
    encryptedKeyCount: 0,
    encryptedContentCount: 0,
  }

  for (const element of encryption.children) {
    if (
      element.namespaceURI === NS.enc &&
      element.localName === "EncryptedKey"
    ) {
      summary.encryptedKeyCount++
      const method = findXmlChildByNameNS(NS.enc, "EncryptionMethod", element)
      if (!method) continue
      const algorithm = method.getAttribute("Algorithm")
      if (!algorithm) continue
      summary.keyWrappingAlgorithms.push(algorithm)
    }

    if (
      element.namespaceURI === NS.enc &&
      element.localName === "EncryptedData"
    ) {
      summary.encryptedContentCount++
      const method = findXmlChildByNameNS(NS.enc, "EncryptionMethod", element)
      if (!method) continue
      const algorithm = method.getAttribute("Algorithm")
      if (!algorithm) continue
      summary.contentAlgorithms.push(algorithm)
    }
  }

  const queue = Array.from(encryption.children)

  while (queue.length > 0) {
    const candidate = queue.shift()
    if (!candidate) continue
    if (
      candidate.namespaceURI === NS.ds &&
      candidate.localName === "RetrievalMethod"
    ) {
      const type = candidate.getAttribute("Type")
      if (type) {
        summary.keyRetrievalTypes.push(type)
      }
    }
    queue.push(...Array.from(candidate.children))
  }

  return {
    ...summary,
    contentAlgorithms: Array.from(new Set(summary.contentAlgorithms)),
    keyWrappingAlgorithms: Array.from(new Set(summary.keyWrappingAlgorithms)),
    keyRetrievalTypes: Array.from(new Set(summary.keyRetrievalTypes)),
  }
}
