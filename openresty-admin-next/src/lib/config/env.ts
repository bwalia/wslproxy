/**
 * Centralized environment configuration.
 * All NEXT_PUBLIC_* env vars are accessed through this module.
 * Replaces all import.meta.env.VITE_* references from the original Vite app.
 */
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8280/api',
  frontUrl: process.env.NEXT_PUBLIC_FRONT_URL ?? 'http://localhost:8280',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'wslproxy',
  appDisplayName: process.env.NEXT_PUBLIC_APP_DISPLAY_NAME ?? 'WSL Proxy',
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
  buildNumber: process.env.NEXT_PUBLIC_APP_BUILD_NUMBER ?? 'local',
  deploymentTime: process.env.NEXT_PUBLIC_DEPLOYMENT_TIME ?? 'local-dev',
  themePrimaryColor: process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR ?? '2E3A3C',
  themeSecondaryColor: process.env.NEXT_PUBLIC_THEME_SECONDARY_COLOR ?? '45A049',
  themeHoverColor: process.env.NEXT_PUBLIC_THEME_HOVER_COLOR ?? '036408',
  targetPlatform: (process.env.NEXT_PUBLIC_TARGET_PLATFORM ?? 'DOCKER') as 'DOCKER' | 'KUBERNETES',
  jwtSecurityPassphrase: process.env.NEXT_PUBLIC_JWT_SECURITY_PASSPHRASE ?? '',
} as const;

export type AppConfig = typeof config;
