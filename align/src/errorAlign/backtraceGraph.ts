import assert from "node:assert"

import { range } from "itertools"

import {
  Counter,
  END_DELIMITER,
  OP_TYPE_COMBO_MAP,
  type OpType,
  START_DELIMITER,
  reversed,
} from "./utils.ts"

export type Index = readonly [number, number]

/**
 * Node in the backtrace graph corresponding to the index (i, j) in the backtrace matrix.
 */
export class Node {
  public children = new Map<OpType, Node>()
  public parents = new Map<OpType, Node>()

  constructor(
    public hypIndex: number,
    public refIndex: number,
  ) {}

  get index(): Index {
    return [this.hypIndex, this.refIndex]
  }
  /**
   * Get the offset index of th enode so indices match the hypothesis and reference strings.
   *
   * Root will be at (-1, -1).
   */
  get offsetIndex(): Index {
    return [this.hypIndex - 1, this.refIndex - 1]
  }

  /**
   * Check if the node is a terminal node (i.e., it has no children).
   */
  get isTerminal() {
    return this.children.size === 0
  }

  /**
   * Check if the node is a root node (i.e., it has no parents).
   */
  get isRoot() {
    return this.parents.size === 0
  }
}

class NodeMap {
  private map: Map<string, { index: Index; node: Node }>

  constructor(entries?: readonly (readonly [Index, Node])[] | null) {
    const keyedEntries = entries?.map(
      ([index, node]) => [`${index[0]}-${index[1]}`, { index, node }] as const,
    )
    this.map = new Map(keyedEntries)
  }

  get([hypIndex, refIndex]: Index): Node | undefined {
    const key = `${hypIndex}-${refIndex}`
    return this.map.get(key)?.node
  }

  set([hypIndex, refIndex]: Index, node: Node) {
    const key = `${hypIndex}-${refIndex}`
    this.map.set(key, { index: [hypIndex, refIndex], node })
  }

  has([hypIndex, refIndex]: Index) {
    const key = `${hypIndex}-${refIndex}`
    return this.map.has(key)
  }

  *entries() {
    for (const { index, node } of this.map.values()) {
      yield [index, node] as const
    }
  }

  *values() {
    for (const { node } of this.map.values()) {
      yield node
    }
  }
}

/**
 * Backtrace alignment graph
 */
export class BacktraceGraph {
  public hypDim: number
  public refDim: number
  public hypMaxIndex: number
  public refMaxIndex: number
  private _nodes: NodeMap | null = null

  constructor(public backtrackMatrix: number[][]) {
    this.hypDim = backtrackMatrix.length
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.refDim = backtrackMatrix[0]!.length
    this.hypMaxIndex = this.hypDim - 1
    this.refMaxIndex = this.refDim - 1
  }

  /**
   * Get the nodes in the graph.
   */
  get nodes() {
    if (this._nodes) return this._nodes

    const terminalNode = new Node(this.hypMaxIndex, this.refMaxIndex)
    this._nodes = new NodeMap([[terminalNode.index, terminalNode]])

    for (const index of this.iterTopologicalOrder({ reverse: true })) {
      if (this._nodes.has(index) && (index[0] !== 0 || index[1] !== 0)) {
        this.addParentsFromBacktrace(index)
      }
    }

    this._nodes = new NodeMap(
      Array.from(this._nodes.entries()).toSorted(([[a1, a2]], [[b1, b2]]) => {
        if (a1 === b1) return a2 - b2
        return a1 - b1
      }),
    )

    return this._nodes
  }

  /**
   * Get the node at the given index.
   *
   * @param hypIndex Hyp/row index.
   * @param refIndex Ref/column index.
   */
  getNode(hypIndex: number, refIndex: number) {
    return this.nodes.get([hypIndex, refIndex])
  }

  /**
   * Get the set of all node indices in the graph.
   */
  getNodeSet() {
    const transitions = new Set<Index>()
    for (const node of this.nodes.values()) {
      transitions.add(node.offsetIndex)
    }
    return transitions
  }

  /**
   * Get a path through the graph.
   *
   * @param sample If true, sample a path randomly based on transition probabilities.
   *               Otherwise, return the first path deterministically.
   * @returns A list of nodes representing the path.
   */
  getPath({ sample } = { sample: false }) {
    let node = this.getNode(0, 0)
    assert(node?.isRoot, "The node at (-1, -1) was expected to be a root node.")

    const path: [OpType, Node][] = []
    while (!node.isTerminal) {
      const opType: OpType = sample
        ? choose(Array.from(node.children.keys()))
        : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          node.children.keys().next().value!

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      node = node.children.get(opType)!

      path.push([opType, node])
    }
  }

  /**
   * Get nodes that can only be accounted for by a match.
   *
   * @returns A list of index tuples representing the unambiguous node matches.
   */
  getUnambiguousNodeMatches() {
    const matchIndices = new Set<Index>()
    const matchPerToken = {
      ref: new Counter(),
      hyp: new Counter(),
    }
    const refOpTypes = new Set<OpType>(["MATCH", "SUBSTITUTE", "DELETE"])
    const hypOpTypes = new Set<OpType>(["MATCH", "SUBSTITUTE", "INSERT"])

    for (const [[hypIndex, refIndex], node] of this.nodes.entries()) {
      // Identify all nodes at which a match occurs.
      if (node.parents.size === 1 && node.parents.has("MATCH")) {
        matchIndices.add([hypIndex, refIndex])
      }

      // Count number of paths passing through each token.
      if (refOpTypes.intersection(node.parents).size) {
        matchPerToken.ref.set(refIndex, matchPerToken.ref.get(refIndex) + 1)
      }
      if (hypOpTypes.intersection(node.parents).size) {
        matchPerToken.hyp.set(hypIndex, matchPerToken.hyp.get(hypIndex) + 1)
      }
    }

    const unambiguousMatches: Index[] = []
    for (const [hypIndex, refIndex] of matchIndices) {
      if (
        matchPerToken.ref.get(refIndex) === 1 &&
        matchPerToken.hyp.get(hypIndex) === 1
      ) {
        unambiguousMatches.push([hypIndex - 1, refIndex - 1])
      }
    }

    return unambiguousMatches.toSorted(([_a, a], [_b, b]) => a - b)
  }

  /**
   * Get word spans (i.e., <...>) that are unambiguously matched.
   *
   * That is, there is only one subpath that can account for the span using MATCH operations.
   * Other subpaths that include INSERT, DELETE, SUBSTITUTE operations are not considered.
   *
   * @returns A list of index tuples representing the end node of unambiguous span matches.
   */
  getUnambiguousTokenSpanMatches(ref: string) {
    ref = "_" + ref // NOTE: Implicit index offset for root node.

    const monoMatchEndNodes = new Set<Index>()
    const refIndexes = new Counter()
    const hypIndexes = new Counter()

    for (const [[hypIndex, refIndex], node] of this.nodes.entries()) {
      if (!node.parents.has("MATCH") || ref[refIndex] !== START_DELIMITER)
        continue

      let _refIndex = refIndex + 1
      let _hypIndex = hypIndex + 1

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
      while (true) {
        const _index: Index = [_hypIndex, _refIndex]

        if (!this.nodes.has(_index)) {
          break
        }
        if (!this.nodes.get(_index)?.parents) {
          break
        }
        if (ref[_refIndex] === END_DELIMITER) {
          const endIndex = _index
          monoMatchEndNodes.add(endIndex)
          refIndexes.set(_refIndex, refIndexes.get(_refIndex) + 1)
          hypIndexes.set(_hypIndex, hypIndexes.get(_hypIndex) + 1)
          break
        }
        _refIndex += 1
        _hypIndex += 1
      }
    }

    return new Set<Index>(
      Array.from(monoMatchEndNodes)
        .filter(([h, r]) => hypIndexes.get(h) === 1 && refIndexes.get(r) === 1)
        .map(([h, r]) => [h - 1, r - 1]),
    )
  }

  /**
   * Create a parent node based on the index of the current node and the operation type.
   */
  private parentNodeFromOpType(index: Index, opType: OpType) {
    const hypIndex = opType !== "DELETE" ? index[0] - 1 : index[0]
    const refIndex = opType !== "INSERT" ? index[1] - 1 : index[1]

    const parentIndex: Index = [hypIndex, refIndex]

    const nodes = this._nodes

    assert(!!nodes, "Called parentIndexFromOpType before instantiating _nodes")

    if (!nodes.has(parentIndex)) {
      nodes.set(parentIndex, new Node(...parentIndex))
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return nodes.get(parentIndex)!
  }

  /**
   * Iterate through the nodes in topological order.
   */
  private *iterTopologicalOrder(
    { reverse } = { reverse: false },
  ): Generator<Index> {
    for (const i of reverse
      ? reversed(range(this.hypDim))
      : range(this.hypDim)) {
      for (const j of reverse
        ? reversed(range(this.refDim))
        : range(this.refDim)) {
        yield [i, j]
      }
    }
  }

  /**
   * Add parents to the node at the given index based on the backtrace matrix.
   */
  private addParentsFromBacktrace(index: Index) {
    const node = this._nodes?.get(index)

    assert(
      !!node,
      `Node at index ${index.toString()} does not exist in the graph.`,
    )

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const opTypeComboCode = this.backtrackMatrix[node.hypIndex]![node.refIndex]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const opTypeCombo = OP_TYPE_COMBO_MAP[opTypeComboCode]!

    for (const opType of opTypeCombo) {
      const parentNode = this.parentNodeFromOpType(node.index, opType)
      node.parents.set(opType, parentNode)
      parentNode.children.set(opType, node)
    }
  }
}

function choose<T>(choices: T[]): T {
  const index = Math.round(Math.random() * choices.length)
  return choices[index] as T
}
