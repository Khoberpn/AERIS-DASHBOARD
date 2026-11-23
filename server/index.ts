import app from './app.js';
import { config } from './config.js';
import { pool } from './db/client.js';

const server = app.listen(config.PORT, '127.0.0.1', () => console.log(`AERIS API listening on 127.0.0.1:${config.PORT}`));
const stop = () => { server.close(); void pool.end(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
