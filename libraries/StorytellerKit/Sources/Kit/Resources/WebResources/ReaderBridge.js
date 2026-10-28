// Tracks command completion and user gestures for Swift.
export class ReaderBridge {
  documentID =
    globalThis.crypto?.randomUUID?.() ?? `doc-${Date.now()}-${Math.random()}`
  ready = false
  sequence = 0
  location = null
  gesture = null
  command = null
  #receipts = new Map()
  #previousGesture = null
  #readFacts
  #execute
  #post

  constructor({ readFacts, execute, post }) {
    this.#readFacts = readFacts
    this.#execute = execute
    this.#post = post
  }

  snapshot(playhead = null) {
    return {
      documentID: this.documentID,
      ready: this.ready,
      sequence: this.sequence,
      location: this.location,
      command: this.command,
      gesture: this.gesture,
      ...this.#readFacts(playhead),
    }
  }

  #report() {
    this.sequence++
    this.#post(this.snapshot())
  }

  relocate(location) {
    this.location = location
    this.#report()
  }

  interaction({ active, moved = false }) {
    if (active) {
      this.#previousGesture = this.gesture?.moved ? this.gesture : null
      this.gesture = {
        id: `gesture-${++this.sequence}`,
        active: true,
        moved: false,
        location: null,
      }
      if (this.command?.status === "running") {
        this.#finishCommand(
          this.command.id,
          "interrupted",
          "User input took over",
        )
      }
    } else {
      this.gesture = moved
        ? { ...this.gesture, active: false, moved, location: this.location }
        : (this.#previousGesture ?? { ...this.gesture, active: false })
      this.#previousGesture = null
    }
    this.#report()
  }

  acknowledge(documentID, commandID, gestureID) {
    if (documentID !== this.documentID) return
    if (
      commandID &&
      this.command?.id === commandID &&
      this.command.status !== "running"
    )
      this.command = null
    if (gestureID && this.gesture?.id === gestureID && !this.gesture.active)
      this.gesture = null
  }

  dispatch(request) {
    if (request.documentID !== this.documentID)
      return { status: "staleDocument" }
    const previous = this.#receipts.get(request.id)
    if (previous) {
      this.command = previous
      this.#report()
      return previous
    }
    if (
      !this.ready ||
      this.gesture?.active ||
      this.gesture?.moved ||
      this.#readFacts(null).navigationBlocked ||
      this.command?.status === "running"
    ) {
      return this.#finishCommand(
        request.id,
        "rejected",
        "Renderer busy or unavailable",
      )
    }
    const receipt = { id: request.id, status: "running", location: null }
    this.command = receipt
    this.#receipts.set(request.id, receipt)
    this.#report()
    void this.#run(request)
    return receipt
  }

  async #run(request) {
    try {
      const status = await this.#execute(request)
      // A gesture may have interrupted this command while it awaited layout.
      if (this.#receipts.get(request.id)?.status !== "running") return
      if (status === "rejected" || status === "interrupted") {
        this.#finishCommand(request.id, status)
        return
      }
      if (!this.location)
        throw new Error("Navigation completed without a location")
      this.#finishCommand(request.id, "completed")
    } catch (error) {
      if (this.#receipts.get(request.id)?.status === "running") {
        this.#finishCommand(request.id, "failed", String(error))
      }
    }
  }

  #finishCommand(id, status, error = null) {
    const receipt = { id, status, error, location: this.location }
    this.#receipts.set(id, receipt)
    // Keep recent receipts to deduplicate retries after lost replies.
    while (this.#receipts.size > 64)
      this.#receipts.delete(this.#receipts.keys().next().value)
    this.command = receipt
    this.#report()
    return receipt
  }
}
