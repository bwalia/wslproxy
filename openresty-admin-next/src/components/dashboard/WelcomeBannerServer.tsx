import "server-only";
import { fetchInstanceInfo } from "@/lib/dashboard/fetchers";
import WelcomeBanner from "./WelcomeBanner";

/**
 * Server Component wrapper for the welcome banner.
 *
 * Fetches instance info on the server — so the first HTML response
 * already contains the hostname / IP / CPU metrics instead of a
 * "Loading…" flash while the client hydrates and issues the request.
 *
 * The `fetchInstanceInfo` call is tagged (`dashboard-instance`) so a
 * Server Action can force a refresh without hitting any other section.
 */
export default async function WelcomeBannerServer() {
  const info = await fetchInstanceInfo();
  return <WelcomeBanner info={info} />;
}
