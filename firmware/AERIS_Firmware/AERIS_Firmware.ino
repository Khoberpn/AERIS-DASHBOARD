/**
 * AERIS_Firmware.ino
 * Automated Environmental Rice Intelligence System — controller ESP32.
 *
 * Target  : ESP32 DevKit V1 (ESP32 klasik), Arduino IDE / arduino-cli
 * Core    : esp32:esp32 3.x
 * Board   : ESP32 Dev Module
 *
 * CARA PAKAI DESKTOP
 *  1. Susun hardware sesuai docs/HARDWARE_AUDIT.md — terutama divider ECHO.
 *  2. Isi SSID/password di config.h (atau wifi_secrets.private.h).
 *  3. Unggah; buka Serial Monitor 115200.
 *  4. Semua relay OFF saat boot. Jangan menyalakan pompa sebelum sensor
 *     tanah dikalibrasi.
 *
 * Urutan loop (non-blocking):
 *   sensors -> actuators (timeout) -> irrigation controller -> wifi -> telemetry -> logging
 */

#include <Arduino.h>

#include "actuators.h"
#include "config.h"
#include "config_store.h"
#include "control.h"
#include "logger.h"
#include "sensors.h"
#include "telemetry.h"
#include "wifi_manager.h"

static uint32_t gLastLog = 0;
static uint32_t gBootAt = 0;
static bool gReady = false;
static bool gPumpWasOn = false;

static void logSnapshot() {
  const SensorSnapshot& s = sensors.snapshot();
  logInfo("SUHU %s%.1fC  RH %s%.1f%%  TANAH %s%.1f%%  LUX %s%.0f  pH %s%.2f  JARAK %s%.1fcm",
          s.airTemp.valid ? "" : "?", s.airTemp.value,
          s.airHumidity.valid ? "" : "?", s.airHumidity.value,
          s.soilMoisture.valid ? "" : "?", s.soilMoisture.value,
          s.lightLux.valid ? "" : "?", s.lightLux.value,
          s.ph.valid ? "" : "?", s.ph.value,
          s.waterLevelCm.valid ? "" : "?", s.waterLevelCm.value);
  logInfo("MODE %s  POMPA %s  SUMBER %s  ALASAN %s  WIFI %s",
          irrigation.mode() == OperationMode::Auto ? "AUTO" : "MANUAL",
          actuators.isOn(ActuatorId::IrrigationPump) ? "ON" : "OFF",
          actuators.lastSource(ActuatorId::IrrigationPump),
          irrigation.lastReason(),
          wifi.statusText());
}

void setup() {
  gBootAt = millis();

  // 1) Aktuator OFF secepat mungkin. Pin relay diset HIGH (inactive) sebelum
  //    pinMode agar tidak ada pulsa ON saat power-on.
  pinMode(PIN_RELAY_1, OUTPUT);
  pinMode(PIN_RELAY_2, OUTPUT);
  digitalWrite(PIN_RELAY_1, RELAY_ACTIVE_LOW ? HIGH : LOW);
  digitalWrite(PIN_RELAY_2, RELAY_ACTIVE_LOW ? HIGH : LOW);
  pinMode(PIN_ACT3_PWM, OUTPUT);
  digitalWrite(PIN_ACT3_PWM, LOW);

  logBegin(SERIAL_BAUD);
  logInfo("Boot: relay dipaksa OFF, menunggu %lu ms settle", (unsigned long)BOOT_SETTLE_MS);

  // 2) Konfigurasi & driver
  configStore.begin();
  actuators.begin();
  sensors.begin();

  // 3) Mode awal dari NVS. Mode auto HANYA bila sensor sudah dikalibrasi.
  if (configStore.get().operationMode == 1 && configStore.get().calibrated) {
    irrigation.setMode(OperationMode::Auto);
  } else {
    irrigation.setMode(OperationMode::Manual);
    if (!configStore.get().calibrated) {
      logWarn("Sensor tanah BELUM dikalibrasi — mode AUTO diblokir");
    }
  }

  // 4) Wi-Fi (non-blocking; gagal tidak menghentikan kontrol lokal)
  wifi.begin();
}

void loop() {
  const uint32_t now = millis();

  // Settle window: tidak ada keputusan kontrol sebelum BOOT_SETTLE_MS.
  if (!gReady) {
    if ((now - gBootAt) < BOOT_SETTLE_MS) {
      delay(10);
      return;
    }
    gReady = true;
    logInfo("Sistem siap");
  }

  sensors.update(now);
  actuators.update(now);

  // Controller hanya berjalan setelah pembacaan pertama tersedia.
  const SensorSnapshot& snap = sensors.snapshot();
  if (snap.soilMoisture.updatedAt != 0 || snap.airTemp.updatedAt != 0) {
    irrigation.apply(now);
  }

  // Sinkronkan status controller bila pompa trip (timeout / safety / mode change).
  const bool pumpOn = actuators.isOn(ActuatorId::IrrigationPump);
  if (gPumpWasOn && !pumpOn) irrigation.notifyClosed(actuators.lastSource(ActuatorId::IrrigationPump));
  gPumpWasOn = pumpOn;

  wifi.update(now);
  telemetry.update(now);

  if (now - gLastLog >= LOG_INTERVAL_MS) {
    gLastLog = now;
    logSnapshot();
  }

  delay(5);  // beri waktu scheduler & watchdog; loop tetap non-blocking
}