'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Database, SlidersHorizontal, Search, RotateCcw, AlertTriangle, FileText, Users, Building2, Layers3, ChevronDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const clean = (v) => v == null ? '' : String(v).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v) => { const n = Math.abs(num(v)); if (n >= 1e12) return `Rp ${(n/1e12).toFixed(2)} T`; if (n >= 1e9) return `Rp ${(n/1e9).toFixed(2)} M`; if (n >= 1e6) return `Rp ${(n/1e6).toFixed(1)} Jt`; if (n >= 1e3) return `Rp ${(n/1e3).toFixed(0)} Rb`; return `Rp ${new Intl.NumberFormat('id-ID').format(n)}`; };
const integer = (v) => new Intl.NumberFormat('id-ID').format(Math.round(num(v)));
const pct = (v) => `${Math.abs(num(v)).toFixed(1).replace('.', ',')}%`;

function formatPeriod(v){ const m=String(v||'').match(/^(\d{4})-(\d{2})/); return m ? `${m[2]}.${m[1]}` : String(v||''); }
function dbPeriod(label){ const m=String(label||'').match(/^(\d{2})\.(\d{4})$/); return m ? `${m[2]}-${m[1]}-01` : ''; }
function periodKey(p){ const m=String(p||'').match(/^(\d{2})\.(\d{4})$/); return m ? Number(m[2])*12 + Number(m[1])-1 : null; }
function previousPeriod(p){ const k=periodKey(p); if(k==null)return ''; const prev=k-1; return `${String(prev%12+1).padStart(2,'0')}.${Math.floor(prev/12)}`; }
function change(current, previous){ if(previous==null)return null; if(previous===0)return current===0?0:null; return ((current-previous)/Math.abs(previous))*100; }

async function supa(path){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Konfigurasi Supabase belum tersedia.');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}` }, cache:'no-store' });
  if(!res.ok) throw new Error(await res.text() || `Supabase HTTP ${res.status}`);
  return res.json();
}

async function getUploads(){
  return supa('grir_uploads?select=id,file_name,period,uploaded_at,row_count,status&status=eq.success&order=period.desc,uploaded_at.desc');
}

async function getRows(period){
  const out=[]; const size=1000; let from=0;
  while(true){
    const q = `grir_transactions?select=company_code,account,document_number,document_type,posting_date,amount,vendor_name,category,due_status,age_group,status,status_grouping,action,remark,purchasing_document,text,plant&period=eq.${encodeURIComponent(period)}&order=id.asc&limit=${size}&offset=${from}`;
    const data = await supa(q);
    if(!data.length) break;
    out.push(...data.map(r=>({
      company:clean(r.company_code), account:clean(r.account), doc:clean(r.document_number), documentType:clean(r.document_type),
      posting:clean(r.posting_date), amount:num(r.amount), vendor:clean(r.vendor_name)||'Tanpa Vendor', category:clean(r.category)||'Lainnya',
      due:clean(r.due_status), aging:clean(r.age_group), status:clean(r.status), classification:clean(r.status_grouping)||'Lainnya',
      action:clean(r.action), remark:clean(r.remark), po:clean(r.purchasing_document), text:clean(r.text), plant:clean(r.plant)
    })));
    if(data.length<size) break; from+=size;
  }
  return out;
}

function netTotal(rows){ return Math.abs(rows.reduce((s,r)=>s+num(r.amount),0)); }
function group(rows,key,limit=10){
  const m={};
  rows.forEach(r=>{ const k=clean(r[key])||'Lainnya'; m[k]=(m[k]||0)+num(r.amount); });
  return Object.entries(m).map(([label,value])=>({label,value:Math.abs(value)})).sort((a,b)=>b.value-a.value).slice(0,limit);
}
function unique(rows,key){ return [...new Set(rows.map(r=>clean(r[key])).filter(Boolean))]; }
function applyFilters(rows,f){
  const q=clean(f.search).toLowerCase();
  return rows.filter(r=>
    (!f.category||r.category===f.category)&&(!f.aging||r.aging===f.aging)&&(!f.status||r.status===f.status)&&
    (!f.classification||r.classification===f.classification)&&(!f.due||r.due===f.due)&&(!f.company||r.company===f.company)&&
    (!f.plant||r.plant===f.plant)&&(!f.vendor||r.vendor===f.vendor)&&
    (!q||[r.vendor,r.doc,r.po,r.text,r.company,r.plant,r.category,r.status,r.classification,r.action,r.remark].join(' ').toLowerCase().includes(q))
  );
}

function Card({icon,title,value,sub,delta,compare}){
  const up=delta!=null&&delta>0, down=delta!=null&&delta<0;
  return <div className="kpi-card">
    <div className="kpi-icon">{icon}</div>
    <div className="kpi-main"><span>{title}</span><strong>{value}</strong><small>{sub}</small></div>
    <div className="kpi-change">{delta==null?<><b className="muted">—</b><small>Belum ada pembanding</small></>:<><b className={up?'up':down?'down':''}>{up?<ArrowUpRight size={15}/>:down?<ArrowDownRight size={15}/>:null}{pct(delta)}</b><small>vs {compare}</small></>}</div>
  </div>;
}

function BarPanel({title,items,onClick,active,empty='Belum ada data'}){
  const max=items[0]?.value||1;
  return <section className="panel"><div className="panel-head"><h2>{title}</h2><span>Rp</span></div>{items.length?<div className="bar-list">{items.map((x,i)=><button className={`bar-row ${active===x.label?'selected':''}`} key={`${x.label}-${i}`} onClick={()=>onClick?.(x.label)}><div><span title={x.label}>{x.label}</span><b>{money(x.value)}</b></div><i><em style={{width:`${Math.max(2,x.value/max*100)}%`}}/></i></button>)}</div>:<div className="empty-small">{empty}</div>}</section>;
}

function Donut({items,total,onClick}){
  let cursor=0; const colors=['#2457d6','#5c79e8','#40b89a','#f2b84b','#a879e8'];
  const stops=items.map((x,i)=>{const start=cursor;cursor += total?x.value/total*100:0;return `${colors[i%colors.length]} ${start}% ${cursor}%`;}).join(', ');
  return <div className="donut-wrap"><div className="donut" style={{background:items.length?`conic-gradient(${stops})`:'none'}}><div><b>{money(total)}</b><span>Total</span></div></div><div className="legend">{items.map((x,i)=><button key={x.label} onClick={()=>onClick?.(x.label)}><i style={{background:colors[i%colors.length]}}/><span>{x.label}</span><b>{total?((x.value/total)*100).toFixed(1).replace('.',','):'0,0'}%</b></button>)}</div></div>;
}

function Trend({current,previous,period,previousLabel}){
  const vals=[previous??0,current??0], max=Math.max(...vals,1), w=680,h=220,p={l:48,r:24,t:28,b:42};
  const x=i=>p.l+i*((w-p.l-p.r)/(vals.length-1)); const y=v=>p.t+(1-v/max)*(h-p.t-p.b); const points=vals.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  return <div className="trend"><svg viewBox={`0 0 ${w} ${h}`}><line x1={p.l} x2={w-p.r} y1={h-p.b} y2={h-p.b} className="gridline"/><line x1={p.l} x2={w-p.r} y1={p.t} y2={p.t} className="gridline"/><polyline points={`${p.l},${h-p.b} ${points} ${x(1)},${h-p.b}`} className="trendarea"/><polyline points={points} className="trendline"/>{vals.map((v,i)=><g key={i}><circle cx={x(i)} cy={y(v)} r="7" className="point"/><text x={x(i)} y={y(v)-14} textAnchor="middle" className="value-label">{money(v)}</text><text x={x(i)} y={h-15} textAnchor="middle" className="axis-label">{i===0?previousLabel:period}</text></g>)}</svg></div>;
}

export default function Page(){
  const [snapshots,setSnapshots]=useState([]),[period,setPeriod]=useState(''),[rows,setRows]=useState([]),[previousRows,setPreviousRows]=useState([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
  const [category,setCategory]=useState(''),[aging,setAging]=useState(''),[status,setStatus]=useState(''),[classification,setClassification]=useState(''),[due,setDue]=useState(''),[company,setCompany]=useState(''),[plant,setPlant]=useState(''),[vendor,setVendor]=useState(''),[search,setSearch]=useState('');
  const clear=()=>{setCategory('');setAging('');setStatus('');setClassification('');setDue('');setCompany('');setPlant('');setVendor('');setSearch('');};
  const filters={category,aging,status,classification,due,company,plant,vendor,search};

  async function loadSnapshot(s,list=snapshots){
    setLoading(true); setMessage(''); clear();
    try{ const current=await getRows(s.period); const prevLabel=previousPeriod(formatPeriod(s.period)); const prev=(list.length?list:list).find(x=>formatPeriod(x.period)===prevLabel); const prevRows=prev?await getRows(prev.period):[]; setRows(current);setPreviousRows(prevRows);setPeriod(formatPeriod(s.period)); }
    catch(e){setMessage(`Gagal membaca data: ${e?.message||'silakan refresh.'}`);}
    finally{setLoading(false);}
  }

  useEffect(()=>{let alive=true;(async()=>{try{const list=await getUploads();const mapped=list.map(x=>({...x,label:formatPeriod(x.period),db:x.period}));if(!alive)return;setSnapshots(mapped);if(mapped[0]) await loadSnapshot(mapped[0],mapped);}catch(e){if(alive){setMessage(`Supabase belum bisa dibaca: ${e?.message||''}`);setLoading(false);}}})();return()=>{alive=false;};},[]);

  const filtered=useMemo(()=>applyFilters(rows,filters),[rows,category,aging,status,classification,due,company,plant,vendor,search]);
  const prevFiltered=useMemo(()=>applyFilters(previousRows,filters),[previousRows,category,aging,status,classification,due,company,plant,vendor,search]);
  const total=useMemo(()=>netTotal(filtered),[filtered]); const prevTotal=useMemo(()=>previousRows.length?netTotal(prevFiltered):null,[prevFiltered,previousRows]);
  const dueAmount=useMemo(()=>netTotal(filtered.filter(r=>r.due==='Jatuh Tempo')),[filtered]); const prevDue=useMemo(()=>previousRows.length?netTotal(prevFiltered.filter(r=>r.due==='Jatuh Tempo')):null,[prevFiltered,previousRows]);
  const notDue=useMemo(()=>netTotal(filtered.filter(r=>r.due==='Belum Jatuh Tempo')),[filtered]); const prevNotDue=useMemo(()=>previousRows.length?netTotal(prevFiltered.filter(r=>r.due==='Belum Jatuh Tempo')):null,[prevFiltered,previousRows]);
  const vendorsCount=unique(filtered,'vendor').length; const prevVendorCount=previousRows.length?unique(prevFiltered,'vendor').length:null;
  const poCount=unique(filtered,'po').length; const companyCount=unique(filtered,'company').length;
  const prevLabel=previousPeriod(period);
  const agingItems=useMemo(()=>group(filtered,'aging',5),[filtered]); const categoryItems=useMemo(()=>group(filtered,'category',5),[filtered]);
  const companyItems=useMemo(()=>group(filtered,'company',8),[filtered]); const plantItems=useMemo(()=>group(filtered,'plant',8),[filtered]);
  const vendorItems=useMemo(()=>group(filtered,'vendor',10),[filtered]); const docItems=useMemo(()=>group(filtered,'documentType',8),[filtered]); const statusItems=useMemo(()=>group(filtered,'status',8),[filtered]);
  const classItems=useMemo(()=>group(filtered,'classification',8),[filtered]); const actionItems=useMemo(()=>group(filtered,'action',8).filter(x=>x.label!=='Lainnya'),[filtered]);
  const dueItems=useMemo(()=>group(filtered,'due',5),[filtered]);
  const filterOptions={category:unique(rows,'category'),aging:unique(rows,'aging'),status:unique(rows,'status'),classification:unique(rows,'classification'),due:unique(rows,'due'),company:unique(rows,'company'),plant:unique(rows,'plant'),vendor:unique(rows,'vendor')};
  const actionRows=useMemo(()=>filtered.filter(r=>r.action||r.remark).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice(0,7),[filtered]);
  const tableRows=useMemo(()=>filtered.slice().sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice(0,100),[filtered]);
  const trendCurrent=total, trendPrevious=prevTotal;

  const setFilter=(key,val)=>{const map={category:setCategory,aging:setAging,status:setStatus,classification:setClassification,due:setDue,company:setCompany,plant:setPlant,vendor:setVendor};map[key](val);};
  const activeCount=[category,aging,status,classification,due,company,plant,vendor,search].filter(Boolean).length;

  if(loading) return <main className="page"><div className="loading"><Database size={34}/><h2>Memuat GRIR Dashboard</h2><p>Mengambil data dari database pusat...</p></div></main>;

  return <main className="page">
    <header className="top-header"><div className="brand"><div className="brand-mark"><span/><span/><span/><span/></div><div><div className="brand-small">SIG • DATA CONTROL</div><strong>GRIR Dashboard</strong><small>Monitoring GRIR • GL 21290001</small></div></div><nav><a href="/">Home</a><a className="active" href="/">GRIR</a><a href="#hutang">Hutang</a><a href="#freight">Freight</a></nav><div className="head-tools"><div><CalendarDays size={16}/><span>Periode</span><b>{period||'-'}</b></div><a href="/admin">ADMIN</a></div></header>
    <section className="hero"><div><div className="eyebrow">FROM RECEIVING TO RECORDING</div><h1>GRIR Monitoring</h1><p>Visibility penuh atas outstanding, aging, vendor, klasifikasi, dan action yang membutuhkan perhatian.</p></div><div className="hero-note"><b>GL 21290001</b><span>{integer(rows.length)} transaksi pada snapshot {period}</span></div></section>
    {message&&<div className="notice"><AlertTriangle size={17}/><span>{message}</span></div>}
    <section className="snapshot-bar"><div className="snapshot-label"><Database size={18}/><span>Snapshot</span><select value={period} onChange={async e=>{const s=snapshots.find(x=>x.label===e.target.value);if(s)await loadSnapshot(s,snapshots);}}>{snapshots.map(s=><option key={s.id} value={s.label}>{s.label} • {integer(s.row_count)} rows</option>)}</select><ChevronDown size={15}/></div><div className="snapshot-info">Data terpusat • Public Read-Only</div></section>
    <section className="filterbar"><div className="filter-title"><SlidersHorizontal size={18}/><b>Filter Dashboard</b>{activeCount>0&&<span>{activeCount} aktif</span>}</div><div className="filters"><Filter label="Kategori" value={category} options={filterOptions.category} set={v=>setFilter('category',v)}/><Filter label="Aging" value={aging} options={filterOptions.aging} set={v=>setFilter('aging',v)}/><Filter label="Status" value={status} options={filterOptions.status} set={v=>setFilter('status',v)}/><Filter label="Klasifikasi" value={classification} options={filterOptions.classification} set={v=>setFilter('classification',v)}/><Filter label="Jatuh Tempo" value={due} options={filterOptions.due} set={v=>setFilter('due',v)}/><Filter label="Company" value={company} options={filterOptions.company} set={v=>setFilter('company',v)}/><button className="reset" onClick={clear}><RotateCcw size={15}/> Reset</button></div></section>
    <section className="kpis"><Card icon={<Layers3 size={21}/>} title="Total GRIR" value={money(total)} sub={`${integer(filtered.length)} transaksi`} delta={change(total,prevTotal)} compare={prevLabel}/><Card icon={<FileText size={21}/>} title="Jumlah Transaksi" value={integer(filtered.length)} sub="Dokumen GRIR" delta={change(filtered.length,previousRows.length?prevFiltered.length:null)} compare={prevLabel}/><Card icon={<Database size={21}/>} title="Belum Jatuh Tempo" value={money(notDue)} sub="Not Due" delta={change(notDue,prevNotDue)} compare={prevLabel}/><Card icon={<AlertTriangle size={21}/>} title="Jatuh Tempo" value={money(dueAmount)} sub="Due" delta={change(dueAmount,prevDue)} compare={prevLabel}/><Card icon={<Users size={21}/>} title="Vendor" value={integer(vendorsCount)} sub="Vendor unik" delta={change(vendorsCount,prevVendorCount)} compare={prevLabel}/><Card icon={<FileText size={21}/>} title="Purchasing Document" value={integer(poCount)} sub="PO unik" delta={null} compare={prevLabel}/></section>
    <section className="two-col"><section className="panel trend-panel"><div className="panel-head"><div><h2>Trend Total GRIR</h2><small>Perbandingan snapshot yang tersedia</small></div><span>{period} vs {prevLabel||'-'}</span></div><Trend current={trendCurrent} previous={trendPrevious} period={period} previousLabel={prevLabel||'Periode sebelumnya'}/></section><section className="panel"><div className="panel-head"><h2>GRIR by Category</h2><span>Share</span></div><Donut items={categoryItems} total={total} onClick={v=>setCategory(category===v?'':v)}/></section></section>
    <section className="three-col"><section className="panel"><div className="panel-head"><h2>Aging GRIR</h2><span>Amount</span></div><BarPanelInner items={agingItems} active={aging} onClick={v=>setAging(aging===v?'':v)}/></section><section className="panel"><div className="panel-head"><h2>GRIR by Status</h2><span>Amount</span></div><Donut items={statusItems} total={total} onClick={v=>setStatus(status===v?'':v)}/></section><BarPanel title="Top 10 Vendor" items={vendorItems} active={vendor} onClick={v=>setVendor(vendor===v?'':v)}/></section>
    <section className="three-col"><BarPanel title="GRIR by Company" items={companyItems} active={company} onClick={v=>setCompany(company===v?'':v)}/><BarPanel title="GRIR by Plant" items={plantItems}/><BarPanel title="GRIR by Document Type" items={docItems}/></section>
    <section className="two-col"><BarPanel title="GRIR by Status Grouping" items={classItems} active={classification} onClick={v=>setClassification(classification===v?'':v)}/><BarPanel title="Outstanding Action" items={actionItems}/></section>
    <section className="action-panel"><div className="action-head"><div><h2><AlertTriangle size={19}/> Action Required</h2><p>Prioritas ditentukan dari nilai transaksi terbesar dan informasi Action/Remark yang tersedia di Excel.</p></div><span>{integer(actionRows.length)} prioritas ditampilkan</span></div><div className="action-table"><table><thead><tr><th>Priority</th><th>Document</th><th>Vendor</th><th>Amount</th><th>Umur</th><th>Klasifikasi</th><th>Remark</th><th>Action</th></tr></thead><tbody>{actionRows.map((r,i)=><tr key={`${r.doc}-${i}`}><td><span className={`priority p${i<3?'high':i<5?'medium':'low'}`}>{i<3?'High':i<5?'Medium':'Low'}</span></td><td>{r.doc||'-'}</td><td>{r.vendor}</td><td className="amount">{money(r.amount)}</td><td>{r.aging||'-'}</td><td>{r.classification||'-'}</td><td>{r.remark||'-'}</td><td className="action-text">{r.action||'-'}</td></tr>)}{!actionRows.length&&<tr><td colSpan="8" className="no-data">Belum ada Action/Remark pada transaksi terfilter.</td></tr>}</tbody></table></div></section>
    <section className="panel detail"><div className="detail-head"><div><h2>Transaction Detail (GRIR)</h2><small>{integer(filtered.length)} transaksi sesuai filter</small></div><label className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari vendor, dokumen, PO, atau remark..."/></label></div><div className="table-scroll"><table><thead><tr><th>No</th><th>Company</th><th>Plant</th><th>Document</th><th>Document Type</th><th>Vendor</th><th>PO</th><th>Posting Date</th><th>Amount (LC)</th><th>Jatuh Tempo</th><th>Umur</th><th>Status</th><th>Klasifikasi</th><th>Kategori</th><th>Action</th></tr></thead><tbody>{tableRows.map((r,i)=><tr key={`${r.doc}-${i}`}><td>{i+1}</td><td>{r.company||'-'}</td><td>{r.plant||'-'}</td><td>{r.doc||'-'}</td><td>{r.documentType||'-'}</td><td className="vendor">{r.vendor}</td><td>{r.po||'-'}</td><td>{r.posting||'-'}</td><td className="amount">{money(r.amount)}</td><td><span className={r.due==='Jatuh Tempo'?'due':'notdue'}>{r.due||'-'}</span></td><td>{r.aging||'-'}</td><td>{r.status||'-'}</td><td>{r.classification||'-'}</td><td>{r.category||'-'}</td><td>{r.action||'-'}</td></tr>)}{!tableRows.length&&<tr><td colSpan="15" className="no-data">Tidak ada transaksi yang sesuai filter.</td></tr>}</tbody></table></div></section>
    <footer><span>SIG Data Control • GRIR • GL 21290001</span><span>Snapshot {period} • {integer(rows.length)} rows</span></footer>
  </main>;
}

function Filter({label,value,options,set}){return <label className="filter"><span>{label}</span><select value={value} onChange={e=>set(e.target.value)}><option value="">Semua</option>{options.map(x=><option key={x} value={x}>{x}</option>)}</select></label>}
function BarPanelInner({items,active,onClick}){const max=items[0]?.value||1;return <div className="bar-list">{items.map((x,i)=><button className={`bar-row ${active===x.label?'selected':''}`} key={`${x.label}-${i}`} onClick={()=>onClick?.(x.label)}><div><span>{x.label.replace(/^\d\.\s?/,'')}</span><b>{money(x.value)}</b></div><i><em style={{width:`${Math.max(2,x.value/max*100)}%`}}/></i></button>)}</div>}
