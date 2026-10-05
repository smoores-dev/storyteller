export class PlaygroundEpubCfiParserController {

    private onParseAndSelectEpubCfiCallback: ((epubCfi: string, matchThreshold: number) => void) | null = null;

    constructor(
        private epubCfiFormElement: HTMLFormElement,
        private epubCfiInputElement: HTMLInputElement,
        private matchThresholdInputElement: HTMLInputElement,
        selectButtonElement: HTMLElement,
    ) {

        epubCfiFormElement.addEventListener('submit', (event) => {
            event.preventDefault();
            if (epubCfiInputElement.value) {
                this.onParseAndSelectEpubCfiCallback?.(epubCfiInputElement.value.trim(), Number(this.matchThresholdInputElement.value));
            }
        });

        selectButtonElement.addEventListener('click', () => {
            if (epubCfiInputElement.value) {
                this.onParseAndSelectEpubCfiCallback?.(epubCfiInputElement.value.trim(), Number(this.matchThresholdInputElement.value));
            }
        });
    }

    getFormElement(): HTMLFormElement {
        return this.epubCfiFormElement;
    }

    setParseAndSelectEpubCfiCallback(callback: (epubCfi: string, matchThreshold: number) => void): void {
        this.onParseAndSelectEpubCfiCallback = callback;
    }

    setEpubCfiInputValue(epubCfi: string): void {
        this.epubCfiInputElement.value = epubCfi;
    }

}
