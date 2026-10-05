import {IPlaygroundAppConstructorParams} from './IPlaygroundAppConstructorParams.js';
import {PlaygroundContentDocumentIframeController} from './PlaygroundContentDocumentIframeController.js';
import {PlaygroundEpubCfiParserController} from './PlaygroundEpubCfiParserController.js';
import {PlaygroundEpubCfiUtils} from './PlaygroundEpubCfiUtils.js';
import {PlaygroundHelpDialogController} from './PlaygroundHelpDialogController.js';
import {PlaygroundOpfController} from './PlaygroundOpfController.js';
import {PlaygroundOutputLogController} from './PlaygroundOutputLogController.js';

export class PlaygroundApp {

    private contentDocumentIframeController: PlaygroundContentDocumentIframeController;
    private epubCfiParserController: PlaygroundEpubCfiParserController;
    private opfController: PlaygroundOpfController;
    private outputLogController: PlaygroundOutputLogController;

    constructor(params: IPlaygroundAppConstructorParams) {
        this.contentDocumentIframeController = new PlaygroundContentDocumentIframeController(
            params.contentDocumentIframeElement,
            params.contentDocumentUrlLabelElement,
        );
        this.opfController = new PlaygroundOpfController(params.opfContentElement, params.opfUrlLabelElement);
        this.outputLogController = new PlaygroundOutputLogController(
            params.outputLogListElement,
            params.outputLogCurrentSelectionElement,
            params.outputLogCopyToInputButtonElement,
            params.outputLogClearButtonElement,
        );
        this.epubCfiParserController = new PlaygroundEpubCfiParserController(
            params.parseEpubCfiFormElement,
            params.parseEpubCfiInputElement,
            params.parseEpubCfiMatchThresholdInputElement,
            params.parseEpubCfiSelectButtonElement,
        );
        new PlaygroundHelpDialogController(
            params.helpDialogElement,
            params.showHelpDialogButtonElement,
            params.helpDialogCloseButtonElement,
        );

        this.contentDocumentIframeController.setOnSelectionChangedCallback(range => {
            this.handleSelectionChange(range);
        });

        this.outputLogController.setOnListItemClickCallback(epubCfi => {
            // When clicking from the history log, we will use the current threshold value in the input
            this.setSelectionFromEpubCfi(epubCfi, Number(params.parseEpubCfiMatchThresholdInputElement.value) || 0.2);
        });

        this.outputLogController.setOnCopyToInputButtonClickCallback(epubCfi => {
            this.epubCfiParserController.setEpubCfiInputValue(epubCfi);
            this.epubCfiParserController.getFormElement().scrollIntoView();
        });

        this.epubCfiParserController.setParseAndSelectEpubCfiCallback((epubCfi, matchThreshold) => {
            this.setSelectionFromEpubCfi(epubCfi, matchThreshold);
        });
    }

    init(opfUrl: string, contentDocumentUrl: string): void {
        this.contentDocumentIframeController.setIframeSrcUrl(contentDocumentUrl);
        this.opfController.setOpfUrlSrc(opfUrl);
    }

    private handleSelectionChange(range: Range): void {
        const opfDocument = this.opfController.getOpfDocument();
        if (!opfDocument) {
            console.error('No opf document available');
            return;
        }

        // In this demo, we always assume it is the first spine item
        const itemRefElement = opfDocument.querySelector('itemref');
        if (!itemRefElement) {
            console.error('Opf document contains no <itemref> elements');
            return;
        }

        const epubCfi = PlaygroundEpubCfiUtils.getEpubCfiForDomRange(range, itemRefElement);
        this.outputLogController.setCurrentSelectionEpubCfi(epubCfi, !range.collapsed);

        if (range.collapsed) {
            const rect = range.getBoundingClientRect();
            this.contentDocumentIframeController.renderPositionMarker(rect.x, rect.y, rect.height);
        } else {
            this.contentDocumentIframeController.clearPositionMarker();
        }
    }

    private setSelectionFromEpubCfi(epubCfi: string, matchThreshold: number): void {

        this.contentDocumentIframeController.clearPositionMarker();
        this.contentDocumentIframeController.clearContentSelection();

        const opfDocument = this.opfController.getOpfDocument();
        if (!opfDocument) {
            console.error('No opf document available');
            return;
        }
        const opfUrl = this.opfController.getOpfUrl();
        if (!opfUrl) {
            console.error('No opf url available');
            return;
        }
        const contentDocument = this.contentDocumentIframeController.getContentDocument();
        if (!contentDocument) {
            console.error('No content document available');
            return;
        }
        const range = PlaygroundEpubCfiUtils.getDomRangeForEpubCfi(epubCfi, opfDocument, opfUrl, contentDocument, matchThreshold);
        if (range) {
            this.contentDocumentIframeController.setSelectionRange(range);
            this.contentDocumentIframeController.revealActiveSelection();
        }

    }

}
