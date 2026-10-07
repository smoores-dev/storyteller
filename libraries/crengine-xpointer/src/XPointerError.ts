/** The error thrown by {@link buildXPointer} for a position it cannot express. */
export class XPointerError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = "XPointerError"
  }
}
