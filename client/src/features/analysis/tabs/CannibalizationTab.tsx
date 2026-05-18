import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAnalysis } from '../../../context/AnalysisContext';
import { SectionTitle } from '../../../components/ui/Basic';
import { fmtDist } from '../../../utils/formatters';
import type { ExistingOutlet, CannibalizationResult } from '../../../types/analysis';
import {
  MapPin, Plus, X, Zap, Loader2, AlertTriangle,
  ShieldCheck, ShieldAlert, Shield, Upload, FileText,
  ChevronDown, ChevronUp, Info, Settings2,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────── */
type SortKey = 'walk' | 'delivery' | 'distance';

/* ─── Verdict config ──────────────────────────────────────────── */
const VERDICT_STYLES = {
  safe:   { color: '#7ee787', bg: 'rgba(126,231,135,0.08)', border: 'rgba(126,231,135,0.25)', icon: ShieldCheck,  label: 'Safe' },
  low:    { color: '#ffa657', bg: 'rgba(255,166,87,0.08)',  border: 'rgba(255,166,87,0.25)',  icon: Shield,        label: 'Low Risk' },
  medium: { color: '#ffa657', bg: 'rgba(255,166,87,0.10)',  border: 'rgba(255,166,87,0.35)',  icon: ShieldAlert,   label: 'Medium Risk' },
  high:   { color: '#ff7b72', bg: 'rgba(255,123,114,0.10)', border: 'rgba(255,123,114,0.35)', icon: AlertTriangle, label: 'High Risk' },
};

/* ─── CSV parser ──────────────────────────────────────────────── */
function parseCSV(text: string): { outlets: ExistingOutlet[]; errors: string[] } {
  const lines  = text.trim().split(/\r?\n/);
  const errors: string[] = [];
  const outlets: ExistingOutlet[] = [];
  const start = isNaN(parseFloat(lines[0]?.split(',')[0])) ? 1 : 0;
  lines.slice(start).forEach((line, i) => {
    if (!line.trim()) return;
    const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 3) { errors.push(`Row ${i + start + 1}: need at least 3 columns`); return; }
    let name: string, lat: number, lng: number;
    if (!isNaN(parseFloat(cols[0])) && !isNaN(parseFloat(cols[1]))) {
      lat = parseFloat(cols[0]); lng = parseFloat(cols[1]); name = cols[2] || `Outlet ${outlets.length + 1}`;
    } else {
      const offset = cols.length >= 4 ? 1 : 0;
      name = cols[offset] || `Outlet ${outlets.length + 1}`;
      lat  = parseFloat(cols[offset + 1]);
      lng  = parseFloat(cols[offset + 2]);
    }
    if (isNaN(lat) || isNaN(lng)) { errors.push(`Row ${i + start + 1}: invalid lat/lng`); return; }
    if (lat < -90 || lat > 90)    { errors.push(`Row ${i + start + 1}: lat out of range`); return; }
    if (lng < -180 || lng > 180)  { errors.push(`Row ${i + start + 1}: lng out of range`); return; }
    outlets.push({ id: `csv-${Date.now()}-${i}`, name, lat, lng });
  });
  return { outlets, errors };
}

/* ─── CSV Upload ──────────────────────────────────────────────── */
function CsvUpload({ onAdd }: { onAdd: (o: ExistingOutlet[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fb, setFb] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') { setFb({ type: 'err', msg: 'Upload a .csv file' }); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const { outlets, errors } = parseCSV(e.target?.result as string);
      if (outlets.length === 0 && errors.length > 0) { setFb({ type: 'err', msg: errors[0] }); return; }
      onAdd(outlets);
      setFb({ type: 'ok', msg: `${outlets.length} imported${errors.length ? ` (${errors.length} skipped)` : ''}` });
      setTimeout(() => setFb(null), 3000);
    };
    reader.readAsText(file);
  };
  return (
    <div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) { handleFile(e.target.files[0]); e.target.value = ''; } }} />
      <button onClick={() => fileRef.current?.click()} style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(126,231,135,0.07)', border: '1px solid rgba(126,231,135,0.25)',
        borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#7ee787',
      }}>
        <Upload size={13} /> Upload CSV
      </button>
      {fb && <div style={{ marginTop: '5px', fontSize: '11px', color: fb.type === 'ok' ? '#7ee787' : '#ff7b72' }}>
        {fb.type === 'ok' ? '✓' : '✕'} {fb.msg}
      </div>}
    </div>
  );
}

/* ─── Manual outlet form ──────────────────────────────────────── */
function OutletForm({ onAdd }: { onAdd: (o: ExistingOutlet) => void }) {
  const [name, setName] = useState('');
  const [lat,  setLat]  = useState('');
  const [lng,  setLng]  = useState('');
  const [err,  setErr]  = useState('');
  const submit = () => {
    const la = parseFloat(lat), lo = parseFloat(lng);
    if (!name.trim())           { setErr('Name required'); return; }
    if (isNaN(la) || isNaN(lo)) { setErr('Valid lat/lng required'); return; }
    onAdd({ id: `manual-${Date.now()}`, name: name.trim(), lat: la, lng: lo });
    setName(''); setLat(''); setLng(''); setErr('');
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit(); };
  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: 'var(--text)', outline: 'none', width: '100%',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px 88px auto', gap: '6px' }}>
        <input placeholder="Outlet name" value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} style={inp} />
        <input placeholder="Lat"  value={lat}  onChange={e => setLat(e.target.value)}  onKeyDown={onKey} type="number" step="any" style={inp} />
        <input placeholder="Lng"  value={lng}  onChange={e => setLng(e.target.value)}  onKeyDown={onKey} type="number" step="any" style={inp} />
        <button onClick={submit} title="Add (Enter)" style={{
          background: 'rgba(79,156,249,0.12)', border: '1px solid rgba(79,156,249,0.3)',
          borderRadius: '8px', cursor: 'pointer', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', flexShrink: 0,
        }}><Plus size={14} /></button>
      </div>
      {err && <span style={{ fontSize: '11px', color: '#ff7b72' }}>{err}</span>}
    </div>
  );
}

/* ─── Downloads ───────────────────────────────────────────────── */
function downloadTemplate() {
  const csv = ['name,lat,lng','Outlet A,12.9652,80.2080','Outlet B,12.9816,80.2209'].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'outlets-template.csv' });
  a.click(); URL.revokeObjectURL(a.href);
}
function downloadBangaloreSample() {
  Object.assign(document.createElement('a'), { href: '/sample-outlets-bangalore.csv', download: 'sample-outlets-bangalore.csv' }).click();
}

/* ─── Outlets Modal ───────────────────────────────────────────── */
function OutletsModal({
  outlets, onAdd, onAddMultiple, onRemove, onClear, onClose,
}: {
  outlets: ExistingOutlet[];
  onAdd: (o: ExistingOutlet) => void;
  onAddMultiple: (o: ExistingOutlet[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const content = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '20px', padding: '24px', maxWidth: '520px', width: '100%',
        maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Existing Outlets</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
              {outlets.length} outlet{outlets.length !== 1 ? 's' : ''} added
            </div>
          </div>
          {outlets.length > 0 && (
            <button onClick={onClear} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '7px', padding: '5px 10px', fontSize: '11px', color: 'var(--text-dim)', cursor: 'pointer' }}>
              Clear all
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', borderRadius: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Manual add */}
        <OutletForm onAdd={onAdd} />

        {/* CSV tools */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <CsvUpload onAdd={onAddMultiple} />
          <button onClick={downloadTemplate} style={{
            display: 'flex', alignItems: 'center', gap: '5px', background: 'none',
            border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 11px',
            cursor: 'pointer', fontSize: '11px', color: 'var(--text-dim)',
          }}><FileText size={12} /> Template</button>
          <button onClick={downloadBangaloreSample} style={{
            display: 'flex', alignItems: 'center', gap: '5px', background: 'none',
            border: '1px solid rgba(255,166,87,0.3)', borderRadius: '8px', padding: '7px 11px',
            cursor: 'pointer', fontSize: '11px', color: '#ffa657',
          }}><FileText size={12} /> Bangalore sample</button>
        </div>

        {/* Outlet list / empty state */}
        {outlets.length === 0 ? (
          <div style={{
            margin: '4px 0 2px',
            background: 'rgba(79,156,249,0.04)',
            border: '1px dashed rgba(79,156,249,0.2)',
            borderRadius: '12px',
            padding: '18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            {/* Header */}
            <div style={{ textAlign: 'center' }}>
              <Upload size={22} style={{ color: 'var(--accent)', opacity: 0.7, marginBottom: '6px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>
                No outlets added yet
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', lineHeight: 1.5 }}>
                Add your existing store locations to check for cannibalization risk.
              </div>
            </div>

            {/* Three paths */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                {
                  icon: <Plus size={13} />,
                  title: 'Manual entry',
                  desc: 'Type name + lat/lng in the form above and press Enter or +',
                  color: 'var(--accent)',
                },
                {
                  icon: <Upload size={13} />,
                  title: 'Upload CSV',
                  desc: 'Formats accepted: name,lat,lng  |  lat,lng,name  |  id,name,lat,lng',
                  color: '#7ee787',
                },
                {
                  icon: <FileText size={13} />,
                  title: 'Use sample data',
                  desc: '22 Bangalore tea chain outlets — click "Bangalore sample" above',
                  color: '#ffa657',
                },
              ].map(step => (
                <div key={step.title} style={{
                  display: 'flex', gap: '10px', alignItems: 'flex-start',
                  padding: '9px 11px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '9px',
                }}>
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0,
                    background: `${step.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: step.color,
                  }}>
                    {step.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                      {step.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              <span>#</span><span>Name</span><span>Coords</span>
            </div>
            {outlets.map((o, i) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px', borderBottom: i < outlets.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, background: 'rgba(255,123,114,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800, color: '#ff7b72' }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>{o.lat.toFixed(4)}, {o.lng.toFixed(4)}</div>
                </div>
                <button onClick={() => onRemove(o.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px 6px', borderRadius: '5px' }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Guide */}
        <GuideSection />
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

/* ─── Collapsible guide inside modal ─────────────────────────── */
function GuideSection() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'rgba(79,156,249,0.06)', border: '1px solid rgba(79,156,249,0.15)', borderRadius: '10px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}>
        <Info size={13} color="var(--accent)" />
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)', flex: 1 }}>CSV format guide</span>
        {open ? <ChevronUp size={12} color="var(--text-dim)" /> : <ChevronDown size={12} color="var(--text-dim)" />}
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <pre style={{ fontSize: '10px', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '8px', margin: 0, lineHeight: 1.7, fontFamily: 'monospace' }}>
{`# Layout A: name, lat, lng
Madipakkam, 12.9652, 80.2080

# Layout B: lat, lng, name
12.9652, 80.2080, Madipakkam

# Layout C: id, name, lat, lng
ck-001, Madipakkam, 12.9652, 80.2080`}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─── Overlap Cell ────────────────────────────────────────────── */
function OverlapCell({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color }}>{pct}%</span>
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '4px' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ─── Sort button ─────────────────────────────────────────────── */
function SortBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '11px',
      fontWeight: active ? 700 : 500,
      background: active ? 'rgba(79,156,249,0.15)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-dim)',
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );
}

/* ─── Sorting logic ───────────────────────────────────────────── */
function sortResults(results: CannibalizationResult[], key: SortKey): CannibalizationResult[] {
  return [...results].sort((a, b) => {
    if (key === 'walk')     return (Number(b.walk_overlap_pct) || 0)     - (Number(a.walk_overlap_pct) || 0);
    if (key === 'delivery') return (Number(b.delivery_overlap_pct) || 0) - (Number(a.delivery_overlap_pct) || 0);
    return (Number(a.distance_m) || 0) - (Number(b.distance_m) || 0);
  });
}

/* ─── Main Component ──────────────────────────────────────────── */
export function CannibalizationTab() {
  const {
    sitePin,
    existingOutlets, setExistingOutlets,
    cannibalizationData, cannibalizationLoading, cannibalizationError,
    runCannibalization,
  } = useAnalysis();

  const [showModal, setShowModal] = useState(false);
  const [showInfo,  setShowInfo]  = useState(false);
  const [sortKey, setSortKey]     = useState<SortKey>('walk');

  const addOutlet    = (o: ExistingOutlet)       => setExistingOutlets([...existingOutlets, o]);
  const addOutlets   = (os: ExistingOutlet[])    => setExistingOutlets([...existingOutlets, ...os]);
  const removeOutlet = (id: string)              => setExistingOutlets(existingOutlets.filter(o => o.id !== id));
  const clearAll     = ()                        => setExistingOutlets([]);

  if (!sitePin) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-dim)' }}>
        <MapPin size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>No site selected</div>
        <div style={{ fontSize: '12px', marginTop: '6px' }}>Click the map to place a new site pin first.</div>
        <button onClick={() => setShowInfo(true)} style={{
          marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(79,156,249,0.08)', border: '1px solid rgba(79,156,249,0.2)',
          borderRadius: '8px', padding: '7px 14px', cursor: 'pointer',
          fontSize: '12px', color: 'var(--accent)',
        }}>
          <Info size={13} /> How it works
        </button>
      </div>
    );
  }

  const verdict  = cannibalizationData?.verdict;
  const vs       = verdict ? VERDICT_STYLES[verdict.level] : null;
  const sorted   = cannibalizationData?.results ? sortResults(cannibalizationData.results, sortKey) : [];

  return (
    <>
      <style>{`@keyframes cannFade { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }`}</style>

      {/* ── New Site compact pill ── */}
      <div style={{
        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)',
        borderRadius: '10px', padding: '9px 12px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
          background: '#6366f1', border: '2px solid white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MapPin size={10} color="white" />
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#818cf8', flexShrink: 0 }}>NEW SITE</span>
        <span style={{ fontSize: '12px', color: 'var(--text)', fontFamily: 'monospace', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sitePin.lat.toFixed(5)}, {sitePin.lng.toFixed(5)}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0 }}>
          Walk 500m · Del 3km
        </span>
        <button
          onClick={() => setShowInfo(true)}
          title="How cannibalization is calculated"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', padding: '2px', display: 'flex',
            alignItems: 'center', flexShrink: 0,
          }}
        >
          <Info size={14} />
        </button>
      </div>

      {/* ── Action row: manage outlets + analyse ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>

        {/* Manage outlets */}
        <button
          onClick={() => setShowModal(true)}
          style={{
            flex: 1, padding: '11px 14px', borderRadius: '12px', cursor: 'pointer',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
          }}
        >
          <Settings2 size={15} color="var(--text-dim)" />
          <span style={{ flex: 1, textAlign: 'left' }}>Manage Outlets</span>
          {existingOutlets.length > 0 && (
            <span style={{
              background: 'var(--accent)', color: 'white', borderRadius: '10px',
              padding: '1px 8px', fontSize: '11px', fontWeight: 800,
            }}>
              {existingOutlets.length}
            </span>
          )}
        </button>

        {/* Analyse */}
        <button
          onClick={runCannibalization}
          disabled={cannibalizationLoading || existingOutlets.length === 0}
          style={{
            padding: '11px 18px', borderRadius: '12px',
            background: existingOutlets.length === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(79,156,249,0.12)',
            border: existingOutlets.length === 0 ? '1px solid var(--border)' : '1px solid rgba(79,156,249,0.3)',
            color: existingOutlets.length === 0 ? 'var(--text-dim)' : 'var(--accent)',
            cursor: existingOutlets.length === 0 || cannibalizationLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '7px',
            fontSize: '13px', fontWeight: 700, transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
        >
          {cannibalizationLoading
            ? <><Loader2 size={14} className="icon-spin" /> Analysing…</>
            : <><Zap size={14} fill="currentColor" /> Analyse</>}
        </button>
      </div>

      {/* ── Error ── */}
      {cannibalizationError && (
        <div style={{ background: 'rgba(255,123,114,0.08)', border: '1px solid rgba(255,123,114,0.25)', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#ff7b72' }}>
          {cannibalizationError}
        </div>
      )}

      {/* ── Verdict ── */}
      {verdict && vs && (
        <div style={{
          background: vs.bg, border: `1px solid ${vs.border}`,
          borderRadius: '10px', padding: '10px 13px',
          display: 'flex', alignItems: 'flex-start', gap: '9px',
          animation: 'cannFade 0.3s ease',
        }}>
          <vs.icon size={15} color={vs.color} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: vs.color }}>{vs.label} · </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{verdict.msg}</span>
          </div>
        </div>
      )}

      {/* ── Overlap Analysis ── */}
      {sorted.length > 0 && (
        <div>
          {/* Section header + sort controls */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}><SectionTitle>Overlap Analysis</SectionTitle></div>
            <div style={{
              display: 'flex', gap: '2px', padding: '3px',
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '9px',
            }}>
              <SortBtn label="Walk ↓"     active={sortKey === 'walk'}     onClick={() => setSortKey('walk')} />
              <SortBtn label="Delivery ↓" active={sortKey === 'delivery'} onClick={() => setSortKey('delivery')} />
              <SortBtn label="Dist ↑"     active={sortKey === 'distance'} onClick={() => setSortKey('distance')} />
            </div>
          </div>

          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 68px 65px 80px',
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              <span>Outlet</span>
              <span style={{ textAlign: 'right' }}>Dist</span>
              <span style={{ textAlign: 'right', color: sortKey === 'walk' ? 'var(--accent)' : undefined }}>Walk</span>
              <span style={{ textAlign: 'right', color: sortKey === 'delivery' ? 'var(--accent)' : undefined }}>Delivery</span>
            </div>

            {sorted.map((r, i) => {
              const walkPct = Number(r.walk_overlap_pct)     || 0;
              const delPct  = Number(r.delivery_overlap_pct) || 0;
              const wColor  = walkPct > 30 ? '#ff7b72' : walkPct > 10 ? '#ffa657' : '#7ee787';
              const dColor  = delPct  > 60 ? '#ff7b72' : delPct  > 30 ? '#ffa657' : '#7ee787';
              return (
                <div key={r.id || i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 68px 65px 80px',
                  padding: '11px 14px',
                  borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  alignItems: 'center',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-dim)' }}>
                    {fmtDist(Number(r.distance_m))}
                  </div>
                  <OverlapCell pct={walkPct} color={wColor} />
                  <OverlapCell pct={delPct}  color={dColor} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Calculation Info Modal ── */}
      {showInfo && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setShowInfo(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} />
          <div style={{
            position: 'relative', zIndex: 1,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '24px', maxWidth: '480px', width: '100%',
            maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', gap: '18px',
          }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                  How Cannibalization is Calculated
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  Based on geometric overlap of catchment zones between the new site and each existing outlet.
                </div>
              </div>
              <button onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            {/* Formula */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Overlap % formula</div>
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: '#7ee787', lineHeight: 1.7 }}>
                overlap % = (intersection area ÷ new site zone area) × 100
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                The intersection is the overlapping region between the new site's catchment circle and the existing outlet's catchment circle of the same radius. Calculated using PostGIS <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px' }}>ST_Intersection</code>.
              </div>
            </div>

            {/* Zone explanations */}
            {[
              {
                color: '#6366f1', label: 'Walk Zone — 500 m radius',
                desc: 'Represents the area customers walk to visit a physical store. Overlap here means direct footfall loss — the same pedestrians can choose either outlet.',
                threshold: 'Walk overlap > 30%',
                risk: 'High risk',
                riskColor: '#ff7b72',
                detail: 'At 30% overlap, roughly 1 in 3 walk-in customers lives or works in the shared catchment.',
              },
              {
                color: '#a855f7', label: 'Delivery Zone — 3 km radius',
                desc: 'Represents the delivery catchment. Overlap means both outlets compete for the same delivery orders on apps like Swiggy / Zomato.',
                threshold: 'Delivery overlap > 60%',
                risk: 'Medium risk',
                riskColor: '#ffa657',
                detail: 'At 60% overlap, more than half the delivery orders in the new site\'s zone are already served by an existing outlet.',
              },
            ].map(z => (
              <div key={z.label} style={{ background: `${z.color}08`, border: `1px solid ${z.color}25`, borderRadius: '12px', padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="24" height="10" style={{ flexShrink: 0 }}>
                    <line x1="0" y1="5" x2="24" y2="5" stroke={z.color} strokeWidth="3.5" />
                  </svg>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: z.color }}>{z.label}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{z.desc}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: z.riskColor, background: `${z.riskColor}15`, padding: '2px 8px', borderRadius: '5px' }}>
                    {z.threshold} → {z.risk}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.4, fontStyle: 'italic' }}>{z.detail}</div>
              </div>
            ))}

            {/* Verdict table */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Overall Verdict Rules
              </div>
              {[
                { level: 'High',   color: '#ff7b72', rule: 'Walk overlap > 30%',                              msg: 'Direct footfall cannibalization. Strongly reconsider placement.' },
                { level: 'Medium', color: '#ffa657', rule: 'Delivery overlap > 60%',                          msg: 'Delivery orders will split. Expect 25–40% cannibalisation.' },
                { level: 'Low',    color: '#ffa657', rule: 'Delivery overlap 30–60%',                         msg: 'Minor delivery impact. Monitor post-launch.' },
                { level: 'Safe',   color: '#7ee787', rule: 'Walk < 30% and delivery < 30%',                   msg: 'No meaningful overlap. Safe to proceed.' },
              ].map((r, i, arr) => (
                <div key={r.level} style={{ display: 'flex', gap: '10px', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: r.color, background: `${r.color}15`, padding: '2px 8px', borderRadius: '5px', flexShrink: 0, marginTop: '1px' }}>{r.level}</span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{r.rule}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{r.msg}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Outlets Modal ── */}
      {showModal && (
        <OutletsModal
          outlets={existingOutlets}
          onAdd={addOutlet}
          onAddMultiple={addOutlets}
          onRemove={removeOutlet}
          onClear={clearAll}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
