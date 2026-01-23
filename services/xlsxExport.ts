import * as XLSX from "xlsx";
import { POLineRow } from "../types";

type ControlSurfaceRow = Record<string, any>;

/**
 * Convert POLineRow[] to the exact columns expected by PO_LineItem_Analysis.
 * This matches the headers in PO_Automation_Control_Surface_Template_v3.xlsx.
 */
function mapToControlSurfaceRows(rows: POLineRow[]): ControlSurfaceRow[] {
  return rows.map((r) => {
    const flags = [r.edge_case_flag_1, r.edge_case_flag_2, r.edge_case_flag_3].filter(Boolean).join(",");

    // Spreadsheet implies 0–100; your app currently uses 0..1
    const confidencePct =
      typeof r.confidence_score === "number"
        ? Math.round(r.confidence_score * 100)
        : "";

    const deterministicRuleExists =
      r.automation_lane === "AUTO" && !flags ? "Y" : (r.automation_lane === "AUTO" ? "Y" : "");

    return {
      // doc-level
      doc_id: r.doc_id ?? "",
      doc_type: r.doc_type ?? "UNKNOWN",
      customer_name: r.customer_name ?? "",
      customer_order_no: r.customer_po_number ?? "",
      abh_order_no: "", // not available from current extraction
      document_date: r.doc_date ?? "",
      ship_to_name: "", // optional: parse from address later
      ship_to_address_raw: r.ship_to_address_raw ?? "",
      bill_to_name: "",
      bill_to_address_raw: r.bill_to_address_raw ?? "",
      mark_instructions: r.mark_instructions ?? "",

      // line-level
      line_no: r.line_no ?? "",
      customer_item_no: r.customer_item_no ?? "",
      customer_item_desc_raw: r.customer_item_desc_raw ?? "",
      qty: r.qty ?? "",
      uom: r.uom ?? "",
      unit_price: r.unit_price ?? "",
      extended_price: r.extended_price ?? "",
      currency: "",

      // mapping + classification
      abh_item_no_candidate: r.abh_item_no_candidate ?? "",
      item_class: r.item_class ?? "UNKNOWN",
      edge_case_flags: flags,
      edge_case_flag_1: r.edge_case_flag_1 ?? "",
      edge_case_flag_2: r.edge_case_flag_2 ?? "",
      edge_case_flag_3: r.edge_case_flag_3 ?? "",
      confidence_score: confidencePct,
      automation_lane: r.automation_lane ?? "ASSIST",
      deterministic_rule_exists: deterministicRuleExists,
      phase_target: r.phase_target ?? "",

      // review controls
      fields_requiring_review: r.fields_requiring_review ?? "",
      routing_reason: r.routing_reason ?? "",
      review_status: "",
      reviewer: "",
      review_timestamp: "",

      // final overrides (human-reviewed)
      final_abh_item_no: r.abh_item_no_final ?? "",
      final_qty: "",
      final_uom: "",
      final_unit_price: "",
      final_ship_to: "",
      notes: "",
    };
  });
}

/**
 * Export rows into the provided Control Surface XLSX template, filling PO_LineItem_Analysis.
 * templateArrayBuffer should come from an <input type="file"> or a fetched asset.
 */
export function buildControlSurfaceWorkbook(args: {
  templateArrayBuffer: ArrayBuffer;
  poLineRows: POLineRow[];
}): Blob {
  const { templateArrayBuffer, poLineRows } = args;

  const wb = XLSX.read(templateArrayBuffer, { type: "array" });

  const sheetName = "PO_LineItem_Analysis";
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Template missing sheet: ${sheetName}`);
  }

  // Read existing header row to preserve column order exactly
  const headerAOA = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, range: 0, blankrows: false }) as any[];
  const headers: string[] = (headerAOA?.[0] ?? []).map((h: any) => String(h || "").trim());
  if (!headers.length) throw new Error("Could not read header row from template.");

  // Build data rows in template header order
  const mapped = mapToControlSurfaceRows(poLineRows);
  const aoa: any[][] = [
    headers,
    ...mapped.map((rowObj) => headers.map((h) => (rowObj[h] ?? ""))),
  ];

  // Replace the entire sheet contents
  const newWs = XLSX.utils.aoa_to_sheet(aoa);

  // Preserve sheet name
  wb.Sheets[sheetName] = newWs;

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
