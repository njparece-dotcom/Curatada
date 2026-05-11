"use client";

import { useHideValues } from "@/lib/HideValuesContext";
import PortfolioValueChart from "@/components/PortfolioValueChart";
import CollectionGrowthChart from "@/components/CollectionGrowthChart";

// The dashboard's hero chart switches with the global hide-values toggle:
//   - values visible -> dollar values over time (Portfolio Value)
//   - values hidden  -> item counts over time   (Collection Growth)
// Both children pull from /api/dashboard/history and pick different
// fields from each snapshot, so no extra API work is needed.
export default function PortfolioChart() {
  const { hideValues } = useHideValues();
  return hideValues ? <CollectionGrowthChart /> : <PortfolioValueChart />;
}
