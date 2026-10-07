// crengine-oracle: ask crengine what its xpointers are, and print the answers as JSON.
//
// The library in libraries/crengine-xpointer is a port of crengine's xpointer algorithm, so
// its tests should not encode a *reading* of the C++ — they should encode crengine's answers.
// For each fixture this program
//
//   * loads the fixture with LVDocView, the interface KOReader drives, so the document is
//     built by the same code a device runs — element tables from fb2def.h, render props and
//     styles, the archive as container, and the chapters' own stylesheets,
//   * dumps the resulting tree, so the test can rebuild an identical tree in @xmldom/xmldom
//     instead of relying on two parsers agreeing,
//   * asks crengine for the xpointer string of every addressible node at several offsets,
//   * and asks crengine to resolve every one of those strings plus a set of adversarial ones.
//
// Only the current DOM version is covered: the version is selected by the prop
// `crengine.render.requested_dom_version`, read in LVDocView::createEmptyDocument()
// (lvdocview.cpp:4972), and LVDocView offers no public way to set it (m_props is private, and
// there is no setProps/propsChange/ReloadDocument). The pre-20260812 cosmetic dialect is
// therefore not oracle-verified — acceptable, since newly written pointers are all current.
//
// Nothing here is used at test time; the JSON it writes is committed with the library.
//
// Usage: crengine-oracle <book.epub> > oracle.json

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <map>
#include <string>
#include <vector>

#include "fb2def.h"
#include "lvfntman.h"
#include "lvstream.h"
#include "lvtinydom.h"
#include "lvxml.h"
#include "lvdocview.h"

namespace {

/// The DOM version the library's default output matches: crengine today, which writes an
/// explicit `[1]` for a sibling that is first of its kind.
const lUInt32 kCurrentDomVersion = 20260812;

/// Whether styles reached this document, recorded in the output so committed data states its
/// own provenance instead of leaving it to be inferred.
bool gStylesEnabled = false;
lUInt32 gDocFlags = 0;
int gWidth = 600;
int gHeight = 800;
std::string gUaCss;
std::string gUaCssSha256;
std::string gFixtureName;
std::string gSource;

/// crengine applies no CSS until setRenderProps() has been called — `onBodyEnter()` gates the
/// cascade on `isDefStyleSet()` (lvtinydom.cpp:6219) — and that needs a real font
/// (lvtinydom.cpp:5155). LVDocView does both during load, so all that is left is to register a
/// font it can pick up.
bool fontsReady() {
    static bool tried = false;
    static bool ready = false;
    if (!tried) {
        tried = true;
        const char * path = std::getenv("ORACLE_FONT");
        if (path != nullptr && *path != '\0' && InitFontManager(lString8(""))) {
            fontMan->RegisterFont(lString8(path));
            ready = true;
        } else {
            std::fprintf(stderr, "crengine-oracle: ORACLE_FONT unset or unusable; no styles\n");
        }
    }
    return ready;
}

std::string readFile(const char * path) {
    std::ifstream stream(path);
    return std::string((std::istreambuf_iterator<char>(stream)), std::istreambuf_iterator<char>());
}

/// Paths that are not derived from the tree, chosen to hit the corners of the grammar.
const char * const kAdversarial[] = {
    "",
    "/",
    ".",
    "//",
    "/p",
    "/p[1]",
    "/p[0]",
    "/p[-1]",
    "/p[ 2 ]",
    "/p[0x2]",
    "/p[2x]",
    "/p[2/",
    "/p[]",
    "/p[1",
    "/0",
    "/1",
    "/2",
    "/3",
    "/99",
    "/text()",
    "/text()[1]",
    "/text()[2]",
    "/text()[0]",
    "/p[1]/text()",
    "/p[1]/text()[1].0",
    "/p[1].0",
    "/p[1].1",
    "/p[1].9999",
    "/1/1",
    "/1/1/1",
    "/1/1/1/1",
    "/nope",
    "/P[1]",
    ".-1",
    "#a",
    "#b",
    "#missing",
    "p[1]",
    "/p[1]/.",
    "/p[1]x",
    "/div[1]/div[1]/p[1]/text()[1].0",
    "/body[1]/text()[1]",
    "/body[1].0",
    // Id resolution. `ids.xhtml` carries `id="a1"`, `id="h1"`, `name="anchor1"` on an `<a>`
    // and `name="later"` on a `<p>`; in EPUB mode crengine rewrites per-file ids with a
    // `_doc_fragment_N` prefix, so both spellings are asked in both modes.
    "#a1",
    "#anchor1",
    "#h1",
    "#s1",
    "#later",
    "#_doc_fragment_0_a1",
    "#_doc_fragment_0_anchor1",
    "#_doc_fragment_0_later",
};

std::string jsonString(const lString32 & value) {
    // ASCII-only output: every non-ASCII unit becomes a \u escape, so the JSON needs no
    // encoding assumption and diffs cleanly.
    std::string out = "\"";
    const auto emitUnit = [&](lUInt32 unit) {
        static const char * kHex = "0123456789abcdef";
        out += "\\u";
        for (int shift = 12; shift >= 0; shift -= 4) {
            out += kHex[(unit >> shift) & 0xf];
        }
    };
    for (int i = 0; i < value.length(); i++) {
        const lUInt32 c = value[i];
        if (c < 0x80 && c >= 0x20 && c != '"' && c != '\\') {
            out += static_cast<char>(c);
            continue;
        }
        if (c > 0xffff) {
            const lUInt32 surrogate = c - 0x10000;
            emitUnit(0xd800 + (surrogate >> 10));
            emitUnit(0xdc00 + (surrogate & 0x3ff));
        } else {
            emitUnit(c);
        }
    }
    out += '"';
    return out;
}

std::string escapeLiteral(const char * value) {
    static const char * kHex = "0123456789abcdef";
    std::string out = "\"";
    for (const char * p = value; *p; p++) {
        const unsigned char c = static_cast<unsigned char>(*p);
        switch (c) {
        case '"':
            out += "\\\"";
            break;
        case '\\':
            out += "\\\\";
            break;
        case '\n':
            out += "\\n";
            break;
        case '\r':
            out += "\\r";
            break;
        case '\t':
            out += "\\t";
            break;
        default:
            // Control characters are the rest; byte values above 0x7f pass through, as JSON
            // allows, since everything crengine hands back is UTF-8.
            if (c < 0x20) {
                out += "\\u00";
                out += kHex[c >> 4];
                out += kHex[c & 0x0F];
            } else {
                out += static_cast<char>(c);
            }
        }
    }
    return out + '"';
}

/// A parsed fixture: the document, plus an id for each of its nodes.
///
/// crengine hands out `ldomNode *` wrappers over its node storage, so nodes are identified by
/// data index; the ids assigned here are a pre-order numbering over the root's children, which
/// is how the test's rebuilt tree names the same nodes.
struct Fixture {
    ldomDocument * document = nullptr;
    std::map<lUInt32, int> ids;      // data index -> pre-order id
    std::map<int, lUInt32> indexes;  // pre-order id -> data index
    int nextId = 1;
};

/// The two node kinds crengine's tree can hold. Guarding on this keeps anything else out of the
/// dump visibly rather than silently.
bool isAddressible(ldomNode * node) {
    return node->isElement() || node->isText();
}

/// Whether to ask crengine for a pointer to this node. Boxing nodes (`autoBoxing`, and the
/// pseudo-element boxes) exist in the tree but never appear in a normalized pointer string —
/// and `ldomXPointer(boxing, -1).toStringV2()` segfaults, so they are asked about neither.
bool isPointerTarget(ldomNode * node) {
    return isAddressible(node) && !node->isBoxingNode(true);
}

int assignIds(Fixture & fixture, ldomNode * node) {
    const int id = fixture.nextId++;
    fixture.ids[node->getDataIndex()] = id;
    fixture.indexes[id] = node->getDataIndex();
    for (int i = 0; i < node->getChildCount(); i++) {
        ldomNode * child = node->getChildNode(i);
        if (isAddressible(child)) {
            assignIds(fixture, child);
        }
    }
    return id;
}

int idOf(const Fixture & fixture, lUInt32 dataIndex) {
    const auto found = fixture.ids.find(dataIndex);
    return found == fixture.ids.end() ? -1 : found->second;
}

int idOf(const Fixture & fixture, ldomNode * node) {
    return node == nullptr ? -1 : idOf(fixture, node->getDataIndex());
}

ldomNode * nodeAt(const Fixture & fixture, int id) {
    const auto found = fixture.indexes.find(id);
    return found == fixture.indexes.end() ? nullptr
                                          : fixture.document->getTinyNode(found->second);
}

std::string dumpNode(Fixture & fixture, ldomNode * node);

/// The element's attributes, as crengine stored them.
std::string dumpAttributes(ldomNode * node) {
    std::string out = "[";
    for (int i = 0; i < node->getAttrCount(); i++) {
        const lxmlAttribute * attribute = node->getAttribute(i);
        if (attribute == nullptr) {
            continue;
        }
        if (out != "[") {
            out += ',';
        }
        ldomDocument * document = node->getDocument();
        const lString32 ns = document->getNsName(attribute->nsid);
        out += "[" + jsonString(ns.empty() ? document->getAttrName(attribute->id)
                                           : ns + U":" + document->getAttrName(attribute->id));
        out += ',' + jsonString(document->getAttrValue(attribute->index)) + "]";
    }
    return out + "]";
}

/// The children crengine would let an xpointer step through, as JSON.
std::string dumpChildren(Fixture & fixture, ldomNode * node) {
    std::string out = "[";
    for (int i = 0; i < node->getChildCount(); i++) {
        ldomNode * child = node->getChildNode(i);
        if (!isAddressible(child)) {
            continue;
        }
        if (out != "[") {
            out += ',';
        }
        out += dumpNode(fixture, child);
    }
    return out + "]";
}

std::string dumpNode(Fixture & fixture, ldomNode * node) {
    // Read everything out of `node` before recursing: crengine's node accessors are cheap
    // wrappers over the document, and holding a node across a subtree walk invites mixing up
    // one wrapper for another.
    const int id = idOf(fixture, node);
    const bool isElement = node->isElement();
    const bool boxing = node->isBoxingNode(true);
    const lString32 name = node->getNodeName();
    const lString32 text = node->getText();
    const std::string attributes = isElement ? dumpAttributes(node) : "[]";
    std::string out = "{\"id\":" + std::to_string(id);
    if (isElement) {
        out += ",\"kind\":\"element\",\"name\":" + jsonString(name);
        out += ",\"boxing\":" + std::string(boxing ? "true" : "false");
        out += ",\"attrs\":" + attributes;
        if (gStylesEnabled) {
            // The two computed properties that decide the shape of the tree, reported the way
            // crengine decides them: `display > css_d_inline && != css_d_none` counts
            // inline-block, tables and list-item as block (lvtinydom.cpp:6029, cssdef.h).
            const css_style_ref_t style = node->getStyle();
            const bool block = !style.isNull() && style->display > css_d_inline &&
                style->display != css_d_none;
            const bool pre = !style.isNull() && style->white_space >= css_ws_pre_line;
            out += ",\"block\":" + std::string(block ? "true" : "false");
            out += ",\"pre\":" + std::string(pre ? "true" : "false");
            // Raw enum values too: when a sheet produces a surprising `block`, the number says
            // which `display` value won, which is what points at the rule.
            out += ",\"display\":" + std::to_string((int)style->display);
            out += ",\"whiteSpace\":" + std::to_string((int)style->white_space);
        }
    } else {
        out += ",\"kind\":\"text\",\"text\":" + jsonString(text);
    }
    return out + ",\"children\":" + dumpChildren(fixture, node) + "}";
}

/// The offsets worth asking about for a node: none (a path), the first position, and the far
/// end of a text node or element.
std::vector<int> offsetsFor(ldomNode * node) {
    std::vector<int> offsets = {-1, 0};
    if (node->isText()) {
        const int length = static_cast<int>(node->getText().length());
        if (length > 0) {
            offsets.push_back(length);
        }
    } else if (node->getChildCount() > 0) {
        offsets.push_back(static_cast<int>(node->getChildCount()));
    }
    return offsets;
}

void collectPointers(Fixture & fixture, ldomNode * node,
                     std::vector<std::pair<int, int>> & out) {
    if (isPointerTarget(node)) {
        for (const int offset : offsetsFor(node)) {
            out.emplace_back(idOf(fixture, node), offset);
        }
    }
    for (int i = 0; i < node->getChildCount(); i++) {
        ldomNode * child = node->getChildNode(i);
        if (isAddressible(child)) {
            collectPointers(fixture, child, out);
        }
    }
}

lString32 pointerAt(ldomNode * node, int offset) {
    return ldomXPointer(node, offset).toStringV2();
}

/// Ask crengine to resolve `xpointer`, and report where it landed.
void dumpResolution(const Fixture & fixture, const lString32 & xpointer, std::string & out) {
    const ldomXPointer pointer = fixture.document->createXPointer(xpointer);
    const bool isNull = pointer.isNull();
    const lUInt32 dataIndex = isNull ? 0 : pointer.getNode()->getDataIndex();
    const int offset = pointer.getOffset();
    out += "{\"xpointer\":" + jsonString(xpointer);
    out += isNull ? ",\"id\":null,\"offset\":null}"
                  : ",\"id\":" + std::to_string(idOf(fixture, dataIndex)) +
                        ",\"offset\":" + std::to_string(offset) + "}";
}

/// Load one fixture the way a reader does: through LVDocView, which is what KOReader drives.
/// Everything the hand-wired path got wrong — element tables, styles, the archive container,
/// the chapter's own stylesheets — is then set up by the code a device actually runs.
Fixture * load(const std::string & path) {
    // One view per process: crengine carries global state across documents that does not
    // survive being fed several in a row, and generation is a script anyway.
    static LVDocView * view = nullptr;
    if (view == nullptr) {
        if (!fontsReady()) {
            return nullptr;
        }
        view = new LVDocView(-1, true);
        if (!gUaCss.empty()) {
            // The reader's own sheet and its style tweaks go in here: LVDocView::
            // setStyleSheet() hands the text to ldomDocument::setStyleSheet(css, replace=true),
            // which parses it with useragent_sheet=true.
            view->setStyleSheet(lString8(gUaCss.c_str()), false);
        }
        view->Resize(gWidth, gHeight);
    }
    if (!view->LoadDocument(path.c_str())) {
        return nullptr;
    }
    view->Resize(gWidth, gHeight);
    ldomDocument * document = view->getDocument();
    if (document == nullptr) {
        return nullptr;
    }
    gStylesEnabled = document->isDefStyleSet();
    gDocFlags = document->getDocFlags();
    Fixture * fixture = new Fixture();
    fixture->document = document;
    assignIds(*fixture, document->getRootNode());
    return fixture;
}

std::string dumpPointers(Fixture & fixture, ldomNode * root,
                         const std::vector<std::pair<int, int>> & pointers) {
    std::string out = "[";
    for (size_t i = 0; i < pointers.size(); i++) {
        if (i > 0) {
            out += ',';
        }
        out += "{\"id\":" + std::to_string(pointers[i].first);
        out += ",\"offset\":" + std::to_string(pointers[i].second);
        out += ",\"xpointer\":" + jsonString(pointerAt(nodeAt(fixture, pointers[i].first),
                                                       pointers[i].second));
        out += '}';
    }
    return out + "]";
}

void dumpFixture(const char * path, std::string & out) {
    Fixture * current = load(path);
    if (current == nullptr) {
        std::fprintf(stderr, "crengine-oracle: crengine could not load %s\n", path);
        return;
    }
    const std::string currentTree = dumpChildren(*current, current->document->getRootNode());

    std::vector<std::pair<int, int>> pointers;
    collectPointers(*current, current->document->getRootNode(), pointers);

    out += "{\"fixture\":" + escapeLiteral(gFixtureName.empty() ? path : gFixtureName.c_str());
    out += ",\"domVersion\":" + std::to_string(kCurrentDomVersion);
    out += ",\"stylesEnabled\":" + std::string(gStylesEnabled ? "true" : "false");
    // Bit 1 is DOC_FLAG_ENABLE_INTERNAL_STYLES, which is what lets a document's own <style>
    // and <link rel=stylesheet> affect it at all.
    out += ",\"docFlags\":" + std::to_string(gDocFlags);
    out += ",\"screenWidth\":" + std::to_string(gWidth);
    // How much user-agent CSS was handed to the view, so a run that silently lost it is
    // visible in the data. generate.sh records the sha256 of the file it passed.
    out += ",\"uaCssBytes\":" + std::to_string(gUaCss.size());
    if (!gUaCssSha256.empty()) {
        out += ",\"uaCssSha256\":" + escapeLiteral(gUaCssSha256.c_str());
    }
    out += ",\"tree\":" + currentTree;
    if (!gSource.empty()) {
        // The chapter source, so a test can parse the same bytes with another parser and ask
        // whether the library still finds what crengine found. Emitted after the tree because
        // it makes the dump harder to read at the top.
        out += ",\"source\":" + escapeLiteral(gSource.c_str());
    }
    out += ",\"pointers\":" + dumpPointers(*current, current->document->getRootNode(), pointers);

    // Everything crengine is asked to resolve: the strings it just produced, so the tests
    // compare the library's resolver against crengine's own on crengine's own output, and the
    // fixed adversarial set.
    out += ",\"resolves\":[";
    const auto emit = [&](const lString32 & xpointer) {
        if (out.back() != '[' && out.back() != ',') {
            out += ',';
        }
        dumpResolution(*current, xpointer, out);
    };
    for (const auto & pointer : pointers) {
        emit(pointerAt(nodeAt(*current, pointer.first), pointer.second));
    }
    for (const char * adversarial : kAdversarial) {
        emit(Utf8ToUnicode(adversarial));
    }
    out += "]}";

    delete current;
}

}  // namespace

// The view is built once and each fixture is loaded as a separate process: crengine keeps
// global state across documents, and generation is a script anyway.
int main(int argc, char ** argv) {
    if (argc != 2) {
        std::fprintf(stderr, "usage: crengine-oracle <book.epub> > oracle.json\n");
        return 2;
    }
    if (const char * name = std::getenv("ORACLE_FIXTURE_NAME"); name != nullptr && *name != '\0') {
        // The path is in /tmp, so record the fixture the repository actually names.
        gFixtureName = name;
    }
    if (const char * width = std::getenv("ORACLE_WIDTH"); width != nullptr && *width != '\0') {
        gWidth = std::atoi(width);
    }
    if (const char * height = std::getenv("ORACLE_HEIGHT"); height != nullptr && *height != '\0') {
        gHeight = std::atoi(height);
    }
    if (const char * uaCss = std::getenv("ORACLE_UA_CSS"); uaCss != nullptr && *uaCss != '\0') {
        gUaCss = readFile(uaCss);
        if (gUaCss.empty()) {
            std::fprintf(stderr, "crengine-oracle: cannot read ORACLE_UA_CSS %s\n", uaCss);
            return 1;
        }
    }
    if (const char * source = std::getenv("ORACLE_SOURCE"); source != nullptr && *source != '\0') {
        gSource = readFile(source);
        if (gSource.empty()) {
            std::fprintf(stderr, "crengine-oracle: cannot read ORACLE_SOURCE %s\n", source);
            return 1;
        }
    }
    if (const char * sha = std::getenv("ORACLE_UA_CSS_SHA256"); sha != nullptr && *sha != '\0') {
        gUaCssSha256 = sha;
    }
    std::string out;
    dumpFixture(argv[1], out);
    if (out.empty()) {
        return 1;
    }
    std::fputs(out.c_str(), stdout);
    std::fputc('\n', stdout);
    return 0;
}
