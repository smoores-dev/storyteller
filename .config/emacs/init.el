(setq straight-repository-branch "develop")
(setq straight-use-package-by-default t)

(defvar bootstrap-version)
(let ((bootstrap-file
       (expand-file-name "straight/repos/straight.el/bootstrap.el" user-emacs-directory))
      (bootstrap-version 6))
  (unless (file-exists-p bootstrap-file)
    (with-current-buffer
        (url-retrieve-synchronously
         "https://raw.githubusercontent.com/radian-software/straight.el/develop/install.el"
         'silent 'inhibit-cookies)
      (goto-char (point-max))
      (eval-print-last-sexp)))
  (load bootstrap-file nil 'nomessage))

(add-to-list 'auto-mode-alist '("\\.[cm]js\\'" . js-mode))

(when (functionp 'straight-use-package) (straight-use-package 'use-package))
(eval-when-compile
  (add-to-list 'load-path (expand-file-name "straight/repos/use-package" user-emacs-directory))
  (require 'use-package))

;; Pop-up Menu Completion
(use-package corfu)
  ;; :init
  ;;(global-corfu-mode))

(use-package dracula-theme)

(use-package emacs
	     :init
	     ;; Add prompt indicator to `completing-read-multiple'.
	     (defun crm-indicator (args)
	       (cons (format "[CRM%s] %s"
			     (replace-regexp-in-string
			      "\\`\\[.*?]\\*\\|\\[.*?]\\*\\'" ""
			      crm-separator)
			     (car args))
		     (cdr args)))
	     (advice-add #'completing-read-multiple :filter-args #'crm-indicator)

	     ;; Do not allow the cursor in the minibuffer prompt
	     (setq minibuffer-prompt-properties
		   '(read-only t cursor_intangible t face minibuffer-prompt))
	     (add-hook 'minibuffer-setup-hook #'cursor-intangible-mode)

	     ;; Hide commands in M-x which do not work in the current mode.
	     (setq read-extended-command-predicate
		   #'command-completion-default-include-p)

	     ;; Enable recursive minibuffers
	     (setq enable-recursive-minibuffers t)

	     ;; TAB cycle if there are fewer than 5 candidates
	     (setq completion-cycle-threshold 5)

	     ;; Enable indentation+completion using the TAB key
	     (setq tab-always-indent 'complete))

(use-package flycheck
  :diminish
  :functions flycheck-add-next-checker flycheck-may-enable-checker flycheck-select-checker
  :config)

(use-package go-mode)

;; Enables prioritized fuzzy search
(use-package hotfuzz
             :init
             (setq completion-styles '(hotfuzz)))

(use-package htmlize)

(use-package jest)

(use-package json-mode)

(use-package ligature
  :functions ligature-set-ligatures global-ligature-mode
  :config
  (ligature-set-ligatures 'prog-mode
			  '("-<<" "-<" "-<-" "<--" "<---" "<<-" "<-" "->" "->>" "-->" "--->" "->-" ">-" ">>-"
                            "=<<" "=<" "=<=" "<==" "<===" "<<=" "<=" "=>" "=>>" "==>" "===>" "=>=" ">=" ">>="
                            "<->" "<-->" "<--->" "<---->" "<=>" "<==>" "<===>" "<====>" "-------->"
                            "<~~" "<~" "~>" "~~>" "::" ":::" "==" "!=" "/=" "~=" "<>" "===" "!==" "=/=" "=!="
                            ":=" ":-" ":+" "<*" "<*>" "*>" "<|" "<|>" "|>" "<." "<.>" ".>" "+:" "-:" "=:" ":>" "__"
                            "(*" "*)" "[|" "|]" "{|" "|}" "++" "+++" "\\/" "/\\" "|-" "-|" "<!--" "<!---" "<***>"))
  (global-ligature-mode t))

(use-package lsp-mode
  :diminish lsp-mode lsp-lens-mode
  :defines lsp-deferred lsp-eslint-auto-fix-on-save
  :functions lsp-eslint-fix-all
  :hook ((js-mode . lsp-deferred)
	 (go-mode . lsp-deferred)
	 (python-mode . lsp-deferred)
	 (tsx-ts-mode . lsp-deferred)
	 (typescript-ts-mode . lsp-deferred))
  :preface
  (defun lsp-eslint-before-save (orig-fun)
    "Run `lsp-eslint-apply-all-fixes' and then run original lsp--before-save."
    (when lsp-eslint-auto-fix-on-save (lsp-eslint-fix-all))
    (funcall orig-fun))
  :config
  (advice-add 'lsp--before-save :around #'lsp--eslint-before-save))

(use-package lsp-ui
  :defines lsp-ui-mode-map
  :config
  (define-key lsp-ui-mode-map [remap js-find-symbol] #'xref-find-definitions))

;; Additional minibuffer metadata
(use-package marginalia
	     :init
	     (marginalia-mode))

(use-package move-text)

(use-package multiple-cursors
  :bind (("C->" . mc/mark-next-like-this)
	 ("C-<" . mc/mark-previous-like-this)
	 ("C-c C-<" . mc/mark-all-like-this)))

(use-package ox-clip)

(use-package prettier
  :diminish
  :defines prettier-major-mode-parsers
  :config
  (let ((typescript-parsers (cdr (assoc 'typescript-mode prettier-major-mode-parsers))))
    (add-to-list 'prettier-major-mode-parsers `(tsx-ts-mode . ,typescript-parsers)
		 (add-to-list 'prettier-major-mode-parsers `(typescript-ts-mode . ,typescript-parsers)))))

(use-package projectile
  :diminish
  :config
  (global-set-key (kbd "C-c p") 'projectile-command-map))

(use-package rainbow-mode
  :diminish
  :hook prog-mode)

(use-package ripgrep)

(use-package rust-mode
  :init
  (setq-default rust-format-on-save t))

(use-package racer
  :requires rust-mode
  :hook (rust-mode . racer-mode))

(use-package savehist
	     :init
	     (savehist-mode))

(use-package smartparens
  :diminish
  :init
  (require 'smartparens-config))

(use-package super-save
  :diminish
  :functions super-save-mode
  :config
  (super-save-mode +1))

(use-package typescript-ts-mode
  :mode (("\\.ts\\'" . typescript-ts-mode)
	 ("\\.tsx\\'" . tsx-ts-mode)))

(use-package uniquify
  :straight nil)

;; Better minibuffer completion
(use-package vertico
	     :init
	     (vertico-mode))

(use-package volatile-highlights
  :diminish)

(use-package yaml-mode)

(use-package whitespace-cleanup-mode
  :diminish)

(custom-set-variables
 ;; custom-set-variables was added by Custom.
 ;; If you edit it by hand, you could mess it up, so be careful.
 ;; Your init file should contain only one such instance.
 ;; If there is more than one, they won't work right.
 '(cua-mode t)
 '(cursor-type 'bar)
 '(custom-enabled-themes '(dracula))
 '(custom-safe-themes
   '("79730342933b4b15c8c78b6ef92f28ddef9c40b720fcb1fd4ca8396cebe323ca" default))
 '(safe-local-variable-values
   '((eval let
	   ((project-directory
	     (car
	      (dir-locals-find-file default-directory))))
	   (setq lsp-clients-typescript-server-args
		 `("--tsserver-path" ,(concat project-directory ".yarn/sdks/typescript/bin/tsserver")
		   "--stdio")))))
 '(package-selected-packages
   '(corfu hotfuzz vertico-mouse savehist orderless use-package vertico marginalia))
 '(tool-bar-mode nil)
 '(visible-bell t))
(custom-set-faces
 ;; custom-set-faces was added by Custom.
 ;; If you edit it by hand, you could mess it up, so be careful.
 ;; Your init file should contain only one such instance.
 ;; If there is more than one, they won't work right.
 )
