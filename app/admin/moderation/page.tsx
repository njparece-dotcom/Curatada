// Admin → Moderation review queue.
//
// Server-shell page: enforces admin auth at the edge so a non-admin user
// loading the URL bounces immediately to the home page (rather than rendering
// the client component and waiting for the queue fetch to 403). The client
// component handles all interactive bits — score-threshold slider, status
// chip filter, and per-image approve/block actions.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import ModerationQueueView from "@/components/admin/ModerationQueueView";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!isAdmin(session)) redirect("/");

  return <ModerationQueueView />;
}
