import express from 'express';
import cors from 'cors';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq, gte, lte, asc } from 'drizzle-orm';
import { config } from './config.js';
import { percentChange, powerFromVI } from './analytics.js';
import { db, pool } from './db/client.js';
import { experiments, greenhouseReadings, treatments, devices, sensorData, actuators, automationRules, irrigationSchedules, irrigationLogs, alerts, activityLogs } from './db/schema.js';
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.WEB_ORIGIN }));
app.use(express.json({ limit: '64kb' }));
const fail = (code, message) => ({ error: { code, message } });
const parse = (schema, value) => {
    const result = schema.safeParse(value);
    if (!result.success) {
        const message = result.error.issues.map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ');
        throw Object.assign(new Error(message), { status: 400, code: 'INVALID_INPUT' });
    }
    return result.data;
};
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const finite = z.number().finite();
const optional = (min, max) => finite.min(min).max(max).nullish();
const isoDate = z.iso.datetime({ offset: true });
const dateRange = z.object({
    from: isoDate.optional(), to: isoDate.optional(),
}).refine(value => !value.from || !value.to || value.from <= value.to, 'from must be before to');
const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
const measurementQuery = dateRange.safeExtend({
    page: paging.shape.page, limit: paging.shape.limit,
    treatmentId: z.coerce.number().int().positive().optional(),
    experimentId: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(100).optional(),
    sort: z.enum(['recordedAt', 'voltage', 'current', 'power', 'panelTemperature']).default('recordedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
});
const measureBody = z.object({
    replicationId: z.number().int().positive(), recordedAt: isoDate,
    voltage: finite.min(0).max(1000), current: finite.min(0).max(100),
    panelTemperature: optional(-50, 150), ambientTemperature: optional(-50, 100),
    humidity: optional(0, 100), irradiance: optional(0, 2000),
    source: z.enum(['sensor', 'manual']),
});
const greenhouseBody = z.object({
    recordedAt: isoDate, deviceId: z.string().trim().min(1).max(80), source: z.enum(['sensor', 'manual']),
    temperature: optional(-50, 100), humidity: optional(0, 100), lightIntensity: optional(0, 200000),
    soilMoisture: optional(0, 100), waterLevel: optional(0, 10000),
    irrigationStatus: z.enum(['on', 'off', 'unknown']).nullish(),
}).refine(value => [value.temperature, value.humidity, value.lightIntensity, value.soilMoisture, value.waterLevel, value.irrigationStatus].some(item => item != null), 'At least one measurement is required');
const requireIngest = (req, res, next) => {
    const received = req.header('x-ingest-token') || '';
    const expected = Buffer.from(config.INGEST_TOKEN);
    const actual = Buffer.from(received);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        res.status(401).json(fail('UNAUTHORIZED', 'A valid ingestion token is required.'));
        return;
    }
    next();
};
// ==================== HEALTH & DASHBOARD ====================
app.get('/api/health', route(async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        const counts = await pool.query(`SELECT (SELECT count(*) FROM measurements)::text AS measurements,
              (SELECT count(*) FROM greenhouse_readings)::text AS greenhouse,
              (SELECT count(*) FROM devices)::text AS "deviceCount",
              (SELECT count(*) FROM alerts WHERE NOT acknowledged)::text AS "alertCount",
              (SELECT count(*) FROM sensor_data)::text AS "sensorCount",
              (SELECT max(created_at) FROM (SELECT created_at FROM measurements UNION ALL SELECT created_at FROM greenhouse_readings UNION ALL SELECT created_at FROM sensor_data) synced) AS "lastSync"`);
        const onlineDevices = await pool.query(`SELECT count(*)::text AS count FROM devices WHERE status='online'`);
        res.json({ data: { api: 'ok', database: 'connected', version: '2.0.0', environment: config.NODE_ENV,
                measurementCount: Number(counts.rows[0]?.measurements ?? 0),
                greenhouseCount: Number(counts.rows[0]?.greenhouse ?? 0),
                deviceCount: Number(counts.rows[0]?.deviceCount ?? 0),
                onlineDevices: Number(onlineDevices.rows[0]?.count ?? 0),
                alertCount: Number(counts.rows[0]?.alertCount ?? 0),
                sensorDataCount: Number(counts.rows[0]?.sensorCount ?? 0),
                lastSync: counts.rows[0]?.lastSync ?? null,
                deviceStatus: Number(onlineDevices.rows[0]?.count ?? 0) > 0 ? 'connected' : 'not connected' } });
    }
    catch {
        res.status(503).json(fail('DATABASE_UNAVAILABLE', 'PostgreSQL is unavailable. Check the database service and server configuration.'));
    }
}));
app.get('/api/dashboard/summary', route(async (_req, res) => {
    const result = await pool.query(`
    SELECT
      (SELECT json_build_object(
        'temperature', (SELECT value FROM sensor_data WHERE sensor_type='temperature' ORDER BY recorded_at DESC LIMIT 1),
        'humidity', (SELECT value FROM sensor_data WHERE sensor_type='humidity' ORDER BY recorded_at DESC LIMIT 1),
        'soilMoisture', (SELECT value FROM sensor_data WHERE sensor_type='soil_moisture' ORDER BY recorded_at DESC LIMIT 1),
        'light', (SELECT value FROM sensor_data WHERE sensor_type='light' ORDER BY recorded_at DESC LIMIT 1),
        'ph', (SELECT value FROM sensor_data WHERE sensor_type='ph' ORDER BY recorded_at DESC LIMIT 1),
        'co2', (SELECT value FROM sensor_data WHERE sensor_type='co2' ORDER BY recorded_at DESC LIMIT 1),
        'waterLevel', (SELECT value FROM sensor_data WHERE sensor_type='water_level' ORDER BY recorded_at DESC LIMIT 1),
        'ec', (SELECT value FROM sensor_data WHERE sensor_type='ec' ORDER BY recorded_at DESC LIMIT 1),
        'waterFlow', (SELECT value FROM sensor_data WHERE sensor_type='water_flow' ORDER BY recorded_at DESC LIMIT 1),
        'windSpeed', (SELECT value FROM sensor_data WHERE sensor_type='wind_speed' ORDER BY recorded_at DESC LIMIT 1),
        'rain', (SELECT value FROM sensor_data WHERE sensor_type='rain' ORDER BY recorded_at DESC LIMIT 1)
      )) AS "latestSensors",
      (SELECT json_build_object(
        'temperature', (SELECT recorded_at FROM sensor_data WHERE sensor_type='temperature' ORDER BY recorded_at DESC LIMIT 1),
        'humidity', (SELECT recorded_at FROM sensor_data WHERE sensor_type='humidity' ORDER BY recorded_at DESC LIMIT 1),
        'soilMoisture', (SELECT recorded_at FROM sensor_data WHERE sensor_type='soil_moisture' ORDER BY recorded_at DESC LIMIT 1),
        'light', (SELECT recorded_at FROM sensor_data WHERE sensor_type='light' ORDER BY recorded_at DESC LIMIT 1),
        'ph', (SELECT recorded_at FROM sensor_data WHERE sensor_type='ph' ORDER BY recorded_at DESC LIMIT 1),
        'co2', (SELECT recorded_at FROM sensor_data WHERE sensor_type='co2' ORDER BY recorded_at DESC LIMIT 1),
        'waterLevel', (SELECT recorded_at FROM sensor_data WHERE sensor_type='water_level' ORDER BY recorded_at DESC LIMIT 1),
        'ec', (SELECT recorded_at FROM sensor_data WHERE sensor_type='ec' ORDER BY recorded_at DESC LIMIT 1),
        'waterFlow', (SELECT recorded_at FROM sensor_data WHERE sensor_type='water_flow' ORDER BY recorded_at DESC LIMIT 1),
        'windSpeed', (SELECT recorded_at FROM sensor_data WHERE sensor_type='wind_speed' ORDER BY recorded_at DESC LIMIT 1),
        'rain', (SELECT recorded_at FROM sensor_data WHERE sensor_type='rain' ORDER BY recorded_at DESC LIMIT 1)
      )) AS "sensorTimestamps",
      (SELECT count(*)::integer FROM devices WHERE status='online') AS "onlineDevices",
      (SELECT count(*)::integer FROM devices) AS "totalDevices",
      (SELECT count(*)::integer FROM devices WHERE status='offline' OR status='error') AS "offlineDevices",
      (SELECT count(*)::integer FROM actuators WHERE state='on') AS "activeActuators",
      (SELECT count(*)::integer FROM actuators) AS "totalActuators",
      (SELECT count(*)::integer FROM alerts WHERE NOT acknowledged) AS "pendingAlerts",
      (SELECT count(*)::integer FROM alerts WHERE NOT acknowledged AND severity='critical') AS "criticalAlerts",
      (SELECT count(*)::integer FROM irrigation_logs WHERE status='running') AS "activeIrrigation",
      (SELECT count(*)::integer FROM automation_rules WHERE enabled) AS "activeRules",
      (SELECT coalesce(json_agg(json_build_object('id', a.id, 'name', a.name, 'actuatorType', a.actuator_type, 'state', a.state)), '[]'::json) FROM actuators a WHERE a.state='on') AS "runningActuators"
  `);
    res.json({ data: result.rows[0] });
}));
// ==================== EXISTING ROUTES (experiments, treatments, etc.) ====================
app.get('/api/experiments', route(async (_req, res) => {
    res.json({ data: await db.select().from(experiments).orderBy(desc(experiments.createdAt)) });
}));
app.get('/api/experiments/:id', route(async (req, res) => {
    const id = parse(z.coerce.number().int().positive(), req.params.id);
    const [experiment] = await db.select().from(experiments).where(eq(experiments.id, id));
    if (!experiment) {
        res.status(404).json(fail('NOT_FOUND', 'Experiment not found.'));
        return;
    }
    const groups = await db.select().from(treatments).where(eq(treatments.experimentId, id)).orderBy(treatments.displayOrder);
    const replicationTotals = await pool.query('SELECT count(*)::integer AS total FROM replications r JOIN treatments t ON t.id=r.treatment_id WHERE t.experiment_id=$1', [id]);
    const units = replicationTotals.rows[0]?.total ?? 0;
    res.json({ data: { ...experiment, treatments: groups, replicationCount: groups.length ? units / groups.length : 0, experimentalUnits: units } });
}));
app.get('/api/treatments', route(async (req, res) => {
    const params = parse(z.object({ experimentId: z.coerce.number().int().positive().optional() }), req.query);
    res.json({ data: await db.select().from(treatments).where(params.experimentId ? eq(treatments.experimentId, params.experimentId) : undefined).orderBy(treatments.displayOrder) });
}));
app.get('/api/replications', route(async (req, res) => {
    const params = parse(z.object({ treatmentId: z.coerce.number().int().positive().optional() }), req.query);
    const result = await pool.query('SELECT r.id, r.replication_number AS "replicationNumber", t.id AS "treatmentId", t.name AS treatment FROM replications r JOIN treatments t ON t.id=r.treatment_id WHERE ($1::integer IS NULL OR t.id=$1) ORDER BY t.display_order, r.replication_number', [params.treatmentId ?? null]);
    res.json({ data: result.rows });
}));
const measurementFilter = (query) => {
    const clauses = [];
    const values = [];
    const add = (clause, value) => { values.push(value); clauses.push(clause.replace('?', `$${values.length}`)); };
    if (query.from)
        add('m.recorded_at >= ?', query.from);
    if (query.to)
        add('m.recorded_at <= ?', query.to);
    if (query.treatmentId)
        add('t.id = ?', query.treatmentId);
    if (query.experimentId)
        add('e.id = ?', query.experimentId);
    if (query.search)
        add('(t.name ILIKE ? OR e.name ILIKE ?)', `%${query.search}%`);
    const searchClause = clauses.at(-1);
    if (query.search && searchClause) {
        values.push(`%${query.search}%`);
        clauses[clauses.length - 1] = searchClause.replace('?', `$${values.length}`);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
};
const joined = `FROM measurements m JOIN replications r ON r.id=m.replication_id
  JOIN treatments t ON t.id=r.treatment_id JOIN experiments e ON e.id=t.experiment_id`;
app.get('/api/measurements', route(async (req, res) => {
    const query = parse(measurementQuery, req.query);
    const { where, values } = measurementFilter(query);
    const columns = { recordedAt: 'm.recorded_at', voltage: 'm.voltage', current: 'm.current', power: 'm.power', panelTemperature: 'm.panel_temperature' };
    const count = await pool.query(`SELECT count(*)::text AS total ${joined} ${where}`, values);
    const data = await pool.query(`SELECT m.id, m.recorded_at AS "recordedAt", e.id AS "experimentId", e.name AS experiment,
      t.id AS "treatmentId", t.name AS treatment, r.replication_number AS replication,
      m.voltage, m.current, m.power, m.panel_temperature AS "panelTemperature",
      m.ambient_temperature AS "ambientTemperature", m.humidity, m.irradiance, m.source
      ${joined} ${where} ORDER BY ${columns[query.sort]} ${query.order.toUpperCase()}, m.id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, (query.page - 1) * query.limit]);
    res.json({ data: data.rows, meta: { page: query.page, limit: query.limit, total: Number(count.rows[0]?.total ?? 0) } });
}));
app.get('/api/measurements/summary', route(async (req, res) => {
    const query = parse(measurementQuery, req.query);
    const { where, values } = measurementFilter(query);
    const result = await pool.query(`SELECT t.id AS "treatmentId", t.name AS treatment, count(*)::integer AS count,
      avg(m.voltage) AS "avgVoltage", avg(m.current) AS "avgCurrent", avg(m.power) AS "avgPower",
      avg(m.panel_temperature) AS "avgPanelTemperature", max(m.recorded_at) AS "latestAt"
      ${joined} ${where} GROUP BY t.id, t.name ORDER BY t.id`, values);
    res.json({ data: result.rows, meta: { source: 'PostgreSQL raw measurements' } });
}));
app.get('/api/measurements/trends', route(async (req, res) => {
    const query = parse(measurementQuery, req.query);
    const { where, values } = measurementFilter(query);
    const result = await pool.query(`SELECT date_trunc('day', m.recorded_at) AS day, t.id AS "treatmentId", t.name AS treatment,
      count(*)::integer AS count, avg(m.power) AS power, avg(m.panel_temperature) AS "panelTemperature"
      ${joined} ${where} GROUP BY day, t.id, t.name ORDER BY day ASC, t.id ASC LIMIT 2000`, values);
    res.json({ data: result.rows });
}));
app.get('/api/analytics/coating', route(async (req, res) => {
    const params = parse(z.object({ experimentId: z.coerce.number().int().positive().optional() }), req.query);
    const result = await pool.query(`SELECT t.id AS "treatmentId", t.code, t.name, t.description, e.name AS experiment,
      e.dataset_kind AS "datasetKind", e.source_label AS "sourceLabel", rr.sample_count AS "sampleCount",
      rr.mean_voltage AS "avgVoltage", rr.mean_current AS "avgCurrent", rr.mean_power AS "avgPower",
      rr.mean_panel_temperature AS "avgPanelTemperature", rr.source_note AS "sourceNote"
      FROM reported_results rr JOIN treatments t ON t.id=rr.treatment_id JOIN experiments e ON e.id=t.experiment_id
      WHERE ($1::integer IS NULL OR e.id=$1) ORDER BY t.display_order`, [params.experimentId ?? null]);
    const control = result.rows.find(row => row.code === 'control');
    const baseline = control ? Number(control.avgPower) : 0;
    res.json({ data: result.rows.map(row => ({ ...row, powerChangePercent: percentChange(Number(row.avgPower), baseline) })) });
}));
app.get('/api/greenhouse/latest', route(async (_req, res) => {
    const [reading] = await db.select().from(greenhouseReadings).orderBy(desc(greenhouseReadings.recordedAt)).limit(1);
    res.json({ data: reading ?? null });
}));
app.get('/api/greenhouse/history', route(async (req, res) => {
    const query = parse(dateRange.safeExtend({ page: paging.shape.page, limit: paging.shape.limit }), req.query);
    const conditions = [];
    if (query.from)
        conditions.push(gte(greenhouseReadings.recordedAt, new Date(query.from)));
    if (query.to)
        conditions.push(lte(greenhouseReadings.recordedAt, new Date(query.to)));
    const rows = await db.select().from(greenhouseReadings).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(greenhouseReadings.recordedAt)).limit(query.limit).offset((query.page - 1) * query.limit);
    const total = await pool.query('SELECT count(*)::text AS count FROM greenhouse_readings');
    res.json({ data: rows, meta: { page: query.page, limit: query.limit, total: Number(total.rows[0]?.count ?? 0) } });
}));
// ==================== DEVICES ====================
app.get('/api/devices', route(async (_req, res) => {
    const rows = await db.select().from(devices).orderBy(asc(devices.name));
    res.json({ data: rows });
}));
app.get('/api/devices/:deviceId', route(async (req, res) => {
    const deviceId = parse(z.string().min(1), req.params.deviceId);
    const [device] = await db.select().from(devices).where(eq(devices.deviceId, deviceId));
    if (!device) {
        res.status(404).json(fail('NOT_FOUND', 'Device not found.'));
        return;
    }
    res.json({ data: device });
}));
app.post('/api/devices', requireIngest, route(async (req, res) => {
    const body = parse(z.object({
        deviceId: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(200),
        type: z.enum(['sensor', 'actuator', 'controller']),
        location: z.string().trim().max(200).default('greenhouse-main'),
        firmwareVersion: z.string().max(50).optional(),
    }), req.body);
    const [device] = await db.insert(devices).values({
        deviceId: body.deviceId, name: body.name, type: body.type,
        location: body.location, firmwareVersion: body.firmwareVersion ?? null,
        status: 'online', lastHeartbeat: new Date(),
    }).returning();
    await logActivity('device', `Device '${body.name}' registered`, { deviceId: body.deviceId });
    res.status(201).json({ data: device });
}));
app.patch('/api/devices/:deviceId/status', requireIngest, route(async (req, res) => {
    const body = parse(z.object({ status: z.enum(['online', 'offline', 'error', 'maintenance']) }), req.body);
    const result = await pool.query(`UPDATE devices SET status=$1, last_heartbeat=now(), updated_at=now() WHERE device_id=$2 RETURNING *`, [body.status, req.params.deviceId]);
    if (!result.rowCount) {
        res.status(404).json(fail('NOT_FOUND', 'Device not found.'));
        return;
    }
    res.json({ data: result.rows[0] });
}));
app.post('/api/devices/:deviceId/heartbeat', requireIngest, route(async (req, res) => {
    const result = await pool.query(`UPDATE devices SET status='online', last_heartbeat=now(), updated_at=now() WHERE device_id=$1 RETURNING device_id`, [req.params.deviceId]);
    if (!result.rowCount) {
        res.status(404).json(fail('NOT_FOUND', 'Device not found.'));
        return;
    }
    res.json({ data: { ok: true } });
}));
// ==================== SENSOR DATA ====================
app.get('/api/sensors/latest', route(async (_req, res) => {
    const result = await pool.query(`
    SELECT DISTINCT ON (sensor_type) id, device_id AS "deviceId", sensor_type AS "sensorType", 
      value, unit, recorded_at AS "recordedAt"
    FROM sensor_data ORDER BY sensor_type, recorded_at DESC
  `);
    res.json({ data: result.rows });
}));
app.get('/api/sensors/history', route(async (req, res) => {
    const query = parse(z.object({
        sensorType: z.string().optional(),
        deviceId: z.string().optional(),
        hours: z.coerce.number().int().min(1).max(168).default(24),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
    }), req.query);
    const conditions = [`recorded_at >= now() - interval '${query.hours} hours'`];
    const values = [];
    if (query.sensorType) {
        values.push(query.sensorType);
        conditions.push(`sensor_type = $${values.length}`);
    }
    if (query.deviceId) {
        values.push(query.deviceId);
        conditions.push(`device_id = $${values.length}`);
    }
    const result = await pool.query(`SELECT id, device_id AS "deviceId", sensor_type AS "sensorType", value, unit, recorded_at AS "recordedAt"
     FROM sensor_data WHERE ${conditions.join(' AND ')} ORDER BY recorded_at DESC LIMIT $${values.length + 1}`, [...values, query.limit]);
    res.json({ data: result.rows });
}));
app.get('/api/sensors/trends', route(async (req, res) => {
    const query = parse(z.object({
        sensorType: z.string(),
        hours: z.coerce.number().int().min(1).max(168).default(24),
    }), req.query);
    const result = await pool.query(`SELECT date_trunc('hour', recorded_at) AS hour, 
      avg(value) AS avg, min(value) AS min, max(value) AS max, count(*)::integer AS count
     FROM sensor_data WHERE sensor_type=$1 AND recorded_at >= now() - interval '${query.hours} hours'
     GROUP BY hour ORDER BY hour ASC LIMIT 500`, [query.sensorType]);
    res.json({ data: result.rows });
}));
app.post('/api/sensors/data', requireIngest, route(async (req, res) => {
    const body = parse(z.object({
        deviceId: z.string().trim().min(1).max(80),
        sensorType: z.enum(['temperature', 'humidity', 'soil_moisture', 'light', 'ph', 'ec', 'co2', 'water_level', 'water_flow', 'wind_speed', 'rain']),
        value: finite,
        unit: z.string().trim().min(1).max(20),
        recordedAt: isoDate.optional(),
    }), req.body);
    const [row] = await db.insert(sensorData).values({
        deviceId: body.deviceId, sensorType: body.sensorType,
        value: body.value, unit: body.unit,
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
    }).returning();
    // Also update device heartbeat
    await pool.query(`UPDATE devices SET status='online', last_heartbeat=now(), updated_at=now() WHERE device_id=$1`, [body.deviceId]);
    res.status(201).json({ data: row });
}));
app.post('/api/sensors/batch', requireIngest, route(async (req, res) => {
    const body = parse(z.object({
        deviceId: z.string().trim().min(1).max(80),
        readings: z.array(z.object({
            sensorType: z.enum(['temperature', 'humidity', 'soil_moisture', 'light', 'ph', 'ec', 'co2', 'water_level', 'water_flow', 'wind_speed', 'rain']),
            value: finite,
            unit: z.string().trim().min(1).max(20),
        })).min(1).max(20),
        recordedAt: isoDate.optional(),
    }), req.body);
    const now = body.recordedAt ? new Date(body.recordedAt) : new Date();
    const rows = await db.insert(sensorData).values(body.readings.map(r => ({ deviceId: body.deviceId, sensorType: r.sensorType, value: r.value, unit: r.unit, recordedAt: now }))).returning();
    await pool.query(`UPDATE devices SET status='online', last_heartbeat=now(), updated_at=now() WHERE device_id=$1`, [body.deviceId]);
    res.status(201).json({ data: rows, meta: { count: rows.length } });
}));
// ==================== ACTUATORS ====================
app.get('/api/actuators', route(async (_req, res) => {
    const rows = await db.select().from(actuators).orderBy(asc(actuators.name));
    res.json({ data: rows });
}));
app.post('/api/actuators', requireIngest, route(async (req, res) => {
    const body = parse(z.object({
        deviceId: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(200),
        actuatorType: z.enum(['irrigation_pump', 'misting', 'exhaust_fan', 'intake_fan', 'grow_light', 'shade_screen', 'nutrient_pump', 'heater', 'cooler', 'valve']),
        gpioPin: z.number().int().optional(),
    }), req.body);
    const [row] = await db.insert(actuators).values({
        deviceId: body.deviceId, name: body.name, actuatorType: body.actuatorType,
        gpioPin: body.gpioPin ?? null,
    }).returning();
    await logActivity('actuator', `Actuator '${body.name}' registered`, { actuatorType: body.actuatorType, deviceId: body.deviceId });
    res.status(201).json({ data: row });
}));
app.patch('/api/actuators/:id/state', route(async (req, res) => {
    const id = parse(z.coerce.number().int().positive(), req.params.id);
    const body = parse(z.object({ state: z.enum(['on', 'off', 'auto']) }), req.body);
    const result = await pool.query(`UPDATE actuators SET state=$1, last_toggled_at=now() WHERE id=$2 RETURNING *`, [body.state, id]);
    if (!result.rowCount) {
        res.status(404).json(fail('NOT_FOUND', 'Actuator not found.'));
        return;
    }
    await logActivity('actuator', `Actuator #${id} set to ${body.state}`, { actuatorId: id, newState: body.state });
    res.json({ data: result.rows[0] });
}));
app.patch('/api/actuators/:id/auto', route(async (req, res) => {
    const id = parse(z.coerce.number().int().positive(), req.params.id);
    const body = parse(z.object({ autoEnabled: z.boolean() }), req.body);
    const result = await pool.query(`UPDATE actuators SET auto_enabled=$1, state=$2 WHERE id=$3 RETURNING *`, [body.autoEnabled, body.autoEnabled ? 'auto' : 'off', id]);
    if (!result.rowCount) {
        res.status(404).json(fail('NOT_FOUND', 'Actuator not found.'));
        return;
    }
    await logActivity('actuator', `Actuator #${id} auto mode ${body.autoEnabled ? 'enabled' : 'disabled'}`, { actuatorId: id });
    res.json({ data: result.rows[0] });
}));
// ==================== AUTOMATION RULES ====================
app.get('/api/automation/rules', route(async (_req, res) => {
    const result = await pool.query(`
    SELECT r.*, a.name AS "actuatorName", a.actuator_type AS "actuatorType"
    FROM automation_rules r JOIN actuators a ON a.id = r.actuator_id
    ORDER BY r.priority ASC, r.name ASC
  `);
    res.json({ data: result.rows });
}));
app.post('/api/automation/rules', route(async (req, res) => {
    const body = parse(z.object({
        name: z.string().trim().min(1).max(200),
        description: z.string().max(500).optional(),
        sensorType: z.string().min(1),
        condition: z.enum(['above', 'below', 'between', 'equals']),
        thresholdMin: finite,
        thresholdMax: finite.optional(),
        actuatorId: z.number().int().positive(),
        action: z.enum(['turn_on', 'turn_off', 'toggle']),
        durationSeconds: z.number().int().positive().optional(),
        cooldownSeconds: z.number().int().min(0).default(300),
        priority: z.number().int().min(1).max(10).default(5),
    }), req.body);
    const [rule] = await db.insert(automationRules).values({
        name: body.name, description: body.description ?? null,
        sensorType: body.sensorType, condition: body.condition,
        thresholdMin: body.thresholdMin, thresholdMax: body.thresholdMax ?? null,
        actuatorId: body.actuatorId, action: body.action,
        durationSeconds: body.durationSeconds ?? null,
        cooldownSeconds: body.cooldownSeconds, priority: body.priority,
    }).returning();
    if (!rule)
        throw new Error('Gagal menyimpan rule automasi');
    await logActivity('automation', `Rule '${body.name}' created`, { ruleId: rule.id });
    res.status(201).json({ data: rule });
}));
app.patch('/api/automation/rules/:id', route(async (req, res) => {
    const id = parse(z.coerce.number().int().positive(), req.params.id);
    const body = parse(z.object({ enabled: z.boolean() }), req.body);
    const result = await pool.query(`UPDATE automation_rules SET enabled=$1, updated_at=now() WHERE id=$2 RETURNING *`, [body.enabled, id]);
    if (!result.rowCount) {
        res.status(404).json(fail('NOT_FOUND', 'Rule not found.'));
        return;
    }
    await logActivity('automation', `Rule #${id} ${body.enabled ? 'enabled' : 'disabled'}`, { ruleId: id });
    res.json({ data: result.rows[0] });
}));
app.delete('/api/automation/rules/:id', route(async (req, res) => {
    const id = parse(z.coerce.number().int().positive(), req.params.id);
    const result = await pool.query(`DELETE FROM automation_rules WHERE id=$1 RETURNING id`, [id]);
    if (!result.rowCount) {
        res.status(404).json(fail('NOT_FOUND', 'Rule not found.'));
        return;
    }
    await logActivity('automation', `Rule #${id} deleted`, { ruleId: id });
    res.json({ data: { deleted: true } });
}));
// ==================== IRRIGATION ====================
app.get('/api/irrigation/schedules', route(async (_req, res) => {
    const result = await pool.query(`
    SELECT s.*, a.name AS "actuatorName", a.actuator_type AS "actuatorType"
    FROM irrigation_schedules s JOIN actuators a ON a.id = s.actuator_id
    ORDER BY s.name ASC
  `);
    res.json({ data: result.rows });
}));
app.post('/api/irrigation/schedules', route(async (req, res) => {
    const body = parse(z.object({
        name: z.string().trim().min(1).max(200),
        actuatorId: z.number().int().positive(),
        scheduleType: z.enum(['interval', 'cron', 'manual']),
        intervalMinutes: z.number().int().positive().optional(),
        cronExpression: z.string().max(100).optional(),
        durationSeconds: z.number().int().positive().default(300),
        volumeLiters: finite.positive().optional(),
    }), req.body);
    const [schedule] = await db.insert(irrigationSchedules).values({
        name: body.name, actuatorId: body.actuatorId,
        scheduleType: body.scheduleType,
        intervalMinutes: body.intervalMinutes ?? null,
        cronExpression: body.cronExpression ?? null,
        durationSeconds: body.durationSeconds,
        volumeLiters: body.volumeLiters ?? null,
    }).returning();
    if (!schedule)
        throw new Error('Gagal menyimpan jadwal irigasi');
    await logActivity('irrigation', `Schedule '${body.name}' created`, { scheduleId: schedule.id });
    res.status(201).json({ data: schedule });
}));
app.patch('/api/irrigation/schedules/:id', route(async (req, res) => {
    const id = parse(z.coerce.number().int().positive(), req.params.id);
    const body = parse(z.object({ enabled: z.boolean() }), req.body);
    const result = await pool.query(`UPDATE irrigation_schedules SET enabled=$1, updated_at=now() WHERE id=$2 RETURNING *`, [body.enabled, id]);
    if (!result.rowCount) {
        res.status(404).json(fail('NOT_FOUND', 'Schedule not found.'));
        return;
    }
    res.json({ data: result.rows[0] });
}));
app.post('/api/irrigation/manual', route(async (req, res) => {
    const body = parse(z.object({
        actuatorId: z.number().int().positive(),
        durationSeconds: z.number().int().positive().default(300),
        notes: z.string().max(500).optional(),
    }), req.body);
    // Turn on actuator
    await pool.query(`UPDATE actuators SET state='on', last_toggled_at=now() WHERE id=$1`, [body.actuatorId]);
    // Create log
    const [log] = await db.insert(irrigationLogs).values({
        actuatorId: body.actuatorId, triggerType: 'manual',
        durationSeconds: body.durationSeconds, notes: body.notes ?? null,
    }).returning();
    await logActivity('irrigation', `Manual irrigation started on actuator #${body.actuatorId}`, { actuatorId: body.actuatorId, duration: body.durationSeconds });
    res.status(201).json({ data: log });
}));
app.get('/api/irrigation/logs', route(async (req, res) => {
    const query = parse(paging, req.query);
    const result = await pool.query(`SELECT l.*, a.name AS "actuatorName"
     FROM irrigation_logs l JOIN actuators a ON a.id = l.actuator_id
     ORDER BY l.started_at DESC LIMIT $1 OFFSET $2`, [query.limit, (query.page - 1) * query.limit]);
    const total = await pool.query('SELECT count(*)::text AS count FROM irrigation_logs');
    res.json({ data: result.rows, meta: { page: query.page, limit: query.limit, total: Number(total.rows[0]?.count ?? 0) } });
}));
// ==================== ALERTS ====================
app.get('/api/alerts', route(async (req, res) => {
    const query = parse(z.object({
        page: paging.shape.page, limit: paging.shape.limit,
        severity: z.enum(['info', 'warning', 'critical']).optional(),
        acknowledged: z.coerce.boolean().optional(),
    }), req.query);
    const conditions = [];
    const values = [];
    if (query.severity) {
        values.push(query.severity);
        conditions.push(`severity = $${values.length}`);
    }
    if (query.acknowledged !== undefined) {
        values.push(query.acknowledged);
        conditions.push(`acknowledged = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, (query.page - 1) * query.limit]);
    const total = await pool.query(`SELECT count(*)::text AS count FROM alerts ${where}`, values);
    res.json({ data: result.rows, meta: { page: query.page, limit: query.limit, total: Number(total.rows[0]?.count ?? 0) } });
}));
app.patch('/api/alerts/:id/acknowledge', route(async (req, res) => {
    const id = parse(z.coerce.number().int().positive(), req.params.id);
    const result = await pool.query(`UPDATE alerts SET acknowledged=true, acknowledged_at=now() WHERE id=$1 RETURNING *`, [id]);
    if (!result.rowCount) {
        res.status(404).json(fail('NOT_FOUND', 'Alert not found.'));
        return;
    }
    res.json({ data: result.rows[0] });
}));
app.post('/api/alerts', requireIngest, route(async (req, res) => {
    const body = parse(z.object({
        severity: z.enum(['info', 'warning', 'critical']),
        category: z.enum(['sensor', 'actuator', 'system', 'irrigation', 'environment']),
        title: z.string().trim().min(1).max(200),
        message: z.string().trim().min(1).max(1000),
        deviceId: z.string().max(80).optional(),
    }), req.body);
    const [alert] = await db.insert(alerts).values({
        severity: body.severity, category: body.category,
        title: body.title, message: body.message,
        deviceId: body.deviceId ?? null,
    }).returning();
    res.status(201).json({ data: alert });
}));
// ==================== ACTIVITY LOGS ====================
app.get('/api/activity', route(async (req, res) => {
    const query = parse(z.object({
        page: paging.shape.page, limit: paging.shape.limit,
        category: z.string().optional(),
    }), req.query);
    const conditions = [];
    const values = [];
    if (query.category) {
        values.push(query.category);
        conditions.push(`category = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, (query.page - 1) * query.limit]);
    res.json({ data: result.rows });
}));
// ==================== INGEST ROUTES (keep existing) ====================
app.post('/api/measurements', requireIngest, route(async (req, res) => {
    const body = parse(measureBody, req.body);
    const power = powerFromVI(body.voltage, body.current);
    const result = await pool.query(`INSERT INTO measurements(replication_id,recorded_at,voltage,current,power,panel_temperature,ambient_temperature,humidity,irradiance,source)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,recorded_at AS "recordedAt",voltage,current,power,source`, [body.replicationId, body.recordedAt, body.voltage, body.current, power, body.panelTemperature ?? null,
        body.ambientTemperature ?? null, body.humidity ?? null, body.irradiance ?? null, body.source]);
    res.status(201).json({ data: result.rows[0] });
}));
app.post('/api/greenhouse/readings', requireIngest, route(async (req, res) => {
    const body = parse(greenhouseBody, req.body);
    const result = await db.insert(greenhouseReadings).values({
        recordedAt: new Date(body.recordedAt), deviceId: body.deviceId, source: body.source,
        temperature: body.temperature ?? null, humidity: body.humidity ?? null,
        lightIntensity: body.lightIntensity ?? null, soilMoisture: body.soilMoisture ?? null,
        waterLevel: body.waterLevel ?? null, irrigationStatus: body.irrigationStatus ?? null,
    }).returning();
    res.status(201).json({ data: result[0] });
}));
// ==================== HELPERS ====================
async function logActivity(category, action, details = {}) {
    try {
        await db.insert(activityLogs).values({ action, category, details });
    }
    catch { /* non-critical */ }
}
// ==================== FALLBACK & ERROR HANDLING ====================
app.use('/api', (_req, res) => res.status(404).json(fail('NOT_FOUND', 'API endpoint not found.')));
if (config.NODE_ENV === 'production') {
    app.use(express.static(resolve('dist')));
    app.use((req, res, next) => {
        if (req.method === 'GET' && req.accepts('html'))
            res.sendFile(resolve('dist', 'index.html'));
        else
            next();
    });
}
const errorHandler = (error, _req, res, next) => {
    void next;
    const detail = error;
    if (detail.type === 'entity.parse.failed') {
        res.status(400).json(fail('MALFORMED_JSON', 'Request body must contain valid JSON.'));
        return;
    }
    if (detail.status === 413) {
        res.status(413).json(fail('PAYLOAD_TOO_LARGE', 'Request body is too large.'));
        return;
    }
    if (detail.status === 400) {
        res.status(400).json(fail(detail.code ?? 'INVALID_INPUT', detail.message ?? 'Invalid input.'));
        return;
    }
    if (detail.code === '23505') {
        res.status(409).json(fail('DUPLICATE_RECORD', 'A record already exists for this entry.'));
        return;
    }
    if (detail.code === '23503') {
        res.status(400).json(fail('INVALID_REFERENCE', 'The referenced record does not exist.'));
        return;
    }
    if (detail.code === '23514') {
        res.status(400).json(fail('INVALID_VALUE', 'A value is outside the permitted range.'));
        return;
    }
    if (detail.code?.startsWith('08') || detail.code === 'ECONNREFUSED') {
        res.status(503).json(fail('DATABASE_UNAVAILABLE', 'PostgreSQL is unavailable.'));
        return;
    }
    console.error('API error:', detail.message ?? 'unknown');
    res.status(500).json(fail('INTERNAL_ERROR', 'The request could not be completed. Please retry.'));
};
app.use(errorHandler);
export default app;
