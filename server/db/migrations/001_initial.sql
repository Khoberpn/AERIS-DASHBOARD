CREATE TABLE IF NOT EXISTS experiments (
  id serial PRIMARY KEY, name text NOT NULL, description text NOT NULL,
  duration_days integer NOT NULL, start_date timestamptz, end_date timestamptz,
  status text NOT NULL, dataset_kind text NOT NULL, source_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS treatments (
  id serial PRIMARY KEY, experiment_id integer NOT NULL REFERENCES experiments(id),
  code text NOT NULL, name text NOT NULL, description text NOT NULL, display_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(experiment_id, code)
);
CREATE INDEX IF NOT EXISTS treatments_experiment_idx ON treatments(experiment_id);
CREATE TABLE IF NOT EXISTS replications (
  id serial PRIMARY KEY, treatment_id integer NOT NULL REFERENCES treatments(id),
  replication_number integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(treatment_id, replication_number)
);
CREATE TABLE IF NOT EXISTS reported_results (
  id serial PRIMARY KEY, treatment_id integer NOT NULL UNIQUE REFERENCES treatments(id),
  mean_voltage double precision NOT NULL, mean_current double precision NOT NULL,
  mean_power double precision NOT NULL, mean_panel_temperature double precision NOT NULL,
  sample_count integer NOT NULL, source_note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS measurements (
  id serial PRIMARY KEY, replication_id integer NOT NULL REFERENCES replications(id),
  recorded_at timestamptz NOT NULL, voltage double precision NOT NULL CHECK(voltage >= 0),
  current double precision NOT NULL CHECK(current >= 0), power double precision NOT NULL CHECK(power >= 0),
  panel_temperature double precision, ambient_temperature double precision,
  humidity double precision CHECK(humidity BETWEEN 0 AND 100),
  irradiance double precision CHECK(irradiance >= 0), source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(replication_id, recorded_at)
);
CREATE INDEX IF NOT EXISTS measurements_recorded_at_idx ON measurements(recorded_at DESC);
CREATE TABLE IF NOT EXISTS greenhouse_readings (
  id serial PRIMARY KEY, recorded_at timestamptz NOT NULL,
  temperature double precision, humidity double precision CHECK(humidity BETWEEN 0 AND 100),
  light_intensity double precision CHECK(light_intensity >= 0),
  soil_moisture double precision CHECK(soil_moisture BETWEEN 0 AND 100),
  water_level double precision CHECK(water_level >= 0), irrigation_status text,
  device_id text NOT NULL, source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, recorded_at)
);
CREATE INDEX IF NOT EXISTS greenhouse_recorded_at_idx ON greenhouse_readings(recorded_at DESC);
