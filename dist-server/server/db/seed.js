import { pool } from './client.js';
const treatmentRows = [
    ['control', 'Control', 'Tanpa coating', 16.78, 0.335, 5.63, 55.0],
    ['aloe', 'Aloe vera', 'Coating berbasis gel Aloe vera', 16.88, 0.343, 5.79, 54.2],
    ['nano', 'Nano-SiO\u2082', 'Coating silika berbasis sekam padi; ukuran partikel belum dikarakterisasi dalam laporan', 16.98, 0.359, 6.11, 53.1],
    ['bio-nano', 'Bio-nano', 'Kombinasi Aloe vera + nano-SiO\u2082', 17.12, 0.382, 6.53, 52.0],
];
const client = await pool.connect();
try {
    await client.query('BEGIN');
    // === SEED EXPERIMENTS (keep existing logic) ===
    const existing = await client.query("SELECT id FROM experiments WHERE dataset_kind='demonstration' FOR UPDATE");
    let experimentId;
    if (existing.rowCount) {
        experimentId = existing.rows[0].id;
        console.log('Experiment data already seeded.');
    }
    else {
        const experiment = await client.query(`INSERT INTO experiments(name,description,duration_days,status,dataset_kind,source_label)
       VALUES($1,$2,28,'reported','demonstration',$3) RETURNING id`, ['AERIS \u2014 Perbandingan perlakuan permukaan PV', 'Rancangan Acak Lengkap; empat perlakuan, tiga ulangan, 12 unit percobaan.', 'AERIS Research Dataset / Demonstration Dataset']);
        experimentId = experiment.rows[0].id;
        for (const [order, [code, name, description, voltage, current, power, temperature]] of treatmentRows.entries()) {
            const treatment = await client.query('INSERT INTO treatments(experiment_id,code,name,description,display_order) VALUES($1,$2,$3,$4,$5) RETURNING id', [experimentId, code, name, description, order]);
            const treatmentId = treatment.rows[0].id;
            for (let replication = 1; replication <= 3; replication++) {
                await client.query('INSERT INTO replications(treatment_id,replication_number) VALUES($1,$2)', [treatmentId, replication]);
            }
            await client.query('INSERT INTO reported_results(treatment_id,mean_voltage,mean_current,mean_power,mean_panel_temperature,sample_count,source_note) VALUES($1,$2,$3,$4,$5,3,$6)', [treatmentId, voltage, current, power, temperature, 'Nilai rerata tiga ulangan yang dilaporkan pada Tabel 3.']);
        }
        console.log('Seeded experiments, treatments, replications, reported results.');
    }
    // === SEED DEVICES ===
    const devExists = await client.query("SELECT 1 FROM devices LIMIT 1");
    if (!devExists.rowCount) {
        const devicesData = [
            ['esp32-main', 'ESP32 Main Controller', 'controller', 'greenhouse-main', 'online', '2.1.0'],
            ['dht22-01', 'DHT22 Suhu & Kelembapan', 'sensor', 'zone-a', 'online', '1.0.0'],
            ['dht22-02', 'DHT22 Zona B', 'sensor', 'zone-b', 'online', '1.0.0'],
            ['soil-01', 'Soil Moisture Sensor A', 'sensor', 'zone-a', 'online', '1.0.0'],
            ['soil-02', 'Soil Moisture Sensor B', 'sensor', 'zone-b', 'online', '1.0.0'],
            ['lux-01', 'BH1750 Light Sensor', 'sensor', 'greenhouse-main', 'online', '1.0.0'],
            ['ph-01', 'pH Meter Nutrisi', 'sensor', 'nutrient-tank', 'online', '1.0.0'],
            ['relay-01', 'Relay Module 4CH', 'actuator', 'control-panel', 'online', '1.0.0'],
            ['pump-ctrl', 'Pump Controller', 'actuator', 'irrigation-bay', 'online', '1.3.0'],
            ['fan-ctrl', 'Fan Controller', 'actuator', 'greenhouse-main', 'offline', '1.2.0'],
        ];
        for (const [deviceId, name, type, location, status, firmware] of devicesData) {
            await client.query(`INSERT INTO devices(device_id, name, type, location, status, firmware_version, last_heartbeat) VALUES($1,$2,$3,$4,$5,$6,now() - interval '${status === 'offline' ? '2 hours' : '30 seconds'}')`, [deviceId, name, type, location, status, firmware]);
        }
        console.log('Seeded 10 devices.');
        // === SEED ACTUATORS ===
        const actuatorData = [
            ['relay-01', 'Pompa Irigasi Utama', 'irrigation_pump', 2, 'off'],
            ['relay-01', 'Pompa Nutrisi', 'nutrient_pump', 3, 'off'],
            ['relay-01', 'Misting Nozzle', 'misting', 4, 'off'],
            ['relay-01', 'Grow Light LED', 'grow_light', 5, 'on'],
            ['pump-ctrl', 'Pompa Drip Zone A', 'irrigation_pump', 12, 'auto'],
            ['pump-ctrl', 'Pompa Drip Zone B', 'irrigation_pump', 13, 'off'],
            ['fan-ctrl', 'Exhaust Fan', 'exhaust_fan', 6, 'off'],
            ['fan-ctrl', 'Intake Fan', 'intake_fan', 7, 'off'],
        ];
        const actuatorIds = [];
        for (const [deviceId, name, aType, pin, state] of actuatorData) {
            const r = await client.query('INSERT INTO actuators(device_id, name, actuator_type, gpio_pin, state, auto_enabled, last_toggled_at) VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING id', [deviceId, name, aType, pin, state, state === 'auto']);
            actuatorIds.push(r.rows[0].id);
        }
        console.log('Seeded 8 actuators.');
        // === SEED SENSOR DATA (last 24 hours) ===
        const sensorTypes = [
            { deviceId: 'dht22-01', type: 'temperature', unit: '\u00b0C', base: 28, variance: 5 },
            { deviceId: 'dht22-01', type: 'humidity', unit: '%', base: 72, variance: 15 },
            { deviceId: 'dht22-02', type: 'temperature', unit: '\u00b0C', base: 29, variance: 4 },
            { deviceId: 'dht22-02', type: 'humidity', unit: '%', base: 68, variance: 12 },
            { deviceId: 'soil-01', type: 'soil_moisture', unit: '%', base: 55, variance: 20 },
            { deviceId: 'soil-02', type: 'soil_moisture', unit: '%', base: 52, variance: 18 },
            { deviceId: 'lux-01', type: 'light', unit: 'lux', base: 15000, variance: 12000 },
            { deviceId: 'ph-01', type: 'ph', unit: 'pH', base: 6.2, variance: 0.8 },
        ];
        const now = Date.now();
        let sensorCount = 0;
        for (const s of sensorTypes) {
            for (let i = 0; i < 48; i++) {
                const time = new Date(now - (48 - i) * 30 * 60 * 1000); // every 30 min for 24h
                const hour = time.getHours();
                let value = s.base + (Math.random() - 0.5) * s.variance;
                // Simulate day/night for light
                if (s.type === 'light' && (hour < 6 || hour > 18))
                    value = Math.random() * 200;
                // Simulate temp variation
                if (s.type === 'temperature')
                    value = s.base + Math.sin((hour - 6) / 12 * Math.PI) * (s.variance / 2) + (Math.random() - 0.5) * 2;
                value = Math.round(value * 100) / 100;
                if (value < 0 && s.type !== 'temperature')
                    value = 0;
                await client.query('INSERT INTO sensor_data(device_id, sensor_type, value, unit, recorded_at) VALUES($1,$2,$3,$4,$5)', [s.deviceId, s.type, value, s.unit, time.toISOString()]);
                sensorCount++;
            }
        }
        console.log(`Seeded ${sensorCount} sensor readings.`);
        // === SEED AUTOMATION RULES ===
        const rules = [
            ['Irigasi saat tanah kering', 'Aktifkan pompa irigasi saat kelembapan tanah < 40%', 'soil_moisture', 'below', 40, null, actuatorIds[0], 'turn_on', 300, 600],
            ['Matikan irigasi saat tanah basah', 'Matikan pompa saat kelembapan tanah > 70%', 'soil_moisture', 'above', 70, null, actuatorIds[0], 'turn_off', null, 60],
            ['Kipas saat panas', 'Aktifkan exhaust fan saat suhu > 35\u00b0C', 'temperature', 'above', 35, null, actuatorIds[6], 'turn_on', null, 300],
            ['Matikan kipas saat sejuk', 'Matikan fan saat suhu < 30\u00b0C', 'temperature', 'below', 30, null, actuatorIds[6], 'turn_off', null, 300],
            ['Misting saat kering', 'Aktifkan misting saat kelembapan < 50%', 'humidity', 'below', 50, null, actuatorIds[2], 'turn_on', 120, 600],
            ['Grow light malam', 'Aktifkan grow light saat cahaya < 500 lux', 'light', 'below', 500, null, actuatorIds[3], 'turn_on', null, 300],
        ];
        for (const [name, desc, sType, cond, tMin, tMax, actId, action, dur, cool] of rules) {
            await client.query(`INSERT INTO automation_rules(name, description, sensor_type, condition, threshold_min, threshold_max, actuator_id, action, duration_seconds, cooldown_seconds, enabled)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`, [name, desc, sType, cond, tMin, tMax, actId, action, dur, cool]);
        }
        console.log('Seeded 6 automation rules.');
        // === SEED IRRIGATION SCHEDULES ===
        const schedules = [
            ['Irigasi Pagi', actuatorIds[0], 'interval', 360, null, 300, 5.0],
            ['Irigasi Sore', actuatorIds[0], 'interval', 360, null, 300, 5.0],
            ['Drip Zone A', actuatorIds[4], 'interval', 120, null, 180, 2.0],
            ['Nutrisi Harian', actuatorIds[1], 'cron', null, '0 8 * * *', 600, 3.0],
        ];
        const scheduleIds = [];
        for (const [name, actId, sType, interval, cron, dur, vol] of schedules) {
            const r = await client.query(`INSERT INTO irrigation_schedules(name, actuator_id, schedule_type, interval_minutes, cron_expression, duration_seconds, volume_liters, enabled, last_run_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,true,now() - interval '3 hours') RETURNING id`, [name, actId, sType, interval, cron, dur, vol]);
            scheduleIds.push(r.rows[0].id);
        }
        console.log('Seeded 4 irrigation schedules.');
        // === SEED IRRIGATION LOGS ===
        for (let i = 0; i < 12; i++) {
            const sched = scheduleIds[i % scheduleIds.length];
            const actId = actuatorIds[i % 2 === 0 ? 0 : 4];
            const started = new Date(now - (12 - i) * 3 * 3600 * 1000);
            const ended = new Date(started.getTime() + 300000);
            await client.query(`INSERT INTO irrigation_logs(schedule_id, actuator_id, started_at, ended_at, duration_seconds, volume_liters, trigger_type, status)
         VALUES($1,$2,$3,$4,300,$5,'scheduled','completed')`, [sched, actId, started.toISOString(), ended.toISOString(), 4 + Math.random() * 2]);
        }
        console.log('Seeded 12 irrigation logs.');
        // === SEED ALERTS ===
        const alertsData = [
            ['warning', 'environment', 'Suhu tinggi terdeteksi', 'Suhu greenhouse mencapai 37.2\u00b0C pada zone-a. Exhaust fan telah diaktifkan otomatis.', 'dht22-01'],
            ['critical', 'irrigation', 'Level air rendah', 'Level air di tangki utama di bawah 15%. Segera isi ulang.', null],
            ['info', 'system', 'Firmware update tersedia', 'ESP32 Main Controller memiliki update firmware v2.2.0.', 'esp32-main'],
            ['warning', 'sensor', 'pH di luar rentang optimal', 'pH nutrisi 5.1 — di bawah rentang optimal 5.8-6.5.', 'ph-01'],
            ['info', 'actuator', 'Grow light dinyalakan', 'Grow light LED dinyalakan otomatis karena cahaya rendah (320 lux).', 'relay-01'],
            ['critical', 'sensor', 'Sensor offline', 'Fan Controller tidak merespons selama 2 jam.', 'fan-ctrl'],
        ];
        for (const [severity, category, title, message, deviceId] of alertsData) {
            await client.query(`INSERT INTO alerts(severity, category, title, message, device_id, created_at)
         VALUES($1,$2,$3,$4,$5,now() - interval '${Math.floor(Math.random() * 24)} hours')`, [severity, category, title, message, deviceId]);
        }
        console.log('Seeded 6 alerts.');
        // === SEED ACTIVITY LOGS ===
        const activities = [
            ['actuator', 'Pompa Irigasi Utama dinyalakan', '{"actuatorId": 1, "state": "on"}'],
            ['automation', 'Rule Irigasi saat tanah kering triggered', '{"ruleId": 1, "sensorValue": 35.2}'],
            ['irrigation', 'Irigasi Pagi selesai — 5.2L', '{"scheduleId": 1, "volume": 5.2}'],
            ['device', 'ESP32 Main Controller heartbeat', '{"deviceId": "esp32-main"}'],
            ['system', 'Database backup completed', '{}'],
            ['alert', 'Alert Suhu tinggi acknowledged', '{"alertId": 1}'],
            ['actuator', 'Exhaust Fan dimatikan manual', '{"actuatorId": 7, "state": "off"}'],
            ['irrigation', 'Manual irrigation Zone A — 2.1L', '{"actuatorId": 5, "volume": 2.1}'],
        ];
        for (const [category, action, details] of activities) {
            await client.query(`INSERT INTO activity_logs(category, action, details, created_at)
         VALUES($1,$2,$3::jsonb,now() - interval '${Math.floor(Math.random() * 48)} hours')`, [category, action, details]);
        }
        console.log('Seeded 8 activity logs.');
    }
    else {
        console.log('Device data already seeded.');
    }
    await client.query('COMMIT');
    console.log('\nSeed completed successfully!');
}
catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
}
finally {
    client.release();
    await pool.end();
}
