// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes } = require("prism-react-renderer")

const { getFileAuthors } = require("./utils/getFileAuthors")
const lightCodeTheme = themes.github
const darkCodeTheme = themes.dracula

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

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  markdown: {
    parseFrontMatter: async (params) => {
      const result = await params.defaultParseFrontMatter(params)

      // Skip author lookup for blog posts
      if (params.filePath.includes("/blog/")) {
        return result
      }

      const fileAuthors = await getFileAuthors(params.filePath)
      return {
        ...result,
        frontMatter: {
          ...result.frontMatter,
          fileAuthors,
        },
      }
    },
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            "https://gitlab.com/storyteller-platform/storyteller/-/tree/main/docs/",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
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
        sidebarPath: require.resolve("./sidebarsContributing.js"),
        editUrl:
          "https://gitlab.com/storyteller-platform/storyteller/-/tree/main/docs/",
      },
    ],
    require.resolve("docusaurus-lunr-search"),
    "./plugins/fetch-contributors.ts",
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      announcementBar: {
        id: "cve_2025_66478",
        content:
          'Storyteller versions prior to 2.3.21 are affected by a critical vulnerability in Next.js (CVE-2025-66478). Please upgrade to at least 2.3.21. <a target="_blank" rel="noopener noreferrer" href="https://nextjs.org/blog/CVE-2025-66478">Learn more</a>',
        backgroundColor: "#ff4d4d",
        textColor: "#ffffff",
        isCloseable: true,
      },
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
            to: "blog",
            label: "Blog",
            position: "left",
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
            href: "https://gitlab.com/storyteller-platform/storyteller",
            label: "GitLab",
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
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ["bash", "yaml"],
      },
    }),
  future: {
    experimental_faster: true,
    v4: true,
  },
}

module.exports = config
