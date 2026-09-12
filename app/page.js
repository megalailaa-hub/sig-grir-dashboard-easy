'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Home, FileText, BarChart3, Truck, CalendarDays, ChevronDown,
  Filter, RotateCcw, Layers3, AlertTriangle, Users, Building2,
  Search, Database, ArrowUpRight, ArrowDownRight, Eye, RefreshCw
} from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const money = (v) => {
  const n = Math.abs(Number(v) || 0);
  if (n >= 1e12) return `Rp ${(n/1e12).toFixed(2).replace('.', ',')} T`;
  if (n >= 1e9) return `Rp ${(n/1e9).toFixed(2).replace('.', ',')} M`;
  if (n >= 1e6) return `Rp ${(n/1e6).toFixed(2).replace('.', ',')} Jt`;
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
};
const integer = (v) => Math.round(Number(v) || 0).toLocaleString('id-ID');
const pct = (v) => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;
const clean = (v) => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const signedAmount = (r) => Number(r.amount_local_currency ?? r.amount ?? r.amount_in_local_currency ?? 0) || 0;

async function db(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

async function getSnapshots() {
  const res = await db('grir_uploads?select=*&order=period.desc,uploaded_at.desc');
  return res.json();
}

async function getRows(period, onProgress) {
  const filter = encodeURIComponent(period);
  const head = await fetch(
    `${SUPABASE_URL}/rest/v1/grir_transactions?select=id&period=eq.${filter}&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'count=exact',
        Range: '0-0'
      },
      cache: 'no-store'
    }
  );
  if (!head.ok) throw new Error(await head.text());

  const range = head.headers.get('content-range') || '';
  const total = Number((range.split('/')[1] || '').replace('*','')) || 0;
  const pageSize = 1000;
  const offsets = Array.from({length: Math.ceil(total / pageSize)}, (_, i) => i * pageSize);
  const out = [];

  for (let start = 0; start < offsets.length; start += 8) {
    const batch = offsets.slice(start, start + 8);
    const rows = await Promise.all(batch.map(async (from) => {
      const to = from + pageSize - 1;
      const res = await db(
        `grir_transactions?select=*&period=eq.${filter}&order=id.asc&limit=${pageSize}&offset=${from}`
      );
      return res.json();
    }));
    rows.forEach(x => out.push(...x));
    onProgress?.(Math.min(out.length, total), total);
  }
  return out;
}

function Sparkline({ type = 'up' }) {
  const d = type === 'down'
    ? 'M3 34 C20 31 26 37 43 28 S66 24 82 30 S105 21 127 25'
    : 'M3 31 C19 35 28 23 42 27 S65 18 82 25 S104 14 127 8';
  return <svg className="spark" viewBox="0 0 130 40" preserveAspectRatio="none"><path d={d}/></svg>;
}

function MiniLine({ current, previous }) {
  const a = [0.72,0.74,0.81,0.79,0.86,1];
  const b = [0.61,0.65,0.69,0.67,0.75,0.82];
  const make = (vals) => vals.map((v,i) => `${i ? 'L' : 'M'} ${30+i*94} ${145-v*100}`).join(' ');
  return (
    <svg className="trend-svg" viewBox="0 0 520 170">
      <g className="grid"><line x1="30" y1="35" x2="500" y2="35"/><line x1="30" y1="85" x2="500" y2="85"/><line x1="30" y1="135" x2="500" y2="135"/></g>
      <path className="line-prev" d={make(b)}/>
      <path className="line-current" d={make(a)}/>
      {[0,1,2,3,4,5].map(i => <circle key={i} className="dot-current" cx={30+i*94} cy={145-a[i]*100} r="4"/>)}
      <text x="30" y="162">03</text><text x="120" y="162">04</text><text x="214" y="162">05</text><text x="308" y="162">06</text><text x="402" y="162">07</text><text x="492" y="162" textAnchor="end">08</text>
    </svg>
  );
}

function Donut({ data, total }) {
  const colors = ['#2f75e8','#20ad80','#f5ad2e','#8066e8','#9ba9bf'];
  const r = 58, cx = 80, cy = 80, c = 2*Math.PI*r;
  let acc = 0;
  return (
    <svg className="donut" viewBox="0 0 160 160">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#edf3fb" strokeWidth="22"/>
      {data.map((x,i) => {
        const len = c*(x.value/Math.max(total,1));
        const el = <circle key={x.name} cx={cx} cy={cy} r={r} fill="none" stroke={colors[i%colors.length]}
          strokeWidth="22" strokeDasharray={`${Math.max(len-2,0)} ${c-len+2}`}
          strokeDashoffset={-acc} transform={`rotate(-90 ${cx} ${cy})`}/>;
        acc += len;
        return el;
      })}
      <text x="80" y="76" textAnchor="middle" className="donut-label">Rp</text>
      <text x="80" y="94" textAnchor="middle" className="donut-value">{money(total).replace('Rp ','')}</text>
    </svg>
  );
}

function BarList({ items, total }) {
  return <div className="bar-list">
    {items.map((x,i) => {
      const p = total ? Math.abs(x.value)/total*100 : 0;
      return <div className="bar-row" key={x.name}>
        <div className="bar-name">{x.name}</div>
        <div className="bar-track"><div className={`bar-fill b${i}`} style={{width:`${Math.max(p,2)}%`}}/></div>
        <div className="bar-val">{money(x.value)} <span>({pct(p)})</span></div>
      </div>;
    })}
  </div>;
}

function Card({ icon, title, value, subtitle, delta, down, tone='blue' }) {
  return <div className={`kpi-card ${tone}`}>
    <div className="kpi-top"><div className="icon-box">{icon}</div><div className="kpi-title">{title}</div></div>
    <div className="kpi-value">{value}</div>
    <div className="kpi-sub">{subtitle}</div>
    {delta !== undefined && <div className={`kpi-delta ${down ? 'down':'up'}`}>{down ? <ArrowDownRight size={17}/> : <ArrowUpRight size={17}/>} {delta}</div>}
    <Sparkline type={down ? 'down':'up'}/>
  </div>;
}


function downloadCsv(rows) {
  const headers = [
    'No','Company','Vendor','No. Dokumen','Jatuh Tempo','Aging',
    'Jumlah (LC)','Status','Kategori','Action'
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(esc).join(','),
    ...rows.map((r,i) => [
      i + 1,
      clean(r.company_code),
      clean(r.vendor_name),
      clean(r.document_number),
      clean(r.due_status),
      clean(r.age_group),
      signedAmount(r),
      clean(r.status),
      clean(r.category),
      clean(r.action) || clean(r.remark)
    ].map(esc).join(','))
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GRIR_${periodSafe(rows)}_Transaction_Detail.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function periodSafe(rows) {
  return rows?.length ? 'filtered' : 'data';
}


const field = (r, ...keys) => {
  for (const k of keys) {
    const v = r?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
};
const categoryOf = (r) => clean(field(r,'category','kategori'));
const agingOf = (r) => clean(field(r,'age_group','aging','umur_hutang'));
const statusOf = (r) => clean(field(r,'status'));
const classificationOf = (r) => clean(field(r,'classification','klasifikasi','status_grouping'));
const dueOf = (r) => clean(field(r,'due_status','jatuh_tempo'));
const companyOf = (r) => clean(field(r,'company_code','company'));
const vendorOf = (r) => clean(field(r,'vendor_name','vendor','nama_vendor'));
const actionOf = (r) => clean(field(r,'action','remark','status_grouping'));

export default function Page() {
  const [snapshots, setSnapshots] = useState([]);
  const [period, setPeriod] = useState('');
  const [rows, setRows] = useState([]);
  const [prevRows, setPrevRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prevLoading, setPrevLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [filters, setFilters] = useState({category:'', aging:'', status:'', klasifikasi:'', due:'', company:''});
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await getSnapshots();
        setSnapshots(s || []);
        if (s?.length) setPeriod(s[0].period);
      } catch(e) { console.error(e); setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!period) return;
    let cancelled = false;
    setLoading(true); setRows([]); setPrevRows([]);
    setProgress('Menyiapkan data...');
    (async () => {
      try {
        const current = await getRows(period, (done,total) => setProgress(`Memuat ${integer(done)} / ${integer(total)} transaksi`));
        if (!cancelled) {
          setRows(current);
          setLoading(false);
          setProgress('');
        }
        const prev = snapshots.find(x => x.period !== period);
        if (prev) {
          setPrevLoading(true);
          const p = await getRows(prev.period);
          if (!cancelled) setPrevRows(p);
          setPrevLoading(false);
        }
      } catch(e) {
        console.error(e);
        if (!cancelled) { setLoading(false); setProgress('Gagal mengambil data.'); }
      }
    })();
    return () => { cancelled = true; };
  }, [period, snapshots]);

  const opts = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map(r => clean(r[key])).filter(Boolean))].sort();
    return {
      category: [...new Set(rows.map(categoryOf).filter(Boolean))].sort(),
      aging: [...new Set(rows.map(agingOf).filter(Boolean))].sort(),
      status: [...new Set(rows.map(statusOf).filter(Boolean))].sort(),
      klasifikasi: [...new Set(rows.map(classificationOf).filter(Boolean))].sort(),
      company: [...new Set(rows.map(companyOf).filter(Boolean))].sort(),
      due: [...new Set(rows.map(dueOf).filter(Boolean))].sort()
    };
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase();
    const hay = [vendorOf(r),field(r,'document_number','document_no'),field(r,'purchasing_document','po'),companyOf(r),field(r,'text'),actionOf(r)].map(clean).join(' ').toLowerCase();
    return (!q || hay.includes(q))
      && (!filters.category || categoryOf(r)===filters.category)
      && (!filters.aging || agingOf(r)===filters.aging)
      && (!filters.status || statusOf(r)===filters.status)
      && (!filters.klasifikasi || classificationOf(r)===filters.klasifikasi)
      && (!filters.due || dueOf(r)===filters.due)
      && (!filters.company || companyOf(r)===filters.company);
  }), [rows,filters,search]);

  const stats = useMemo(() => {
    const total = filtered.reduce((a,r)=>a+signedAmount(r),0);
    const notDue = filtered.filter(r=>clean(r.due_status).toLowerCase().includes('belum')).reduce((a,r)=>a+signedAmount(r),0);
    const due = filtered.filter(r=>clean(r.due_status).toLowerCase().includes('jatuh')).reduce((a,r)=>a+signedAmount(r),0);
    const vendors = new Set(filtered.map(r=>clean(r.vendor_name)).filter(Boolean)).size;
    const po = new Set(filtered.map(r=>clean(r.purchasing_document)).filter(Boolean)).size;
    return { total:Math.abs(total), notDue:Math.abs(notDue), due:Math.abs(due), vendors, po, count:filtered.length };
  }, [filtered]);

  const prevStats = useMemo(() => {
    const total = prevRows.reduce((a,r)=>a+signedAmount(r),0);
    const notDue = prevRows.filter(r=>clean(r.due_status).toLowerCase().includes('belum')).reduce((a,r)=>a+signedAmount(r),0);
    const due = prevRows.filter(r=>clean(r.due_status).toLowerCase().includes('jatuh')).reduce((a,r)=>a+signedAmount(r),0);
    const vendors = new Set(prevRows.map(r=>clean(r.vendor_name)).filter(Boolean)).size;
    const po = new Set(prevRows.map(r=>clean(r.purchasing_document)).filter(Boolean)).size;
    return {total:Math.abs(total),notDue:Math.abs(notDue),due:Math.abs(due),vendors,po,count:prevRows.length};
  }, [prevRows]);

  const change = (a,b) => b ? `${a>=b?'↗':'↘'} ${pct(Math.abs((a-b)/b)*100)}` : '—';
  const downFor = (a,b) => b ? a < b : false;

  const category = useMemo(() => {
    const m={};
    filtered.forEach(r=>{const k=clean(r.category)||'Lainnya'; m[k]=(m[k]||0)+signedAmount(r);});
    return Object.entries(m).map(([name,value])=>({name,value:Math.abs(value)})).sort((a,b)=>b.value-a.value).slice(0,5);
  },[filtered]);

  const aging = useMemo(() => {
    const order = ['Current','1-45','46-135','136-365','>365'];
    const m = Object.fromEntries(order.map(x => [x, 0]));

    const normalizeAging = (value) => {
      const s = clean(value).toLowerCase();
      if (!s) return '';
      if (s.includes('current')) return 'Current';
      if (s.includes('1-45') || s.includes('1 - 45')) return '1-45';
      if (s.includes('46-135') || s.includes('46 - 135')) return '46-135';
      if (s.includes('136-365') || s.includes('136 - 365')) return '136-365';
      if (s.includes('>365') || s.includes('> 365')) return '>365';
      return '';
    };

    filtered.forEach(r => {
      const key = normalizeAging(field(r,'age_group','aging','umur_hutang'));
      if (key) m[key] += signedAmount(r);
    });

    return order.map(name => ({
      name,
      value: Math.abs(m[name])
    }));
  }, [filtered]);

  const status = useMemo(() => {
    const m={}; filtered.forEach(r=>{const k=clean(r.status)||'Lainnya';m[k]=(m[k]||0)+signedAmount(r);});
    return Object.entries(m).map(([name,value])=>({name,value:Math.abs(value)})).sort((a,b)=>b.value-a.value);
  },[filtered]);

  const vendorTop = useMemo(() => {
    const m={}; filtered.forEach(r=>{const k=clean(r.vendor_name)||'Tidak diketahui';m[k]=(m[k]||0)+signedAmount(r);});
    return Object.entries(m).map(([name,value])=>({name,value:Math.abs(value),count:0})).sort((a,b)=>b.value-a.value).slice(0,5);
  },[filtered]);

  const companyTop = useMemo(() => {
    const m={}; filtered.forEach(r=>{const k=clean(r.company_code)||'N/A';m[k]=(m[k]||0)+signedAmount(r);});
    return Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,5);
  },[filtered]);

  const actions = useMemo(() => {
    const m={};
    filtered.forEach(r=>{
      const action=clean(r.action);
      const remark=clean(r.remark);
      const grouping=clean(r.status_grouping);
      const desc=action||remark||grouping||'Perlu review';
      m[desc]=(m[desc]||0)+signedAmount(r);
    });
    return Object.entries(m).map(([name,value])=>({name,value:Math.abs(value)})).sort((a,b)=>b.value-a.value).slice(0,5);
  },[filtered]);

  const reset = () => { setFilters({category:'',aging:'',status:'',klasifikasi:'',due:'',company:''}); setSearch(''); };

  if (!snapshots.length && loading) return <div className="loading"><RefreshCw className="spin"/><b>Memuat Monitoring Akun Hutang dan GRIR</b><span>Mengambil snapshot dari database pusat...</span></div>;

  return <main>
    <header className="header">
      <div className="brand">
        <div className="sig-mark">SIG</div>
        <div><div className="brand-small">DATA CONTROL</div><div className="brand-title">Monitoring Akun Hutang dan GRIR</div><div className="brand-desc">Monitoring Akun Hutang dan GRIR • GL 21290001</div></div>
      </div>
      <nav className="nav">
        <a className="active"><Home size={18}/>Home</a><a><FileText size={18}/>GRIR</a><a><BarChart3 size={18}/>Hutang</a><a><Truck size={18}/>Freight</a>
      </nav>
      <div className="header-right">
        <div className="period-box"><CalendarDays size={18}/><div><small>Periode</small><b>{period || '—'}</b></div><ChevronDown size={16}/></div>
        <div className="admin"><span>A</span><b>ADMIN</b><ChevronDown size={16}/></div>
      </div>
    </header>

    <section className="hero">
      <div className="hero-icon"><BarChart3 size={32}/></div>
      <div><div className="eyebrow">FROM RECEIVING TO RECORDING</div><h1>GRIR Monitoring</h1><p>Visibility penuh atas outstanding, aging, vendor, klasifikasi, dan action yang membutuhkan perhatian.</p></div>
      <div className="hero-building"><div></div><div></div><div></div><strong>Stronger<br/>Together<br/><em>for a Sustainable<br/>Future</em></strong></div>
    </section>

    <section className="snapshot-row">
      <div className="snapshot-left"><Database size={22}/><b>Snapshot</b>
        <select value={period} onChange={e=>setPeriod(e.target.value)}>
          {snapshots.map(s=><option key={s.id||s.period} value={s.period}>{s.period} • {integer(s.row_count || 0)} rows</option>)}
        </select>
      </div>
      <span>Data terpusat • Public Read-Only</span>
    </section>

    <section className="filter-card">
      <div className="filter-title"><Filter size={22}/><b>Filter Dashboard</b></div>
      {[
        ['category','Kategori'],['aging','Aging'],['status','Status'],['klasifikasi','Klasifikasi'],['due','Jatuh Tempo'],['company','Company']
      ].map(([key,label])=><label key={key}><small>{label}</small><select aria-label={label} value={filters[key]} onChange={e=>setFilters(prev=>({...prev,[key]:e.target.value}))}><option value="">Semua</option>{opts[key].map(x=><option key={x} value={x}>{x}</option>)}</select></label>)}
      <button className="reset" onClick={reset}><RotateCcw size={17}/> Reset</button>
    </section>

    <section className="kpi-grid">
      <Card tone="primary" icon={<Layers3/>} title="Total GRIR" value={money(stats.total)} subtitle={`${integer(stats.count)} transaksi`} delta={prevLoading?'…':change(stats.total,prevStats.total)} down={downFor(stats.total,prevStats.total)}/>
      <Card icon={<FileText/>} title="Jumlah Transaksi" value={integer(stats.count)} subtitle="Dokumen GRIR" delta={prevLoading?'…':change(stats.count,prevStats.count)} down={downFor(stats.count,prevStats.count)}/>
      <Card tone="green" icon={<Database/>} title="Belum Jatuh Tempo" value={money(stats.notDue)} subtitle="Not Due" delta={prevLoading?'…':change(stats.notDue,prevStats.notDue)} down={downFor(stats.notDue,prevStats.notDue)}/>
      <Card tone="red" icon={<AlertTriangle/>} title="Jatuh Tempo" value={money(stats.due)} subtitle="Due" delta={prevLoading?'…':change(stats.due,prevStats.due)} down={downFor(stats.due,prevStats.due)}/>
      <Card tone="purple" icon={<Users/>} title="Vendor" value={integer(stats.vendors)} subtitle="Vendor unik" delta={prevLoading?'…':change(stats.vendors,prevStats.vendors)} down={downFor(stats.vendors,prevStats.vendors)}/>
      <Card tone="yellow" icon={<FileText/>} title="Purchasing Document" value={integer(stats.po)} subtitle="PO unik" delta={prevLoading?'…':change(stats.po,prevStats.po)} down={downFor(stats.po,prevStats.po)}/>
    </section>

    <section className="chart-grid">
      <div className="panel trend-panel">
        <div className="panel-head"><div><h2><BarChart3 size={20}/> Trend Total GRIR</h2><p>Perbandingan snapshot yang tersedia</p></div><select><option>{period} vs {snapshots.find(x=>x.period!==period)?.period || '—'}</option></select></div>
        <MiniLine current={stats.total} previous={prevStats.total}/>
        <div className="legend"><span><i className="current-dot"/> {period}</span><span><i className="prev-dot"/> {snapshots.find(x=>x.period!==period)?.period || 'Previous'}</span></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2><Layers3 size={20}/> GRIR by Category</h2><button className="mini-btn">Nilai (Rp) <ChevronDown size={14}/></button></div>
        <div className="donut-wrap"><Donut data={category} total={category.reduce((a,x)=>a+x.value,0)}/><div className="donut-legend">{category.map((x,i)=><div key={x.name}><i className={`legend-dot d${i}`}/><span>{x.name}</span><b>{pct(x.value/(category.reduce((a,y)=>a+y.value,0)||1)*100)}</b></div>)}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2><BarChart3 size={20}/> Aging Analysis</h2><button className="mini-btn">Nilai (Rp) <ChevronDown size={14}/></button></div>
        <BarList items={aging} total={aging.reduce((a,x)=>a+x.value,0)}/>
      </div>
    </section>

    <section className="table-grid">
      <TablePanel title="Top 5 Vendor" icon={<Users/>} rows={vendorTop} type="vendor" total={stats.total}/>
      <TablePanel title="Top 5 Company" icon={<Building2/>} rows={companyTop} type="company" total={stats.total}/>
      <TablePanel title="Action Required" icon={<AlertTriangle/>} rows={actions} type="action" total={stats.total}/>
    </section>

    <section className="panel detail-panel">
      <div className="panel-head">
        <div><h2><FileText size={20}/> Transaction Detail</h2><p>{integer(filtered.length)} transaksi sesuai filter • Menampilkan 10 item</p></div>
        <div className="detail-actions">
          <div className="search"><Search size={17}/><input placeholder="Cari vendor, dokumen, PO..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <button className="download-btn" onClick={() => downloadCsv(filtered)}><FileText size={16}/> Download</button>
        </div>
      </div>
      <div className="table-scroll"><table><thead><tr><th>No</th><th>Company</th><th>Vendor</th><th>No. Dokumen</th><th>Jatuh Tempo</th><th>Aging</th><th>Jumlah (LC)</th><th>Status</th><th>Kategori</th><th>Action</th></tr></thead>
      <tbody>{filtered.slice(0,10).map((r,i)=><tr key={r.id||i}><td>{i+1}</td><td>{clean(r.company_code)}</td><td className="strong">{clean(r.vendor_name)||'—'}</td><td>{clean(r.document_number)||'—'}</td><td>{clean(r.due_status)||'—'}</td><td>{clean(r.age_group)||'—'}</td><td className="amount">{money(signedAmount(r))}</td><td><span className={`badge ${clean(r.status).toLowerCase()==='abnormal'?'bad':'ok'}`}>{clean(r.status)||'—'}</span></td><td>{clean(r.category)||'—'}</td><td>{clean(r.action)||clean(r.remark)||'—'}</td></tr>)}</tbody></table></div>
      {filtered.length>10 && <div className="table-foot">Menampilkan 10 transaksi pertama dari {integer(filtered.length)}. Klik Download untuk mengunduh seluruh data sesuai filter.</div>}
    </section>

    <footer>SIG • DATA CONTROL <span>GRIR Monitoring • Public Read-Only</span></footer>
  </main>;
}

function TablePanel({title,icon,rows,type,total}) {
  return <div className="panel table-panel">
    <div className="panel-head"><h2>{icon} {title}</h2><button className="link-btn">Lihat Semua</button></div>
    <table><thead><tr><th>No</th><th>{type==='vendor'?'Vendor':type==='company'?'Company':'Deskripsi'}</th><th>Nilai GRIR (Rp)</th><th>%</th></tr></thead>
      <tbody>{rows.map((x,i)=><tr key={x.name}><td>{i+1}</td><td className="strong">{x.name}</td><td>{money(x.value)}</td><td>{pct(total?x.value/total*100:0)}</td></tr>)}</tbody>
    </table>
  </div>;
}
