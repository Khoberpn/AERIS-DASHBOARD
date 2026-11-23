-- Migration: 002_greenhouse_controller.sql
-- Description: Adds tables to support the full AERIS Greenhouse Controller Dashboard system

-- 1. devices - IoT devices in the greenhouse
CREATE TABLE IF NOT EXISTS devices (
  id serial PRIMARY KEY,
  device_id text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK(type IN ('sensor','actuator','controller')),
  location text NOT NULL DEFAULT 'greenhouse-main',
  status text NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline','error','maintenance')),
  last_heartbeat timestamptz,
  firmware_version text,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(status);

-- 2. sensor_data - All sensor readings (unified table)
CREATE TABLE IF NOT EXISTS sensor_data (
  id serial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(device_id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  sensor_type text NOT NULL CHECK(sensor_type IN ('temperature','humidity','soil_moisture','light','ph','ec','co2','water_level','water_flow','wind_speed','rain')),
  value double precision NOT NULL,
  unit text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sensor_data_device_idx ON sensor_data(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS sensor_data_type_idx ON sensor_data(sensor_type, recorded_at DESC);

-- 3. actuators - Controllable actuators (pumps, fans, valves, lights)
CREATE TABLE IF NOT EXISTS actuators (
  id serial PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(device_id),
  name text NOT NULL,
  actuator_type text NOT NULL CHECK(actuator_type IN ('irrigation_pump','misting','exhaust_fan','intake_fan','grow_light','shade_screen','nutrient_pump','heater','cooler','valve')),
  gpio_pin integer,
  state text NOT NULL DEFAULT 'off' CHECK(state IN ('on','off','auto','error')),
  last_toggled_at timestamptz,
  auto_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, name)
);

-- 4. automation_rules - Rules for automatic control
CREATE TABLE IF NOT EXISTS automation_rules (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  sensor_type text NOT NULL,
  condition text NOT NULL CHECK(condition IN ('above','below','between','equals')),
  threshold_min double precision NOT NULL,
  threshold_max double precision,
  actuator_id integer NOT NULL REFERENCES actuators(id),
  action text NOT NULL CHECK(action IN ('turn_on','turn_off','toggle')),
  duration_seconds integer,
  cooldown_seconds integer NOT NULL DEFAULT 300,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 5,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. irrigation_schedules - Scheduled irrigation
CREATE TABLE IF NOT EXISTS irrigation_schedules (
  id serial PRIMARY KEY,
  name text NOT NULL,
  actuator_id integer NOT NULL REFERENCES actuators(id),
  schedule_type text NOT NULL CHECK(schedule_type IN ('interval','cron','manual')),
  interval_minutes integer,
  cron_expression text,
  duration_seconds integer NOT NULL DEFAULT 300,
  volume_liters double precision,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. irrigation_logs - Log of irrigation events
CREATE TABLE IF NOT EXISTS irrigation_logs (
  id serial PRIMARY KEY,
  schedule_id integer REFERENCES irrigation_schedules(id),
  actuator_id integer NOT NULL REFERENCES actuators(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  volume_liters double precision,
  trigger_type text NOT NULL CHECK(trigger_type IN ('scheduled','automation','manual')),
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS irrigation_logs_time_idx ON irrigation_logs(started_at DESC);

-- 7. alerts - System alerts and notifications
CREATE TABLE IF NOT EXISTS alerts (
  id serial PRIMARY KEY,
  severity text NOT NULL CHECK(severity IN ('info','warning','critical')),
  category text NOT NULL CHECK(category IN ('sensor','actuator','system','irrigation','environment')),
  title text NOT NULL,
  message text NOT NULL,
  device_id text REFERENCES devices(device_id),
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alerts_severity_idx ON alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_unack_idx ON alerts(acknowledged, created_at DESC) WHERE NOT acknowledged;

-- 8. activity_logs - Audit trail
CREATE TABLE IF NOT EXISTS activity_logs (
  id serial PRIMARY KEY,
  action text NOT NULL,
  category text NOT NULL CHECK(category IN ('actuator','automation','irrigation','device','system','alert')),
  details jsonb NOT NULL DEFAULT '{}',
  user_label text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_logs_time_idx ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_category_idx ON activity_logs(category, created_at DESC);
