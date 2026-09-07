'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, CalendarDays, Upload, ChevronDown, FileSpreadsheet, AlertCircle, Trash2 } from 'lucide-react';

const DB_NAME = 'sig-grir-monitoring';
const DB_VERSION = 1;
const STORE = 'snapshots';
const REQUIRED_SHEET = 'Data Source';
const AMOUNT_KEYS = ['Amount in local currency', 'amount', 'Amount'];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(snapshot) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(snapshot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function clean(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && !Number.isFinite(v)) return '';
  return String(v).trim();
}

function numberValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = clean(v).replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function findKey(row, names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const exact = keys.find(k => clean(k).toLowerCase() === name.toLowerCase());
    if (exact) return exact;
  }
  return null;
}

function getAmount(row) {
  const key = findKey(row, AMOUNT_KEYS);
  return key ? numberValue(row[key]) : 0;
}

function pick(row, names) {
  const key = findKey(row, names);
  return key ? clean(row[key]) : '';
}

function periodFromRows(rows, filename) {
  const raw = rows[0] ? pick(rows[0], ['period', 'Period']) : '';
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return `${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
    if (/^\d{4}-\d{2}/.test(raw)) return `${raw.slice(5,7)}.${raw.slice(0,4)}`;
  }
  const m = clean(filename).match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[._-](20\d{2}|\d{2})(?:[^0-9]|$)/i);
  if (m) return `${String(m[1]).padStart(2,'0')}.${m[2].length === 2 ? '20'+m[2] : m[2]}`;
  return 'Periode';
}

function normalize(rows, filename) {
  return rows.map((r, i) => ({
    id: `${i}-${pick(r,['Document Number','document_number'])}-${pick(r,['Purchasing Document','purchasing_document'])}`,
    amount: getAmount(r),
    companyCode: pick(r,['Company Code','company_code']),
    category: pick(r,['Kategori','category','Category']),
    dueStatus: pick(r,['Jatuh Tempo','due_status','Due Status']),
    ageGroup: pick(r,['Umur Hutang','age_group','Age Group']),
    vendor: pick(r,['Nama Vendor','vendor_name','Vendor Name']) || 'Tanpa Vendor',
    status: pick(r,['Status Grouping','status_grouping','Status Grouping']),
    documentNumber: pick(r,['Document Number','document_number']),
    documentType: pick(r,['Document Type','document_type']),
    postingDate: pick(r,['Posting Date','posting_date']),
    documentDate: pick(r,['Document Date','document_date']),
    purchasingDocument: pick(r,['Purchasing Document','purchasing_document']),
    remark: pick(r,['Remark','remark']),
    action: pick(r,['Action','action'])
  }));
}

function summarize(rows) {
  const total = rows.reduce((s,r)=>s+r.amount,0);
  const abs = Math.abs(total);
  const by = (field, labels) => labels.map(label => ({ label, value: Math.abs(rows.filter(r => r[field] === label).reduce((s,r)=>s+r.amount,0)) }));
  const categories = ['Interco','Third Parties','BUMN','Afiliasi'];
  const aging = ['1. Current','2. 1-45','3. 46-135','4. 136-365','5. >365'];
  const due = ['Belum Jatuh Tempo','Jatuh Tempo'];
  const company = [...new Set(rows.map(r=>r.companyCode).filter(Boolean))].sort();
  const vendors = Object.entries(rows.reduce((m,r)=>{m[r.vendor]=(m[r.vendor]||0)+r.amount;return m;},{}))
    .map(([label,value])=>({label,value:Math.abs(value)})).sort((a,b)=>b.value-a.value).slice(0,10);
  return { total: abs, signedTotal: total, categories: by('category',categories), aging: by('ageGroup',aging), due: by('dueStatus',due), companies: company.map(c=>({label:c,value:Math.abs(rows.filter(r=>r.companyCode===c).reduce((s,r)=>s+r.amount,0))})).sort((a,b)=>b.value-a.value), vendors };
}

function formatIDR(n) {
  return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Math.abs(n || 0));
}

function shortIDR(n) {
  const a=Math.abs(n||0);
  if(a>=1e12) return `Rp ${(a/1e12).toFixed(1)} T`;
  if(a>=1e9) return `Rp ${(a/1e9).toFixed(1)} M`;
  if(a>=1e6) return `Rp ${(a/1e6).toFixed(1)} jt`;
  if(a>=1e3) return `Rp ${(a/1e3).toFixed(1)} rb`;
  return formatIDR(a);
}

function BarList({ title, items }) {
  const max = Math.max(...items.map(x=>x.value),1);
  return <section className="panel"><h2>{title}</h2><div className="bars">{items.map((x,i)=><div className="bar-row" key={`${x.label}-${i}`}><div className="bar-head"><span>{x.label}</span><b>{shortIDR(x.value)}</b></div><div className="track"><div className="fill" style={{width:`${Math.max(1,(x.value/max)*100)}%`}}/></div></div>)}</div></section>;
}

export default function Page(){
  const inputRef=useRef(null);
  const [snapshots,setSnapshots]=useState([]);
  const [selectedId,setSelectedId]=useState('');
  const [rows,setRows]=useState([]);
  const [period,setPeriod]=useState('Belum ada data');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{ dbGetAll().then(list=>{ const sorted=list.sort((a,b)=>b.createdAt-a.createdAt); setSnapshots(sorted); if(sorted[0]){setSelectedId(sorted[0].id);setRows(sorted[0].rows);setPeriod(sorted[0].period);} }).catch(()=>{}); },[]);

  const summary=useMemo(()=>summarize(rows),[rows]);
  const outstanding=useMemo(()=>rows.filter(r=>/Outstanding/i.test(r.status)||!r.status).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice(0,50),[rows]);

  async function handleFile(file){
    if(!file) return;
    setLoading(true); setError('');
    try{
      const XLSX = await import('xlsx');
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',cellDates:true});
      const sheetName=wb.SheetNames.find(s=>s.trim().toLowerCase()===REQUIRED_SHEET.toLowerCase());
      if(!sheetName) throw new Error(`Sheet "${REQUIRED_SHEET}" tidak ditemukan.`);
      const raw=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',raw:true});
      if(!raw.length) throw new Error('Sheet Data Source kosong.');
      const normalized=normalize(raw,file.name);
      const p=periodFromRows(raw,file.name);
      const snapshot={id:`${Date.now()}-${file.name}`,fileName:file.name,period:p,rowCount:normalized.length,rows:normalized,createdAt:Date.now()};
      await dbPut(snapshot);
      const list=await dbGetAll();
      const sorted=list.sort((a,b)=>b.createdAt-a.createdAt);
      setSnapshots(sorted);setSelectedId(snapshot.id);setRows(normalized);setPeriod(p);
    }catch(e){
      console.error(e);setError(e?.message || 'Excel tidak bisa dibaca. Pastikan ada sheet Data Source.');
    }finally{setLoading(false); if(inputRef.current) inputRef.current.value='';}
  }

  function selectSnapshot(id){const s=snapshots.find(x=>x.id===id);if(!s)return;setSelectedId(id);setRows(s.rows);setPeriod(s.period);setError('');}
  async function removeSnapshot(){if(!selectedId)return;await dbDelete(selectedId);const list=await dbGetAll();const sorted=list.sort((a,b)=>b.createdAt-a.createdAt);setSnapshots(sorted);if(sorted[0]){setSelectedId(sorted[0].id);setRows(sorted[0].rows);setPeriod(sorted[0].period);}else{setSelectedId('');setRows([]);setPeriod('Belum ada data');}}

  return <main className="page">
    <header className="hero"><div><div className="eyebrow">SIG • FINANCE CONTROL</div><h1>GRIR Monitoring</h1><p>Dashboard sederhana untuk monitoring outstanding, aging, vendor, dan status.</p></div><button className="upload" onClick={()=>inputRef.current?.click()} disabled={loading}><Upload size={19}/>{loading?'MEMPROSES...':'UPLOAD EXCEL'}</button><input ref={inputRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>handleFile(e.target.files?.[0])}/></header>
    <section className="selector"><div className="period"><CalendarDays size={22}/><span>PERIODE</span><strong>{period}</strong></div><div className="snapshot-select"><Database size={22}/><select value={selectedId} onChange={e=>selectSnapshot(e.target.value)}><option value="">Pilih snapshot tersimpan</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.period} • {s.rowCount.toLocaleString('id-ID')} rows</option>)}</select><ChevronDown size={18}/></div></section>
    {error && <div className="notice"><AlertCircle size={18}/><span>{error}</span></div>}
    {!rows.length ? <section className="empty"><FileSpreadsheet size={38}/><h3>Belum ada data</h3><p>Upload file GRIR 08.26_Cek.xlsx atau pilih snapshot tersimpan.</p><button onClick={()=>inputRef.current?.click()}>Pilih File Excel</button></section> : <>
      <div className="kpis"><div className="kpi"><span>TOTAL GRIR</span><strong>{formatIDR(summary.total)}</strong><small>{rows.length.toLocaleString('id-ID')} transaksi</small></div><div className="kpi"><span>DUE</span><strong>{formatIDR(summary.due.find(x=>x.label==='Jatuh Tempo')?.value)}</strong><small>Jatuh tempo</small></div><div className="kpi"><span>NOT DUE</span><strong>{formatIDR(summary.due.find(x=>x.label==='Belum Jatuh Tempo')?.value)}</strong><small>Belum jatuh tempo</small></div><div className="kpi"><span>VENDOR</span><strong>{new Set(rows.map(r=>r.vendor).filter(Boolean)).size.toLocaleString('id-ID')}</strong><small>Vendor teridentifikasi</small></div></div>
      <div className="grid2"><BarList title="GRIR by Category" items={summary.categories}/><BarList title="Aging" items={summary.aging}/></div>
      <div className="grid2"><BarList title="Company Code" items={summary.companies}/><BarList title="Top Vendor" items={summary.vendors}/></div>
      <section className="panel table-panel"><div className="table-title"><div><h2>Outstanding Detail</h2><small>50 transaksi terbesar berdasarkan nominal</small></div><button className="delete" onClick={removeSnapshot}><Trash2 size={16}/> Hapus snapshot</button></div><div className="table-wrap"><table><thead><tr><th>Document</th><th>Vendor</th><th>Category</th><th>Due</th><th>Aging</th><th>Amount LC</th></tr></thead><tbody>{outstanding.map((r,i)=><tr key={`${r.id}-${i}`}><td>{r.documentNumber||'-'}</td><td>{r.vendor||'-'}</td><td>{r.category||'-'}</td><td>{r.dueStatus||'-'}</td><td>{r.ageGroup||'-'}</td><td className="amount">{formatIDR(r.amount)}</td></tr>)}</tbody></table></div></section>
    </>}
    <footer>GRIR Dashboard • IndexedDB snapshot • Upload & Save di browser</footer>
  </main>
}
