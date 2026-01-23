import { POLineRow } from "../types";
import { ReferenceService } from "./referenceService";

/**
 * Enriches extracted order rows with canonical data from the Reference Pack
 * and performs rule-based validation to determine ERP readiness.
 */
export function enrichAndValidate(
  rows: POLineRow[],
  refService: ReferenceService,
  referenceVersion: string
): POLineRow[] {
  return rows.map(row => {
    const violations: string[] = [];
    let score = 0;

    // Build a combined text string for deterministic matching
    const text = `${row.customer_item_no ?? ""} ${row.description_raw}`;

    // 1. Manufacturer Normalization (Critical for ERP)
    const mfg = refService.normalizeManufacturer(text);
    if (mfg) {
      row.manufacturer_abbr = mfg.abbr;
      row.manufacturer_full = mfg.name;
      score += 0.3; // Increased weight
    } else {
      violations.push("Missing normalized manufacturer");
    }

    // 2. Part Number Check (Critical for Sage)
    if (row.customer_item_no && row.customer_item_no.length > 2) {
      score += 0.2;
    } else {
      violations.push("Missing or invalid Item Number");
    }

    // 3. Finish Normalization
    const finish = refService.normalizeFinish(text);
    if (finish) {
      row.finish_us_code = finish.us_code;
      row.finish_bhma_code = finish.bhma_code;
      score += 0.15;
    } else {
      violations.push("Unrecognized finish code");
    }

    // 4. Category Detection
    const cat = refService.detectCategory(text);
    if (cat) {
      row.category = cat.category;
      row.subcategory = cat.subcategory;
      row.gordon_symbol = cat.gordon_symbol;
      score += 0.15;
    }

    // 5. Electrification & Wiring Logic
    const elec = refService.detectElectrifiedDevice(text);
    if (elec) {
      row.electrified_device_type = elec.device_type;
      score += 0.1;

      const wiring = refService.detectWiring(elec.device_type);
      if (wiring) {
        row.wiring_configuration = wiring.name;
        score += 0.1;
      }
    }

    // 6. Hardware Set Mapping
    const set = refService.detectHardwareSet(text);
    if (set) {
      row.hardware_set_template = set.template_id;
      // Bonus score for template match
      score += 0.1;
    }

    // Update Audit Fields
    row.match_score = Math.min(score, 1);
    row.match_method = "reference_grounded_v3";
    row.rule_violations = violations;
    row.reference_version = referenceVersion;

    /**
     * ERP Gating Logic: 
     * To be "AUTO" (Ready for ERP Staging), a row MUST:
     * 1. Have 0 hard violations (Known Manufacturer, Known Part #, Known Finish)
     * 2. Meet the confidence threshold (0.6)
     */
    row.sage_import_ready = violations.length === 0 && row.match_score >= 0.6;
    row.sage_blockers = violations;
    row.needs_review_reason = row.sage_import_ready
      ? undefined
      : `Review Required: ${violations.join(", ")}`;

    // Route to lanes
    row.automation_lane = row.sage_import_ready ? "AUTO" : "ASSIST";

    return row;
  });
}
