// CUR-8: PDF renderer for the Insurance schedule.
//
// Uses @react-pdf/renderer (pure-JS, no Chrome dependency, fits Railway's
// standalone-Next runtime cleanly). Mirrors the web view layout from CUR-7:
// header → grouped sections per module → per-item rows → footer total.
//
// Pure server-side module — imported only by the export route. No client
// component boundary needed.

import React from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

type ModuleSlug = "guitars" | "watches" | "automobiles" | "iod";
type InsuranceSource = "ai" | "alternate_from_user" | "user_override";

export interface InsuranceScheduleItem {
  id: string;
  module: ModuleSlug;
  category: string;
  year: number | null;
  brand: string | null;
  model: string | null;
  description: string | null;
  condition: string | null;
  serial: string | null;
  insurance_value: number | null;
  insurance_value_source: InsuranceSource | null;
  insurance_value_date: string | null;
  needs_valuation: boolean;
}

interface ModuleSummary {
  count: number;
  total: number;
}

export interface InsuranceScheduleData {
  user: { name: string | null; email: string | null };
  generated_at: string;
  items: InsuranceScheduleItem[];
  summary: {
    item_count: number;
    total_insured_value: number;
    by_module: Record<ModuleSlug, ModuleSummary>;
  };
}

const MODULE_LABELS: Record<ModuleSlug, string> = {
  guitars: "Guitars",
  watches: "Watches",
  automobiles: "Automobiles",
  iod: "Collectibles",
};

const MODULE_ORDER: ModuleSlug[] = ["guitars", "watches", "automobiles", "iod"];

const SOURCE_LABELS: Record<InsuranceSource, string> = {
  ai: "AI",
  alternate_from_user: "Alt",
  user_override: "User-set",
};

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { marginBottom: 16, borderBottom: 1, borderBottomColor: "#000", paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#444" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, fontSize: 10 },
  moduleSection: { marginTop: 14 },
  moduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: 0.5,
    borderBottomColor: "#888",
    paddingBottom: 3,
    marginBottom: 5,
  },
  moduleTitle: { fontSize: 12, fontWeight: "bold" },
  moduleTotal: { fontSize: 10, color: "#444" },
  tableHeader: {
    flexDirection: "row",
    borderBottom: 0.5,
    borderBottomColor: "#888",
    paddingBottom: 3,
    marginBottom: 3,
    fontSize: 8,
    color: "#444",
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", paddingVertical: 3, borderBottom: 0.3, borderBottomColor: "#ddd" },
  cellItem: { flex: 4, paddingRight: 4 },
  cellSmall: { flex: 1.2, paddingRight: 4 },
  cellMoney: { flex: 1.8, textAlign: "right", paddingLeft: 4 },
  itemTitle: { fontSize: 10, fontWeight: "bold" },
  itemSub: { fontSize: 8, color: "#666", marginTop: 1 },
  badge: { fontSize: 7, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2, borderWidth: 0.5, borderColor: "#888", marginRight: 4 },
  needsValuation: { color: "#a16207", fontStyle: "italic", fontSize: 9 },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    marginTop: 18,
    borderTop: 1,
    borderTopColor: "#000",
    paddingTop: 6,
  },
  footerLabel: { fontSize: 10, color: "#444", marginRight: 10 },
  footerTotal: { fontSize: 16, fontWeight: "bold" },
  pageNumber: { position: "absolute", bottom: 18, right: 36, fontSize: 8, color: "#888" },
});

function InsurancePDFDoc({ data }: { data: InsuranceScheduleData }) {
  const grouped: Record<ModuleSlug, InsuranceScheduleItem[]> = {
    guitars: [],
    watches: [],
    automobiles: [],
    iod: [],
  };
  for (const item of data.items) grouped[item.module].push(item);

  return (
    <Document title={`Insurance Schedule — ${data.user.name ?? data.user.email ?? "Curatada"}`}>
      <Page size="LETTER" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Insurance Schedule</Text>
          <Text style={styles.subtitle}>
            {data.user.name ?? data.user.email ?? "—"} · as of {formatDate(data.generated_at)}
          </Text>
          <View style={styles.summaryRow}>
            <Text>Items insured: {data.summary.item_count}</Text>
            <Text>Total insured value: {formatMoney(data.summary.total_insured_value)}</Text>
          </View>
        </View>

        {/* Module groups */}
        {MODULE_ORDER.map((mod) => {
          const items = grouped[mod];
          if (items.length === 0) return null;
          const sub = data.summary.by_module[mod];
          return (
            <View key={mod} style={styles.moduleSection} wrap>
              <View style={styles.moduleHeader}>
                <Text style={styles.moduleTitle}>{MODULE_LABELS[mod]}</Text>
                <Text style={styles.moduleTotal}>
                  {sub.count} item{sub.count !== 1 ? "s" : ""} · {formatMoney(sub.total)}
                </Text>
              </View>

              {/* Column headers */}
              <View style={styles.tableHeader}>
                <Text style={styles.cellItem}>Item</Text>
                <Text style={styles.cellSmall}>Year</Text>
                <Text style={styles.cellSmall}>Condition</Text>
                <Text style={styles.cellSmall}>Serial</Text>
                <Text style={styles.cellMoney}>Insurance Value</Text>
                <Text style={styles.cellMoney}>Last Valued</Text>
              </View>

              {items.map((item) => (
                <View key={item.id} style={styles.row} wrap={false}>
                  <View style={styles.cellItem}>
                    <Text style={styles.itemTitle}>{[item.brand, item.model].filter(Boolean).join(" ") || "—"}</Text>
                    {item.description && <Text style={styles.itemSub}>{item.description}</Text>}
                  </View>
                  <Text style={styles.cellSmall}>{item.year ?? "—"}</Text>
                  <Text style={styles.cellSmall}>{item.condition || "—"}</Text>
                  <Text style={styles.cellSmall}>{item.serial || "—"}</Text>
                  <View style={styles.cellMoney}>
                    {item.needs_valuation ? (
                      <Text style={styles.needsValuation}>Needs valuation</Text>
                    ) : (
                      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
                        {item.insurance_value_source && (
                          <Text style={styles.badge}>{SOURCE_LABELS[item.insurance_value_source]}</Text>
                        )}
                        <Text>{formatMoney(item.insurance_value)}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cellMoney}>{formatDate(item.insurance_value_date) || "—"}</Text>
                </View>
              ))}
            </View>
          );
        })}

        {/* Footer total */}
        <View style={styles.footer}>
          <Text style={styles.footerLabel}>Total Insured Value</Text>
          <Text style={styles.footerTotal}>{formatMoney(data.summary.total_insured_value)}</Text>
        </View>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

/**
 * Render the insurance schedule to a PDF Buffer. The caller is responsible
 * for persisting the buffer (R2 in production, local disk in dev).
 */
export async function renderInsurancePdf(data: InsuranceScheduleData): Promise<Buffer> {
  const stream = await pdf(<InsurancePDFDoc data={data} />).toBuffer();
  // toBuffer() in @react-pdf returns a NodeJS Readable; collect into Buffer.
  return await streamToBuffer(stream);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
