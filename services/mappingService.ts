import { GeminiParsingResult, POLineRow } from "../types";
import { ReferencePack } from "../referencePack.schema";
import { ReferenceService } from "./referenceService";

// from old version
const DIMENSION_RE = /\bCUT\s*TO\b|(\d+\s*-\s*\d+\/\d+)|(\d+\s*\/\s*\d+)\s*\"/i;

function docTypeToRowDocType(dt: string): POLineRow["doc_type"] {
  const normalized = (dt || "").toUpperCase();
  if (normalized.includes("INVOICE")) return "INVOICE";
  if (normalized.includes("SALES ORDER")) return "SALES_ORDER";
  if (normalized.includes("PURCHASE ORDER")) return "PURCHASE_ORDER";
  if (normalized.includes("CREDIT")) return "CREDIT_MEMO";
  return "UNKNOWN";
}

function uniqTop3(flags: string[]) {
  const uniq = Array.from(new Set(flags)).filter(Boolean);
  return [uniq[0] ?? "", uniq[1] ?? "", uniq[2] ?? ""] as const;
}

export function geminiResultToPOLineRows(args: {
  parsed: GeminiParsingResult;
  sourceFileStem: string;
  refPack?: ReferencePack | null;
}): POLineRow[] {
  const { parsed, sourceFileStem, refPack } = args;
  const rows: POLineRow[] = [];
  let lineCounter = 1;

  const refService = refPack ? new ReferenceService(refPack) : null;

  for (const doc of parsed.documents ?? []) {
    const doc_type = docTypeToRowDocType(doc.documentType);
    const doc_id =
      (doc.orderNumber && doc.orderNumber.trim())
        ? doc.orderNumber.trim()
        : sourceFileStem;

    for (const li of doc.lineItems ?? []) {
      const combinedText = `${li.itemNumber ?? ""} ${li.description ?? ""}`.trim();

      // deterministic normalization (if ref pack loaded)
      const mRef =
        refService?.normalizeManufacturer(combinedText) ||
        refService?.normalizeManufacturer(li.manufacturer || "");

      const fRef =
        refService?.normalizeFinish(combinedText) ||
        refService?.normalizeFinish(li.finish || "");

      const catRef =
        refService?.detectCategory(combinedText) ||
        refService?.detectCategory(li.category || "");

      const elecRef = refService?.detectElectrifiedDevice(combinedText);
      const hwSetRef = refService?.detectHardwareSet(combinedText);
      const wireRef = elecRef ? refService?.detectWiring(elecRef.device_type) : undefined;

      const m_abbr = mRef?.abbr || "";
      const m_full = mRef?.name || li.manufacturer || "";
      const f_us = fRef?.us_code || li.finish || "";
      const f_bhma = fRef?.bhma_code || "";
      const g_sym = catRef?.gordon_symbol || "";
      const cat = catRef?.category || li.category || "";
      const subcat = catRef?.subcategory || "";

      // Improved AUTO readiness heuristic:
      // - If itemNumber looks like an ABH catalog item OR description explicitly includes ABH + finish OR we have deterministic manufacturer
      const descUpper = (li.description || "").toUpperCase();
      const itemUpper = (li.itemNumber || "").toUpperCase();

      const looksLikeABH =
        itemUpper.startsWith("ABH") ||
        descUpper.includes("*ABH") ||
        descUpper.includes(" ABH ");

      const hasSomeIdentity = Boolean(li.itemNumber || li.description);
      const isAutoReadySeed = hasSomeIdentity && (looksLikeABH || Boolean(m_abbr));

      rows.push({
        doc_id,
        doc_type,
        customer_name: doc.customerName ?? "",
        customer_po_number: doc.customerPO ?? "",
        doc_date: doc.orderDate ?? "",

        line_no: lineCounter++,
        customer_item_no: li.itemNumber ?? "",
        description_raw: li.description ?? "",
        quantity: typeof li.quantityOrdered === "number" ? li.quantityOrdered : null,
        uom_raw: li.unit ?? "",
        unit_price: typeof li.unitPrice === "number" ? li.unitPrice : null,
        extended_price: typeof li.totalAmount === "number" ? li.totalAmount : null,

        // grounded normalization
        manufacturer_abbr: m_abbr,
        manufacturer_full: m_full,
        finish_us_code: f_us,
        finish_bhma_code: f_bhma,
        category: cat,
        subcategory: subcat,
        gordon_symbol: g_sym,

        electrified_device_type: elecRef?.device_type || "",
        voltage: li.voltage || (elecRef?.voltage?.[0] || ""),
        fail_mode: li.failMode || (elecRef?.fail_modes?.[0] || ""),
        wiring_configuration: wireRef?.name || "",
        hardware_set_template: hwSetRef?.template_id || "",

        match_score: isAutoReadySeed ? 0.9 : 0.65,
        match_method: mRef ? "DETERMINISTIC_GROUNDED" : "AI_PROBABILISTIC",
        rule_violations: [],
        reference_version: refPack?.version,

        automation_lane: "ASSIST",   // set by routing below
        phase_target: 1,             // set by routing below
        sage_import_ready: false,    // set by routing below
        sage_blockers: [],           // set by routing below
        needs_review_reason: "",     // set by routing below

        // extra context
        bill_to_address_raw: doc.billToAddressRaw,
        ship_to_address_raw: doc.shipToAddressRaw,
        mark_instructions: doc.markInstructions,

        // legacy fields (populated in routing)
        item_class: "UNKNOWN",
        edge_case_flag_1: "",
        edge_case_flag_2: "",
        edge_case_flag_3: "",
        fields_requiring_review: "",
        routing_reason: "",
        deterministic_rule_exists: "",
        confidence_score: undefined,
      });
    }
  }

  // Restore routing logic
  return applyPhase1Routing(rows);
}

/**
 * Restored Phase 1 routing + edge-case detection (adapted to current POLineRow fields).
 */
export function applyPhase1Routing(rows: POLineRow[]): POLineRow[] {
  return rows.map((r) => {
    const descRaw = r.description_raw || "";
    const desc = descRaw.toUpperCase();
    const flags: string[] = [];

    if ((r.doc_id || "").toUpperCase().includes("-CM") || r.doc_type === "CREDIT_MEMO") flags.push("CREDIT_MEMO");
    if (desc.includes("RGA")) flags.push("RGA");
    if (desc.includes("SPECIAL LAYOUT")) flags.push("SPECIAL_LAYOUT");
    if (DIMENSION_RE.test(descRaw)) flags.push("CUSTOM_LENGTH");
    if ((r.unit_price ?? 1) === 0 || (r.extended_price ?? 1) === 0) flags.push("ZERO_DOLLAR");
    if (desc.includes("ALLEGION") || desc.includes("WIRING") || desc.includes("VON DUPRIN")) flags.push("WIRING_SPEC");
    if (desc.includes("P/U") || desc.includes("PICK UP") || desc.includes("CUSTOMER PICKUP")) flags.push("CUSTOMER_PICKUP");

    const [f1, f2, f3] = uniqTop3(flags);

    const item_class =
      (flags.includes("SPECIAL_LAYOUT") || flags.includes("CUSTOM_LENGTH") || flags.includes("WIRING_SPEC")) ? "CUSTOM" :
      (r.customer_item_no && r.customer_item_no.trim().length > 0) ? "CATALOG" :
      "UNKNOWN";

    const hardBlock =
      flags.includes("CREDIT_MEMO") || flags.includes("RGA") || flags.includes("SPECIAL_LAYOUT");

    let lane: POLineRow["automation_lane"] = "ASSIST";
    let phase_target: 1 | 2 | 3 = 1;

    const confidence = typeof r.confidence_score === "number"
      ? r.confidence_score
      : (typeof r.match_score === "number" ? r.match_score : 0.65);

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
      lane = (confidence >= 0.9) ? "AUTO" : "ASSIST";
      phase_target = 1;
    }

    const fieldsToReview =
      lane === "AUTO" ? "" :
      hardBlock ? "doc_type;doc_id;description_raw" :
      flags.includes("CUSTOM_LENGTH") ? "description_raw;quantity;customer_item_no" :
      "quantity;unit_price;customer_item_no";

    const routing_reason =
      hardBlock ? `Hard-block: ${flags.join(",")}` :
      flags.length ? `Edge-cases: ${flags.join(",")}` :
      lane === "AUTO" ? "High confidence + no flags" :
      "Needs review";

    return {
      ...r,
      item_class,
      edge_case_flag_1: f1,
      edge_case_flag_2: f2,
      edge_case_flag_3: f3,
      automation_lane: lane,
      phase_target,
      confidence_score: confidence,
      fields_requiring_review: fieldsToReview,
      routing_reason,
      deterministic_rule_exists: lane === "AUTO" ? "Y" : "",
      sage_import_ready: lane === "AUTO",
      sage_blockers: lane === "AUTO" ? [] : (fieldsToReview ? fieldsToReview.split(";") : ["Needs review"]),
      needs_review_reason: lane === "AUTO" ? "" : routing_reason,
    };
  });
}

export function rowsToCsv(rows: POLineRow[]): string {
  if (!rows.length) return "";

  // Expanded CSV to avoid “losing” key fields
  const headers = [
    "Doc ID","Doc Type","Customer","PO#","Line#",
    "Item#","Desc","Qty","UOM","Price","Ext Price",
    "Item Class","Edge1","Edge2","Edge3",
    "Mfr Abbr","Mfr Full","Finish","Gordon Sym","Category","Subcat",
    "Fields Requiring Review","Routing Reason","Confidence","Lane","Phase","Ready"
  ];

  const lines = [
    headers.join(","),
    ...rows.map(r => [
      `"${(r.doc_id ?? "").replace(/"/g,'""')}"`,
      `"${(r.doc_type ?? "UNKNOWN").replace(/"/g,'""')}"`,
      `"${(r.customer_name ?? "").replace(/"/g,'""')}"`,
      `"${(r.customer_po_number ?? "").replace(/"/g,'""')}"`,
      r.line_no ?? "",
      `"${(r.customer_item_no ?? "").replace(/"/g,'""')}"`,
      `"${(r.description_raw ?? "").replace(/"/g,'""')}"`,
      r.quantity ?? "",
      `"${(r.uom_raw ?? "").replace(/"/g,'""')}"`,
      r.unit_price ?? "",
      r.extended_price ?? "",
      `"${(r.item_class ?? "UNKNOWN").replace(/"/g,'""')}"`,
      `"${(r.edge_case_flag_1 ?? "").replace(/"/g,'""')}"`,
      `"${(r.edge_case_flag_2 ?? "").replace(/"/g,'""')}"`,
      `"${(r.edge_case_flag_3 ?? "").replace(/"/g,'""')}"`,
      `"${(r.manufacturer_abbr ?? "").replace(/"/g,'""')}"`,
      `"${(r.manufacturer_full ?? "").replace(/"/g,'""')}"`,
      `"${(r.finish_us_code ?? "").replace(/"/g,'""')}"`,
      `"${(r.gordon_symbol ?? "").replace(/"/g,'""')}"`,
      `"${(r.category ?? "").replace(/"/g,'""')}"`,
      `"${(r.subcategory ?? "").replace(/"/g,'""')}"`,
      `"${(r.fields_requiring_review ?? "").replace(/"/g,'""')}"`,
      `"${(r.routing_reason ?? "").replace(/"/g,'""')}"`,
      (typeof r.confidence_score === "number" ? r.confidence_score : (r.match_score ?? "")),
      `"${(r.automation_lane ?? "ASSIST").replace(/"/g,'""')}"`,
      r.phase_target ?? "",
      (r.sage_import_ready ? "Y" : "N"),
    ].join(",")),
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
