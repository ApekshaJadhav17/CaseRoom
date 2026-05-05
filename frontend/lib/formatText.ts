export interface Section {
  label: string;
  value: string;
  isHeader?: boolean;
}

// ── JSON detection & parsing ───────────────────────────────────────────────────

function tryParseJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  // Direct JSON
  try {
    const p = JSON.parse(t);
    if (p && typeof p === "object" && !Array.isArray(p)) return p;
  } catch {}
  // Python-dict single-quote style
  try {
    const p = JSON.parse(
      t.replace(/'/g, '"').replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null")
    );
    if (p && typeof p === "object" && !Array.isArray(p)) return p;
  } catch {}
  return null;
}

function humanLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b(hpi|pmh|ros|ecg|ekg|wbc|rbc|hgb|hct|mcv|plt|bmp|cmp|lfts?|abg|ua|uti|uri|dvt|pe|mi|cad|chf|copd|gerd|gfr|bun|alt|ast|ldh|crp|esr|tsh|bnp|inr|ptt|psa)\b/gi, m => m.toUpperCase())
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// ── Sections parser — returns null if text is plain (not structured) ──────────

export function parseStructuredSections(text: string): Section[] | null {
  if (!text?.trim()) return null;

  const obj = tryParseJson(text.trim());
  if (!obj) return null;

  const sections: Section[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === "") continue;
    const label = humanLabel(key);

    if (typeof value === "object" && !Array.isArray(value)) {
      // Nested object → expand as sub-rows under a header
      sections.push({ label, value: "", isHeader: true });
      for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
        if (subVal === null || subVal === undefined || subVal === "") continue;
        sections.push({ label: humanLabel(subKey), value: String(subVal) });
      }
    } else if (Array.isArray(value)) {
      sections.push({ label, value: (value as unknown[]).map(String).join(", ") });
    } else {
      sections.push({ label, value: String(value) });
    }
  }

  return sections.length > 0 ? sections : null;
}

// ── Labs-specific parser — handles both JSON and plain text ───────────────────

export interface LabEntry {
  section: string;
  label: string;
  value: string;
  isAbnormal?: boolean;
}

const ABNORMAL_HINTS = /\b(elevated|low|high|decreased|increased|abnormal|positive|reactive|critical|↑|↓)\b/i;

export function parseLabsEntries(text: string): LabEntry[] {
  if (!text?.trim()) return [];

  const obj = tryParseJson(text.trim());
  if (obj) return parseLabsFromObject(obj);

  // Plain text fallback
  return parseLabsFromText(text);
}

function parseLabsFromObject(obj: Record<string, unknown>): LabEntry[] {
  const entries: LabEntry[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === "") continue;
    const label = humanLabel(key);

    if (typeof value === "object" && !Array.isArray(value)) {
      // Nested panel (e.g. CBC: {WBC: "12.5", ...})
      for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
        if (subVal === null || subVal === undefined || subVal === "") continue;
        const v = String(subVal);
        entries.push({ section: label, label: humanLabel(subKey), value: v, isAbnormal: ABNORMAL_HINTS.test(v) });
      }
    } else {
      const v = String(value);
      entries.push({ section: "Results", label, value: v, isAbnormal: ABNORMAL_HINTS.test(v) });
    }
  }
  return entries;
}

const DICT_LIKE = /^\{[\s\S]+\}$/;

function expandDictInto(entries: LabEntry[], dictStr: string, targetSection: string): boolean {
  const parsed = tryParseJson(dictStr);
  if (!parsed) return false;
  for (const [k, v] of Object.entries(parsed)) {
    if (v === null || v === undefined || v === "") continue;
    const val = String(v);
    entries.push({ section: targetSection, label: humanLabel(k), value: val, isAbnormal: ABNORMAL_HINTS.test(val) });
  }
  return true;
}

function parseLabsFromText(text: string): LabEntry[] {
  const entries: LabEntry[] = [];
  let section = "Results";
  const SECTION_RE = /^(CBC|BMP|CMP|LFTs?|ABG|UA|ECG|EKG|Troponin|Coags?|Lipid panel|HbA1c|Cultures?|Imaging|Urinalysis|TFTs?)\s*:?\s*$/i;

  const lines = text.replace(/\\n/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    i++;

    // Known section header
    if (SECTION_RE.test(line)) {
      section = humanLabel(line.replace(/:$/, "").trim());
      continue;
    }

    // Standalone dict on its own line → expand under current section
    if (DICT_LIKE.test(line)) {
      if (!expandDictInto(entries, line, section)) {
        entries.push({ section, label: line, value: "", isAbnormal: false });
      }
      continue;
    }

    // "label: value" or "label: {dict}"
    const match = line.match(/^([^:–\-]+?)\s*[:–\-]\s*([\s\S]+)$/);
    if (match) {
      const label = match[1].trim();
      const v = match[2].trim();

      if (DICT_LIKE.test(v)) {
        // Value is a nested dict → use label as section, expand sub-entries
        const secName = humanLabel(label.replace(/_/g, " "));
        if (!expandDictInto(entries, v, secName)) {
          entries.push({ section, label, value: v, isAbnormal: ABNORMAL_HINTS.test(v) });
        }
      } else {
        entries.push({ section, label, value: v, isAbnormal: ABNORMAL_HINTS.test(v) });
      }
      continue;
    }

    // Bare identifier — peek at next line to determine if it's a section+value pair
    const nextLine = i < lines.length ? lines[i] : null;

    if (nextLine && DICT_LIKE.test(nextLine)) {
      // Current line is a section name; next line is its dict value
      const secName = humanLabel(line.replace(/_/g, " "));
      if (!expandDictInto(entries, nextLine, secName)) {
        entries.push({ section, label: nextLine, value: "", isAbnormal: false });
      }
      i++;
    } else if (nextLine && !DICT_LIKE.test(nextLine) && !nextLine.match(/^[A-Za-z_]+$/) && nextLine !== "") {
      // Next line looks like a scalar value (number, short result) → key/value pair split across lines
      const label = humanLabel(line.replace(/_/g, " "));
      const v = nextLine;
      entries.push({ section, label, value: v, isAbnormal: ABNORMAL_HINTS.test(v) });
      i++;
    } else {
      // Just a label with no value
      entries.push({ section, label: humanLabel(line.replace(/_/g, " ")), value: "", isAbnormal: false });
    }
  }
  return entries;
}

// ── Generic text cleaner (fallback for narrative fields) ──────────────────────

export function formatMedicalText(text: string): string {
  if (!text?.trim()) return "";
  const trimmed = text.trim();

  const obj = tryParseJson(trimmed);
  if (obj) {
    // Convert to readable narrative: each key–value on its own line
    return Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => {
        const label = humanLabel(k);
        if (typeof v === "object" && !Array.isArray(v)) {
          const sub = Object.entries(v as Record<string, unknown>)
            .filter(([, sv]) => sv !== null && sv !== "")
            .map(([sk, sv]) => `${humanLabel(sk)}: ${sv}`)
            .join(", ");
          return `${label}: ${sub}`;
        }
        return `${label}: ${Array.isArray(v) ? (v as unknown[]).join(", ") : String(v)}`;
      })
      .join("\n");
  }

  return trimmed.replace(/\\n/g, "\n").replace(/\\t/g, "  ").replace(/\n{3,}/g, "\n\n");
}
