import { ATOM_ACQ } from "@storyteller-platform/opds"

export const createOpenSearchDescription = () => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Storyteller Search</ShortName>
  <Description>Search your Storyteller library.</Description>
  <Url type="${ATOM_ACQ}"
     template="/opds/search?search={searchTerms}" />
</OpenSearchDescription>`
}
