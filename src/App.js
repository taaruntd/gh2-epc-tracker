import { useState, useEffect, useCallback } from "react";

const BASE = process.env.REACT_APP_DATA_BASE || "/data";
const DATA_URL = `${BASE}/epc-data.json`;

const T = {
  bg:"#f7f9f2", surface:"#ffffff", border:"#e2ebd0",
  text:"#1a2310", muted:"#5a6b4a", olive:"#A6C83D", oliveL:"#f0f5d6",
  blue:"#3E5BA6", green:"#1AAE48", amber:"#c8a000",
  amberL:"#fefde8", amberB:"#f5e84a", red:"#c0392b",
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
      po_id:           p.po_id,
      vendor_name:     p.vendor_name || "—",
      po_type:         p.po_type || "mat",
      po_value_total:  num(p.po_value_total),
      amount_paid:     paidMap[`${p.project_id}|${p.po_id}`] || 0,
      apport_amount:   num(p.apport_amount) || null,
      delivery_status: p.delivery_status || "",
      po_status:       p.po_status || "",
    });
  });

  const msInvMap = {};
  invoices.forEach(i => {
    const ms = i.milestone_id;
    if(!ms) return;
    if(!msInvMap[ms]) msInvMap[ms] = [];
    msInvMap[ms].push(i);
  });

  return projects.map(proj => {
    const projMs = milestones
      .filter(m => m.project_id === proj.project_id)
      .sort((a,b) => Number(a.sequence)-Number(b.sequence))
      .map(ms => {
        const msInvoices = msInvMap[ms.milestone_id] || [];
        const msPOs      = msPOsMap[ms.milestone_id] || [];
        const totalReceived = msInvoices.reduce((a,i)=>a+num(i.payment_received),0);
        return { ...ms, invoices:msInvoices, pos:msPOs, payment_received:totalReceived };
      });

    const seen = new Set();
    let vendorPaid = 0;
    pos.filter(p=>p.project_id===proj.project_id).forEach(p=>{
      const key=`${p.project_id}|${p.po_id}`;
      if(!seen.has(key)){ seen.add(key); vendorPaid+=paidMap[key]||0; }
    });

    return { ...proj, milestones:projMs, vendor_paid:vendorPaid };
  });
}

// ── PO STATS — reusable for both global and per-project ───────
function computePOStats(projects, rawPos, filterProjectId = null, rawInvoices = []) {
  const filteredProj = filterProjectId
    ? projects.filter(p => p.project_id === filterProjectId)
    : projects.filter(p => p.project_status === "active");

  const projIds = new Set(filteredProj.map(p => p.project_id));

  const totalProjectValue = filteredProj.reduce((a,p) => a + num(p.contract_value_inr), 0);

  const seenTotal = new Set();
  const seenPaid  = new Set();
  let totalPOIssued = 0;
  let totalPOPaid   = 0;

  rawPos
    .filter(p => projIds.has(p.project_id))
    .forEach(p => {
      const key = `${p.project_id}|${p.po_id}`;
      if (!seenTotal.has(key)) {
        seenTotal.add(key);
        totalPOIssued += num(p.po_value_total);
      }
      if (!seenPaid.has(key) && p.amount_paid !== "" && p.amount_paid !== null) {
        seenPaid.add(key);
        totalPOPaid += num(p.amount_paid);
      }
    });

  // received from client — non-blocked invoices in scope
  const totalReceivedFromClient = rawInvoices
    .filter(i => projIds.has(i.project_id) && (i.payment_status||"").toLowerCase() !== "blocked")
    .reduce((a,i) => a + num(i.payment_received), 0);

  return {
    totalProjectValue,
    totalPOIssued,
    totalPOToIssue:          totalProjectValue - totalPOIssued,
    totalPOPaid,
    totalPOBalance:          totalPOIssued - totalPOPaid,
    totalReceivedFromClient,
  };
}

// ── INVOICE STATS ────────────────────────────────────────────
function computeInvoiceStats(rawInvoices, totalProjectValue=0) {
  // Only non-blocked invoices count toward invoiced + pending
  const active   = rawInvoices.filter(i => (i.payment_status||"").toLowerCase() !== "blocked");
  const blocked  = rawInvoices.filter(i => (i.payment_status||"").toLowerCase() === "blocked");

  const totalInvoiced = active.reduce((a,i)  => a + num(i.invoice_value), 0);
  const totalReceived = active.reduce((a,i)  => a + num(i.payment_received), 0);
  const totalBlocked  = blocked.reduce((a,i) => a + num(i.invoice_value), 0);

  return {
    totalInvoiced,
    totalReceived,
    totalPending: totalInvoiced - totalReceived,
    totalBlocked,
    totalProjectValue,
  };
}

// ── MICRO COMPONENTS ─────────────────────────────────────────
const Badge = ({text,scheme}) => {
  if(!text) return <span style={{color:T.muted,fontSize:10}}>—</span>;
  const s=scheme||resolveScheme(text);
  return <span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:9,fontWeight:600,background:s.bg,border:`1px solid ${s.border}`,color:s.text,whiteSpace:"nowrap"}}>{text}</span>;
};
const StatusBadge = ({status}) => { const m=STATUS_META[status]||STATUS_META.locked; return <Badge text={m.label} scheme={m.scheme}/>; };
const TypePill    = ({type})   => { const m=PO_TYPE_META[type]||{label:type,scheme:T.na}; return <Badge text={m.label} scheme={m.scheme}/>; };

const Stat = ({label,value,sub,accent,onClick,active}) => (
  <div
    onClick={onClick}
    style={{
      background:active?`${accent}11`:T.surface,
      border:`1px solid ${active?accent:accent+"33"}`,
      borderRadius:12,padding:"14px 16px",borderTop:`3px solid ${accent}`,
      cursor:onClick?"pointer":"default",
      transition:"all .12s",
      userSelect:"none",
    }}
  >
    <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span>{label}</span>
      {onClick&&<span style={{fontSize:9,color:active?accent:T.muted}}>{active?"▲":"▼"}</span>}
    </div>
    <div style={{fontSize:20,fontWeight:700,color:T.text,lineHeight:1,fontFamily:"monospace"}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:T.muted,marginTop:4}}>{sub}</div>}
  </div>
);

const SecLabel = ({text}) => (
  <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>{text}</div>
);
const Tbl = ({children}) => (
  <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>{children}</table>
  </div>
);
const TH = ({children,right}) => (
  <th style={{padding:"5px 9px",textAlign:right?"right":"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase",letterSpacing:".05em",whiteSpace:"nowrap",background:T.bg}}>{children}</th>
);
const TD = ({children,right,bold,color,sx}) => (
  <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:right?"right":"left",fontWeight:bold?600:400,color:color||T.text,verticalAlign:"middle",...sx}}>{children}</td>
);
const TR = ({children,i}) => <tr style={{background:i%2===0?T.bg:T.surface}}>{children}</tr>;

// ── PO STRIP — shared component for both global and per-project
function POStrip({ stats, label }) {
  if (!stats) return null;
  const pctIssued  = stats.totalProjectValue > 0
    ? ((stats.totalPOIssued   / stats.totalProjectValue) * 100).toFixed(1) : "0";
  const pctToIssue = stats.totalProjectValue > 0
    ? ((stats.totalPOToIssue  / stats.totalProjectValue) * 100).toFixed(1) : "0";
  const pctPaid    = stats.totalPOIssued > 0
    ? ((stats.totalPOPaid     / stats.totalPOIssued)    * 100).toFixed(1) : "0";
  const pctBalance = stats.totalPOIssued > 0
    ? ((stats.totalPOBalance  / stats.totalPOIssued)    * 100).toFixed(1) : "0";

  const cards = [
    { label:"Total Project Value",    value:fmtL(stats.totalProjectValue),                                   sub:"contract value",                    accent:T.olive },
    { label:"Net Outstanding",        value:fmtL(stats.totalProjectValue-(stats.totalReceivedFromClient||0)), sub:"project value − received",          accent:"#7C3AED", italic:true },
    { label:"Total PO Issued",        value:fmtL(stats.totalPOIssued),     sub:`${pctIssued}% of project value`,    accent:T.blue  },
    { label:"PO Yet to Be Issued",    value:fmtL(stats.totalPOToIssue),    sub:`${pctToIssue}% of project value`,   accent:T.amber },
    { label:"Balance to Pay Vendors", value:fmtL(stats.totalPOBalance),    sub:`${pctBalance}% of issued POs`,      accent:T.red   },
    { label:"Total Paid to Vendors",  value:fmtL(stats.totalPOPaid),       sub:`${pctPaid}% of issued POs paid`,    accent:T.green },
  ];

  return (
    <div style={{marginBottom:10}}>
      {label && (
        <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>
          {label}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
        {cards.map(c => (
          <div key={c.label} style={{
            background:T.bg, borderRadius:10,
            border:`1px solid ${c.accent}22`,
            borderLeft:`3px solid ${c.accent}`,
            padding:"11px 14px",
          }}>
            <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{c.label}</div>
            <div style={{fontSize:18,fontWeight:700,color:T.text,lineHeight:1,fontFamily:"monospace",fontStyle:c.italic?"italic":"normal"}}>{c.value}</div>
            <div style={{fontSize:10,color:T.muted,marginTop:4}}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── GLOBAL STRIP WRAPPER ──────────────────────────────────────
function GlobalStrip({ stats, invStats }) {
  if (!stats) return null;
  return (
    <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"14px 24px"}}>
      <POStrip stats={stats} label="Portfolio Overview — All Active Projects"/>
      {invStats && (
        <>
          <div style={{height:1,background:T.border,margin:"12px 0"}}/>
          <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>
            Invoicing Overview — All Active Projects
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[
              {label:"Total Invoiced to Client",  value:fmtL(invStats.totalInvoiced), sub:"excl. blocked invoices",         accent:T.blue},
              {label:"Total Received from Client", value:fmtL(invStats.totalReceived), sub:"payments collected",            accent:T.green},
              {label:"Pending from Client",        value:fmtL(invStats.totalPending),  sub:"clean — collectible",           accent:T.amber},
              {label:"Blocked Invoices",           value:invStats.totalBlocked>0?fmtL(invStats.totalBlocked):"—", sub:"stuck — needs action", accent:T.red},
                          ].map(c=>(
              <div key={c.label} style={{background:T.bg,borderRadius:10,border:`1px solid ${c.accent}22`,borderLeft:`3px solid ${c.accent}`,padding:"11px 14px"}}>
                <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{c.label}</div>
                <div style={{fontSize:18,fontWeight:700,color:T.text,lineHeight:1,fontFamily:"monospace",fontStyle:c.italic?"italic":"normal"}}>{c.value}</div>
                <div style={{fontSize:10,color:T.muted,marginTop:4}}>{c.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── BILLING STRIP (per project) ───────────────────────────────
function BillingStrip({ project, activeCard, onCard }) {
  const ms = project.milestones || [];

  const allInvs     = ms.flatMap(m => m.invoices || []);
  const activeInvs  = allInvs.filter(i => (i.payment_status||"").toLowerCase() !== "blocked");
  const blockedInvs = allInvs.filter(i => (i.payment_status||"").toLowerCase() === "blocked");

  const billed   = activeInvs.reduce((a,i)  => a + num(i.invoice_value), 0);
  const received = activeInvs.reduce((a,i)  => a + num(i.payment_received), 0);
  const pending  = billed - received;
  const blocked  = blockedInvs.reduce((a,i) => a + num(i.invoice_value), 0);
  const soon     = ms.filter(m=>m.status==="soon").reduce((a,m)=>a+num(m.milestone_amount),0);
  const locked   = ms.filter(m=>m.status==="locked").reduce((a,m)=>a+num(m.milestone_amount),0);

  const tog = key => onCard(activeCard===key?null:key);

  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10,marginBottom:10}}>
      <Stat label="Vendor outgoing"     value={fmtL(project.vendor_paid)}     sub="paid to vendors"          accent={T.red}   onClick={()=>tog("outgoing")} active={activeCard==="outgoing"} />
      <Stat label="Invoiced to client"  value={billed>0?fmtL(billed):"—"}     sub="excl. blocked invoices"   accent={T.blue}  onClick={()=>tog("invoiced")} active={activeCard==="invoiced"} />
      <Stat label="Payment received"    value={received>0?fmtL(received):"—"} sub="collected from client"    accent={T.green} onClick={()=>tog("received")} active={activeCard==="received"} />
      <Stat label="Pending from client" value={pending>0?fmtL(pending):"—"}   sub="clean — collectible"      accent={T.amber} onClick={()=>tog("pending")}  active={activeCard==="pending"}  />
      <Stat label="Blocked invoices"    value={blocked>0?fmtL(blocked):"—"}   sub="stuck — needs action"     accent={T.red}   onClick={()=>tog("blocked")}  active={activeCard==="blocked"}  />
      <Stat label="Ready to bill"       value={fmtL(soon)}                    sub="invoice this week"        accent={T.amber} onClick={()=>tog("soon")}     active={activeCard==="soon"}     />
      <Stat label="Locked (future)"     value={fmtL(locked)}                  sub="work pending"             accent={T.muted} onClick={()=>tog("locked")}   active={activeCard==="locked"}   />
    </div>
  );
}

// ── MILESTONE CARD ────────────────────────────────────────────
function MilestoneCard({ms,selected,onClick}) {
  const s=STATUS_META[ms.status]||STATUS_META.locked;
  return (
    <div onClick={onClick} role="button" tabIndex={0} onKeyDown={e=>e.key==="Enter"&&onClick()} aria-pressed={selected}
      style={{width:144,background:selected?T.oliveL:T.surface,border:`1px solid ${selected?T.olive:T.border}`,
              borderLeft:`3px solid ${s.scheme.border}`,borderRadius:8,padding:"9px 10px 8px",
              cursor:"pointer",transition:"all .12s",outline:"none"}}>
      <div style={{fontFamily:"monospace",fontSize:8,color:T.muted,marginBottom:2,fontWeight:700,letterSpacing:".04em"}}>{ms.letter||`M${ms.sequence}`}</div>
      <div style={{fontSize:10,fontWeight:600,color:T.text,lineHeight:1.35,marginBottom:5,minHeight:26}}>{ms.milestone_name}</div>
      <StatusBadge status={ms.status}/>
      <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:T.text,marginTop:4}}>{fmtL(ms.milestone_amount)}</div>
      <div style={{fontSize:8,color:T.muted,fontFamily:"monospace",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
        {ms.invoices?.[0]?.invoice_no&&ms.invoices[0].invoice_no!=="—"
          ? ms.invoices[0].invoice_no.split("+")[0].trim() : "No invoice yet"}
      </div>
      {ms.work_pct&&ms.work_pct!=="0%"&&
        <div style={{fontSize:8,color:T.muted,marginTop:2,fontFamily:"monospace"}}>{ms.work_pct}</div>}
    </div>
  );
}

// ── DRAWER ────────────────────────────────────────────────────
function Drawer({ms,project,onClose}) {
  if(!ms) return null;
  const s=STATUS_META[ms.status]||STATUS_META.locked;
  const pos =ms.pos    ||[];
  const invs=ms.invoices||[];
  const subs=ms.subs   ||[];
  const totalInvoiced=invs.reduce((a,i)=>a+num(i.invoice_value),0);
  const totalReceived=invs.reduce((a,i)=>a+num(i.payment_received),0);
  const totalPaid    =pos.reduce((a,p)=>a+p.amount_paid,0);
  const totalBal     =pos.reduce((a,p)=>a+(p.po_value_total-p.amount_paid),0);

  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:`3px solid ${s.scheme.border}`,borderRadius:12,overflow:"hidden",marginTop:14,animation:"slideIn .14s ease-out"}}>
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{padding:"11px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}}>
            {ms.letter?`Milestone ${ms.letter.toUpperCase()}`:`Milestone ${ms.sequence}`} — {ms.milestone_name}
          </div>
          <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:6,fontSize:10,color:T.muted}}>
            <span>{project.project_name}</span><span>·</span>
            <StatusBadge status={ms.status}/><span>·</span>
            <span style={{fontFamily:"monospace"}}>{fmtPct(ms.pct_of_contract)} of contract</span><span>·</span>
            <span style={{fontFamily:"monospace"}}>{ms.work_pct||"—"} done</span>
            {totalReceived>0&&<><span>·</span><Badge text={`Received ${fmtL(totalReceived)}`} scheme={T.done}/></>}
          </div>
          {ms.blocker&&(
            <div style={{marginTop:8,background:T.amberL,border:`1px solid ${T.amberB}`,borderRadius:6,padding:"6px 10px",fontSize:10,color:T.amber,display:"flex",alignItems:"flex-start",gap:6}}>
              <span>⚠</span><span>{ms.blocker}</span>
            </div>
          )}
        </div>
        <button onClick={onClose} style={{fontSize:10,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 9px",cursor:"pointer",flexShrink:0,marginLeft:12}}>✕ close</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:`1px solid ${T.border}`}}>
        <div style={{padding:"12px 16px",borderRight:`1px solid ${T.border}`}}>
          <SecLabel text="Invoice & Payment"/>
          <div style={{display:"grid",gridTemplateColumns:"auto 1fr",fontSize:11}}>
            {[
              ["Milestone value",  <span style={{fontFamily:"monospace",fontWeight:700,color:T.blue}}>{fmtL(ms.milestone_amount)}</span>],
              ["% of contract",    <span style={{fontFamily:"monospace"}}>{fmtPct(ms.pct_of_contract)}</span>],
              ["Total invoiced",   <span style={{fontFamily:"monospace",fontWeight:700,color:totalInvoiced>0?T.blue:T.muted}}>{totalInvoiced>0?fmtL(totalInvoiced):"Not raised"}</span>],
              ["Payment received", <span style={{fontFamily:"monospace",color:totalReceived>0?T.green:T.muted}}>{totalReceived>0?fmtL(totalReceived):"Not received"}</span>],
              ["Work done",        <span style={{fontFamily:"monospace"}}>{ms.work_pct||"—"}</span>],
              ["Certified by",     <span>{ms.certified_by||"—"}</span>],
              ["Last updated",     <span>{ms.last_updated||"—"}</span>],
            ].map(([k,v],i)=>(
              <>
                <div key={`k${i}`} style={{padding:"4px 0",borderBottom:`1px solid ${T.border}`,color:T.muted,paddingRight:14}}>{k}</div>
                <div key={`v${i}`} style={{padding:"4px 0",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontWeight:500,color:T.text}}>{v}</div>
              </>
            ))}
          </div>
        </div>
        <div style={{padding:"12px 16px"}}>
          <SecLabel text={`Sub-items (${subs.length})`}/>
          {subs.length>0 ? subs.map((s,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"baseline",padding:"5px 0",borderBottom:`1px solid ${T.border}`,fontSize:11}}>
              <span style={{color:T.muted}}>{s.name}{s.note&&<span style={{color:T.amber,fontSize:9}}> ({s.note})</span>}</span>
              <span style={{fontFamily:"monospace",fontSize:9,color:T.muted}}>{s.pct>0?fmtPct(s.pct):""}</span>
              <span style={{fontFamily:"monospace",fontWeight:600}}>{s.amt>0?fmtL(s.amt):"—"}</span>
            </div>
          )) : <p style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>No sub-items defined.</p>}
        </div>
      </div>

      <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`}}>
        <SecLabel text={`Invoices raised (${invs.length})`}/>
        {invs.length>0 ? (
          <Tbl>
            <thead><tr>
              <TH>Invoice No.</TH><TH>Type</TH><TH>Description</TH><TH>Date</TH>
              <TH right>Value</TH><TH>Sched. Pay</TH><TH right>Received</TH><TH>Status</TH>
            </tr></thead>
            <tbody>
              {invs.map((inv,i)=>(
                <TR key={i} i={i}>
                  <TD bold sx={{fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</TD>
                  <TD><Badge text={inv.invoice_type} scheme={resolveScheme(inv.invoice_type)}/></TD>
                  <TD color={T.muted} sx={{fontSize:10,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.description||"—"}</TD>
                  <TD color={T.muted} sx={{fontSize:10}}>{excelDate(inv.invoice_date)}</TD>
                  <TD right bold sx={{fontFamily:"monospace",color:T.blue}}>{fmtL(inv.invoice_value)}</TD>
                  <TD color={T.muted} sx={{fontSize:10}}>{excelDate(inv.sched_pay_date)}</TD>
                  <TD right sx={{fontFamily:"monospace",color:num(inv.payment_received)>0?T.green:T.muted}}>
                    {num(inv.payment_received)>0?fmtL(inv.payment_received):"—"}
                  </TD>
                  <TD><Badge text={inv.payment_status} scheme={resolveScheme(inv.payment_status)}/></TD>
                </TR>
              ))}
              {invs.length>1&&(
                <tr style={{background:T.oliveL}}>
                  <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".05em"}}>Total — {invs.length} invoices</td>
                  <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.blue}}>{fmtL(totalInvoiced)}</td>
                  <td/><td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:totalReceived>0?T.green:T.muted}}>{totalReceived>0?fmtL(totalReceived):"—"}</td><td/>
                </tr>
              )}
            </tbody>
          </Tbl>
        ) : (
          <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"9px 12px",fontSize:11,color:T.muted,fontStyle:"italic"}}>
            No invoices raised yet for this milestone.
          </div>
        )}
      </div>

      <div style={{padding:"12px 16px"}}>
        <SecLabel text={`Linked vendor POs (${pos.length})`}/>
        {pos.length>0 ? (
          <>
            <Tbl>
              <thead><tr>
                <TH>PO No.</TH><TH>Vendor</TH><TH>Type</TH>
                <TH right>Apport./Share</TH><TH right>PO Total</TH>
                <TH right>Paid</TH><TH right>Balance</TH><TH>Delivery</TH>
              </tr></thead>
              <tbody>
                {pos.map((p,i)=>{
                  const bal=p.po_value_total-p.amount_paid;
                  return (
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
                  );
                })}
                {pos.length>1&&(
                  <tr style={{background:T.oliveL}}>
                    <td colSpan={3} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".05em"}}>Total — {pos.length} POs</td>
                    <td/><td/>
                    <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL(totalPaid)}</td>
                    <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL(totalBal)}</td>
                    <td/>
                  </tr>
                )}
              </tbody>
            </Tbl>
            {pos.some(p=>p.po_type==="ic")&&(
              <p style={{fontSize:9,color:T.muted,marginTop:6,fontStyle:"italic"}}>
                I&amp;C POs span all milestones — Apport./Share shows amount allocated to this milestone only. Balance is total PO balance.
              </p>
            )}
          </>
        ) : (
          <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,padding:"9px 12px",fontSize:11,color:T.muted,fontStyle:"italic"}}>
            No vendor POs mapped for this milestone yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ── BREAKDOWN PANEL ──────────────────────────────────────────
function BreakdownPanel({ type, project, rawPos }) {
  if (!type) return null;

  const ms      = project.milestones || [];
  const allInvs = ms.flatMap(m => m.invoices || []);
  const today   = new Date();
  const age     = d => {
    if (!d || d === "—") return "—";
    const s = String(d).trim();
    let dt;
    if (/^\d+$/.test(s) && Number(s) > 1000) {
      dt = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    } else {
      const parts = s.split("-");
      if (parts.length !== 3) return "—";
      const mo = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      const yr = parts[2].length===2 ? 2000+Number(parts[2]) : Number(parts[2]);
      dt = new Date(yr, mo[parts[1]], Number(parts[0]));
    }
    const days = Math.floor((today - dt) / 86400000);
    return isNaN(days) ? "—" : `${days}d`;
  };

  const fmtL2 = v => {
    const n = Number(v);
    if (!v && v!==0) return "—";
    if (n>=1e7) return `₹${(n/1e7).toFixed(2)} Cr`;
    if (n>=1e5) return `₹${(n/1e5).toFixed(1)}L`;
    if (n>=1e3) return `₹${(n/1e3).toFixed(1)}k`;
    return `₹${n.toLocaleString("en-IN")}`;
  };

  // section title + accent colour
  const meta = {
    invoiced: { title:"Invoiced to Client",   accent:T.blue  },
    received: { title:"Payment Received",     accent:T.green },
    pending:  { title:"Pending from Client",  accent:T.amber },
    blocked:  { title:"Blocked Invoices",     accent:T.red   },
    outgoing: { title:"Vendor Outgoing",      accent:T.red   },
    soon:     { title:"Ready to Bill",        accent:T.amber },
    locked:   { title:"Locked (Future)",      accent:T.muted },
  }[type];

  const thStyle = (right) => ({
    padding:"5px 9px", textAlign:right?"right":"left",
    fontSize:9, fontWeight:700, color:T.muted,
    borderBottom:`2px solid ${T.border}`,
    textTransform:"uppercase", letterSpacing:".05em",
    whiteSpace:"nowrap", background:T.bg,
  });
  const tdStyle = (right, color) => ({
    padding:"7px 9px", borderBottom:`1px solid ${T.border}`,
    textAlign:right?"right":"left",
    color:color||T.text, verticalAlign:"middle", fontSize:11,
  });
  const trBg = (i) => i%2===0?T.bg:T.surface;

  let content = null;

  // ── INVOICED TO CLIENT ────────────────────────────────────
  if (type === "invoiced") {
    const rows = allInvs.filter(i=>(i.payment_status||"").toLowerCase()!=="blocked");
    content = rows.length === 0
      ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No invoices raised.</p>
      : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>
            <th style={thStyle()}>Invoice No.</th>
            <th style={thStyle()}>Milestone</th>
            <th style={thStyle()}>Description</th>
            <th style={thStyle()}>Date</th>
            <th style={thStyle(true)}>Value</th>
            <th style={thStyle()}>Status</th>
          </tr></thead>
          <tbody>
            {rows.map((inv,i)=>(
              <tr key={i} style={{background:trBg(i)}}>
                <td style={{...tdStyle(),fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{inv.milestone_id}</td>
                <td style={{...tdStyle(),maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{inv.description||"—"}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{excelDate(inv.invoice_date)}</td>
                <td style={{...tdStyle(true),fontFamily:"monospace",fontWeight:600,color:T.blue}}>{fmtL2(inv.invoice_value)}</td>
                <td style={tdStyle()}><span style={{fontSize:9,fontWeight:600,padding:"2px 7px",borderRadius:20,background:T.avail.bg,border:`1px solid ${T.avail.border}`,color:T.avail.text}}>{inv.payment_status}</span></td>
              </tr>
            ))}
            {rows.length>1&&(
              <tr style={{background:T.oliveL}}>
                <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total — {rows.length} invoices</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.blue}}>{fmtL2(rows.reduce((a,i)=>a+num(i.invoice_value),0))}</td>
                <td/>
              </tr>
            )}
          </tbody>
        </table></div>;
  }

  // ── PAYMENT RECEIVED ──────────────────────────────────────
  if (type === "received") {
    const rows = allInvs.filter(i=>num(i.payment_received)>0);
    content = rows.length === 0
      ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No payments received yet.</p>
      : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>
            <th style={thStyle()}>Invoice No.</th>
            <th style={thStyle()}>Milestone</th>
            <th style={thStyle()}>Invoice Date</th>
            <th style={thStyle(true)}>Invoice Value</th>
            <th style={thStyle(true)}>Received</th>
            <th style={thStyle()}>Payment Date</th>
          </tr></thead>
          <tbody>
            {rows.map((inv,i)=>(
              <tr key={i} style={{background:trBg(i)}}>
                <td style={{...tdStyle(),fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{inv.milestone_id}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{excelDate(inv.invoice_date)}</td>
                <td style={{...tdStyle(true),fontFamily:"monospace",color:T.muted}}>{fmtL2(inv.invoice_value)}</td>
                <td style={{...tdStyle(true),fontFamily:"monospace",fontWeight:600,color:T.green}}>{fmtL2(inv.payment_received)}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{excelDate(inv.payment_date)}</td>
              </tr>
            ))}
            {rows.length>1&&(
              <tr style={{background:T.oliveL}}>
                <td colSpan={3} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total received</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.muted}}>{fmtL2(rows.reduce((a,i)=>a+num(i.invoice_value),0))}</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL2(rows.reduce((a,i)=>a+num(i.payment_received),0))}</td>
                <td/>
              </tr>
            )}
          </tbody>
        </table></div>;
  }

  // ── PENDING FROM CLIENT ───────────────────────────────────
  if (type === "pending") {
    const rows = allInvs.filter(i=>{
      const st=(i.payment_status||"").toLowerCase();
      return st!=="blocked" && st!=="received" && num(i.invoice_value)>num(i.payment_received);
    });
    content = rows.length === 0
      ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No pending invoices.</p>
      : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>
            <th style={thStyle()}>Invoice No.</th>
            <th style={thStyle()}>Milestone</th>
            <th style={thStyle()}>Description</th>
            <th style={thStyle()}>Invoice Date</th>
            <th style={thStyle()}>Sched. Pay</th>
            <th style={thStyle(true)}>Value</th>
            <th style={thStyle(true)}>Received</th>
            <th style={thStyle(true)}>Outstanding</th>
            <th style={thStyle(true)}>Age</th>
          </tr></thead>
          <tbody>
            {rows.map((inv,i)=>{
              const outstanding = num(inv.invoice_value)-num(inv.payment_received);
              const invAge = age(inv.invoice_date);
              return (
                <tr key={i} style={{background:trBg(i)}}>
                  <td style={{...tdStyle(),fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</td>
                  <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{inv.milestone_id}</td>
                  <td style={{...tdStyle(),maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{inv.description||"—"}</td>
                  <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{excelDate(inv.invoice_date)}</td>
                  <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{excelDate(inv.sched_pay_date)}</td>
                  <td style={{...tdStyle(true),fontFamily:"monospace",color:T.muted}}>{fmtL2(inv.invoice_value)}</td>
                  <td style={{...tdStyle(true),fontFamily:"monospace",color:T.green}}>{num(inv.payment_received)>0?fmtL2(inv.payment_received):"—"}</td>
                  <td style={{...tdStyle(true),fontFamily:"monospace",fontWeight:600,color:T.amber}}>{fmtL2(outstanding)}</td>
                  <td style={{...tdStyle(true),fontFamily:"monospace",color:invAge!=="—"&&Number(invAge.replace("d",""))>30?T.red:T.muted,fontSize:10}}>{invAge}</td>
                </tr>
              );
            })}
            {rows.length>1&&(
              <tr style={{background:T.oliveL}}>
                <td colSpan={5} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total outstanding</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.muted}}>{fmtL2(rows.reduce((a,i)=>a+num(i.invoice_value),0))}</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL2(rows.reduce((a,i)=>a+num(i.payment_received),0))}</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL2(rows.reduce((a,i)=>a+(num(i.invoice_value)-num(i.payment_received)),0))}</td>
                <td/>
              </tr>
            )}
          </tbody>
        </table></div>;
  }

  // ── BLOCKED INVOICES ──────────────────────────────────────
  if (type === "blocked") {
    const rows = allInvs.filter(i=>(i.payment_status||"").toLowerCase()==="blocked");
    content = rows.length === 0
      ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No blocked invoices.</p>
      : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>
            <th style={thStyle()}>Invoice No.</th>
            <th style={thStyle()}>Milestone</th>
            <th style={thStyle()}>Description</th>
            <th style={thStyle()}>Date</th>
            <th style={thStyle(true)}>Value</th>
            <th style={thStyle()}>Blocker / Remarks</th>
          </tr></thead>
          <tbody>
            {rows.map((inv,i)=>{
              // get blocker from milestone
              const msObj = ms.find(m=>m.milestone_id===inv.milestone_id);
              const blocker = inv.remarks || msObj?.blocker || "—";
              return (
                <tr key={i} style={{background:trBg(i)}}>
                  <td style={{...tdStyle(),fontFamily:"monospace",fontSize:10}}>{inv.invoice_no}</td>
                  <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{inv.milestone_id}</td>
                  <td style={{...tdStyle(),maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{inv.description||"—"}</td>
                  <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{excelDate(inv.invoice_date)}</td>
                  <td style={{...tdStyle(true),fontFamily:"monospace",fontWeight:600,color:T.red}}>{fmtL2(inv.invoice_value)}</td>
                  <td style={{...tdStyle(),fontSize:10,color:T.amber,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{blocker}</td>
                </tr>
              );
            })}
            {rows.length>1&&(
              <tr style={{background:T.oliveL}}>
                <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total blocked</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.red}}>{fmtL2(rows.reduce((a,i)=>a+num(i.invoice_value),0))}</td>
                <td/>
              </tr>
            )}
          </tbody>
        </table></div>;
  }

  // ── VENDOR OUTGOING ───────────────────────────────────────
  if (type === "outgoing") {
    // unique POs for this project from rawPos
    const seen = new Set();
    const uniquePOs = [];
    rawPos.filter(p=>p.project_id===project.project_id).forEach(p=>{
      const key=`${p.project_id}|${p.po_id}`;
      if(!seen.has(key)){ seen.add(key); uniquePOs.push(p); }
    });
    const rows = uniquePOs.filter(p=>num(p.amount_paid)>0);
    content = rows.length === 0
      ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No vendor payments made yet.</p>
      : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>
            <th style={thStyle()}>PO No.</th>
            <th style={thStyle()}>Vendor</th>
            <th style={thStyle()}>Description</th>
            <th style={thStyle()}>Type</th>
            <th style={thStyle(true)}>PO Total</th>
            <th style={thStyle(true)}>Paid</th>
            <th style={thStyle(true)}>Balance</th>
            <th style={thStyle()}>Delivery</th>
          </tr></thead>
          <tbody>
            {rows.map((p,i)=>{
              const bal=num(p.po_value_total)-num(p.amount_paid);
              const tm=PO_TYPE_META[p.po_type]||{label:p.po_type,scheme:T.na};
              return (
                <tr key={i} style={{background:trBg(i)}}>
                  <td style={{...tdStyle(),fontFamily:"monospace",fontSize:9,color:T.muted}}>{p.po_id}</td>
                  <td style={{...tdStyle(),maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.vendor_name}</td>
                  <td style={{...tdStyle(),maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.muted,fontSize:10}}>{p.work_description||"—"}</td>
                  <td style={tdStyle()}><span style={{fontSize:8,fontWeight:600,padding:"2px 6px",borderRadius:20,background:tm.scheme.bg,border:`1px solid ${tm.scheme.border}`,color:tm.scheme.text}}>{tm.label}</span></td>
                  <td style={{...tdStyle(true),fontFamily:"monospace",color:T.muted}}>{fmtL2(p.po_value_total)}</td>
                  <td style={{...tdStyle(true),fontFamily:"monospace",fontWeight:600,color:T.green}}>{fmtL2(p.amount_paid)}</td>
                  <td style={{...tdStyle(true),fontFamily:"monospace",color:bal>0?T.amber:T.green}}>{fmtL2(bal)}</td>
                  <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{p.delivery_status||"—"}</td>
                </tr>
              );
            })}
            {rows.length>1&&(
              <tr style={{background:T.oliveL}}>
                <td colSpan={4} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.muted}}>{fmtL2(rows.reduce((a,p)=>a+num(p.po_value_total),0))}</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL2(rows.reduce((a,p)=>a+num(p.amount_paid),0))}</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL2(rows.reduce((a,p)=>a+(num(p.po_value_total)-num(p.amount_paid)),0))}</td>
                <td/>
              </tr>
            )}
          </tbody>
        </table></div>;
  }

  // ── READY TO BILL (soon milestones) ───────────────────────
  if (type === "soon") {
    const rows = ms.filter(m=>m.status==="soon");
    content = rows.length === 0
      ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No milestones ready to bill.</p>
      : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>
            <th style={thStyle()}>Milestone</th>
            <th style={thStyle()}>Name</th>
            <th style={thStyle()}>Category</th>
            <th style={thStyle(true)}>Milestone Value</th>
            <th style={thStyle()}>Work Done</th>
            <th style={thStyle()}>Blocker / Note</th>
          </tr></thead>
          <tbody>
            {rows.map((m,i)=>(
              <tr key={i} style={{background:trBg(i)}}>
                <td style={{...tdStyle(),fontFamily:"monospace",fontSize:10,fontWeight:600}}>{m.letter||m.sequence}</td>
                <td style={tdStyle()}>{m.milestone_name}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{m.category||"—"}</td>
                <td style={{...tdStyle(true),fontFamily:"monospace",fontWeight:600,color:T.amber}}>{fmtL2(m.milestone_amount)}</td>
                <td style={{...tdStyle(),fontFamily:"monospace",fontSize:10}}>{m.work_pct||"—"}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.amber,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.blocker||"—"}</td>
              </tr>
            ))}
            {rows.length>1&&(
              <tr style={{background:T.oliveL}}>
                <td colSpan={3} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total ready to bill</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL2(rows.reduce((a,m)=>a+num(m.milestone_amount),0))}</td>
                <td colSpan={2}/>
              </tr>
            )}
          </tbody>
        </table></div>;
  }

  // ── LOCKED MILESTONES ─────────────────────────────────────
  if (type === "locked") {
    const rows = ms.filter(m=>m.status==="locked");
    content = rows.length === 0
      ? <p style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"8px 0"}}>No locked milestones.</p>
      : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>
            <th style={thStyle()}>Milestone</th>
            <th style={thStyle()}>Name</th>
            <th style={thStyle()}>Category</th>
            <th style={thStyle(true)}>Value</th>
            <th style={thStyle()}>Work Done</th>
            <th style={thStyle()}>Note</th>
          </tr></thead>
          <tbody>
            {rows.map((m,i)=>(
              <tr key={i} style={{background:trBg(i)}}>
                <td style={{...tdStyle(),fontFamily:"monospace",fontSize:10,fontWeight:600}}>{m.letter||m.sequence}</td>
                <td style={tdStyle()}>{m.milestone_name}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.muted}}>{m.category||"—"}</td>
                <td style={{...tdStyle(true),fontFamily:"monospace",color:T.muted}}>{fmtL2(m.milestone_amount)}</td>
                <td style={{...tdStyle(),fontFamily:"monospace",fontSize:10,color:T.muted}}>{m.work_pct||"—"}</td>
                <td style={{...tdStyle(),fontSize:10,color:T.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.blocker||"—"}</td>
              </tr>
            ))}
            {rows.length>1&&(
              <tr style={{background:T.oliveL}}>
                <td colSpan={3} style={{padding:"6px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>Total locked</td>
                <td style={{padding:"6px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.muted}}>{fmtL2(rows.reduce((a,m)=>a+num(m.milestone_amount),0))}</td>
                <td colSpan={2}/>
              </tr>
            )}
          </tbody>
        </table></div>;
  }

  return (
    <div style={{
      background:T.surface, border:`1px solid ${meta.accent}33`,
      borderLeft:`3px solid ${meta.accent}`,
      borderRadius:12, overflow:"hidden",
      marginTop:14, animation:"slideIn .14s ease-out",
    }}>
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:11,fontWeight:700,color:T.text}}>{meta.title}</div>
        <div style={{fontSize:9,color:T.muted,fontStyle:"italic"}}>Click card again to close</div>
      </div>
      <div style={{padding:"12px 16px"}}>{content}</div>
    </div>
  );
}

// ── PROJECT RAIL ──────────────────────────────────────────────
// ── MILESTONE REFERENCE TABLE ────────────────────────────────
function MilestoneTable({ project }) {
  const ms = project.milestones || [];
  const ss = {
    billed:  {bg:"#eef1f9",border:"#a0b4e0",text:"#2a3f7a"},
    blocked: {bg:"#fef2f2",border:"#f5a5a5",text:"#c0392b"},
    soon:    {bg:"#fefde8",border:"#f5e84a",text:"#8a7000"},
    locked:  {bg:"#f5f5f5",border:"#d0d0d0",text:"#666666"},
  };
  const tot    = ms.reduce((a,m)=>a+num(m.milestone_amount),0);
  const billed = ms.filter(m=>["billed","blocked"].includes(m.status)).reduce((a,m)=>a+num(m.milestone_amount),0);
  const soon   = ms.filter(m=>m.status==="soon").reduce((a,m)=>a+num(m.milestone_amount),0);
  const locked = ms.filter(m=>m.status==="locked").reduce((a,m)=>a+num(m.milestone_amount),0);
  const th = (t,right,center) => (
    <th key={t} style={{padding:"7px 9px",textAlign:right?"right":center?"center":"left",fontSize:9,fontWeight:700,color:T.muted,borderBottom:`2px solid ${T.border}`,textTransform:"uppercase",letterSpacing:".05em",whiteSpace:"nowrap",background:T.bg}}>{t}</th>
  );
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {[
          {l:"Total Contract Value",v:fmtL(tot),   a:T.olive},
          {l:"Submitted",           v:fmtL(billed),a:T.blue},
          {l:"Ready to Bill",       v:fmtL(soon),  a:T.amber},
          {l:"Locked (Future)",     v:fmtL(locked),a:T.muted},
        ].map(c=>(
          <div key={c.l} style={{background:T.surface,borderRadius:10,border:`1px solid ${c.a}22`,borderLeft:`3px solid ${c.a}`,padding:"11px 14px"}}>
            <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>{c.l}</div>
            <div style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:"monospace"}}>{c.v}</div>
          </div>
        ))}
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr>
              {th("#",false,true)}{th("Milestone ID")}{th("Name")}
              {th("Category",false,true)}{th("% Contract",false,true)}{th("Value",true)}
              {th("Status",false,true)}{th("Work %",false,true)}{th("Invoice No.")}
              {th("Inv. Value",true)}{th("Received",true)}{th("Outstanding",true)}{th("Blocker")}
            </tr></thead>
            <tbody>
              {ms.map((m,i)=>{
                const s=ss[m.status]||ss.locked;
                const invs=m.invoices||[];
                const iVal=invs.reduce((a,v)=>a+num(v.invoice_value),0);
                const iRec=invs.reduce((a,v)=>a+num(v.payment_received),0);
                const out=iVal-iRec;
                const nos=invs.map(v=>v.invoice_no).filter(n=>n&&n!=="—").join(", ")||"—";
                const rb=i%2===0?T.bg:T.surface;
                return (
                  <tr key={m.milestone_id} style={{background:rb}}>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontFamily:"monospace",fontSize:10,color:T.muted,fontWeight:600}}>{m.sequence}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9,color:T.muted,whiteSpace:"nowrap"}}>{m.milestone_id}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontWeight:500,minWidth:180}}>{m.milestone_name}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontSize:10,color:T.muted}}>{m.category||"—"}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontFamily:"monospace",fontSize:10}}>{m.pct_of_contract?fmtPct(m.pct_of_contract):"—"}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:600}}>{fmtL(m.milestone_amount)}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center"}}>
                      <span style={{fontSize:9,fontWeight:600,padding:"2px 8px",borderRadius:20,background:s.bg,border:`1px solid ${s.border}`,color:s.text,whiteSpace:"nowrap"}}>{STATUS_META[m.status]?.label||m.status}</span>
                    </td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontFamily:"monospace",fontSize:10,color:T.muted}}>{m.work_pct||"—"}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontFamily:"monospace",fontSize:9,color:T.muted,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nos}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",color:iVal>0?T.blue:T.muted}}>{iVal>0?fmtL(iVal):"—"}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",color:iRec>0?T.green:T.muted}}>{iRec>0?fmtL(iRec):"—"}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,textAlign:"right",fontFamily:"monospace",fontWeight:out>0?600:400,color:out>0?T.amber:T.muted}}>{out>0?fmtL(out):"—"}</td>
                    <td style={{padding:"7px 9px",borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.amber,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.blocker||"—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{background:T.oliveL}}>
                <td colSpan={5} style={{padding:"7px 9px",fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase"}}>TOTAL — {ms.length} milestones</td>
                <td style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700}}>{fmtL(tot)}</td>
                <td colSpan={3}/>
                <td style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.blue}}>{fmtL(ms.reduce((a,m)=>{const x=m.invoices||[];return a+x.reduce((b,i)=>b+num(i.invoice_value),0);},0))}</td>
                <td style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.green}}>{fmtL(ms.reduce((a,m)=>{const x=m.invoices||[];return a+x.reduce((b,i)=>b+num(i.payment_received),0);},0))}</td>
                <td style={{padding:"7px 9px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:T.amber}}>{fmtL(ms.reduce((a,m)=>{const x=m.invoices||[];const v=x.reduce((b,i)=>b+num(i.invoice_value),0);const r=x.reduce((b,i)=>b+num(i.payment_received),0);return a+(v-r);},0))}</td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProjectRail({ project, rawPos, rawProjects, rawInv }) {
  const [selected,   setSelected]   = useState(null);
  const [activeCard, setActiveCard] = useState(null);
  const [activeView, setActiveView] = useState("rail");
  const ms         = project.milestones || [];
  const selectedMs = ms.find(m => m.milestone_id === selected);
  const toggle     = id => setSelected(prev => prev===id ? null : id);

  // per-project PO stats
  const poStats = computePOStats(rawProjects, rawPos, project.project_id, rawInv||[]);

  return (
    <div>
      {/* PO strip — project-scoped */}
      <POStrip stats={poStats} label={`PO Overview — ${project.project_name}`}/>

      {/* divider */}
      <div style={{height:1,background:T.border,marginBottom:10}}/>

      {/* Billing strip */}
      <BillingStrip project={project} activeCard={activeCard} onCard={k=>{ setActiveCard(k); if(k) setActiveView("rail"); }}/>

      {/* View toggle + legend */}
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

      {activeView==="rail" ? (
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
      ) : (
        <MilestoneTable project={project}/>
      )}
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
        const projects   = data.projects   || [];
        const milestones = data.milestones || [];
        const invoices   = data.invoices   || [];
        const pos        = data.pos        || [];
        const joinedData = joinData(projects, milestones, invoices, pos);
        setJoined(joinedData);
        setRawPos(pos);
        setRawProj(projects);
        setRawInv(invoices);
        setActive(prev => prev || joinedData[0]?.project_id || null);
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

  const globalStats   = computePOStats(rawProj, rawPos, null, rawInv);
  const invStats      = computeInvoiceStats(rawInv, globalStats?.totalProjectValue||0);
  const activeProject = (joined||[]).find(p=>p.project_id===activeTab);

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
          <button onClick={loadData} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>↺ Refresh</button>
        </div>
      </header>

      {/* GLOBAL STRIP */}
      <GlobalStrip stats={globalStats} invStats={invStats}/>

      {/* PROJECT TABS */}
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
          ? <ProjectRail
              key={activeProject.project_id}
              project={activeProject}
              rawPos={rawPos}
              rawProjects={rawProj}
              rawInv={rawInv}
            />
          : <p style={{color:T.muted,marginTop:20}}>No project selected.</p>}
      </main>
    </div>
  );
}
