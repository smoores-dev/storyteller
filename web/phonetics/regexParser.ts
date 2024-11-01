export type Result = {
  isPrefix: boolean
  isSuffix: boolean
  isExact: boolean
  items: string[]
}

enum State {
  DEFAULT = 0,
  CHARACTER_CLASS = 1,
  CAPTURING_GROUP = 2,
}

export function parse(source: string) {
  const containsPrefix = /^\^/
  const containsSuffix = /\$$/
  const symbol = /['’\p{L}]/u

  let pattern = source

  const result: Result = {
    isPrefix: false,
    isSuffix: false,
    isExact: false,
    items: [],
  }

  if (pattern === "") {
    return null
  }

  if (pattern === "^$") {
    return result
  }

  if (containsPrefix.test(pattern)) {
    pattern = pattern.slice(1)
    result.isPrefix = true
  }

  if (containsSuffix.test(pattern)) {
    pattern = pattern.slice(0, -1)
    result.isSuffix = true
  }

  if (result.isPrefix && result.isSuffix) {
    result.isExact = true
    result.isPrefix = false
    result.isSuffix = false
  }

  const groups: string[][] = []
  let group: string[] = []
  let str = ""

  function appendGroup() {
    if (str !== "") {
      group.push(str)
      str = ""
    }
    if (group.length !== 0) {
      groups.push(group)
      group = []
    }
  }
  let currentState = State.DEFAULT
  for (const char of pattern) {
    if (char === "[") {
      appendGroup()
      currentState = State.CHARACTER_CLASS
      continue
    }

    if (char === "]") {
      appendGroup()
      currentState = State.DEFAULT
      continue
    }

    if (char === "(") {
      appendGroup()
      currentState = State.CAPTURING_GROUP
      continue
    }

    if (char === ")") {
      appendGroup()
      currentState = State.DEFAULT
      continue
    }

    if (char !== "|" && !symbol.test(char)) {
      return null // unable to parse such a regex
    }

    switch (currentState) {
      case State.DEFAULT: {
        str += char
        break
      }
      case State.CHARACTER_CLASS: {
        group.push(char)
        break
      }
      case State.CAPTURING_GROUP: {
        if (char === "|") {
          if (str !== "") {
            group.push(str)
            str = ""
          }
        } else {
          str += char
        }
      }
    }
  }

  appendGroup()

  for (const group of groups) {
    if (result.items.length === 0) {
      result.items = group
      continue
    }

    const newItems: string[] = []
    for (const item of result.items) {
      for (const member of group) {
        newItems.push(item + member)
      }
    }

    result.items = newItems
  }

  return result
}
