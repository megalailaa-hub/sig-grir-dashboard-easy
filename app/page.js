'use client';
import {useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {Upload, Database, CalendarDays, Trash2, FileSpreadsheet, ChevronDown, SlidersHorizontal, Search, X} from 'lucide-react';


// IndexedDB dipakai untuk snapshot karena localStorage terlalu kecil untuk Excel puluhan ribu baris.
const DB_NAME='sig-grir-dashboard';
const DB_VERSION=1;
const STORE_NAME='snapshots';
function openSnapshotDB(){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('Browser tidak mendukung IndexedDB.'));return;}
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME,{keyPath:'id'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error('Database browser gagal dibuka.'));
 });
}
async function idbGetAll(){
 const db=await openSnapshotDB();
 return new Promise((resolve,reject)=>{
  const req=db.transaction(STORE_NAME,'readonly').objectStore(STORE_NAME).getAll();
  req.onsuccess=()=>resolve(req.result||[]);
  req.onerror=()=>reject(req.error);
 });
}
async function idbPut(item){
 const db=await openSnapshotDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE_NAME,'readwrite');
  tx.objectStore(STORE_NAME).put(item);
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||new Error('Snapshot gagal disimpan.'));
  tx.onabort=()=>reject(tx.error||new Error('Snapshot gagal disimpan.'));
 });
}
async function idbDelete(id){
 const db=await openSnapshotDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE_NAME,'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error);
 });
}
function sortSnapshots(list){return [...list].sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')));}

const fmt=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Math.abs(Number(n)||0));
const money=n=>{const v=Math.abs(Number(n)||0); if(v>=1e9)return 'Rp '+(v/1e9).toFixed(1)+' M'; if(v>=1e6)return 'Rp '+(v/1e6).toFixed(1)+' M'; if(v>=1e3)return 'Rp '+(v/1e3).toFixed(0)+' K'; return 'Rp '+fmt(v)};
const clean=v=>v==null?'':String(v).trim();
function toNumber(v){
 if(typeof v==='number' && Number.isFinite(v)) return v;
 if(v==null || v==='') return 0;
 let s=String(v).trim().replace(/\s/g,'').replace(/Rp/gi,'');
 if(!s) return 0;
 const neg=/^\(.*\)$/.test(s);
 s=s.replace(/[()]/g,'');
 // Excel exports may use either 1,234.56 or 1.234.567,89. Detect the decimal separator.
 if(s.includes('.') && s.includes(',')){
   if(s.lastIndexOf(',')>s.lastIndexOf('.')) s=s.replace(/\./g,'').replace(',','.');
   else s=s.replace(/,/g,'');
 }else if((s.match(/\./g)||[]).length>1){
   s=s.replace(/\./g,'');
 }else if((s.match(/,/g)||[]).length>1){
   s=s.replace(/,/g,'');
 }else if(s.includes(',') && !s.includes('.')){
   const parts=s.split(',');
   s=parts[1]?.length===3 ? parts.join('') : s.replace(',','.');
 }
 const n=Number(s);
 return Number.isFinite(n) ? (neg?-Math.abs(n):n) : 0;
}
function normalize(r){
 const amount=toNumber(r['Amount in local currency']);
 const amountPlus=toNumber(r['Amount +']);
 return {company:clean(r['Company Code']),account:clean(r['Account']),doc:clean(r['Document Number']),posting:clean(r['Posting Date']),amount:amount||(-amountPlus),amountPlus,vendor:clean(r['Nama Vendor']),category:clean(r['Kategori']),due:clean(r['Jatuh Tempo']),aging:clean(r['Umur Hutang']),status:clean(r['Status Grouping']),action:clean(r['Action']),remark:clean(r['Remark']),po:clean(r['Purchasing Document']),description:clean(r['Text'])};
}
function repairRows(list){
 return (Array.isArray(list)?list:[]).map(r=>{
   const amount=toNumber(r.amount);
   const amountPlus=toNumber(r.amountPlus);
   return {...r,amount:(amount!==0?amount:(amountPlus!==0?-amountPlus:0)),amountPlus};
 });
}
function summarize(rows,key){const m={}; rows.forEach(r=>{const k=r[key]||'Lainnya';m[k]=(m[k]||0)+Math.abs(r.amount)});return Object.entries(m).sort((a,b)=>b[1]-a[1]);}
function unique(rows,key){return [...new Set(rows.map(r=>r[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'id',{numeric:true}));}

export default function Page(){
 const [rows,setRows]=useState([]),[period,setPeriod]=useState(''),[snapshots,setSnapshots]=useState([]),[active,setActive]=useState(''),[loading,setLoading]=useState(false),[msg,setMsg]=useState('');
 const [category,setCategory]=useState(''),[aging,setAging]=useState(''),[status,setStatus]=useState(''),[due,setDue]=useState(''),[company,setCompany]=useState(''),[vendor,setVendor]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const pageSize=10;

 useEffect(()=>{idbGetAll().then(list=>{const repaired=sortSnapshots((Array.isArray(list)?list:[]).map(x=>({...x,rows:repairRows(x.rows)})));setSnapshots(repaired);if(repaired[0]){setActive(repaired[0].id);setPeriod(repaired[0].period);setRows(repaired[0].rows);}}).catch(err=>setMsg(`Database snapshot belum bisa dibuka: ${err?.message||'silakan refresh halaman.'}`))},[]);
 useEffect(()=>{setPage(1)},[category,aging,status,due,company,vendor,search,period]);

 const filteredRows=useMemo(()=>rows.filter(r=>
   (!category||r.category===category)&&(!aging||r.aging===aging)&&(!status||r.status===status)&&(!due||r.due===due)&&(!company||r.company===company)&&(!vendor||r.vendor===vendor)&&
   (!search||[r.vendor,r.doc,r.description,r.po,r.company,r.category,r.status].join(' ').toLowerCase().includes(search.toLowerCase()))
 ),[rows,category,aging,status,due,company,vendor,search]);
 const total=useMemo(()=>filteredRows.reduce((a,r)=>a+Math.abs(r.amount),0),[filteredRows]);
 const cats=useMemo(()=>summarize(filteredRows,'category'),[filteredRows]);
 const vendors=useMemo(()=>summarize(filteredRows,'vendor').slice(0,10),[filteredRows]);
 const agings=useMemo(()=>summarize(filteredRows,'aging'),[filteredRows]);
 const dueData=useMemo(()=>summarize(filteredRows,'due'),[filteredRows]);
 const companies=useMemo(()=>summarize(filteredRows,'company').slice(0,8),[filteredRows]);
 const categories=useMemo(()=>unique(rows,'category'),[rows]);
 const agingOptions=useMemo(()=>unique(rows,'aging'),[rows]);
 const statusOptions=useMemo(()=>unique(rows,'status'),[rows]);
 const dueOptions=useMemo(()=>unique(rows,'due'),[rows]);
 const companyOptions=useMemo(()=>unique(rows,'company'),[rows]);
 const vendorOptions=useMemo(()=>unique(rows,'vendor'),[rows]);
 const pageCount=Math.max(1,Math.ceil(filteredRows.length/pageSize));
 const tableRows=useMemo(()=>filteredRows.slice().sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice((page-1)*pageSize,page*pageSize),[filteredRows,page]);
 const activeFilterCount=[category,aging,status,due,company,vendor,search].filter(Boolean).length;

 async function saveSnapshot(nextRows,p){const id=p+'-'+Date.now(); const item={id,period:p,rowCount:nextRows.length,rows:nextRows,savedAt:new Date().toISOString()}; const existing=await idbGetAll(); const samePeriod=existing.filter(x=>x.period!==p); const next=[item,...samePeriod].sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt))).slice(0,24); const removeIds=existing.filter(x=>!next.some(n=>n.id===x.id)).map(x=>x.id); await idbPut(item); for(const rid of removeIds) await idbDelete(rid); setSnapshots(next);setActive(id);return item;}
 async function onFile(e){const f=e.target.files?.[0];if(!f)return;setLoading(true);setMsg('Membaca Excel...');try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});const ws=wb.Sheets['Data Source'];if(!ws)throw new Error('Sheet Data Source tidak ditemukan');const raw=XLSX.utils.sheet_to_json(ws,{defval:''});const nr=raw.map(normalize);if(!nr.length)throw new Error('Sheet Data Source kosong');const inferred=(f.name.match(/(\d{2})[._-]?(\d{2})/)||[]);const p=inferred[1]&&inferred[2]?`${inferred[1]}.20${inferred[2]}`:new Date().toLocaleDateString('id-ID',{month:'2-digit',year:'numeric'});await saveSnapshot(nr,p);setRows(nr);setPeriod(p);clearFilters();setMsg(`${fmt(nr.length)} baris berhasil disimpan sebagai periode ${p}.`)}catch(err){console.error(err);setMsg(`Excel gagal diproses: ${err?.message||'format tidak dikenali'}.`)}finally{setLoading(false);if(e.target)e.target.value=''}}
 function choose(s){setActive(s.id);setPeriod(s.period);setRows(s.rows);clearFilters();setMsg(`Menampilkan snapshot ${s.period}.`)}
 async function remove(s){try{await idbDelete(s.id);const next=sortSnapshots(await idbGetAll());setSnapshots(next);if(active===s.id){const x=next[0];if(x)choose(x);else{setRows([]);setPeriod('');setActive('');clearFilters()}}setMsg(`Snapshot ${s.period} dihapus.`)}catch(err){setMsg(`Gagal menghapus snapshot: ${err?.message||''}`)}}
 function clearFilters(){setCategory('');setAging('');setStatus('');setDue('');setCompany('');setVendor('');setSearch('');setPage(1)}
 function toggle(setter,value,current){setter(current===value?'':value)}

 return <main>
  <header><div><div className="eyebrow">SIG • FINANCE CONTROL</div><h1>GRIR Monitoring</h1><p>Monitoring outstanding, aging, vendor, dan status secara mudah dan cepat.</p></div><label className="upload"><Upload size={18}/>{loading?'MEMPROSES...':'UPLOAD EXCEL'}<input type="file" accept=".xlsx,.xls" onChange={onFile}/></label></header>
  <section className="toolbar">
   <div className="period"><CalendarDays size={18}/><span>PERIODE</span><select value={active} onChange={e=>{const s=snapshots.find(x=>x.id===e.target.value);if(s)choose(s)}}><option value="">Belum ada data</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.period}</option>)}</select><ChevronDown size={15}/></div>
   <div className="history"><Database size={18}/><select value={active} onChange={e=>{const s=snapshots.find(x=>x.id===e.target.value);if(s)choose(s)}}><option value="">Pilih snapshot tersimpan</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.period} • {(s.rowCount||s.rows?.length||0).toLocaleString('id-ID')} rows</option>)}</select><ChevronDown size={16}/></div>
  </section>
  {msg&&<div className="message">{msg}</div>}
  {!rows.length?<section className="empty"><FileSpreadsheet size={52}/><h2>Belum ada data</h2><p>Upload file GRIR untuk mulai melihat monitoring.</p><label className="primary">Pilih File Excel<input type="file" accept=".xlsx,.xls" onChange={onFile}/></label></section>:<>
   <section className="filterbar">
    <div className="filtertitle"><SlidersHorizontal size={17}/><b>Filter Dashboard</b>{activeFilterCount>0&&<span className="filtercount">{activeFilterCount} aktif</span>}</div>
    <div className="filtercontrols">
     <FilterSelect label="Kategori" value={category} setValue={setCategory} options={categories}/>
     <FilterSelect label="Aging" value={aging} setValue={setAging} options={agingOptions}/>
     <FilterSelect label="Status" value={status} setValue={setStatus} options={statusOptions}/>
     <FilterSelect label="Jatuh Tempo" value={due} setValue={setDue} options={dueOptions}/>
     <FilterSelect label="Company" value={company} setValue={setCompany} options={companyOptions}/>
     {activeFilterCount>0&&<button className="clearbtn" onClick={clearFilters}><X size={15}/> Reset</button>}
    </div>
   </section>
   <section className="cards"><Card title="TOTAL GRIR" value={money(total)} sub={`${filteredRows.length.toLocaleString('id-ID')} transaksi`}/><Card title="DUE" value={money(dueData.find(x=>x[0]==='Jatuh Tempo')?.[1]||0)} sub="Jatuh tempo"/><Card title="NOT DUE" value={money(dueData.find(x=>x[0]==='Belum Jatuh Tempo')?.[1]||0)} sub="Belum jatuh tempo"/><Card title="VENDOR" value={unique(filteredRows,'vendor').length} sub="Total vendor"/></section>
   <section className="grid"><Panel title="GRIR by Category"><Bars data={cats} active={category} onClick={(v)=>toggle(setCategory,v,category)}/></Panel><Panel title="Aging"><Bars data={agings} active={aging} onClick={(v)=>toggle(setAging,v,aging)}/></Panel><Panel title="Top 10 Vendor"><Bars data={vendors} active={vendor} onClick={(v)=>toggle(setVendor,v,vendor)}/></Panel><Panel title="Company Code"><Bars data={companies} active={company} onClick={(v)=>toggle(setCompany,v,company)}/></Panel></section>
   <section className="tablebox"><div className="tablehead"><div><h2>Daftar Transaksi</h2><span>{filteredRows.length.toLocaleString('id-ID')} transaksi sesuai filter</span></div><div className="tabletools"><div className="search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari vendor, dokumen, atau deskripsi..."/></div><select value={vendor} onChange={e=>setVendor(e.target.value)}><option value="">Semua Vendor</option>{vendorOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></div></div><div className="activechips">{category&&<Chip label={'Kategori: '+category} onClear={()=>setCategory('')}/>} {aging&&<Chip label={'Aging: '+aging} onClear={()=>setAging('')}/>} {status&&<Chip label={'Status: '+status} onClear={()=>setStatus('')}/>} {due&&<Chip label={'Jatuh Tempo: '+due} onClear={()=>setDue('')}/>} {company&&<Chip label={'Company: '+company} onClear={()=>setCompany('')}/>} {vendor&&<Chip label={'Vendor: '+vendor} onClear={()=>setVendor('')}/>}</div><div className="tablewrap"><table><thead><tr><th>No</th><th>Company Code</th><th>Vendor</th><th>No. Dokumen</th><th>Tanggal</th><th>Jatuh Tempo</th><th>Umur (Hari)</th><th>Jumlah (LC)</th><th>Status</th><th>Kategori</th></tr></thead><tbody>{tableRows.length?tableRows.map((r,i)=><tr key={(r.doc||'row')+'-'+i}><td>{(page-1)*pageSize+i+1}</td><td>{r.company}</td><td>{r.vendor}</td><td>{r.doc}</td><td>{r.posting}</td><td>{r.due}</td><td>{r.aging}</td><td className="num">{money(r.amount)}</td><td>{r.status}</td><td>{r.category}</td></tr>):<tr><td colSpan="10" className="nodata">Tidak ada transaksi yang sesuai filter.</td></tr>}</tbody></table></div><div className="pagination"><span>Menampilkan {filteredRows.length?((page-1)*pageSize+1):0} - {Math.min(page*pageSize,filteredRows.length)} dari {filteredRows.length.toLocaleString('id-ID')} transaksi</span><div><button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button>{Array.from({length:Math.min(pageCount,5)},(_,i)=>i+1).map(n=><button key={n} className={page===n?'activepage':''} onClick={()=>setPage(n)}>{n}</button>)}{pageCount>5&&<><span className="dots">…</span><button className={page===pageCount?'activepage':''} onClick={()=>setPage(pageCount)}>{pageCount.toLocaleString('id-ID')}</button></>}<button disabled={page===pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>›</button></div></div></section>
   <section className="snapshots"><h2>Saved Snapshots</h2>{snapshots.map(s=><div className="snapshot" key={s.id}><button onClick={()=>choose(s)}><CalendarDays size={16}/><b>{s.period}</b><span>{(s.rowCount||s.rows?.length||0).toLocaleString('id-ID')} rows</span></button><button className="delete" title="Hapus" onClick={()=>remove(s)}><Trash2 size={16}/></button></div>)}</section>
  </>}
  <footer>GRIR Dashboard • Mode mudah • Upload & Save di browser</footer>
 </main>
}
function FilterSelect({label,value,setValue,options}){return <label className="filterselect"><span>{label}</span><select value={value} onChange={e=>setValue(e.target.value)}><option value="">Semua</option>{options.map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
function Chip({label,onClear}){return <button className="chip" onClick={onClear}>{label}<X size={13}/></button>}
function Card({title,value,sub}){return <div className="card"><span>{title}</span><strong>{value}</strong><small>{sub}</small></div>}
function Panel({title,children}){return <div className="panel"><h2>{title}</h2>{children}</div>}
function Bars({data,active,onClick}){const max=data[0]?.[1]||1;return <div className="bars">{data.slice(0,10).map(([k,v])=><button className={'baritem '+(active===k?'selected':'')} key={k} onClick={()=>onClick?.(k)}><div className="barlabel"><span title={k}>{k||'Lainnya'}</span><b>{money(v)}</b></div><div className="track"><div className="fill" style={{width:`${Math.max(2,(v/max)*100)}%`}}/></div></button>)}</div>}
