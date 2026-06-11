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
function computePOStats(projects, rawPos, filterProjectId = null) {
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

  return {
    totalProjectValue,
    totalPOIssued,
    totalPOToIssue: totalProjectValue - totalPOIssued,
    totalPOPaid,
    totalPOBalance: totalPOIssued - totalPOPaid,
  };
}

// ── INVOICE STATS ────────────────────────────────────────────
function computeInvoiceStats(rawInvoices) {
  const totalInvoiced = rawInvoices.reduce((a,i) => a + num(i.invoice_value), 0);
  const totalReceived = rawInvoices.reduce((a,i) => a + num(i.payment_received), 0);
  return {
    totalInvoiced,
    totalReceived,
    totalPending: totalInvoiced - totalReceived,
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

const Stat = ({label,value,sub,accent}) => (
  <div style={{background:T.surface,border:`1px solid ${accent}33`,borderRadius:12,padding:"14px 16px",borderTop:`3px solid ${accent}`}}>
    <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>{label}</div>
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
    { label:"Total Project Value",    value:fmtL(stats.totalProjectValue), sub:"contract value",                    accent:T.olive },
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
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
        {cards.map(c => (
          <div key={c.label} style={{
            background:T.bg, borderRadius:10,
            border:`1px solid ${c.accent}22`,
            borderLeft:`3px solid ${c.accent}`,
            padding:"11px 14px",
          }}>
            <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{c.label}</div>
            <div style={{fontSize:18,fontWeight:700,color:T.text,lineHeight:1,fontFamily:"monospace"}}>{c.value}</div>
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
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {[
              {label:"Total Invoiced to Client",  value:fmtL(invStats.totalInvoiced), sub:"across all projects",           accent:T.blue},
              {label:"Total Received from Client", value:fmtL(invStats.totalReceived), sub:"payments collected",            accent:T.green},
              {label:"Pending from Client",        value:fmtL(invStats.totalPending),  sub:"invoiced but not yet received",  accent:T.red},
            ].map(c=>(
              <div key={c.label} style={{background:T.bg,borderRadius:10,border:`1px solid ${c.accent}22`,borderLeft:`3px solid ${c.accent}`,padding:"11px 14px"}}>
                <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{c.label}</div>
                <div style={{fontSize:18,fontWeight:700,color:T.text,lineHeight:1,fontFamily:"monospace"}}>{c.value}</div>
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
function BillingStrip({ project }) {
  const ms       = project.milestones || [];
  const billed   = ms.filter(m=>["billed","blocked"].includes(m.status)).reduce((a,m)=>a+num(m.milestone_amount),0);
  const soon     = ms.filter(m=>m.status==="soon").reduce((a,m)=>a+num(m.milestone_amount),0);
  const locked   = ms.filter(m=>m.status==="locked").reduce((a,m)=>a+num(m.milestone_amount),0);
  const received = ms.reduce((a,m)=>a+num(m.payment_received),0);
  const pending  = billed - received;
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:10}}>
      <Stat label="Vendor outgoing"     value={fmtL(project.vendor_paid)}     sub="paid to vendors"               accent={T.red}   />
      <Stat label="Invoiced to client"  value={fmtL(billed)}                  sub="bills submitted"               accent={T.blue}  />
      <Stat label="Payment received"    value={received>0?fmtL(received):"—"} sub="collected from client"         accent={T.green} />
      <Stat label="Pending from client" value={pending>0?fmtL(pending):"—"}   sub="invoiced minus received"       accent={T.red}   />
      <Stat label="Ready to bill"       value={fmtL(soon)}                    sub="invoice this week"             accent={T.amber} />
      <Stat label="Locked (future)"     value={fmtL(locked)}                  sub="work pending"                  accent={T.muted} />
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
                  <TD color={T.muted} sx={{fontSize:10}}>{inv.invoice_date}</TD>
                  <TD right bold sx={{fontFamily:"monospace",color:T.blue}}>{fmtL(inv.invoice_value)}</TD>
                  <TD color={T.muted} sx={{fontSize:10}}>{inv.sched_pay_date||"—"}</TD>
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

// ── PROJECT RAIL ──────────────────────────────────────────────
function ProjectRail({ project, rawPos, rawProjects }) {
  const [selected,setSelected] = useState(null);
  const ms         = project.milestones || [];
  const selectedMs = ms.find(m => m.milestone_id === selected);
  const toggle     = id => setSelected(prev => prev===id ? null : id);

  // per-project PO stats
  const poStats = computePOStats(rawProjects, rawPos, project.project_id);

  return (
    <div>
      {/* PO strip — project-scoped */}
      <POStrip stats={poStats} label={`PO Overview — ${project.project_name}`}/>

      {/* divider */}
      <div style={{height:1,background:T.border,marginBottom:10}}/>

      {/* Billing strip */}
      <BillingStrip project={project}/>

      {/* Legend */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
        {Object.entries(STATUS_META).map(([k,m])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:T.muted}}>
            <div style={{width:8,height:8,borderRadius:2,background:m.scheme.border,flexShrink:0}}/><span>{m.label}</span>
          </div>
        ))}
        <span style={{marginLeft:"auto",fontSize:10,color:T.muted,fontStyle:"italic"}}>Click any milestone to expand</span>
      </div>

      {/* Rail */}
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

  const globalStats   = computePOStats(rawProj, rawPos);
  const invStats      = computeInvoiceStats(rawInv);
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
            />
          : <p style={{color:T.muted,marginTop:20}}>No project selected.</p>}
      </main>
    </div>
  );
}
