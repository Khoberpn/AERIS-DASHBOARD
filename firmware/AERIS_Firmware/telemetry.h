#pragma once
/**
 * telemetry.h — payload JSON telemetri AERIS dan adapter REST (belum aktif).
 *
 * Skema payload (versi 1) — dirancang agar bisa dipetakan ke tabel
 * `sensor_data` / `actuators` backend AERIS saat kontrak ditetapkan:
 *
 * {
 *   "schema": 1,
 *   "deviceId": "esp32-main",
 *   "firmware": "1.0.0",
 *   "measuredAt": 1760000000,        // epoch detik; 0 bila waktu belum sinkron
 *   "uptimeMs": 123456,
 *   "mode": "auto",
 *   "connectivity": { "wifi": "connected", "rssi": -61, "ip": "192.168.1.42" },
 *   "sensors": {
 *     "temperature":  { "value": 29.1,  "unit": "°C",  "valid": true,  "ageMs": 1200 },
 *     "humidity":     { "value": 64.0,  "unit": "%",   "valid": true,  "ageMs": 1200 },
 *     "soil_moisture":{ "value": 41.2,  "unit": "%",   "valid": true,  "ageMs": 1200 },
 *     "light":        { "value": 812.0, "unit": "lux", "valid": true,  "ageMs": 1200 },
 *     "ph":           { "value": 6.4,   "unit": "pH",  "valid": false, "ageMs": 9000 },
 *     "water_level":  { "value": 34.5,  "unit": "cm",  "valid": true,  "ageMs": 2100 }
 *   },
 *   "actuators": [
 *     { "id": "irrigation_pump", "state": "on",  "onSinceMs": 3000, "source": "auto:soil" },
 *     { "id": "valve",           "state": "off", "onSinceMs": 0,    "source": "boot" }
 *   ]
 * }
 *
 * Jika nilai invalid, "value" dikirim null — jangan kirim NaN ke JSON.
 */

#include <Arduino.h>

class TelemetryClient {
 public:
  /** Bangun payload ke buffer. Mengembalikan panjang byte yang ditulis (0 = gagal). */
  size_t build(char* out, size_t outLen);

  /** Panggil tiap loop. Dalam mode simulasi hanya menghitung dan mencatat. */
  void update(uint32_t now);

  uint32_t sentCount() const { return sent_; }
  uint32_t failCount() const { return failed_; }

 private:
  uint32_t lastAttempt_ = 0;
  uint32_t sent_ = 0;
  uint32_t failed_ = 0;
  uint32_t retryDelay_ = 0;
};

extern TelemetryClient telemetry;