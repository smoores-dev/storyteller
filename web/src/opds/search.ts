export const createOpenSearchDescription = () => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Storyteller Search</ShortName>
  <Description>Search your Storyteller library.</Description>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition"
     template="/opds/search?search={searchTerms}" />
</OpenSearchDescription>`
}
