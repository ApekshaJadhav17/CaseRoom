"use client";

import { useState } from "react";
import { Case } from "@/lib/api";
import { parseStructuredSections, parseLabsEntries } from "@/lib/formatText";

interface Props {
  caseData: Case;
}

// ── Vital sign helpers ──────────────────────────────────────────────────────

function classifyVital(key: string, raw: string | number | undefined): "normal" | "warning" | "critical" {
  if (!raw) return "normal";
  const str = String(raw);

  if (key === "bp") {
    const match = str.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      const sys = parseInt(match[1]), dia = parseInt(match[2]);
      if (sys < 90 || dia < 60) return "critical";
      if (sys >= 140 || dia >= 90) return "warning";
      if (sys >= 130 || dia >= 80) return "warning";
    }
    return "normal";
  }
  if (key === "hr") {
    const v = parseInt(str);
    if (v < 50 || v > 120) return "critical";
    if (v < 60 || v > 100) return "warning";
    return "normal";
  }
  if (key === "rr") {
    const v = parseInt(str);
    if (v < 10 || v > 30) return "critical";
    if (v < 12 || v > 20) return "warning";
    return "normal";
  }
  if (key === "temp") {
    const match = str.match(/[\d.]+/);
    if (match) {
      const v = parseFloat(match[0]);
      const isFahrenheit = v > 50;
      const celsius = isFahrenheit ? (v - 32) * 5 / 9 : v;
      if (celsius < 35 || celsius > 39.5) return "critical";
      if (celsius < 36 || celsius > 38) return "warning";
    }
    return "normal";
  }
  if (key === "o2_sat") {
    const match = str.match(/[\d.]+/);
    if (match) {
      const v = parseFloat(match[0]);
      if (v < 90) return "critical";
      if (v < 95) return "warning";
    }
    return "normal";
  }
  return "normal";
}

function VitalCard({
  label,
  value,
  vitalKey,
}: {
  label: string;
  value: string | number | undefined;
  vitalKey: string;
}) {
  if (!value) return null;
  const status = classifyVital(vitalKey, value);
  const statusClass =
    status === "critical" ? "vital-critical" :
    status === "warning" ? "vital-warning" :
    "vital-normal";
  const dot =
    status === "critical" ? "bg-rose-500" :
    status === "warning" ? "bg-amber-400" :
    "bg-emerald-400";

  return (
    <div className={`rounded-xl px-4 py-3 ${statusClass} flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-xs font-semibold uppercase tracking-widest opacity-70">{label}</span>
      </div>
      <span className="text-base font-bold leading-none">{value}</span>
    </div>
  );
}

// ── Structured section display (History / Physical Exam) ────────────────────

function SectionsDisplay({ text }: { text: string }) {
  const sections = parseStructuredSections(text);

  if (!sections) {
    return (
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
        {text.trim().replace(/\\n/g, "\n")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sections.map((sec, i) =>
        sec.isHeader ? (
          <div key={i} className="flex items-center gap-2 mt-4 first:mt-0">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
            <p className="text-xs font-bold text-brand-600 uppercase tracking-wider">{sec.label}</p>
          </div>
        ) : (
          <div key={i} className="ml-3.5 pl-3 border-l border-slate-100">
            {sec.label && (
              <p className="text-xs font-semibold text-slate-400 mb-0.5">{sec.label}</p>
            )}
            <p className="text-sm text-slate-700 leading-relaxed">{sec.value}</p>
          </div>
        )
      )}
    </div>
  );
}

// ── Labs chip grid ───────────────────────────────────────────────────────────

function LabChip({ label, value, isAbnormal }: { label: string; value: string; isAbnormal?: boolean }) {
  return (
    <div className={`rounded-xl px-3.5 py-3 flex flex-col gap-1 ${
      isAbnormal
        ? "bg-rose-50 border border-rose-100"
        : "bg-slate-50 border border-slate-100"
    }`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 leading-none">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm font-bold leading-tight ${isAbnormal ? "text-rose-600" : "text-slate-800"}`}>
          {value}
        </span>
        {isAbnormal && (
          <span className="text-[9px] font-bold text-rose-500 bg-rose-100 rounded px-1 py-0.5 leading-none">ABN</span>
        )}
      </div>
    </div>
  );
}

function LabsDisplay({ text }: { text: string }) {
  const entries = parseLabsEntries(text);

  const sectionOrder: string[] = [];
  const sections: Record<string, typeof entries> = {};
  for (const entry of entries) {
    if (!sections[entry.section]) {
      sectionOrder.push(entry.section);
      sections[entry.section] = [];
    }
    sections[entry.section].push(entry);
  }

  if (sectionOrder.length === 0) {
    return <p className="text-sm text-slate-500 italic">No lab data available.</p>;
  }

  return (
    <div className="space-y-6">
      {sectionOrder.map((sec, si) => (
        <div key={sec}>
          {sectionOrder.length > 1 && (
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-bold text-brand-700 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-full">
                {sec}
              </span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {sections[sec].filter(r => r.label && r.value).map((row, i) => (
              <LabChip key={i} label={row.label} value={row.value} isAbnormal={row.isAbnormal} />
            ))}
            {sections[sec].filter(r => r.label && !r.value).map((row, i) => (
              <div key={`note-${i}`} className="col-span-full text-xs text-slate-400 italic">{row.label}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Imaging lightbox ────────────────────────────────────────────────────────

function ImagingViewer({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="card p-5 animate-slide-up-delay-2">
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Diagnostic Imaging</p>
          <span className="badge bg-sky-50 text-sky-600 border border-sky-100">NIH Clinical Center</span>
        </div>
        <div
          className="relative cursor-zoom-in rounded-xl overflow-hidden bg-slate-900 group"
          onClick={() => setExpanded(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Diagnostic imaging"
            className="w-full max-h-64 object-contain mx-auto transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-lg backdrop-blur-sm">
            Click to expand
          </div>
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setExpanded(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Diagnostic imaging"
            className="max-w-full max-h-full object-contain rounded-xl"
          />
          <button
            className="absolute top-5 right-5 text-white/70 hover:text-white text-2xl w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
            onClick={() => setExpanded(false)}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function CaseDisplay({ caseData }: Props) {
  return (
    <div className="space-y-4">
      {/* Patient header */}
      <div className="card p-6 border-l-4 border-l-brand-500 animate-slide-up">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-lg font-bold text-slate-900">{caseData.patient}</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              <span className="font-semibold text-slate-700">Chief Complaint: </span>
              {caseData.chief_complaint}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <span className="badge bg-brand-50 text-brand-700 border border-brand-100">{caseData.topic}</span>
            <span className="badge bg-slate-100 text-slate-600">{caseData.subtopic}</span>
          </div>
        </div>
      </div>

      {/* Vitals */}
      <div className="card p-5 animate-slide-up-delay-1">
        <p className="section-label mb-3">Vital Signs</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <VitalCard label="BP" value={caseData.vitals.bp} vitalKey="bp" />
          <VitalCard label="HR" value={caseData.vitals.hr ? `${caseData.vitals.hr} bpm` : undefined} vitalKey="hr" />
          <VitalCard label="RR" value={caseData.vitals.rr ? `${caseData.vitals.rr}/min` : undefined} vitalKey="rr" />
          <VitalCard label="Temp" value={caseData.vitals.temp} vitalKey="temp" />
          <VitalCard label="O₂ Sat" value={caseData.vitals.o2_sat} vitalKey="o2_sat" />
        </div>
      </div>

      {/* Imaging */}
      {caseData.image_url && <ImagingViewer url={caseData.image_url} />}

      {/* History & Exam */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-up-delay-2">
        <div className="card p-5 bg-gradient-to-br from-white to-sky-50/40">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-5 rounded-full bg-sky-400/60" />
            <p className="section-label">History of Present Illness</p>
          </div>
          <SectionsDisplay text={caseData.history} />
        </div>
        <div className="card p-5 bg-gradient-to-br from-white to-emerald-50/40">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-5 rounded-full bg-emerald-400/60" />
            <p className="section-label">Physical Examination</p>
          </div>
          <SectionsDisplay text={caseData.physical_exam} />
        </div>
      </div>

      {/* Labs */}
      {caseData.labs && (
        <div className="card p-5 animate-slide-up-delay-3 bg-gradient-to-br from-white to-violet-50/30">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-2 h-5 rounded-full bg-violet-400/60" />
            <p className="section-label">Labs & Diagnostics</p>
          </div>
          <LabsDisplay text={caseData.labs} />
        </div>
      )}
    </div>
  );
}
