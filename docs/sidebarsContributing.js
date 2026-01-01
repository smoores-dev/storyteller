/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
module.exports = {
  contributing: [
    {
      type: "category",
      label: "Contributing to Storyteller",
      collapsed: false,
      collapsible: false,
      items: [
        "contributing-overview",
        "how-to-report-a-bug",
        "how-to-request-a-feature",
        "how-to-improve-documentation",
        {
          type: "category",
          label: "Contributing Code",
          collapsed: false,
          collapsible: false,
          items: [
            "environment-setup",
            "server-development",
            "mobile-development",
            "development-guidelines",
          ],
        },
      ],
    },
  ],
}
