import { UriFragment } from "@storyteller-platform/uri-fragment"

export class UriReference {
  private url: URL
  public fragment: UriFragment

  constructor(reference: string, fragment?: UriFragment) {
    this.url = new URL(reference, "publication:///")
    if (fragment) {
      this.url.hash = fragment.toString()
      this.fragment = fragment
    } else {
      this.fragment = new UriFragment(this.url.hash ? this.url.hash : undefined)
    }
  }

  get fragmentKind() {
    if (this.fragment.directive.text.length) return "text"

    return this.fragment.identifier?.kind ?? null
  }

  get hrefPathname() {
    return this.url.pathname.slice(1)
  }

  get href() {
    return `${this.hrefPathname}${this.fragment.toString()}`
  }

  toString() {
    return this.href
  }
}
