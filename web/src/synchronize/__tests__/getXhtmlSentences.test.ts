import { ParsedXml, XmlNode } from "@/epub"
import { describe, it } from "node:test"
import { getXHtmlSentences } from "../getXhtmlSentences"
import { strict as assert } from "node:assert/strict"

void describe("getXhtmlSentences", () => {
  void it("gets sentences from a text node", () => {
    const input = [
      {
        "#text":
          "This is a text node. It has multiple sentences. Well, three, at least.",
      },
    ] as ParsedXml

    const output = getXHtmlSentences(input)

    assert.deepEqual(output, [
      "This is a text node.",
      "It has multiple sentences.",
      "Well, three, at least.",
    ])
  })

  void it("gets sentences from a single element", () => {
    const input: ParsedXml = [
      {
        p: [
          {
            "#text":
              "This is a text node. It has multiple sentences. Well, three, at least.",
          } as XmlNode,
          {
            span: [
              {
                "#text": "Maybe, even, four?",
              } as XmlNode,
            ],
          },
          {
            "#text": "In fact, five!",
          } as XmlNode,
        ],
      },
    ]

    const output = getXHtmlSentences(input)

    assert.deepEqual(output, [
      "This is a text node.",
      "It has multiple sentences.",
      "Well, three, at least.",
      "Maybe, even, four?",
      "In fact, five!",
    ])
  })

  void it("gets sentences from nested elements", () => {
    const input: ParsedXml = [
      {
        p: [
          {
            "#text":
              "This is a text node. It has multiple sentences. Well, three, at least.",
          } as XmlNode,
          {
            span: [
              {
                "#text": "Maybe, even, four?",
              } as XmlNode,
            ],
          },
          {
            "#text": "This sentence... ",
          } as XmlNode,
        ],
      },
      {
        p: [
          {
            "#text": "will be broken up, since it crosses multiple blocks.",
          } as XmlNode,
        ],
      },
    ]

    const output = getXHtmlSentences(input)

    assert.deepEqual(output, [
      "This is a text node.",
      "It has multiple sentences.",
      "Well, three, at least.",
      "Maybe, even, four?",
      "This sentence...",
      "will be broken up, since it crosses multiple blocks.",
    ])
  })
})
