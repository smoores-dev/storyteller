import * as CFI from './epubcfi.js'
import { TOCProgress, SectionProgress } from './progress.js'
import { Overlayer } from './overlayer.js'
import { textWalker } from './text-walker.js'

const SEARCH_PREFIX = 'foliate-search:'

const isZip = async file => {
    const arr = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    return arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03 && arr[3] === 0x04
}

const isPDF = async file => {
    const arr = new Uint8Array(await file.slice(0, 5).arrayBuffer())
    return arr[0] === 0x25
        && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46
        && arr[4] === 0x2d
}

const isCBZ = ({ name, type }) =>
    type === 'application/vnd.comicbook+zip' || name.endsWith('.cbz')

const isFB2 = ({ name, type }) =>
    type === 'application/x-fictionbook+xml' || name.endsWith('.fb2')

const isFBZ = ({ name, type }) =>
    type === 'application/x-zip-compressed-fb2'
    || name.endsWith('.fb2.zip') || name.endsWith('.fbz')

const makeZipLoader = async file => {
    const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } =
        await import('./vendor/zip.js')
    configure({ useWebWorkers: false })
    const reader = new ZipReader(new BlobReader(file))
    const entries = await reader.getEntries()
    const map = new Map(entries.map(entry => [entry.filename, entry]))
    const load = f => (name, ...args) =>
        map.has(name) ? f(map.get(name), ...args) : null
    const loadText = load(entry => entry.getData(new TextWriter()))
    const loadBlob = load((entry, type) => entry.getData(new BlobWriter(type)))
    const getSize = name => map.get(name)?.uncompressedSize ?? 0
    return { entries, loadText, loadBlob, getSize }
}

const getFileEntries = async entry => entry.isFile ? entry
    : (await Promise.all(Array.from(
        await new Promise((resolve, reject) => entry.createReader()
            .readEntries(entries => resolve(entries), error => reject(error))),
        getFileEntries))).flat()

const makeDirectoryLoader = async entry => {
    const entries = await getFileEntries(entry)
    const files = await Promise.all(
        entries.map(entry => new Promise((resolve, reject) =>
            entry.file(file => resolve([file, entry.fullPath]),
                error => reject(error)))))
    const map = new Map(files.map(([file, path]) =>
        [path.replace(entry.fullPath + '/', ''), file]))
    const decoder = new TextDecoder()
    const decode = x => x ? decoder.decode(x) : null
    const getBuffer = name => map.get(name)?.arrayBuffer() ?? null
    const loadText = async name => decode(await getBuffer(name))
    const loadBlob = name => map.get(name)
    const getSize = name => map.get(name)?.size ?? 0
    return { loadText, loadBlob, getSize }
}

export class ResponseError extends Error {}
export class NotFoundError extends Error {}
export class UnsupportedTypeError extends Error {}

const fetchFile = async url => {
    const res = await fetch(url)
    if (!res.ok) throw new ResponseError(
        `${res.status} ${res.statusText}`, { cause: res })
    return new File([await res.blob()], new URL(res.url).pathname)
}

export const makeBook = async file => {
    if (typeof file === 'string') file = await fetchFile(file)
    let book
    if (file.isDirectory) {
        const loader = await makeDirectoryLoader(file)
        const { EPUB } = await import('./epub.js')
        book = await new EPUB(loader).init()
    }
    else if (!file.size) throw new NotFoundError('File not found')
    else if (await isZip(file)) {
        const loader = await makeZipLoader(file)
        if (isCBZ(file)) {
            const { makeComicBook } = await import('./comic-book.js')
            book = makeComicBook(loader, file)
        }
        else if (isFBZ(file)) {
            const { makeFB2 } = await import('./fb2.js')
            const { entries } = loader
            const entry = entries.find(entry => entry.filename.endsWith('.fb2'))
            const blob = await loader.loadBlob((entry ?? entries[0]).filename)
            book = await makeFB2(blob)
        }
        else {
            const { EPUB } = await import('./epub.js')
            book = await new EPUB(loader).init()
        }
    }
    else if (await isPDF(file)) {
        const { makePDF } = await import('./pdf.js')
        book = await makePDF(file)
    }
    else {
        const { isMOBI, MOBI } = await import('./mobi.js')
        if (await isMOBI(file)) {
            const fflate = await import('./vendor/fflate.js')
            book = await new MOBI({ unzlib: fflate.unzlibSync }).open(file)
        }
        else if (isFB2(file)) {
            const { makeFB2 } = await import('./fb2.js')
            book = await makeFB2(file)
        }
    }
    if (!book) throw new UnsupportedTypeError('File type not supported')
    return book
}

class CursorAutohider {
    #timeout
    #el
    #check
    #state
    constructor(el, check, state = {}) {
        this.#el = el
        this.#check = check
        this.#state = state
        if (this.#state.hidden) this.hide()
        this.#el.addEventListener('mousemove', ({ screenX, screenY }) => {
            // check if it actually moved
            if (screenX === this.#state.x && screenY === this.#state.y) return
            this.#state.x = screenX, this.#state.y = screenY
            this.show()
            if (this.#timeout) clearTimeout(this.#timeout)
            if (check()) this.#timeout = setTimeout(this.hide.bind(this), 1000)
        }, false)
    }
    cloneFor(el) {
        return new CursorAutohider(el, this.#check, this.#state)
    }
    hide() {
        this.#el.style.cursor = 'none'
        this.#state.hidden = true
    }
    show() {
        this.#el.style.removeProperty('cursor')
        this.#state.hidden = false
    }
}

class History extends EventTarget {
    #arr = []
    #index = -1
    pushState(x) {
        const last = this.#arr[this.#index]
        if (last === x || last?.fraction && last.fraction === x.fraction) return
        this.#arr[++this.#index] = x
        this.#arr.length = this.#index + 1
        this.dispatchEvent(new Event('index-change'))
    }
    replaceState(x) {
        const index = this.#index
        this.#arr[index] = x
    }
    back() {
        const index = this.#index
        if (index <= 0) return
        const detail = { state: this.#arr[index - 1] }
        this.#index = index - 1
        this.dispatchEvent(new CustomEvent('popstate', { detail }))
        this.dispatchEvent(new Event('index-change'))
    }
    forward() {
        const index = this.#index
        if (index >= this.#arr.length - 1) return
        const detail = { state: this.#arr[index + 1] }
        this.#index = index + 1
        this.dispatchEvent(new CustomEvent('popstate', { detail }))
        this.dispatchEvent(new Event('index-change'))
    }
    get canGoBack() {
        return this.#index > 0
    }
    get canGoForward() {
        return this.#index < this.#arr.length - 1
    }
    clear() {
        this.#arr = []
        this.#index = -1
    }
}

const languageInfo = lang => {
    if (!lang) return {}
    try {
        const canonical = Intl.getCanonicalLocales(lang)[0]
        const locale = new Intl.Locale(canonical)
        const isCJK = ['zh', 'ja', 'kr'].includes(locale.language)
        const direction = (locale.getTextInfo?.() ?? locale.textInfo)?.direction
        return { canonical, locale, isCJK, direction }
    } catch (e) {
        console.warn(e)
        return {}
    }
}

export class View extends HTMLElement {
    #root = this.attachShadow({ mode: 'closed' })
    #sectionProgress
    #tocProgress
    #pageProgress
    #searchResults = new Map()
    #cursorAutohider = new CursorAutohider(this, () =>
        this.hasAttribute('autohide-cursor'))
    isFixedLayout = false
    lastLocation
    history = new History()
    constructor() {
        super()
        this.history.addEventListener('popstate', ({ detail }) => {
            const resolved = this.resolveNavigation(detail.state)
            this.renderer.goTo(resolved)
        })
    }
    async open(book) {
        if (typeof book === 'string'
        || typeof book.arrayBuffer === 'function'
        || book.isDirectory) book = await makeBook(book)
        this.book = book
        this.language = languageInfo(book.metadata?.language)

        if (book.splitTOCHref && book.getTOCFragment) {
            const ids = book.sections.map(s => s.id)
            this.#sectionProgress = new SectionProgress(book.sections, 1500, 1600)
            const splitHref = book.splitTOCHref.bind(book)
            const getFragment = book.getTOCFragment.bind(book)
            this.#tocProgress = new TOCProgress()
            await this.#tocProgress.init({
                toc: book.toc ?? [], ids, splitHref, getFragment })
            this.#pageProgress = new TOCProgress()
            await this.#pageProgress.init({
                toc: book.pageList ?? [], ids, splitHref, getFragment })
        }

        this.isFixedLayout = this.book.rendition?.layout === 'pre-paginated'
        if (this.isFixedLayout) {
            await import('./fixed-layout.js')
            this.renderer = document.createElement('foliate-fxl')
        } else {
            await import('./paginator.js')
            this.renderer = document.createElement('foliate-paginator')
        }
        this.renderer.setAttribute('exportparts', 'head,foot,filter')
        this.renderer.addEventListener('load', e => this.#onLoad(e.detail))
        this.renderer.addEventListener('relocate', e => this.#onRelocate(e.detail))
        this.renderer.addEventListener('create-overlayer', e =>
            e.detail.attach(this.#createOverlayer(e.detail)))
        this.renderer.open(book)
        this.#root.append(this.renderer)

        if (book.sections.some(section => section.mediaOverlay)) {
            const activeClass = book.media.activeClass
            const playbackActiveClass = book.media.playbackActiveClass
            this.mediaOverlay = book.getMediaOverlay()
            let lastActive
            let pageFlipTimeupdateHandler = null

            /**
             * Cleanup function to remove scheduled page flip handlers.
             * Called when a sentence ends, playback stops, or a new sentence begins
             * to prevent stale flip timers from triggering incorrectly.
             */
            const cleanupPageFlipHandler = () => {
                if (pageFlipTimeupdateHandler) {
                    this.mediaOverlay.audio?.removeEventListener('timeupdate', pageFlipTimeupdateHandler)
                    pageFlipTimeupdateHandler = null
                }
            }

            /**
             * Detects when a sentence spans multiple pages/columns in the reader.
             *
             * PROBLEM:
             * In readalong/media-overlay mode, when audio narration reads a sentence that
             * starts on the current visible page but continues onto the next page, the audio
             * keeps playing while the continuation text is off-screen. This creates a poor
             * reading experience where you hear words you can't see.
             *
             * SOLUTION:
             * Detect when a sentence spans pages and schedule a page flip partway through
             * the audio playback, proportional to how much of the sentence is visible.
             *
             * HOW IT WORKS:
             * We project each client rect of the highlighted sentence into the reading
             * viewport (the paginator element) and measure the area that remains visible.
             * If a significant portion of the text sits outside of that viewport in the
             * forward reading direction, we treat it as a page-spanning sentence.
             *
             * ALGORITHM:
             * 1. Collect all non-zero client rects for the sentence.
             * 2. Accumulate the total rect area alongside the portion that intersects
             *    with the viewport.
             * 3. Track how much area is hidden before and after the viewport bounds
             *    (left/right in horizontal layouts).
             * 4. When more than 10% of the sentence lies past the forward boundary and
             *    the visible portion is noticeably smaller (<98%), return visibility
             *    ratios so we can time the flip.
             *
             * EDGE CASES:
             * - Two-column spreads stay fully inside the viewport, so no flip occurs.
             * - RTL flows flip the direction calculation automatically.
             * - Vertical writing modes are ignored for now until we implement matching
             *   axis-aware checks.
             *
             * @param {Element} el - The DOM element being highlighted (the sentence)
             * @param {Document} doc - The document containing the element
             * @param {Object} renderer - The foliate paginator/renderer with layout info
             * @returns {Object|null} - {visibleRatio, offScreenRatio} if split, null otherwise
             */
            const getElementSplitInfo = (el, doc, renderer) => {
                if (!el || !doc?.defaultView || !renderer) return null
                if (renderer.scrolled) return null

                const rects = Array.from(el.getClientRects())
                    .filter(rect => rect.width > 0 && rect.height > 0)
                if (!rects.length) return null

                const defaultView = doc.defaultView
                const frameElement = defaultView.frameElement
                const rendererRect = renderer.getBoundingClientRect?.()
                if (!frameElement || !rendererRect
                    || !rendererRect.width || !rendererRect.height) return null

                const frameRect = frameElement.getBoundingClientRect()
                const viewportRect = {
                    left: Math.max(rendererRect.left, frameRect.left),
                    right: Math.min(rendererRect.right, frameRect.right),
                    top: Math.max(rendererRect.top, frameRect.top),
                    bottom: Math.min(rendererRect.bottom, frameRect.bottom)
                }
                if (viewportRect.left >= viewportRect.right
                    || viewportRect.top >= viewportRect.bottom) return null

                const writingMode =
                    defaultView.getComputedStyle(doc.body)?.writingMode ?? ''
                // Vertical layouts require additional handling; skip for now
                if (writingMode.startsWith('vertical')) return null

                const rtl = renderer.getAttribute?.('dir') === 'rtl'

                let totalArea = 0
                let visibleArea = 0
                let forwardArea = 0
                let backwardArea = 0

                for (const rect of rects) {
                    const area = rect.width * rect.height
                    if (!area) continue
                    totalArea += area

                    const globalLeft = frameRect.left + rect.left
                    const globalRight = frameRect.left + rect.right
                    const globalTop = frameRect.top + rect.top
                    const globalBottom = frameRect.top + rect.bottom

                    const overlapLeft = Math.max(globalLeft, viewportRect.left)
                    const overlapRight = Math.min(globalRight, viewportRect.right)
                    const overlapTop = Math.max(globalTop, viewportRect.top)
                    const overlapBottom = Math.min(globalBottom, viewportRect.bottom)
                    const overlapWidth = Math.max(0, overlapRight - overlapLeft)
                    const overlapHeight = Math.max(0, overlapBottom - overlapTop)

                    if (overlapWidth > 0 && overlapHeight > 0) {
                        visibleArea += overlapWidth * overlapHeight
                    }

                    const verticalOverlap = Math.max(0,
                        Math.min(globalBottom, viewportRect.bottom)
                        - Math.max(globalTop, viewportRect.top))
                    if (verticalOverlap <= 0) continue

                    const forwardHiddenWidth = rtl
                        ? Math.max(0, Math.min(rect.width,
                            viewportRect.left - globalLeft))
                        : Math.max(0, Math.min(rect.width,
                            globalRight - viewportRect.right))
                    const backwardHiddenWidth = rtl
                        ? Math.max(0, Math.min(rect.width,
                            globalRight - viewportRect.right))
                        : Math.max(0, Math.min(rect.width,
                            viewportRect.left - globalLeft))

                    if (forwardHiddenWidth > 0) {
                        forwardArea += forwardHiddenWidth * verticalOverlap
                    }
                    if (backwardHiddenWidth > 0) {
                        backwardArea += backwardHiddenWidth * verticalOverlap
                    }
                }

                if (!totalArea || !visibleArea) return null

                const visibleRatio = visibleArea / totalArea
                const forwardRatio = forwardArea / totalArea
                const backwardRatio = backwardArea / totalArea

                if (visibleRatio >= 0.98) return null

                const progressionRatio = rtl ? backwardRatio : forwardRatio
                const oppositeRatio = rtl ? forwardRatio : backwardRatio

                if (progressionRatio < 0.1) return null
                if (progressionRatio <= oppositeRatio) return null

                return {
                    visibleRatio,
                    offScreenRatio: progressionRatio
                }
            }

            /**
             * Handle media overlay highlighting with mid-sentence page flip support.
             *
             * When a sentence is highlighted during audio narration, this handler:
             * 1. Navigates to show the sentence (via renderer.goTo)
             * 2. Applies highlighting CSS classes
             * 3. Checks if the sentence spans multiple pages
             * 4. If split detected: schedules a page flip partway through audio playback
             *
             * TIMING CALCULATION:
             * If a sentence has 30% of its content visible on the current page and 70%
             * on the next page, we flip the page when the audio reaches 30% completion.
             * This keeps the text being read visible throughout playback.
             *
             * Example:
             * - Sentence audio: 2306.625s to 2315.691s (9.066s duration)
             * - visibleRatio: 0.25 (25% visible, 75% on next page)
             * - Flip time: 2306.625 + (9.066 × 0.25) = 2308.89s
             * - At 2308.89s, page flips to show the remaining 75% of the sentence
             */
            this.mediaOverlay.addEventListener('highlight', e => {
                cleanupPageFlipHandler()

                const resolved = this.resolveNavigation(e.detail.text)
                const shouldNavigate = this.mediaOverlay.autoScroll !== false

                const highlightElement = () => {
                    const { doc } = this.renderer.getContents()
                        .find(x => x.index = resolved.index)
                    const el = resolved.anchor(doc)
                    el.classList.add(activeClass)
                    if (playbackActiveClass) el.ownerDocument
                        .documentElement.classList.add(playbackActiveClass)
                    lastActive = new WeakRef(el)
                }

                if (shouldNavigate) {
                    this.renderer.goTo(resolved).then(() => {
                        highlightElement()

                        const currentItem = this.mediaOverlay.activeItem
                        if (!currentItem || !this.mediaOverlay.audio) return

                        const { doc: currentDoc } = this.renderer.getContents()
                            .find(x => x.index = resolved.index)
                        const currentEl = resolved.anchor(currentDoc)
                        const splitInfo = getElementSplitInfo(currentEl, currentDoc, this.renderer)

                        if (splitInfo && !this.renderer.atEnd) {
                            const duration = (currentItem.end ?? 0) - (currentItem.begin ?? 0)

                            console.log('Split detected!', {
                                duration,
                                visibleRatio: splitInfo.visibleRatio,
                                offScreenRatio: splitInfo.offScreenRatio
                            })

                            if (duration > 0.5) {
                                const earlyOffset = 1.0
                                const flipTime = Math.max(
                                    currentItem.begin ?? 0,
                                    (currentItem.begin ?? 0) + (duration * splitInfo.visibleRatio) - earlyOffset
                                )

                                console.log('Scheduling flip at', flipTime)

                                pageFlipTimeupdateHandler = () => {
                                    const audio = this.mediaOverlay.audio
                                    if (audio && audio.currentTime >= flipTime) {
                                        console.log('Flipping page! Current time:', audio.currentTime)
                                        cleanupPageFlipHandler()
                                        this.renderer.next?.().catch(err =>
                                            console.warn('Media overlay page flip error:', err))
                                    }
                                }

                                this.mediaOverlay.audio.addEventListener('timeupdate', pageFlipTimeupdateHandler)
                            }
                        }
                    })
                } else {
                    try {
                        const contents = this.renderer.getContents()
                        const match = contents.find(x => x.index === resolved.index)
                        if (match) {
                            const el = resolved.anchor(match.doc)
                            if (el) {
                                el.classList.add(activeClass)
                                if (playbackActiveClass) el.ownerDocument
                                    .documentElement.classList.add(playbackActiveClass)
                                lastActive = new WeakRef(el)
                            }
                        }
                    } catch (e) {
                        console.warn('Could not highlight element (autoScroll disabled):', e)
                    }
                }
            })
            this.mediaOverlay.addEventListener('unhighlight', () => {
                cleanupPageFlipHandler()
                const el = lastActive?.deref()
                if (el) {
                    el.classList.remove(activeClass)
                    if (playbackActiveClass) el.ownerDocument
                        .documentElement.classList.remove(playbackActiveClass)
                }
            })
        }
    }
    close() {
        this.renderer?.destroy()
        this.renderer?.remove()
        this.#sectionProgress = null
        this.#tocProgress = null
        this.#pageProgress = null
        this.#searchResults = new Map()
        this.lastLocation = null
        this.history.clear()
        this.tts = null
        this.mediaOverlay = null
    }
    goToTextStart() {
        return this.goTo(this.book.landmarks
            ?.find(m => m.type.includes('bodymatter') || m.type.includes('text'))
            ?.href ?? this.book.sections.findIndex(s => s.linear !== 'no'))
    }
    async init({ lastLocation, showTextStart }) {
        const resolved = lastLocation ? this.resolveNavigation(lastLocation) : null
        if (resolved) {
            await this.renderer.goTo(resolved)
            this.history.pushState(lastLocation)
        }
        else if (showTextStart) await this.goToTextStart()
        else {
            this.history.pushState(0)
            await this.next()
        }
    }
    #emit(name, detail, cancelable) {
        return this.dispatchEvent(new CustomEvent(name, { detail, cancelable }))
    }
    #onRelocate({ reason, range, index, fraction, size }) {
        const progress = this.#sectionProgress?.getProgress(index, fraction, size) ?? {}
        const tocItem = this.#tocProgress?.getProgress(index, range)
        const pageItem = this.#pageProgress?.getProgress(index, range)
        const cfi = this.getCFI(index, range)
        this.lastLocation = { ...progress, tocItem, pageItem, cfi, range, reason }
        if (reason === 'snap' || reason === 'page' || reason === 'scroll')
            this.history.replaceState(cfi)
        this.#emit('relocate', this.lastLocation)
    }
    #onLoad({ doc, index }) {
        // set language and dir if not already set
        doc.documentElement.lang ||= this.language.canonical ?? ''
        if (!this.language.isCJK)
            doc.documentElement.dir ||= this.language.direction ?? ''

        this.#handleLinks(doc, index)
        this.#cursorAutohider.cloneFor(doc.documentElement)

        this.#emit('load', { doc, index })
    }
    #handleLinks(doc, index) {
        const { book } = this
        const section = book.sections[index]
        doc.addEventListener('click', e => {
            const a = e.target.closest('a[href]')
            if (!a) return
            e.preventDefault()
            const href_ = a.getAttribute('href')
            const href = section?.resolveHref?.(href_) ?? href_
            if (book?.isExternal?.(href))
                Promise.resolve(this.#emit('external-link', { a, href }, true))
                    .then(x => x ? globalThis.open(href, '_blank') : null)
                    .catch(e => console.error(e))
            else Promise.resolve(this.#emit('link', { a, href }, true))
                .then(x => x ? this.goTo(href) : null)
                .catch(e => console.error(e))
        })
    }
    async addAnnotation(annotation, remove) {
        const { value } = annotation
        if (value.startsWith(SEARCH_PREFIX)) {
            const cfi = value.replace(SEARCH_PREFIX, '')
            const { index, anchor } = await this.resolveNavigation(cfi)
            const obj = this.#getOverlayer(index)
            if (obj) {
                const { overlayer, doc } = obj
                if (remove) {
                    overlayer.remove(value)
                    return
                }
                const range = doc ? anchor(doc) : anchor
                overlayer.add(value, range, Overlayer.outline)
            }
            return
        }
        const { index, anchor } = await this.resolveNavigation(value)
        const obj = this.#getOverlayer(index)
        if (obj) {
            const { overlayer, doc } = obj
            overlayer.remove(value)
            if (!remove) {
                const range = doc ? anchor(doc) : anchor
                const draw = (func, opts) => overlayer.add(value, range, func, opts)
                this.#emit('draw-annotation', { draw, annotation, doc, range })
            }
        }
        const label = this.#tocProgress.getProgress(index)?.label ?? ''
        return { index, label }
    }
    deleteAnnotation(annotation) {
        return this.addAnnotation(annotation, true)
    }
    #getOverlayer(index) {
        return this.renderer.getContents()
            .find(x => x.index === index && x.overlayer)
    }
    #createOverlayer({ doc, index }) {
        const overlayer = new Overlayer()
        doc.addEventListener('click', e => {
            const [value, range] = overlayer.hitTest(e)
            if (value && !value.startsWith(SEARCH_PREFIX)) {
                this.#emit('show-annotation', { value, index, range })
            }
        }, false)

        const list = this.#searchResults.get(index)
        if (list) for (const item of list) this.addAnnotation(item)

        this.#emit('create-overlay', { index })
        return overlayer
    }
    async showAnnotation(annotation) {
        const { value } = annotation
        const resolved = await this.goTo(value)
        if (resolved) {
            const { index, anchor } = resolved
            const { doc } =  this.#getOverlayer(index)
            const range = anchor(doc)
            this.#emit('show-annotation', { value, index, range })
        }
    }
    getCFI(index, range) {
        const baseCFI = this.book.sections[index].cfi ?? CFI.fake.fromIndex(index)
        if (!range) return baseCFI
        return CFI.joinIndir(baseCFI, CFI.fromRange(range))
    }
    resolveCFI(cfi) {
        if (this.book.resolveCFI)
            return this.book.resolveCFI(cfi)
        else {
            const parts = CFI.parse(cfi)
            const index = CFI.fake.toIndex((parts.parent ?? parts).shift())
            const anchor = doc => CFI.toRange(doc, parts)
            return { index, anchor }
        }
    }
    resolveNavigation(target) {
        try {
            if (typeof target === 'number') return { index: target }
            if (typeof target.fraction === 'number') {
                const [index, anchor] = this.#sectionProgress.getSection(target.fraction)
                return { index, anchor }
            }
            if (CFI.isCFI.test(target)) return this.resolveCFI(target)
            return this.book.resolveHref(target)
        } catch (e) {
            console.error(e)
            console.error(`Could not resolve target ${target}`)
        }
    }
    async goTo(target) {
        const resolved = this.resolveNavigation(target)
        try {
            await this.renderer.goTo(resolved)
            this.history.pushState(target)
            return resolved
        } catch(e) {
            console.error(e)
            console.error(`Could not go to ${target}`)
        }
    }
    async goToFraction(frac) {
        const [index, anchor] = this.#sectionProgress.getSection(frac)
        await this.renderer.goTo({ index, anchor })
        this.history.pushState({ fraction: frac })
    }
    async goToFractionInSection(index, frac) {
        await this.renderer.goTo({ index, anchor: frac })
        this.history.pushState({ index, fraction: frac })
    }
    async select(target) {
        try {
            const obj = await this.resolveNavigation(target)
            await this.renderer.goTo({ ...obj, select: true })
            this.history.pushState(target)
        } catch(e) {
            console.error(e)
            console.error(`Could not go to ${target}`)
        }
    }
    deselect() {
        for (const { doc } of this.renderer.getContents())
            doc.defaultView.getSelection().removeAllRanges()
    }
    getSectionFractions() {
        return (this.#sectionProgress?.sectionFractions ?? [])
            .map(x => x + Number.EPSILON)
    }
    getProgressOf(index, range) {
        const tocItem = this.#tocProgress?.getProgress(index, range)
        const pageItem = this.#pageProgress?.getProgress(index, range)
        return { tocItem, pageItem }
    }
    async getTOCItemOf(target) {
        try {
            const { index, anchor } = await this.resolveNavigation(target)
            const doc = await this.book.sections[index].createDocument()
            const frag = anchor(doc)
            const isRange = frag instanceof Range
            const range = isRange ? frag : doc.createRange()
            if (!isRange) range.selectNodeContents(frag)
            return this.#tocProgress.getProgress(index, range)
        } catch(e) {
            console.error(e)
            console.error(`Could not get ${target}`)
        }
    }
    async prev(distance) {
        await this.renderer.prev(distance)
    }
    async next(distance) {
        await this.renderer.next(distance)
    }
    goLeft() {
        return this.book.dir === 'rtl' ? this.next() : this.prev()
    }
    goRight() {
        return this.book.dir === 'rtl' ? this.prev() : this.next()
    }
    async * #searchSection(matcher, query, index) {
        const doc = await this.book.sections[index].createDocument()
        for (const { range, excerpt } of matcher(doc, query))
            yield { cfi: this.getCFI(index, range), excerpt }
    }
    async * #searchBook(matcher, query) {
        const { sections } = this.book
        for (const [index, { createDocument }] of sections.entries()) {
            if (!createDocument) continue
            const doc = await createDocument()
            const subitems = Array.from(matcher(doc, query), ({ range, excerpt }) =>
                ({ cfi: this.getCFI(index, range), excerpt }))
            const progress = (index + 1) / sections.length
            yield { progress }
            if (subitems.length) yield { index, subitems }
        }
    }
    async * search(opts) {
        this.clearSearch()
        const { searchMatcher } = await import('./search.js')
        const { query, index } = opts
        const matcher = searchMatcher(textWalker,
            { defaultLocale: this.language, ...opts })
        const iter = index != null
            ? this.#searchSection(matcher, query, index)
            : this.#searchBook(matcher, query)

        const list = []
        this.#searchResults.set(index, list)

        for await (const result of iter) {
            if (result.subitems){
                const list = result.subitems
                    .map(({ cfi }) => ({ value: SEARCH_PREFIX + cfi }))
                this.#searchResults.set(result.index, list)
                for (const item of list) this.addAnnotation(item)
                yield {
                    label: this.#tocProgress.getProgress(result.index)?.label ?? '',
                    subitems: result.subitems,
                }
            }
            else {
                if (result.cfi) {
                    const item = { value: SEARCH_PREFIX + result.cfi }
                    list.push(item)
                    this.addAnnotation(item)
                }
                yield result
            }
        }
        yield 'done'
    }
    clearSearch() {
        for (const list of this.#searchResults.values())
            for (const item of list) this.deleteAnnotation(item)
        this.#searchResults.clear()
    }
    async initTTS(granularity = 'word', highlight) {
        const doc = this.renderer.getContents()[0].doc
        if (this.tts && this.tts.doc === doc) return
        const { TTS } = await import('./tts.js')
        this.tts = new TTS(doc, textWalker, highlight || (range =>
            this.renderer.scrollToAnchor(range, true)), granularity)
    }
    startMediaOverlay() {
        const { index } = this.renderer.getContents()[0]
        return this.mediaOverlay.start(index)
    }
}

customElements.define('foliate-view', View)
