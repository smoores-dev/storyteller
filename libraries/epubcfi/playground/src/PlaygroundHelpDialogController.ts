export class PlaygroundHelpDialogController {

    constructor(
        private helpDialogElement: HTMLDialogElement,
        showHelpDialogButton: HTMLElement,
        closeHelpDialogButton: HTMLElement,
    ) {
        showHelpDialogButton.addEventListener('click', () => {
            this.helpDialogElement.showModal();
        });

        closeHelpDialogButton.addEventListener('click', () => {
            this.helpDialogElement.close();
        });
    }

}