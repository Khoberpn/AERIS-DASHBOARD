// === TYPES ===
export type Experiment = { id: number; name: string; description: string; durationDays: number; startDate: string | null; endDate: string | null; status: string; datasetKind: string; sourceLabel: string; treatments?: Treatment[]; replicationCount?: number; experimentalUnits?: number };
export type Treatment = { id: number; experimentId: number; code: string; name: string; description: string; displayOrder: number };
export type Coating = { treatmentId: number; code: string; name: string; description: string; experiment: string; datasetKind: string; sourceLabel: string; sampleCount: number; avgVoltage: number; avgCurrent: number; avgPower: number; avgPanelTemperature: number; powerChangePercent: number | null; sourceNote: string };
export type Measurement = { id: number; recordedAt: string; experimentId: number; experiment: string; treatmentId: number; treatment: string; replication: number; voltage: number; current: number; power: number; panelTemperature: number | null; ambientTemperature: number | null; humidity: number | null; irradiance: number | null; source: string };
export type Trend = { day: string; treatmentId: number; treatment: string; count: number; power: number | null; panelTemperature: number | null };
export type GreenhouseReading = { id: number; recordedAt: string; temperature: number | null; humidity: number | null; lightIntensity: number | null; soilMoisture: number | null; waterLevel: number | null; irrigationStatus: string | null; deviceId: string; source: string };
export type Health = { api: string; database: string; version: string; environment: string; measurementCount: number; greenhouseCount: number; deviceCount: number; onlineDevices: number; alertCount: number; sensorDataCount: number; lastSync: string | null; deviceStatus: string };
export type Page<T> = { data: T[]; meta: { page: number; limit: number; total: number; source?: string } };

// Greenhouse Controller types
export type Device = { id: number; deviceId: string; name: string; type: string; location: string; status: string; lastHeartbeat: string | null; firmwareVersion: string | null; config: Record<string, unknown>; createdAt: string; updatedAt: string };
export type SensorReading = { id: number; deviceId: string; sensorType: string; value: number; unit: string; recordedAt: string };
export type SensorTrend = { hour: string; avg: number; min: number; max: number; count: number };
export type Actuator = { id: number; deviceId: string; name: string; actuatorType: string; gpioPin: number | null; state: string; lastToggledAt: string | null; autoEnabled: boolean; createdAt: string };
export type AutomationRule = { id: number; name: string; description: string | null; sensorType: string; condition: string; thresholdMin: number; thresholdMax: number | null; actuatorId: number; actuatorName: string; actuatorType: string; action: string; durationSeconds: number | null; cooldownSeconds: number; enabled: boolean; priority: number; lastTriggeredAt: string | null; createdAt: string };
export type IrrigationSchedule = { id: number; name: string; actuatorId: number; actuatorName: string; actuatorType: string; scheduleType: string; intervalMinutes: number | null; cronExpression: string | null; durationSeconds: number; volumeLiters: number | null; enabled: boolean; lastRunAt: string | null; nextRunAt: string | null };
export type IrrigationLog = { id: number; scheduleId: number | null; actuatorId: number; actuatorName: string; startedAt: string; endedAt: string | null; durationSeconds: number | null; volumeLiters: number | null; triggerType: string; status: string; notes: string | null };
export type Alert = { id: number; severity: string; category: string; title: string; message: string; deviceId: string | null; acknowledged: boolean; acknowledgedAt: string | null; createdAt: string };
export type ActivityLog = { id: number; action: string; category: string; details: Record<string, unknown>; userLabel: string; createdAt: string };
export type DashboardSummary = {
  latestSensors: { temperature: number | null; humidity: number | null; soilMoisture: number | null; light: number | null; ph: number | null; co2: number | null; waterLevel: number | null; ec: number | null; waterFlow: number | null; windSpeed: number | null; rain: number | null };
  sensorTimestamps: Record<string, string | null>;
  onlineDevices: number; totalDevices: number; offlineDevices: number;
  activeActuators: number; totalActuators: number;
  pendingAlerts: number; criticalAlerts: number;
  activeIrrigation: number; activeRules: number;
  runningActuators: { id: number; name: string; actuatorType: string; state: string }[];
};

// === HTTP CLIENT ===
export class ApiError extends Error { constructor(message: string, public status?: number) { super(message); } }
async function get<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, { signal: controller.signal, headers: { Accept: 'application/json' } });
    let body: unknown;
    try { body = await response.json(); } catch { throw new ApiError('Respons API bukan JSON yang valid.', response.status); }
    if (!body || typeof body !== 'object') throw new ApiError('Format respons API tidak valid.', response.status);
    const envelope = body as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new ApiError(envelope.error?.message || `Permintaan gagal (${response.status}).`, response.status);
    if (!('data' in envelope)) throw new ApiError('Data tidak ditemukan dalam respons API.', response.status);
    return envelope.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('Koneksi API melebihi batas waktu. Coba lagi.');
    throw new ApiError('API tidak dapat dihubungi. Periksa layanan dan jaringan.');
  } finally { window.clearTimeout(timer); }
}
async function getPage<T>(path: string): Promise<Page<T>> {
  const result = await getEnvelope<Page<T>>(path);
  if (!Array.isArray(result.data) || typeof result.meta?.total !== 'number') throw new ApiError('Format daftar data dari API tidak valid.');
  return result;
}
async function getEnvelope<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const body = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new ApiError(body.error?.message || `Permintaan gagal (${response.status}).`, response.status);
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('Koneksi API melebihi batas waktu. Coba lagi.');
    throw new ApiError('API tidak dapat dihubungi atau responsnya tidak valid.');
  } finally { window.clearTimeout(timer); }
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new ApiError(data.error?.message || `Permintaan gagal (${response.status}).`, response.status);
    return data.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('Koneksi API melebihi batas waktu.');
    throw new ApiError('API tidak dapat dihubungi.');
  } finally { window.clearTimeout(timer); }
}
async function patch<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, {
      method: 'PATCH', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new ApiError(data.error?.message || `Permintaan gagal (${response.status}).`, response.status);
    return data.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('Koneksi API melebihi batas waktu.');
    throw new ApiError('API tidak dapat dihubungi.');
  } finally { window.clearTimeout(timer); }
}
async function del<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { method: 'DELETE', signal: controller.signal, headers: { Accept: 'application/json' } });
    const data = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new ApiError(data.error?.message || `Permintaan gagal (${response.status}).`, response.status);
    return data.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('Koneksi API melebihi batas waktu.');
    throw new ApiError('API tidak dapat dihubungi.');
  } finally { window.clearTimeout(timer); }
}

const params = (value: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(value).forEach(([key, item]) => { if (item !== undefined && item !== '') search.set(key, String(item)); });
  return search.toString();
};
function checkArray<T>(value: T[]): T[] { if (!Array.isArray(value)) throw new ApiError('Format daftar data dari API tidak valid.'); return value; }

// === DEMO FALLBACK ===
// Fixtures mirror the API contracts so the UI remains explorable without PostgreSQL.
const demoNow = Date.now();
const demoTime = (minutesAgo: number) => new Date(demoNow - minutesAgo * 60000).toISOString();
const demoDevices: Device[] = [
  { id: 1, deviceId: 'esp32-main', name: 'ESP32 Main Controller', type: 'controller', location: 'greenhouse-main', status: 'online', lastHeartbeat: demoTime(1), firmwareVersion: '2.1.0', config: {}, createdAt: demoTime(10080), updatedAt: demoTime(1) },
  { id: 2, deviceId: 'dht22-01', name: 'DHT22 Suhu & Kelembapan', type: 'sensor', location: 'zone-a', status: 'online', lastHeartbeat: demoTime(2), firmwareVersion: '1.0.0', config: {}, createdAt: demoTime(10080), updatedAt: demoTime(2) },
  { id: 3, deviceId: 'soil-01', name: 'Soil Moisture Sensor A', type: 'sensor', location: 'zone-a', status: 'online', lastHeartbeat: demoTime(3), firmwareVersion: '1.0.0', config: {}, createdAt: demoTime(10080), updatedAt: demoTime(3) },
  { id: 4, deviceId: 'lux-01', name: 'BH1750 Light Sensor', type: 'sensor', location: 'greenhouse-main', status: 'online', lastHeartbeat: demoTime(4), firmwareVersion: '1.0.0', config: {}, createdAt: demoTime(10080), updatedAt: demoTime(4) },
  { id: 5, deviceId: 'fan-ctrl', name: 'Fan Controller', type: 'actuator', location: 'greenhouse-main', status: 'offline', lastHeartbeat: demoTime(132), firmwareVersion: '1.2.0', config: {}, createdAt: demoTime(10080), updatedAt: demoTime(132) },
];
const demoActuators: Actuator[] = [
  { id: 1, deviceId: 'esp32-main', name: 'Pompa Irigasi Utama', actuatorType: 'irrigation_pump', gpioPin: 2, state: 'off', lastToggledAt: demoTime(24), autoEnabled: false, createdAt: demoTime(10080) },
  { id: 2, deviceId: 'esp32-main', name: 'Grow Light LED', actuatorType: 'grow_light', gpioPin: 5, state: 'on', lastToggledAt: demoTime(18), autoEnabled: true, createdAt: demoTime(10080) },
  { id: 3, deviceId: 'fan-ctrl', name: 'Exhaust Fan', actuatorType: 'exhaust_fan', gpioPin: 6, state: 'off', lastToggledAt: demoTime(90), autoEnabled: true, createdAt: demoTime(10080) },
  { id: 4, deviceId: 'esp32-main', name: 'Misting Nozzle', actuatorType: 'misting', gpioPin: 4, state: 'off', lastToggledAt: demoTime(45), autoEnabled: false, createdAt: demoTime(10080) },
];
const demoRules: AutomationRule[] = [
  { id: 1, name: 'Irigasi saat tanah kering', description: 'Menjaga kelembapan zona A tetap stabil.', sensorType: 'soil_moisture', condition: 'below', thresholdMin: 40, thresholdMax: null, actuatorId: 1, actuatorName: 'Pompa Irigasi Utama', actuatorType: 'irrigation_pump', action: 'turn_on', durationSeconds: 300, cooldownSeconds: 900, enabled: true, priority: 1, lastTriggeredAt: demoTime(42), createdAt: demoTime(10080) },
  { id: 2, name: 'Kipas saat panas', description: 'Membuang panas berlebih dari kanopi.', sensorType: 'temperature', condition: 'above', thresholdMin: 35, thresholdMax: null, actuatorId: 3, actuatorName: 'Exhaust Fan', actuatorType: 'exhaust_fan', action: 'turn_on', durationSeconds: null, cooldownSeconds: 300, enabled: true, priority: 2, lastTriggeredAt: demoTime(65), createdAt: demoTime(10080) },
  { id: 3, name: 'Grow light malam', description: 'Kompensasi cahaya rendah secara otomatis.', sensorType: 'light', condition: 'below', thresholdMin: 500, thresholdMax: null, actuatorId: 2, actuatorName: 'Grow Light LED', actuatorType: 'grow_light', action: 'turn_on', durationSeconds: null, cooldownSeconds: 300, enabled: false, priority: 3, lastTriggeredAt: null, createdAt: demoTime(10080) },
];
const demoAlerts: Alert[] = [
  { id: 1, severity: 'warning', category: 'environment', title: 'Suhu tinggi terdeteksi', message: 'Suhu greenhouse mencapai 37.2°C pada zone-a.', deviceId: 'dht22-01', acknowledged: false, acknowledgedAt: null, createdAt: demoTime(24) },
  { id: 2, severity: 'critical', category: 'irrigation', title: 'Level air rendah', message: 'Level air tangki utama di bawah 15%. Segera isi ulang.', deviceId: null, acknowledged: false, acknowledgedAt: null, createdAt: demoTime(48) },
  { id: 3, severity: 'info', category: 'system', title: 'Firmware update tersedia', message: 'ESP32 Main Controller memiliki update firmware v2.2.0.', deviceId: 'esp32-main', acknowledged: true, acknowledgedAt: demoTime(20), createdAt: demoTime(180) },
];
const demoReadings: SensorReading[] = [
  { id: 1, deviceId: 'dht22-01', sensorType: 'temperature', value: 32.4, unit: '°C', recordedAt: demoTime(2) },
  { id: 2, deviceId: 'dht22-01', sensorType: 'humidity', value: 64, unit: '%', recordedAt: demoTime(2) },
  { id: 3, deviceId: 'soil-01', sensorType: 'soil_moisture', value: 42, unit: '%', recordedAt: demoTime(3) },
  { id: 4, deviceId: 'lux-01', sensorType: 'light', value: 12800, unit: 'lux', recordedAt: demoTime(4) },
  { id: 5, deviceId: 'esp32-main', sensorType: 'ph', value: 6.2, unit: 'pH', recordedAt: demoTime(5) },
  { id: 6, deviceId: 'esp32-main', sensorType: 'water_level', value: 22, unit: 'cm', recordedAt: demoTime(5) },
];
const demoSummary: DashboardSummary = { latestSensors: { temperature: 32.4, humidity: 64, soilMoisture: 42, light: 12800, ph: 6.2, co2: 612, waterLevel: 22, ec: 1.8, waterFlow: 0, windSpeed: 1.4, rain: 0 }, sensorTimestamps: { temperature: demoTime(2), humidity: demoTime(2), soilMoisture: demoTime(3), light: demoTime(4), ph: demoTime(5), waterLevel: demoTime(5) }, onlineDevices: 4, totalDevices: 5, offlineDevices: 1, activeActuators: 1, totalActuators: 4, pendingAlerts: 2, criticalAlerts: 1, activeIrrigation: 0, activeRules: 2, runningActuators: [{ id: 2, name: 'Grow Light LED', actuatorType: 'grow_light', state: 'on' }] };
const demoActivity: ActivityLog[] = [
  { id: 1, category: 'actuator', action: 'Grow Light LED dinyalakan otomatis', details: { actuatorId: 2 }, userLabel: 'AERIS Automation', createdAt: demoTime(18) },
  { id: 2, category: 'alert', action: 'Alert suhu tinggi dibuat', details: { alertId: 1 }, userLabel: 'System', createdAt: demoTime(24) },
  { id: 3, category: 'device', action: 'ESP32 Main Controller heartbeat', details: { deviceId: 'esp32-main' }, userLabel: 'Telemetry', createdAt: demoTime(1) },
];
const demoPage = <T,>(data: T[], limit = data.length): Page<T> => ({ data: data.slice(0, limit), meta: { page: 1, limit, total: data.length, source: 'simulated' } });
const demoTrends = (sensorType: string, hours: number): SensorTrend[] => Array.from({ length: Math.min(hours, 24) }, (_, i) => { const base = sensorType === 'temperature' ? 29 : sensorType === 'humidity' ? 64 : sensorType === 'soil_moisture' ? 46 : 520; const wave = Math.sin(i / 3) * (sensorType === 'light' ? 180 : 3); return { hour: new Date(demoNow - (Math.min(hours, 24) - i) * 3600000).toISOString(), avg: base + wave, min: base + wave - 2, max: base + wave + 2, count: 6 }; });
const demoMode = <T>(request: Promise<T>, fallback: T): Promise<T> => request.catch(() => fallback);
const demoSchedules: IrrigationSchedule[] = [
  { id: 1, name: 'Irigasi Pagi', actuatorId: 1, actuatorName: 'Pompa Irigasi Utama', actuatorType: 'irrigation_pump', scheduleType: 'interval', intervalMinutes: 360, cronExpression: null, durationSeconds: 300, volumeLiters: 5, enabled: true, lastRunAt: demoTime(180), nextRunAt: demoTime(-180) },
  { id: 2, name: 'Drip Zone A', actuatorId: 1, actuatorName: 'Pompa Irigasi Utama', actuatorType: 'irrigation_pump', scheduleType: 'interval', intervalMinutes: 120, cronExpression: null, durationSeconds: 180, volumeLiters: 2, enabled: true, lastRunAt: demoTime(60), nextRunAt: demoTime(-60) },
  { id: 3, name: 'Nutrisi Harian', actuatorId: 1, actuatorName: 'Pompa Irigasi Utama', actuatorType: 'nutrient_pump', scheduleType: 'cron', intervalMinutes: null, cronExpression: '0 8 * * *', durationSeconds: 600, volumeLiters: 3, enabled: false, lastRunAt: demoTime(900), nextRunAt: demoTime(-540) },
];
const demoLogs: IrrigationLog[] = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, scheduleId: i % 3 + 1, actuatorId: 1, actuatorName: 'Pompa Irigasi Utama', startedAt: demoTime(180 + i * 180), endedAt: demoTime(175 + i * 180), durationSeconds: 300, volumeLiters: 4.5 + i * 0.2, triggerType: i === 0 ? 'manual' : 'scheduled', status: 'completed', notes: null }));
// Mutasi demo tetap interaktif saat backend/DB belum aktif.
let demoActuatorState = demoActuators.map(item => ({ ...item }));
let demoScheduleState = demoSchedules.map(item => ({ ...item }));
let demoRuleState = demoRules.map(item => ({ ...item }));
const updateDemoActuator = (id: number, patchValue: Partial<Actuator>): Actuator => {
  demoActuatorState = demoActuatorState.map(item => item.id === id ? { ...item, ...patchValue } : item);
  return demoActuatorState.find(item => item.id === id) ?? demoActuators[0]!;
};
const updateDemoSchedule = (id: number, enabled: boolean): IrrigationSchedule[] => {
  demoScheduleState = demoScheduleState.map(item => item.id === id ? { ...item, enabled } : item);
  return demoScheduleState;
};
const updateDemoRule = (id: number, enabled: boolean): AutomationRule[] => {
  demoRuleState = demoRuleState.map(item => item.id === id ? { ...item, enabled } : item);
  return demoRuleState;
};

// === API ===
export const api = {
  // Health & Dashboard
  health: () => demoMode(get<Health>('/api/health'), { api: 'ok', database: 'demo', version: '1.0.0-demo', environment: 'demo', measurementCount: 288, greenhouseCount: 1, deviceCount: demoDevices.length, onlineDevices: 4, alertCount: 2, sensorDataCount: demoReadings.length, lastSync: demoTime(2), deviceStatus: 'degraded' }),
  dashboardSummary: () => demoMode(get<DashboardSummary>('/api/dashboard/summary'), demoSummary),

  // Legacy research
  experiments: () => get<Experiment[]>('/api/experiments').then(checkArray),
  experiment: (id: number) => get<Experiment>(`/api/experiments/${id}`),
  treatments: () => get<Treatment[]>('/api/treatments').then(checkArray),
  coating: () => get<Coating[]>('/api/analytics/coating').then(checkArray),
  latestMeasurement: () => getPage<Measurement>('/api/measurements?page=1&limit=1'),
  measurements: (query: Record<string, string | number | undefined>) => getPage<Measurement>(`/api/measurements?${params(query)}`),
  trends: (query: Record<string, string | number | undefined>) => get<Trend[]>(`/api/measurements/trends?${params(query)}`).then(checkArray),
  greenhouseLatest: () => get<GreenhouseReading | null>('/api/greenhouse/latest'),
  greenhouseHistory: (query: Record<string, string | number | undefined>) => getPage<GreenhouseReading>(`/api/greenhouse/history?${params(query)}`),

  // Devices
  devices: () => demoMode(get<Device[]>('/api/devices').then(checkArray), demoDevices),
  device: (deviceId: string) => get<Device>(`/api/devices/${deviceId}`),

  // Sensors
  sensorsLatest: () => demoMode(get<SensorReading[]>('/api/sensors/latest').then(checkArray), demoReadings),
  sensorsHistory: (query: { sensorType?: string; deviceId?: string; hours?: number; limit?: number }) => demoMode(get<SensorReading[]>(`/api/sensors/history?${params(query as Record<string, string | number | undefined>)}`).then(checkArray), demoReadings.filter(r => !query.sensorType || r.sensorType === query.sensorType)),
  sensorsTrends: (sensorType: string, hours = 24) => demoMode(get<SensorTrend[]>(`/api/sensors/trends?${params({ sensorType, hours })}`).then(checkArray), demoTrends(sensorType, hours)),

  // Actuators
  actuators: () => demoMode(get<Actuator[]>('/api/actuators').then(checkArray), demoActuatorState),
  actuatorSetState: (id: number, state: string) => demoMode(patch<Actuator>(`/api/actuators/${id}/state`, { state }), updateDemoActuator(id, { state, lastToggledAt: new Date().toISOString() })),
  actuatorSetAuto: (id: number, autoEnabled: boolean) => demoMode(patch<Actuator>(`/api/actuators/${id}/auto`, { autoEnabled }), updateDemoActuator(id, { autoEnabled, state: autoEnabled ? 'auto' : 'off' })),

  // Automation Rules
  automationRules: () => demoMode(get<AutomationRule[]>('/api/automation/rules').then(checkArray), demoRuleState),
  automationRuleToggle: (id: number, enabled: boolean) => demoMode(patch<AutomationRule>(`/api/automation/rules/${id}`, { enabled }), updateDemoRule(id, enabled).find(item => item.id === id) ?? demoRules[0]),
  automationRuleDelete: (id: number) => demoMode(del<{ deleted: boolean }>(`/api/automation/rules/${id}`), { deleted: true }),

  // Irrigation
  irrigationSchedules: () => demoMode(get<IrrigationSchedule[]>('/api/irrigation/schedules').then(checkArray), demoScheduleState),
  irrigationScheduleToggle: (id: number, enabled: boolean) => demoMode(patch<IrrigationSchedule>(`/api/irrigation/schedules/${id}`, { enabled }), updateDemoSchedule(id, enabled).find(item => item.id === id) ?? demoSchedules[0]),
  irrigationManual: (actuatorId: number, durationSeconds: number) => demoMode(post<IrrigationLog>('/api/irrigation/manual', { actuatorId, durationSeconds }), ({ id: Date.now(), scheduleId: null, actuatorId, actuatorName: demoActuatorState.find(item => item.id === actuatorId)?.name ?? 'Aktuator', startedAt: new Date().toISOString(), endedAt: null, durationSeconds, volumeLiters: null, triggerType: 'manual', status: 'running', notes: 'Simulasi lokal' } as IrrigationLog)),
  irrigationLogs: (query?: { page?: number; limit?: number }) => demoMode(getPage<IrrigationLog>(`/api/irrigation/logs?${params(query as Record<string, string | number | undefined> ?? {})}`), demoPage(demoLogs, query?.limit ?? 20)),


  // Alerts
  alerts: (query?: { page?: number; limit?: number; severity?: string; acknowledged?: boolean }) => demoMode(getPage<Alert>(`/api/alerts?${params(query as Record<string, string | number | boolean | undefined> ?? {})}`), demoPage(demoAlerts.filter(a => query?.acknowledged === undefined || a.acknowledged === query.acknowledged), query?.limit ?? 50)),

  alertAcknowledge: (id: number) => patch<Alert>(`/api/alerts/${id}/acknowledge`, {}),

  // Activity
  activityLogs: (query?: { page?: number; limit?: number; category?: string }) => demoMode(get<ActivityLog[]>(`/api/activity?${params(query as Record<string, string | number | undefined> ?? {})}`).then(checkArray), demoActivity.filter(a => !query?.category || a.category === query.category)),

};

// === FORMATTERS ===
export const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Tidak tersedia';
export const formatNumber = (value: number | null | undefined, digits = 2) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value) : '—';
export const dateToIso = (date: string, end = false) => date ? new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}`).toISOString() : undefined;
export const relativeTime = (value: string | null | undefined) => {
  if (!value) return 'Tidak tersedia';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60000) return 'Baru saja';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} jam lalu`;
  return `${Math.floor(diff / 86400000)} hari lalu`;
};
