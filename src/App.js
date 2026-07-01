import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";

const BASE = process.env.REACT_APP_DATA_BASE || "/data";
const DATA_URL = `${BASE}/epc-data.json`;

const T = {
  bg:"#f7f9f2", surface:"#ffffff", border:"#e2ebd0",
  text:"#1a2310", muted:"#5a6b4a", olive:"#A6C83D", oliveL:"#f0f5d6",
  blue:"#3E5BA6", green:"#1AAE48", amber:"#c8a000",
  amberL:"#fefde8", amberB:"#f5e84a", red:"#c0392b",
  purple:"#7C3AED",
  done:    {bg:"#e8f8ed",border:"#86d9a0",text:"#0d7a32"},
  avail:   {bg:"#eef1f9",border:"#a0b4e0",text:"#2a3f7a"},
  pending: {bg:"#fefde8",border:"#f5e84a",text:"#8a7000"},
  action:  {bg:"#fef2f2",border:"#f5a5a5",text:"#c0392b"},
  na:      {bg:"#f5f5f5",border:"#d0d0d0",text:"#666666"},
  confirm: {bg:"#fff3e0",border:"#ffb74d",text:"#e65100"},
};

const STATUS_META = {
  billed:  {label:"Submitted",     scheme:T.avail},
  blocked: {label:"Blocked",       scheme:T.action},
  soon:    {label:"Ready to bill", scheme:T.pending},
  locked:  {label:"Locked",        scheme:T.na},
};
const PO_TYPE_META = {
  ic:    {label:"I&C",     scheme:T.pending},
  mat:   {label:"Material",scheme:T.avail},
  svc:   {label:"Service", scheme:T.done},
  civil: {label:"Civil",   scheme:T.na},
};

// ── HELPERS ───────────────────────────────────────────────────
const num = v => (!v && v!==0)||isNaN(Number(v)) ? 0 : Number(v);
const fmtL = v => {
  if(!v && v!==0) return "—";
  const n=Number(v);
  if(n>=1e7) return `₹${(n/1e7).toFixed(2)} Cr`;
  if(n>=1e5) return `₹${(n/1e5).toFixed(1)}L`;
  if(n>=1e3) return `₹${(n/1e3).toFixed(1)}k`;
  return `₹${n.toLocaleString("en-IN")}`;
};
const fmtPct = v => (!v&&v!=="")?"—":(Number(v)*100).toFixed(2)+"%";

function excelDate(v) {
  if (!v && v !== 0) return "—";
  const s = String(v).trim();
  if (!s || s === "—") return "—";
  if (/[a-zA-Z]/.test(s) || s.includes("/")) return s;
  const n = Number(s);
  if (isNaN(n) || n < 1000) return s;
  try {
    const dt = new Date(Math.round((n - 25569) * 86400 * 1000));
    const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${String(dt.getUTCDate()).padStart(2,"0")}-${mo[dt.getUTCMonth()]}-${String(dt.getUTCFullYear()).slice(-2)}`;
  } catch { return s; }
}

// Parse any date string or excel serial to JS Date
function parseDate(v) {
  if (!v && v !== 0) return null;
  const s = String(v).trim();
  if (!s || s === "—") return null;
  // Excel serial
  if (/^\d+$/.test(s) && Number(s) > 1000) {
    return new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
  }
  // DD-Mon-YY or DD-Mon-YYYY
  const parts = s.split("-");
  if (parts.length === 3) {
    const mo = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const yr = parts[2].length===2 ? 2000+Number(parts[2]) : Number(parts[2]);
    if (mo[parts[1]] !== undefined) return new Date(yr, mo[parts[1]], Number(parts[0]));
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function getUpcomingReceipts(projects, rawInvoices, today=new Date()) {
  const projectMap = Object.fromEntries(projects.map(p=>[p.project_id,p]));
  return rawInvoices
    .filter(inv=>(inv.payment_status||"").toLowerCase()!=="blocked"&&num(inv.invoice_value)>num(inv.payment_received))
    .map(inv=>{
      const project=projectMap[inv.project_id];
      const milestone=project?.milestones?.find(ms=>ms.milestone_id===inv.milestone_id);
      const invoiceDate = parseDate(inv.invoice_date);
const paymentDate = parseDate(inv.payment_date);

// Same logic as dashboard
const clockStart =
  invoiceDate && paymentDate
    ? (paymentDate > invoiceDate ? paymentDate : invoiceDate)
    : (invoiceDate || paymentDate);

const tat = num(project?.payment_tat_days) || 45;

const expectedReceipt = clockStart
  ? new Date(clockStart.getTime() + tat * 86400000)
  : null;

return {
  project,
  milestone,
  inv,
  expectedReceipt,
  outstanding: num(inv.invoice_value) - num(inv.payment_received),
  daysLeft: expectedReceipt
    ? Math.ceil((expectedReceipt - today) / 86400000)
    : null
};    
    })
    .sort((a,b)=>(a.expectedReceipt?.getTime()||Infinity)-(b.expectedReceipt?.getTime()||Infinity));
}

function getUpcomingCompletions(projects, today=new Date()) {
  const limit=new Date(today.getTime()+30*86400000);
  return projects.flatMap(project=>project.milestones
    .map(ms=>({project,ms,date:parseDate(ms.expected_completion_date)}))
    .filter(({ms,date})=>ms.expected_completion_date&&date&&date<=limit&&(ms.invoices||[]).length===0))
    .sort((a,b)=>a.date-b.date);
}

function getUpcomingOutflows(projects, rawPos) {
  const projectMap=Object.fromEntries(projects.map(p=>[p.project_id,p]));
  const seen=new Set();
  return rawPos.filter(p=>{
    const key=`${p.project_id}|${p.po_id}`;
    if(!p.payment_due_date||seen.has(key)) return false;
    seen.add(key); return true;
  }).map(p=>({project:projectMap[p.project_id],p,date:parseDate(p.payment_due_date)}))
    .sort((a,b)=>(a.date?.getTime()||Infinity)-(b.date?.getTime()||Infinity));
}

function exportNext30Days(projects, rawInvoices, rawPos) {
  const receipts=getUpcomingReceipts(projects,rawInvoices);
  const completions=getUpcomingCompletions(projects);
  const outflows=getUpcomingOutflows(projects,rawPos);
  const inflow=XLSX.utils.aoa_to_sheet([
    ["PAYMENT PENDING"],
    ["Project","Milestone","Milestone Name","Invoice No.","Invoice Date","Outstanding","Expected Receipt","Days Left"],
    ...receipts.map(({project,milestone,inv,expectedReceipt,outstanding,daysLeft})=>[
      project?.project_name||project?.project_id||inv.project_id,
      inv.milestone_id,
      milestone?.milestone_name||"—",
      inv.invoice_no,
      excelDate(inv.invoice_date),
      outstanding,
      expectedReceipt?excelDate(Math.round(expectedReceipt.getTime()/86400000)+25569):"—",
      daysLeft
    ]),
    [],
    ["UPCOMING COMPLETIONS"],
    ["Project","Milestone","Milestone Name","Expected Completion","Milestone Value","Status"],
    ...completions.map(({project,ms})=>[
      project.project_name||project.project_id,
      ms.milestone_id,
      ms.milestone_name,
      excelDate(ms.expected_completion_date),
      num(ms.milestone_amount),
      STATUS_META[ms.status]?.label||ms.status
    ])
  ]);
  const outflow=XLSX.utils.aoa_to_sheet([
    ["Project","PO No.","Vendor","Description","Type","Payment Due Date","Payment Due Amount","PO Total","Paid","Balance"],
    ...outflows.map(({project,p})=>[
      project?.project_name||project?.project_id||p.project_id,
      p.po_id,
      p.vendor_name,
      p.work_description,
      PO_TYPE_META[p.po_type]?.label||p.po_type,
      excelDate(p.payment_due_date),
      num(p.payment_due_amount),
      num(p.po_value_total),
      num(p.amount_paid),
      num(p.po_value_total)-num(p.amount_paid)
    ])
  ]);
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,inflow,"Inflow Next 30 Days");
  XLSX.utils.book_append_sheet(workbook,outflow,"Outflow Upcoming");
  XLSX.writeFile(workbook,"Next 30 Days.xlsx");
}

function monthKey(dt) {
  if (!dt) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
}
function monthLabel(key) {
  if (!key) return "—";
  const [yr, mo] = key.split("-");
  const mos = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${mos[Number(mo)-1]} ${yr}`;
}

function resolveScheme(text) {
  if(!text) return T.na;
  const v=text.toString().toLowerCase();
  if(v.includes("received")||v.includes("done")||v.includes("closed")||v.includes("100%")) return T.done;
  if(v.includes("pending")||v.includes("partial")||v.includes("submitted"))               return T.pending;
  if(v.includes("blocked")||v.includes("not")||v.includes("overdue"))                     return T.action;
  if(v.includes("confirm")) return T.confirm;
  if(v.includes("active"))  return T.avail;
  return T.na;
}

// ── DATA JOIN ─────────────────────────────────────────────────
function joinData(projects, milestones, invoices, pos) {
  const paidMap = {};
  pos.forEach(p => {
    const key = `${p.project_id}|${p.po_id}`;
    if (!paidMap[key] && p.amount_paid !== "" && p.amount_paid !== null)
      paidMap[key] = num(p.amount_paid);
  });
  const msPOsMap = {};
  pos.forEach(p => {
    const ms = p.milestone_tag;
    if (!ms || ms === "" || ms === "Confirm milestone") return;
    if (!msPOsMap[ms]) msPOsMap[ms] = [];
    msPOsMap[ms].push({
      po_id: p.po_id, vendor_name: p.vendor_name||"—", po_type: p.po_type||"mat",
      po_value_total: num(p.po_value_total), amount_paid: paidMap[`${p.project_id}|${p.po_id}`]||0,
      apport_amount: num(p.apport_amount)||null, delivery_status: p.delivery_status||"", po_status: p.po_status||"",
    });
  });
  const msInvMap = {};
  invoices.forEach(i => {
    const ms = i.milestone_id; if(!ms) return;
    if(!msInvMap[ms]) msInvMap[ms] = [];
    msInvMap[ms].push(i);
  });
  return projects.map(proj => {
    const projMs = milestones.filter(m=>m.project_id===proj.project_id)
      .sort((a,b)=>Number(a.sequence)-Number(b.sequence))
      .map(ms => {
        const msInvoices = msInvMap[ms.milestone_id]||[];
        const msPOs = msPOsMap[ms.milestone_id]||[];
        return { ...ms, invoices:msInvoices, pos:msPOs, payment_received:msInvoices.reduce((a,i)=>a+num(i.payment_received),0) };
      });
    const seen = new Set(); let vendorPaid = 0;
    pos.filter(p=>p.project_id===proj.project_id).forEach(p=>{
      const key=`${p.project_id}|${p.po_id}`;
      if(!seen.has(key)){ seen.add(key); vendorPaid+=paidMap[key]||0; }
    });
    return { ...proj, milestones:projMs, vendor_paid:vendorPaid };
  });
}

// ── COMPUTE PO STATS ──────────────────────────────────────────
function computePOStats(projects, rawPos, filterProjectId=null, rawInvoices=[]) {
  const filteredProj = filterProjectId
    ? projects.filter(p=>p.project_id===filterProjectId)
    : projects.filter(p=>p.project_status==="active");
  const projIds = new Set(filteredProj.map(p=>p.project_id));
  const totalProjectValue = filteredProj.reduce((a,p)=>a+num(p.contract_value_inr),0);
  const seenTotal=new Set(), seenPaid=new Set();
  let totalPOIssued=0, totalPOPaid=0;
  rawPos.filter(p=>projIds.has(p.project_id)).forEach(p=>{
    const key=`${p.project_id}|${p.po_id}`;
    if(!seenTotal.has(key)){ seenTotal.add(key); totalPOIssued+=num(p.po_value_total); }
    if(!seenPaid.has(key)&&p.amount_paid!==""&&p.amount_paid!==null){ seenPaid.add(key); totalPOPaid+=num(p.amount_paid); }
  });
  const totalReceivedFromClient = rawInvoices
    .filter(i=>projIds.has(i.project_id)&&(i.payment_status||"").toLowerCase()!=="blocked")
    .reduce((a,i)=>a+num(i.payment_received),0);
  return { totalProjectValue, totalPOIssued, totalPOToIssue:totalProjectValue-totalPOIssued, totalPOPaid, totalPOBalance:totalPOIssued-totalPOPaid, totalReceivedFromClient };
}

// ── COMPUTE INVOICE STATS ─────────────────────────────────────
function computeInvoiceStats(rawInvoices, totalProjectValue=0) {
  const active  = rawInvoices.filter(i=>(i.payment_status||"").toLowerCase()!=="blocked");
  const blocked = rawInvoices.filter(i=>(i.payment_status||"").toLowerCase()==="blocked");
  const totalInvoiced = active.reduce((a,i)=>a+num(i.invoice_value),0);
  const totalReceived = active.reduce((a,i)=>a+num(i.payment_received),0);
  const totalBlocked  = blocked.reduce((a,i)=>a+num(i.invoice_value),0);
  return { totalInvoiced, totalReceived, totalPending:totalInvoiced-totalReceived, totalBlocked, totalProjectValue };
}

// ── COMPUTE RECEIVABLE WINDOWS ────────────────────────────────
function computeReceivable(rawInvoices, project, today=new Date()) {
  const tat = num(project.payment_tat_days)||45;
  const bands = [{min:-9999,max:-1,rows:[],overdue:true},{min:0,max:15,rows:[]},{min:16,max:30,rows:[]},{min:31,max:45,rows:[]}];
  rawInvoices.filter(i=>i.project_id===project.project_id).forEach(inv=>{
    const st=(inv.payment_status||"").toLowerCase();
    if(st==="blocked"||st==="received") return;
    const outstanding = num(inv.invoice_value)-num(inv.payment_received);
    if(outstanding<=0) return;
    const invDt   = parseDate(inv.invoice_date);
    const payDt   = parseDate(inv.payment_date);
    const clockStart = invDt&&payDt ? (payDt>invDt?payDt:invDt) : (invDt||payDt||null);
    if(!clockStart) return;
    const expected = new Date(clockStart.getTime() + tat*86400000);
    const daysFromToday = Math.floor((expected-today)/86400000);
    bands.forEach(b=>{ if(daysFromToday>=b.min&&daysFromToday<=b.max) b.rows.push({...inv, outstanding, clockStart, expected, daysFromToday}); });
  });
  return bands;
}

// ── COMPUTE CASHFLOW ──────────────────────────────────────────
function computeCashFlow(rawInvoices, rawPos, project, today=new Date()) {
  const tat = num(project.payment_tat_days)||45;
  const projId = project.project_id;
  const inflow={}, outflow={};
  const addTo = (map, key, val, row) => {
    if(!key) return;
    if(!map[key]) map[key]={total:0,rows:[]};
    map[key].total+=val; map[key].rows.push(row);
  };
  // Inflow actual — payment_date exists
  rawInvoices.filter(i=>i.project_id===projId&&num(i.payment_received)>0).forEach(inv=>{
    const dt=parseDate(inv.payment_date);
    if(dt) addTo(inflow, monthKey(dt), num(inv.payment_received), {...inv, _type:"actual"});
  });
  // Inflow projected — no payment_date but outstanding > 0
  rawInvoices.filter(i=>i.project_id===projId).forEach(inv=>{
    const st=(inv.payment_status||"").toLowerCase();
    if(st==="blocked"||st==="received") return;
    const outstanding=num(inv.invoice_value)-num(inv.payment_received);
    if(outstanding<=0) return;
    const invDt=parseDate(inv.invoice_date), payDt=parseDate(inv.payment_date);
    const clockStart=invDt&&payDt?(payDt>invDt?payDt:invDt):(invDt||payDt||null);
    if(!clockStart) return;
    const expected=new Date(clockStart.getTime()+tat*86400000);
    addTo(inflow, monthKey(expected), outstanding, {...inv, outstanding, expected, _type:"projected"});
  });
  // Outflow projected — payment_due_date + payment_due_amount
  const seenPO=new Set();
  rawPos.filter(p=>p.project_id===projId&&p.payment_due_date&&p.payment_due_amount).forEach(p=>{
    const key=`${p.project_id}|${p.po_id}`;
    if(seenPO.has(key)) return; seenPO.add(key);
    const dt=parseDate(p.payment_due_date);
    if(dt) addTo(outflow, monthKey(dt), num(p.payment_due_amount), {...p, _type:"projected"});
  });
  // Build sorted month list
  const allKeys=new Set([...Object.keys(inflow),...Object.keys(outflow)]);
  const months=[...allKeys].sort();
  return { months, inflow, outflow, today };
}

// ── MICRO COMPONENTS ─────────────────────────────────────────
const Badge = ({text,scheme}) => {
  if(!text) return <span style={{color:T.muted,fontSize:10}}>—</span>;
  const s=scheme||resolveScheme(text);
  return <span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:9,fontWeight:600,background:s.bg,border:`1px solid ${s.border}`,color:s.text,whiteSpace:"nowrap"}}>{text}</span>;
};
const StatusBadge = ({status}) => { const m=STATUS_META[status]||STATUS_META.locked; return <Badge text={m.label} scheme={m.scheme}/>; };
const TypePill    = ({type})   => { const m=PO_TYPE_META[type]||{label:type,scheme:T.na}; return <Badge text={m.label} scheme={m.scheme}/>; };

const Stat = ({label,value,sub,accent,onClick,active,italic}) => (
  <div onClick={onClick} style={{background:active?`${accent}11`:T.surface,border:`1px solid ${active?accent:accent+"33"}`,borderRadius:12,padding:"14px 16px",borderTop:`3px solid ${accent}`,cursor:onClick?"pointer":"default",transition:"all .12s",userSelect:"none"}}>
    <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span>{label}</span>{onClick&&<span style={{fontSize:9,color:active?accent:T.muted}}>{active?"▲":"▼"}</span>}
    </div>
    <div style={{fontSize:20,fontWeight:700,color:T.text,lineHeight:1,fontFamily:"monospace",fontStyle:italic?"italic":"normal"}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:T.muted,marginTop:4}}>{sub}</div>}
  </div>
);

const SecLabel = ({text}) => <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>{text}</div>;
const Tbl = ({children}) => <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>{children}</table></div>;
const TH = ({children,right,center}) => <th style={{padding:"5px 9px",textAlign:right?"right":center?"center":"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase",letterSpacing:".05em",whiteSpace:"nowrap",background:T.bg}}>{children}</th>;
const TD = ({children,right,bold,color,sx}) => <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:right?"right":"left",fontWeight:bold?600:400,color:color||T.text,verticalAlign:"middle",...sx}}>{children}</td>;
const TR = ({children,i}) => <tr style={{background:i%2===0?T.bg:T.surface}}>{children}</tr>;

const SectionLabel = ({text}) => (
  <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>{text}</div>
);

// ── SMALL PO CARD (for Row 0 + Row 1) ────────────────────────
function SmallCard({label,value,sub,accent,italic}) {
  return (
    <div style={{background:T.bg,borderRadius:10,border:`1px solid ${accent}22`,borderLeft:`3px solid ${accent}`,padding:"11px 14px"}}>
      <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{label}</div>
      <div style={{fontSize:18,fontWeight:700,color:T.text,lineHeight:1,fontFamily:"monospace",fontStyle:italic?"italic":"normal"}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:T.muted,marginTop:4}}>{sub}</div>}
    </div>
  );
}

// ── GLOBAL STRIP ──────────────────────────────────────────────
function GlobalStrip({ stats, invStats, rawInvoices, rawPos, rawProjects }) {
  const [collapsed, setCollapsed] = useState(false);
  const [cfTab, setCfTab]         = useState("combined");
  const [expandedMonth, setExpandedMonth] = useState(null);
  if (!stats) return null;

  // Global cash flow across all active projects
  const today = new Date();
  const activeProjects = rawProjects.filter(p=>p.project_status==="active");
  const globalInflow={}, globalOutflow={};
  const addTo=(map,key,val,row)=>{ if(!key)return; if(!map[key])map[key]={total:0,rows:[]}; map[key].total+=val; map[key].rows.push(row); };

  activeProjects.forEach(proj=>{
    const tat=num(proj.payment_tat_days)||45;
    rawInvoices.filter(i=>i.project_id===proj.project_id&&num(i.payment_received)>0).forEach(inv=>{
      const dt=parseDate(inv.payment_date);
      if(dt) addTo(globalInflow,monthKey(dt),num(inv.payment_received),{...inv,_type:"actual"});
    });
    rawInvoices.filter(i=>i.project_id===proj.project_id).forEach(inv=>{
      const st=(inv.payment_status||"").toLowerCase();
      if(st==="blocked"||st==="received") return;
      const out=num(inv.invoice_value)-num(inv.payment_received);
      if(out<=0) return;
      const invDt=parseDate(inv.invoice_date),payDt=parseDate(inv.payment_date);
      const cs=invDt&&payDt?(payDt>invDt?payDt:invDt):(invDt||payDt||null);
      if(!cs) return;
      const exp=new Date(cs.getTime()+tat*86400000);
      addTo(globalInflow,monthKey(exp),out,{...inv,outstanding:out,expected:exp,_type:"projected"});
    });
  });
  const seenPO=new Set();
  rawPos.forEach(p=>{
    if(!p.payment_due_date||!p.payment_due_amount) return;
    const key=`${p.project_id}|${p.po_id}`;
    if(seenPO.has(key)) return; seenPO.add(key);
    const dt=parseDate(p.payment_due_date);
    if(dt) addTo(globalOutflow,monthKey(dt),num(p.payment_due_amount),{...p,_type:"projected"});
  });
  const allMonths=[...new Set([...Object.keys(globalInflow),...Object.keys(globalOutflow)])].sort();
  const maxVal=Math.max(...allMonths.map(m=>Math.max(globalInflow[m]?.total||0,globalOutflow[m]?.total||0)),1);
  const todayKey=monthKey(today);

  const pctIssued=stats.totalProjectValue>0?((stats.totalPOIssued/stats.totalProjectValue)*100).toFixed(1):"0";
  const pctToIssue=stats.totalProjectValue>0?((stats.totalPOToIssue/stats.totalProjectValue)*100).toFixed(1):"0";
  const pctPaid=stats.totalPOIssued>0?((stats.totalPOPaid/stats.totalPOIssued)*100).toFixed(1):"0";
  const pctBalance=stats.totalPOIssued>0?((stats.totalPOBalance/stats.totalPOIssued)*100).toFixed(1):"0";

  const expandedData = expandedMonth ? {
    inflow: globalInflow[expandedMonth]?.rows||[],
    outflow: globalOutflow[expandedMonth]?.rows||[],
    inflowTotal: globalInflow[expandedMonth]?.total||0,
    outflowTotal: globalOutflow[expandedMonth]?.total||0,
  } : null;

  return (
    <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`}}>
      {/* collapse header */}
      <div style={{padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:collapsed?"none":`1px solid ${T.border}`}}>
        <span style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em"}}>Portfolio Overview — All Active Projects</span>
        <button onClick={()=>setCollapsed(c=>!c)} style={{fontSize:10,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:20,padding:"3px 12px",cursor:"pointer"}}>
          {collapsed?"▼ Expand":"▲ Collapse"}
        </button>
      </div>

      {!collapsed && (
        <div style={{padding:"14px 24px"}}>
          {/* Row 1 — PO Overview */}
          <SectionLabel text="PO Overview"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:14}}>
            <SmallCard label="Total Project Value"    value={fmtL(stats.totalProjectValue)}                                          sub="contract value"                   accent={T.olive}/>
            <SmallCard label="Net Outstanding"        value={fmtL(stats.totalProjectValue-(stats.totalReceivedFromClient||0))}        sub="project value − received"         accent={T.purple} italic/>
            <SmallCard label="Total PO Issued"        value={fmtL(stats.totalPOIssued)}                                              sub={`${pctIssued}% of project value`} accent={T.blue}/>
            <SmallCard label="PO Yet to Be Issued"    value={fmtL(stats.totalPOToIssue)}                                             sub={`${pctToIssue}% of project value`}accent={T.amber}/>
            <SmallCard label="Balance to Pay Vendors" value={fmtL(stats.totalPOBalance)}                                             sub={`${pctBalance}% of issued POs`}   accent={T.red}/>
            <SmallCard label="Total Paid to Vendors"  value={fmtL(stats.totalPOPaid)}                                                sub={`${pctPaid}% of issued POs paid`} accent={T.green}/>
          </div>

          {/* Row 2 — Invoicing Overview */}
          <div style={{height:1,background:T.border,marginBottom:12}}/>
          <SectionLabel text="Invoicing Overview"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
            <SmallCard label="Total Invoiced to Client"  value={fmtL(invStats.totalInvoiced)} sub="excl. blocked invoices"        accent={T.blue}/>
            <SmallCard label="Total Received from Client" value={fmtL(invStats.totalReceived)} sub="payments collected"            accent={T.green}/>
            <SmallCard label="Pending from Client"        value={fmtL(invStats.totalPending)}  sub="clean — collectible"           accent={T.amber}/>
            <SmallCard label="Blocked Invoices"           value={invStats.totalBlocked>0?fmtL(invStats.totalBlocked):"—"} sub="stuck — needs action" accent={T.red}/>
          </div>

          {/* Row 3 — Global Cash Flow */}
          {allMonths.length>0&&(
            <>
              <div style={{height:1,background:T.border,marginBottom:12}}/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <SectionLabel text="Cash Flow Overview"/>
                <div style={{display:"flex",gap:4}}>
                  {[["inflow","Inflow"],["outflow","Outflow"],["combined","Combined"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setCfTab(v)}
                      style={{padding:"3px 12px",borderRadius:20,border:`1px solid ${cfTab===v?T.olive:T.border}`,background:cfTab===v?T.oliveL:T.surface,color:cfTab===v?"#3d5c00":T.muted,fontSize:10,fontWeight:cfTab===v?700:400,cursor:"pointer"}}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"flex-end",overflowX:"auto",paddingBottom:6}}>
                {allMonths.map(mk=>{
                  const inf=globalInflow[mk]?.total||0;
                  const out=globalOutflow[mk]?.total||0;
                  const isPast=mk<todayKey;
                  const isExpanded=expandedMonth===mk;
                  const barH=80;
                  return (
                    <div key={mk} onClick={()=>setExpandedMonth(isExpanded?null:mk)}
                      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",minWidth:52,
                              background:isExpanded?T.oliveL:"transparent",borderRadius:6,padding:"4px 2px",border:`1px solid ${isExpanded?T.olive:"transparent"}`}}>
                      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:barH}}>
                        {(cfTab==="inflow"||cfTab==="combined")&&inf>0&&(
                          <div style={{width:16,height:Math.max(4,Math.round((inf/maxVal)*barH)),background:isPast?T.green:`${T.green}66`,borderRadius:"2px 2px 0 0",border:isPast?"none":`1px dashed ${T.green}`}}/>
                        )}
                        {(cfTab==="outflow"||cfTab==="combined")&&out>0&&(
                          <div style={{width:16,height:Math.max(4,Math.round((out/maxVal)*barH)),background:isPast?T.red:`${T.red}66`,borderRadius:"2px 2px 0 0",border:isPast?"none":`1px dashed ${T.red}`}}/>
                        )}
                        {(cfTab==="inflow"||cfTab==="combined")&&inf===0&&cfTab!=="outflow"&&<div style={{width:16,height:4,background:T.border,borderRadius:2}}/>}
                      </div>
                      <div style={{fontSize:8,color:T.muted,textAlign:"center",lineHeight:1.2}}>{monthLabel(mk).split(" ").join("\n")}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:16,marginTop:6,marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:10,height:10,background:T.green,borderRadius:2}}/> Inflow (actual)</div>
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:10,height:10,background:`${T.green}66`,border:`1px dashed ${T.green}`,borderRadius:2}}/> Inflow (projected)</div>
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:10,height:10,background:T.red,borderRadius:2}}/> Outflow (actual)</div>
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:10,height:10,background:`${T.red}66`,border:`1px dashed ${T.red}`,borderRadius:2}}/> Outflow (projected)</div>
                <div style={{marginLeft:"auto",fontSize:9,color:T.muted,fontStyle:"italic"}}>Click any bar to expand</div>
              </div>

              {/* Expanded month detail */}
              {expandedData&&(
                <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",marginTop:8,animation:"slideIn .12s ease-out"}}>
                  <div style={{fontWeight:700,fontSize:12,color:T.text,marginBottom:10}}>{monthLabel(expandedMonth)}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                    {/* Inflow */}
                    <div>
                      <div style={{fontSize:9,fontWeight:700,color:T.green,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Inflow — {fmtL(expandedData.inflowTotal)}</div>
                      {expandedData.inflow.length===0
                        ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>No inflow this month.</p>
                        : <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                            <thead><tr>
                              <th style={{padding:"4px 6px",textAlign:"left",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>Invoice</th>
                              <th style={{padding:"4px 6px",textAlign:"left",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>Project</th>
                              <th style={{padding:"4px 6px",textAlign:"right",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>Amount</th>
                              <th style={{padding:"4px 6px",textAlign:"center",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>Type</th>
                            </tr></thead>
                            <tbody>
                              {expandedData.inflow.map((r,i)=>(
                                <tr key={i} style={{background:i%2===0?T.surface:T.bg}}>
                                  <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9}}>{r.invoice_no||"—"}</td>
                                  <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,color:T.muted,fontSize:9}}>{r.project_id}</td>
                                  <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:600,color:T.green}}>{fmtL(r._type==="actual"?num(r.payment_received):r.outstanding)}</td>
                                  <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,textAlign:"center"}}>
                                    <span style={{fontSize:8,padding:"1px 5px",borderRadius:10,background:r._type==="actual"?T.done.bg:T.pending.bg,color:r._type==="actual"?T.done.text:T.pending.text}}>{r._type}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                      }
                    </div>
                    {/* Outflow */}
                    <div>
                      <div style={{fontSize:9,fontWeight:700,color:T.red,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Outflow — {fmtL(expandedData.outflowTotal)}</div>
                      {expandedData.outflow.length===0
                        ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>No outflow this month.</p>
                        : <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                            <thead><tr>
                              <th style={{padding:"4px 6px",textAlign:"left",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>PO No.</th>
                              <th style={{padding:"4px 6px",textAlign:"left",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>Vendor</th>
                              <th style={{padding:"4px 6px",textAlign:"right",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>Due</th>
                            </tr></thead>
                            <tbody>
                              {expandedData.outflow.map((r,i)=>(
                                <tr key={i} style={{background:i%2===0?T.surface:T.bg}}>
                                  <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9}}>{r.po_id}</td>
                                  <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,color:T.muted,fontSize:9,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.vendor_name}</td>
                                  <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:600,color:T.red}}>{fmtL(num(r.payment_due_amount))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                      }
                    </div>
                  </div>
                  <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"flex-end",gap:24,fontSize:11}}>
                    <span style={{color:T.green,fontFamily:"monospace",fontWeight:600}}>In: {fmtL(expandedData.inflowTotal)}</span>
                    <span style={{color:T.red,fontFamily:"monospace",fontWeight:600}}>Out: {fmtL(expandedData.outflowTotal)}</span>
                    <span style={{fontFamily:"monospace",fontWeight:700,color:expandedData.inflowTotal-expandedData.outflowTotal>=0?T.green:T.red}}>
                      Net: {fmtL(Math.abs(expandedData.inflowTotal-expandedData.outflowTotal))} {expandedData.inflowTotal-expandedData.outflowTotal>=0?"surplus":"deficit"}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── PROJECT VALUE ROW (Row 0) ─────────────────────────────────
function ProjectValueRow({ project, rawPos }) {
  const seen=new Set(); let actualSpent=0;
  rawPos.filter(p=>p.project_id===project.project_id).forEach(p=>{
    const key=`${p.project_id}|${p.po_id}`;
    if(!seen.has(key)){ seen.add(key); actualSpent+=num(p.po_value_total); }
  });
  const budget = num(project.project_budget_inr);
  const contract = num(project.contract_value_inr);
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
      <SmallCard label="Contract Value" value={fmtL(contract)} sub="signed EPC value"      accent={T.olive}/>
      <SmallCard label="Project Budget" value={budget>0?fmtL(budget):"Not set"} sub="internal cost plan" accent={T.blue}/>
      <SmallCard label="Actual Spent"   value={fmtL(actualSpent)} sub="all POs issued"     accent={T.red}/>
    </div>
  );
}

// ── PO STRIP (Row 1 — 4 cards) ────────────────────────────────
function POStripProject({ poStats }) {
  const pctPaid=poStats.totalPOIssued>0?((poStats.totalPOPaid/poStats.totalPOIssued)*100).toFixed(1):"0";
  const pctBalance=poStats.totalPOIssued>0?((poStats.totalPOBalance/poStats.totalPOIssued)*100).toFixed(1):"0";
  const pctToIssue=poStats.totalProjectValue>0?((poStats.totalPOToIssue/poStats.totalProjectValue)*100).toFixed(1):"0";
  const pctIssued=poStats.totalProjectValue>0?((poStats.totalPOIssued/poStats.totalProjectValue)*100).toFixed(1):"0";
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
      <SmallCard label="Total PO Issued"        value={fmtL(poStats.totalPOIssued)}   sub={`${pctIssued}% of contract`}   accent={T.blue}/>
      <SmallCard label="PO Yet to Be Issued"    value={fmtL(poStats.totalPOToIssue)}  sub={`${pctToIssue}% of contract`}  accent={T.amber}/>
      <SmallCard label="Balance to Pay Vendors" value={fmtL(poStats.totalPOBalance)}  sub={`${pctBalance}% of issued POs`} accent={T.red}/>
      <SmallCard label="Total Paid to Vendors"  value={fmtL(poStats.totalPOPaid)}     sub={`${pctPaid}% of issued POs`}   accent={T.green}/>
    </div>
  );
}

// ── BILLING STRIP (Row 2) ─────────────────────────────────────
function BillingStrip({ project, activeCard, onCard }) {
  const ms=project.milestones||[];
  const allInvs=ms.flatMap(m=>m.invoices||[]);
  const activeInvs=allInvs.filter(i=>(i.payment_status||"").toLowerCase()!=="blocked");
  const blockedInvs=allInvs.filter(i=>(i.payment_status||"").toLowerCase()==="blocked");
  const billed=activeInvs.reduce((a,i)=>a+num(i.invoice_value),0);
  const received=activeInvs.reduce((a,i)=>a+num(i.payment_received),0);
  const pending=billed-received;
  const blocked=blockedInvs.reduce((a,i)=>a+num(i.invoice_value),0);
  const soon=ms.filter(m=>m.status==="soon").reduce((a,m)=>a+num(m.milestone_amount),0);
  const locked=ms.filter(m=>m.status==="locked").reduce((a,m)=>a+num(m.milestone_amount),0);
  const tog=key=>onCard(activeCard===key?null:key);
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10,marginBottom:10}}>
      <Stat label="Vendor outgoing"     value={fmtL(project.vendor_paid)}     sub="paid to vendors"        accent={T.red}   onClick={()=>tog("outgoing")} active={activeCard==="outgoing"}/>
      <Stat label="Invoiced to client"  value={billed>0?fmtL(billed):"—"}     sub="excl. blocked"          accent={T.blue}  onClick={()=>tog("invoiced")} active={activeCard==="invoiced"}/>
      <Stat label="Payment received"    value={received>0?fmtL(received):"—"} sub="collected from client"  accent={T.green} onClick={()=>tog("received")} active={activeCard==="received"}/>
      <Stat label="Pending from client" value={pending>0?fmtL(pending):"—"}   sub="clean — collectible"    accent={T.amber} onClick={()=>tog("pending")}  active={activeCard==="pending"}/>
      <Stat label="Blocked invoices"    value={blocked>0?fmtL(blocked):"—"}   sub="stuck — needs action"   accent={T.red}   onClick={()=>tog("blocked")}  active={activeCard==="blocked"}/>
      <Stat label="Ready to bill"       value={fmtL(soon)}                    sub="invoice this week"      accent={T.amber} onClick={()=>tog("soon")}     active={activeCard==="soon"}/>
      <Stat label="Locked (future)"     value={fmtL(locked)}                  sub="work pending"           accent={T.muted} onClick={()=>tog("locked")}   active={activeCard==="locked"}/>
    </div>
  );
}

// ── RECEIVABLE STRIP (Row 3) ──────────────────────────────────
function ReceivableStrip({ project, rawInvoices }) {
  const [activeBand, setActiveBand] = useState(null);
  const today = new Date();
  const bands = computeReceivable(rawInvoices, project, today);
  const labels = ["Overdue","Due 0–15 days","Due 16–30 days","Due 31–45 days"];
  const accents = [T.red, T.green, T.amber, "#7C3AED"];
  const tog = i => setActiveBand(activeBand===i?null:i);
  const tat = num(project.payment_tat_days)||45;

  return (
    <div style={{marginBottom:10}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:6}}>
        {bands.map((b,i)=>(
          <Stat key={i} label={labels[i]}
            value={b.rows.length>0?fmtL(b.rows.reduce((a,r)=>a+r.outstanding,0)):"—"}
            sub={b.rows.length>0?(b.overdue?`${b.rows.length} invoice${b.rows.length>1?"s":""} — chase now`:`${b.rows.length} invoice${b.rows.length>1?"s":""}  ·  TAT ${tat}d`):(b.overdue?"Nothing overdue ✓":"No receivables")}
            accent={accents[i]} onClick={()=>tog(i)} active={activeBand===i}/>
        ))}
      </div>
      {activeBand!==null&&bands[activeBand].rows.length>0&&(
        <div style={{background:T.surface,border:`1px solid ${accents[activeBand]}33`,borderLeft:`3px solid ${accents[activeBand]}`,borderRadius:10,overflow:"hidden",animation:"slideIn .12s ease-out"}}>
          <div style={{padding:"8px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700,color:T.text}}>{labels[activeBand]} — Receivable Detail</span>
            <span style={{fontSize:9,color:T.muted,fontStyle:"italic"}}>Click card again to close</span>
          </div>
          <div style={{padding:"10px 14px",overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>
                <th style={{padding:"5px 8px",textAlign:"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase"}}>Invoice No.</th>
                <th style={{padding:"5px 8px",textAlign:"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase"}}>Milestone</th>
                <th style={{padding:"5px 8px",textAlign:"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase"}}>TAT Start</th>
                <th style={{padding:"5px 8px",textAlign:"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase"}}>Expected By</th>
                <th style={{padding:"5px 8px",textAlign:"center",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase"}}>Days Left</th>
                <th style={{padding:"5px 8px",textAlign:"right",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase"}}>Outstanding</th>
              </tr></thead>
              <tbody>
                {bands[activeBand].rows.map((r,i)=>{
                  const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  const fmtDt=d=>d?`${String(d.getDate()).padStart(2,"0")}-${mo[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`:"—";
                  return (
                    <tr key={i} style={{background:i%2===0?T.bg:T.surface}}>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:10}}>{r.invoice_no||"—"}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.muted}}>{r.milestone_id}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.muted}}>{fmtDt(r.clockStart)}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.text,fontWeight:500}}>{fmtDt(r.expected)}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontFamily:"monospace",fontSize:10,color:accents[activeBand],fontWeight:600}}>{r.daysFromToday}d</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:700,color:accents[activeBand]}}>{fmtL(r.outstanding)}</td>
                    </tr>
                  );
                })}
                <tr style={{background:T.oliveL}}>
                  <td colSpan={5} style={{padding:"6px 8px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total receivable</td>
                  <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:accents[activeBand]}}>{fmtL(bands[activeBand].rows.reduce((a,r)=>a+r.outstanding,0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CASH FLOW STRIP (Row 4) ───────────────────────────────────
function CashFlowStrip({ project, rawInvoices, rawPos }) {
  const [cfTab,   setCfTab]   = useState("combined");
  const [expanded,setExpanded]= useState(null);
  const today = new Date();
  const todayKey = monthKey(today);
  const { months, inflow, outflow } = computeCashFlow(rawInvoices, rawPos, project, today);
  if(months.length===0) return (
    <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",marginBottom:10,fontSize:11,color:T.muted,fontStyle:"italic"}}>
      No cash flow data yet — add invoice dates and payment_due_date to POs.
    </div>
  );
  const maxVal=Math.max(...months.map(m=>Math.max(inflow[m]?.total||0,outflow[m]?.total||0)),1);
  const exData=expanded?{inflow:inflow[expanded]?.rows||[],outflow:outflow[expanded]?.rows||[],inflowTotal:inflow[expanded]?.total||0,outflowTotal:outflow[expanded]?.total||0}:null;

  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 16px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <span style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em"}}>Inflow vs Outflow</span>
        <div style={{display:"flex",gap:4}}>
          {[["inflow","Inflow"],["outflow","Outflow"],["combined","Combined"]].map(([v,l])=>(
            <button key={v} onClick={()=>setCfTab(v)}
              style={{padding:"3px 12px",borderRadius:20,border:`1px solid ${cfTab===v?T.olive:T.border}`,background:cfTab===v?T.oliveL:T.surface,color:cfTab===v?"#3d5c00":T.muted,fontSize:10,fontWeight:cfTab===v?700:400,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* bars */}
      <div style={{display:"flex",gap:8,alignItems:"flex-end",overflowX:"auto",paddingBottom:6}}>
        {months.map(mk=>{
          const inf=inflow[mk]?.total||0;
          const out=outflow[mk]?.total||0;
          const isPast=mk<=todayKey;
          const isExp=expanded===mk;
          const barH=80;
          return (
            <div key={mk} onClick={()=>setExpanded(isExp?null:mk)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer",minWidth:60,
                      background:isExp?T.oliveL:"transparent",borderRadius:6,padding:"4px 4px 2px",border:`1px solid ${isExp?T.olive:"transparent"}`}}>
              <div style={{display:"flex",gap:3,alignItems:"flex-end",height:barH}}>
                {(cfTab==="inflow"||cfTab==="combined")&&(
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                    {inf>0&&<div style={{width:18,height:Math.max(4,Math.round((inf/maxVal)*barH)),background:isPast?T.green:`${T.green}55`,borderRadius:"3px 3px 0 0",border:isPast?"none":`1px dashed ${T.green}`}}/>}
                    {inf===0&&<div style={{width:18,height:3,background:T.border,borderRadius:2}}/>}
                  </div>
                )}
                {(cfTab==="outflow"||cfTab==="combined")&&(
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                    {out>0&&<div style={{width:18,height:Math.max(4,Math.round((out/maxVal)*barH)),background:isPast?T.red:`${T.red}55`,borderRadius:"3px 3px 0 0",border:isPast?"none":`1px dashed ${T.red}`}}/>}
                    {out===0&&<div style={{width:18,height:3,background:T.border,borderRadius:2}}/>}
                  </div>
                )}
              </div>
              <div style={{fontSize:8,color:isExp?T.olive:T.muted,textAlign:"center",lineHeight:1.3,fontWeight:isExp?700:400}}>{monthLabel(mk).replace(" ","\n")}</div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div style={{display:"flex",gap:14,marginTop:6,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:10,height:10,background:T.green,borderRadius:2}}/> Inflow actual</div>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:10,height:10,background:`${T.green}55`,border:`1px dashed ${T.green}`,borderRadius:2}}/> Inflow projected</div>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:10,height:10,background:T.red,borderRadius:2}}/> Outflow actual</div>
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:T.muted}}><div style={{width:10,height:10,background:`${T.red}55`,border:`1px dashed ${T.red}`,borderRadius:2}}/> Outflow projected</div>
        <div style={{marginLeft:"auto",fontSize:9,color:T.muted,fontStyle:"italic"}}>Click any month to expand</div>
      </div>

      {/* expanded detail */}
      {exData&&(
        <div style={{borderTop:`1px solid ${T.border}`,marginTop:10,paddingTop:10,animation:"slideIn .12s ease-out"}}>
          <div style={{fontWeight:700,fontSize:12,color:T.text,marginBottom:10}}>{monthLabel(expanded)}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* inflow detail */}
            <div>
              <div style={{fontSize:9,fontWeight:700,color:T.green,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Inflow — {fmtL(exData.inflowTotal)}</div>
              {exData.inflow.length===0
                ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>No inflow this month.</p>
                : <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                    <thead><tr>
                      <th style={{padding:"4px 6px",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,textAlign:"left"}}>Invoice</th>
                      <th style={{padding:"4px 6px",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,textAlign:"left"}}>Milestone</th>
                      <th style={{padding:"4px 6px",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,textAlign:"right"}}>Amount</th>
                      <th style={{padding:"4px 6px",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,textAlign:"center"}}>Type</th>
                    </tr></thead>
                    <tbody>
                      {exData.inflow.map((r,i)=>(
                        <tr key={i} style={{background:i%2===0?T.surface:T.bg}}>
                          <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9}}>{r.invoice_no||"—"}</td>
                          <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,color:T.muted,fontSize:9}}>{r.milestone_id||"—"}</td>
                          <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:600,color:T.green}}>{fmtL(r._type==="actual"?num(r.payment_received):r.outstanding)}</td>
                          <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,textAlign:"center"}}>
                            <span style={{fontSize:8,padding:"1px 5px",borderRadius:10,background:r._type==="actual"?T.done.bg:T.pending.bg,color:r._type==="actual"?T.done.text:T.pending.text}}>{r._type}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>
            {/* outflow detail */}
            <div>
              <div style={{fontSize:9,fontWeight:700,color:T.red,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Outflow — {fmtL(exData.outflowTotal)}</div>
              {exData.outflow.length===0
                ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>No outflow scheduled this month.</p>
                : <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                    <thead><tr>
                      <th style={{padding:"4px 6px",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,textAlign:"left"}}>PO No.</th>
                      <th style={{padding:"4px 6px",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,textAlign:"left"}}>Vendor</th>
                      <th style={{padding:"4px 6px",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,textAlign:"left"}}>Due Date</th>
                      <th style={{padding:"4px 6px",fontSize:8,fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,textAlign:"right"}}>Amount</th>
                    </tr></thead>
                    <tbody>
                      {exData.outflow.map((r,i)=>(
                        <tr key={i} style={{background:i%2===0?T.surface:T.bg}}>
                          <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9}}>{r.po_id}</td>
                          <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,color:T.muted,fontSize:9,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.vendor_name}</td>
                          <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,fontSize:9,color:T.muted}}>{excelDate(r.payment_due_date)}</td>
                          <td style={{padding:"4px 6px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:600,color:T.red}}>{fmtL(num(r.payment_due_amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>
          </div>
          <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"flex-end",gap:24,fontSize:11}}>
            <span style={{color:T.green,fontFamily:"monospace",fontWeight:600}}>In: {fmtL(exData.inflowTotal)}</span>
            <span style={{color:T.red,fontFamily:"monospace",fontWeight:600}}>Out: {fmtL(exData.outflowTotal)}</span>
            <span style={{fontFamily:"monospace",fontWeight:700,color:exData.inflowTotal-exData.outflowTotal>=0?T.green:T.red}}>
              Net: {fmtL(Math.abs(exData.inflowTotal-exData.outflowTotal))} {exData.inflowTotal-exData.outflowTotal>=0?"surplus":"deficit"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MILESTONE CARD ────────────────────────────────────────────
function MilestoneCard({ms,selected,onClick}) {
  const s=STATUS_META[ms.status]||STATUS_META.locked;
  return (
    <div onClick={onClick} role="button" tabIndex={0} onKeyDown={e=>e.key==="Enter"&&onClick()} aria-pressed={selected}
      style={{width:144,background:selected?T.oliveL:T.surface,border:`1px solid ${selected?T.olive:T.border}`,borderLeft:`3px solid ${s.scheme.border}`,borderRadius:8,padding:"9px 10px 8px",cursor:"pointer",transition:"all .12s",outline:"none"}}>
      <div style={{fontFamily:"monospace",fontSize:8,color:T.muted,marginBottom:2,fontWeight:700,letterSpacing:".04em"}}>{ms.letter||`M${ms.sequence}`}</div>
      <div style={{fontSize:10,fontWeight:600,color:T.text,lineHeight:1.35,marginBottom:5,minHeight:26}}>{ms.milestone_name}</div>
      <StatusBadge status={ms.status}/>
      <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:T.text,marginTop:4}}>{fmtL(ms.milestone_amount)}</div>
      <div style={{fontSize:8,color:T.muted,fontFamily:"monospace",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
        {ms.invoices?.[0]?.invoice_no&&ms.invoices[0].invoice_no!=="—"?ms.invoices[0].invoice_no.split("+")[0].trim():"No invoice yet"}
      </div>
      {ms.work_pct&&ms.work_pct!=="0%"&&<div style={{fontSize:8,color:T.muted,marginTop:2,fontFamily:"monospace"}}>{ms.work_pct}</div>}
    </div>
  );
}

// ── DRAWER ────────────────────────────────────────────────────
function Drawer({ms,project,onClose}) {
  if(!ms) return null;
  const s=STATUS_META[ms.status]||STATUS_META.locked;
  const pos=ms.pos||[]; const invs=ms.invoices||[]; const subs=ms.subs||[];
  const totalInvoiced=invs.reduce((a,i)=>a+num(i.invoice_value),0);
  const totalReceived=invs.reduce((a,i)=>a+num(i.payment_received),0);
  const totalPaid=pos.reduce((a,p)=>a+p.amount_paid,0);
  const totalBal=pos.reduce((a,p)=>a+(p.po_value_total-p.amount_paid),0);
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${s.scheme.border}`,borderRadius:12,overflow:"hidden",marginTop:14,animation:"slideIn .14s ease-out"}}>
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{padding:"11px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}}>{ms.letter?`Milestone ${ms.letter.toUpperCase()}`:`Milestone ${ms.sequence}`} — {ms.milestone_name}</div>
          <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:6,fontSize:10,color:T.muted}}>
            <span>{project.project_name}</span><span>·</span><StatusBadge status={ms.status}/><span>·</span>
            <span style={{fontFamily:"monospace"}}>{fmtPct(ms.pct_of_contract)} of contract</span><span>·</span>
            <span style={{fontFamily:"monospace"}}>{ms.work_pct||"—"} done</span>
            {totalReceived>0&&<><span>·</span><Badge text={`Received ${fmtL(totalReceived)}`} scheme={T.done}/></>}
          </div>
          {ms.blocker&&<div style={{marginTop:8,background:T.amberL,border:`1px solid ${T.amberB}`,borderRadius:6,padding:"6px 10px",fontSize:10,color:T.amber,display:"flex",alignItems:"flex-start",gap:6}}><span>⚠</span><span>{ms.blocker}</span></div>}
        </div>
        <button onClick={onClose} style={{fontSize:10,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",cursor:"pointer",flexShrink:0,marginLeft:12}}>✕ close</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:`1px solid ${T.border}`}}>
        <div style={{padding:"12px 16px",borderRight:`1px solid ${T.border}`}}>
          <SecLabel text="Invoice & Payment"/>
          <div style={{display:"grid",gridTemplateColumns:"auto 1fr",fontSize:11}}>
            {[
              ["Milestone value",<span style={{fontFamily:"monospace",fontWeight:700,color:T.blue}}>{fmtL(ms.milestone_amount)}</span>],
              ["% of contract",  <span style={{fontFamily:"monospace"}}>{fmtPct(ms.pct_of_contract)}</span>],
              ["Total invoiced", <span style={{fontFamily:"monospace",fontWeight:700,color:totalInvoiced>0?T.blue:T.muted}}>{totalInvoiced>0?fmtL(totalInvoiced):"Not raised"}</span>],
              ["Payment received",<span style={{fontFamily:"monospace",color:totalReceived>0?T.green:T.muted}}>{totalReceived>0?fmtL(totalReceived):"Not received"}</span>],
              ["Work done",      <span style={{fontFamily:"monospace"}}>{ms.work_pct||"—"}</span>],
              ["Certified by",   <span>{ms.certified_by||"—"}</span>],
              ["Last updated",   <span>{ms.last_updated||"—"}</span>],
            ].map(([k,v],i)=>(
              <><div key={`k${i}`} style={{padding:"4px 0",borderBottom:`1px solid ${T.border}`,color:T.muted,paddingRight:14}}>{k}</div>
              <div key={`v${i}`} style={{padding:"4px 0",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontWeight:500,color:T.text}}>{v}</div></>
            ))}
          </div>
        </div>
        <div style={{padding:"12px 16px"}}>
          <SecLabel text={`Sub-items (${subs.length})`}/>
          {subs.length>0?subs.map((s,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"baseline",padding:"5px 0",borderBottom:`1px solid ${T.border}`,fontSize:11}}>
              <span style={{color:T.muted}}>{s.name}{s.note&&<span style={{color:T.amber,fontSize:9}}> ({s.note})</span>}</span>
              <span style={{fontFamily:"monospace",fontSize:9,color:T.muted}}>{s.pct>0?fmtPct(s.pct):""}</span>
              <span style={{fontFamily:"monospace",fontWeight:600}}>{s.amt>0?fmtL(s.amt):"—"}</span>
            </div>
          )):<p style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>No sub-items defined.</p>}
        </div>
      </div>
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`}}>
        <SecLabel text={`Invoices raised (${invs.length})`}/>
        {invs.length>0?(
          <Tbl><thead><tr><TH>Invoice No.</TH><TH>Type</TH><TH>Description</TH><TH>Date</TH><TH right>Value</TH><TH>Sched. Pay</TH><TH right>Received</TH><TH>Status</TH></tr></thead>
          <tbody>{invs.map((inv,i)=>(
            <TR key={i} i={i}>
              <TD bold sx={{fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</TD>
              <TD><Badge text={inv.invoice_type} scheme={resolveScheme(inv.invoice_type)}/></TD>
              <TD color={T.muted} sx={{fontSize:10,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.description||"—"}</TD>
              <TD color={T.muted} sx={{fontSize:10}}>{excelDate(inv.invoice_date)}</TD>
              <TD right bold sx={{fontFamily:"monospace",color:T.blue}}>{fmtL(inv.invoice_value)}</TD>
              <TD color={T.muted} sx={{fontSize:10}}>{excelDate(inv.sched_pay_date)}</TD>
              <TD right sx={{fontFamily:"monospace",color:num(inv.payment_received)>0?T.green:T.muted}}>{num(inv.payment_received)>0?fmtL(inv.payment_received):"—"}</TD>
              <TD><Badge text={inv.payment_status} scheme={resolveScheme(inv.payment_status)}/></TD>
            </TR>
          ))}
          {invs.length>1&&<tr style={{background:T.oliveL}}>
            <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total — {invs.length} invoices</td>
            <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.blue}}>{fmtL(totalInvoiced)}</td>
            <td/><td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:totalReceived>0?T.green:T.muted}}>{totalReceived>0?fmtL(totalReceived):"—"}</td><td/>
          </tr>}
          </tbody></Tbl>
        ):<div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"9px 12px",fontSize:11,color:T.muted,fontStyle:"italic"}}>No invoices raised yet.</div>}
      </div>
      <div style={{padding:"12px 16px"}}>
        <SecLabel text={`Linked vendor POs (${pos.length})`}/>
        {pos.length>0?(
          <><Tbl><thead><tr><TH>PO No.</TH><TH>Vendor</TH><TH>Type</TH><TH right>Apport./Share</TH><TH right>PO Total</TH><TH right>Paid</TH><TH right>Balance</TH><TH>Delivery</TH></tr></thead>
          <tbody>{pos.map((p,i)=>{const bal=p.po_value_total-p.amount_paid;return(
            <TR key={i} i={i}>
              <TD color={T.muted} sx={{fontFamily:"monospace",fontSize:9}}>{p.po_id}</TD>
              <TD sx={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.vendor_name}</TD>
              <TD><TypePill type={p.po_type}/></TD>
              <TD right sx={{fontFamily:"monospace"}}>{p.apport_amount>0?fmtL(p.apport_amount):"100%"}</TD>
              <TD right sx={{fontFamily:"monospace",color:T.muted}}>{fmtL(p.po_value_total)}</TD>
              <TD right bold sx={{fontFamily:"monospace",color:p.amount_paid>0?T.green:T.red}}>{fmtL(p.amount_paid)}</TD>
              <TD right sx={{fontFamily:"monospace",color:bal>0?T.amber:T.green}}>{fmtL(bal)}</TD>
              <TD color={T.muted} sx={{fontSize:10}}>{p.delivery_status||"—"}</TD>
            </TR>
          );})}
          {pos.length>1&&<tr style={{background:T.oliveL}}>
            <td colSpan={3} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total — {pos.length} POs</td>
            <td/><td/>
            <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL(totalPaid)}</td>
            <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL(totalBal)}</td>
            <td/>
          </tr>}
          </tbody></Tbl>
          {pos.some(p=>p.po_type==="ic")&&<p style={{fontSize:9,color:T.muted,marginTop:6,fontStyle:"italic"}}>I&amp;C POs span all milestones — Apport./Share shows amount allocated to this milestone only.</p>}
          </>
        ):<div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"9px 12px",fontSize:11,color:T.muted,fontStyle:"italic"}}>No vendor POs mapped for this milestone yet.</div>}
      </div>
    </div>
  );
}

// ── BREAKDOWN PANEL ───────────────────────────────────────────
function BreakdownPanel({ type, project, rawPos }) {
  if (!type) return null;
  const ms=project.milestones||[];
  const allInvs=ms.flatMap(m=>m.invoices||[]);
  const today=new Date();
  const age=d=>{
    if(!d||d==="—") return "—";
    const s=String(d).trim(); let dt;
    if(/^\d+$/.test(s)&&Number(s)>1000){ dt=new Date(Math.round((Number(s)-25569)*86400*1000)); }
    else { const p=s.split("-"); if(p.length!==3) return "—"; const mo={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11}; const yr=p[2].length===2?2000+Number(p[2]):Number(p[2]); dt=new Date(yr,mo[p[1]],Number(p[0])); }
    const days=Math.floor((today-dt)/86400000); return isNaN(days)?"—":`${days}d`;
  };
  const meta={
    invoiced:{title:"Invoiced to Client",accent:T.blue},
    received:{title:"Payment Received",accent:T.green},
    pending:{title:"Pending from Client",accent:T.amber},
    blocked:{title:"Blocked Invoices",accent:T.red},
    outgoing:{title:"Vendor Outgoing",accent:T.red},
    soon:{title:"Ready to Bill",accent:T.amber},
    locked:{title:"Locked (Future)",accent:T.muted},
  }[type];
  const thS=(right)=>({padding:"5px 9px",textAlign:right?"right":"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase",letterSpacing:".05em",whiteSpace:"nowrap",background:T.bg});
  const tdS=(right,color)=>({padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:right?"right":"left",color:color||T.text,verticalAlign:"middle",fontSize:11});
  const trB=i=>i%2===0?T.bg:T.surface;

  let content=null;

  if(type==="invoiced"){
    const rows=allInvs.filter(i=>(i.payment_status||"").toLowerCase()!=="blocked");
    content=rows.length===0?<p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No invoices raised.</p>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr><th style={thS()}>Invoice No.</th><th style={thS()}>Milestone</th><th style={thS()}>Description</th><th style={thS()}>Date</th><th style={thS(true)}>Value</th><th style={thS()}>Status</th></tr></thead>
        <tbody>{rows.map((inv,i)=>(
          <tr key={i} style={{background:trB(i)}}>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{inv.milestone_id}</td>
            <td style={{...tdS(),maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{inv.description||"—"}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{excelDate(inv.invoice_date)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",fontWeight:600,color:T.blue}}>{fmtL(inv.invoice_value)}</td>
            <td style={tdS()}><span style={{fontSize:9,fontWeight:600,padding:"2px 7px",borderRadius:20,background:T.avail.bg,border:`1px solid ${T.avail.border}`,color:T.avail.text}}>{inv.payment_status}</span></td>
          </tr>
        ))}
        {rows.length>1&&<tr style={{background:T.oliveL}}>
          <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total — {rows.length} invoices</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.blue}}>{fmtL(rows.reduce((a,i)=>a+num(i.invoice_value),0))}</td><td/>
        </tr>}
        </tbody></table></div>;
  }
  if(type==="received"){
    const rows=allInvs.filter(i=>num(i.payment_received)>0);
    content=rows.length===0?<p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No payments received yet.</p>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr><th style={thS()}>Invoice No.</th><th style={thS()}>Milestone</th><th style={thS()}>Invoice Date</th><th style={thS(true)}>Invoice Value</th><th style={thS(true)}>Received</th><th style={thS()}>Payment Date</th></tr></thead>
        <tbody>{rows.map((inv,i)=>(
          <tr key={i} style={{background:trB(i)}}>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{inv.milestone_id}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{excelDate(inv.invoice_date)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",color:T.muted}}>{fmtL(inv.invoice_value)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",fontWeight:600,color:T.green}}>{fmtL(inv.payment_received)}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{excelDate(inv.payment_date)}</td>
          </tr>
        ))}
        {rows.length>1&&<tr style={{background:T.oliveL}}>
          <td colSpan={3} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total received</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.muted}}>{fmtL(rows.reduce((a,i)=>a+num(i.invoice_value),0))}</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL(rows.reduce((a,i)=>a+num(i.payment_received),0))}</td><td/>
        </tr>}
        </tbody></table></div>;
  }
  if(type==="pending"){
    const rows=allInvs.filter(i=>{const st=(i.payment_status||"").toLowerCase();return st!=="blocked"&&st!=="received"&&num(i.invoice_value)>num(i.payment_received);});
    content=rows.length===0?<p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No pending invoices.</p>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr><th style={thS()}>Invoice No.</th><th style={thS()}>Milestone</th><th style={thS()}>Description</th><th style={thS()}>Invoice Date</th><th style={thS()}>Sched. Pay</th><th style={thS(true)}>Value</th><th style={thS(true)}>Received</th><th style={thS(true)}>Outstanding</th><th style={thS(true)}>Age</th></tr></thead>
        <tbody>{rows.map((inv,i)=>{
          const out=num(inv.invoice_value)-num(inv.payment_received); const invAge=age(inv.invoice_date);
          return(<tr key={i} style={{background:trB(i)}}>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{inv.milestone_id}</td>
            <td style={{...tdS(),maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{inv.description||"—"}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{excelDate(inv.invoice_date)}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{excelDate(inv.sched_pay_date)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",color:T.muted}}>{fmtL(inv.invoice_value)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",color:T.green}}>{num(inv.payment_received)>0?fmtL(inv.payment_received):"—"}</td>
            <td style={{...tdS(true),fontFamily:"monospace",fontWeight:600,color:T.amber}}>{fmtL(out)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",color:invAge!=="—"&&Number(invAge.replace("d",""))>30?T.red:T.muted,fontSize:10}}>{invAge}</td>
          </tr>);
        })}
        {rows.length>1&&<tr style={{background:T.oliveL}}>
          <td colSpan={5} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total outstanding</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.muted}}>{fmtL(rows.reduce((a,i)=>a+num(i.invoice_value),0))}</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL(rows.reduce((a,i)=>a+num(i.payment_received),0))}</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL(rows.reduce((a,i)=>a+(num(i.invoice_value)-num(i.payment_received)),0))}</td><td/>
        </tr>}
        </tbody></table></div>;
  }
  if(type==="blocked"){
    const rows=allInvs.filter(i=>(i.payment_status||"").toLowerCase()==="blocked");
    content=rows.length===0?<p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No blocked invoices.</p>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr><th style={thS()}>Invoice No.</th><th style={thS()}>Milestone</th><th style={thS()}>Description</th><th style={thS()}>Date</th><th style={thS(true)}>Value</th><th style={thS()}>Blocker</th></tr></thead>
        <tbody>{rows.map((inv,i)=>{
          const msObj=ms.find(m=>m.milestone_id===inv.milestone_id); const blocker=inv.remarks||msObj?.blocker||"—";
          return(<tr key={i} style={{background:trB(i)}}>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{inv.milestone_id}</td>
            <td style={{...tdS(),maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{inv.description||"—"}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{excelDate(inv.invoice_date)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",fontWeight:600,color:T.red}}>{fmtL(inv.invoice_value)}</td>
            <td style={{...tdS(),fontSize:10,color:T.amber,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{blocker}</td>
          </tr>);
        })}
        {rows.length>1&&<tr style={{background:T.oliveL}}>
          <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total blocked</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.red}}>{fmtL(rows.reduce((a,i)=>a+num(i.invoice_value),0))}</td><td/>
        </tr>}
        </tbody></table></div>;
  }
  if(type==="outgoing"){
    const seen=new Set(); const uniquePOs=[];
    rawPos.filter(p=>p.project_id===project.project_id).forEach(p=>{const key=`${p.project_id}|${p.po_id}`;if(!seen.has(key)){seen.add(key);uniquePOs.push(p);}});
    const rows=uniquePOs.filter(p=>num(p.amount_paid)>0);
    content=rows.length===0?<p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No vendor payments made yet.</p>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr><th style={thS()}>PO No.</th><th style={thS()}>Vendor</th><th style={thS()}>Description</th><th style={thS()}>Type</th><th style={thS(true)}>PO Total</th><th style={thS(true)}>Paid</th><th style={thS(true)}>Balance</th><th style={thS()}>Delivery</th></tr></thead>
        <tbody>{rows.map((p,i)=>{
          const bal=num(p.po_value_total)-num(p.amount_paid); const tm=PO_TYPE_META[p.po_type]||{label:p.po_type,scheme:T.na};
          return(<tr key={i} style={{background:trB(i)}}>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:9,color:T.muted}}>{p.po_id}</td>
            <td style={{...tdS(),maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.vendor_name}</td>
            <td style={{...tdS(),maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{p.work_description||"—"}</td>
            <td style={tdS()}><span style={{fontSize:8,fontWeight:600,padding:"2px 6px",borderRadius:20,background:tm.scheme.bg,border:`1px solid ${tm.scheme.border}`,color:tm.scheme.text}}>{tm.label}</span></td>
            <td style={{...tdS(true),fontFamily:"monospace",color:T.muted}}>{fmtL(p.po_value_total)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",fontWeight:600,color:T.green}}>{fmtL(p.amount_paid)}</td>
            <td style={{...tdS(true),fontFamily:"monospace",color:bal>0?T.amber:T.green}}>{fmtL(bal)}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{p.delivery_status||"—"}</td>
          </tr>);
        })}
        {rows.length>1&&<tr style={{background:T.oliveL}}>
          <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.muted}}>{fmtL(rows.reduce((a,p)=>a+num(p.po_value_total),0))}</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL(rows.reduce((a,p)=>a+num(p.amount_paid),0))}</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL(rows.reduce((a,p)=>a+(num(p.po_value_total)-num(p.amount_paid)),0))}</td><td/>
        </tr>}
        </tbody></table></div>;
  }
  if(type==="soon"){
    const rows=ms.filter(m=>m.status==="soon");
    content=rows.length===0?<p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No milestones ready to bill.</p>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr><th style={thS()}>Milestone</th><th style={thS()}>Work %</th><th style={thS()}>Expected Completion</th><th style={thS()}>Blocker</th><th style={thS(true)}>Milestone Value</th></tr></thead>
        <tbody>{rows.map((m,i)=>(
          <tr key={i} style={{background:trB(i)}}>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:10,fontWeight:600}}>{m.letter||m.sequence}</td>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:10}}>{m.work_pct||"—"}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{excelDate(m.expected_completion_date)}</td>
            <td style={{...tdS(),fontSize:10,color:T.amber,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.blocker||"—"}</td>
            <td style={{...tdS(true),fontFamily:"monospace",fontWeight:600,color:T.amber}}>{fmtL(m.milestone_amount)}</td>
          </tr>
        ))}
        {rows.length>1&&<tr style={{background:T.oliveL}}>
          <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total ready to bill</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL(rows.reduce((a,m)=>a+num(m.milestone_amount),0))}</td>
        </tr>}
        </tbody></table></div>;
  }
  if(type==="locked"){
    const rows=ms.filter(m=>m.status==="locked");
    content=rows.length===0?<p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No locked milestones.</p>:
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead><tr><th style={thS()}>Milestone</th><th style={thS()}>Name</th><th style={thS()}>Category</th><th style={thS(true)}>Value</th><th style={thS()}>Work Done</th><th style={thS()}>Note</th></tr></thead>
        <tbody>{rows.map((m,i)=>(
          <tr key={i} style={{background:trB(i)}}>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:10,fontWeight:600}}>{m.letter||m.sequence}</td>
            <td style={tdS()}>{m.milestone_name}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted}}>{m.category||"—"}</td>
            <td style={{...tdS(true),fontFamily:"monospace",color:T.muted}}>{fmtL(m.milestone_amount)}</td>
            <td style={{...tdS(),fontFamily:"monospace",fontSize:10,color:T.muted}}>{m.work_pct||"—"}</td>
            <td style={{...tdS(),fontSize:10,color:T.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.blocker||"—"}</td>
          </tr>
        ))}
        {rows.length>1&&<tr style={{background:T.oliveL}}>
          <td colSpan={3} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total locked</td>
          <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.muted}}>{fmtL(rows.reduce((a,m)=>a+num(m.milestone_amount),0))}</td><td colSpan={2}/>
        </tr>}
        </tbody></table></div>;
  }

  return (
    <div style={{background:T.surface,border:`1px solid ${meta.accent}33`,borderLeft:`3px solid ${meta.accent}`,borderRadius:12,overflow:"hidden",marginTop:14,animation:"slideIn .14s ease-out"}}>
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:11,fontWeight:700,color:T.text}}>{meta.title}</div>
        <div style={{fontSize:9,color:T.muted,fontStyle:"italic"}}>Click card again to close</div>
      </div>
      <div style={{padding:"12px 16px"}}>{content}</div>
    </div>
  );
}

// ── MILESTONE TABLE ───────────────────────────────────────────
function MilestoneTable({ project }) {
  const ms=project.milestones||[];
  const ss={billed:{bg:"#eef1f9",border:"#a0b4e0",text:"#2a3f7a"},blocked:{bg:"#fef2f2",border:"#f5a5a5",text:"#c0392b"},soon:{bg:"#fefde8",border:"#f5e84a",text:"#8a7000"},locked:{bg:"#f5f5f5",border:"#d0d0d0",text:"#666666"}};
  const tot=ms.reduce((a,m)=>a+num(m.milestone_amount),0);
  const billed=ms.filter(m=>["billed","blocked"].includes(m.status)).reduce((a,m)=>a+num(m.milestone_amount),0);
  const soon=ms.filter(m=>m.status==="soon").reduce((a,m)=>a+num(m.milestone_amount),0);
  const locked=ms.filter(m=>m.status==="locked").reduce((a,m)=>a+num(m.milestone_amount),0);
  const th=(t,right,center)=><th key={t} style={{padding:"7px 9px",textAlign:right?"right":center?"center":"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase",letterSpacing:".05em",whiteSpace:"nowrap",background:T.bg}}>{t}</th>;
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {[{l:"Total Contract Value",v:fmtL(tot),a:T.olive},{l:"Submitted",v:fmtL(billed),a:T.blue},{l:"Ready to Bill",v:fmtL(soon),a:T.amber},{l:"Locked (Future)",v:fmtL(locked),a:T.muted}].map(c=>(
          <div key={c.l} style={{background:T.surface,borderRadius:10,border:`1px solid ${c.a}22`,borderLeft:`3px solid ${c.a}`,padding:"11px 14px"}}>
            <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>{c.l}</div>
            <div style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:"monospace"}}>{c.v}</div>
          </div>
        ))}
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>{th("#",false,true)}{th("Milestone ID")}{th("Name")}{th("Category",false,true)}{th("% Contract",false,true)}{th("Value",true)}{th("Status",false,true)}{th("Work %",false,true)}{th("Expected Completion")}{th("Invoice No.")}{th("Inv. Value",true)}{th("Received",true)}{th("Outstanding",true)}{th("Blocker")}</tr></thead>
            <tbody>{ms.map((m,i)=>{
              const s=ss[m.status]||ss.locked; const invs=m.invoices||[];
              const iVal=invs.reduce((a,v)=>a+num(v.invoice_value),0); const iRec=invs.reduce((a,v)=>a+num(v.payment_received),0);
              const out=iVal-iRec; const nos=invs.map(v=>v.invoice_no).filter(n=>n&&n!=="—").join(", ")||"—";
              return(<tr key={m.milestone_id} style={{background:i%2===0?T.bg:T.surface}}>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontFamily:"monospace",fontSize:10,color:T.muted,fontWeight:600}}>{m.sequence}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9,color:T.muted,whiteSpace:"nowrap"}}>{m.milestone_id}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontWeight:500,minWidth:180}}>{m.milestone_name}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontSize:10,color:T.muted}}>{m.category||"—"}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontFamily:"monospace",fontSize:10}}>{m.pct_of_contract?fmtPct(m.pct_of_contract):"—"}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:600}}>{fmtL(m.milestone_amount)}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center"}}><span style={{fontSize:9,fontWeight:600,padding:"2px 8px",borderRadius:20,background:s.bg,border:`1px solid ${s.border}`,color:s.text,whiteSpace:"nowrap"}}>{STATUS_META[m.status]?.label||m.status}</span></td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontFamily:"monospace",fontSize:10,color:T.muted}}>{m.work_pct||"—"}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.muted,whiteSpace:"nowrap"}}>{excelDate(m.expected_completion_date)}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9,color:T.muted,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nos}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",color:iVal>0?T.blue:T.muted}}>{iVal>0?fmtL(iVal):"—"}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",color:iRec>0?T.green:T.muted}}>{iRec>0?fmtL(iRec):"—"}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:out>0?600:400,color:out>0?T.amber:T.muted}}>{out>0?fmtL(out):"—"}</td>
                <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.amber,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.blocker||"—"}</td>
              </tr>);
            })}</tbody>
            <tfoot><tr style={{background:T.oliveL}}>
              <td colSpan={5} style={{padding:"7px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>TOTAL — {ms.length} milestones</td>
              <td style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700}}>{fmtL(tot)}</td>
              <td colSpan={4}/>
              <td style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.blue}}>{fmtL(ms.reduce((a,m)=>{const x=m.invoices||[];return a+x.reduce((b,i)=>b+num(i.invoice_value),0);},0))}</td>
              <td style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL(ms.reduce((a,m)=>{const x=m.invoices||[];return a+x.reduce((b,i)=>b+num(i.payment_received),0);},0))}</td>
              <td style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL(ms.reduce((a,m)=>{const x=m.invoices||[];const v=x.reduce((b,i)=>b+num(i.invoice_value),0);const r=x.reduce((b,i)=>b+num(i.payment_received),0);return a+(v-r);},0))}</td>
              <td/>
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}


// ── PO PAYMENTS UPCOMING (Row 4) ─────────────────────────────
function POPaymentsUpcoming({ project, rawPos }) {
  const [activeBand, setActiveBand] = useState(null);
  const today = new Date();

  // Build 3 exclusive windows from payment_due_date + payment_due_amount
  const bands = [{min:0,max:15,rows:[]},{min:16,max:30,rows:[]},{min:31,max:45,rows:[]}];
  const seen = new Set();

  rawPos.filter(p => p.project_id === project.project_id).forEach(p => {
    const key = `${p.project_id}|${p.po_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!p.payment_due_date || !p.payment_due_amount) return;
    const dueDate = parseDate(p.payment_due_date);
    if (!dueDate) return;
    const daysFromToday = Math.floor((dueDate - today) / 86400000);
    if (daysFromToday < 0) return; // already past
    const row = {
      po_id:              p.po_id,
      vendor_name:        p.vendor_name || "—",
      work_description:   p.work_description || "—",
      payment_due_date:   p.payment_due_date,
      payment_due_amount: num(p.payment_due_amount),
      po_value_total:     num(p.po_value_total),
      amount_paid:        num(p.amount_paid),
      balance:            num(p.po_value_total) - num(p.amount_paid),
      po_type:            p.po_type || "mat",
      daysFromToday,
    };
    bands.forEach(b => { if (daysFromToday >= b.min && daysFromToday <= b.max) b.rows.push(row); });
  });

  const labels  = ["Due 0–15 days", "Due 16–30 days", "Due 31–45 days"];
  const accents = [T.red, T.amber, T.amber];
  const tog = i => setActiveBand(activeBand === i ? null : i);

  const totalUpcoming = bands.reduce((a,b) => a + b.rows.reduce((s,r) => s + r.payment_due_amount, 0), 0);
  if (totalUpcoming === 0 && bands.every(b => b.rows.length === 0)) return (
    <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",marginBottom:10,fontSize:11,color:T.muted,fontStyle:"italic"}}>
      No upcoming PO payments — add payment_due_date &amp; payment_due_amount in Tab 4.
    </div>
  );

  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>
        PO Payments Upcoming
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:6}}>
        {bands.map((b,i) => (
          <Stat key={i}
            label={labels[i]}
            value={b.rows.length > 0 ? fmtL(b.rows.reduce((a,r) => a + r.payment_due_amount, 0)) : "—"}
            sub={b.rows.length > 0 ? `${b.rows.length} PO${b.rows.length > 1 ? "s" : ""} due` : "Nothing due"}
            accent={accents[i]}
            onClick={() => tog(i)}
            active={activeBand === i}
          />
        ))}
      </div>

      {activeBand !== null && bands[activeBand].rows.length > 0 && (
        <div style={{background:T.surface,border:`1px solid ${accents[activeBand]}33`,borderLeft:`3px solid ${accents[activeBand]}`,borderRadius:10,overflow:"hidden",animation:"slideIn .12s ease-out"}}>
          <div style={{padding:"8px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700,color:T.text}}>{labels[activeBand]} — PO Payment Detail</span>
            <span style={{fontSize:9,color:T.muted,fontStyle:"italic"}}>Click card again to close</span>
          </div>
          <div style={{padding:"10px 14px",overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr>
                {["PO No.","Vendor","Description","Type","Due Date","Days Left","Amount Due","PO Balance"].map((h,i) => (
                  <th key={h} style={{padding:"5px 8px",textAlign:i>=5?"right":"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase",whiteSpace:"nowrap",background:T.bg}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {bands[activeBand].rows.sort((a,b) => a.daysFromToday - b.daysFromToday).map((r,i) => {
                  const tm = PO_TYPE_META[r.po_type] || {label:r.po_type, scheme:T.na};
                  return (
                    <tr key={i} style={{background:i%2===0?T.bg:T.surface}}>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9,color:T.muted}}>{r.po_id}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.vendor_name}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{r.work_description}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`}}>
                        <span style={{fontSize:8,fontWeight:600,padding:"2px 6px",borderRadius:20,background:tm.scheme.bg,border:`1px solid ${tm.scheme.border}`,color:tm.scheme.text}}>{tm.label}</span>
                      </td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.text,fontWeight:500}}>{excelDate(r.payment_due_date)}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:700,color:accents[activeBand]}}>{r.daysFromToday<0?`${Math.abs(r.daysFromToday)}d overdue`:`${r.daysFromToday}d`}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.red}}>{fmtL(r.payment_due_amount)}</td>
                      <td style={{padding:"6px 8px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",color:T.muted}}>{fmtL(r.balance)}</td>
                    </tr>
                  );
                })}
                <tr style={{background:T.oliveL}}>
                  <td colSpan={6} style={{padding:"6px 8px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>
                    Total due — {bands[activeBand].rows.length} POs
                  </td>
                  <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.red}}>
                    {fmtL(bands[activeBand].rows.reduce((a,r) => a + r.payment_due_amount, 0))}
                  </td>
                  <td/>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CASH FLOW (collapsible, bottom of project) ────────────────
function CashFlowCollapsible({ project, rawInvoices, rawPos }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:10}}>
      <div onClick={() => setOpen(o => !o)}
        style={{padding:"10px 16px",background:T.surface,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",userSelect:"none"}}>
        <span style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em"}}>Cash Flow — Inflow vs Outflow</span>
        <span style={{fontSize:10,color:T.muted}}>{open?"▲ Collapse":"▼ Expand"}</span>
      </div>
      {open && (
        <div style={{padding:"12px 16px",background:T.bg}}>
          <CashFlowStrip project={project} rawInvoices={rawInvoices} rawPos={rawPos}/>
        </div>
      )}
    </div>
  );
}

// ── PROJECT RAIL ──────────────────────────────────────────────
function ProjectRail({ project, rawPos, rawProjects, rawInv }) {
  const [selected,   setSelected]   = useState(null);
  const [activeCard, setActiveCard] = useState(null);
  const [activeView, setActiveView] = useState("rail");
  const ms         = project.milestones||[];
  const selectedMs = ms.find(m=>m.milestone_id===selected);
  const toggle     = id=>setSelected(prev=>prev===id?null:id);
  const poStats    = computePOStats(rawProjects, rawPos, project.project_id, rawInv||[]);

  // project header — timeline from new cols
  const startDate = excelDate(project.project_start_date);
  const endDate   = excelDate(project.project_end_date);
  const timelineNote = project.project_timeline_note;
  const hasTimeline = startDate!=="—"||endDate!=="—";

  return (
    <div>
      {/* Project header */}
      {hasTimeline&&(
        <div style={{marginBottom:12,fontSize:11,color:T.muted,fontStyle:"italic"}}>
          {startDate!=="—"&&endDate!=="—"?`${startDate} → ${endDate}`:`${startDate!=="—"?startDate:endDate}`}
          {timelineNote&&<span style={{marginLeft:10,color:T.amber}}>· {timelineNote}</span>}
        </div>
      )}

      {/* Row 0 — Contract / Budget / Actual Spent */}
      <ProjectValueRow project={project} rawPos={rawPos}/>

      {/* Row 1 — PO strip (4 cards) */}
      <POStripProject poStats={poStats}/>

      <div style={{height:1,background:T.border,marginBottom:10}}/>

      {/* Row 2 — Billing strip (7 cards, clickable) */}
      <BillingStrip project={project} activeCard={activeCard} onCard={k=>{ setActiveCard(k); if(k) setActiveView("rail"); }}/>

      {/* Row 3 — Receivable strip */}
      <ReceivableStrip project={project} rawInvoices={rawInv||[]}/>

      {/* Row 4 — PO Payments Upcoming */}
      <POPaymentsUpcoming project={project} rawPos={rawPos}/>

      {/* View toggle */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:4}}>
          {[["rail","▤  Milestone Rail"],["table","☰  Reference Table"]].map(([v,l])=>(
            <button key={v} onClick={()=>{ setActiveView(v); setActiveCard(null); }}
              style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${activeView===v?T.olive:T.border}`,background:activeView===v?T.oliveL:T.surface,color:activeView===v?"#3d5c00":T.muted,fontSize:11,fontWeight:activeView===v?700:400,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>
        {activeView==="rail"&&(
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
            {Object.entries(STATUS_META).map(([k,m])=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:T.muted}}>
                <div style={{width:8,height:8,borderRadius:2,background:m.scheme.border,flexShrink:0}}/><span>{m.label}</span>
              </div>
            ))}
            <span style={{fontSize:10,color:T.muted,fontStyle:"italic"}}>Click any milestone to expand</span>
          </div>
        )}
      </div>

      {activeView==="rail"?(
        <>
          <div style={{overflowX:"auto",paddingBottom:6,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"flex-start",minWidth:"max-content",padding:"3px 1px 6px"}}>
              {ms.map((m,i)=>(
                <div key={m.milestone_id} style={{display:"flex",alignItems:"flex-start"}}>
                  <MilestoneCard ms={m} selected={selected===m.milestone_id} onClick={()=>toggle(m.milestone_id)}/>
                  {i<ms.length-1&&(
                    <div style={{width:20,height:2,background:T.border,marginTop:30,flexShrink:0,position:"relative"}}>
                      <div style={{position:"absolute",right:-4,top:-4,borderLeft:`5px solid ${T.border}`,borderTop:"4px solid transparent",borderBottom:"4px solid transparent"}}/>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <Drawer ms={selectedMs} project={project} onClose={()=>setSelected(null)}/>
          <BreakdownPanel type={activeCard} project={project} rawPos={rawPos}/>
        </>
      ):(
        <MilestoneTable project={project}/>
      )}

      {/* Cash Flow — collapsible, bottom */}
      <CashFlowCollapsible project={project} rawInvoices={rawInv||[]} rawPos={rawPos}/>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [joined,   setJoined]   = useState(null);
  const [rawPos,   setRawPos]   = useState([]);
  const [rawProj,  setRawProj]  = useState([]);
  const [rawInv,   setRawInv]   = useState([]);
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [activeTab,setActive]   = useState(null);
  const [lastFetch,setLastFetch]= useState(null);

  const loadData = useCallback(()=>{
    setLoading(true);
    fetch(DATA_URL)
      .then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data=>{
        const projects=data.projects||[], milestones=data.milestones||[], invoices=data.invoices||[], pos=data.pos||[];
        const joinedData=joinData(projects,milestones,invoices,pos);
        setJoined(joinedData); setRawPos(pos); setRawProj(projects); setRawInv(invoices);
        setActive(prev=>prev||joinedData[0]?.project_id||null);
        setLastFetch(new Date().toLocaleTimeString("en-IN"));
        setLoading(false); setError(null);
      })
      .catch(e=>{ setError(e.message); setLoading(false); });
  },[]);

  useEffect(()=>{ loadData(); },[loadData]);

  if(loading&&!joined) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:T.bg,gap:14,color:T.muted,fontFamily:"sans-serif"}}>
      <div style={{width:28,height:28,border:`2px solid ${T.border}`,borderTopColor:T.olive,borderRadius:"50%",animation:"spin .7s linear infinite"}}/>
      <p>Loading project data…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if(error&&!joined) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:T.bg,gap:12,fontFamily:"sans-serif"}}>
      <p style={{color:T.red,fontWeight:600}}>Could not load data</p>
      <p style={{color:T.muted,fontSize:12}}>{error}</p>
      <button onClick={loadData} style={{padding:"6px 18px",background:T.olive,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:600}}>Retry</button>
    </div>
  );

  const globalStats  = computePOStats(rawProj, rawPos, null, rawInv);
  const invStats     = computeInvoiceStats(rawInv, globalStats?.totalProjectValue||0);
  const activeProject= (joined||[]).find(p=>p.project_id===activeTab);

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{height:4px;width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}`}</style>

      <header style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"11px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"baseline",gap:10}}>
          <span style={{fontSize:16,fontWeight:700,color:T.olive,letterSpacing:".06em",fontFamily:"monospace"}}>GH2</span>
          <span style={{fontSize:12,color:T.muted}}>EPC Billing Tracker</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {lastFetch&&<span style={{fontSize:10,color:T.muted}}>Fetched {lastFetch}</span>}
          <button onClick={()=>exportNext30Days(joined||[],rawInv,rawPos)} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>Export Next 30 Days</button>
          <button onClick={loadData} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>↺ Refresh</button>
        </div>
      </header>

      <GlobalStrip stats={globalStats} invStats={invStats} rawInvoices={rawInv} rawPos={rawPos} rawProjects={rawProj}/>

      <nav style={{background:T.surface,borderBottom:`1px solid ${T.border}`,display:"flex",padding:"0 24px",overflowX:"auto"}}>
        {(joined||[]).map(p=>(
          <button key={p.project_id} onClick={()=>setActive(p.project_id)}
            style={{display:"flex",flexDirection:"column",alignItems:"flex-start",padding:"9px 16px 8px",border:"none",background:"transparent",borderBottom:`2px solid ${activeTab===p.project_id?T.olive:"transparent"}`,color:activeTab===p.project_id?T.text:T.muted,cursor:"pointer",gap:1,whiteSpace:"nowrap",transition:"all .15s"}}>
            <span style={{fontFamily:"monospace",fontSize:9,fontWeight:700,color:T.olive,letterSpacing:".06em"}}>{p.project_id}</span>
            <span style={{fontSize:11,fontWeight:600}}>{p.project_name}</span>
            {p.capacity_mwp&&<span style={{fontSize:9,color:T.muted,fontFamily:"monospace"}}>{p.capacity_mwp} MWp</span>}
          </button>
        ))}
      </nav>

      <main style={{padding:"18px 24px 40px"}}>
        {activeProject
          ? <ProjectRail key={activeProject.project_id} project={activeProject} rawPos={rawPos} rawProjects={rawProj} rawInv={rawInv}/>
          : <p style={{color:T.muted,marginTop:20}}>No project selected.</p>}
      </main>
    </div>
  );
}
