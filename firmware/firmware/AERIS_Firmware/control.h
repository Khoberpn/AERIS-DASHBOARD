#pragma once
/**
 * control.h — mesin keputusan irigasi & fail-safe.
 *
 * Aturan utama:
 *  1. Otomasi HANYA jalan bila sensor tanah valid & belum stale.
 *  2. Di mode manual, operator boleh menyalakan pompa asal sensor suhu
 *     tidak di atas cutoff dan tanah tidak menunjukkan genangan.
 *  3. Sensor invalid -> pompa tidak akan menyala sendiri; bila sedang ON
 *     dan data safety invalid >SENSOR_MAX_CONSECUTIVE_FAILS, pompa OFF.
 *  4. Ada batas durasi keras dari ActuatorManager.
 *  5. Hysteresis: ON di <= soilOn, OFF di >= soilOff.
 */

#include <Arduino.h>

#include "sensors.h"

enum class OperationMode : uint8_t { Manual = 0, Auto = 1 };

struct ControlDecision {
  bool wantIrrigation;
  const char* reason;
};

class IrrigationController {
 public:
  void setMode(OperationMode mode);
  OperationMode mode() const { return mode_; }

  /** Hitung keputusan tanpa mengubah hardware. Berguna juga untuk unit test. */
  ControlDecision evaluate(const SensorSnapshot& s, uint32_t now) const;

  /** Terapkan keputusan ke actuator manager, termasuk safety cutoff. */
  void apply(uint32_t now);

  /** Fail-safe: paksa semua aktuator OFF dengan alasan. */
  void emergencyStop(const char* reason);

  /** Operator menyalakan pompa manual dengan durasi terbatas (default max). */
  bool manualRun(const char* source);
  bool manualStop();

  /** Dipanggil tiap loop setelah actuator update, agar controller tahu
   *  pompa yang tadinya dikendalikan otomasi sudah trip karena timeout. */
  void notifyClosed(const char* reason);

  bool blockedBySensor() const { return blocked_; }
  const char* lastReason() const { return lastReason_; }
  uint32_t offlineSince() const { return offlineSince_; }

 private:
  OperationMode mode_ = OperationMode::Auto;
  bool blocked_ = false;
  bool automaticRequest_ = false;  // operator menandai permintaan manual
  bool autoOwned_ = false;         // pompa sedang dikendalikan otomasi
  uint32_t requestAt_ = 0;
  uint32_t lastIrrigationAt_ = 0;
  uint32_t offlineSince_ = 0;
  const char* lastReason_ = "init";
};

extern IrrigationController irrigation;