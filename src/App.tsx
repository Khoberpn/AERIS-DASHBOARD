import { useCallback, useEffect, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, formatDate, formatNumber, relativeTime, type DashboardSummary } from './api';
import { downloadPdf } from './report';

type Section = 'dashboard' | 'monitoring' | 'actuators' | 'irrigation' | 'automation' | 'alerts' | 'system';
type IconName =
  | 'grid' | 'activity' | 'sliders' | 'droplet' | 'git' | 'bell' | 'cpu' | 'menu'
  | 'thermo' | 'humidity' | 'soil' | 'sun' | 'flask' | 'wind' | 'tank' | 'refresh';

const navigation: { id: Section; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Overview', icon: 'grid' },
  { id: 'monitoring', label: 'Live Monitoring', icon: 'activity' },
  { id: 'actuators', label: 'Device Management', icon: 'sliders' },
  { id: 'irrigation', label: 'Data & Reports', icon: 'droplet' },
  { id: 'automation', label: 'Automation Rules', icon: 'git' },
  { id: 'alerts', label: 'Alerts & Logs', icon: 'bell' },
  { id: 'system', label: 'Greenhouse Profile', icon: 'cpu' },

];
type FarmerUser = {
  username: string;
  password: string;
  name: string;
  farm: string;
  role: string;
  focus: string;
  accent: string;
  prioritySensors: string[];
};

const farmerUsers: FarmerUser[] = [
  { username: 'budi.tani', password: 'AerisBudi#2026', name: 'Budi Santoso', farm: 'Kebun Makmur', role: 'Petani sayuran', focus: 'Kelembapan tanah & irigasi', accent: 'leaf', prioritySensors: ['soilMoisture', 'waterLevel', 'humidity'] },
  { username: 'siti.agro', password: 'AerisSiti#2026', name: 'Siti Rahma', farm: 'Greenhouse Lestari', role: 'Petani hidroponik', focus: 'pH, EC & nutrisi', accent: 'teal', prioritySensors: ['ph', 'ec', 'waterFlow'] },
  { username: 'agus.panen', password: 'AerisAgus#2026', name: 'Agus Pranoto', farm: 'Ladang Sejahtera', role: 'Koordinator lapangan', focus: 'Cuaca & kesiapan panen', accent: 'amber', prioritySensors: ['temperature', 'rain', 'windSpeed'] },
  { username: 'rina.kebun', password: 'AerisRina#2026', name: 'Rina Wulandari', farm: 'Kebun Organik Rina', role: 'Petani organik', focus: 'Kesehatan tanaman', accent: 'violet', prioritySensors: ['light', 'co2', 'humidity'] },
  { username: 'dedi.green', password: 'AerisDedi#2026', name: 'Dedi Kurniawan', farm: 'AERIS Demo Farm', role: 'Manajer greenhouse', focus: 'Perangkat & automasi', accent: 'blue', prioritySensors: ['temperature', 'waterLevel', 'light'] },
];

const authStorageKey = 'aeris-farmer-session';

const iconPaths: Record<IconName, string> = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  activity: 'M3 12h4l2.5-7 5 14 2.5-7H21',
  sliders: 'M4 7h16M4 17h16M9 4v6M15 14v6',
  droplet: 'M12 3s7 7.2 7 11.2A7 7 0 1 1 5 14.2C5 10.2 12 3 12 3z',
  git: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0',
  cpu: 'M8 4h8v4H8zM8 16h8v4H8zM4 8h4v8H4zM16 8h4v8h-4zM9 9h6v6H9z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  thermo: 'M10 13.5V6a2 2 0 1 1 4 0v7.5a4 4 0 1 1-4 0z',
  humidity: 'M12 3s6 6.5 6 10.5A6 6 0 1 1 6 13.5C6 9.5 12 3 12 3z',
  soil: 'M4 19c2-6 4-9 8-9s6 3 8 9M8 10c.5-3 2-5 4-6 2 1 3.5 3 4 6',
  sun: 'M12 4v2M12 18v2M5 12H3M21 12h-2M6.2 6.2 4.8 4.8M19.2 19.2l-1.4-1.4M6.2 17.8 4.8 19.2M19.2 4.8l-1.4 1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  flask: 'M9 3h6M10 3v6L6 17a4 4 0 0 0 3.5 6h5A4 4 0 0 0 18 17l-4-8V3',
  wind: 'M4 10h11a3 3 0 1 0-3-3M4 14h14a3 3 0 1 1-3 3M4 18h8',
  tank: 'M5 8h14v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM8 8V6a4 4 0 0 1 8 0v2',
  refresh: 'M4 12a8 8 0 0 1 13.7-5.7L20 8M20 12a8 8 0 0 1-13.7 5.7L4 16M20 4v4h-4M4 20v-4h4',
};

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}

const sensorIcons: Record<string, IconName> = {
  temperature: 'thermo',
  humidity: 'humidity',
  soil_moisture: 'soil',
  light: 'sun',
  ph: 'flask',
  co2: 'wind',
  water_level: 'tank',
};

const chartTooltip = {
  background: '#fffdf7',
  border: '1px solid #d5ddd2',
  borderRadius: 6,
  fontSize: 12,
  color: '#17231d',
};

const sectionFromHash = (): Section => {
  const id = window.location.hash.replace('#/', '') as Section;
  return navigation.some(n => n.id === id) ? id : 'dashboard';
};

function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetcher()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Gagal memuat data.'); }
    finally { setLoading(false); }
  }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, refresh: load };
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="error-state" role="alert"><strong>Tidak bisa memuat data</strong><p>{message}</p><button type="button" onClick={retry}>Coba lagi</button></div>;
}
function Empty({ detail }: { detail: string }) {
  return <div className="empty"><span className="empty-icon"><Icon name="activity" size={18} /></span><p>{detail}</p><small>Data akan muncul otomatis setelah perangkat mengirim pembacaan pertama.</small></div>;
}
function Panel({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <section className="panel"><div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="panel-actions">{actions}</div>}</div>{children}</section>;
}
function StatusBadge({ status }: { status: string }) {
  const cls = status === 'online' || status === 'on' || status === 'completed' || status === 'auto' ? 'badge-green'
    : status === 'offline' || status === 'off' || status === 'cancelled' ? 'badge-gray'
    : status === 'error' || status === 'failed' || status === 'critical' ? 'badge-red'
    : status === 'warning' || status === 'maintenance' || status === 'running' ? 'badge-amber'
    : 'badge-gray';
  return <span className={`status-badge ${cls}`}>{status}</span>;
}
// === FASE 1: Ambang operasional (mengikuti rule seed: suhu 30/35, tanah 40/70, RH 50, cahaya 500 lux) ===
type Tone = 'ok' | 'warn' | 'danger';
type SensorSpec = { key: string; icon: IconName; label: string; unit: string; source: string; tone: (v: number) => Tone; note?: string };
const sensorSpecs: SensorSpec[] = [
  { key: 'temperature', icon: 'thermo', label: 'Suhu udara', unit: '°C', source: 'DHT11', tone: v => v > 35 ? 'danger' : v > 30 ? 'warn' : 'ok' },
  { key: 'humidity', icon: 'humidity', label: 'Kelembapan udara', unit: '%', source: 'DHT11', tone: v => v < 50 ? 'warn' : 'ok' },
  { key: 'soilMoisture', icon: 'soil', label: 'Kelembapan tanah', unit: '%', source: 'Kapasitif', tone: v => v < 40 ? 'warn' : v > 70 ? 'warn' : 'ok' },
  { key: 'light', icon: 'sun', label: 'Cahaya', unit: 'lux', source: 'BH1750', tone: v => v < 500 ? 'warn' : 'ok', note: 'lux, bukan irradiance PV' },
  { key: 'ph', icon: 'flask', label: 'pH tanah', unit: '', source: 'Analog', tone: v => v < 5.5 || v > 7 ? 'warn' : 'ok' },
  { key: 'co2', icon: 'wind', label: 'CO₂', unit: 'ppm', source: 'Opsional', tone: () => 'ok' },
  { key: 'waterLevel', icon: 'tank', label: 'Level air', unit: 'cm', source: 'Ultrasonik', tone: v => v < 15 ? 'danger' : 'ok' },
  { key: 'ec', icon: 'flask', label: 'EC nutrisi', unit: 'mS/cm', source: 'Opsional', tone: v => v < 1 || v > 3 ? 'warn' : 'ok' },
  { key: 'waterFlow', icon: 'droplet', label: 'Debit air', unit: 'L/min', source: 'Flow sensor', tone: () => 'ok' },
  { key: 'windSpeed', icon: 'wind', label: 'Kecepatan angin', unit: 'm/s', source: 'Anemometer', tone: v => v > 10 ? 'warn' : 'ok' },
  { key: 'rain', icon: 'droplet', label: 'Hujan', unit: 'mm', source: 'Rain sensor', tone: () => 'ok' },
];
const STALE_MS = 5 * 60 * 1000;

type Insight = { tone: Tone; title: string; finding: string; action: string };
function buildInsights(summary: DashboardSummary | null): Insight[] {
  if (!summary) return [];
  const s = summary.latestSensors;
  const items: Insight[] = [];
  if (typeof s.temperature === 'number' && s.temperature > 35) items.push({ tone: 'danger', title: 'Suhu sangat tinggi', finding: `Suhu ${formatNumber(s.temperature, 1)}°C melewati batas aman.`, action: 'Nyalakan exhaust fan, hentikan pemanasan, dan cek ventilasi. Verifikasi ulang dalam 10 menit.' });
  else if (typeof s.temperature === 'number' && s.temperature > 30) items.push({ tone: 'warn', title: 'Suhu meningkat', finding: `Suhu ${formatNumber(s.temperature, 1)}°C di atas target operasional.`, action: 'Pantau tren dan aktifkan ventilasi otomatis bila terus naik.' });
  if (typeof s.soilMoisture === 'number' && s.soilMoisture < 40) items.push({ tone: 'warn', title: 'Tanah terlalu kering', finding: `Kelembapan tanah ${formatNumber(s.soilMoisture, 0)}%.`, action: 'Jalankan irigasi singkat, lalu ukur kembali kelembapan dan debit air.' });
  if (typeof s.waterLevel === 'number' && s.waterLevel < 15) items.push({ tone: 'danger', title: 'Cadangan air rendah', finding: `Level air ${formatNumber(s.waterLevel, 1)} cm.`, action: 'Matikan pompa jika aliran tidak stabil dan isi tangki sebelum irigasi berikutnya.' });
  if (typeof s.humidity === 'number' && s.humidity < 50) items.push({ tone: 'warn', title: 'Kelembapan udara rendah', finding: `RH ${formatNumber(s.humidity, 0)}%.`, action: 'Periksa misting dan kebocoran; jangan menambah durasi irigasi tanpa verifikasi tanah.' });
  if (summary.offlineDevices > 0) items.push({ tone: 'warn', title: 'Perangkat offline', finding: `${summary.offlineDevices} perangkat tidak mengirim heartbeat.`, action: 'Periksa daya, koneksi, dan kabel sensor sebelum mengandalkan automasi.' });
  return items.slice(0, 5);
}
function OperationalInsights({ summary }: { summary: DashboardSummary | null }) {
  const insights = buildInsights(summary);
  return <Panel title="Insight operasional" subtitle="Analisis aturan berbasis pembacaan terbaru">
    {insights.length ? <div className="insight-list">{insights.map((item, index) => <article className={`insight-card insight-${item.tone}`} key={`${item.title}-${index}`}><div><StatusBadge status={item.tone === 'danger' ? 'critical' : 'warning'} /><h3>{item.title}</h3><p>{item.finding}</p><strong>Langkah berikutnya</strong><p>{item.action}</p></div></article>)}</div> : <Empty detail="Semua parameter utama berada dalam rentang operasional atau belum tersedia." />}
  </Panel>;
}
const isStale = (iso: string | null | undefined) => !iso || Date.now() - new Date(iso).getTime() > STALE_MS;
const staleMinutes = (iso: string | null | undefined) => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null;

function SkeletonCard() {
  return <div className="skeleton-card" aria-hidden="true">
    <div className="skeleton skeleton-line short" />
    <div className="skeleton skeleton-line value" />
    <div className="skeleton skeleton-line short" />
  </div>;
}
function SkeletonPanel({ rows = 5 }: { rows?: number }) {
  return <div className="skeleton-panel" aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton skeleton-row" />)}
  </div>;
}
function SensorCard({ icon, label, value, unit, sub, tone = 'ok', stale, note }: { icon: IconName; label: string; value: number | null | undefined; unit: string; sub?: string; tone?: Tone; stale?: boolean; note?: string }) {
  return (
    <div className={`sensor-card tone-${tone}${stale ? ' stale' : ''}`}>
      <div className="sensor-card-top">
        <span className="sensor-label">{label}</span>
        <span className="sensor-badges">
          {stale && <span className="stale-badge" title="Tidak ada pembaruan data lebih dari 5 menit">stale</span>}
          <Icon name={icon} size={14} />
        </span>
      </div>
      <strong>{typeof value === 'number' ? formatNumber(value, value >= 100 ? 0 : 1) : '—'}{typeof value === 'number' && unit ? <span className="unit">{unit}</span> : null}</strong>
      {sub && <small>{sub}</small>}
      {note && <div className="sensor-note">{note}</div>}
    </div>
  );
}

type GreenhouseState = 'Normal' | 'Waspada' | 'Kritis';
function evaluateState(summary: DashboardSummary, s: DashboardSummary['latestSensors'], offline: number): { state: GreenhouseState; reasons: string[] } {
  const reasons: string[] = [];
  let state: GreenhouseState = 'Normal';
  const raise = (next: GreenhouseState) => { if (next === 'Kritis' || (next === 'Waspada' && state === 'Normal')) state = next; };
  if (summary.criticalAlerts > 0) { raise('Kritis'); reasons.push(`${summary.criticalAlerts} alert kritis`); }
  if (offline > 0) { raise('Waspada'); reasons.push(`${offline} perangkat offline`); }
  if (typeof s.temperature === 'number' && s.temperature > 35) { raise('Kritis'); reasons.push(`suhu ${formatNumber(s.temperature, 1)}°C`); }
  else if (typeof s.temperature === 'number' && s.temperature > 30) { raise('Waspada'); reasons.push(`suhu ${formatNumber(s.temperature, 1)}°C`); }
  if (typeof s.soilMoisture === 'number' && s.soilMoisture < 40) { raise('Waspada'); reasons.push(`tanah ${formatNumber(s.soilMoisture, 0)}%`); }
  if (typeof s.humidity === 'number' && s.humidity < 50) { raise('Waspada'); reasons.push(`RH ${formatNumber(s.humidity, 0)}%`); }
  if (isStale(summary.sensorTimestamps.temperature)) { raise('Waspada'); reasons.push('data suhu stale'); }
  return { state, reasons };
}

function Dashboard({ user }: { user: FarmerUser }) {
  // Panel terpisah agar skeleton/error per panel (tidak menutup seluruh halaman).
  const head = useData(() => api.dashboardSummary(), []);
  const healthQ = useData(() => api.health(), []);
  const alertsQ = useData(() => api.alerts({ page: 1, limit: 5, acknowledged: false }).then(p => p.data), []);
  const activityQ = useData(() => api.activityLogs({ page: 1, limit: 8 }), []);
  const [paused, setPaused] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [cachedAt, setCachedAt] = useState<Date | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportStatus, setReportStatus] = useState('');

  const createReport = async () => {
    setReporting(true); setReportStatus('Mengumpulkan data laporan…');
    try {
      const [sensors, actuators, irrigation, alerts] = await Promise.all([
        api.sensorsLatest(), api.actuators(), api.irrigationSchedules(), api.alerts({ page: 1, limit: 20 }),
      ]);
      const sensorLines = sensors.map(item => `- ${item.sensorType}: ${formatNumber(item.value, 1)} ${item.unit} (${formatDate(item.recordedAt)})`);
      const lines = [
        `Dibuat: ${formatDate(new Date().toISOString())}`, `Pengguna: ${user.name} · ${user.farm}`, '',
        'RINGKASAN GREENHOUSE', `Status: ${evaluated?.state ?? 'Belum tersedia'}`, `Perangkat online: ${summary?.onlineDevices ?? 0}/${summary?.totalDevices ?? 0}`, `Alert pending: ${summary?.pendingAlerts ?? 0}`, '',
        'PEMBACAAN SENSOR TERBARU', ...(sensorLines.length ? sensorLines : ['- Belum ada data sensor']), '',
        'AKTUATOR', ...(actuators.map(item => `- ${item.name}: ${item.state}${item.autoEnabled ? ' (otomatis)' : ''}`)), '',
        'JADWAL IRIGASI', ...(irrigation.map(item => `- ${item.name}: ${item.enabled ? 'aktif' : 'nonaktif'} · ${Math.round(item.durationSeconds / 60)} menit`)), '',
        'ALERT TERBARU', ...(alerts.data.map(item => `- [${item.severity}] ${item.title}: ${item.message}`)),
      ];
      downloadPdf(`aeris-laporan-${new Date().toISOString().slice(0, 10)}.pdf`, 'AERIS · Laporan Greenhouse', lines);
      setReportStatus('Laporan berhasil dibuat dan diunduh.');
    } catch { setReportStatus('Laporan gagal dibuat. Coba lagi saat koneksi tersedia.'); }
    finally { setReporting(false); }
  };

  const refreshAll = useCallback(async () => {
    await Promise.all([head.refresh(), healthQ.refresh(), alertsQ.refresh(), activityQ.refresh()]);
  }, [head.refresh, healthQ.refresh, alertsQ.refresh, activityQ.refresh]);

  // Pause-live: hentikan polling tanpa membuang data terakhir.
  useEffect(() => {
    if (paused) return;
    const iv = setInterval(() => {
      void head.refresh(); void healthQ.refresh(); void alertsQ.refresh();
      setUpdatedAt(new Date());
    }, 15000);
    return () => clearInterval(iv);
  }, [paused, head.refresh, healthQ.refresh, alertsQ.refresh]);

  // Banner cached: simpan snapshot terakhir yang sukses agar layar tidak blank saat API/DB turun.
  const lastGood = useRef<DashboardSummary | null>(null);
  if (head.data) lastGood.current = head.data;
  useEffect(() => {
    if (head.error && lastGood.current) setCachedAt(new Date());
  }, [head.error]);
  useEffect(() => { if (head.data && !head.loading) setUpdatedAt(new Date()); }, [head.data, head.loading]);

  const summary = head.data ?? lastGood.current;
  const health = healthQ.data;
  const cached = Boolean(head.error && summary);
  const offlineDevices = health && health.database !== 'connected' && health.database !== 'demo' ? summary?.totalDevices ?? 0 : summary?.offlineDevices ?? 0;
  const s = summary?.latestSensors;
  const evaluated = summary && s ? evaluateState(summary, s, offlineDevices) : null;

  const orderedSensorSpecs = [...sensorSpecs].sort((a, b) => user.prioritySensors.indexOf(a.key) - user.prioritySensors.indexOf(b.key));

  return <>
    <header className="page-head">
      <div><h1>Dashboard {user.name.split(' ')[0]}</h1><p className="page-description">{user.farm} · {user.focus}. Status greenhouse, sensor, dan peringatan dalam satu layar.</p></div>
      <span className={`farmer-profile profile-${user.accent}`}><strong>{user.name}</strong><small>{user.role}</small></span>
      <span className={`connection ${cached ? 'down' : ''}`} aria-live="polite">
        <i />{cached ? 'Data cached' : head.error ? 'Terputus' : 'Live'}
      </span>
    </header>

    {reportStatus && <div className="banner" role="status">{reportStatus}</div>}
    {cached && <div className="banner banner-critical" role="status">
      <div><strong>Koneksi ke API terputus</strong>Menampilkan snapshot terakhir ({cachedAt ? relativeTime(cachedAt.toISOString()) : '—'}). Aksi kontrol dinonaktifkan sampai koneksi pulih.</div>
      <div className="banner-actions"><button type="button" className="btn-sm" onClick={() => void refreshAll()}>Coba lagi</button></div>
    </div>}

    <div className="live-bar">
      <span className="live-info"><i className={`live-dot ${paused ? 'paused' : ''}`} />{paused ? 'Auto-refresh dijeda' : 'Auto-refresh 15 detik'} · update {updatedAt ? relativeTime(updatedAt.toISOString()) : '—'}</span>
      <div className="panel-actions">
        <button type="button" className={`btn-live ${paused ? 'paused' : ''}`} aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? '▶ Lanjutkan live' : '⏸ Pause live'}</button>
        <button type="button" className="btn-live" onClick={() => void refreshAll()}>↻ Muat ulang</button>
        <button type="button" className="btn-primary" disabled={reporting} onClick={() => void createReport()}><Icon name="activity" size={14} />{reporting ? 'Membuat…' : 'Buat laporan PDF'}</button>
      </div>
    </div>

    {head.error && !summary && <ErrorState message={head.error} retry={() => void head.refresh()} />}

    <section className="hero-strip" aria-label="Ringkasan status greenhouse">
      {!evaluated ? <div className="hero-state"><span className="state-light" /><div><small>Status greenhouse</small><strong className="skeleton skeleton-line" style={{ width: 90, height: 18 }} /></div></div>
        : <div className={`hero-state ${evaluated.state === 'Kritis' ? 'hero-kritis' : evaluated.state === 'Waspada' ? 'hero-waspada' : 'hero-normal'}`}>
          <span className="state-light" />
          <div><small>Status greenhouse</small><strong>{evaluated.state}</strong><span className="hero-detail">{evaluated.reasons.length ? evaluated.reasons.slice(0, 3).join(' · ') : 'Semua parameter dalam ambang'}</span></div>
        </div>}
      <div><small>Energi PV hari ini</small><strong>{'—'}</strong><span className="hero-detail">menunggu data PV (fase energi)</span></div>
      <div><small>Pompa / aktuator ON</small><strong>{summary ? `${summary.runningActuators.length} aktif` : '—'}</strong><span className="hero-detail">{summary?.runningActuators.length ? summary.runningActuators.map(a => a.name).join(', ') : 'Semua aktuator mati'}</span></div>
      <div className={summary && summary.criticalAlerts > 0 ? 'hero-value-risk' : ''}><small>Alert kritis pending</small><strong>{summary ? summary.criticalAlerts : '—'}</strong><span className="hero-detail">{summary ? `${summary.pendingAlerts} total belum direspons` : 'memuat…'}</span></div>
      <div className={offlineDevices > 0 ? 'hero-value-warn' : ''}><small>Perangkat offline</small><strong>{summary ? `${offlineDevices}/${summary.totalDevices}` : '—'}</strong><span className="hero-detail">{health ? (health.database === 'connected' ? 'heartbeat terpantau' : 'database tidak tersedia') : 'memuat…'}</span></div>
    </section>

    <OperationalInsights summary={summary} />
    <div className="sensor-grid" aria-busy={head.loading && !summary}>
      {!s ? Array.from({ length: 7 }, (_, i) => <SkeletonCard key={i} />) : orderedSensorSpecs.map(spec => {
        const value = (s as Record<string, number | null>)[spec.key];
        const ts = summary!.sensorTimestamps[spec.key];
        const stale = value == null ? false : isStale(ts);
        const mins = staleMinutes(ts);
        return <SensorCard key={spec.key} icon={spec.icon} label={spec.label} value={value} unit={spec.unit}
          tone={typeof value === 'number' ? spec.tone(value) : 'ok'} stale={stale} note={spec.note}
          sub={value == null ? `${spec.source} · menunggu data` : `${spec.source} · ${stale ? `${mins} menit lalu` : relativeTime(ts)}`} />;
      })}
    </div>

    <div className="two-column">
      <Panel title="Alert pending" subtitle={summary ? (summary.pendingAlerts > 0 ? `${summary.pendingAlerts} belum direspons` : 'Tidak ada yang pending') : undefined}
        actions={paused ? <span className="stale-badge">jeda</span> : undefined}>
        {alertsQ.loading && !alertsQ.data ? <SkeletonPanel rows={4} />
          : alertsQ.error ? <ErrorState message={alertsQ.error} retry={() => void alertsQ.refresh()} />
          : alertsQ.data?.length ? <div className="alert-list">{alertsQ.data.map(a => (
            <div key={a.id} className={`alert-item alert-${a.severity}`}>
              <span className="alert-sev" />
              <div><strong>{a.title}</strong><p>{a.message}</p><small>{relativeTime(a.createdAt)}{a.deviceId ? ` · ${a.deviceId}` : ''}</small></div>
            </div>
          ))}</div> : <Empty detail="Tidak ada alert yang belum direspons." />}
      </Panel>
      <Panel title="Aktivitas terbaru" subtitle="8 log terakhir dari activity_logs">
        {activityQ.loading && !activityQ.data ? <SkeletonPanel rows={6} />
          : activityQ.error ? <ErrorState message={activityQ.error} retry={() => void activityQ.refresh()} />
          : activityQ.data?.length ? <div className="activity-list">{activityQ.data.map(a => (
            <div key={a.id} className="activity-item">
              <StatusBadge status={a.category} />
              <div><span>{a.action}</span><small>{relativeTime(a.createdAt)} · {a.userLabel}</small></div>
            </div>
          ))}</div> : <Empty detail="Belum ada aktivitas." />}
      </Panel>
    </div>

    <Panel title="Koneksi" subtitle={cached ? 'Menampilkan data terakhir yang tersimpan' : undefined}>
      {healthQ.loading && !health ? <SkeletonPanel rows={2} />
        : health ? <div className="system-board">
          <div><span>API</span><strong>{health.api === 'ok' ? 'Online' : 'Offline'}</strong></div>
          <div><span>Database</span><strong>{health.database === 'connected' ? 'Connected' : 'Unavailable'}</strong></div>
          <div><span>Versi</span><strong>v{health.version}</strong></div>
          <div><span>Sync terakhir</span><strong>{relativeTime(health.lastSync)}</strong></div>
        </div> : <ErrorState message="Health API tidak tersedia." retry={() => void healthQ.refresh()} />}
    </Panel>
  </>;
}

function Monitoring() {
  const [sensorType, setSensorType] = useState('temperature');
  const [hours, setHours] = useState(24);
  const [sensorEnabled, setSensorEnabled] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('aeris-sensor-enabled') ?? '{}') as Record<string, boolean>; } catch { return {}; }
  });
  const toggleSensor = (sensorType: string) => setSensorEnabled(previous => {
    const next = { ...previous, [sensorType]: previous[sensorType] === false };
    localStorage.setItem('aeris-sensor-enabled', JSON.stringify(next));
    return next;
  });
  const { data: latest, refresh: rl } = useData(() => api.sensorsLatest(), []);
  const { data: trends, error, loading, refresh } = useData(() => api.sensorsTrends(sensorType, hours), [sensorType, hours]);
  const { data: history } = useData(() => api.sensorsHistory({ sensorType, hours, limit: 100 }), [sensorType, hours]);

  useEffect(() => { const iv = setInterval(() => { void rl(); void refresh(); }, 30000); return () => clearInterval(iv); }, [rl, refresh]);

  const sensorOptions = [
    { value: 'temperature', label: 'Suhu (°C)' },
    { value: 'humidity', label: 'Kelembapan (%)' },
    { value: 'soil_moisture', label: 'Kelembapan tanah (%)' },
    { value: 'light', label: 'Cahaya (lux)' },
    { value: 'ph', label: 'pH' },
    { value: 'co2', label: 'CO₂ (ppm)' },
    { value: 'water_level', label: 'Level air' },
  ];
  const currentSensor = sensorOptions.find(s => s.value === sensorType);

  return <>
    <header className="page-head"><div><h1>Environmental monitoring</h1><p className="page-description">Pembacaan terbaru dan tren per jam. Ambang target masih bersifat operasional, bukan rekomendasi agronomi tervalidasi.</p></div><span className="section-kicker">DEMO / SIMULATED</span></header>

    {latest && <div className="sensor-grid">{latest.map(s => (
      <div key={s.id} className={`sensor-control-card ${sensorEnabled[s.sensorType] === false ? 'sensor-disabled' : ''}`}><SensorCard icon={sensorIcons[s.sensorType] ?? 'activity'} label={s.sensorType.replace('_', ' ')} value={s.value} unit={s.unit} sub={`${s.deviceId} · ${relativeTime(s.recordedAt)}`} /><button type="button" className="btn-sm sensor-toggle" aria-pressed={sensorEnabled[s.sensorType] !== false} onClick={() => toggleSensor(s.sensorType)}>{sensorEnabled[s.sensorType] === false ? 'Nyalakan sensor' : 'Matikan sensor'}</button></div>
    ))}</div>}

    <div className="filters">
      <label className="filter-field">Sensor<select value={sensorType} onChange={e => setSensorType(e.target.value)}>{sensorOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      <label className="filter-field">Periode<select value={hours} onChange={e => setHours(Number(e.target.value))}><option value={6}>6 jam</option><option value={12}>12 jam</option><option value={24}>24 jam</option><option value={48}>48 jam</option><option value={168}>7 hari</option></select></label>
    </div>

    {error && <ErrorState message={error} retry={refresh} />}

    <Panel title={currentSensor?.label ?? sensorType} subtitle={`${hours} jam terakhir, rata-rata per jam`}>
      {loading ? <p className="loading-inline">Memuat tren…</p> : trends?.length ? (
        <div className="chart-wrap"><ResponsiveContainer width="100%" height={300}>
          <AreaChart data={trends} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs><linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2f6b4f" stopOpacity={0.22}/><stop offset="95%" stopColor="#2f6b4f" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid stroke="#e7ece4" vertical={false} />
            <XAxis dataKey="hour" tickFormatter={(v) => new Date(String(v)).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} tick={{ fill: '#5d6a60', fontSize: 11 }} axisLine={{ stroke: '#d5ddd2' }} tickLine={false} />
            <YAxis tick={{ fill: '#5d6a60', fontSize: 11 }} width={44} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={chartTooltip} labelFormatter={(v) => formatDate(String(v ?? ''))} formatter={(v) => [formatNumber(typeof v === 'number' ? v : Number(v), 2), '']} />
            <Area type="monotone" dataKey="max" stroke="#849087" fill="none" strokeDasharray="3 3" name="Max" />
            <Area type="monotone" dataKey="avg" stroke="#2f6b4f" fill="url(#colorAvg)" strokeWidth={1.75} name="Avg" />
            <Area type="monotone" dataKey="min" stroke="#849087" fill="none" strokeDasharray="3 3" name="Min" />
          </AreaChart>
        </ResponsiveContainer></div>
      ) : <Empty detail="Belum ada data untuk periode ini." />}
    </Panel>

    {history && history.length > 0 && <Panel title="Data mentah" subtitle={`${history.length} pembacaan terakhir`}>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Waktu</th><th>Device</th><th>Tipe</th><th>Nilai</th><th>Unit</th></tr></thead>
      <tbody>{history.slice(0, 30).map(r => <tr key={r.id}><td>{formatDate(r.recordedAt)}</td><td>{r.deviceId}</td><td>{r.sensorType}</td><td><strong>{formatNumber(r.value, 2)}</strong></td><td>{r.unit}</td></tr>)}</tbody></table></div>
    </Panel>}
  </>;
}

function Actuators() {
  const { data: actuatorList, error, refresh } = useData(() => api.actuators(), []);
  const { data: deviceList } = useData(() => api.devices(), []);
  const [toggling, setToggling] = useState<number | null>(null);

  const toggle = async (id: number, currentState: string) => {
    setToggling(id);
    try {
      const newState = currentState === 'on' ? 'off' : 'on';
      await api.actuatorSetState(id, newState);
      await refresh();
    } catch { /* ignore */ }
    finally { setToggling(null); }
  };
  const toggleAuto = async (id: number, current: boolean) => {
    setToggling(id);
    try { await api.actuatorSetAuto(id, !current); await refresh(); }
    catch { /* ignore */ }
    finally { setToggling(null); }
  };

  const typeLabels: Record<string, string> = {
    irrigation_pump: 'Pompa irigasi', nutrient_pump: 'Pompa nutrisi', misting: 'Misting',
    grow_light: 'Grow light', exhaust_fan: 'Exhaust fan', intake_fan: 'Intake fan',
    heater: 'Heater', cooler: 'Cooler', shade_screen: 'Shade screen', valve: 'Valve',
  };

  return <>
    <header className="page-head"><div><h1>Greenhouse control</h1><p className="page-description">Perintah manual dan mode otomatis. Pengiriman perintah tidak sama dengan konfirmasi keadaan fisik.</p></div><span className="section-kicker">COMMAND PATH: SIMULATED</span></header>
    {error && <ErrorState message={error} retry={refresh} />}

    {deviceList && <Panel title="Perangkat" subtitle={`${deviceList.filter(d => d.status === 'online').length} online dari ${deviceList.length}`}>
      <div className="device-grid">{deviceList.map(d => (
        <div key={d.id} className="device-card">
          <div className="device-header"><strong>{d.name}</strong><StatusBadge status={d.status} /></div>
          <div className="device-meta"><span>{d.type}</span><span>{d.location}</span>{d.firmwareVersion && <span>v{d.firmwareVersion}</span>}</div>
          <small>Heartbeat {relativeTime(d.lastHeartbeat)}</small>
        </div>
      ))}</div>
    </Panel>}

    <Panel title="Aktuator terdaftar" subtitle="Tombol membuat perintah simulasi; status hardware fisik tetap tidak diketahui." actions={<button type="button" className="btn-sm" onClick={() => void refresh()}><Icon name="refresh" size={14} /> Refresh</button>}>
      {actuatorList?.length ? <div className="actuator-grid">{actuatorList.map(a => (
        <div key={a.id} className={`actuator-card ${a.state === 'on' || a.state === 'auto' ? 'actuator-active' : ''}`}>
          <div className="actuator-header">
            <h3>{typeLabels[a.actuatorType] ?? a.actuatorType}</h3>
            <StatusBadge status={a.state} />
          </div>
          <p className="actuator-name">{a.name}</p>
          <p className="actuator-meta">{a.deviceId}{a.gpioPin != null && ` · GPIO ${a.gpioPin}`}</p>
          {a.lastToggledAt && <small>Toggle terakhir {relativeTime(a.lastToggledAt)}</small>}
          <div className="actuator-controls">
            <button type="button" className={`btn-toggle ${a.state === 'on' ? 'active' : ''}`} disabled={toggling === a.id || a.autoEnabled} onClick={() => void toggle(a.id, a.state)}>
              {a.state === 'on' ? 'Matikan' : 'Nyalakan'}
            </button>
            <button type="button" className={`btn-auto ${a.autoEnabled ? 'active' : ''}`} disabled={toggling === a.id} onClick={() => void toggleAuto(a.id, a.autoEnabled)}>
              {a.autoEnabled ? 'Auto on' : 'Auto off'}
            </button>
          </div>
        </div>
      ))}</div> : <Empty detail="Belum ada aktuator terdaftar." />}
    </Panel>
  </>;
}

function Irrigation() {
  const { data: schedules, error: se, refresh: rs } = useData(() => api.irrigationSchedules(), []);
  const { data: logs, refresh: rl } = useData(() => api.irrigationLogs({ page: 1, limit: 20 }).then(p => p.data), []);
  const { data: actuatorList } = useData(() => api.actuators(), []);
  const [manualActuator, setManualActuator] = useState<number | null>(null);
  const [manualDuration, setManualDuration] = useState(300);
  const [manualLoading, setManualLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState<number | null>(null);
  const toggleSchedule = async (id: number, enabled: boolean) => {
    setScheduleLoading(id);
    try { await api.irrigationScheduleToggle(id, !enabled); void rs(); } catch { /* panel error refreshes on next load */ }
    finally { setScheduleLoading(null); }
  };

  const startManual = async () => {
    if (!manualActuator) return;
    setManualLoading(true);
    try { await api.irrigationManual(manualActuator, manualDuration); void rl(); void rs(); }
    catch { /* ignore */ }
    finally { setManualLoading(false); }
  };

  const pumpActuators = actuatorList?.filter(a => a.actuatorType.includes('pump') || a.actuatorType === 'misting' || a.actuatorType === 'valve') ?? [];

  return <>
    <header className="page-head"><div><h1>Irigasi</h1><p className="page-description">Jadwal, kontrol manual, dan riwayat.</p></div></header>
    {se && <ErrorState message={se} retry={rs} />}

    <Panel title="Manual" subtitle="Mulai penyiraman langsung">
      <div className="manual-irrigation">
        <label className="filter-field">Aktuator
          <select value={manualActuator ?? ''} onChange={e => setManualActuator(Number(e.target.value) || null)}>
            <option value="">Pilih pompa</option>
            {pumpActuators.map(a => <option key={a.id} value={a.id}>{a.name} ({a.actuatorType})</option>)}
          </select>
        </label>
        <label className="filter-field">Durasi
          <select value={manualDuration} onChange={e => setManualDuration(Number(e.target.value))}>
            <option value={60}>1 menit</option><option value={120}>2 menit</option><option value={300}>5 menit</option>
            <option value={600}>10 menit</option><option value={900}>15 menit</option><option value={1800}>30 menit</option>
          </select>
        </label>
        <button type="button" className="btn-primary" disabled={!manualActuator || manualLoading} onClick={() => void startManual()}>
          {manualLoading ? 'Memulai…' : 'Mulai'}
        </button>
      </div>
    </Panel>

    <Panel title="Jadwal" subtitle={`${schedules?.filter(s => s.enabled).length ?? 0} aktif`}>
      {schedules?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Nama</th><th>Aktuator</th><th>Tipe</th><th>Interval</th><th>Durasi</th><th>Volume</th><th>Status</th><th>Terakhir</th></tr></thead>
      <tbody>{schedules.map(s => <tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.actuatorName}</td><td>{s.scheduleType}</td><td>{s.intervalMinutes ? `${s.intervalMinutes} min` : s.cronExpression ?? '—'}</td><td>{Math.round(s.durationSeconds / 60)} min</td><td>{s.volumeLiters ? `${formatNumber(s.volumeLiters, 1)} L` : '—'}</td><td><StatusBadge status={s.enabled ? 'on' : 'off'} /> <button type="button" className="btn-sm" disabled={scheduleLoading === s.id} onClick={() => void toggleSchedule(s.id, s.enabled)}>{scheduleLoading === s.id ? '…' : s.enabled ? 'Matikan' : 'Nyalakan'}</button></td><td>{relativeTime(s.lastRunAt)}</td></tr>)}</tbody></table></div>
      : <Empty detail="Belum ada jadwal irigasi." />}
    </Panel>

    <Panel title="Riwayat" subtitle="Log penyiraman terbaru">
      {logs?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Mulai</th><th>Aktuator</th><th>Tipe</th><th>Durasi</th><th>Volume</th><th>Status</th></tr></thead>
      <tbody>{logs.map(l => <tr key={l.id}><td>{formatDate(l.startedAt)}</td><td>{l.actuatorName}</td><td><StatusBadge status={l.triggerType} /></td><td>{l.durationSeconds ? `${Math.round(l.durationSeconds / 60)} min` : '—'}</td><td>{l.volumeLiters ? `${formatNumber(l.volumeLiters, 1)} L` : '—'}</td><td><StatusBadge status={l.status} /></td></tr>)}</tbody></table></div>
      : <Empty detail="Belum ada riwayat irigasi." />}
    </Panel>
  </>;
}

function Automation() {
  const { data: rules, error, refresh } = useData(() => api.automationRules(), []);
  const [toggling, setToggling] = useState<number | null>(null);

  const toggleRule = async (id: number, enabled: boolean) => {
    setToggling(id);
    try { await api.automationRuleToggle(id, !enabled); await refresh(); }
    catch { /* ignore */ }
    finally { setToggling(null); }
  };
  const deleteRule = async (id: number) => {
    if (!confirm('Hapus rule ini?')) return;
    try { await api.automationRuleDelete(id); await refresh(); }
    catch { /* ignore */ }
  };

  const conditionLabels: Record<string, string> = {
    above: 'di atas', below: 'di bawah', between: 'antara', equals: 'sama dengan',
  };
  const actionLabels: Record<string, string> = {
    turn_on: 'Nyalakan', turn_off: 'Matikan', toggle: 'Toggle',
  };

  return <>
    <header className="page-head"><div><h1>Automasi</h1><p className="page-description">Rule berdasarkan ambang sensor.</p></div></header>
    {error && <ErrorState message={error} retry={refresh} />}

    <Panel title="Rule" subtitle={`${rules?.filter(r => r.enabled).length ?? 0} dari ${rules?.length ?? 0} aktif`}>
      {rules?.length ? <div className="rules-grid">{rules.map(r => (
        <div key={r.id} className={`rule-card ${r.enabled ? 'rule-enabled' : 'rule-disabled'}`}>
          <div className="rule-header">
            <h3>{r.name}</h3>
            <div className="rule-actions">
              <button type="button" className={`btn-sm ${r.enabled ? 'btn-green' : ''}`} disabled={toggling === r.id} onClick={() => void toggleRule(r.id, r.enabled)}>
                {r.enabled ? 'Aktif' : 'Nonaktif'}
              </button>
              <button type="button" className="btn-sm btn-danger" onClick={() => void deleteRule(r.id)}>Hapus</button>
            </div>
          </div>
          {r.description && <p className="rule-desc">{r.description}</p>}
          <div className="rule-logic">
            <div className="rule-condition">
              <span>IF</span> <strong>{r.sensorType.replace('_', ' ')}</strong> {conditionLabels[r.condition] ?? r.condition} <strong>{formatNumber(r.thresholdMin, 1)}{r.thresholdMax != null ? ` – ${formatNumber(r.thresholdMax, 1)}` : ''}</strong>
            </div>
            <div className="rule-action">
              <span>THEN</span> <strong>{actionLabels[r.action] ?? r.action}</strong> → {r.actuatorName}
              {r.durationSeconds && <small> ({Math.round(r.durationSeconds / 60)} min)</small>}
            </div>
          </div>
          <div className="rule-meta">
            <small>Cooldown {Math.round(r.cooldownSeconds / 60)} min</small>
            <small>Prioritas {r.priority}</small>
            {r.lastTriggeredAt && <small>Terakhir {relativeTime(r.lastTriggeredAt)}</small>}
          </div>
        </div>
      ))}</div> : <Empty detail="Belum ada rule automasi." />}
    </Panel>
  </>;
}

function Alerts() {
  const { data: alertPage, error, refresh } = useData(() => api.alerts({ page: 1, limit: 50 }), []);
  const alertList = alertPage?.data;
  const [acking, setAcking] = useState<number | null>(null);

  const acknowledge = async (id: number) => {
    setAcking(id);
    try { await api.alertAcknowledge(id); await refresh(); }
    catch { /* ignore */ }
    finally { setAcking(null); }
  };

  const pending = alertList?.filter(a => !a.acknowledged) ?? [];
  const acknowledged = alertList?.filter(a => a.acknowledged) ?? [];

  return <>
    <header className="page-head"><div><h1>Alert</h1><p className="page-description">Peringatan sensor, aktuator, dan sistem.</p></div></header>
    {error && <ErrorState message={error} retry={refresh} />}

    <Panel title="Pending" subtitle={`${pending.length} alert`}>
      {pending.length ? <div className="alert-list">{pending.map(a => (
        <div key={a.id} className={`alert-item alert-${a.severity}`}>
          <span className="alert-sev" />
          <div className="alert-body">
            <div className="alert-top"><strong>{a.title}</strong><StatusBadge status={a.severity} /></div>
            <p>{a.message}</p>
            <div className="alert-meta"><small>{a.category} {a.deviceId && `· ${a.deviceId}`}</small><small>{relativeTime(a.createdAt)}</small></div>
          </div>
          <button type="button" className="btn-sm" disabled={acking === a.id} onClick={() => void acknowledge(a.id)}>
            {acking === a.id ? '…' : 'Acknowledge'}
          </button>
        </div>
      ))}</div> : <Empty detail="Tidak ada alert pending." />}
    </Panel>

    {acknowledged.length > 0 && <Panel title="Riwayat" subtitle={`${acknowledged.length} sudah direspons`}>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Severity</th><th>Judul</th><th>Pesan</th><th>Kategori</th><th>Waktu</th><th>Direspons</th></tr></thead>
      <tbody>{acknowledged.map(a => <tr key={a.id}><td><StatusBadge status={a.severity} /></td><td><strong>{a.title}</strong></td><td>{a.message}</td><td>{a.category}</td><td>{relativeTime(a.createdAt)}</td><td>{relativeTime(a.acknowledgedAt)}</td></tr>)}</tbody></table></div>
    </Panel>}
  </>;
}

function System() {
  const { data: health, error: he, refresh: rh } = useData(() => api.health(), []);
  const { data: deviceList } = useData(() => api.devices(), []);
  const { data: activity } = useData(() => api.activityLogs({ page: 1, limit: 25 }), []);

  return <>
    <header className="page-head"><div><h1>Sistem</h1><p className="page-description">Status layanan, perangkat, dan audit log.</p></div></header>
    {he && <ErrorState message={he} retry={rh} />}
    {health && <div className="system-board">
      <div><span>API</span><strong>{health.api === 'ok' ? 'Operational' : 'Unavailable'}</strong><small>REST</small></div>
      <div><span>Database</span><strong>{health.database === 'connected' ? 'Connected' : 'Unavailable'}</strong><small>PostgreSQL</small></div>
      <div><span>Perangkat</span><strong>{health.onlineDevices}/{health.deviceCount}</strong><small>Online / total</small></div>
      <div><span>Sensor</span><strong>{health.sensorDataCount}</strong><small>Total readings</small></div>
      <div><span>Alert</span><strong>{health.alertCount}</strong><small>Pending</small></div>
      <div><span>Sync</span><strong>{relativeTime(health.lastSync)}</strong><small>{formatDate(health.lastSync)}</small></div>
    </div>}

    {deviceList && <Panel title="Perangkat" subtitle={`${deviceList.length} terdaftar`}>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>ID</th><th>Nama</th><th>Tipe</th><th>Lokasi</th><th>Status</th><th>Firmware</th><th>Heartbeat</th></tr></thead>
      <tbody>{deviceList.map(d => <tr key={d.id}><td><code>{d.deviceId}</code></td><td><strong>{d.name}</strong></td><td>{d.type}</td><td>{d.location}</td><td><StatusBadge status={d.status} /></td><td>{d.firmwareVersion ?? '—'}</td><td>{relativeTime(d.lastHeartbeat)}</td></tr>)}</tbody></table></div>
    </Panel>}

    <Panel title="Log aktivitas">
      {activity?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Waktu</th><th>Kategori</th><th>Aksi</th><th>User</th></tr></thead>
      <tbody>{activity.map(a => <tr key={a.id}><td>{formatDate(a.createdAt)}</td><td><StatusBadge status={a.category} /></td><td>{a.action}</td><td>{a.userLabel}</td></tr>)}</tbody></table></div>
      : <Empty detail="Belum ada log aktivitas." />}
    </Panel>
  </>;
}

function Login({ onLogin }: { onLogin: (user: FarmerUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const user = farmerUsers.find(item => item.username === username.trim().toLowerCase() && item.password === password);
    if (!user) { setError('Username atau password tidak sesuai.'); return; }
    localStorage.setItem(authStorageKey, user.username);
    onLogin(user);
  };
  return <main className="login-shell"><div className="login-layout">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><span>AERIS</span></div><p className="section-kicker">GREENHOUSE MONITORING</p>
      <h1 id="login-title">Selamat datang kembali</h1><p className="login-subtitle">Masuk untuk melihat kondisi kebun dan prioritas monitoring Anda.</p>
      <form onSubmit={submit} noValidate><label>Username<input value={username} onChange={e => { setUsername(e.target.value); setError(null); }} autoComplete="username" placeholder="contoh: budi.tani" required /></label><label>Password<input value={password} onChange={e => { setPassword(e.target.value); setError(null); }} type="password" autoComplete="current-password" placeholder="Masukkan password" required /></label>
        {error && <p className="login-error" role="alert">{error}</p>}<button className="btn-primary login-submit" type="submit">Masuk ke dashboard <span>→</span></button></form>
      <details className="demo-accounts"><summary>Akun demo tersedia (5 pengguna)</summary><div>{farmerUsers.map(item => <p key={item.username}><strong>{item.username}</strong><code>{item.password}</code></p>)}</div></details>
    </section>
    <aside className="login-preview" aria-label="Preview fitur dashboard">
      <div className="preview-orbit"><span className="orbit-dot" /><span className="orbit-line" /><strong>Live garden<br />intelligence</strong></div>
      <p className="section-kicker">Monitoring Dashboard</p><h2>Sistem Greenhouse terpadu terintegrasi IoT</h2><p className="preview-copy">AERIS merangkum sensor, irigasi, perangkat, dan alert sesuai fokus kebun Anda.</p>
      <div className="preview-metrics"><div><strong>24/7</strong><span>Pemantauan</span></div><div><strong>100%</strong><span>Demo lokal</span></div></div>
      <ul className="preview-list"><li><span>01</span><div><strong>Prioritas personal</strong><small>Sensor penting tampil lebih dulu.</small></div></li><li><span>02</span><div><strong>Insight operasional</strong><small>Status greenhouse ringkas dan jelas.</small></div></li><li><span>03</span><div><strong>Aksi lebih aman</strong><small>Feedback tetap terlihat saat offline.</small></div></li></ul>
    </aside>
  </div></main>;
}

function FarmerApp({ user, onLogout }: { user: FarmerUser; onLogout: () => void }) {
  const [section, setSection] = useState<Section>(sectionFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: health } = useData(() => api.health(), []);
  const alertCount = health?.alertCount ?? 0;

  useEffect(() => {
    const update = () => { setSection(sectionFromHash()); setMenuOpen(false); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  const navigate = (id: Section) => { window.location.hash = `/${id}`; setSection(id); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const selected = navigation.find(n => n.id === section)!;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    {menuOpen && <button type="button" className="nav-scrim" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand">
        <span className="brand-name">AERIS</span>
        <small>Greenhouse</small>
      </div>
      <nav aria-label="Primary navigation">
        {navigation.map(n => (
          <button type="button" key={n.id} className={n.id === section ? 'active' : ''}
            aria-current={n.id === section ? 'page' : undefined} onClick={() => navigate(n.id)}>
            <Icon name={n.icon} />
            {n.label}
            {n.id === 'alerts' && alertCount > 0 && <span className="nav-badge">{alertCount}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-user"><strong>{user.name}</strong><small>{user.farm}</small></div>
        <button type="button" className="logout-button" onClick={onLogout}>Keluar</button>
        <span className={health?.database !== 'connected' ? 'conn-down' : undefined}>
          <span className="status-dot" />
          {health?.database === 'connected' ? 'PostgreSQL' : health?.database === 'demo' ? 'Demo fixture' : 'Connecting'}
        </span>
        <small>{health?.version ? `v${health.version}` : 'offline'}</small>
      </div>
    </aside>

    <div className="workspace">
      <div className="demo-banner" role="status">
        <span className="demo-mark">DEMO</span>
        <span><strong>SIMULATED DATA</strong> — nilai sensor dan hasil perintah berasal dari seed lokal; belum terhubung ke ESP32 fisik.</span>
      </div>
      <header className="topbar">
        <button className="mobile-menu" type="button" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={() => setMenuOpen(v => !v)}>
          <Icon name="menu" size={18} />
        </button>
        <div className="breadcrumb">AERIS <span>/</span> <strong>{selected.label}</strong></div>
        <div className="topbar-context"><span className="context-select">Smart Greenhouse AERIS <span>⌄</span></span><span className="context-date">21 Okt 2026</span></div>
        <div className="topbar-right">
          <span className={`connection ${health?.database !== 'connected' ? 'down' : ''}`}><i />{health?.database === 'connected' ? 'Connected' : 'Connecting'}</span>
          <span className="topbar-avatar" aria-label={`Profil ${user.name}`}>{user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span>
        </div>
      </header>
      <main id="main" className="main-content">
        {section === 'dashboard' && <Dashboard user={user} />}
        {section === 'monitoring' && <Monitoring />}
        {section === 'actuators' && <Actuators />}
        {section === 'irrigation' && <Irrigation />}
        {section === 'automation' && <Automation />}
        {section === 'alerts' && <Alerts />}
        {section === 'system' && <System />}
      </main>
      <footer className="footer">
        <span>AERIS</span>
        <span>Greenhouse monitoring</span>
      </footer>
    </div>
  </div>;
}

export default function App() {
  const [user, setUser] = useState<FarmerUser | null>(() => farmerUsers.find(item => item.username === localStorage.getItem(authStorageKey)) ?? null);
  if (!user) return <Login onLogin={setUser} />;
  const logout = () => { localStorage.removeItem(authStorageKey); setUser(null); };
  return <FarmerApp user={user} onLogout={logout} />;
}

