import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

const DATA_URL =
  "https://raw.githubusercontent.com/taaruntd/gh2-data/main/projects_clean.json";

// ── BRAND ─────────────────────────────────────────────────────────────────────
const B = {
  olive: "#A6C83D",
  blue: "#3E5BA6",
  green: "#1AAE48",
  oliveL: "#f0f5d6",
  blueL: "#eef1f9",
  greenL: "#e8f8ed",
  limeL: "#fefde8",
  bg: "#f7f9f2",
  text: "#1a2310",
  muted: "#5a6b4a",
  border: "#e2ebd0",
};

const STATUS = {
  critical: {
    label: "Critical",
    bg: "#fef2f2",
    border: "#f5a5a5",
    text: "#c0392b",
    dot: "#c0392b",
  },
  warning: {
    label: "At Risk",
    bg: B.limeL,
    border: "#f5e84a",
    text: "#8a7000",
    dot: "#c8a000",
  },
  "on-track": {
    label: "On Track",
    bg: B.greenL,
    border: "#86d9a0",
    text: "#0d7a32",
    dot: B.green,
  },
  done: {
    label: "Done",
    bg: B.greenL,
    border: "#86d9a0",
    text: "#0d7a32",
    dot: B.green,
  },
};

const PEND = {
  Finance: { bg: "#fce4ec", color: "#c62828", icon: "💰" },
  Procurement: { bg: "#e3f2fd", color: "#1565c0", icon: "📦" },
  Engineering: { bg: "#f3e5f5", color: "#6a1b9a", icon: "📐" },
  Execution: { bg: "#fff3e0", color: "#e65100", icon: "🔧" },
  Client: { bg: "#e8f5e9", color: "#1b5e20", icon: "🤝" },
  "External Agency": { bg: "#ede7f6", color: "#4a148c", icon: "🏛️" },
  Multiple: { bg: "#fff9c4", color: "#f57f17", icon: "⚠️" },
  None: { bg: "#f5f5f5", color: "#757575", icon: "✓" },
};

const STAGES = [
  "Project Won",
  "Design & Engineering",
  "Procurement",
  "Execution",
  "Commissioning",
  "Handover",
];
const STAGE_COL = {
  "Project Won": "#1B5E20",
  "Design & Engineering": "#7B1FA2",
  Procurement: "#1565C0",
  Execution: "#E65100",
  Commissioning: "#1B5E20",
  Handover: "#006064",
};

// ── GM STAGE CONFIG ───────────────────────────────────────────────────────────
const GM_STAGES = [
  {
    id: "design",
    label: "Design & Engineering",
    color: "#7B1FA2",
    light: "#F3E5F5",
    groups: [
      {
        label: "Site Studies & Reports",
        tasks: [
          "Topographical Survey (Contour Layout)",
          "Geotechnical Investigation Report & ERT",
          "Pile Test Report",
          "Concrete Mix Design Report",
          "Staad Report - MMS",
          "PV Module GTP",
          "String Inverter GTP",
          "PVSyst Reports",
          "Shadow Analysis Reports",
          "Design Calculations",
        ],
      },
      {
        label: "Electrical SLDs & Layouts",
        tasks: [
          "DC & AC SLD Layout",
          "Plant Auxiliary SLD",
          "Overall Plant Layout with Equipment Arrangements",
          "DC Cable Routing Layout & String Configuration Layout",
          "AC Cable Routing Layout with Cable Trench Sectional Details",
          "IDT Yard Equipment Arrangement Drawing",
          "Equipment Layout",
        ],
      },
      {
        label: "Structural & Foundation Drawings",
        tasks: [
          "Pile Marking Layout",
          "Inverter Mounting Foundation Drawing and Calculation",
          "MMS GA, Foundations Drawings and Calculation",
          "LT Panel Foundation Drawing and Arrangement Details",
          "HT Platform Foundation Drawing and Arrangement Details",
          "Civil Foundation for Inverter Duty Transformer",
          "Civil Foundation Auxiliary Transformer",
          "Civil Foundation Street Lights",
        ],
      },
      {
        label: "Protection & Earthing",
        tasks: [
          "Lightning Protection Layout & Foundation Drawing",
          "Earthing Layout Drawing",
        ],
      },
      {
        label: "Civil & Site Infrastructure",
        tasks: [
          "MCR Arch_x002e_ Plan Layout",
          "MCR Equipment Layout",
          "Plant Main Gate Drawing",
          "Porta & Security Cabin Foundation Drawing",
          "Road Layout and Sections Details and Calculation",
          "Chain Link Fencing Drawing and Layout for IDT Yard",
          "Boundary Fencing Drawing",
          "Plant Road Layout with Sectional Details",
          "Plant Drain Layout with Sectional Details",
        ],
      },
      {
        label: "Auxiliary Systems",
        tasks: [
          "CCTV Camera Layout and General Arrangement",
          "PV Module Cleaning System Schematic and Layout & Calculation",
          "FAS Layout",
        ],
      },
      { label: "GFC Approval", tasks: ["Designing with Approval (GFC)"] },
    ],
  },
  {
    id: "procure",
    label: "Procurement (Supply)",
    color: "#1565C0",
    light: "#E3F2FD",
    groups: [
      {
        label: "Supply Items",
        tasks: [
          "Modules",
          "Inverter",
          "Module Mounting Structure (MMS) - Column and Super Structure",
          "MC4 Connectors",
          "Misc_x002e_ (Lugs, Glands, Ferrules, Ties, Safety Net)",
          "DC Cable",
          "AC Cable",
          "Communication Cable and Optical Fiber Cable",
          "Cable Tray",
          "Conduit",
          "LT Panel",
          "HT Cable",
          "HT Termination Kit",
          "Inverter Duty Transformer (IDT)",
          "Auxiliary Transformer",
          "Auxiliary LT Panel",
          "HT Switchgear Panel (ICOG Panel)",
          "Earthing Material",
          "Lightning Protection System",
          "WMS (Pyranometer, Sensors etc_x002e_)",
          "Data Logger",
          "Module Cleaning System",
          "CCTV Camera",
          "Street Lights",
          "UPS and Battery",
        ],
      },
    ],
  },
  {
    id: "build",
    label: "Construction",
    color: "#E65100",
    light: "#FFF3E0",
    groups: [
      {
        label: "Preliminary",
        tasks: [
          "All GFC Drawings",
          "Mobilization of I&C Contractor",
          "Safety Induction",
        ],
      },
      {
        label: "I&C Works",
        tasks: [
          "Land Levelling",
          "Boundary Wall",
          "MMS Marking",
          "MMS Piling and Casting",
          "MMS Capping",
          "MMS Installation",
          "Module Installation",
          "Inverter Installation",
          "DC Cable Laying",
          "AC Cable Laying",
          "HT Cable Laying",
          "Communication Cable Laying",
          "LT Panel Foundation",
          "HT Panel Foundation",
          "IDT Foundation",
          "IDT Installation",
          "LT Panel Installation",
          "HT Panel Installation",
          "LA Installation",
          "Earthing Work",
          "Cable Termination",
          "Testing",
          "UPS and Battery Installation",
        ],
      },
      {
        label: "Post Commissioning",
        tasks: [
          "Module Cleaning Arrangement (Water Piping)",
          "Weather Station & Data Logger Installation",
          "Street Light Installation",
          "CCTV Camera Installation",
          "SCADA Configuration",
        ],
      },
    ],
  },
  {
    id: "trans",
    label: "Transmission Line",
    color: "#4A148C",
    light: "#EDE7F6",
    groups: [
      {
        label: "Transmission Works",
        tasks: [
          "33KV Terminal Bay Construction at KPTCL MUSS Khanapur Sub Station",
          "33KV Single Circuit Overhead Line - 2_x002e_0 KM (DOG AL 59 Conductor)",
          "Liaisoning Work - 10 MW Solar Power Plant",
        ],
      },
    ],
  },
  {
    id: "comm",
    label: "Commissioning",
    color: "#1B5E20",
    light: "#E8F5E9",
    groups: [
      {
        label: "Commissioning Tasks",
        tasks: [
          "Commissioning (Inverter Charging)",
          "MCS",
          "CEIG / Statutory Approvals",
          "Net Metering",
          "SCADA Integration",
        ],
      },
    ],
  },
  {
    id: "hand",
    label: "Handover",
    color: "#006064",
    light: "#E0F7FA",
    groups: [
      {
        label: "Handover Tasks",
        tasks: ["O&M Handover", "Documentation & Reports", "Final Signoff"],
      },
    ],
  },
];

const RT_STAGES = [
  {
    id: "design",
    label: "Design & Engineering",
    color: "#7B1FA2",
    light: "#F3E5F5",
    groups: [
      {
        label: "Engineering Basics",
        tasks: [
          "Array Layout",
          "Single Line Diagram",
          "Shadow Layout",
          "Module Datasheet",
          "Inverter Datasheet",
          "Walkway Drawing",
          "Lifeline Layout",
          "Module Mounting Structure Drawing",
          "ACCB - GTP",
          "Cable Routing Layout",
          "DC Cable Sizing Calculation",
          "AC Cable Sizing Calculation",
          "LA Layout",
          "Earthing Layout",
          "Module Cleaning Arrangement",
          "RMS (Remote Monitoring System)",
          "Inverter Mounting Frame Drawing",
        ],
      },
      { label: "GFC Approval", tasks: ["Designing with Approval (GFC)"] },
    ],
  },
  {
    id: "procure",
    label: "Procurement (Supply)",
    color: "#1565C0",
    light: "#E3F2FD",
    groups: [
      {
        label: "Supply Items",
        tasks: [
          "Modules",
          "Inverter",
          "Module Mounting Structure (MMS)",
          "Lifeline",
          "Walkway",
          "Inverter Frame / LT Panel Canopy",
          "MC4 Connectors",
          "Misc_x002e_ (Lugs, Glands, Ferrules, Ties, Safety Net)",
          "Solar Cable",
          "LT Cable",
          "Cable Tray",
          "Conduit",
          "ACDB / LT Panel",
          "Earthing Material",
          "Lightning Protection System",
          "Data Logger",
          "Safety Material",
          "Module Cleaning System",
        ],
      },
    ],
  },
  {
    id: "build",
    label: "Construction",
    color: "#E65100",
    light: "#FFF3E0",
    groups: [
      {
        label: "Preliminary",
        tasks: [
          "All GFC Drawings",
          "Handover of Obstacle-free Roof by Client to GH2",
          "Mobilization of I&C Contractor",
          "Safety Induction",
        ],
      },
      {
        label: "I&C Works",
        tasks: [
          "Lifeline Installation",
          "Walkway Installation",
          "Marking for MMS",
          "Structure Assembly",
          "Cable Tray Fixing",
          "Module Installation",
          "DC Cable Laying",
          "AC Cable Laying",
          "LT Panel Installation",
          "Inverter Installation",
          "LA Installation",
          "Earthing Work",
          "Cable Termination",
          "Testing",
        ],
      },
      {
        label: "Post Commissioning",
        tasks: [
          "Module Cleaning Arrangement (Water Piping)",
          "Communication Cable Laying",
          "Weather Station & SCADA Installation",
          "Net Metering + CEIG",
          "SCADA Configuration",
        ],
      },
    ],
  },
  {
    id: "comm",
    label: "Commissioning",
    color: "#1B5E20",
    light: "#E8F5E9",
    groups: [
      {
        label: "Commissioning Tasks",
        tasks: [
          "Commissioning (Inverter Charging)",
          "MCS",
          "CEIG",
          "Net Metering",
        ],
      },
    ],
  },
  {
    id: "hand",
    label: "Handover",
    color: "#006064",
    light: "#E0F7FA",
    groups: [
      {
        label: "Handover Tasks",
        tasks: ["O&M Handover", "Documentation & Reports", "Final Signoff"],
      },
    ],
  },
];

const H2_STAGES = [
  {
    id: "design",
    label: "Design & Engineering",
    color: "#7B1FA2",
    light: "#F3E5F5",
    groups: [
      {
        label: "H2 Engineering",
        tasks: [
          "Electrolyzer Selection & Sizing",
          "Site Survey & Civil Layout",
          "SLD - DC / AC",
          "P&ID Diagram",
          "H2 Pipeline Design",
          "Compression & Storage Design",
          "Safety & Hazop Study",
          "GFC Drawings",
        ],
      },
    ],
  },
  {
    id: "procure",
    label: "Procurement",
    color: "#1565C0",
    light: "#E3F2FD",
    groups: [
      {
        label: "Supply Items",
        tasks: [
          "Electrolyzer Stack",
          "Rectifier / Power Supply",
          "Compressor",
          "Storage Tanks",
          "H2 Piping & Fittings",
          "Safety Systems (PRV, Detectors)",
          "Control & SCADA System",
          "Water Treatment System",
        ],
      },
    ],
  },
  {
    id: "build",
    label: "Construction & Installation",
    color: "#E65100",
    light: "#FFF3E0",
    groups: [
      {
        label: "Civil Works",
        tasks: [
          "Civil Foundation - Electrolyzer",
          "Civil Foundation - Compressor & Storage",
          "Dyke Wall & Safety Enclosure",
        ],
      },
      {
        label: "Mechanical & Electrical",
        tasks: [
          "Electrolyzer Installation",
          "Rectifier Installation",
          "Compressor Installation",
          "Storage Tank Installation",
          "H2 Pipeline & Piping",
          "Electrical Cable Laying",
          "Control & SCADA Wiring",
          "Water Treatment Installation",
        ],
      },
    ],
  },
  {
    id: "comm",
    label: "Commissioning",
    color: "#1B5E20",
    light: "#E8F5E9",
    groups: [
      {
        label: "Commissioning Tasks",
        tasks: [
          "Water Quality Testing",
          "Electrolyzer Dry Run",
          "H2 Production Trial",
          "GHCI Certification",
          "Safety Audit & Clearance",
          "Performance Testing & PR Ratio",
        ],
      },
    ],
  },
  {
    id: "hand",
    label: "Handover",
    color: "#006064",
    light: "#E0F7FA",
    groups: [
      {
        label: "Handover Tasks",
        tasks: [
          "O&M Handover & Training",
          "Documentation & Reports",
          "Final Signoff",
        ],
      },
    ],
  },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmtMW = (kw, unit) => {
  if (!kw) return "TBD";
  const n = Number(kw);
  return unit === "MW"
    ? `${(n / 1000).toFixed(n < 1000 ? 2 : 1)} MW`
    : `${n.toLocaleString()} KW`;
};
const pctCol = (p) => (p >= 90 ? B.green : p >= 40 ? "#e07b20" : "#c0392b");

// ── TASK EXTRACTOR ────────────────────────────────────────────────────────────
const META = new Set([
  "@odata.etag",
  "ItemInternalId",
  "PROJECT ID",
  "PROJECT NAME",
  "CAPACITY KWP",
  "PROJECT TYPE",
  "CATEGORY",
  "STAGE",
  "STATUS",
  "SITE ENGINEER NAME",
  "SITE ENGINEER PHONE",
  "PROJECT MANAGER",
  "MODE",
  "IC PARTNER",
  "PPA DATE",
  "LAST DATE AS PER CONTRACT",
  "EXPECTED COMMISSIONING",
  "PENDENCY ON",
  "REMARKS",
  "ONGOING STATUS",
  "BILLING STATUS",
  "REVENUE CR",
  "EXECUTION PCT",
]);

function extractTasks(row) {
  const keys = Object.keys(row);
  const tasks = {};
  let i = 0;
  while (i < keys.length) {
    const k = keys[i];
    if (
      META.has(k) ||
      k.startsWith("START\n") ||
      k.startsWith("END\n") ||
      k.startsWith("BOQ\n") ||
      k.startsWith("PO\n") ||
      k.startsWith("MATERIAL\n")
    ) {
      i++;
      continue;
    }
    const next = keys[i + 1] || "";
    if (next.startsWith("BOQ\n")) {
      tasks[k] = {
        type: "proc",
        pct: parseFloat(row[k]) || 0,
        boq: row[keys[i + 1]] || "",
        po: row[keys[i + 2]] || "",
        mat: row[keys[i + 3]] || "",
      };
      i += 4;
    } else if (next.startsWith("START\n")) {
      tasks[k] = {
        type: "std",
        pct: parseFloat(row[k]) || 0,
        start: row[keys[i + 1]] || "",
        end: row[keys[i + 2]] || "",
      };
      i += 3;
    } else {
      i++;
    }
  }
  return tasks;
}

function mapRow(row) {
  return {
    id: row["PROJECT ID"] || "",
    name: row["PROJECT NAME"] || "",
    capacityKwp: Number(row["CAPACITY KWP"]) || 0,
    type: row["PROJECT TYPE"] || "",
    category: row["CATEGORY"] || "Solar",
    stage: row["STAGE"] || "Project Won",
    status: row["STATUS"] || "on-track",
    siteEngineer: row["SITE ENGINEER NAME"] || "",
    sitePhone: row["SITE ENGINEER PHONE"] || "",
    pm: row["PROJECT MANAGER"] || "",
    mode: row["MODE"] || "",
    icPartner: row["IC PARTNER"] || "",
    ppaDate: row["PPA DATE"] || "",
    contractEnd: row["LAST DATE AS PER CONTRACT"] || "",
    expComm: row["EXPECTED COMMISSIONING"] || "",
    pendency: row["PENDENCY ON"] || "None",
    remarks: row["REMARKS"] || "",
    ongoingStatus: row["ONGOING STATUS"] || "",
    billing: row["BILLING STATUS"] || "",
    revenue: Number(row["REVENUE CR"]) || 0,
    execPct: Number(row["EXECUTION PCT"]) || 0,
    tasks: extractTasks(row),
  };
}

// ── EPC-STYLE PRIMITIVES (shared look for the project page) ───────────────────
const Badge = ({ text, bg, border, color }) => {
  if (!text) return <span style={{ color: B.muted, fontSize: 10 }}>—</span>;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 20,
        fontSize: 9,
        fontWeight: 600,
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
};

const SecLabel = ({ text }) => (
  <div
    style={{
      fontSize: 9,
      fontWeight: 700,
      color: B.muted,
      textTransform: "uppercase",
      letterSpacing: ".08em",
      marginBottom: 8,
    }}
  >
    {text}
  </div>
);

const SmallCard = ({ label, value, sub, accent, italic }) => (
  <div
    style={{
      background: B.bg,
      borderRadius: 10,
      border: `1px solid ${accent}22`,
      borderLeft: `3px solid ${accent}`,
      padding: "11px 14px",
    }}
  >
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: B.muted,
        textTransform: "uppercase",
        letterSpacing: ".06em",
        marginBottom: 5,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 18,
        fontWeight: 700,
        color: B.text,
        lineHeight: 1,
        fontFamily: "monospace",
        fontStyle: italic ? "italic" : "normal",
      }}
    >
      {value}
    </div>
    {sub && <div style={{ fontSize: 10, color: B.muted, marginTop: 4 }}>{sub}</div>}
  </div>
);

// ── STAGE RAIL (milestone-rail-style stage breakdown) ──────────────────────────
function StageBreakdown({ project, stageConfig }) {
  const [selectedStage, setSelectedStage] = useState(null);
  const [openGroups, setOpenGroups] = useState({});
  const td = project.tasks || {};

  const groupPct = (tasks) => {
    const valid = tasks.filter((t) => td[t] !== undefined);
    if (!valid.length) return 0;
    return Math.round(
      valid.reduce((s, t) => s + (td[t]?.pct || 0), 0) / valid.length
    );
  };
  const stagePct = (stage) => {
    const all = stage.groups.flatMap((g) => g.tasks);
    return groupPct(all);
  };

  const MiniBar = ({ pct, color, h = 5 }) => (
    <div style={{ flex: 1, height: h, background: "#e0e0e0", borderRadius: h }}>
      <div
        style={{
          width: `${Math.min(100, pct)}%`,
          height: h,
          borderRadius: h,
          background: pct >= 100 ? B.green : pct > 0 ? color : "#e0e0e0",
          transition: "width 0.3s",
        }}
      />
    </div>
  );

  return (
    <div style={{ padding: "0 20px 20px" }}>
      <SecLabel text="Stage Breakdown" />

      {/* Horizontal stage rail */}
      <div style={{ overflowX: "auto", paddingBottom: 6, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, minWidth: "max-content", padding: "3px 1px 6px" }}>
          {stageConfig.map((stage) => {
            const sp = stagePct(stage);
            const isSel = selectedStage === stage.id;
            const isDone = sp >= 100;
            return (
              <div
                key={stage.id}
                onClick={() => setSelectedStage(isSel ? null : stage.id)}
                role="button"
                tabIndex={0}
                style={{
                  width: 150,
                  flexShrink: 0,
                  background: isSel ? stage.light : "#fff",
                  border: `1px solid ${isSel ? stage.color : B.border}`,
                  borderLeft: `3px solid ${isDone ? B.green : stage.color}`,
                  borderRadius: 8,
                  padding: "9px 10px 8px",
                  cursor: "pointer",
                  transition: "all .12s",
                }}
              >
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 8,
                    color: B.muted,
                    marginBottom: 2,
                    fontWeight: 700,
                    letterSpacing: ".04em",
                  }}
                >
                  {stage.label.toUpperCase()}
                </div>
                <div style={{ marginTop: 6, marginBottom: 6 }}>
                  <MiniBar pct={sp} color={stage.color} h={6} />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      color: isDone ? B.green : stage.color,
                    }}
                  >
                    {sp}%
                  </span>
                  {isDone && <Badge text="Done" bg="#e8f8ed" border="#86d9a0" color="#0d7a32" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded stage drawer */}
      {selectedStage &&
        (() => {
          const stage = stageConfig.find((s) => s.id === selectedStage);
          if (!stage) return null;
          return (
            <div
              style={{
                background: "#fff",
                border: `1px solid ${stage.color}33`,
                borderLeft: `3px solid ${stage.color}`,
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  padding: "10px 16px",
                  borderBottom: `1px solid ${B.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: B.text }}>
                  {stage.label} — {stagePct(stage)}% complete
                </div>
                <span style={{ fontSize: 9, color: B.muted, fontStyle: "italic" }}>
                  Click the stage card again to close
                </span>
              </div>

              <div style={{ padding: "12px 16px" }}>
                {stage.groups.map((grp) => {
                  const gk = `${stage.id}-${grp.label}`;
                  const gp = groupPct(grp.tasks);
                  const gOpen = openGroups[gk];
                  return (
                    <div key={gk} style={{ marginBottom: 6 }}>
                      <div
                        onClick={() => setOpenGroups((p) => ({ ...p, [gk]: !p[gk] }))}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "7px 10px",
                          background: gOpen ? stage.light : B.bg,
                          borderRadius: 6,
                          cursor: "pointer",
                          border: `1px solid ${B.border}`,
                        }}
                      >
                        <span style={{ fontSize: 9, color: stage.color, minWidth: 10 }}>
                          {gOpen ? "▼" : "▶"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: B.text, flex: 1 }}>
                          {grp.label}
                        </span>
                        <div style={{ width: 80 }}>
                          <MiniBar pct={gp} color={stage.color} h={4} />
                        </div>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            fontWeight: 700,
                            color: stage.color,
                            minWidth: 34,
                            textAlign: "right",
                          }}
                        >
                          {gp}%
                        </span>
                      </div>

                      {gOpen && (
                        <div style={{ overflowX: "auto", marginTop: 4 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead>
                              <tr>
                                <th
                                  style={{
                                    padding: "5px 9px",
                                    textAlign: "left",
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: B.muted,
                                    borderBottom: `2px solid ${B.border}`,
                                    textTransform: "uppercase",
                                    letterSpacing: ".05em",
                                    background: B.bg,
                                  }}
                                >
                                  Task
                                </th>
                                <th
                                  style={{
                                    padding: "5px 9px",
                                    textAlign: "left",
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: B.muted,
                                    borderBottom: `2px solid ${B.border}`,
                                    textTransform: "uppercase",
                                    background: B.bg,
                                  }}
                                >
                                  Detail
                                </th>
                                <th
                                  style={{
                                    padding: "5px 9px",
                                    textAlign: "right",
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: B.muted,
                                    borderBottom: `2px solid ${B.border}`,
                                    textTransform: "uppercase",
                                    background: B.bg,
                                  }}
                                >
                                  %
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {grp.tasks.map((taskName, i) => {
                                const t = td[taskName] || {};
                                const pct = t.pct || 0;
                                const isProc = t.type === "proc";
                                const done = pct >= 100;
                                return (
                                  <tr key={taskName} style={{ background: i % 2 === 0 ? B.bg : "#fff" }}>
                                    <td
                                      style={{
                                        padding: "7px 9px",
                                        borderBottom: `1px solid ${B.border}`,
                                        color: B.text,
                                        maxWidth: 260,
                                      }}
                                    >
                                      {taskName}
                                    </td>
                                    <td
                                      style={{
                                        padding: "7px 9px",
                                        borderBottom: `1px solid ${B.border}`,
                                        fontSize: 10,
                                        color: B.muted,
                                      }}
                                    >
                                      {isProc ? (
                                        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                          {t.boq && <span>BOQ: <b>{t.boq}</b></span>}
                                          {t.po && <span>PO: <b style={{ color: t.po === "Done" ? B.green : "inherit" }}>{t.po}</b></span>}
                                          {t.mat && <span>Mat: <b style={{ color: "#c62828" }}>{t.mat}</b></span>}
                                        </span>
                                      ) : (
                                        (t.start || t.end) && (
                                          <span>
                                            {t.start && `Start ${t.start}`}
                                            {t.start && t.end && " → "}
                                            {t.end && `End ${t.end}`}
                                          </span>
                                        )
                                      )}
                                    </td>
                                    <td
                                      style={{
                                        padding: "7px 9px",
                                        borderBottom: `1px solid ${B.border}`,
                                        textAlign: "right",
                                      }}
                                    >
                                      <Badge
                                        text={`${pct}%`}
                                        bg={done ? "#e8f8ed" : pct > 0 ? "#fff9c4" : "#f5f5f5"}
                                        border={done ? "#86d9a0" : pct > 0 ? "#f5e84a" : "#d0d0d0"}
                                        color={done ? "#0d7a32" : pct > 0 ? "#8a7000" : "#666"}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
    </div>
  );
}


// ── PROJECT FULL PAGE ─────────────────────────────────────────────────────────
function ProjectPage({ project, onBack, sizeUnit, stageConfig }) {
  const cfg = STATUS[project.status] || STATUS["on-track"];
  const pendCfg = PEND[project.pendency || "None"] || PEND["None"];
  const stageIdx = STAGES.indexOf(project.stage);

  return (
    <div style={{ background: B.bg, minHeight: "100vh" }}>
      <div
        style={{
          background: "#fff",
          borderBottom: `1px solid ${B.border}`,
          padding: "14px 24px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: `1px solid ${B.border}`,
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            color: B.blue,
            cursor: "pointer",
            marginBottom: 10,
            fontFamily: "inherit",
          }}
        >
          ← Back to Projects
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: project.category === "GH2" ? B.blue : B.olive,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                marginBottom: 2,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 10, color: B.muted }}>{project.id}</span>
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 8px",
                  borderRadius: 10,
                  background:
                    (project.category === "GH2" ? B.blue : B.olive) + "25",
                  color: project.category === "GH2" ? B.blue : B.olive,
                  fontWeight: 700,
                }}
              >
                {project.category === "GH2" ? "Green H₂" : "Solar EPC"}
              </span>
              {project.pendency && project.pendency !== "None" && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 8px",
                    borderRadius: 10,
                    background: pendCfg.bg,
                    color: pendCfg.color,
                    fontWeight: 700,
                  }}
                >
                  {pendCfg.icon} Pending: {project.pendency}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: B.text,
              }}
            >
              {project.name}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              background: cfg.bg,
              color: cfg.text,
              border: `1px solid ${cfg.border}`,
              padding: "4px 12px",
              borderRadius: 20,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {cfg.label}
          </span>
        </div>
      </div>

      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "20px 24px 60px",
        }}
      >
        {/* Journey bar */}
        <div
          style={{
            padding: "14px 20px",
            background: "#fff",
            border: `1px solid ${B.border}`,
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: B.muted,
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            PROJECT JOURNEY
          </div>
          <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
            {STAGES.map((lane, i) => {
              const isPast = i < stageIdx,
                isCur = i === stageIdx;
              const col = STAGE_COL[lane];
              return (
                <div key={lane} style={{ flex: 1 }}>
                  <div
                    style={{
                      height: 7,
                      borderRadius: 4,
                      background: isCur ? col : isPast ? col + "99" : "#e0e0e0",
                      marginBottom: 3,
                    }}
                  />
                  {isCur && (
                    <div
                      style={{
                        fontSize: 8,
                        color: col,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      ▼
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: B.muted }}>Project Won</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: STAGE_COL[project.stage] || "#333",
              }}
            >
              {project.stage}
            </span>
            <span style={{ fontSize: 9, color: B.muted }}>Handover</span>
          </div>
        </div>

        {/* Row 0 — Key stats */}
        <SecLabel text="Overview" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <SmallCard label="Size" value={fmtMW(project.capacityKwp, sizeUnit)} accent={B.olive} />
          <SmallCard label="Stage" value={project.stage} sub={cfg.label} accent={STAGE_COL[project.stage] || B.blue} />
          <SmallCard label="PM" value={project.pm || "—"} accent={B.blue} italic={!project.pm} />
          <SmallCard
            label="Revenue"
            value={project.revenue ? `₹${project.revenue} Cr` : "—"}
            accent={B.green}
          />
        </div>

        {/* Row 1 — Details */}
        <SecLabel text="Project Details" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {[
            {
              l: "Site Engineer",
              v: `${project.siteEngineer || "—"}${
                project.sitePhone ? " · " + project.sitePhone : ""
              }`,
            },
            { l: "Mode", v: project.mode || "—" },
            { l: "I&C Partner", v: project.icPartner || "—" },
            { l: "Contract End", v: project.contractEnd || "—" },
            { l: "Exp. Commissioning", v: project.expComm || "—" },
            { l: "PPA Date", v: project.ppaDate || "—" },
          ].map((f, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                borderRadius: 8,
                padding: "9px 12px",
                border: `1px solid ${B.border}`,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: B.muted,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                {f.l}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: B.text,
                  marginTop: 3,
                }}
              >
                {f.v}
              </div>
            </div>
          ))}
        </div>

        {/* Row 2 — Execution progress */}
        <SecLabel text="Execution Progress" />
        <div
          style={{
            padding: "16px 20px",
            background: "#fff",
            border: `1px solid ${B.border}`,
            borderLeft: `3px solid ${pctCol(project.execPct)}`,
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: B.muted,
                textTransform: "uppercase",
                letterSpacing: ".08em",
              }}
            >
              Overall completion
            </span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "monospace",
                color: pctCol(project.execPct),
              }}
            >
              {project.execPct}%
            </span>
          </div>
          <div
            style={{
              height: 10,
              background: "#e0e0e0",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: 10,
                borderRadius: 6,
                width: `${project.execPct}%`,
                background: pctCol(project.execPct),
                transition: "width 0.5s",
              }}
            />
          </div>
        </div>

        {/* Remarks + status */}
        {(project.remarks || project.ongoingStatus) && (
          <div style={{ marginBottom: 16 }}>
            {project.remarks && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#fef2f2",
                  border: "1px solid #f5a5a5",
                  borderRadius: 10,
                  display: "flex",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <span style={{ color: "#c0392b", fontSize: 14, flexShrink: 0 }}>
                  ⚠
                </span>
                <div>
                  <div
                    style={{ fontSize: 11, fontWeight: 700, color: "#c0392b" }}
                  >
                    REMARKS
                    {project.pendency && project.pendency !== "None"
                      ? ` · Pending: ${project.pendency}`
                      : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#922b21", marginTop: 2 }}>
                    {project.remarks}
                  </div>
                </div>
              </div>
            )}
            {project.ongoingStatus && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#e8f5e9",
                  border: "1px solid #86d9a0",
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#1b5e20",
                    marginBottom: 2,
                  }}
                >
                  ONGOING STATUS
                </div>
                <div style={{ fontSize: 12, color: B.text }}>
                  {project.ongoingStatus}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stage breakdown */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${B.border}`,
            borderRadius: 12,
          }}
        >
          <StageBreakdown project={project} stageConfig={stageConfig} />
        </div>
      </div>
    </div>
  );
}

// ── PROJECT SCREEN ────────────────────────────────────────────────────────────
function ProjectScreen({ projects, tabColor, emptyLabel, stageConfig }) {
  const [view, setView] = useState("kanban");
  const [stageF, setStageF] = useState("All");
  const [statusF, setStatusF] = useState("All");
  const [pmF, setPmF] = useState("All");
  const [pendF, setPendF] = useState("All");
  const [unit, setUnit] = useState("MW");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const allPMs = ["All", ...new Set(projects.map((p) => p.pm).filter(Boolean))];
  const allPends = [
    "All",
    ...new Set(
      projects.map((p) => p.pendency).filter((p) => p && p !== "None")
    ),
  ];

  const filtered = projects
    .filter(
      (p) =>
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase())
    )
    .filter((p) => stageF === "All" || p.stage === stageF)
    .filter((p) => statusF === "All" || p.status === statusF)
    .filter((p) => pmF === "All" || p.pm === pmF)
    .filter((p) => pendF === "All" || p.pendency === pendF)
    .sort(
      (a, b) =>
        (({ critical: 0, warning: 1, "on-track": 2, done: 3 }[a.status] || 2) -
        ({ critical: 0, warning: 1, "on-track": 2, done: 3 }[b.status] || 2))
    );

  const totalMW = projects.reduce((s, p) => s + (p.capacityKwp || 0), 0);
  const totalRev = projects.reduce((s, p) => s + (p.revenue || 0), 0);

  const groups = STAGES.map((stage) => ({
    stage,
    color: STAGE_COL[stage],
    items: filtered.filter((p) => p.stage === stage),
  })).filter((g) => g.items.length > 0);

  // If a project is selected, render the full-page project view instead of the list
  if (selected) {
    return (
      <ProjectPage
        project={selected}
        onBack={() => setSelected(null)}
        sizeUnit={unit}
        stageConfig={stageConfig}
      />
    );
  }

  if (!projects.length)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 400,
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 48 }}>📋</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: B.text }}>
          {emptyLabel}
        </div>
        <div style={{ fontSize: 13, color: B.muted }}>
          Projects will appear once added to Excel
        </div>
      </div>
    );

  return (
    <div style={{ padding: 20 }}>
      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          {
            val: projects.length,
            lbl: "Total Projects",
            sub: fmtMW(totalMW, "MW"),
            col: tabColor,
            bg: tabColor + "18",
          },
          {
            val: projects.filter((p) => p.stage === "Execution").length,
            lbl: "In Execution",
            sub: "Active sites",
            col: "#E65100",
            bg: "#FFF3E0",
          },
          {
            val: `₹${totalRev.toFixed(1)} Cr`,
            lbl: "Est. Revenue",
            sub: "Portfolio value",
            col: B.green,
            bg: B.greenL,
          },
          {
            val: projects.filter((p) => p.status === "critical").length,
            lbl: "Critical",
            sub: "Needs action",
            col: "#c0392b",
            bg: "#fef2f2",
          },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              background: m.bg,
              border: `1px solid ${m.col}33`,
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: m.col }}>
              {m.val}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: m.col,
                marginTop: 2,
              }}
            >
              {m.lbl}
            </div>
            <div
              style={{ fontSize: 11, color: m.col, opacity: 0.6, marginTop: 1 }}
            >
              {m.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${B.border}`,
            fontSize: 12,
            fontFamily: "inherit",
            outline: "none",
            width: 140,
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 2,
            background: B.oliveL,
            borderRadius: 8,
            padding: 3,
            flexWrap: "wrap",
          }}
        >
          {["All", ...STAGES].map((s) => (
            <button
              key={s}
              onClick={() => setStageF(s)}
              style={{
                padding: "4px 9px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background:
                  stageF === s ? STAGE_COL[s] || "#fff" : "transparent",
                color: stageF === s ? (s === "All" ? B.text : "#fff") : B.muted,
                fontSize: 10,
                fontWeight: stageF === s ? 700 : 400,
                fontFamily: "inherit",
              }}
            >
              {s === "All" ? "All" : s.split(" ")[0]}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 3 }}>
          {[
            ["All", "All"],
            ["critical", "Critical"],
            ["warning", "At Risk"],
            ["on-track", "On Track"],
            ["done", "Done"],
          ].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setStatusF(val)}
              style={{
                padding: "5px 10px",
                borderRadius: 20,
                cursor: "pointer",
                fontSize: 11,
                border: `1px solid ${statusF === val ? B.blue : B.border}`,
                background: statusF === val ? B.blue : "#fff",
                color: statusF === val ? "#fff" : B.muted,
                fontFamily: "inherit",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        <select
          value={pmF}
          onChange={(e) => setPmF(e.target.value)}
          style={{
            padding: "5px 10px",
            borderRadius: 8,
            border: `1px solid ${B.border}`,
            background: "#fff",
            fontSize: 11,
            fontFamily: "inherit",
          }}
        >
          {allPMs.map((p) => (
            <option key={p} value={p}>
              {p === "All" ? "All PMs" : p}
            </option>
          ))}
        </select>

        {allPends.length > 1 && (
          <select
            value={pendF}
            onChange={(e) => setPendF(e.target.value)}
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              border: `1px solid ${B.border}`,
              background: "#fff",
              fontSize: 11,
              fontFamily: "inherit",
            }}
          >
            <option value="All">All Pendencies</option>
            {allPends
              .filter((p) => p !== "All")
              .map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
          </select>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <div
            style={{
              display: "flex",
              gap: 2,
              background: B.oliveL,
              borderRadius: 8,
              padding: 3,
            }}
          >
            {["KW", "MW"].map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: unit === u ? "#fff" : "transparent",
                  color: unit === u ? B.text : B.muted,
                  fontSize: 11,
                  fontWeight: unit === u ? 700 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {u}
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: 2,
              background: B.oliveL,
              borderRadius: 8,
              padding: 3,
            }}
          >
            {[
              ["kanban", "⊞"],
              ["list", "☰"],
            ].map(([v, ic]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: view === v ? "#fff" : "transparent",
                  color: view === v ? B.text : B.muted,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: B.muted, marginBottom: 12 }}>
        Showing <strong style={{ color: B.text }}>{filtered.length}</strong> of{" "}
        {projects.length} projects
      </div>

      {/* KANBAN */}
      {view === "kanban" && (
        <div style={{ overflowX: "auto" }}>
          <div
            style={{ display: "flex", gap: 12, minWidth: groups.length * 220 }}
          >
            {groups.map(({ stage, color, items }) => (
              <div key={stage} style={{ flex: "0 0 210px" }}>
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color,
                      letterSpacing: 1,
                      marginBottom: 4,
                    }}
                  >
                    {stage.toUpperCase()}
                  </div>
                  <div
                    style={{ display: "flex", gap: 6, alignItems: "center" }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        background: color + "20",
                        color,
                        padding: "1px 7px",
                        borderRadius: 10,
                        fontWeight: 700,
                      }}
                    >
                      {fmtMW(
                        items.reduce((s, p) => s + (p.capacityKwp || 0), 0),
                        unit
                      )}
                    </span>
                    <span style={{ fontSize: 9, color: B.muted }}>
                      {items.length} projects
                    </span>
                  </div>
                </div>
                {items.map((p) => {
                  const cfg = STATUS[p.status] || STATUS["on-track"];
                  const pc = PEND[p.pendency || "None"] || PEND["None"];
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelected(p)}
                      style={{
                        background: "#fff",
                        border: `1px solid ${cfg.border}`,
                        borderLeft: `4px solid ${cfg.dot}`,
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 8,
                        cursor: "pointer",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        transition: "box-shadow 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.boxShadow =
                          "0 4px 14px rgba(62,91,166,0.12)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.boxShadow =
                          "0 1px 3px rgba(0,0,0,0.04)")
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontSize: 9, color: B.muted }}>
                          {p.id}
                        </span>
                        {p.pendency && p.pendency !== "None" && (
                          <span
                            style={{
                              fontSize: 9,
                              padding: "1px 6px",
                              borderRadius: 8,
                              background: pc.bg,
                              color: pc.color,
                              fontWeight: 700,
                            }}
                          >
                            {pc.icon}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: B.text,
                          marginBottom: 3,
                          lineHeight: 1.3,
                        }}
                      >
                        {p.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: B.muted,
                          marginBottom: 6,
                        }}
                      >
                        {fmtMW(p.capacityKwp, unit)} · {p.pm || "—"}
                      </div>
                      <div
                        style={{
                          height: 5,
                          background: B.oliveL,
                          borderRadius: 3,
                          marginBottom: 4,
                        }}
                      >
                        <div
                          style={{
                            height: 5,
                            borderRadius: 3,
                            width: `${p.execPct || 0}%`,
                            background: pctCol(p.execPct || 0),
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: pctCol(p.execPct || 0),
                          }}
                        >
                          {p.execPct || 0}%
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            background: cfg.bg,
                            color: cfg.text,
                            border: `1px solid ${cfg.border}`,
                            padding: "2px 8px",
                            borderRadius: 10,
                            fontWeight: 600,
                          }}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      {p.contractEnd && (
                        <div
                          style={{ marginTop: 4, fontSize: 10, color: B.muted }}
                        >
                          Due: {p.contractEnd}
                        </div>
                      )}
                      {p.pendency && p.pendency !== "None" && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            padding: "2px 8px",
                            borderRadius: 8,
                            background: pc.bg,
                            color: pc.color,
                            fontWeight: 600,
                            display: "inline-block",
                          }}
                        >
                          {pc.icon} {p.pendency}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LIST */}
      {view === "list" && (
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${B.border}`,
            overflow: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: B.oliveL }}>
                {[
                  "Project",
                  "ID",
                  "Stage",
                  "Status",
                  "Pendency",
                  "Size",
                  "% Done",
                  "PM",
                  "Contract End",
                  "Revenue",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: B.muted,
                      textAlign: "left",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const cfg = STATUS[p.status] || STATUS["on-track"];
                const pc = PEND[p.pendency || "None"] || PEND["None"];
                const sc = STAGE_COL[p.stage] || "#64748b";
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    style={{
                      borderBottom: `1px solid ${B.border}`,
                      cursor: "pointer",
                      background: i % 2 === 0 ? "#fff" : B.bg,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = B.blueL)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        i % 2 === 0 ? "#fff" : B.bg)
                    }
                  >
                    <td
                      style={{
                        padding: "10px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: B.blue,
                      }}
                    >
                      {p.name}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontSize: 11,
                        color: B.muted,
                      }}
                    >
                      {p.id}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: sc + "18",
                          color: sc,
                          fontWeight: 600,
                        }}
                      >
                        {p.stage}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 20,
                          background: cfg.bg,
                          color: cfg.text,
                          border: `1px solid ${cfg.border}`,
                          fontWeight: 600,
                        }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {p.pendency && p.pendency !== "None" ? (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: pc.bg,
                            color: pc.color,
                            fontWeight: 600,
                          }}
                        >
                          {pc.icon} {p.pendency}
                        </span>
                      ) : (
                        <span style={{ color: B.muted }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontSize: 12,
                        fontWeight: 700,
                        color: B.text,
                      }}
                    >
                      {fmtMW(p.capacityKwp, unit)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 50,
                            height: 5,
                            background: B.oliveL,
                            borderRadius: 3,
                          }}
                        >
                          <div
                            style={{
                              height: 5,
                              borderRadius: 3,
                              width: `${p.execPct || 0}%`,
                              background: pctCol(p.execPct || 0),
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: pctCol(p.execPct || 0),
                          }}
                        >
                          {p.execPct || 0}%
                        </span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontSize: 12,
                        color: B.text,
                      }}
                    >
                      {p.pm || "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontSize: 12,
                        color: B.muted,
                      }}
                    >
                      {p.contractEnd || "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: B.green,
                      }}
                    >
                      {p.revenue ? `₹${p.revenue} Cr` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
function Analytics({ gm, rt, h2 }) {
  const [view, setView] = useState("overview");
  const [unit, setUnit] = useState("MW");
  const [stageF, setStageF] = useState("All");
  const [pmF, setPmF] = useState("All");

  const all = [
    ...gm.map((p) => ({ ...p, _tab: "Ground Mount" })),
    ...rt.map((p) => ({ ...p, _tab: "Rooftop" })),
    ...h2.map((p) => ({ ...p, _tab: "Green H2" })),
  ];

  const allPMs = ["All", ...new Set(all.map((p) => p.pm).filter(Boolean))];
  const filtered = all
    .filter((p) => stageF === "All" || p.stage === stageF)
    .filter((p) => pmF === "All" || p.pm === pmF);

  const totalMW = all.reduce((s, p) => s + (p.capacityKwp || 0), 0);
  const totalRev = all.reduce((s, p) => s + (p.revenue || 0), 0);

  const byStage = STAGES.map((stage) => ({
    stage: stage.length > 14 ? stage.slice(0, 11) + "..." : stage,
    gm:
      gm
        .filter((p) => p.stage === stage)
        .reduce((s, p) => s + (p.capacityKwp || 0), 0) / 1000,
    rt:
      rt
        .filter((p) => p.stage === stage)
        .reduce((s, p) => s + (p.capacityKwp || 0), 0) / 1000,
    h2:
      h2
        .filter((p) => p.stage === stage)
        .reduce((s, p) => s + (p.capacityKwp || 0), 0) / 1000,
    count: all.filter((p) => p.stage === stage).length,
  })).filter((d) => d.count > 0);

  const byStatus = ["critical", "warning", "on-track", "done"]
    .map((s) => ({
      name: STATUS[s].label,
      value: filtered.filter((p) => p.status === s).length,
      color: STATUS[s].dot,
    }))
    .filter((d) => d.value > 0);

  const byPM = allPMs
    .filter((p) => p !== "All")
    .map((pm) => ({
      pm: pm.split(" ")[0],
      fullPm: pm,
      count: filtered.filter((p) => p.pm === pm).length,
      mw: (
        filtered
          .filter((p) => p.pm === pm)
          .reduce((s, p) => s + (p.capacityKwp || 0), 0) / 1000
      ).toFixed(1),
      critical: filtered.filter((p) => p.pm === pm && p.status === "critical")
        .length,
      warning: filtered.filter((p) => p.pm === pm && p.status === "warning")
        .length,
    }))
    .filter((d) => d.count > 0);

  const byPend = Object.keys(PEND)
    .filter((k) => k !== "None")
    .map((pend) => ({
      pend,
      icon: PEND[pend].icon,
      color: PEND[pend].color,
      bg: PEND[pend].bg,
      count: filtered.filter((p) => p.pendency === pend).length,
    }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);

  const today = new Date();
  const parseD = (s) => {
    if (!s) return null;
    const p = s.split("-");
    return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : null;
  };
  const overdue = filtered.filter((p) => {
    const d = parseD(p.contractEnd);
    return d && d < today && p.status !== "done";
  });
  const thisMonth = filtered.filter((p) => {
    const d = parseD(p.contractEnd);
    return (
      d &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  });
  const upcoming = filtered.filter((p) => {
    const d = parseD(p.contractEnd);
    if (!d) return false;
    const diff = (d - today) / 86400000;
    return diff > 0 && diff <= 60;
  });

  const VIEWS = [
    { id: "overview", label: "📊 Overview" },
    { id: "pm", label: "👤 By PM" },
    { id: "pendency", label: "⚠️ By Pendency" },
    { id: "timeline", label: "📅 Timeline" },
  ];

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          value={stageF}
          onChange={(e) => setStageF(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${B.border}`,
            background: "#fff",
            fontSize: 11,
            fontFamily: "inherit",
          }}
        >
          {["All", ...STAGES].map((s) => (
            <option key={s} value={s}>
              {s === "All" ? "All Stages" : s}
            </option>
          ))}
        </select>
        <select
          value={pmF}
          onChange={(e) => setPmF(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${B.border}`,
            background: "#fff",
            fontSize: 11,
            fontFamily: "inherit",
          }}
        >
          {allPMs.map((p) => (
            <option key={p} value={p}>
              {p === "All" ? "All PMs" : p}
            </option>
          ))}
        </select>
        <div
          style={{
            display: "flex",
            gap: 2,
            background: B.oliveL,
            borderRadius: 8,
            padding: 3,
          }}
        >
          {["KW", "MW"].map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                background: unit === u ? "#fff" : "transparent",
                color: unit === u ? B.text : B.muted,
                fontSize: 11,
                fontWeight: unit === u ? 700 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {u}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: B.muted }}>
          {filtered.length} projects · {fmtMW(totalMW, unit)} · ₹
          {totalRev.toFixed(1)} Cr
        </span>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          {
            val: all.length,
            lbl: "Total Projects",
            sub: "All verticals",
            col: B.blue,
            bg: B.blueL,
          },
          {
            val: fmtMW(totalMW, unit),
            lbl: "Total Portfolio",
            sub: "MW capacity",
            col: B.olive,
            bg: B.oliveL,
          },
          {
            val: `₹${totalRev.toFixed(1)} Cr`,
            lbl: "Est. Revenue",
            sub: "All projects",
            col: B.green,
            bg: B.greenL,
          },
          {
            val: all.filter((p) => p.status === "critical").length,
            lbl: "Critical",
            sub: "Needs action",
            col: "#c0392b",
            bg: "#fef2f2",
          },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              background: m.bg,
              border: `1px solid ${m.col}33`,
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: m.col }}>
              {m.val}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: m.col,
                marginTop: 2,
              }}
            >
              {m.lbl}
            </div>
            <div
              style={{ fontSize: 11, color: m.col, opacity: 0.6, marginTop: 1 }}
            >
              {m.sub}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          background: B.oliveL,
          borderRadius: 10,
          padding: 4,
          marginBottom: 20,
        }}
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: view === v.id ? "#fff" : "transparent",
              color: view === v.id ? B.text : B.muted,
              fontSize: 12,
              fontWeight: view === v.id ? 700 : 400,
              fontFamily: "inherit",
              boxShadow: view === v.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "overview" && (
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: `1px solid ${B.border}`,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: B.text,
                marginBottom: 4,
              }}
            >
              MW by Stage
            </div>
            <div style={{ fontSize: 11, color: B.muted, marginBottom: 16 }}>
              Ground Mount · Rooftop · Green H2
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byStage} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke={B.border} />
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 10, fill: B.muted }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: B.muted }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}MW`}
                />
                <Tooltip formatter={(v) => `${v.toFixed(1)} MW`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="gm"
                  name="Ground Mount"
                  stackId="a"
                  fill={B.olive}
                />
                <Bar dataKey="rt" name="Rooftop" stackId="a" fill={B.blue} />
                <Bar
                  dataKey="h2"
                  name="Green H2"
                  stackId="a"
                  fill={B.green}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                border: `1px solid ${B.border}`,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: B.text,
                  marginBottom: 12,
                }}
              >
                Status Breakdown
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={byStatus}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={4}
                  >
                    {byStatus.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} projects`, n]} />
                </PieChart>
              </ResponsiveContainer>
              {byStatus.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: s.color,
                    }}
                  />
                  <span style={{ fontSize: 11, flex: 1 }}>{s.name}</span>
                  <span
                    style={{ fontSize: 12, fontWeight: 700, color: s.color }}
                  >
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                border: `1px solid ${B.border}`,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: B.text,
                  marginBottom: 10,
                }}
              >
                By Vertical
              </div>
              {[
                { label: "Ground Mount", data: gm, col: B.olive },
                { label: "Rooftop", data: rt, col: B.blue },
                { label: "Green H2", data: h2, col: B.green },
              ].map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: t.col,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, flex: 1 }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: B.muted }}>
                    {t.data.length}p
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.col }}>
                    {fmtMW(
                      t.data.reduce((s, p) => s + (p.capacityKwp || 0), 0),
                      unit
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === "pm" && (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: `1px solid ${B.border}`,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: B.text,
                marginBottom: 16,
              }}
            >
              Projects by PM
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byPM} layout="vertical" barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke={B.border} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: B.muted }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="pm"
                  type="category"
                  tick={{ fontSize: 11, fill: B.text }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip />
                <Bar dataKey="count" name="Projects" radius={[0, 4, 4, 0]}>
                  {byPM.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? B.olive : B.blue} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {byPM.map((pm, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: `1px solid ${B.border}`,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{ fontSize: 15, fontWeight: 700, color: B.text }}
                  >
                    {pm.fullPm}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {pm.critical > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          background: "#fef2f2",
                          color: "#c0392b",
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontWeight: 600,
                        }}
                      >
                        ⚠ {pm.critical}
                      </span>
                    )}
                    {pm.warning > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          background: B.limeL,
                          color: "#8a7000",
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontWeight: 600,
                        }}
                      >
                        {pm.warning} risk
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: B.muted }}>Projects</div>
                    <div
                      style={{ fontSize: 22, fontWeight: 700, color: B.blue }}
                    >
                      {pm.count}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: B.muted }}>
                      Portfolio
                    </div>
                    <div
                      style={{ fontSize: 22, fontWeight: 700, color: B.olive }}
                    >
                      {pm.mw} MW
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "pendency" && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {byPend.length === 0 ? (
              <div
                style={{
                  gridColumn: "1/-1",
                  textAlign: "center",
                  padding: 40,
                  color: B.muted,
                }}
              >
                No pendencies 🎉
              </div>
            ) : (
              byPend.map((p, i) => (
                <div
                  key={i}
                  style={{
                    background: p.bg,
                    border: `1px solid ${p.color}33`,
                    borderRadius: 12,
                    padding: 16,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 28 }}>{p.icon}</div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: p.color,
                      marginTop: 4,
                    }}
                  >
                    {p.count}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: p.color,
                      marginTop: 2,
                    }}
                  >
                    {p.pend}
                  </div>
                </div>
              ))
            )}
          </div>
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: `1px solid ${B.border}`,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: B.text,
                marginBottom: 16,
              }}
            >
              Projects with Pendency
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: B.oliveL }}>
                  {[
                    "Project",
                    "Vertical",
                    "Stage",
                    "Status",
                    "Pending On",
                    "PM",
                    "Remarks",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: B.muted,
                        textAlign: "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered
                  .filter((p) => p.pendency && p.pendency !== "None")
                  .map((p, i) => {
                    const cfg = STATUS[p.status] || STATUS["on-track"];
                    const pc = PEND[p.pendency] || PEND["None"];
                    const sc = STAGE_COL[p.stage] || "#64748b";
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: `1px solid ${B.border}`,
                          background: i % 2 === 0 ? "#fff" : B.bg,
                        }}
                      >
                        <td
                          style={{
                            padding: "10px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: B.blue,
                          }}
                        >
                          {p.name}
                        </td>
                        <td
                          style={{
                            padding: "10px 12px",
                            fontSize: 11,
                            color: B.muted,
                          }}
                        >
                          {p._tab}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: sc + "18",
                              color: sc,
                              fontWeight: 600,
                            }}
                          >
                            {p.stage}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: cfg.bg,
                              color: cfg.text,
                              border: `1px solid ${cfg.border}`,
                              fontWeight: 600,
                            }}
                          >
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 10,
                              background: pc.bg,
                              color: pc.color,
                              fontWeight: 600,
                            }}
                          >
                            {pc.icon} {p.pendency}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12 }}>
                          {p.pm || "—"}
                        </td>
                        <td
                          style={{
                            padding: "10px 12px",
                            fontSize: 11,
                            color: B.muted,
                            maxWidth: 180,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.remarks || "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "timeline" && (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
        >
          {[
            {
              title: "⚠ Overdue",
              items: overdue,
              col: "#c0392b",
              sub: "Contract end passed",
            },
            {
              title: "⏰ Due This Month",
              items: thisMonth,
              col: "#8a7000",
              sub: "Current month deadline",
            },
          ].map((section, si) => (
            <div
              key={si}
              style={{
                background: "#fff",
                borderRadius: 12,
                border: `1px solid ${B.border}`,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: section.col,
                  marginBottom: 4,
                }}
              >
                {section.title} ({section.items.length})
              </div>
              <div style={{ fontSize: 11, color: B.muted, marginBottom: 12 }}>
                {section.sub}
              </div>
              {section.items.length === 0 ? (
                <div
                  style={{
                    color: B.muted,
                    fontSize: 13,
                    textAlign: "center",
                    padding: 20,
                  }}
                >
                  None 🎉
                </div>
              ) : (
                section.items.map((p, i) => {
                  const cfg = STATUS[p.status] || STATUS["on-track"];
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 0",
                        borderBottom: `1px solid ${B.border}`,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: B.text,
                          }}
                        >
                          {p.name}
                        </div>
                        <div style={{ fontSize: 11, color: B.muted }}>
                          {p.contractEnd} · {p.pm}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: cfg.bg,
                          color: cfg.text,
                          border: `1px solid ${cfg.border}`,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {cfg.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          ))}
          <div
            style={{
              gridColumn: "1/-1",
              background: "#fff",
              borderRadius: 12,
              border: `1px solid ${B.border}`,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: B.blue,
                marginBottom: 4,
              }}
            >
              📅 Next 60 Days ({upcoming.length})
            </div>
            <div style={{ fontSize: 11, color: B.muted, marginBottom: 12 }}>
              Upcoming contract deadlines
            </div>
            {upcoming.length === 0 ? (
              <div style={{ color: B.muted, fontSize: 13 }}>
                None in next 60 days
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {upcoming.map((p, i) => {
                  const cfg = STATUS[p.status] || STATUS["on-track"];
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 12px",
                        background: B.bg,
                        borderRadius: 8,
                        border: `1px solid ${B.border}`,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: B.text,
                          }}
                        >
                          {p.name}
                        </div>
                        <div style={{ fontSize: 11, color: B.muted }}>
                          {p.contractEnd} · {p.pm}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: cfg.bg,
                          color: cfg.text,
                          border: `1px solid ${cfg.border}`,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LOADING ───────────────────────────────────────────────────────────────────
function Loading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "80vh",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: `4px solid ${B.border}`,
          borderTopColor: B.olive,
          animation: "spin 1s linear infinite",
        }}
      />
      <div style={{ fontSize: 14, color: B.muted }}>
        Loading live data from GitHub...
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("gm");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [gm, setGm] = useState([]);
  const [rt, setRt] = useState([]);
  const [h2, setH2] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = () => {
      fetch(DATA_URL, { cache: "no-cache" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => {
          setGm(
            (data.groundMount || []).filter((r) => r["PROJECT ID"]).map(mapRow)
          );
          setRt(
            (data.rooftop || []).filter((r) => r["PROJECT ID"]).map(mapRow)
          );
          setH2((data.h2 || []).filter((r) => r["PROJECT ID"]).map(mapRow));
          setLastUpdated(data.lastUpdated);
          setLoading(false);
          setError(null);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const NAV = [
    {
      id: "gm",
      label: "Ground Mount",
      badge: gm.filter((p) => p.status === "critical").length,
    },
    {
      id: "rt",
      label: "Rooftop",
      badge: rt.filter((p) => p.status === "critical").length,
    },
    {
      id: "h2",
      label: "Green H₂",
      badge: h2.filter((p) => p.status === "critical").length,
    },
    { id: "analytics", label: "Analytics", badge: 0 },
  ];

  return (
    <div
      style={{
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        background: B.bg,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderBottom: `2px solid ${B.olive}`,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            padding: "12px 0",
            marginRight: 28,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: `linear-gradient(135deg,${B.olive},${B.green})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 900,
              color: "#fff",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            GH2
            <br />
            SOLAR
          </div>
          <div>
            <div style={{ fontSize: 10, color: B.muted, letterSpacing: 1 }}>
              OPS DASHBOARD
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.text }}>
              GH2 Solar
            </div>
          </div>
        </div>

        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setScreen(n.id)}
            style={{
              padding: "16px 16px",
              border: "none",
              borderBottom: `3px solid ${
                screen === n.id ? B.blue : "transparent"
              }`,
              background: "none",
              color: screen === n.id ? B.blue : B.muted,
              fontSize: 13,
              fontWeight: screen === n.id ? 600 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {n.label}
            {n.badge > 0 && (
              <span
                style={{
                  background: "#c0392b",
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: 10,
                  padding: "1px 6px",
                  fontWeight: 700,
                }}
              >
                {n.badge}
              </span>
            )}
          </button>
        ))}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {lastUpdated && (
            <span style={{ fontSize: 10, color: B.muted }}>
              🔄{" "}
              {new Date(lastUpdated).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              })}{" "}
              {new Date(lastUpdated).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {error && (
            <span
              style={{
                fontSize: 10,
                color: "#c0392b",
                background: "#fef2f2",
                padding: "3px 8px",
                borderRadius: 6,
              }}
            >
              ⚠ Offline
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <>
          {screen === "gm" && (
            <ProjectScreen
              projects={gm}
              tabColor={B.olive}
              emptyLabel="No Ground Mount Projects"
              stageConfig={GM_STAGES}
            />
          )}
          {screen === "rt" && (
            <ProjectScreen
              projects={rt}
              tabColor={B.blue}
              emptyLabel="No Rooftop Projects"
              stageConfig={RT_STAGES}
            />
          )}
          {screen === "h2" && (
            <ProjectScreen
              projects={h2}
              tabColor={B.green}
              emptyLabel="No Green H₂ Projects Yet"
              stageConfig={H2_STAGES}
            />
          )}
          {screen === "analytics" && <Analytics gm={gm} rt={rt} h2={h2} />}
        </>
      )}
    </div>
  );
}
