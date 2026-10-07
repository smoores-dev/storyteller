#!/bin/sh
# Package one fixture into the smallest archive that looks like a real EPUB.
#
# The oracle loads fixtures through LVDocView, which wants a book, so every fixture becomes
# a two-chapter EPUB: chapter 1 is the fixture body verbatim, chapter 2 is a fixed short
# chapter. Two spine items matter — each becomes its own `DocFragment` child of `body`, and
# `DocFragment[2]` is the index a single-chapter fixture can never exercise.
#
#   package-epub.sh fixtures/styles.xhtml /tmp/oracle-fixtures/styles.epub
#
# Optional sidecars next to the fixture:
#
#   <name>.css    linked as OEBPS/style.css from chapter 1's <head>
#   <name>.width  screen width in px, read by generate.sh, not packaged
#
# Writes <out>.chap1.xhtml next to the archive: the chapter source, byte for byte.
set -eu

fixture=$1
out=$2
name=$(basename "$fixture" .xhtml)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [ ! -f "$fixture" ]; then
	echo "package-epub.sh: no such fixture: $fixture" >&2
	exit 2
fi

mkdir -p "$work/META-INF" "$work/OEBPS"

# Stored (method 0) and written first, as the EPUB spec requires.
printf 'application/epub+zip' >"$work/mimetype"

cat >"$work/META-INF/container.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
XML

# A real 1x1 PNG, so `<img src="a.png">` loads an image and crengine computes real image
# metrics — the state in which it inserts `autoBoxing` nodes around inline runs.
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==' |
	base64 -d >"$work/OEBPS/a.png"

{
	printf '<?xml version="1.0" encoding="utf-8"?>\n'
	printf '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">\n'
	printf '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
	printf '<dc:identifier id="id">oracle-%s</dc:identifier>\n' "$name"
	printf '<dc:title>oracle fixture %s</dc:title><dc:language>en</dc:language>\n' "$name"
	printf '</metadata>\n<manifest>\n'
	printf '<item id="c1" href="chap1.xhtml" media-type="application/xhtml+xml"/>\n'
	printf '<item id="c2" href="chap2.xhtml" media-type="application/xhtml+xml"/>\n'
	printf '<item id="img" href="a.png" media-type="image/png"/>\n'
	if [ -f "${fixture%.xhtml}.css" ]; then
		printf '<item id="css" href="style.css" media-type="text/css"/>\n'
	fi
	printf '</manifest>\n<spine>\n<itemref idref="c1"/>\n<itemref idref="c2"/>\n</spine>\n'
	printf '</package>\n'
} >"$work/OEBPS/content.opf"

# The fixture body goes in verbatim — no added newlines — because fixtures like
# whitespace.xhtml are precisely about what surrounds them. The chapter is also kept next to
# the archive as <name>.chap1.xhtml: the tests need the exact bytes crengine parsed, so they
# can parse them with @xmldom/xmldom and compare against crengine's answers.
{
	printf '<?xml version="1.0" encoding="utf-8"?>\n'
	printf '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en"><head>'
	printf '<title>oracle fixture %s</title>\n' "$name"
	if [ -f "${fixture%.xhtml}.css" ]; then
		printf '<link rel="stylesheet" href="style.css" type="text/css"/>\n'
	fi
	printf '</head><body>'
	cat "$fixture"
	printf '</body></html>\n'
} >"${out%.epub}.chap1.xhtml"
cp "${out%.epub}.chap1.xhtml" "$work/OEBPS/chap1.xhtml"

if [ -f "${fixture%.xhtml}.css" ]; then
	cat "${fixture%.xhtml}.css" >"$work/OEBPS/style.css"
fi

cat >"$work/OEBPS/chap2.xhtml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en"><head><title>Two</title></head><body><p>Chapter two</p><p>Second <b>para</b></p></body></html>
XML

rm -f "$out"
# `zip -r` on a directory would store the directory entries too; listing them is fine and
# keeps the archive byte-stable across runs, which keeps regenerated JSON reviewable.
(
	cd "$work" &&
		zip -q -X -0 "$out" mimetype &&
		zip -q -X -9 "$out" META-INF/container.xml &&
		zip -q -X -9 "$out" OEBPS/content.opf OEBPS/chap1.xhtml OEBPS/chap2.xhtml OEBPS/a.png
)
if [ -f "${fixture%.xhtml}.css" ]; then
	(cd "$work" && zip -q -X -9 "$out" OEBPS/style.css)
fi

