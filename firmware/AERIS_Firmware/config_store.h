#pragma once
/**
 * config_store.h — penyimpanan konfigurasi runtime di NVS (Preferences).
 *
 * Yang disimpan: kalibrasi soil/pH, ambang irigasi, mode operator, flag
 * "sensor sudah dikalibrasi". Yang TIDAK disimpan: state relay (fail-safe
 * selalu OFF saat boot) dan kredensial API (belum diimplementasikan).
 */

#include <Arduino.h>

struct RuntimeConfig {
  float soilDryMv = 2600.0f;
  float soilWetMv = 1100.0f;
  float phCalMv4 = 2450.0f;
  float phCalMv7 = 1650.0f;
  float soilOnPct = 38.0f;
  float soilOffPct = 55.0f;
  uint32_t irrigationMaxMs = 15UL * 60UL * 1000UL;
  uint8_t operationMode = 1;  // 0=manual, 1=auto; default auto
  bool calibrated = false;
};

class ConfigStore {
 public:
  void begin();
  RuntimeConfig& get() { return cfg_; }
  const RuntimeConfig& get() const { return cfg_; }

  /** Bertahan ke NVS. Panggil setelah perubahan dari operator. */
  bool save();
  /** Kembalikan ke default pabrik, termasuk menghapus flag calibrated. */
  void reset();

 private:
  RuntimeConfig cfg_;
};

extern ConfigStore configStore;