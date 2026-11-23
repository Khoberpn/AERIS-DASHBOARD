import { pool } from './client.js';
const means = [
    ['control', 16.78, 0.335, 5.63, 55.0],
    ['aloe', 16.88, 0.343, 5.79, 54.2],
    ['nano', 16.98, 0.359, 6.11, 53.1],
    ['bio-nano', 17.12, 0.382, 6.53, 52.0],
];
const client = await pool.connect();
try {
    await client.query('BEGIN');
    const experiment = await client.query("SELECT id FROM experiments WHERE dataset_kind='demonstration' FOR UPDATE");
    if (!experiment.rows.length)
        throw new Error('Demonstration dataset is missing; run db:seed first');
    for (const [code, voltage, current, power, temperature] of means) {
        await client.query(`INSERT INTO reported_results(treatment_id,mean_voltage,mean_current,mean_power,mean_panel_temperature,sample_count,source_note)
       SELECT t.id,$2,$3,$4,$5,3,$6 FROM treatments t WHERE t.experiment_id=$1 AND t.code=$7
       ON CONFLICT(treatment_id) DO UPDATE SET mean_voltage=EXCLUDED.mean_voltage,mean_current=EXCLUDED.mean_current,
         mean_power=EXCLUDED.mean_power,mean_panel_temperature=EXCLUDED.mean_panel_temperature,
         sample_count=3,source_note=EXCLUDED.source_note`, [experiment.rows[0].id, voltage, current, power, temperature, 'Nilai rerata tiga ulangan yang dilaporkan pada Tabel 3; baris pengukuran individual tidak tersedia.', code]);
    }
    await client.query('UPDATE experiments SET updated_at=now() WHERE id=$1', [experiment.rows[0].id]);
    await client.query('COMMIT');
    console.log('Restored documented demonstration means; raw measurements and greenhouse readings preserved.');
}
catch (error) {
    await client.query('ROLLBACK');
    console.error('Demonstration reset failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
}
finally {
    client.release();
    await pool.end();
}
