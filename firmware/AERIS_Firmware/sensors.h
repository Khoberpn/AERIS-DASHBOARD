#pragma once
/**
 * sensors.h — pembacaan semua sensor dengan validasi dan penandaan data.
 *
 * Prinsip: setiap nilai punya `valid` + `timestamp`. Nilai yang tidak
 * dapat dipercaya (sensor gagal, di luar rentang, probe belum dikalibrasi)
 * tetap dilaporkan sebagai invalid dan TIDAK dipakai oleh kontrol otomatis.
 */

#include <Arduino.h>

struct SensorValue {
  float value = NAN;
  bool valid = false;
  uint32_t updatedAt = 0;   // millis() saat pembacaan valid terakhir
  uint8_t failCount = 0;    // kegagalan beruntun
};

struct SensorSnapshot {
  SensorValue airTemp;       // °C
  SensorValue airHumidity;   // %RH
  SensorValue soilMoisture;  // %
  SensorValue lightLux;      // lux
  SensorValue ph;            // pH
  SensorValue waterLevelCm;  // cm dari AJ-SR04M

  // Diagnostik mentah untuk operator (bukan data ilmiah)
  uint16_t soilRawMv = 0;
  uint16_t phRawMv = 0;
};

enum class SensorId : uint8_t { AirTemp, AirHumidity, Soil, Light, Ph, WaterLevel, Count };

class SensorManager {
 public:
  bool begin();
  void update(uint32_t now);          // non-blocking; panggil dari loop
  const SensorSnapshot& snapshot() const;

  bool isStale(SensorId id, uint32_t now) const;
  bool isCriticalFail(SensorId id) const;
  static const char* name(SensorId id);

 private:
  SensorSnapshot snap_;
  bool dhtOk_ = false;
  bool lightOk_ = false;
  bool usOk_ = false;
  uint32_t lastRead_ = 0;
  uint32_t lastDht_ = 0;
  uint32_t lastLight_ = 0;
  uint32_t lastUs_ = 0;
  float lastDhtTemp_ = NAN;

  void readDht(uint32_t now);
  void readLight(uint32_t now);
  void readAnalog();
  void readDistance(uint32_t now);
  void markFail(SensorValue& v);
  static uint16_t readAdcMv(uint8_t pin);
};

extern SensorManager sensors;