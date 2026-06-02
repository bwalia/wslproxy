import "server-only";
import { fetchTrafficData } from "@/lib/dashboard/fetchers";
import TrafficOverviewClient from "./TrafficOverviewClient";

/**
 * Server-side data source for the entire overview tab.
 *
 * A single fetch populates:
 *   - the 6-card stats strip
 *   - geo traffic map
 *   - top domains list
 *   - error codes bar chart
 *   - latency pie
 *   - HTTP methods chart
 *   - main traffic area chart
 *
 * The backend endpoint bundles all of those in one `GET /traffic/stats`
 * payload so we don't fan out to N requests just to render the
 * overview — matches what the legacy react-admin dashboard did, but
 * with the request moved to the server so initial HTML ships with
 * data already populated.
 */
export default async function TrafficOverviewServer() {
  const data = await fetchTrafficData();
  return <TrafficOverviewClient data={data} />;
}
