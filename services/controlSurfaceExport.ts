import * as XLSX from "xlsx";
import { POLineRow } from "../types";

/**
 * These MUST match row 1 of PO_LineItem_Analysis in:
 * PO_Automation_Control_Surface_Template_v3.xlsx
 */
export const CONTROL_SURFACE_HEADERS = [
  "doc_id",
  "doc_type",
  "customer_name",
  "customer_order_no",
  "abh_order_no",
  "document_date",
  "ship_to_name",
  "ship_to_address_raw",
  "bill_to_name",
  "bill_to_address_raw",
  "mark_instructions",
  "line_no",
  "customer_item_no",
  "customer_item_desc_raw",
  "qty",
  "uom",
  "unit_price",
  "extended_price",
  "currency",
  "abh_item_no_candidate",
  "item_class",
  "edge_case_flags",
  "edge_case_flag_1",
  "edge_case_flag_2",
  "edge_case_flag_3",
  "confidence_score",
  "automation_lane",
  "deterministic_rule_exists",
  "phase_target",
  "fields_requiring_review",
  "routing_reason",
  "review_status",
  "reviewer",
  "review_timestamp",
  "final_abh_item_no",
  "final_qty",
  "final_uom",
  "final_unit_price",
  "final_ship_to",
  "notes",
] as const;

type ControlHeader = (typeof CONTROL_SURFACE_HEADERS)[number];

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  const needsQuotes = /[,"\n]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/**
 * Map your internal row object -> EXACT control-surface row shape
 * Keep review/final fields blank (template is designed for human workflow).
 */
export function toControlSurfaceRecord(r: POLineRow): Record<ControlHeader, any> {
  const edgeFlags = [r.edge_case_flag_1, r.edge_case_flag_2, r.edge_case_flag_3]
    .filter(Boolean)
    .join(";");

  // Confidence score in template is usually a percent. Use 0–100.
  const conf =
    typeof r.confidence_score === "number"
      ? Math.round(r.confidence_score * 100)
      : typeof r.match_score === "number"
        ? Math.round(r.match_score * 100)
        : "";

  // Candidate list field: support string or array
  const candidate =
    Array.isArray((r as any).abh_item_no_candidate)
      ? (r as any).abh_item_no_candidate.join(";")
      : (r as any).abh_item_no_candidate ?? r.sage_item_no ?? "";

  // Required fields from template
  return {
    doc_id: r.doc_id ?? "",
    doc_type: r.doc_type ?? "UNKNOWN",
    customer_name: r.customer_name ?? "",
    customer_order_no: r.customer_po_number ?? "",
    abh_order_no: (r as any).abh_order_no ?? "",
    document_date: r.doc_date ?? "",

    ship_to_name: (r as any).ship_to_name ?? "",
    ship_to_address_raw: r.ship_to_address_raw ?? "",
    bill_to_name: (r as any).bill_to_name ?? "",
    bill_to_address_raw: r.bill_to_address_raw ?? "",
    mark_instructions: r.mark_instructions ?? "",

    line_no: r.line_no ?? "",
    customer_item_no: r.customer_item_no ?? "",
    customer_item_desc_raw: r.description_raw ?? "",
    qty: r.quantity ?? "",
    uom: r.uom_raw ?? "",
    unit_price: r.unit_price ?? "",
    extended_price: r.extended_price ?? "",
    currency: (r as any).currency ?? "USD",

    abh_item_no_candidate: candidate,

    item_class: r.item_class ?? "UNKNOWN",
    edge_case_flags: (r as any).edge_case_flags ?? edgeFlags,
    edge_case_flag_1: r.edge_case_flag_1 ?? "",
    edge_case_flag_2: r.edge_case_flag_2 ?? "",
    edge_case_flag_3: r.edge_case_flag_3 ?? "",

    confidence_score: conf,
    automation_lane: r.automation_lane ?? "ASSIST",
    deterministic_rule_exists: r.deterministic_rule_exists ?? "",
    phase_target: r.phase_target ?? 1,
    fields_requiring_review:
      r.fields_requiring_review ??
      (r.sage_blockers ? r.sage_blockers.join(";") : ""),
    routing_reason: r.routing_reason ?? r.needs_review_reason ?? "",

    // Human workflow fields — keep blank on export
    review_status: (r as any).review_status ?? "",
    reviewer: (r as any).reviewer ?? "",
    review_timestamp: (r as any).review_timestamp ?? "",

    // Final decision fields — keep blank unless your UI supports editing them
    final_abh_item_no: (r as any).final_abh_item_no ?? "",
    final_qty: (r as any).final_qty ?? "",
    final_uom: (r as any).final_uom ?? "",
    final_unit_price: (r as any).final_unit_price ?? "",
    final_ship_to: (r as any).final_ship_to ?? "",

    notes: (r as any).notes ?? "",
  };
}

export function exportControlSurfaceCsv(rows: POLineRow[]): string {
  const headerLine = CONTROL_SURFACE_HEADERS.join(",");
  const lines = rows.map((r) => {
    const rec = toControlSurfaceRecord(r);
    return CONTROL_SURFACE_HEADERS.map((h) => csvEscape(rec[h])).join(",");
  });
  return [headerLine, ...lines].join("\n");
}

/**
 * Writes values into the template workbook so the output "matches the first tab"
 * rather than creating a new workbook with mismatched headers.
 */
export function exportControlSurfaceXlsxUsingTemplate(args: {
  rows: POLineRow[];
  templateArrayBuffer: ArrayBuffer;
  sheetName?: string; // default: PO_LineItem_Analysis
}): ArrayBuffer {
  const { rows, templateArrayBuffer } = args;
  const sheetName = args.sheetName ?? "PO_LineItem_Analysis";

  const wb = XLSX.read(templateArrayBuffer, { type: "array" });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Template missing sheet: ${sheetName}`);

  // ✅ IMPORTANT: Real table begins at row 18 in your template
  const startRow = 18;

  // Helper: don’t overwrite formula cells that exist in the template
  function isFormulaCell(cell: any): boolean {
    // SheetJS stores formulas as { f: "..." }
    return !!cell && typeof cell === "object" && !!cell.f;
  }

  rows.forEach((r, idx) => {
    const rec = toControlSurfaceRecord(r);
    const rowNumber = startRow + idx;

    CONTROL_SURFACE_HEADERS.forEach((h, colIdx) => {
      const addr = XLSX.utils.encode_cell({ r: rowNumber - 1, c: colIdx });

      // ✅ Skip formula cells (e.g., edge_case_flags col) so template formulas stay intact
      if (isFormulaCell(ws[addr])) return;

      const v = rec[h];

      // Write typed values when reasonable (numbers stay numbers)
      if (v === null || v === undefined || v === "") {
        ws[addr] = { t: "s", v: "" };
      } else if (typeof v === "number") {
        ws[addr] = { t: "n", v };
      } else {
        ws[addr] = { t: "s", v: String(v) };
      }
    });
  });

  // Update sheet range
  const currentRef = ws["!ref"] ?? "A1:A1";
  const range = XLSX.utils.decode_range(currentRef);
  range.e.r = Math.max(range.e.r, startRow - 1 + rows.length);
  range.e.c = Math.max(range.e.c, CONTROL_SURFACE_HEADERS.length - 1);
  ws["!ref"] = XLSX.utils.encode_range(range);

  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}
