/**
 * telemetry.cpp — builder payload JSON + adapter REST (simulasi).
 *
 * Adapter HTTP TIDAK diaktifkan (API_ADAPTER_ENABLED 0). Backend AERIS
 * belum memiliki endpoint ingest untuk ESP32; kontrak hanya disiapkan di
 * sini. Jangan menyambung HTTP tanpa HTTPS & token perangkat.
 */

#include "telemetry.h"

#include <ArduinoJson.h>
#include <time.h>

#include "actuators.h"
#include "config.h"
#include "control.h"
#include "logger.h"
#include "sensors.h"
#include "wifi_manager.h"

TelemetryClient telemetry;

static const char* unitFor(SensorId id) {
  switch (id) {
    case SensorId::AirTemp: return "C";
    case SensorId::AirHumidity: return "%";
    case SensorId::Soil: return "%";
    case SensorId::Light: return "lux";
    case SensorId::Ph: return "pH";
    case SensorId::WaterLevel: return "cm";
    default: return "";
  }
}

static const SensorValue& valueFor(const SensorSnapshot& s, SensorId id) {
  switch (id) {
    case SensorId::AirTemp: return s.airTemp;
    case SensorId::AirHumidity: return s.airHumidity;
    case SensorId::Soil: return s.soilMoisture;
    case SensorId::Light: return s.lightLux;
    case SensorId::Ph: return s.ph;
    case SensorId::WaterLevel: return s.waterLevelCm;
    default: return s.airTemp;
  }
}

static const char* keyFor(SensorId id) {
  switch (id) {
    case SensorId::AirTemp: return "temperature";
    case SensorId::AirHumidity: return "humidity";
    case SensorId::Soil: return "soil_moisture";
    case SensorId::Light: return "light";
    case SensorId::Ph: return "ph";
    case SensorId::WaterLevel: return "water_level";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------------
size_t TelemetryClient::build(char* out, size_t outLen) {
  // Ukuran 2048: 6 sensor + 4 aktuator + connectivity, ample headroom.
  StaticJsonDocument<2048> doc;

  doc["schema"] = 1;
  doc["deviceId"] = AERIS_DEVICE_ID;
  doc["firmware"] = AERIS_FW_VERSION;
  const time_t epoch = time(nullptr);
  doc["measuredAt"] = (epoch > 1700000000) ? (uint32_t)epoch : 0;
  doc["uptimeMs"] = (uint32_t)millis();
  doc["mode"] = irrigation.mode() == OperationMode::Auto ? "auto" : "manual";

  JsonObject conn = doc.createNestedObject("connectivity");
  conn["wifi"] = wifi.statusText();
  conn["rssi"] = wifi.rssi();
  conn["ip"] = wifi.localIp().toString();

  JsonObject sensorObj = doc.createNestedObject("sensors");
  const SensorSnapshot& snap = sensors.snapshot();
  const uint32_t now = millis();
  for (uint8_t i = 0; i < static_cast<uint8_t>(SensorId::Count); i++) {
    const SensorId id = (SensorId)i;
    const SensorValue& v = valueFor(snap, id);
    JsonObject o = sensorObj.createNestedObject(keyFor(id));
    if (v.valid && !isnan(v.value)) o["value"] = v.value;
    else o["value"] = nullptr;
    o["unit"] = unitFor(id);
    o["valid"] = v.valid;
    o["ageMs"] = v.updatedAt == 0 ? 0 : (uint32_t)(now - v.updatedAt);
  }

  JsonArray acts = doc.createNestedArray("actuators");
  for (uint8_t i = 0; i < static_cast<uint8_t>(ActuatorId::Count); i++) {
    const ActuatorId id = (ActuatorId)i;
    // Jangan laporkan misting bila hardware GPIO33 belum ada; cukup pompa, valve, nutrient
    if (id == ActuatorId::MistingPump) continue;
    JsonObject a = acts.createNestedObject();
    a["id"] = actuatorType(id);
    a["name"] = actuatorName(id);
    a["state"] = actuators.isOn(id) ? "on" : "off";
    a["onSinceMs"] = actuators.isOn(id) ? (uint32_t)(now - actuators.onSince(id)) : 0;
    a["source"] = actuators.lastSource(id);
  }

  const size_t n = serializeJson(doc, out, outLen);
  if (n == 0) {
    logError("Gagal serialize telemetri (buffer %u byte)", (unsigned)outLen);
  }
  return n;
}

// ---------------------------------------------------------------------------
void TelemetryClient::update(uint32_t now) {
  if (lastAttempt_ != 0 && (now - lastAttempt_) < LOG_INTERVAL_MS) return;
  lastAttempt_ = now;

  static char payload[2048];
  const size_t n = build(payload, sizeof(payload));
  if (n == 0) {
    failed_++;
    return;
  }

#if API_ADAPTER_ENABLED
  // ===== ADAPTER REST — BELUM DIAKTIFKAN =====
  // Saat backend menyediakan endpoint ESP32, implementasikan:
  //  - WiFiClientSecure dengan setCACert(rootCA) — JANGAN setInsecure()
  //  - header Authorization: Bearer <token-dari-NVS>
  //  - HTTPClient timeout 8-10 detik, retry eksponensial 2^n (max 60 s)
  //  - simpan token di Preferences, bukan di source code
  // Kode berikut sengaja tidak melakukan request apa pun.
  logWarn("API adapter aktif tetapi implementasi belum tersedia (menunggu kontrak backend)");
  sent_++;
#else
  // Mode simulasi: log payload ringkas agar dapat diverifikasi tanpa backend.
  logInfo("TELEMETRI (simulasi) #%lu, %u byte", (unsigned long)(sent_ + 1), (unsigned)n);
  if (n < 512) {
    logInfo("%s", payload);
  } else {
    // Potong di tengah: cukup untuk pemeriksaan cepat di Serial Monitor
    char head[256];
    memcpy(head, payload, 255);
    head[255] = '\0';
    logInfo("%s…", head);
  }
  sent_++;
#endif
}
