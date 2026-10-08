/**
 * META-INF/encryption.xml — reading the encryption document and summarising it.
 *
 * Section reference: https://www.w3.org/TR/epub-33/#sec-container-metainf-encryption.xml
 *
 * "This file is an XML document whose root element is encryption. The
 * encryption element contains child elements of type EncryptedKey and
 * EncryptedData as defined by [XMLENC-CORE1]."
 */

import { describe, expect, it } from "vitest"

import { summarizeEncryptionDocument } from "../encryption.ts"
import { Epub, MemoryAdapter } from "../index.tsx"
import { createDocument, parse } from "../xml.ts"

import { buildZip, packageXml, REQUIRED_METADATA } from "./spec-support.ts"

const XML = "text/xml"

const CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
const ENC_NS = "http://www.w3.org/2001/04/xmlenc#"
const DS_NS = "http://www.w3.org/2000/09/xmldsig#"

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="${CONTAINER_NS}">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

/** The shape of the example in the specification, adapted from XMLENC-CORE1. */
const SPEC_EXAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="${CONTAINER_NS}" xmlns:enc="${ENC_NS}" xmlns:ds="${DS_NS}">
  <enc:EncryptedKey Id="EK">
    <enc:EncryptionMethod Algorithm="${ENC_NS}rsa-1_5"/>
    <ds:KeyInfo><ds:KeyName>John Smith</ds:KeyName></ds:KeyInfo>
    <enc:CipherData><enc:CipherValue>xyzabc</enc:CipherValue></enc:CipherData>
  </enc:EncryptedKey>
  <enc:EncryptedData Id="ED1">
    <enc:EncryptionMethod Algorithm="${ENC_NS}kw-aes128"/>
    <ds:KeyInfo>
      <ds:RetrievalMethod URI="#EK" Type="${ENC_NS}EncryptedKey"/>
    </ds:KeyInfo>
    <enc:CipherData>
      <enc:CipherReference URI="OEBPS/images/image.jpeg"/>
    </enc:CipherData>
  </enc:EncryptedData>
</encryption>
`

/** The same document with a prefixed root element and no default namespace. */
const PREFIXED_ROOT = `<?xml version="1.0" encoding="UTF-8"?>
<xenc:encryption xmlns:xenc="${ENC_NS}" xmlns:ds="${DS_NS}">
  <xenc:EncryptedData Id="ED1">
    <xenc:EncryptionMethod Algorithm="https://www.w3.org/2009/xmenc11#aes128-gcm"/>
    <ds:KeyInfo>
      <ds:RetrievalMethod Uri="../license.lic" Type="${ENC_NS}encKey"/>
    </ds:KeyInfo>
  </xenc:EncryptedData>
</xenc:encryption>
`

/** Font obfuscation as IDPF tooling emits it: the XML-ENC namespace is
 * declared on each child rather than bound to a prefix. */
const FONT_OBFUSCATION = `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="${CONTAINER_NS}">
  <EncryptedData xmlns="${ENC_NS}">
    <EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <CipherData>
      <CipherReference URI="EPUB/OldStandard-Bold.obf.woff"/>
    </CipherData>
  </EncryptedData>
</encryption>
`

/** One key wrapping the content key of three resources, so each algorithm and
 * retrieval type occurs three times. */
const SHARED_KEY = `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="${CONTAINER_NS}" xmlns:enc="${ENC_NS}" xmlns:ds="${DS_NS}">
  <enc:EncryptedKey Id="EK">
    <enc:EncryptionMethod Algorithm="${ENC_NS}rsa-oaep-mgf1p"/>
  </enc:EncryptedKey>
${["a.xhtml", "b.xhtml", "c.xhtml"]
  .map(
    (file, index) => `  <enc:EncryptedData Id="ED${index}">
    <enc:EncryptionMethod Algorithm="https://www.w3.org/2009/xmenc11#aes128-gcm"/>
    <ds:KeyInfo>
      <ds:RetrievalMethod Uri="#EK" Type="${ENC_NS}encKey"/>
    </ds:KeyInfo>
    <enc:CipherData>
      <enc:CipherReference URI="OEBPS/${file}"/>
    </enc:CipherData>
  </enc:EncryptedData>`,
  )
  .join("\n")}
</encryption>
`

describe("summarizeEncryptionDocument", () => {
  it("summarises the elements of the specification's own example", () => {
    expect(summarizeEncryptionDocument(parse(SPEC_EXAMPLE, XML))).toEqual({
      contentAlgorithms: [`${ENC_NS}kw-aes128`],
      keyWrappingAlgorithms: [`${ENC_NS}rsa-1_5`],
      keyRetrievalTypes: [`${ENC_NS}EncryptedKey`],
      encryptedKeyCount: 1,
      encryptedContentCount: 1,
    })
  })

  it("summarises a document whose root element carries a prefix", () => {
    expect(summarizeEncryptionDocument(parse(PREFIXED_ROOT, XML))).toEqual({
      contentAlgorithms: ["https://www.w3.org/2009/xmenc11#aes128-gcm"],
      keyWrappingAlgorithms: [],
      keyRetrievalTypes: [`${ENC_NS}encKey`],
      encryptedKeyCount: 0,
      encryptedContentCount: 1,
    })
  })

  it("summarises children that declare the XML-ENC default namespace", () => {
    expect(summarizeEncryptionDocument(parse(FONT_OBFUSCATION, XML))).toEqual({
      contentAlgorithms: ["http://www.idpf.org/2008/embedding"],
      keyWrappingAlgorithms: [],
      keyRetrievalTypes: [],
      encryptedKeyCount: 0,
      encryptedContentCount: 1,
    })
  })

  it("counts every element while collapsing repeated algorithms", () => {
    const summary = summarizeEncryptionDocument(parse(SHARED_KEY, XML))

    expect(summary.contentAlgorithms).toEqual([
      "https://www.w3.org/2009/xmenc11#aes128-gcm",
    ])
    expect(summary.keyWrappingAlgorithms).toEqual([`${ENC_NS}rsa-oaep-mgf1p`])
    expect(summary.keyRetrievalTypes).toEqual([`${ENC_NS}encKey`])
    expect(summary.encryptedKeyCount).toBe(1)
    expect(summary.encryptedContentCount).toBe(3)
  })

  it("reports an encrypted key that specifies no algorithm", () => {
    const summary = summarizeEncryptionDocument(
      parse(
        `<encryption xmlns="${ENC_NS}">
          <EncryptedKey Id="EK"><CipherData/></EncryptedKey>
        </encryption>`,
        XML,
      ),
    )

    expect(summary.encryptedKeyCount).toBe(1)
    expect(summary.keyWrappingAlgorithms).toEqual([])
  })

  it("collects retrieval types at any depth", () => {
    expect(
      summarizeEncryptionDocument(parse(SPEC_EXAMPLE, XML)).keyRetrievalTypes,
    ).toEqual([`${ENC_NS}EncryptedKey`])
  })

  it("ignores elements that are not in the XML-ENC namespace", () => {
    const summary = summarizeEncryptionDocument(
      parse(
        `<encryption xmlns="urn:example:whatever">
          <EncryptedData>
            <EncryptionMethod Algorithm="${ENC_NS}kw-aes128"/>
          </EncryptedData>
        </encryption>`,
        XML,
      ),
    )

    expect(summary.contentAlgorithms).toEqual([])
    expect(summary.encryptedContentCount).toBe(0)
  })

  it("throws when the root element is not encryption", () => {
    expect(() =>
      summarizeEncryptionDocument(parse(CONTAINER_XML, XML)),
    ).toThrow(/missing root encryption element/)
  })

  it("throws when the document has no root element", () => {
    // `parse` rejects a document with no root element first, so this is
    // reached only with a document built by hand.
    expect(() => summarizeEncryptionDocument(createDocument(null, ""))).toThrow(
      /missing root encryption element/,
    )
  })
})

describe("Epub encryption accessors", () => {
  it("returns a null document and summary without META-INF/encryption.xml", async () => {
    using epub = await epubWith(null)

    expect(await epub.getEncryptionDocument()).toBeNull()
    expect(await epub.getEncryptionSummary()).toBeNull()
  })

  it("returns the parsed contents of META-INF/encryption.xml", async () => {
    using epub = await epubWith(SPEC_EXAMPLE)

    const document = await epub.getEncryptionDocument()
    const root = document?.documentElement
    if (!root) throw new Error("no encryption document element")

    expect(root.localName).toBe("encryption")
    expect(root.namespaceURI).toBe(CONTAINER_NS)
    expect(root.children.length).toBe(2)
  })

  it("summarises the encryption of the publication", async () => {
    using epub = await epubWith(SHARED_KEY)

    expect(await epub.getEncryptionSummary()).toEqual({
      contentAlgorithms: ["https://www.w3.org/2009/xmenc11#aes128-gcm"],
      keyWrappingAlgorithms: [`${ENC_NS}rsa-oaep-mgf1p`],
      keyRetrievalTypes: [`${ENC_NS}encKey`],
      encryptedKeyCount: 1,
      encryptedContentCount: 3,
    })
  })

  it("throws when META-INF/encryption.xml is not an encryption document", async () => {
    using epub = await epubWith(CONTAINER_XML)

    await expect(epub.getEncryptionSummary()).rejects.toThrow(
      /missing root encryption element/,
    )
  })

  it("throws when META-INF/encryption.xml is not well-formed XML", async () => {
    using epub = await epubWith('<?xml version="1.0"?><encryption')

    await expect(epub.getEncryptionSummary()).rejects.toThrow()
    await expect(epub.getEncryptionDocument()).rejects.toThrow()
  })
})

async function epubWith(encryptionXml: string | null) {
  const entries: Record<string, string> = {
    "META-INF/container.xml": CONTAINER_XML,
    "content.opf": packageXml({ metadata: REQUIRED_METADATA }),
  }

  if (encryptionXml !== null) {
    entries["META-INF/encryption.xml"] = encryptionXml
  }

  return Epub.using(MemoryAdapter).from(await buildZip(entries))
}
