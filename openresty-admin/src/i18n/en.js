import englishMessages from "ra-language-english";

const customEnglishMessages = {
  ...englishMessages,
  brahmstra: {
    search: "Search",
    configuration: "Configuration",
    language: "Language",
    theme: {
      name: "Theme",
      light: "Light",
      dark: "Dark",
    },
    dashboard: {
      welcome: {
        title: "Welcome to the WSL Proxy",
        subtitle:
          "This is CDN to protect the website. You can add a new Server and attach the required rule to it.",
        server_button: "Servers",
        rule_button: "Rules",
      },
      storage: {
        title: "Please choose a option for storage management",
        subtitle:
          "Storage Preference, You can change it by selecting any options.",
        redis: "Redis",
        disk: "Disk",
      },
    },
    menu: {
      sales: "Sales",
      catalog: "Catalog",
      customers: "Customers",
    },
    events: {
      review: {
        title: 'Posted review on "%{product}"',
      },
      order: {
        title: "Ordered 1 poster |||| Ordered %{smart_count} posters",
      },
    },
  },
};

export default customEnglishMessages;
