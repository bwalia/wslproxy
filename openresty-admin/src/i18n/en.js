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
          "Strengthen your website's defenses with this comprehensive CDN security platform. Effortlessly provision new servers and assign tailored security rules to build a robust, multi-layered protection strategy.",
        server_button: "Servers",
        rule_button: "Rules",
      },
      storage: {
        title: "Please choose an option for storage management",
        subtitle:
          "Storage preference — Disk, Redis, or PostgreSQL. You can change it anytime.",
        redis: "Redis",
        disk: "Disk",
        pgsql: "PostgreSQL",
        pgsql_hint:
          "Enter the PostgreSQL destination. Leave password blank to keep the value already in settings.json.",
        pgsql_required: "Host, database, and user are required for PostgreSQL.",
        apply_pgsql: "Use PostgreSQL",
        pg_host: "Host",
        pg_port: "Port",
        pg_database: "Database",
        pg_user: "User",
        pg_password: "Password",
        pg_password_hint:
          "Required on first switch if settings.json has no password.",
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
