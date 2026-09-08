'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { CheckCircle2, Loader2, UploadCloud, LogOut, ArrowLeft, AlertCircle } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const clean = (v) => v == null ? '' : String(v).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

function toNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v == null || v === '') return 0;
  let s = String(v).trim().replace(/\s/g, '').replace(/Rp/gi, '');
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  } else if ((s.match(/,/g) || []).length > 1) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    const parts = s.split(',');
    s = parts[1]?.length === 3 ? parts.join('') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : 0;
}

function field(r, names) {
  const wanted = names.map(x => x.toLowerCase());
  const key = Object.keys(r).find(x => wanted.includes(String(x).trim().toLowerCase()));
  return key === undefined ? '' : r[key];
}

function excelDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = clean(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function inferPeriod(name, rows) {
  const first = rows[0] || {};
  const rawPeriod = field(first, ['Period', 'period']);
  const p = clean(rawPeriod);
  const iso = p.match(/^(20\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  const m = String(name).match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[._-](20\d{2}|\d{2})(?:[^0-9]|$)/);
  if (m) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${String(m[1]).padStart(2, '0')}-01`;
  const d = new Date(field(first, ['Posting Date']));
  return !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` : '';
}

function mapRow(r, period) {
  return {
    period,
    company_code: clean(field(r, ['Company Code'])),
    account: clean(field(r, ['Account'])),
    document_number: clean(field(r, ['Document Number'])),
    document_type: clean(field(r, ['Document Type'])),
    reference: clean(field(r, ['Reference'])),
    invoice_reference: clean(field(r, ['Invoice reference'])),
    document_date: excelDate(field(r, ['Document Date'])),
    posting_date: excelDate(field(r, ['Posting Date'])),
    due_date: excelDate(field(r, ['Due Date'])),
    quantity: toNumber(field(r, ['Quantity'])),
    amount: toNumber(field(r, ['Amount in local currency'])),
    local_currency: clean(field(r, ['Local Currency'])),
    amount_document_currency: toNumber(field(r, ['Amount in doc. curr.'])),
    document_currency: clean(field(r, ['Document currency'])),
    document_header_text: clean(field(r, ['Document Header Text'])),
    text: clean(field(r, ['Text'])),
    purchasing_document: clean(field(r, ['Purchasing Document'])),
    status: clean(field(r, ['Status'])),
    status_grouping: clean(field(r, ['Status Grouping'])),
    vendor_code: clean(field(r, ['Kode Vendor'])),
    vendor_name: clean(field(r, ['Nama Vendor'])),
    plant: clean(field(r, ['Plant'])),
    user_name: clean(field(r, ['User Name'])),
    category: clean(field(r, ['Kategori'])),
    due_status: clean(field(r, ['Jatuh Tempo'])),
    age: toNumber(field(r, ['Umur'])),
    age_group: clean(field(r, ['Umur Hutang'])),
    remark: clean(field(r, ['Remark'])),
    action: clean(field(r, ['Action'])),
    remark_po: clean(field(r, ['Remark PO'])),
    remark_rekon: clean(field(r, ['Remark Tim Rekon'])),
    confirmation: clean(field(r, ['Konfirmasi'])),
    concenate: clean(field(r, ['Concenate'])),
    snapshot_date: period,
  };
}

function formatPeriod(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}.${m[1]}` : iso;
}

export default function Admin() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function login(e) {
    e.preventDefault();
    setMsg('Login...');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : 'Login berhasil.');
  }

  async function upload(e) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setProgress(0);
    setMsg('Membaca Excel...');
    let uploadId = null;

    try {
      const { data: current } = await supabase.auth.getSession();
      if (!current.session) throw new Error('Sesi login sudah berakhir.');

      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets['Data Source'];
      if (!ws) throw new Error('Sheet Data Source tidak ditemukan.');
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      if (!raw.length) throw new Error('Sheet Data Source kosong.');

      const period = inferPeriod(file.name, raw);
      if (!period) throw new Error('Periode file tidak dapat dibaca.');
      const rows = raw.map(r => mapRow(r, period));
      if (!rows.some(r => r.amount !== 0)) throw new Error('Amount in local currency terbaca 0.');

      setMsg(`Menyiapkan ${rows.length.toLocaleString('id-ID')} transaksi periode ${formatPeriod(period)}...`);

      const { data: upload, error: uploadError } = await supabase
        .from('grir_uploads')
        .insert({ file_name: file.name, period, row_count: rows.length, status: 'processing' })
        .select('id')
        .single();
      if (uploadError) throw uploadError;
      uploadId = upload.id;

      const chunkSize = 1000;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize).map(r => ({ ...r, upload_id: uploadId }));
        const { error } = await supabase.from('grir_transactions').insert(chunk);
        if (error) throw error;
        const done = Math.min(i + chunkSize, rows.length);
        const pct = Math.round((done / rows.length) * 100);
        setProgress(pct);
        setMsg(`Menyimpan data... ${done.toLocaleString('id-ID')} / ${rows.length.toLocaleString('id-ID')} baris (${pct}%)`);
      }

      const { error: finishError } = await supabase
        .from('grir_uploads')
        .update({ status: 'success', error_message: null })
        .eq('id', uploadId);
      if (finishError) throw finishError;

      setProgress(100);
      setMsg(`✓ Berhasil! ${rows.length.toLocaleString('id-ID')} baris tersimpan untuk periode ${formatPeriod(period)}.`);
    } catch (err) {
      console.error(err);
      if (uploadId) {
        await supabase.from('grir_transactions').delete().eq('upload_id', uploadId);
        await supabase.from('grir_uploads').update({ status: 'error', error_message: err?.message || 'Upload gagal.' }).eq('id', uploadId);
      }
      setMsg(`Upload gagal: ${err?.message || 'Terjadi kesalahan.'}`);
      setProgress(0);
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="admin-page">
        <div className="admin-card">
          <div className="admin-logo">SIG</div>
          <div className="admin-eyebrow">GRIR • DATA CONTROL</div>
          <h1>GRIR Admin</h1>
          <p className="admin-muted">Login untuk mengelola data dashboard GRIR.</p>
          <form onSubmit={login} className="admin-form">
            <label>Email<input type="email" placeholder="Email admin" value={email} onChange={e => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
            <button className="admin-primary" type="submit">Login Admin</button>
          </form>
          {msg && <div className="admin-message"><AlertCircle size={16}/>{msg}</div>}
          <a className="admin-back" href="/">← Kembali ke Dashboard</a>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <div className="admin-card admin-wide">
        <div className="admin-top"><div><div className="admin-eyebrow">SIG • DATA CONTROL</div><h1>GRIR Admin</h1><p className="admin-muted">Upload Excel ke database pusat Supabase.</p></div><button className="admin-logout" onClick={() => supabase.auth.signOut()} disabled={busy}><LogOut size={16}/> Logout</button></div>
        <form onSubmit={upload} className="upload-box">
          <div className="upload-icon"><UploadCloud size={30}/></div>
          <h2>Upload Data GRIR</h2>
          <p>Pilih file Excel yang memiliki sheet <b>Data Source</b>.</p>
          <input id="grir-file" type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} disabled={busy} />
          <label htmlFor="grir-file" className="file-button">{file ? file.name : 'Pilih File Excel'}</label>
          <button className="admin-primary upload-button" type="submit" disabled={!file || busy}>{busy ? <><Loader2 size={17} className="spin"/> Memproses...</> : <><UploadCloud size={17}/> Upload Excel</>}</button>
          {busy && <div className="progress-wrap"><div className="progress-label"><span>Progress</span><b>{progress}%</b></div><div className="progress"><div style={{ width: `${progress}%` }}/></div></div>}
        </form>
        {msg && <div className={`admin-message ${msg.startsWith('✓') ? 'success' : msg.startsWith('Upload gagal') ? 'error' : ''}`}>{msg.startsWith('✓') ? <CheckCircle2 size={17}/> : <AlertCircle size={17}/>}<span>{msg}</span></div>}
        <a className="admin-back" href="/"><ArrowLeft size={15}/> Kembali ke Dashboard</a>
      </div>
    </main>
  );
}
