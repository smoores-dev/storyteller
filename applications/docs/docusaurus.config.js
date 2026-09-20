// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

require("dotenv").config()
// const { getFileAuthors } = require("./utils/getFileAuthors")
const { generateLibraryDocs } = require("./utils/libraryDocs")
const { prismTheme } = require("./utils/prismTheme")
const remarkMath = require("remark-math")
const rehypeKatex = require("rehype-katex")

const studio = {
  gitlab: {
    baseUrl:
      process.env.STUDIO_GITLAB_URL ??
      process.env.CI_SERVER_URL ??
      "https://gitlab.com",
    projectPath:
      process.env.STUDIO_GITLAB_PROJECT ??
      process.env.CI_PROJECT_PATH ??
      "storyteller-platform/storyteller",
    appId: process.env.STUDIO_GITLAB_APP_ID ?? null,
  },
  defaultBranch: process.env.STUDIO_DEFAULT_BRANCH ?? "main",
  docsRoot: process.env.STUDIO_DOCS_ROOT ?? "applications/docs",
  contentRoots: ["docs", "versioned_docs", "contributing", "blog"],
  staticRoot: "static",
  // repository folders outside this site the studio may edit (library READMEs)
  externalRoots: ["libraries"],
  editPath: "/edit",
}

generateLibraryDocs({
  routeBasePath: "libraries",
  repoUrl: `${studio.gitlab.baseUrl}/${studio.gitlab.projectPath}`,
  branch: studio.defaultBranch,
})

/** @type {import('@docusaurus/plugin-content-docs').EditUrlFunction} */
const studioEditUrl = ({ versionDocsDirPath, docPath }) =>
  `${studio.editPath}?file=${versionDocsDirPath}/${docPath}`

/** @type {import('@docusaurus/types').PluginModule} */
function tailwindPlugin() {
  return {
    name: "tailwind",
    configurePostCss(/** @type {any} */ postcssOptions) {
      postcssOptions.plugins.push(require("@tailwindcss/postcss"))
      return postcssOptions
    },
  }
}

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Storyteller",
  tagline:
    "A self-hosted platform for automatically aligning ebooks and audiobooks for immersive reading.",
  favicon: "img/favicon.ico",

  // Set the production url of your site here
  url: "https://storyteller-platform.dev/",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  // organizationName: 'facebook', // Usually your GitHub org/user name.
  // projectName: 'docusaurus', // Usually your repo name.
  onBrokenLinks: "warn",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  customFields: { studio },

  markdown: {
    format: "detect",
    parseFrontMatter: async (params) => {
      const result = await params.defaultParseFrontMatter(params)

      // Skip author lookup for blog posts
      if (params.filePath.includes("/blog/")) {
        return result
      }

      return result
      // const fileAuthors = await getFileAuthors(params.filePath)
      // return {
      //   ...result,
      //   frontMatter: {
      //     ...result.frontMatter,
      //     fileAuthors,
      //   },
      // }
    },
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  // for math
  stylesheets: [
    {
      href: "https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css",
      type: "text/css",
      integrity:
        "sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM",
      crossorigin: "anonymous",
    },
  ],

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.json"),
          editUrl: studioEditUrl,
          // v2 is what readers get at /docs, the v3 docs being written in
          // docs/ live at /docs/next until they are released
          lastVersion: "v2",
          // showLastUpdateTime: true,
          // showLastUpdateAuthor: true,
          versions: {
            current: {
              label: "3.0 (unreleased)",
              path: "next",
              banner: "unreleased",
              // src/css/v3.css is scoped to this class. the default
              // docs-version-current is shared by every docs instance
              className: "docs-v3",
            },
            v2: {
              label: "2.x",
            },
          },
        },
        theme: {
          customCss: [
            require.resolve("./src/css/custom.css"),
            require.resolve("./src/css/v3.css"),
          ],
        },
        blog: {
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
      }),
    ],
  ],

  plugins: [
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "contributing",
        path: "contributing",
        routeBasePath: "contributing",
        sidebarPath: require.resolve("./sidebarsContributing.json"),
        editUrl: studioEditUrl,
        // showLastUpdateTime: true,
        // showLastUpdateAuthor: true,
      },
    ],
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "libraries",
        // written by utils/libraryDocs.js from libraries/*/README.md
        path: "generated/libraries",
        routeBasePath: "libraries",
        sidebarPath: require.resolve("./sidebarsLibraries.json"),
      },
    ],
    require.resolve("docusaurus-lunr-search"),
    // "./plugins/fetch-contributors.ts",
    "./plugins/studio-sidebar.ts",
    tailwindPlugin,
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: "img/Storyteller_Logo.jpg",
      navbar: {
        title: "Storyteller",
        logo: {
          alt: "Storyteller Logo",
          src: "img/Storyteller_Logo.png",
        },
        items: [
          {
            type: "docSidebar",
            sidebarId: "sidebar",
            position: "left",
            label: "Docs",
          },
          {
            type: "doc",
            docId: "contributing-overview",
            docsPluginId: "contributing",
            label: "Contributing",
            position: "left",
          },
          {
            type: "docSidebar",
            sidebarId: "libraries",
            docsPluginId: "libraries",
            label: "Libraries",
            position: "left",
          },
          {
            to: "blog",
            label: "Blog",
            position: "left",
          },
          {
            label: "Tools",
            items: [
              {
                label: "OPDS Validator",
                to: "/tools/opds-validator",
              },
            ],
          },
          {
            href: "https://opencollective.com/storyteller",
            label: "Donate",
            position: "left",
          },
          {
            href: "/team",
            label: "Team",
            position: "right",
          },
          {
            href: "https://discord.gg/KhSvFqcrza",
            className: "navbar-discord-link",
            "aria-label": "Join Discord server",
            position: "right",
          },
          {
            href: "https://gitlab.com/storyteller-platform/storyteller",
            className: "navbar-gitlab-link",
            "aria-label": "GitLab repository",
            // label: "GitLab",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Get started",
                to: "/docs/installation/self-hosting",
              },
              {
                label: "Administering",
                to: "/docs/settings",
              },
              {
                label: "Aligning",
                to: "/docs/managing/aligning",
              },
              {
                label: "Reading",
                to: "/docs/reading/playing-readalouds",
              },
            ],
          },
          {
            title: "Contribute",
            items: [
              {
                label: "Donate",
                to: "https://opencollective.com/storyteller",
              },
              {
                label: "Development",
                to: "/contributing/contributing-overview",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "Discord",
                href: "https://discord.gg/KhSvFqcrza",
              },
              {
                label: "GitLab",
                href: "https://gitlab.com/storyteller-platform/storyteller",
              },
              {
                label: "Blog",
                to: "/blog",
              },
            ],
          },
          // {
          //   title: 'Community',
          //   items: [
          //     {
          //       label: 'Stack Overflow',
          //       href: 'https://stackoverflow.com/questions/tagged/docusaurus',
          //     },
          //     {
          //       label: 'Discord',
          //       href: 'https://discordapp.com/invite/docusaurus',
          //     },
          //     {
          //       label: 'Twitter',
          //       href: 'https://twitter.com/docusaurus',
          //     },
          //   ],
          // },
          // {
          //   title: 'More',
          //   items: [
          //     {
          //       label: 'Blog',
          //       to: '/blog',
          //     },
          //     {
          //       label: 'GitHub',
          //       href: 'https://github.com/facebook/docusaurus',
          //     },
          //   ],
          // },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Shane Friedman. Built with Docusaurus.`,
      },
      prism: {
        theme: prismTheme,
        darkTheme: prismTheme,
        additionalLanguages: ["bash", "yaml"],
      },
    }),
  future: {
    // everything faster:true turns on except the rspack persistent cache: it
    // keeps serving stale modules after files move ("module is not defined" in
    // the html template loader) and can panic rspack outright, and there is no
    // env var to switch it off. drop this back to faster:true once rspack fixes it
    faster: {
      rspackBundler: true,
      rspackPersistentCache: false,
      swcJsLoader: true,
      swcJsMinimizer: true,
      swcHtmlMinimizer: true,
      lightningCssMinimizer: true,
      mdxCrossCompilerCache: true,
      ssgWorkerThreads: true,
    },
    v4: true,
  },
}

module.exports = config
