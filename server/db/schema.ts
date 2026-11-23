import { boolean, check, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// === EXISTING TABLES (keep as-is) ===
export const experiments = pgTable('experiments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  durationDays: integer('duration_days').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  status: text('status').notNull(),
  datasetKind: text('dataset_kind').notNull(),
  sourceLabel: text('source_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const treatments = pgTable('treatments', {
  id: serial('id').primaryKey(),
  experimentId: integer('experiment_id').notNull().references(() => experiments.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('treatments_experiment_code_uq').on(table.experimentId, table.code), index('treatments_experiment_idx').on(table.experimentId)]);
export const replications = pgTable('replications', {
  id: serial('id').primaryKey(),
  treatmentId: integer('treatment_id').notNull().references(() => treatments.id),
  replicationNumber: integer('replication_number').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('replications_treatment_number_uq').on(table.treatmentId, table.replicationNumber)]);
export const reportedResults = pgTable('reported_results', {
  id: serial('id').primaryKey(),
  treatmentId: integer('treatment_id').notNull().references(() => treatments.id),
  meanVoltage: doublePrecision('mean_voltage').notNull(),
  meanCurrent: doublePrecision('mean_current').notNull(),
  meanPower: doublePrecision('mean_power').notNull(),
  meanPanelTemperature: doublePrecision('mean_panel_temperature').notNull(),
  sampleCount: integer('sample_count').notNull(),
  sourceNote: text('source_note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('reported_results_treatment_uq').on(table.treatmentId)]);
export const measurements = pgTable('measurements', {
  id: serial('id').primaryKey(),
  replicationId: integer('replication_id').notNull().references(() => replications.id),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  voltage: doublePrecision('voltage').notNull(),
  current: doublePrecision('current').notNull(),
  power: doublePrecision('power').notNull(),
  panelTemperature: doublePrecision('panel_temperature'),
  ambientTemperature: doublePrecision('ambient_temperature'),
  humidity: doublePrecision('humidity'),
  irradiance: doublePrecision('irradiance'),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('measurements_replication_time_uq').on(table.replicationId, table.recordedAt),
  index('measurements_recorded_at_idx').on(table.recordedAt),
  check('measurements_nonnegative', sql`${table.voltage} >= 0 AND ${table.current} >= 0 AND ${table.power} >= 0`),
]);
export const greenhouseReadings = pgTable('greenhouse_readings', {
  id: serial('id').primaryKey(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  temperature: doublePrecision('temperature'),
  humidity: doublePrecision('humidity'),
  lightIntensity: doublePrecision('light_intensity'),
  soilMoisture: doublePrecision('soil_moisture'),
  waterLevel: doublePrecision('water_level'),
  irrigationStatus: text('irrigation_status'),
  deviceId: text('device_id').notNull(),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('greenhouse_device_time_uq').on(table.deviceId, table.recordedAt),
  index('greenhouse_recorded_at_idx').on(table.recordedAt),
]);

// === NEW GREENHOUSE CONTROLLER TABLES ===

export const devices = pgTable('devices', {
  id: serial('id').primaryKey(),
  deviceId: text('device_id').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  location: text('location').notNull().default('greenhouse-main'),
  status: text('status').notNull().default('offline'),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }),
  firmwareVersion: text('firmware_version'),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('devices_status_idx').on(table.status)]);

export const sensorData = pgTable('sensor_data', {
  id: serial('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  sensorType: text('sensor_type').notNull(),
  value: doublePrecision('value').notNull(),
  unit: text('unit').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index('sensor_data_device_idx').on(table.deviceId, table.recordedAt),
  index('sensor_data_type_idx').on(table.sensorType, table.recordedAt),
]);

export const actuators = pgTable('actuators', {
  id: serial('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  name: text('name').notNull(),
  actuatorType: text('actuator_type').notNull(),
  gpioPin: integer('gpio_pin'),
  state: text('state').notNull().default('off'),
  lastToggledAt: timestamp('last_toggled_at', { withTimezone: true }),
  autoEnabled: boolean('auto_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('actuators_device_name_uq').on(table.deviceId, table.name)]);

export const automationRules = pgTable('automation_rules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  sensorType: text('sensor_type').notNull(),
  condition: text('condition').notNull(),
  thresholdMin: doublePrecision('threshold_min').notNull(),
  thresholdMax: doublePrecision('threshold_max'),
  actuatorId: integer('actuator_id').notNull().references(() => actuators.id),
  action: text('action').notNull(),
  durationSeconds: integer('duration_seconds'),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(300),
  enabled: boolean('enabled').notNull().default(true),
  priority: integer('priority').notNull().default(5),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const irrigationSchedules = pgTable('irrigation_schedules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  actuatorId: integer('actuator_id').notNull().references(() => actuators.id),
  scheduleType: text('schedule_type').notNull(),
  intervalMinutes: integer('interval_minutes'),
  cronExpression: text('cron_expression'),
  durationSeconds: integer('duration_seconds').notNull().default(300),
  volumeLiters: doublePrecision('volume_liters'),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const irrigationLogs = pgTable('irrigation_logs', {
  id: serial('id').primaryKey(),
  scheduleId: integer('schedule_id').references(() => irrigationSchedules.id),
  actuatorId: integer('actuator_id').notNull().references(() => actuators.id),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  volumeLiters: doublePrecision('volume_liters'),
  triggerType: text('trigger_type').notNull(),
  status: text('status').notNull().default('running'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('irrigation_logs_time_idx').on(table.startedAt)]);

export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  deviceId: text('device_id'),
  acknowledged: boolean('acknowledged').notNull().default(false),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index('alerts_severity_idx').on(table.severity, table.createdAt),
  index('alerts_unack_idx').on(table.acknowledged, table.createdAt),
]);

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  action: text('action').notNull(),
  category: text('category').notNull(),
  details: jsonb('details').notNull().default({}),
  userLabel: text('user_label').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index('activity_logs_time_idx').on(table.createdAt),
  index('activity_logs_category_idx').on(table.category, table.createdAt),
]);
