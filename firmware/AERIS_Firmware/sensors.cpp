/**
 * sensors.cpp — implementasi unified sensor reading.
 */

#include "sensors.h"

#include <BH1750.h>
#include <DHT.h>
#include <Wire.h>
#include <math.h>

#include "config.h"
#include "logger.h"

SensorManager sensors;

static BH1750 gLight;
static DHT gDht(PIN_DHT_DATA, DHT11);

// ---------------------------------------------------------------------------
static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ---------------------------------------------------------------------------
bool SensorManager::begin() {
  // DHT: library memakai pulseIn-like blocking ± 25 ms; toleran untuk loop 1 Hz.
  gDht.begin();
  dhtOk_ = !isnan(gDht.readTemperature());
  logInfo(dhtOk_ ? "DHT11 terdeteksi" : "DHT11 tidak terdeteksi pada boot");

  // I2C BH1750
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 100000);
  lightOk_ = gLight.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  logInfo(lightOk_ ? "BH1750 terdeteksi (0x23)" : "BH1750 tidak terdeteksi (cek SDA/SCL/ADDR)");

  // Ultrasonik
  pinMode(PIN_US_TRIG, OUTPUT);
  pinMode(PIN_US_ECHO, INPUT);
  digitalWrite(PIN_US_TRIG, LOW);

  // ADC 12-bit (default Arduino-ESP32), attenuate 11 dB agar rentang ~0..3.3V
  analogReadResolution(ADC_BITS);
  analogSetPinAttenuation(PIN_SOIL_ADC, ADC_11db);
  analogSetPinAttenuation(PIN_PH_ADC, ADC_11db);

  usOk_ = true;
  return true;
}

// ---------------------------------------------------------------------------
void SensorManager::update(uint32_t now) {
  if (now - lastRead_ < SENSOR_READ_INTERVAL_MS) return;
  lastRead_ = now;
  readDht(now);
  readLight(now);
  readAnalog();
  readDistance(now);
}

// ---------------------------------------------------------------------------
void SensorManager::readDht(uint32_t now) {
  if (now - lastDht_ < DHT_MIN_INTERVAL_MS) return;
  lastDht_ = now;
  const float t = gDht.readTemperature();
  const float h = gDht.readHumidity();
  const bool okT = !isnan(t) && t > -20.0f && t < 60.0f;
  const bool okH = !isnan(h) && h >= 0.0f && h <= 100.0f;
  if (okT) { snap_.airTemp.value = t; snap_.airTemp.valid = true; snap_.airTemp.updatedAt = now; snap_.airTemp.failCount = 0; }
  else markFail(snap_.airTemp);
  if (okH) { snap_.airHumidity.value = h; snap_.airHumidity.valid = true; snap_.airHumidity.updatedAt = now; snap_.airHumidity.failCount = 0; }
  else markFail(snap_.airHumidity);
  if (!okT && !okH) {
    dhtOk_ = false;
    logWarn("DHT11 gagal baca (cek pull-up 10k & waktu antar-baca)");
  } else {
    if (!dhtOk_) logInfo("DHT11 pulih");
    dhtOk_ = true;
  }
}

// ---------------------------------------------------------------------------
void SensorManager::readLight(uint32_t now) {
  if (now - lastLight_ < BH1750_MIN_INTERVAL_MS) return;
  lastLight_ = now;
  const float lux = gLight.readLightLevel();
  if (lux >= 0.0f && lux <= 150000.0f) {
    snap_.lightLux.value = lux;
    snap_.lightLux.valid = true;
    snap_.lightLux.updatedAt = now;
    snap_.lightLux.failCount = 0;
    lightOk_ = true;
  } else {
    markFail(snap_.lightLux);
    lightOk_ = false;
  }
}

// ---------------------------------------------------------------------------
void SensorManager::readAnalog() {
  const uint32_t now = millis();
  snap_.soilRawMv = readAdcMv(PIN_SOIL_ADC);
  snap_.phRawMv = readAdcMv(PIN_PH_ADC);

  // Soil: interpolasi linear dry->wet. Validasi sensor terlepas/tertutup.
  // Nilai mentah dianggap hilang bila ~0 mV (open circuit) atau ~3300 (short).
  if (snap_.soilRawMv > 30 && snap_.soilRawMv < (uint16_t)(ADC_VREF_MV) - 30) {
    const float pct = (SOIL_DRY_MV - (float)snap_.soilRawMv) / (SOIL_DRY_MV - SOIL_WET_MV) * 100.0f;
    const float p = clampf(pct, 0.0f, 100.0f);
    snap_.soilMoisture.value = p;
    snap_.soilMoisture.valid = true;
    snap_.soilMoisture.updatedAt = now;
    snap_.soilMoisture.failCount = 0;
  } else {
    markFail(snap_.soilMoisture);
  }

  // pH: dua titik kalibrasi. Slope negatif (mV turun saat pH naik).
  const float slope = (PH_CAL_PH_4 - PH_CAL_PH_7) / (PH_CAL_MV_4 - PH_CAL_MV_7);
  const float ph = PH_CAL_PH_7 + slope * ((float)snap_.phRawMv - PH_CAL_MV_7);
  if (ph >= PH_VALID_MIN && ph <= PH_VALID_MAX) {
    snap_.ph.value = ph;
    snap_.ph.valid = true;
    snap_.ph.updatedAt = now;
    snap_.ph.failCount = 0;
  } else {
    markFail(snap_.ph);
  }
}

// ---------------------------------------------------------------------------
void SensorManager::readDistance(uint32_t now) {
  if (now - lastUs_ < US_INTERVAL_MS) return;
  lastUs_ = now;

  digitalWrite(PIN_US_TRIG, LOW);
  delayMicroseconds(3);
  digitalWrite(PIN_US_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_US_TRIG, LOW);

  const unsigned long dur = pulseIn(PIN_US_ECHO, HIGH, US_TIMEOUT_US);
  if (dur == 0) {
    // Timeout = tidak ada echo (permukaan terlalu jauh / sensor mati)
    markFail(snap_.waterLevelCm);
    if (snap_.waterLevelCm.failCount >= SENSOR_MAX_CONSECUTIVE_FAILS) {
      logWarn("AJ-SR04M tidak ada echo — water level invalid");
    }
    return;
  }
  // Konversi standar: 58 us/cm (kecepatan suara ~343 m/s, pulsa bolak-balik).
  // CATATAN: divider tegangan (1k/2k) hanya menurunkan level, TIDAK mengubah
  // durasi pulsa. Jangan kalikan durasi dengan US_ECHO_DIVIDER_RATIO.
  // Rasio itu hanya untuk memilih komponen divider saat pemasangan.
  const float cm = (float)dur / 58.0f;
  if (cm >= US_MIN_CM && cm <= US_MAX_CM) {
    snap_.waterLevelCm.value = cm;
    snap_.waterLevelCm.valid = true;
    snap_.waterLevelCm.updatedAt = now;
    snap_.waterLevelCm.failCount = 0;
  } else {
    markFail(snap_.waterLevelCm);
  }
}

// ---------------------------------------------------------------------------
void SensorManager::markFail(SensorValue& v) {
  v.valid = false;
  if (v.failCount < 255) v.failCount++;
  // `value` lama tetap disimpan untuk logging, tetapi valid=false menjamin
  // kontrol otomatis tidak menggunakannya.
}

// ---------------------------------------------------------------------------
uint16_t SensorManager::readAdcMv(uint8_t pin) {
  uint32_t sum = 0;
  for (uint8_t i = 0; i < ADC_SAMPLES; i++) {
    sum += analogRead(pin);
  }
  const float avg = (float)sum / (float)ADC_SAMPLES;
  return (uint16_t)clampf(avg * ADC_VREF_MV / (float)ADC_MAX, 0.0f, 3300.0f);
}

// ---------------------------------------------------------------------------
const SensorSnapshot& SensorManager::snapshot() const { return snap_; }

bool SensorManager::isStale(SensorId id, uint32_t now) const {
  const SensorValue* v = nullptr;
  switch (id) {
    case SensorId::AirTemp:     v = &snap_.airTemp; break;
    case SensorId::AirHumidity: v = &snap_.airHumidity; break;
    case SensorId::Soil:        v = &snap_.soilMoisture; break;
    case SensorId::Light:       v = &snap_.lightLux; break;
    case SensorId::Ph:          v = &snap_.ph; break;
    case SensorId::WaterLevel:  v = &snap_.waterLevelCm; break;
    default: return true;
  }
  return !v->valid || v->updatedAt == 0 || (now - v->updatedAt) > SENSOR_STALE_MS;
}

bool SensorManager::isCriticalFail(SensorId id) const {
  const SensorValue* v = nullptr;
  switch (id) {
    case SensorId::AirTemp: v = &snap_.airTemp; break;
    case SensorId::Soil:    v = &snap_.soilMoisture; break;
    default: return false;  // hanya sensor safety-critical
  }
  return !v->valid && v->failCount >= SENSOR_MAX_CONSECUTIVE_FAILS;
}

const char* SensorManager::name(SensorId id) {
  switch (id) {
    case SensorId::AirTemp: return "airTemp";
    case SensorId::AirHumidity: return "airHumidity";
    case SensorId::Soil: return "soilMoisture";
    case SensorId::Light: return "lightLux";
    case SensorId::Ph: return "ph";
    case SensorId::WaterLevel: return "waterLevelCm";
    default: return "unknown";
  }
}