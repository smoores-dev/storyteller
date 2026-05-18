#!/usr/bin/env python3
# License: GPLv3 (derived from calibre's epub polish pipeline,
#                 Copyright 2018, Kovid Goyal <kovid at kovidgoyal.net>)
'''
Standalone CLI tool to upgrade EPUB 2 files to EPUB 3.

This is a single-file port of the essential parts of calibre's
``ebook-polish --upgrade-book`` pipeline. It has no dependencies on the
calibre codebase and can be copied into any other project as-is.

Runtime requirements:
    - Python 3.8+
    - lxml

Usage:
    python3 epub3_upgrade_cli.py input.epub [output.epub]

What it does:
    - Parses META-INF/container.xml to find the OPF.
    - Upgrades OPF metadata to EPUB 3 conventions (identifiers, title,
      authors, languages, date, rendition meta, cover-image property,
      dcterms:modified, stripped invalid DC attrs).
    - Scans XHTML documents and adds manifest item "properties" for
      svg/scripted/mathml/switch.
    - Parses the NCX into a TOC tree and generates a nav.xhtml with
      <nav epub:type="toc"> and <nav epub:type="landmarks">.
    - Removes the NCX file and the <guide> element.
    - Fixes common font MIME types.
    - Bumps <package version="3.0"> and writes the result to a new .epub.

What it intentionally does NOT do (use calibre's ebook-polish for these):
    - Migrate Adobe-obfuscated fonts to IDPF obfuscation.
    - Transform calibre-specific metadata (rating, series, timestamp,
      user custom columns).
    - Populate the nav page-list.
'''

import argparse
import os
import posixpath
import re
import sys
import zipfile
from datetime import datetime, timezone
from urllib.parse import unquote, urlparse

from lxml import etree
from lxml import html as lxml_html


# ---------------------------------------------------------------------------
# Namespaces and MIME types
# ---------------------------------------------------------------------------

OPF_NS = 'http://www.idpf.org/2007/opf'
DC_NS = 'http://purl.org/dc/elements/1.1/'
XHTML_NS = 'http://www.w3.org/1999/xhtml'
EPUB_NS = 'http://www.idpf.org/2007/ops'
NCX_NS = 'http://www.daisy.org/z3986/2005/ncx/'
CONTAINER_NS = 'urn:oasis:names:tc:opendocument:xmlns:container'
XML_NS = 'http://www.w3.org/XML/1998/namespace'

NSMAP = {
    'opf': OPF_NS,
    'dc': DC_NS,
    'h': XHTML_NS,
    'epub': EPUB_NS,
    'ncx': NCX_NS,
    'c': CONTAINER_NS,
}


def opf(tag):
    return f'{{{OPF_NS}}}{tag}'


def dc(tag):
    return f'{{{DC_NS}}}{tag}'


def xhtml(tag):
    return f'{{{XHTML_NS}}}{tag}'


OEB_DOCS = {
    'application/xhtml+xml',
    'application/vnd.adobe-page-template+xml',
    'application/x-dtbook+xml',
    'text/html',
}

OEB_FONTS = {
    'application/vnd.ms-opentype',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/x-font-truetype',
    'application/font-sfnt',
    'application/font-woff',
    'application/font-woff2',
    'font/woff',
    'font/woff2',
    'font/otf',
    'font/ttf',
    'font/sfnt',
}

FONT_MIME_BY_EXT = {
    '.ttf': 'application/font-sfnt',
    '.otf': 'application/font-sfnt',
    '.woff': 'application/font-woff',
    '.woff2': 'font/woff2',
}

# Calibre's guide type -> EPUB3 epub:type mapping (upgrade.py guide_epubtype_map)
GUIDE_TO_EPUBTYPE = {
    'acknowledgements':   'acknowledgments',
    'other.afterword':    'afterword',
    'other.appendix':     'appendix',
    'other.backmatter':   'backmatter',
    'bibliography':       'bibliography',
    'text':               'bodymatter',
    'other.chapter':      'chapter',
    'colophon':           'colophon',
    'other.conclusion':   'conclusion',
    'other.contributors': 'contributors',
    'copyright-page':     'copyright-page',
    'cover':              'cover',
    'dedication':         'dedication',
    'other.division':     'division',
    'epigraph':           'epigraph',
    'other.epilogue':     'epilogue',
    'other.errata':       'errata',
    'other.footnotes':    'footnotes',
    'foreword':           'foreword',
    'other.frontmatter':  'frontmatter',
    'glossary':           'glossary',
    'other.halftitlepage':'halftitlepage',
    'other.imprint':      'imprint',
    'other.imprimatur':   'imprimatur',
    'index':              'index',
    'other.introduction': 'introduction',
    'other.landmarks':    'landmarks',
    'other.loa':          'loa',
    'loi':                'loi',
    'lot':                'lot',
    'other.lov':          'lov',
    'notes':              '',
    'other.notice':       'notice',
    'other.other-credits':'other-credits',
    'other.part':         'part',
    'other.preamble':     'preamble',
    'preface':            'preface',
    'other.prologue':     'prologue',
    'other.rearnotes':    'rearnotes',
    'other.subchapter':   'subchapter',
    'title-page':         'titlepage',
    'toc':                'toc',
    'other.volume':       'volume',
    'other.warning':      'warning',
}


# ---------------------------------------------------------------------------
# EPUB container: in-memory representation of the zip contents
# ---------------------------------------------------------------------------

class EpubContainer:
    '''In-memory EPUB. Files are stored as {name: bytes} where names are
    zip-relative POSIX paths. Parsed XML trees are cached per name and
    re-serialized at commit time for any name in self.dirty.'''

    def __init__(self, path):
        self.path = path
        self.entries = {}        # name -> bytes
        self.order = []          # preserve original zip entry order
        self.dirty = set()       # names whose parsed tree should be re-serialized
        self.parsed_cache = {}   # name -> lxml element
        self._manifest_index = None  # cached {name: <item>} lookup

        with zipfile.ZipFile(path, 'r') as zf:
            for info in zf.infolist():
                if info.filename.endswith('/'):
                    continue
                self.entries[info.filename] = zf.read(info.filename)
                self.order.append(info.filename)

        container_xml = self.entries.get('META-INF/container.xml')
        if not container_xml:
            raise ValueError(f'{path}: missing META-INF/container.xml')
        croot = etree.fromstring(container_xml)
        rootfile = croot.find(f'.//{{{CONTAINER_NS}}}rootfile')
        if rootfile is None or not rootfile.get('full-path'):
            raise ValueError(f'{path}: no rootfile in container.xml')
        self.opf_name = rootfile.get('full-path')
        if self.opf_name not in self.entries:
            raise ValueError(f'{path}: OPF not found at {self.opf_name}')
        self.opf_dir = posixpath.dirname(self.opf_name)

    # -- parsing ------------------------------------------------------------

    def parse(self, name):
        if name in self.parsed_cache:
            return self.parsed_cache[name]
        data = self.entries[name]
        try:
            tree = etree.fromstring(data)
        except etree.XMLSyntaxError:
            # Fall back to HTML parser for legacy HTML content.
            tree = lxml_html.fromstring(data)
        self.parsed_cache[name] = tree
        return tree

    @property
    def opf(self):
        return self.parse(self.opf_name)

    def opf_xpath(self, expr):
        return self.opf.xpath(expr, namespaces=NSMAP)

    # -- href <-> name resolution ------------------------------------------

    def href_to_name(self, href, base):
        '''Resolve a relative href (as it appears inside *base*) to a
        zip-relative POSIX name.'''
        if href is None:
            return None
        path = unquote(urlparse(href).path)
        if not path:
            return base
        if path.startswith('/'):
            return posixpath.normpath(path.lstrip('/'))
        base_dir = posixpath.dirname(base)
        return posixpath.normpath(posixpath.join(base_dir, path)) if base_dir \
            else posixpath.normpath(path)

    def name_to_href(self, name, base):
        '''Compute an href to *name* that is relative to *base*.'''
        base_dir = posixpath.dirname(base)
        if not base_dir:
            return name
        rel = posixpath.relpath(name, start=base_dir)
        return rel

    # -- manifest helpers --------------------------------------------------

    def _rebuild_manifest_index(self):
        self._manifest_index = {}
        for item in self.opf_xpath('//opf:manifest/opf:item'):
            href = item.get('href')
            if href:
                self._manifest_index[self.href_to_name(href, self.opf_name)] = item

    def manifest_item_for(self, name):
        if self._manifest_index is None:
            self._rebuild_manifest_index()
        return self._manifest_index.get(name)

    def mime_for(self, name):
        item = self.manifest_item_for(name)
        if item is not None:
            return (item.get('media-type') or '').lower()
        return guess_mime(name)

    def iter_manifest_items(self):
        return self.opf_xpath('//opf:manifest/opf:item[@href]')

    def remove_from_manifest(self, name):
        item = self.manifest_item_for(name)
        if item is not None:
            item.getparent().remove(item)
            self._manifest_index = None
            return True
        return False

    def add_to_manifest(self, name, mime, item_id=None, properties=None):
        manifest = self.opf_xpath('//opf:manifest')[0]
        href = self.name_to_href(name, self.opf_name)
        existing_ids = {it.get('id') for it in manifest.iterchildren()
                        if it.get('id')}
        if item_id is None or item_id in existing_ids:
            base = item_id or 'gen_item'
            i = 0
            while f'{base}_{i}' in existing_ids:
                i += 1
            item_id = f'{base}_{i}'
        item = etree.SubElement(manifest, opf('item'))
        item.set('id', item_id)
        item.set('href', href)
        item.set('media-type', mime)
        if properties:
            item.set('properties', properties)
        self._manifest_index = None
        return item

    # -- dirty / deletion --------------------------------------------------

    def mark_dirty(self, name):
        self.dirty.add(name)

    def set_data(self, name, data):
        self.entries[name] = data
        self.parsed_cache.pop(name, None)
        self.dirty.discard(name)
        if name not in self.order:
            self.order.append(name)

    def delete(self, name):
        self.entries.pop(name, None)
        self.parsed_cache.pop(name, None)
        self.dirty.discard(name)
        if name in self.order:
            self.order.remove(name)

    # -- commit ------------------------------------------------------------

    def commit(self, out_path):
        for name in list(self.dirty):
            tree = self.parsed_cache.get(name)
            if tree is None:
                continue
            self.entries[name] = etree.tostring(
                tree, encoding='utf-8', xml_declaration=True, pretty_print=True)
        self.dirty.clear()

        with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # EPUB spec: mimetype must be the first entry, stored uncompressed,
            # with no extra field.
            if 'mimetype' in self.entries:
                zi = zipfile.ZipInfo('mimetype')
                zi.compress_type = zipfile.ZIP_STORED
                zf.writestr(zi, self.entries['mimetype'])
            seen = {'mimetype'}
            for name in self.order:
                if name in seen or name not in self.entries:
                    continue
                zf.writestr(name, self.entries[name])
                seen.add(name)
            for name, data in self.entries.items():
                if name in seen:
                    continue
                zf.writestr(name, data)


def guess_mime(name):
    ext = posixpath.splitext(name)[1].lower()
    table = {
        '.xhtml': 'application/xhtml+xml',
        '.html':  'application/xhtml+xml',
        '.htm':   'application/xhtml+xml',
        '.css':   'text/css',
        '.js':    'application/javascript',
        '.jpg':   'image/jpeg',
        '.jpeg':  'image/jpeg',
        '.png':   'image/png',
        '.gif':   'image/gif',
        '.svg':   'image/svg+xml',
        '.ncx':   'application/x-dtbncx+xml',
    }
    return table.get(ext, 'application/octet-stream')


# ---------------------------------------------------------------------------
# OPF metadata upgrades (generic subset of calibre's opf_2_to_3)
# ---------------------------------------------------------------------------

def _ensure_id(elem):
    if elem.get('id'):
        return elem.get('id')
    existing = {e.get('id') for e in elem.getroottree().getroot().iter()
                if e.get('id')}
    i = 1
    while f'id{i}' in existing:
        i += 1
    new_id = f'id{i}'
    elem.set('id', new_id)
    return new_id


def upgrade_identifiers(root):
    for ident in root.xpath('./opf:metadata/dc:identifier', namespaces=NSMAP):
        val = (ident.text or '').strip()
        scheme = ident.attrib.pop(opf('scheme'), None)
        if val.lower().startswith('urn:'):
            prefix, _, rest = val[4:].partition(':')
            if prefix and rest:
                scheme, val = prefix, rest
        if scheme and val:
            ident.text = f'{scheme}:{val}'
        for attr in list(ident.attrib):
            if attr != 'id':
                del ident.attrib[attr]


def upgrade_title(root):
    first_title = None
    for title in root.xpath('./opf:metadata/dc:title', namespaces=NSMAP):
        if not title.text or not title.text.strip():
            title.getparent().remove(title)
            continue
        if first_title is None:
            first_title = title
    if first_title is not None:
        metadata = first_title.getparent()
        aid = _ensure_id(first_title)
        m = etree.SubElement(metadata, opf('meta'))
        m.set('refines', '#' + aid)
        m.set('property', 'title-type')
        m.text = 'main'


def upgrade_languages(root):
    langs = root.xpath('./opf:metadata/dc:language', namespaces=NSMAP)
    if langs:
        for lang in langs:
            # strip legacy opf:* attributes
            for attr in list(lang.attrib):
                if attr != 'id':
                    del lang.attrib[attr]
    else:
        metadata = root.xpath('./opf:metadata', namespaces=NSMAP)[0]
        el = etree.SubElement(metadata, dc('language'))
        el.text = 'und'


def upgrade_authors(root):
    for which in ('creator', 'contributor'):
        for elem in root.xpath(f'./opf:metadata/dc:{which}', namespaces=NSMAP):
            role = elem.attrib.pop(opf('role'), None)
            sort = elem.attrib.pop(opf('file-as'), None)
            if role or sort:
                aid = _ensure_id(elem)
                metadata = elem.getparent()
                if role:
                    m = etree.SubElement(metadata, opf('meta'))
                    m.set('refines', '#' + aid)
                    m.set('property', 'role')
                    m.set('scheme', 'marc:relators')
                    m.text = role
                if sort:
                    m = etree.SubElement(metadata, opf('meta'))
                    m.set('refines', '#' + aid)
                    m.set('property', 'file-as')
                    m.text = sort


def upgrade_date(root):
    found = False
    for date in root.xpath('./opf:metadata/dc:date', namespaces=NSMAP):
        if not date.text:
            date.getparent().remove(date)
            continue
        if found:
            date.getparent().remove(date)
        else:
            found = True
            for attr in list(date.attrib):
                if attr != 'id':
                    del date.attrib[attr]


def upgrade_meta(root):
    for meta in root.xpath('./opf:metadata/opf:meta[@name]', namespaces=NSMAP):
        name = meta.get('name', '')
        content = meta.get('content') or ''
        if name.startswith('rendition:'):
            name = name.partition(':')[-1]
        prop = None
        if name in ('orientation', 'layout', 'spread'):
            prop = 'rendition:' + name
        elif name == 'fixed-layout':
            prop = 'rendition:layout'
            content = 'pre-paginated' if content.lower() == 'true' else 'reflowable'
        elif name == 'orientation-lock':
            prop = 'rendition:orientation'
            content = {'portrait': 'portrait', 'landscape': 'landscape'}.get(
                content.lower(), 'auto')
        if prop:
            meta.attrib.pop('name', None)
            meta.attrib.pop('content', None)
            meta.set('property', prop)
            meta.text = content


def upgrade_cover(root):
    for meta in root.xpath('./opf:metadata/opf:meta[@name="cover"]',
                           namespaces=NSMAP):
        item_id = meta.get('content')
        if not item_id:
            continue
        for item in root.xpath('./opf:manifest/opf:item', namespaces=NSMAP):
            if item.get('id') != item_id:
                continue
            mt = (item.get('media-type') or '').lower()
            if mt and 'xml' not in mt and 'html' not in mt:
                props = (item.get('properties') or '').split()
                if 'cover-image' not in props:
                    props.append('cover-image')
                item.set('properties', ' '.join(sorted(set(props))))


def remove_invalid_dc_attrs(root):
    for tag in root.xpath(f'//*[namespace-uri() = "{DC_NS}"]'):
        for k in list(tag.attrib):
            if k != 'id':
                del tag.attrib[k]


def set_last_modified(root):
    metadata = root.xpath('./opf:metadata', namespaces=NSMAP)[0]
    for meta in metadata.xpath('./opf:meta[@property="dcterms:modified"]',
                               namespaces=NSMAP):
        metadata.remove(meta)
    m = etree.SubElement(metadata, opf('meta'))
    m.set('property', 'dcterms:modified')
    m.text = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def upgrade_metadata(opf_root):
    upgrade_identifiers(opf_root)
    upgrade_title(opf_root)
    upgrade_languages(opf_root)
    upgrade_authors(opf_root)
    upgrade_date(opf_root)
    upgrade_meta(opf_root)
    upgrade_cover(opf_root)
    remove_invalid_dc_attrs(opf_root)
    set_last_modified(opf_root)
    # Consolidate namespace declarations so new <meta> elements serialize
    # using the default OPF namespace instead of an inherited opf: prefix
    # declared on <metadata> by legacy files.
    etree.cleanup_namespaces(
        opf_root, top_nsmap={None: OPF_NS, 'dc': DC_NS})


# ---------------------------------------------------------------------------
# NCX parsing -> TOC tree
# ---------------------------------------------------------------------------

class TocNode:
    __slots__ = ('title', 'dest', 'frag', 'children')

    def __init__(self, title=None, dest=None, frag=None):
        self.title = title
        self.dest = dest
        self.frag = frag
        self.children = []

    def add(self, title, dest, frag):
        child = TocNode(title, dest, frag)
        self.children.append(child)
        return child


def parse_ncx(container, ncx_name):
    root = container.parse(ncx_name)
    toc = TocNode()
    navmaps = root.xpath(
        '//*[local-name()="navMap" or local-name()="navmap"]')
    if navmaps:
        _process_navpoints(container, navmaps[0], toc, ncx_name)
    return toc


def _process_navpoints(container, node, parent, ncx_name):
    for np in node.xpath(
            './*[local-name()="navPoint" or local-name()="navpoint"]'):
        text_parts = []
        for label in np.xpath(
                './*[local-name()="navLabel" or local-name()="navlabel"]'):
            for t in label.xpath('./*[local-name()="text"]'):
                s = etree.tostring(t, method='text', encoding='unicode',
                                   with_tail=False) or ''
                text_parts.append(s)
        title = ''.join(text_parts).strip() or None
        dest = frag = None
        for content in np.xpath('./*[local-name()="content"]'):
            href = content.get('src')
            if href:
                parsed = urlparse(href)
                dest = container.href_to_name(
                    parsed.path or href, base=ncx_name)
                frag = parsed.fragment or None
                break
        child = parent.add(title, dest, frag)
        _process_navpoints(container, np, child, ncx_name)


def find_ncx(container):
    for spine in container.opf_xpath('//opf:spine'):
        toc_id = spine.get('toc')
        if toc_id:
            for item in container.opf_xpath('//opf:manifest/opf:item'):
                if item.get('id') == toc_id and item.get('href'):
                    return container.href_to_name(
                        item.get('href'), container.opf_name)
    for item in container.opf_xpath('//opf:manifest/opf:item'):
        if (item.get('media-type') or '').lower() == 'application/x-dtbncx+xml':
            return container.href_to_name(
                item.get('href'), container.opf_name)
    return None


# ---------------------------------------------------------------------------
# Guide -> landmarks
# ---------------------------------------------------------------------------

def get_guide_landmarks(container):
    landmarks = []
    for ref in container.opf_xpath('./opf:guide/opf:reference'):
        href = ref.get('href') or ''
        title = ref.get('title') or ''
        rtype = (ref.get('type') or '').lower()
        path, _, frag = href.partition('#')
        name = container.href_to_name(path, container.opf_name)
        if name in container.entries:
            landmarks.append({
                'dest': name,
                'frag': frag or None,
                'title': title,
                'type': GUIDE_TO_EPUBTYPE.get(rtype, ''),
            })
    return landmarks


def remove_guide(container):
    for guide in container.opf_xpath('./opf:guide'):
        guide.getparent().remove(guide)


# ---------------------------------------------------------------------------
# Manifest item properties: scan HTML for svg/script/mathml/switch
# ---------------------------------------------------------------------------

def collect_properties(container):
    for item in container.iter_manifest_items():
        mt = (item.get('media-type') or '').lower()
        if mt not in OEB_DOCS:
            continue
        name = container.href_to_name(item.get('href'), container.opf_name)
        if name not in container.entries:
            continue
        try:
            root = container.parse(name)
        except Exception:
            continue
        if root is None or not hasattr(root, 'xpath'):
            continue
        props = set((item.get('properties') or '').split())
        if root.xpath('//*[local-name()="svg"]'):
            props.add('svg')
        if root.xpath('//*[local-name()="script"]'):
            props.add('scripted')
        if root.xpath('//*[local-name()="math"]'):
            props.add('mathml')
        if root.xpath(
                f'//*[local-name()="switch" and namespace-uri()="{EPUB_NS}"]'):
            props.add('switch')
        if props:
            item.set('properties', ' '.join(sorted(props)))


# ---------------------------------------------------------------------------
# Font MIME fix
# ---------------------------------------------------------------------------

def fix_font_mime_types(container):
    changed = False
    for item in container.iter_manifest_items():
        mt = (item.get('media-type') or '').lower()
        if mt in OEB_FONTS:
            name = container.href_to_name(item.get('href'), container.opf_name)
            ext = posixpath.splitext(name)[1].lower()
            new_mt = FONT_MIME_BY_EXT.get(ext)
            if new_mt and new_mt != mt:
                item.set('media-type', new_mt)
                changed = True
    return changed


# ---------------------------------------------------------------------------
# Nav document generation
# ---------------------------------------------------------------------------

NAV_TEMPLATE = b'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body></body>
</html>
'''

_WS_RE = re.compile(r'\s+')


def build_nav(container, toc, landmarks, nav_name, lang=None):
    root = etree.fromstring(NAV_TEMPLATE)
    if lang:
        root.set('lang', lang)
        root.set(f'{{{XML_NS}}}lang', lang)
    body = root.find(xhtml('body'))

    # --- TOC nav ---
    toc_nav = etree.SubElement(body, xhtml('nav'))
    toc_nav.set(f'{{{EPUB_NS}}}type', 'toc')
    h1 = etree.SubElement(toc_nav, xhtml('h1'))
    h1.text = 'Table of Contents'

    root_ol = etree.SubElement(toc_nav, xhtml('ol'))
    if toc.children:
        _build_ol_children(container, root_ol, toc, nav_name)
    else:
        # EPUB3 requires a non-empty <ol> in the toc nav. Point at the first
        # spine item as a safe fallback.
        first_spine = _first_spine_item_name(container)
        li = etree.SubElement(root_ol, xhtml('li'))
        a = etree.SubElement(li, xhtml('a'))
        if first_spine:
            a.set('href', container.name_to_href(first_spine, nav_name))
        else:
            a.set('href', '#')
        a.text = 'Start'

    # --- landmarks nav ---
    valid_landmarks = [
        lm for lm in landmarks
        if lm['type']
        and lm['dest'] in container.entries
        and container.mime_for(lm['dest']) in OEB_DOCS
    ]
    if valid_landmarks:
        lm_nav = etree.SubElement(body, xhtml('nav'))
        lm_nav.set(f'{{{EPUB_NS}}}type', 'landmarks')
        lm_nav.set('hidden', '')
        ol = etree.SubElement(lm_nav, xhtml('ol'))
        for entry in valid_landmarks:
            li = etree.SubElement(ol, xhtml('li'))
            a = etree.SubElement(li, xhtml('a'))
            a.set(f'{{{EPUB_NS}}}type', entry['type'])
            href = container.name_to_href(entry['dest'], nav_name)
            if entry['frag']:
                href = f'{href}#{entry["frag"]}'
            a.set('href', href)
            a.text = entry['title'] or entry['type']

    return root


def _build_ol_children(container, ol, toc_parent, nav_name):
    for child in toc_parent.children:
        li = etree.SubElement(ol, xhtml('li'))
        tag = 'a' if child.dest else 'span'
        a = etree.SubElement(li, xhtml(tag))
        a.text = _WS_RE.sub(' ', (child.title or '').strip()) or None
        if child.dest:
            href = container.name_to_href(child.dest, nav_name)
            if child.frag:
                href = f'{href}#{child.frag}'
            a.set('href', href)
        if child.children:
            sub_ol = etree.SubElement(li, xhtml('ol'))
            _build_ol_children(container, sub_ol, child, nav_name)


def _first_spine_item_name(container):
    for itemref in container.opf_xpath('//opf:spine/opf:itemref[@idref]'):
        idref = itemref.get('idref')
        for item in container.opf_xpath('//opf:manifest/opf:item[@id]'):
            if item.get('id') == idref and item.get('href'):
                return container.href_to_name(
                    item.get('href'), container.opf_name)
    return None


# ---------------------------------------------------------------------------
# Language helper
# ---------------------------------------------------------------------------

def get_book_language(container):
    for lang in container.opf_xpath('./opf:metadata/dc:language'):
        val = (lang.text or '').strip()
        if val and val.lower() != 'und':
            return val
    return None


# ---------------------------------------------------------------------------
# Main upgrade pipeline
# ---------------------------------------------------------------------------

def upgrade_epub(input_path, output_path, *, remove_ncx=True, log=print):
    '''Perform the EPUB 2 -> EPUB 3 upgrade. Returns True if a conversion
    was performed, False if the input was already EPUB 3.'''
    container = EpubContainer(input_path)

    version = container.opf.get('version', '2.0')
    if version and version.startswith('3'):
        log(f'{input_path} is already EPUB {version}; nothing to do.')
        return False

    log(f'Upgrading {input_path} (EPUB {version}) -> EPUB 3.0')

    # 1. OPF metadata
    upgrade_metadata(container.opf)

    # 2. Manifest item properties (svg, scripted, mathml, switch)
    collect_properties(container)

    # 3. Parse NCX into TOC tree
    ncx_name = find_ncx(container)
    if ncx_name:
        toc = parse_ncx(container, ncx_name)
        n = _count_toc_entries(toc)
        log(f'Parsed TOC from {ncx_name} ({n} entries)')
    else:
        toc = TocNode()
        log('No NCX found; generated nav will use a minimal TOC')

    # 4. Landmarks from guide
    landmarks = get_guide_landmarks(container)
    if landmarks:
        log(f'Extracted {len(landmarks)} landmark(s) from guide')

    # 5. Remove NCX + guide
    if ncx_name and remove_ncx:
        container.remove_from_manifest(ncx_name)
        container.delete(ncx_name)
        for spine in container.opf_xpath('//opf:spine'):
            spine.attrib.pop('toc', None)
    remove_guide(container)

    # 6. Generate nav.xhtml (unique filename, placed alongside the OPF)
    nav_name = _choose_nav_name(container)
    lang = get_book_language(container)
    nav_root = build_nav(container, toc, landmarks, nav_name, lang=lang)
    nav_bytes = etree.tostring(
        nav_root, encoding='utf-8', xml_declaration=True, pretty_print=True)
    container.set_data(nav_name, nav_bytes)
    container.add_to_manifest(
        nav_name, 'application/xhtml+xml',
        item_id='nav', properties='nav')
    log(f'Created nav document: {nav_name}')

    # 7. Font MIME types
    if fix_font_mime_types(container):
        log('Fixed font MIME types')

    # 8. Bump OPF version
    container.opf.set('version', '3.0')

    # 9. Mark OPF dirty and write
    container.mark_dirty(container.opf_name)
    container.commit(output_path)
    log(f'Wrote {output_path}')
    return True


def _choose_nav_name(container):
    base_dir = container.opf_dir
    candidate = posixpath.join(base_dir, 'nav.xhtml') if base_dir else 'nav.xhtml'
    if candidate not in container.entries:
        return candidate
    i = 1
    while True:
        stem = posixpath.join(base_dir, f'nav{i}.xhtml') if base_dir \
            else f'nav{i}.xhtml'
        if stem not in container.entries:
            return stem
        i += 1


def _count_toc_entries(toc):
    n = 0
    stack = list(toc.children)
    while stack:
        node = stack.pop()
        n += 1
        stack.extend(node.children)
    return n


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _default_output(input_path):
    base, dot, ext = input_path.rpartition('.')
    if not dot:
        return input_path + '-epub3'
    return f'{base}-epub3.{ext}'


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog='epub3_upgrade',
        description='Upgrade an EPUB 2 file to EPUB 3 (standalone).',
    )
    parser.add_argument('input', help='Path to the input .epub file')
    parser.add_argument('output', nargs='?', default=None,
                        help='Path to the output .epub file '
                             '(default: <input>-epub3.epub)')
    parser.add_argument('--keep-ncx', action='store_true',
                        help='Keep the NCX TOC file alongside the new nav')
    parser.add_argument('-v', '--verbose', action='store_true')
    parser.add_argument('-q', '--quiet', action='store_true')
    opts = parser.parse_args(argv)

    input_path = os.path.abspath(opts.input)
    if not os.path.isfile(input_path):
        print(f'error: {input_path}: no such file', file=sys.stderr)
        return 2

    output_path = os.path.abspath(opts.output or _default_output(input_path))

    def log(msg):
        if not opts.quiet:
            print(msg)

    try:
        upgrade_epub(input_path, output_path,
                     remove_ncx=not opts.keep_ncx, log=log)
    except Exception as exc:
        print(f'error: {exc}', file=sys.stderr)
        if opts.verbose:
            import traceback
            traceback.print_exc()
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
