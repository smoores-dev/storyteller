export class PlaygroundContentDocumentIframeController {

    private iframeDocument: Document | null = null;
    private onSelectionRangeChangedCallback: ((range: (Range)) => void) | null = null;

    constructor(private iframeElement: HTMLIFrameElement, private urlLabelElement: HTMLElement) {
        this.iframeElement.addEventListener('load', () => this.handleIframeLoadEvent());
    }

    getContentDocument(): Document | null {
        return this.iframeDocument;
    }

    setIframeSrcUrl(url: string): void {
        if (this.iframeDocument) {
            this.iframeDocument.removeEventListener('selectionchange', this.handleSelectionChangeEvent);
        }
        this.iframeDocument = null;
        this.iframeElement.src = url;
        this.urlLabelElement.textContent = url;
    }

    setOnSelectionChangedCallback(callback: (range: Range) => void): void {
        this.onSelectionRangeChangedCallback = callback;
    }

    setSelectionRange(range: Range | null): void {
        const selection = this.iframeDocument?.getSelection();
        if (selection) {
            selection.removeAllRanges();
            if (range) {
                selection.addRange(range);
            }
        }
    }

    getSelectionRange(): Selection | undefined {
        return this.iframeDocument?.getSelection() ?? undefined;
    }

    revealActiveSelection(): void {
        const contentDocument = this.iframeDocument;
        const iframeWindow = this.iframeElement?.contentWindow;

        if (!contentDocument || !iframeWindow) {
            return;
        }

        const contentDocumentBodyElement = contentDocument.documentElement.querySelector('body');

        if (!contentDocumentBodyElement) {
            return;
        }

        const targetDomRange = this.getSelectionRange()?.getRangeAt(0);

        if (!targetDomRange) {
            return;
        }

        const endOffset = targetDomRange.endOffset;
        const scrollDelta = (targetDomRange.getBoundingClientRect().top - contentDocumentBodyElement.getBoundingClientRect().top) + contentDocumentBodyElement.scrollTop;
        const shouldScrollIntoView = scrollDelta < contentDocument.documentElement.scrollTop || scrollDelta > contentDocument.documentElement.scrollTop + contentDocument.documentElement.clientHeight;
        const isCollapsedRange = targetDomRange.collapsed;

        if (isCollapsedRange) {
            if (shouldScrollIntoView) {
                contentDocument.addEventListener('scrollend', () => {
                    setTimeout(() => {
                        const rect = targetDomRange.getBoundingClientRect();
                        this.renderPositionMarker(rect.x, rect.y, rect.height);
                    }, 0);
                }, { once: true });
            } else {
                const rect = targetDomRange.getBoundingClientRect();
                this.renderPositionMarker(rect.x, rect.y, rect.height);
            }
        } else {
            this.clearPositionMarker();
            setTimeout(() => {
                const selection = this.getSelectionRange();
                selection?.removeAllRanges();
                selection?.setBaseAndExtent(targetDomRange.startContainer, targetDomRange.startOffset, targetDomRange.endContainer, endOffset);
            }, 100);
        }

        if (shouldScrollIntoView) {
            contentDocument.documentElement.scrollTop = scrollDelta - (contentDocument.documentElement.clientHeight / 4);
        }
    }

    renderPositionMarker(x: number,y: number, height?: number) {
        const contentDocumentElement = this.iframeDocument?.documentElement;
        const iframeWindow = this.iframeElement?.contentWindow;

        if (!iframeWindow || !this.iframeDocument) {
            return;
        }

        if(!contentDocumentElement) {
            return;
        }

        this.clearPositionMarker();

        const offsetTop = Math.abs(contentDocumentElement.getBoundingClientRect().top) + y;
        const offsetLeft = contentDocumentElement.getBoundingClientRect().left + x;

        const positionMarker = this.iframeDocument.createElement('div');
        positionMarker.setAttribute('id', 'colibrio-epubcfi-playground__position-marker');
        positionMarker.style.position = 'absolute';
        positionMarker.style.left = `${offsetLeft}px`;
        positionMarker.style.top = `${offsetTop}px`;
        positionMarker.style.height = height ? `${height}px` : '1.2em';
        positionMarker.style.borderLeft = '2px solid red';
        positionMarker.style.pointerEvents = 'none';

        contentDocumentElement.appendChild(positionMarker);

    }

    clearPositionMarker(): void {
        const positionMarker = this.iframeDocument?.documentElement.querySelector('#colibrio-epubcfi-playground__position-marker');
        positionMarker?.remove();
    }

    clearContentSelection(): void {
        this.setSelectionRange(null);
    }

    private handleIframeLoadEvent(): void {
        this.iframeDocument = this.iframeElement.contentDocument;
        if (!this.iframeDocument) {
            console.error('Could not access iframe document');
            return;
        }

        this.iframeDocument.addEventListener('selectionchange', this.handleSelectionChangeEvent);
    };

    private handleSelectionChangeEvent = (): void => {
        const selection = this.iframeDocument?.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            this.onSelectionRangeChangedCallback?.(range);
        }
    };
}
