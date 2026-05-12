import InsuranceScheduleView from "@/components/InsuranceScheduleView";

// CUR-7: The Paperwork → Insurance landing page.
//
// Server-component shell — the schedule is fetched client-side via the
// InsuranceScheduleView component so it picks up `useHideValues()` and
// other client contexts the rest of the app uses.
export default function InsurancePaperworkPage() {
  return <InsuranceScheduleView />;
}
