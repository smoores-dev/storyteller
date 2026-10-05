export class PlaygroundOpfController {
    private opfDocument: Document | null = null;
    private opfUrl: URL | null = null;

    constructor(private opfContentElement: HTMLElement, private opfUrlLabelElement: HTMLElement) {
    }

    getOpfDocument(): Document | null {
        return this.opfDocument;
    }

    getOpfUrl(): URL | null {
        return this.opfUrl;
    }

    setOpfUrlSrc(url: string): void {
        this.fetchOpfAndRenderToContainer(url).catch(console.error);
    }

    private async fetchOpfAndRenderToContainer(url: string): Promise<void> {
        this.opfUrlLabelElement.textContent = url;
        const response = await fetch(url);
        const opfXml = await response.text();
        this.opfUrl = new URL(response.url);

        this.opfContentElement.textContent = opfXml;

        const parser = new DOMParser();
        this.opfDocument = parser.parseFromString(opfXml, 'text/xml');
    }
}