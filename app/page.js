'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, CalendarDays, Upload, ChevronDown, FileSpreadsheet, AlertCircle, Trash2, Layers3, Clock3, Hourglass, Users, Search, SlidersHorizontal, ChevronLeft, ChevronRight, X } from 'lucide-react';

const DB_NAME = 'sig-grir-monitoring';
const DB_VERSION = 1;
const STORE = 'snapshots';
const REQUIRED_SHEET = 'Data Source';
const AMOUNT_KEYS = ['Amount in local currency', 'amount', 'Amount'];

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function dbPut(snapshot){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(snapshot);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
async function dbGetAll(){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}
async function dbDelete(id){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
function clean(v){if(v===null||v===undefined)return '';if(typeof v==='number'&&!Number.isFinite(v))return '';return String(v).trim();}
function numberValue(v){if(typeof v==='number')return Number.isFinite(v)?v:0;const raw=clean(v);if(!raw)return 0;const s=raw.replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(/,/g,'.');const n=Number(s);return Number.isFinite(n)?n:0;}
function findKey(row,names){const keys=Object.keys(row);for(const name of names){const exact=keys.find(k=>clean(k).toLowerCase()===name.toLowerCase());if(exact)return exact;}return null;}
function getAmount(row){const key=findKey(row,AMOUNT_KEYS);return key?numberValue(row[key]):0;}
function pick(row,names){const key=findKey(row,names);return key?clean(row[key]):'';}
function periodFromRows(rows,filename){
  const raw=rows[0]?pick(rows[0],['period','Period']):'';
  if(raw){const iso=String(raw).match(/^(20\d{2})-(\d{2})/);if(iso)return `${iso[2]}.${iso[1]}`;const d=new Date(raw);if(!Number.isNaN(d.getTime())&&d.getFullYear()>2000)return `${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;}
  const name=clean(filename);
  const m=name.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[._-](20\d{2}|\d{2})(?:[^0-9]|$)/i);
  if(m)return `${String(m[1]).padStart(2,'0')}.${m[2].length===2?'20'+m[2]:m[2]}`;
  const m2=name.match(/(?:^|[^0-9])(20\d{2})[._-](0?[1-9]|1[0-2])(?:[^0-9]|$)/i);
  if(m2)return `${String(m2[2]).padStart(2,'0')}.${m2[1]}`;
  return 'Periode';
}
function normalize(rows){return rows.map((r,i)=>({
  id:`${i}-${pick(r,['Document Number','document_number'])}-${pick(r,['Purchasing Document','purchasing_document'])}`,
  amount:getAmount(r), companyCode:pick(r,['Company Code','company_code']), category:pick(r,['Kategori','category','Category'])||'Lainnya',
  dueStatus:pick(r,['Jatuh Tempo','due_status','Due Status']), ageGroup:pick(r,['Umur Hutang','age_group','Age Group']), vendor:pick(r,['Nama Vendor','vendor_name','Vendor Name'])||'Tanpa Vendor',
  status:pick(r,['Status','status']), statusGrouping:pick(r,['Status Grouping','status_grouping']), documentNumber:pick(r,['Document Number','document_number']),
  documentType:pick(r,['Document Type','document_type']), postingDate:pick(r,['Posting Date','posting_date']), documentDate:pick(r,['Document Date','document_date']),
  purchasingDocument:pick(r,['Purchasing Document','purchasing_document']), remark:pick(r,['Remark','remark']), action:pick(r,['Action','action']),
  dueDate:pick(r,['Due Date','due_date']), age:pick(r,['Umur','age'])
}));}
function aggregate(rows,field,labels){return labels.map(label=>({label,value:Math.abs(rows.filter(r=>r[field]===label).reduce((s,r)=>s+r.amount,0))}));}
function summarize(rows){
  const total=Math.abs(rows.reduce((s,r)=>s+r.amount,0));
  const categories=aggregate(rows,'category',['Interco','Third Parties','Afiliasi','BUMN','Lainnya']);
  const aging=aggregate(rows,'ageGroup',['1. Current','2. 1-45','3. 46-135','4. 136-365','5. >365']);
  const due=aggregate(rows,'dueStatus',['Jatuh Tempo','Belum Jatuh Tempo']);
  const vendors=Object.entries(rows.reduce((m,r)=>{if(r.vendor&&r.vendor!=='Tanpa Vendor')m[r.vendor]=(m[r.vendor]||0)+r.amount;return m;},{})).map(([label,value])=>({label,value:Math.abs(value)})).sort((a,b)=>b.value-a.value).slice(0,10);
  const companies=Object.entries(rows.reduce((m,r)=>{if(r.companyCode)m[r.companyCode]=(m[r.companyCode]||0)+r.amount;return m;},{})).map(([label,value])=>({label,value:Math.abs(value)})).sort((a,b)=>b.value-a.value);
  const statuses=[...new Set(rows.map(r=>r.status).filter(Boolean))].sort();
  const groupings=[...new Set(rows.map(r=>r.statusGrouping).filter(Boolean))].sort();
  return {total,categories,aging,due,vendors,companies,statuses,groupings};
}
function formatIDR(n){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Math.abs(n||0));}
function shortIDR(n){const a=Math.abs(n||0);if(a>=1e12)return`Rp ${(a/1e12).toFixed(1)} T`;if(a>=1e9)return`Rp ${(a/1e9).toFixed(1)} M`;if(a>=1e6)return`Rp ${(a/1e6).toFixed(1)} Jt`;if(a>=1e3)return`Rp ${(a/1e3).toFixed(1)} Rb`;return formatIDR(a);}
function BarList({title,items,tone='',onSelect,active=''}){const max=Math.max(...items.map(x=>x.value),1);return <section className={`panel chart-panel ${tone}`}><div className="panel-heading"><h2>{title}</h2><span>{onSelect?'Klik item untuk filter':''}</span></div><div className="bars">{items.map((x,i)=>{const label=x.label.replace(/^\d\.\s?/,'');const isActive=active===x.label;const choose=()=>onSelect?.(isActive?'':x.label);return <div role={onSelect?'button':undefined} tabIndex={onSelect?0:-1} className="bar-row" key={`${x.label}-${i}`} onClick={choose} onKeyDown={e=>{if(onSelect&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose()}}} style={{cursor:onSelect?'pointer':'default',padding:'3px 4px',borderRadius:8,background:isActive?'rgba(101,85,232,.09)':'transparent',outline:'none'}}><div className="bar-head"><span>{label}</span><b>{shortIDR(x.value).replace('Rp ','')}</b></div><div className="track"><div className="fill" style={{width:`${Math.max(x.value?2:0,(x.value/max)*100)}%`}}/></div></div>})}</div></section>}
function LogoMark(){return <div className="logo-mark" aria-hidden="true"><i/><i/><i/><i/></div>}

export default function Page(){
  const inputRef=useRef(null);
  const [snapshots,setSnapshots]=useState([]),[selectedId,setSelectedId]=useState(''),[rows,setRows]=useState([]),[period,setPeriod]=useState('Belum ada data'),[loading,setLoading]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('');
  const [categoryFilter,setCategoryFilter]=useState(''),[agingFilter,setAgingFilter]=useState(''),[dueFilter,setDueFilter]=useState(''),[vendorFilter,setVendorFilter]=useState(''),[companyFilter,setCompanyFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[groupFilter,setGroupFilter]=useState(''),[page,setPage]=useState(1);
  const pageSize=10;

  useEffect(()=>{dbGetAll().then(list=>{const sorted=list.sort((a,b)=>b.createdAt-a.createdAt);setSnapshots(sorted);if(sorted[0]){setSelectedId(sorted[0].id);setRows(sorted[0].rows||[]);setPeriod(sorted[0].period||'Periode');}}).catch(e=>setError(e?.message||'Gagal membaca snapshot.'));},[]);
  const summary=useMemo(()=>summarize(rows),[rows]);
  const filtered=useMemo(()=>rows.filter(r=>{
    if(categoryFilter&&r.category!==categoryFilter)return false;
    if(agingFilter&&r.ageGroup!==agingFilter)return false;
    if(dueFilter&&r.dueStatus!==dueFilter)return false;
    if(vendorFilter&&r.vendor!==vendorFilter)return false;
    if(companyFilter&&r.companyCode!==companyFilter)return false;
    if(statusFilter&&r.status!==statusFilter)return false;
    if(groupFilter&&r.statusGrouping!==groupFilter)return false;
    if(!search)return true;
    const q=search.toLowerCase();return [r.vendor,r.documentNumber,r.category,r.status,r.statusGrouping,r.companyCode,r.remark,r.action,r.purchasingDocument,r.dueStatus,r.ageGroup].some(v=>String(v||'').toLowerCase().includes(q));
  }),[rows,search,categoryFilter,agingFilter,dueFilter,vendorFilter,companyFilter,statusFilter,groupFilter]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)),safePage=Math.min(page,totalPages),tableRows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
  useEffect(()=>{setPage(1)},[search,selectedId,categoryFilter,agingFilter,dueFilter,vendorFilter,companyFilter,statusFilter,groupFilter]);

  function clearFilters(){setSearch('');setCategoryFilter('');setAgingFilter('');setDueFilter('');setVendorFilter('');setCompanyFilter('');setStatusFilter('');setGroupFilter('');setPage(1);}
  function selectSnapshot(id){const s=snapshots.find(x=>x.id===id);if(!s)return;setSelectedId(id);setRows(s.rows||[]);setPeriod(s.period||'Periode');clearFilters();setError('');}
  async function handleFile(file){if(!file)return;setLoading(true);setError('');try{const XLSX=await import('xlsx');const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array',cellDates:true});const sheetName=wb.SheetNames.find(s=>s.trim().toLowerCase()===REQUIRED_SHEET.toLowerCase());if(!sheetName)throw new Error(`Sheet "${REQUIRED_SHEET}" tidak ditemukan.`);const raw=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',raw:true});if(!raw.length)throw new Error('Sheet Data Source kosong.');const normalized=normalize(raw);const p=periodFromRows(raw,file.name);const snapshot={id:`${Date.now()}-${file.name}`,fileName:file.name,period:p,rowCount:normalized.length,rows:normalized,createdAt:Date.now()};await dbPut(snapshot);const list=await dbGetAll();const sorted=list.sort((a,b)=>b.createdAt-a.createdAt);setSnapshots(sorted);setSelectedId(snapshot.id);setRows(normalized);setPeriod(p);clearFilters();}catch(e){console.error(e);setError(e?.message||'Excel tidak bisa dibaca.');}finally{setLoading(false);if(inputRef.current)inputRef.current.value='';}}
  async function removeSnapshot(){if(!selectedId)return;await dbDelete(selectedId);const list=await dbGetAll();const sorted=list.sort((a,b)=>b.createdAt-a.createdAt);setSnapshots(sorted);if(sorted[0]){setSelectedId(sorted[0].id);setRows(sorted[0].rows||[]);setPeriod(sorted[0].period||'Periode');clearFilters();}else{setSelectedId('');setRows([]);setPeriod('Belum ada data');}}

  const dueValue=summary.due.find(x=>x.label==='Jatuh Tempo')?.value||0,notDueValue=summary.due.find(x=>x.label==='Belum Jatuh Tempo')?.value||0;
  const duePct=summary.total?dueValue/summary.total*100:0,notDuePct=summary.total?notDueValue/summary.total*100:0;
  const vendorCount=new Set(rows.map(r=>r.vendor).filter(v=>v&&v!=='Tanpa Vendor')).size;
  const activeCount=[categoryFilter,agingFilter,dueFilter,vendorFilter,companyFilter,statusFilter,groupFilter].filter(Boolean).length+(search?1:0);

  return <main className="page">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="hero"><div className="brand-wrap"><LogoMark/><div><div className="eyebrow">SIG • FINANCE CONTROL</div><h1>GRIR Monitoring</h1><p>Monitoring outstanding, aging, vendor, dan status secara mudah dan cepat.</p></div></div><button className="upload" onClick={()=>inputRef.current?.click()} disabled={loading}><Upload size={18}/>{loading?'Memproses...':'Upload Excel'}</button><input ref={inputRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>handleFile(e.target.files?.[0])}/></header>
    <section className="selector"><div className="period"><CalendarDays size={19}/><span>Periode</span><select className="period-select" value={selectedId} onChange={e=>selectSnapshot(e.target.value)} disabled={!snapshots.length} style={{border:0,background:'transparent',outline:0,fontWeight:800,fontSize:14,color:'var(--text)',cursor:snapshots.length?'pointer':'default',appearance:'none'}}><option value="">Belum ada data</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.period}</option>)}</select><ChevronDown size={15}/></div><div className="snapshot-select"><Database size={18}/><select value={selectedId} onChange={e=>selectSnapshot(e.target.value)}><option value="">Pilih snapshot tersimpan</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.period} • {s.rowCount.toLocaleString('id-ID')} rows</option>)}</select><ChevronDown size={16}/></div></section>
    {error&&<div className="notice"><AlertCircle size={17}/><span>{error}</span></div>}
    {!rows.length?<section className="empty"><FileSpreadsheet size={38}/><h3>Belum ada data</h3><p>Upload file GRIR untuk mulai melihat monitoring.</p><button onClick={()=>inputRef.current?.click()}>Pilih File Excel</button></section>:<>
      <div className="kpis">
        <div className="kpi kpi-purple" role="button" tabIndex={0} onClick={clearFilters}><div className="kpi-icon"><Layers3 size={22}/></div><div className="kpi-copy"><span>Total GRIR</span><strong>{shortIDR(summary.total)}</strong><small>{rows.length.toLocaleString('id-ID')} transaksi</small></div><div className="kpi-side"><b>Aktual</b><small>periode {period}</small></div></div>
        <div className="kpi kpi-mint" role="button" tabIndex={0} onClick={()=>{clearFilters();setDueFilter('Jatuh Tempo')}}><div className="kpi-icon"><Clock3 size={22}/></div><div className="kpi-copy"><span>Due</span><strong>{shortIDR(dueValue)}</strong><small>{rows.filter(r=>r.dueStatus==='Jatuh Tempo').length.toLocaleString('id-ID')} transaksi</small></div><div className="kpi-side"><b>{duePct.toFixed(1)}%</b><small>dari total</small></div></div>
        <div className="kpi kpi-pink" role="button" tabIndex={0} onClick={()=>{clearFilters();setDueFilter('Belum Jatuh Tempo')}}><div className="kpi-icon"><Hourglass size={22}/></div><div className="kpi-copy"><span>Not Due</span><strong>{shortIDR(notDueValue)}</strong><small>{rows.filter(r=>r.dueStatus==='Belum Jatuh Tempo').length.toLocaleString('id-ID')} transaksi</small></div><div className="kpi-side"><b>{notDuePct.toFixed(1)}%</b><small>dari total</small></div></div>
        <div className="kpi kpi-blue"><div className="kpi-icon"><Users size={22}/></div><div className="kpi-copy"><span>Vendor</span><strong>{vendorCount.toLocaleString('id-ID')}</strong><small>Total vendor</small></div><div className="kpi-side"><b>Top 10</b><small>berdasarkan nilai</small></div></div>
      </div>
      <div className="chart-grid three"><BarList title="GRIR by Category" items={summary.categories} tone="category" active={categoryFilter} onSelect={setCategoryFilter}/><BarList title="Aging" items={summary.aging} tone="aging" active={agingFilter} onSelect={setAgingFilter}/><BarList title="Top 10 Vendor" items={summary.vendors} tone="vendors" active={vendorFilter} onSelect={setVendorFilter}/></div>

      <section className="panel" style={{padding:'12px 14px',marginBottom:14}}><div className="panel-heading" style={{marginBottom:9}}><h2>Filter Monitoring</h2><span>{activeCount?`${activeCount} filter aktif`:'Klik pilihan untuk memfilter tabel'}</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>
        <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)} style={selectStyle}><option value="">Semua Company Code</option>{summary.companies.map(x=><option key={x.label} value={x.label}>{x.label}</option>)}</select>
        <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} style={selectStyle}><option value="">Semua Kategori</option>{['Interco','Third Parties','Afiliasi','BUMN','Lainnya'].map(x=><option key={x} value={x}>{x}</option>)}</select>
        <select value={agingFilter} onChange={e=>setAgingFilter(e.target.value)} style={selectStyle}><option value="">Semua Aging</option>{['1. Current','2. 1-45','3. 46-135','4. 136-365','5. >365'].map(x=><option key={x} value={x}>{x.replace(/^\d\.\s?/,'')}</option>)}</select>
        <select value={dueFilter} onChange={e=>setDueFilter(e.target.value)} style={selectStyle}><option value="">Semua Jatuh Tempo</option><option value="Jatuh Tempo">Due</option><option value="Belum Jatuh Tempo">Not Due</option></select>
        <select value={vendorFilter} onChange={e=>setVendorFilter(e.target.value)} style={selectStyle}><option value="">Semua Vendor</option>{summary.vendors.map(x=><option key={x.label} value={x.label}>{x.label}</option>)}</select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={selectStyle}><option value="">Semua Status</option>{summary.statuses.map(x=><option key={x} value={x}>{x}</option>)}</select>
        <select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)} style={selectStyle}><option value="">Semua Status Grouping</option>{summary.groupings.map(x=><option key={x} value={x}>{x}</option>)}</select>
        <button className="filter-btn" onClick={clearFilters} style={{justifyContent:'center',minHeight:34}}><X size={14}/> Reset Semua Filter</button>
      </div></section>

      <section className="panel table-panel"><div className="table-title"><div className="table-heading"><div className="table-icon"><FileSpreadsheet size={16}/></div><div><h2>Daftar Transaksi</h2><small>{activeCount?`Filter aktif • ${filtered.length.toLocaleString('id-ID')} transaksi`:`Seluruh transaksi • ${filtered.length.toLocaleString('id-ID')} transaksi`}</small></div></div><div className="table-actions"><label className="searchbox"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari vendor, dokumen, atau deskripsi..."/></label><button className={`filter-btn ${activeCount?'active':''}`} onClick={clearFilters}><SlidersHorizontal size={15}/> {activeCount?'Reset Filter':'Filter'}</button></div></div>
        {activeCount>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>{categoryFilter&&<span className="cat-pill cat-third-parties" style={{cursor:'pointer'}} onClick={()=>setCategoryFilter('')}>Kategori: {categoryFilter} ×</span>}{agingFilter&&<span className="cat-pill cat-afiliasi" style={{cursor:'pointer'}} onClick={()=>setAgingFilter('')}>Aging: {agingFilter.replace(/^\d\.\s?/,'')} ×</span>}{dueFilter&&<span className="cat-pill cat-bumn" style={{cursor:'pointer'}} onClick={()=>setDueFilter('')}>{dueFilter==='Jatuh Tempo'?'Due':'Not Due'} ×</span>}{vendorFilter&&<span className="cat-pill cat-third-parties" style={{cursor:'pointer'}} onClick={()=>setVendorFilter('')}>Vendor: {vendorFilter} ×</span>}{companyFilter&&<span className="cat-pill cat-lainnya" style={{cursor:'pointer'}} onClick={()=>setCompanyFilter('')}>Company: {companyFilter} ×</span>}{statusFilter&&<span className="cat-pill cat-lainnya" style={{cursor:'pointer'}} onClick={()=>setStatusFilter('')}>Status: {statusFilter} ×</span>}</div>}
        <div className="table-wrap"><table><thead><tr><th>No</th><th>Company Code</th><th>Vendor</th><th>No. Dokumen</th><th>Tanggal</th><th>Jatuh Tempo</th><th>Umur (Hari)</th><th>Jumlah (LC)</th><th>Status</th><th>Kategori</th></tr></thead><tbody>{tableRows.map((r,i)=><tr key={`${r.id}-${i}`}><td>{(safePage-1)*pageSize+i+1}</td><td>{r.companyCode||'-'}</td><td className="vendor-cell">{r.vendor||'-'}</td><td>{r.documentNumber||'-'}</td><td>{r.postingDate||r.documentDate||'-'}</td><td>{r.dueDate||'-'}</td><td>{r.age||'-'}</td><td className="amount">{formatIDR(r.amount)}</td><td><span className={`pill ${r.dueStatus==='Jatuh Tempo'?'pill-due':'pill-notdue'}`}>{r.dueStatus==='Jatuh Tempo'?'Due':'Not Due'}</span></td><td><span className={`cat-pill cat-${String(r.category||'lainnya').toLowerCase().replace(/\s+/g,'-')}`}>{r.category||'-'}</span></td></tr>)}{!tableRows.length&&<tr><td colSpan="10" className="no-results">Tidak ada transaksi yang sesuai.</td></tr>}</tbody></table></div>
        <div className="pagination"><span>Menampilkan {filtered.length?((safePage-1)*pageSize+1):0} - {Math.min(safePage*pageSize,filtered.length)} dari {filtered.length.toLocaleString('id-ID')} transaksi • 10 baris per halaman</span><div className="pages"><button onClick={()=>setPage(Math.max(1,safePage-1))} disabled={safePage===1}><ChevronLeft size={15}/></button><button className="active">{safePage}</button><button onClick={()=>setPage(Math.min(totalPages,safePage+1))} disabled={safePage===totalPages}><ChevronRight size={15}/></button></div></div>
      </section>
      <div className="snapshot-foot"><span>Snapshot tersimpan: {snapshots.length}</span><button className="delete" onClick={removeSnapshot}><Trash2 size={14}/> Hapus snapshot</button></div>
    </>}
    <footer><span>GRIR Dashboard • SIG Finance Control</span><span>Last Update: {period}</span></footer>
  </main>
}

const selectStyle={border:'1px solid #dce5f2',background:'#fff',borderRadius:9,padding:'8px 10px',fontSize:10,color:'#5e6e89',outline:'none',width:'100%',minWidth:0};
