#!/usr/bin/env sh
# Regenerate the oracle data committed with libraries/crengine-xpointer.
#
# Clones the crengine revision named in crengine.version and builds it, unless a checkout
# already exists at $CRENGINE_SRC / $CRENGINE_BUILD (override those paths with the matching
# environment variables).
#
#   tools/crengine-oracle/generate.sh
set -eu

CRENGINE_SRC=${CRENGINE_SRC:-/tmp/crengine-src}
CRENGINE_BUILD=${CRENGINE_BUILD:-/tmp/crengine-build}
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
OUT=$REPO/libraries/crengine-xpointer/src/__test__/oracle
BINARY=${ORACLE_BINARY:-/tmp/crengine-oracle}
REVISION=$(cat "$HERE/crengine.version")

if [ ! -d "$CRENGINE_SRC/.git" ]; then
	echo "cloning crengine into $CRENGINE_SRC"
	git clone --quiet https://github.com/koreader/crengine.git "$CRENGINE_SRC"
fi
if [ "$(git -C "$CRENGINE_SRC" rev-parse HEAD)" != "$REVISION" ]; then
	echo "checking out crengine $REVISION"
	git -C "$CRENGINE_SRC" checkout --quiet --detach "$REVISION"
fi

if [ ! -f "$CRENGINE_BUILD/libcrengine.so" ]; then
	echo "configuring crengine from $CRENGINE_SRC"
	# -DAUTO=off out optional dependencies. zlib and freetype are
	# always required. `-include cstdint` makes up for headers
	# crengine only pulls in when some optional feature is enabled.
	cmake -S "$CRENGINE_SRC" -B "$CRENGINE_BUILD" \
		-DCMAKE_BUILD_TYPE=Release -DAUTO=off -DZLIB=on -DFREETYPE=on \
		-DCMAKE_CXX_FLAGS="-include cstdint" >/dev/null
	cmake --build "$CRENGINE_BUILD" --target crengine -j"$(nproc)"
fi

echo "building crengine-oracle"
g++ -std=c++17 -Wall \
	-I"$CRENGINE_SRC/crengine/include" -I"$CRENGINE_BUILD" \
	"$HERE/src/oracle.cpp" -L"$CRENGINE_BUILD" -lcrengine \
	-Wl,-rpath,"$CRENGINE_BUILD" -o "$BINARY"

# The user-agent sheet a device actually gets. KOReader hands crengine's epub.css to
# LVLoadStylesheetFile (cre.cpp:1766), which resolves that file's single @import itself and
# puts the imported text first: epub.css imports html5.css, so the sheet is html5.css followed
# by epub.css without its @import line. Style tweaks are not appended — see FINDINGS.md.
UA_CSS=${ORACLE_UA_CSS_FILE:-/tmp/crengine-ua.css}
{
	cat "$CRENGINE_SRC/cr3gui/data/html5.css"
	printf '\r\n'
	grep -v '@import' "$CRENGINE_SRC/cr3gui/data/epub.css"
} >"$UA_CSS"
UA_CSS_SHA=$(sha256sum "$UA_CSS" | cut -d' ' -f1)

if [ -z "${ORACLE_FONT:-}" ]; then
	echo "generate.sh: ORACLE_FONT must name a TTF; crengine applies no styles without one" >&2
	exit 2
fi

FIXTURES=${ORACLE_FIXTURES:-/tmp/oracle-fixtures}
mkdir -p "$FIXTURES"
mkdir -p "$OUT"
printf '[' >"$OUT/crengine.json"
first=true
for fixture in "$HERE"/fixtures/*.xhtml; do
	name=$(basename "$fixture" .xhtml)
	epub=$FIXTURES/$name.epub
	"$HERE/package-epub.sh" "$fixture" "$epub"
	# Books whose layout depends on the screen width change DOM shape with it, so the width
	# belongs to the fixture.
	width=600
	if [ -f "${fixture%.xhtml}.width" ]; then
		width=$(cat "${fixture%.xhtml}.width")
	fi
	echo "  $name (width $width)"
	if [ "$first" != true ]; then
		printf ',' >>"$OUT/crengine.json"
	fi
	first=false
	ORACLE_FIXTURE_NAME=$name ORACLE_WIDTH=$width ORACLE_UA_CSS="$UA_CSS" \
		ORACLE_SOURCE="$FIXTURES/$name.chap1.xhtml" \
		ORACLE_UA_CSS_SHA256=$UA_CSS_SHA "$BINARY" "$epub" >>"$OUT/crengine.json"
done
printf ']\n' >>"$OUT/crengine.json"

echo "wrote $OUT/crengine.json ($(wc -c <"$OUT/crengine.json") bytes)"
