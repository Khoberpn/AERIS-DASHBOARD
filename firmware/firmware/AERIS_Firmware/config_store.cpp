#include "config_store.h"

#include <Preferences.h>

#include "config.h"
#include "logger.h"

static const char* NAMESPACE = "aeris_cfg";
static const uint32_t SCHEMA_VERSION = 1;

ConfigStore configStore;

void ConfigStore::begin() {
  Preferences prefs;
  if (!prefs.begin(NAMESPACE, true)) {
    logWarn("NVS tidak bisa dibuka; memakai default kompilasi");
    return;
  }
  const uint32_t ver = prefs.getUInt("ver", 0);
  if (ver != SCHEMA_VERSION) {
    prefs.end();
    logInfo("NVS kosong (skema %lu); memakai default", (unsigned long)ver);
    cfg_.soilDryMv = SOIL_DRY_MV;
    cfg_.soilWetMv = SOIL_WET_MV;
    cfg_.phCalMv4 = PH_CAL_MV_4;
    cfg_.phCalMv7 = PH_CAL_MV_7;
    cfg_.soilOnPct = IRRIGATION_SOIL_ON_PCT;
    cfg_.soilOffPct = IRRIGATION_SOIL_OFF_PCT;
    cfg_.irrigationMaxMs = IRRIGATION_MAX_MS;
    return;
  }
  cfg_.soilDryMv = prefs.getFloat("soilDry", SOIL_DRY_MV);
  cfg_.soilWetMv = prefs.getFloat("soilWet", SOIL_WET_MV);
  cfg_.phCalMv4 = prefs.getFloat("phMv4", PH_CAL_MV_4);
  cfg_.phCalMv7 = prefs.getFloat("phMv7", PH_CAL_MV_7);
  cfg_.soilOnPct = prefs.getFloat("soilOn", IRRIGATION_SOIL_ON_PCT);
  cfg_.soilOffPct = prefs.getFloat("soilOff", IRRIGATION_SOIL_OFF_PCT);
  cfg_.irrigationMaxMs = prefs.getUInt("irrMax", IRRIGATION_MAX_MS);
  cfg_.operationMode = prefs.getUChar("mode", 1);
  cfg_.calibrated = prefs.getBool("cal", false);
  prefs.end();
  logInfo("Konfigurasi NVS dimuat (mode=%s, calibrated=%s)",
          cfg_.operationMode == 1 ? "auto" : "manual", cfg_.calibrated ? "ya" : "belum");
}

bool ConfigStore::save() {
  Preferences prefs;
  if (!prefs.begin(NAMESPACE, false)) {
    logError("Gagal membuka NVS untuk menulis");
    return false;
  }
  prefs.putUInt("ver", SCHEMA_VERSION);
  prefs.putFloat("soilDry", cfg_.soilDryMv);
  prefs.putFloat("soilWet", cfg_.soilWetMv);
  prefs.putFloat("phMv4", cfg_.phCalMv4);
  prefs.putFloat("phMv7", cfg_.phCalMv7);
  prefs.putFloat("soilOn", cfg_.soilOnPct);
  prefs.putFloat("soilOff", cfg_.soilOffPct);
  prefs.putUInt("irrMax", cfg_.irrigationMaxMs);
  prefs.putUChar("mode", cfg_.operationMode);
  prefs.putBool("cal", cfg_.calibrated);
  prefs.end();
  logInfo("Konfigurasi disimpan ke NVS");
  return true;
}

void ConfigStore::reset() {
  Preferences prefs;
  if (prefs.begin(NAMESPACE, false)) {
    prefs.clear();
    prefs.end();
  }
  cfg_ = RuntimeConfig{};
  cfg_.soilDryMv = SOIL_DRY_MV;
  cfg_.soilWetMv = SOIL_WET_MV;
  cfg_.phCalMv4 = PH_CAL_MV_4;
  cfg_.phCalMv7 = PH_CAL_MV_7;
  cfg_.soilOnPct = IRRIGATION_SOIL_ON_PCT;
  cfg_.soilOffPct = IRRIGATION_SOIL_OFF_PCT;
  cfg_.irrigationMaxMs = IRRIGATION_MAX_MS;
  logWarn("Konfigurasi NVS direset — sensor wajib dikalibrasi ulang");
}