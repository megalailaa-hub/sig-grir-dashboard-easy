'use client';
import {useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {Upload, Database, CalendarDays, Trash2, FileSpreadsheet, ChevronDown, SlidersHorizontal, Search, X} from 'lucide-react';


const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
async function supa(path, options={}){
 if(!SUPABASE_URL||!SUPABASE_ANON_KEY) throw new Error('Konfigurasi Supabase belum diisi.');
 const res=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,...(options.headers||{})},cache:'no-store'});
 if(!res.ok) throw new Error(await res.text()||`Supabase HTTP ${res.status}`);
 return res.json();
}
async function getUploads(){return supa('grir_uploads?select=id,file_name,period,uploaded_at,row_count,status&status=eq.success&order=period.desc,uploaded_at.desc');}
async function getRows(period){
 const out=[]; const size=1000; let from=0;
 while(true){
  const data=await supa(`grir_transactions?select=company_code,account,document_number,posting_date,amount,vendor_name,category,due_status,age_group,status,status_grouping,action,remark,purchasing_document,text&period=eq.${encodeURIComponent(period)}&order=id.asc&limit=${size}&offset=${from}`);
  if(!data.length) break;
  out.push(...data.map(r=>({company:clean(r.company_code),account:clean(r.account),doc:clean(r.document_number),posting:clean(r.posting_date),amount:toNumber(r.amount),amountPlus:0,vendor:clean(r.vendor_name),category:clean(r.category),due:clean(r.due_status),aging:clean(r.age_group),status:clean(r.status),classification:clean(r.status_grouping),action:clean(r.action),remark:clean(r.remark),po:clean(r.purchasing_document),description:clean(r.text)}))));
  if(data.length<size) break; from+=size;
 }
 return out;
}
function sortSnapshots(list){return [...list].sort((a,b)=>String(b.period||'').localeCompare(String(a.period||''))||String(b.savedAt||'').localeCompare(String(a.savedAt||'')));}
function formatPeriod(iso){const m=String(iso||'').match(/^(\d{4})-(\d{2})/);return m?`${m[2]}.${m[1]}`:String(iso||'');}
function dbPeriod(label){const m=String(label||'').match(/^(\d{2})\.(\d{4})$/);return m?`${m[2]}-${m[1]}-01`:'';}

const fmt=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Math.abs(Number(n)||0));
const money=n=>{const v=Math.abs(Number(n)||0); if(v>=1e9)return 'Rp '+(v/1e9).toFixed(1)+' M'; if(v>=1e6)return 'Rp '+(v/1e6).toFixed(1)+' M'; if(v>=1e3)return 'Rp '+(v/1e3).toFixed(0)+' K'; return 'Rp '+fmt(v)};
const clean=v=>v==null?'':String(v).replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim();
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
function getField(r,names){
 const wanted=names.map(x=>String(x).trim().toLowerCase());
 const key=Object.keys(r||{}).find(k=>wanted.includes(String(k).trim().toLowerCase()));
 return key===undefined?'':r[key];
}
function normalize(r){
 const rawAmount=getField(r,['Amount in local currency','Amount in local currency ']);
 const rawPlus=getField(r,['Amount +','Amount+']);
 const amount=toNumber(rawAmount);
 const amountPlus=toNumber(rawPlus);
 // Prioritas selalu Amount in local currency (signed). Amount + hanya fallback jika kolom utama kosong/tidak terbaca.
 const finalAmount=Number.isFinite(amount) && amount!==0 ? amount : (Number.isFinite(amountPlus) && amountPlus!==0 ? -Math.abs(amountPlus) : 0);
 return {
  company:clean(getField(r,['Company Code'])),
  account:clean(getField(r,['Account'])),
  doc:clean(getField(r,['Document Number'])),
  posting:clean(getField(r,['Posting Date'])),
  amount:finalAmount,
  amountPlus,
  vendor:clean(getField(r,['Nama Vendor'])),
  category:clean(getField(r,['Kategori'])),
  due:clean(getField(r,['Jatuh Tempo'])),
  aging:clean(getField(r,['Umur Hutang'])),
  status:clean(getField(r,['Status'])),
  classification:clean(getField(r,['Status Grouping'])),
  action:clean(getField(r,['Action'])),
  remark:clean(getField(r,['Remark'])),
  po:clean(getField(r,['Purchasing Document'])),
  description:clean(getField(r,['Text']))
 };
}
function repairRows(list){
 return (Array.isArray(list)?list:[]).map(r=>{
   const amount=toNumber(r.amount);
   const amountPlus=toNumber(r.amountPlus);
   return {...r,amount:(amount!==0?amount:(amountPlus!==0?-amountPlus:0)),amountPlus};
 });
}
function summarize(rows,key){const m={}; rows.forEach(r=>{const k=r[key]||'Lainnya';m[k]=(m[k]||0)+Number(r.amount||0)});return Object.entries(m).map(([k,v])=>[k,Math.abs(v)]).sort((a,b)=>b[1]-a[1]);}
function unique(rows,key){return [...new Set(rows.map(r=>r[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'id',{numeric:true}));}
function periodKey(p){const m=String(p||'').match(/^(\d{2})\.(\d{4})$/);return m?Number(m[2])*12+(Number(m[1])-1):null;}
function previousPeriod(p){const k=periodKey(p);if(k==null)return '';const prev=k-1;const y=Math.floor(prev/12),m=String(prev%12+1).padStart(2,'0');return `${m}.${y}`;}
function applyFilters(source,{category,aging,status,classification,due,company,vendor,search}){return (source||[]).filter(r=>
 (!category||r.category===category)&&(!aging||r.aging===aging)&&(!status||r.status===status)&&(!classification||r.classification===classification)&&(!due||r.due===due)&&(!company||r.company===company)&&(!vendor||r.vendor===vendor)&&
 (!search||[r.vendor,r.doc,r.description,r.po,r.company,r.category,r.status,r.classification].join(' ').toLowerCase().includes(search.toLowerCase()))
);}
function changePct(current,previous){if(previous===0)return current===0?0:null;return ((current-previous)/Math.abs(previous))*100;}

export default function Page(){
 const [rows,setRows]=useState([]),[previousRows,setPreviousRows]=useState([]),[period,setPeriod]=useState(''),[snapshots,setSnapshots]=useState([]),[active,setActive]=useState(''),[loading,setLoading]=useState(false),[msg,setMsg]=useState('');
 const [category,setCategory]=useState(''),[aging,setAging]=useState(''),[status,setStatus]=useState(''),[classification,setClassification]=useState(''),[due,setDue]=useState(''),[company,setCompany]=useState(''),[vendor,setVendor]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const pageSize=10;

 useEffect(()=>{let cancelled=false;setLoading(true);getUploads().then(async list=>{const ordered=sortSnapshots(list.map(x=>({id:String(x.id),period:formatPeriod(x.period),dbPeriod:x.period,rowCount:x.row_count,savedAt:x.uploaded_at,fileName:x.file_name}))); if(cancelled)return;setSnapshots(ordered);if(ordered[0]){const currentLabel=formatPeriod(ordered[0].period);const prevLabel=previousPeriod(currentLabel);const prevSnap=ordered.find(s=>s.period===prevLabel);setActive(ordered[0].id);setPeriod(currentLabel);const [current,prev]=await Promise.all([getRows(ordered[0].dbPeriod),prevSnap?getRows(prevSnap.dbPeriod):Promise.resolve([])]);if(!cancelled){setRows(current);setPreviousRows(prev);setMsg(prevSnap?`Menampilkan snapshot ${currentLabel}. Pembanding: ${prevLabel}.`:`Menampilkan snapshot ${currentLabel}. Belum ada snapshot pembanding.`)}}}).catch(err=>{if(!cancelled)setMsg(`Supabase belum bisa dibaca: ${err?.message||'silakan refresh halaman.'}`)}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[]);
 useEffect(()=>{setPage(1)},[category,aging,status,classification,due,company,vendor,search,period]);

 const filterState={category,aging,status,classification,due,company,vendor,search};
 const filteredRows=useMemo(()=>applyFilters(rows,filterState),[rows,category,aging,status,classification,due,company,vendor,search]);
 const currentSnapshot=useMemo(()=>snapshots.find(s=>s.id===active)||null,[snapshots,active]);
 const previousPeriodLabel=useMemo(()=>previousPeriod(period),[period]);
 const previousSnapshot=useMemo(()=>snapshots.find(s=>s.period===previousPeriodLabel)||null,[snapshots,previousPeriodLabel]);
 const filteredPreviousRows=useMemo(()=>previousSnapshot?applyFilters(previousRows,filterState):[],[previousSnapshot,previousRows,category,aging,status,classification,due,company,vendor,search]);
 const total=useMemo(()=>Math.abs(filteredRows.reduce((a,r)=>a+Number(r.amount||0),0)),[filteredRows]);
 const previousTotal=useMemo(()=>previousSnapshot?Math.abs(filteredPreviousRows.reduce((a,r)=>a+Number(r.amount||0),0)):null,[previousSnapshot,filteredPreviousRows]);
 const dueAmount=useMemo(()=>Math.abs(filteredRows.filter(r=>r.due==='Jatuh Tempo').reduce((a,r)=>a+Number(r.amount||0),0)),[filteredRows]);
 const previousDue=useMemo(()=>previousSnapshot?Math.abs(filteredPreviousRows.filter(r=>r.due==='Jatuh Tempo').reduce((a,r)=>a+Number(r.amount||0),0)):null,[previousSnapshot,filteredPreviousRows]);
 const notDueAmount=useMemo(()=>Math.abs(filteredRows.filter(r=>r.due==='Belum Jatuh Tempo').reduce((a,r)=>a+Number(r.amount||0),0)),[filteredRows]);
 const previousNotDue=useMemo(()=>previousSnapshot?Math.abs(filteredPreviousRows.filter(r=>r.due==='Belum Jatuh Tempo').reduce((a,r)=>a+Number(r.amount||0),0)):null,[previousSnapshot,filteredPreviousRows]);
 const vendorCount=useMemo(()=>unique(filteredRows,'vendor').length,[filteredRows]);
 const previousVendorCount=useMemo(()=>previousSnapshot?unique(filteredPreviousRows,'vendor').length:null,[previousSnapshot,filteredPreviousRows]);
 const trends=useMemo(()=>({total:previousTotal===null?null:changePct(total,previousTotal),due:previousDue===null?null:changePct(dueAmount,previousDue),notdue:previousNotDue===null?null:changePct(notDueAmount,previousNotDue),vendor:previousVendorCount===null?null:changePct(vendorCount,previousVendorCount)}),[total,previousTotal,dueAmount,previousDue,notDueAmount,previousNotDue,vendorCount,previousVendorCount]);
 const cats=useMemo(()=>summarize(filteredRows,'category'),[filteredRows]);
 const vendors=useMemo(()=>summarize(filteredRows,'vendor').slice(0,10),[filteredRows]);
 const agings=useMemo(()=>summarize(filteredRows,'aging'),[filteredRows]);
 const dueData=useMemo(()=>summarize(filteredRows,'due'),[filteredRows]);
 const companies=useMemo(()=>summarize(filteredRows,'company').slice(0,8),[filteredRows]);
 const categories=useMemo(()=>unique(rows,'category'),[rows]);
 const agingOptions=useMemo(()=>unique(rows,'aging'),[rows]);
 const statusOptions=useMemo(()=>unique(rows,'status'),[rows]);
 const classificationOptions=useMemo(()=>unique(rows,'classification'),[rows]);
 const dueOptions=useMemo(()=>unique(rows,'due'),[rows]);
 const companyOptions=useMemo(()=>unique(rows,'company'),[rows]);
 const vendorOptions=useMemo(()=>unique(rows,'vendor'),[rows]);
 const pageCount=Math.max(1,Math.ceil(filteredRows.length/pageSize));
 const tableRows=useMemo(()=>filteredRows.slice().sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice((page-1)*pageSize,page*pageSize),[filteredRows,page]);
 const activeFilterCount=[category,aging,status,classification,due,company,vendor,search].filter(Boolean).length;

 async function onFile(){setMsg('Upload hanya tersedia di halaman Admin.');}
 async function choose(s){const nextLabel=formatPeriod(s.period);const prevLabel=previousPeriod(nextLabel);const prevSnap=snapshots.find(x=>x.period===prevLabel)||null;setActive(s.id);setPeriod(nextLabel);setLoading(true);clearFilters();try{const [current,prev]=await Promise.all([getRows(s.dbPeriod||dbPeriod(s.period)),prevSnap?getRows(prevSnap.dbPeriod||dbPeriod(prevSnap.period)):Promise.resolve([])]);setRows(current);setPreviousRows(prev);setMsg(prevSnap?`Menampilkan snapshot ${nextLabel}. Pembanding: ${prevLabel}.`:`Menampilkan snapshot ${nextLabel}. Belum ada snapshot pembanding.`)}catch(err){setRows([]);setPreviousRows([]);setMsg(`Gagal mengambil data: ${err?.message||''}`)}finally{setLoading(false)}}
 function clearFilters(){setCategory('');setAging('');setStatus('');setClassification('');setDue('');setCompany('');setVendor('');setSearch('');setPage(1)}
 function toggle(setter,value,current){setter(current===value?'':value)}

 return <main>
  <header><div className="brandblock"><div className="eyebrow">SIG • FINANCE CONTROL</div><h1>GRIR Monitoring</h1><p>Monitoring outstanding, aging, vendor, dan status secara mudah dan cepat.</p></div><div className="headeractions"><div className="updated"><CalendarDays size={18}/><span>Data terakhir diperbarui<br/><b>{period||"Belum ada periode"}</b></span></div><a className="upload" href="/admin">ADMIN</a></div></header>
  <section className="toolbar">
   <div className="period"><CalendarDays size={18}/><span>PERIODE</span><select value={active} onChange={e=>{const s=snapshots.find(x=>x.id===e.target.value);if(s)choose(s)}}><option value="">Belum ada data</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.period}</option>)}</select><ChevronDown size={15}/></div>
   <div className="history"><Database size={18}/><select value={active} onChange={e=>{const s=snapshots.find(x=>x.id===e.target.value);if(s)choose(s)}}><option value="">Pilih snapshot tersimpan</option>{snapshots.map(s=><option key={s.id} value={s.id}>{s.period} • {(s.rowCount||s.rows?.length||0).toLocaleString('id-ID')} rows</option>)}</select><ChevronDown size={16}/></div>
  </section>
  {msg&&<div className="message">{msg}</div>}
  {!rows.length?<section className="empty"><FileSpreadsheet size={52}/><h2>Belum ada data</h2><p>Upload file GRIR untuk mulai melihat monitoring.</p><a className="primary" href="/admin">Masuk Admin untuk Upload</a></section>:<>
   <section className="filterbar">
    <div className="filtertitle"><SlidersHorizontal size={17}/><b>Filter Dashboard</b>{activeFilterCount>0&&<span className="filtercount">{activeFilterCount} aktif</span>}</div>
    <div className="filtercontrols">
     <FilterSelect label="Kategori" value={category} setValue={setCategory} options={categories}/>
     <FilterSelect label="Aging" value={aging} setValue={setAging} options={agingOptions}/>
     <FilterSelect label="Status" value={status} setValue={setStatus} options={statusOptions}/>
     <FilterSelect label="Klasifikasi" value={classification} setValue={setClassification} options={classificationOptions}/>
     <FilterSelect label="Jatuh Tempo" value={due} setValue={setDue} options={dueOptions}/>
     <FilterSelect label="Company" value={company} setValue={setCompany} options={companyOptions}/>
     {activeFilterCount>0&&<button className="clearbtn" onClick={clearFilters}><X size={15}/> Reset</button>}
    </div>
   </section>
   <section className="cards"><Card kind="total" title="TOTAL GRIR" value={money(total)} sub={`${filteredRows.length.toLocaleString('id-ID')} transaksi`} trend={trends.total} comparePeriod={previousSnapshot?.period}/><Card kind="due" title="DUE" value={money(dueAmount)} sub="Jatuh tempo" trend={trends.due} comparePeriod={previousSnapshot?.period}/><Card kind="notdue" title="NOT DUE" value={money(notDueAmount)} sub="Belum jatuh tempo" trend={trends.notdue} comparePeriod={previousSnapshot?.period}/><Card kind="vendor" title="VENDOR" value={vendorCount} sub="Total vendor" trend={trends.vendor} comparePeriod={previousSnapshot?.period}/></section>
   <section className="analysisgrid"><Panel title="Aging GRIR"><div className="panelcontrol">Amount <ChevronDown size={14}/></div><AgingChart data={agings} active={aging} onClick={(v)=>toggle(setAging,v,aging)}/></Panel><Panel title="Ringkasan Aging"><AgingSummary data={agings} total={total}/></Panel></section><section className="fullpanel"><Panel title="Klasifikasi GRIR"><div className="panelcontrol">Amount (log scale) <ChevronDown size={14}/></div><ClassificationChart rows={filteredRows} active={classification} onStatusClick={(v)=>toggle(setClassification,v,classification)}/></Panel></section><section className="grid"><Panel title="GRIR by Category"><Bars data={cats} active={category} onClick={(v)=>toggle(setCategory,v,category)}/></Panel><Panel title="Top 10 Vendor"><Bars data={vendors} active={vendor} onClick={(v)=>toggle(setVendor,v,vendor)}/></Panel><Panel title="Company Code"><Bars data={companies} active={company} onClick={(v)=>toggle(setCompany,v,company)}/></Panel></section>
   <section className="tablebox"><div className="tablehead"><div><h2>Klasifikasi GRIR</h2><span>Daftar transaksi berdasarkan status, klasifikasi, vendor, dan kategori • {filteredRows.length.toLocaleString('id-ID')} transaksi</span></div><div className="tabletools"><div className="search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari vendor, dokumen, atau deskripsi..."/></div><select value={vendor} onChange={e=>setVendor(e.target.value)}><option value="">Semua Vendor</option>{vendorOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></div></div><div className="activechips">{category&&<Chip label={'Kategori: '+category} onClear={()=>setCategory('')}/>} {aging&&<Chip label={'Aging: '+aging} onClear={()=>setAging('')}/>} {status&&<Chip label={'Status: '+status} onClear={()=>setStatus('')}/>} {classification&&<Chip label={'Klasifikasi: '+classification} onClear={()=>setClassification('')}/>} {due&&<Chip label={'Jatuh Tempo: '+due} onClear={()=>setDue('')}/>} {company&&<Chip label={'Company: '+company} onClear={()=>setCompany('')}/>} {vendor&&<Chip label={'Vendor: '+vendor} onClear={()=>setVendor('')}/>}</div><div className="tablewrap"><table><thead><tr><th>No</th><th>Company Code</th><th>Vendor</th><th>No. Dokumen</th><th>Jatuh Tempo</th><th>Umur (Hari)</th><th>Jumlah (LC)</th><th>Status</th><th>Klasifikasi</th><th>Kategori</th></tr></thead><tbody>{tableRows.length?tableRows.map((r,i)=><tr key={(r.doc||'row')+'-'+i}><td>{(page-1)*pageSize+i+1}</td><td>{r.company}</td><td>{r.vendor}</td><td>{r.doc}</td><td>{r.due}</td><td>{r.aging}</td><td className="num">{money(r.amount)}</td><td><span className={`statuspill ${String(r.status).toLowerCase()==='abnormal'?'abnormal':''}`}>{r.status||'-'}</span></td><td><span className="classpill">{r.classification||'-'}</span></td><td>{r.category}</td></tr>):<tr><td colSpan="10" className="nodata">Tidak ada transaksi yang sesuai filter.</td></tr>}</tbody></table></div><div className="pagination"><span>Menampilkan {filteredRows.length?((page-1)*pageSize+1):0} - {Math.min(page*pageSize,filteredRows.length)} dari {filteredRows.length.toLocaleString('id-ID')} transaksi</span><div><button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹</button>{Array.from({length:Math.min(pageCount,5)},(_,i)=>i+1).map(n=><button key={n} className={page===n?'activepage':''} onClick={()=>setPage(n)}>{n}</button>)}{pageCount>5&&<><span className="dots">…</span><button className={page===pageCount?'activepage':''} onClick={()=>setPage(pageCount)}>{pageCount.toLocaleString('id-ID')}</button></>}<button disabled={page===pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>›</button></div></div></section>
   <section className="snapshots"><h2>Saved Snapshots</h2>{snapshots.map(s=><div className="snapshot" key={s.id}><button onClick={()=>choose(s)}><CalendarDays size={16}/><b>{formatPeriod(s.period)}</b><span>{Number(s.rowCount||0).toLocaleString('id-ID')} rows</span></button></div>)}</section>
  </>}
  <footer>GRIR Dashboard • Public Read-Only • Data terpusat</footer>
 </main>
}
function FilterSelect({label,value,setValue,options}){return <label className="filterselect"><span>{label}</span><select value={value} onChange={e=>setValue(e.target.value)}><option value="">Semua</option>{options.map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
function Chip({label,onClear}){return <button className="chip" onClick={onClear}>{label}<X size={13}/></button>}
function Card({kind,title,value,sub,trend,comparePeriod}){const icons={total:"◉",due:"◷",notdue:"◷",vendor:"●"};const hasComparison=trend!==null&&trend!==undefined;const isNew=hasComparison&&trend===null;const positive=hasComparison&&trend>0;const negative=hasComparison&&trend<0;const label=!hasComparison?'—':isNew?'Baru':`${positive?'▲':'▼'} ${Math.abs(trend).toFixed(1).replace('.',',')}%`;return <div className={`card card-${kind||"default"}`}><div className="cardtop"><span className="cardicon">{icons[kind]||"•"}</span><span className="cardtitle">{title}</span></div><strong>{value}</strong><small>{sub}</small><div className={`cardtrend ${positive?'up':''} ${negative?'down':''} ${!hasComparison?'muted':''}`}><b>{label}</b><span>{hasComparison?`vs ${comparePeriod}`:'Belum ada pembanding'}</span></div></div>}
function Panel({title,children}){return <div className="panel"><h2>{title}</h2>{children}</div>}
function Bars({data,active,onClick}){const max=data[0]?.[1]||1;return <div className="bars">{data.slice(0,10).map(([k,v])=><button className={'baritem '+(active===k?'selected':'')} key={k} onClick={()=>onClick?.(k)}><div className="barlabel"><span title={k}>{k||'Lainnya'}</span><b>{money(v)}</b></div><div className="track"><div className="fill" style={{width:`${Math.max(2,(v/max)*100)}%`}}/></div></button>)}</div>}

function AgingChart({data,active,onClick}){
 const order=['1. Current','2. 1-45','3. 46-135','4. 136-365','5. >365'];
 const map=Object.fromEntries(data); const vals=order.map(k=>map[k]||0); const max=Math.max(...vals,1); const w=760,h=300,pad={l:58,r:22,t:35,b:55};
 const x=i=>pad.l+i*((w-pad.l-pad.r)/(order.length-1)); const y=v=>pad.t+(1-(v/max))*(h-pad.t-pad.b); const points=vals.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
 const ticks=[0,.25,.5,.75,1].map(t=>({v:max*t,y:y(max*t)}));
 return <div className="agingchartwrap"><svg className="agingchart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Aging GRIR line chart">
  {ticks.map((t,i)=><g key={i}><line x1={pad.l} x2={w-pad.r} y1={t.y} y2={t.y} className="chartgrid"/><text x={pad.l-10} y={t.y+4} textAnchor="end" className="charttick">{money(t.v).replace('Rp ','')}</text></g>)}
  <polyline points={`${pad.l},${h-pad.b} ${points} ${x(vals.length-1)},${h-pad.b}`} className="agingarea"/>
  <polyline points={points} className="agingline"/>
  {vals.map((v,i)=><g key={order[i]} onClick={()=>onClick?.(order[i])} className="chartpointgroup"><circle cx={x(i)} cy={y(v)} r={active===order[i]?8:6} className={active===order[i]?'chartpoint active':'chartpoint'}/><text x={x(i)} y={Math.max(18,y(v)-13)} textAnchor="middle" className="chartvalue">{money(v).replace('Rp ','')}</text><text x={x(i)} y={h-pad.b+23} textAnchor="middle" className="chartlabel">{order[i]}</text></g>)}
  <text x={(pad.l+w-pad.r)/2} y={h-8} textAnchor="middle" className="axislabel">Umur Hutang</text><text transform={`translate(15 ${(pad.t+h-pad.b)/2}) rotate(-90)`} textAnchor="middle" className="axislabel">Amount</text>
 </svg></div>
}
function AgingSummary({data,total}){
 const order=['1. Current','2. 1-45','3. 46-135','4. 136-365','5. >365']; const map=Object.fromEntries(data);
 return <div className="agingsummary"><div className="summaryhead"><span>Umur Hutang</span><span>Amount</span><span>% dari Total</span><span>Visual</span></div>{order.map((k,i)=>{const v=map[k]||0;const pct=total?Math.min(100,(v/total)*100):0;return <div className="summaryrow" key={k}><span>{k}</span><b>{money(v)}</b><span>{pct.toFixed(1).replace('.',',')}%</span><div className="summarytrack"><i style={{width:`${pct}%`}}/></div></div>})}</div>
}
function ClassificationChart({rows,active,onStatusClick}){
 const cats=['Interco','Third Parties','BUMN','Afiliasi'];
 const statuses=['Current','Dokumen di user / vendor','Konfirmasi user / vendor','Proses Koreksi (Jurnal Manual)','Dokumen akan ditagihkan','Parked Dokumen'];
 const colors=['#2f6fed','#70a7e8','#42b99b','#f4c84a','#ef8a4a','#d94b4b'];
 const matrix=cats.map(cat=>statuses.map(st=>Math.abs(rows.filter(r=>r.category===cat&&r.classification===st).reduce((a,r)=>a+Number(r.amount||0),0))));
 const maxRaw=Math.max(...matrix.flat(),1); const logMax=Math.log10(maxRaw+1); const scale=v=>v<=0?0:(Math.log10(v+1)/logMax)*100;
 return <div className="classwrap"><div className="classchart"><div className="logaxis"><span>1 T</span><span>100 M</span><span>10 M</span><span>1 M</span><span>100 jt</span><span>10 jt</span><span>0</span></div><div className="classplot">{cats.map((cat,ci)=><div className="classgroup" key={cat}>{statuses.map((st,si)=>{const v=matrix[ci][si];return <button key={st} title={`${cat} • ${st} • ${money(v)}`} className={`classbar ${active===st?'chosen':''}`} style={{height:`${Math.max(v?3:0,scale(v)*.78)}%`,background:colors[si]}} onClick={()=>onStatusClick?.(st)}><span>{money(v).replace('Rp ','')}</span></button>})}<div className="classcat">{cat}</div></div>)}</div></div><div className="classlegend">{statuses.map((st,i)=><button key={st} onClick={()=>onStatusClick?.(st)} className={active===st?'legendactive':''}><i style={{background:colors[i]}}/>{st}</button>)}</div></div>
}
