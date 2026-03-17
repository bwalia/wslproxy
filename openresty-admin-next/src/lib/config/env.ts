/** Runtime environment — read once, import everywhere. */
export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "wslproxy",
  appDisplayName: process.env.NEXT_PUBLIC_APP_DISPLAY_NAME ?? "WSL Proxy",
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  buildNumber: process.env.NEXT_PUBLIC_APP_BUILD_NUMBER ?? "local",
  deploymentTime: process.env.NEXT_PUBLIC_DEPLOYMENT_TIME ?? "",
  targetPlatform: process.env.NEXT_PUBLIC_TARGET_PLATFORM ?? "DOCKER",
  jwtPassphrase: process.env.NEXT_PUBLIC_JWT_SECURITY_PASSPHRASE ?? "",
  primaryColor: process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR ?? "6366f1",
  secondaryColor: process.env.NEXT_PUBLIC_THEME_SECONDARY_COLOR ?? "10b981",
} as const;
