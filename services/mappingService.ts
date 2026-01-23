import { GeminiParsingResult, POLineRow, EdgeCaseCode, AutomationLane } from "../types";
import * as XLSX from "xlsx";

const DIMENSION_RE = /\bCUT\s*TO\b|(\d+\s*-\s*\d+\/\d+)|(\d+\s*\/\s*\d+)\s*\"/i;

function docTypeToRowDocType(dt: string): POLineRow["doc_type"] {
  const normalized = (dt || "").toUpperCase();
  if (normalized.includes("INVOICE")) return "INVOICE";
  if (normalized.includes("SALES ORDER")) return "SALES_ORDER";
  if (normalized.includes("PURCHASE ORDER")) return "PURCHASE_ORDER";
  if (normalized.includes("CREDIT")) return "CREDIT_MEMO";
  return "UNKNOWN";
}

function uniqTop3(flags: EdgeCaseCode[]) {
  const uniq = Array.from(new Set(flags)).filter(Boolean);
  return [uniq[0] ?? "", uniq[1] ?? "", uniq[2] ?? ""] as const;
}

/**
 * Maps Gemini extraction results to the enterprise POLineRow schema.
 */
export function geminiResultToPOLineRows(args: {
  parsed: GeminiParsingResult;
  sourceFileStem: string;
}): POLineRow[] {
  const { parsed, sourceFileStem } = args;
  const rows: POLineRow[] = [];
  let lineCounter = 1;

  for (const doc of parsed.documents ?? []) {
    const doc_type = docTypeToRowDocType(doc.documentType);
    const doc_id = (doc.orderNumber && doc.orderNumber.trim()) ? doc.orderNumber.trim() : sourceFileStem;

    for (const li of doc.lineItems ?? []) {
      rows.push({
        doc_id,
        doc_type,
        customer_name: doc.customerName ?? "",
        customer_po_number: doc.customerPO ?? "",
        doc_date: doc.orderDate ?? "",
        ship_to_address_raw: doc.shipToAddressRaw ?? "",
        bill_to_address_raw: doc.billToAddressRaw ?? "",
        mark_instructions: doc.markInstructions ?? "",
        line_no: lineCounter++,
        item_no: li.itemNumber ?? "",
        customer_item_no: "",
        customer_item_desc_raw: li.description ?? "",
        qty: (typeof li.quantityOrdered === "number" ? li.quantityOrdered : null),
        uom: li.unit ?? "",
        unit_price: (typeof li.unitPrice === "number" ? li.unitPrice : null),
        extended_price: (typeof li.totalAmount === "number" ? li.totalAmount : null),
        item_class: "UNKNOWN",
        edge_case_flag_1: "",
        edge_case_flag_2: "",
        edge_case_flag_3: "",
        confidence_score: 0.85,
        fields_requiring_review: "",
        routing_reason: "",
        automation_lane: "ASSIST",
        phase_target: 1,
        abh_item_no_candidate: li.itemNumber ?? "",
        abh_item_no_final: "",
      });
    }
  }
  return rows;
}

/**
 * Applies routing rules for lane assignment and edge-case detection.
 */
export function applyPhase1Routing(rows: POLineRow[]): POLineRow[] {
  return rows.map((r) => {
    const descRaw = r.customer_item_desc_raw || "";
    const desc = descRaw.toUpperCase();
    const flags: EdgeCaseCode[] = [];

    if (r.doc_id.toUpperCase().includes("-CM") || r.doc_type === "CREDIT_MEMO") flags.push("CREDIT_MEMO");
    if (desc.includes("RGA")) flags.push("RGA");
    if (desc.includes("SPECIAL LAYOUT")) flags.push("SPECIAL_LAYOUT");
    if (DIMENSION_RE.test(descRaw)) flags.push("CUSTOM_LENGTH");
    if ((r.unit_price ?? 1) === 0 || (r.extended_price ?? 1) === 0) flags.push("ZERO_DOLLAR");
    if (desc.includes("ALLEGION") || desc.includes("WIRING") || desc.includes("VON DUPRIN")) flags.push("WIRING_SPEC");
    if (desc.includes("P/U") || desc.includes("PICK UP") || desc.includes("CUSTOMER PICKUP")) flags.push("CUSTOMER_PICKUP");

    const [f1, f2, f3] = uniqTop3(flags);

    const item_class =
      (flags.includes("SPECIAL_LAYOUT") || flags.includes("CUSTOM_LENGTH") || flags.includes("WIRING_SPEC")) ? "CUSTOM" :
      (r.item_no && r.item_no.trim().length > 0) ? "CATALOG" :
      "UNKNOWN";

    const hardBlock = flags.includes("CREDIT_MEMO") || flags.includes("RGA") || flags.includes("SPECIAL_LAYOUT");
    let lane: AutomationLane = "ASSIST";
    let phase_target: 1 | 2 | 3 = 1;

    if (hardBlock) {
      lane = "HUMAN";
      phase_target = 1;
    } else if (flags.includes("CUSTOM_LENGTH")) {
      lane = "ASSIST";
      phase_target = 2;
    } else if (flags.includes("WIRING_SPEC") || flags.includes("ZERO_DOLLAR") || flags.includes("CUSTOMER_PICKUP")) {
      lane = "ASSIST";
      phase_target = 3;
    } else {
      lane = (r.confidence_score >= 0.9) ? "AUTO" : "ASSIST";
      phase_target = 1;
    }

    const fieldsToReview =
      lane === "AUTO" ? "" :
      hardBlock ? "doc_type;doc_id;customer_item_desc_raw" :
      flags.includes("CUSTOM_LENGTH") ? "customer_item_desc_raw;qty;item_no" :
      "qty;unit_price;item_no";

    return {
      ...r,
      item_class,
      edge_case_flag_1: f1,
      edge_case_flag_2: f2,
      edge_case_flag_3: f3,
      automation_lane: lane,
      phase_target,
      fields_requiring_review: fieldsToReview,
      routing_reason: flags.length ? `Flags: ${flags.join(", ")}` : "No flags; confidence gated",
    };
  });
}

function esc(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows: POLineRow[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]) as (keyof POLineRow)[];
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => esc(r[h])).join(",")),
  ];
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Standard XLSX download of the flattened rows.
 */
export function downloadXlsx(filename: string, rows: POLineRow[]) {
  if (!rows.length) return;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Order Lines");
  XLSX.writeFile(workbook, filename);
}

/**
 * Advanced Excel Export that follows the enterprise 'Control Surface' column mapping.
 */
export function exportControlSurfaceXlsx(filename: string, rows: POLineRow[]) {
  const mapped = rows.map(r => ({
    "Doc ID": r.doc_id,
    "Doc Type": r.doc_type,
    "Customer": r.customer_name,
    "PO Number": r.customer_po_number,
    "Date": r.doc_date,
    "Ship To (Raw)": r.ship_to_address_raw,
    "Bill To (Raw)": r.bill_to_address_raw,
    "Instructions": r.mark_instructions,
    "Line #": r.line_no,
    "Item #": r.item_no,
    "Description": r.customer_item_desc_raw,
    "Qty": r.qty,
    "UOM": r.uom,
    "Unit Price": r.unit_price,
    "Total": r.extended_price,
    "Lane": r.automation_lane,
    "Class": r.item_class,
    "Phase": r.phase_target,
    "Confidence": Math.round(r.confidence_score * 100) + "%",
    "Flags": [r.edge_case_flag_1, r.edge_case_flag_2, r.edge_case_flag_3].filter(Boolean).join("; "),
    "Review Fields": r.fields_requiring_review,
    "Reason": r.routing_reason
  }));

  const worksheet = XLSX.utils.json_to_sheet(mapped);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Control_Surface");
  XLSX.writeFile(workbook, filename);
}
