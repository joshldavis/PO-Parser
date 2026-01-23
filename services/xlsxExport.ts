import * as XLSX from "xlsx";
import { POLineRow } from "../types";

type ControlSurfaceRow = Record<string, any>;

/**
 * Convert POLineRow[] to the exact columns expected by the enterprise analysis tool.
 */
function mapToControlSurfaceRows(rows: POLineRow[]): ControlSurfaceRow[] {
  return rows.map((r) => {
    // Collect flags from restored properties
    const flags = [r.edge_case_flag_1, r.edge_case_flag_2, r.edge_case_flag_3]
      .filter(Boolean)
      .join(";");

    // Calculate confidence score using restored field or fallback to match_score
    const confidencePct = typeof r.confidence_score === "number"
      ? Math.round(r.confidence_score * 100)
      : (typeof r.match_score === "number" ? Math.round(r.match_score * 100) : "");

    return {
      doc_id: r.doc_id ?? "",
      doc_type: r.doc_type ?? "UNKNOWN",
      customer_name: r.customer_name ?? "",
      customer_order_no: r.customer_po_number ?? "",
      abh_order_no: "", 
      document_date: r.doc_date ?? "",
      ship_to_address_raw: r.ship_to_address_raw ?? "",
      bill_to_address_raw: r.bill_to_address_raw ?? "",
      mark_instructions: r.mark_instructions ?? "",
      line_no: r.line_no ?? "",
      customer_item_no: r.customer_item_no ?? "",
      customer_item_desc_raw: r.description_raw ?? "",
      qty: r.quantity ?? "",
      uom: r.uom_raw ?? "",
      unit_price: r.unit_price ?? "",
      extended_price: r.extended_price ?? "",
      abh_item_no_candidate: r.sage_item_no ?? "",
      item_class: r.item_class ?? "UNKNOWN",
      edge_case_flags: flags,
      confidence_score: confidencePct,
      automation_lane: r.automation_lane ?? "ASSIST",
      deterministic_rule_exists: r.deterministic_rule_exists ?? (r.automation_lane === "AUTO" ? "Y" : ""),
      phase_target: r.phase_target ?? "",
      fields_requiring_review: r.fields_requiring_review ?? (r.sage_blockers || []).join(";"),
      routing_reason: r.routing_reason ?? r.needs_review_reason ?? "",
      final_abh_item_no: r.sage_item_no ?? "",
    };
  });
}

/**
 * Export rows into an XLSX workbook. If a template is provided, it tries to map to a specific sheet.
 */
export function buildControlSurfaceWorkbook(args: {
  templateArrayBuffer?: ArrayBuffer;
  poLineRows: POLineRow[];
}): Blob {
  const { templateArrayBuffer, poLineRows } = args;

  let wb: XLSX.WorkBook;
  const sheetName = "PO_LineItem_Analysis";

  if (templateArrayBuffer) {
    wb = XLSX.read(templateArrayBuffer, { type: "array" });
    const ws = wb.Sheets[sheetName];
    
    // If template has headers, we respect them
    const mapped = mapToControlSurfaceRows(poLineRows);
    const existingHeaderAOA = ws ? XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 }) : [];
    const headers = existingHeaderAOA[0] || (mapped.length > 0 ? Object.keys(mapped[0]) : []);
    
    const aoa = [
      headers,
      ...mapped.map(row => headers.map(h => row[h] ?? ""))
    ];
    
    wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(aoa);
  } else {
    wb = XLSX.utils.book_new();
    const mapped = mapToControlSurfaceRows(poLineRows);
    const ws = XLSX.utils.json_to_sheet(mapped);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

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