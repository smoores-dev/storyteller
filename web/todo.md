- [ ] series dont get deleted/hidden when all books in the series are
      deleted/hidden
- [x] missing filter doesnt actually filter on missing files
- [x] delete one at a time
- [ ] suffix does not get set properly during import, leading to all books
      sharing same asset folder
- [ ] assets may not get cleared out properly on rename, leaving text cover
      inside old asset folder
- [ ] asset folder stuff feels flaky and unreliable, should be more robust and
      automatic
- [ ] existing readaloud does not get deleted when new readaloud is created
      (should only happen at the end properly)
- [ ] investigate how loose ebook/audiobook entries in database could happen
- [ ] find way to stream/decrease memory usage when scanning
- [ ] ignore rules required for copy/reflink imports, but leads to extremely
      hard to use UI. need some way to filter it, maybe readd the bookUuid
      column to import rules for ignore? also make sure to delete the ignore
      rule when the book is deleted. maybe also add some reason for the ignore
      rule, could reuse the importMode column, but that's kinda awkward. maybe
      they shouldnt be the same table?
