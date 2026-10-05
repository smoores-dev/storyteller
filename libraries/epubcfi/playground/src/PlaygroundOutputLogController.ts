export class PlaygroundOutputLogController {
    private addToLogTimeoutId: number = 0;
    private onListItemClickCallback: ((epubCfi: string) => void) | null = null;
    private onCopyToInputButtonClickCallback: ((epubCfi: string) => void) | null = null;
    private currentEpubCfi: string = '';

    constructor(
        private listElement: HTMLElement,
        private currentSelectionElement: HTMLElement,
        private copyToInputButtonElement: HTMLElement,
        private clearButtonElement: HTMLElement,
    ) {
        this.listElement.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (target.localName === 'li') {
                const data = this.getEpubCfiDataFromListItemElement(target);
                if (data) {
                    this.setCurrentSelectionEpubCfi(data.epubCfi, data.isRange);
                    this.onListItemClickCallback?.(data.epubCfi);
                }
            }
        });

        this.copyToInputButtonElement.addEventListener('click', () => {
            if (this.currentEpubCfi) {
                this.onCopyToInputButtonClickCallback?.(this.currentEpubCfi);
            }
        });

        this.clearButtonElement.addEventListener('click', () => {
            this.listElement.innerHTML = '';
            clearTimeout(this.addToLogTimeoutId);
        });
    }

    setCurrentSelectionEpubCfi(epubCfi: string, isRange: boolean): void {
        this.currentEpubCfi = epubCfi;
        this.currentSelectionElement.textContent = epubCfi;

        clearTimeout(this.addToLogTimeoutId);
        this.addToLogTimeoutId = window.setTimeout(() => {
            this.addToLog(epubCfi, isRange);
        }, 1000);

    }

    setOnListItemClickCallback(callback: (epubCfi: string) => void): void {
        this.onListItemClickCallback = callback;
    }

    setOnCopyToInputButtonClickCallback(callback: (epubCfi: string) => void): void {
        this.onCopyToInputButtonClickCallback = callback;
    }

    private addToLog(epubCfi: string, isRange: boolean): void {
        const epubCfiAlreadyLogged = Array.from(this.listElement.children).some(listItemElement => {
            return this.getEpubCfiDataFromListItemElement(listItemElement as HTMLElement)?.epubCfi === epubCfi;
        });

        if (epubCfiAlreadyLogged) {
            return;
        }

        const liElement = this.listElement.ownerDocument.createElement('li');
        liElement.role = 'link';
        liElement.tabIndex = 0;
        this.renderEpubCfiToListItemElement(liElement, epubCfi, isRange);
        this.listElement.insertBefore(liElement, this.listElement.firstChild);
    }

    private getEpubCfiDataFromListItemElement(element: HTMLElement): { epubCfi: string, isRange: boolean } | undefined {
        if (element.dataset['epubCfi']) {
            return {
                epubCfi: element.dataset['epubCfi'],
                isRange: element.dataset['isRange'] === 'true',
            };
        }
        return undefined;
    }

    private renderEpubCfiToListItemElement(element: HTMLElement, epubCfi: string, isRange: boolean): void {
        element.textContent = `${epubCfi} ${isRange ? '(range)' : '(position)'}`;
        element.dataset['epubCfi'] = epubCfi;
        element.dataset['isRange'] = isRange ? 'true' : 'false';
    }

}