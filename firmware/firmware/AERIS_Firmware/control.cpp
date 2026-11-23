#include "control.h"

#include "actuators.h"
#include "config.h"
#include "config_store.h"
#include "logger.h"

IrrigationController irrigation;

void IrrigationController::setMode(OperationMode mode) {
  if (mode_ == mode) return;
  // Pindah mode mematikan pompa yang dikendalikan otomasi supaya tidak "liar".
  if (autoOwned_ && actuators.isOn(ActuatorId::IrrigationPump)) {
    actuators.request(ActuatorId::IrrigationPump, false, "mode-change");
  }
  autoOwned_ = false;
  requestAt_ = 0;
  mode_ = mode;
  automaticRequest_ = false;
  logInfo("Mode operasi -> %s", mode == OperationMode::Auto ? "AUTO" : "MANUAL");
}

// ---------------------------------------------------------------------------
ControlDecision IrrigationController::evaluate(const SensorSnapshot& s, uint32_t now) const {
  const RuntimeConfig& cfg = configStore.get();

  // 1) Mode manual: otomasi tidak pernah memicu.
  if (mode_ != OperationMode::Auto) return { false, "mode manual" };

  // 2) Sensor tanah harus valid dan segar. Jika tidak, blokir total.
  if (!cfg.calibrated && REQUIRE_VALID_SOIL_FOR_AUTO) {
    return { false, "sensor belum dikalibrasi" };
  }
  if (!s.soilMoisture.valid) return { false, "soil invalid" };
  if ((now - s.soilMoisture.updatedAt) > SENSOR_STALE_MS) return { false, "soil stale" };

  // 3) Safety: suhu tidak valid -> tidak boleh menyiram; suhu kritis -> stop.
  if (s.airTemp.valid && s.airTemp.value >= TEMP_HARD_CUTOFF_C) {
    return { false, "suhu kritis" };
  }

  // 4) Hysteresis.
  const bool pumpOn = actuators.isOn(ActuatorId::IrrigationPump);
  if (!pumpOn) {
    if (s.soilMoisture.value <= cfg.soilOnPct) {
      if (lastIrrigationAt_ != 0 && (now - lastIrrigationAt_) < IRRIGATION_COOLDOWN_MS) {
        return { false, "cooldown" };
      }
      return { true, "soil kering" };
    }
    return { false, "soil cukup" };
  }
  // Sedang ON: matikan setelah lembap melewati batas atas.
  if (s.soilMoisture.value >= cfg.soilOffPct) return { false, "target tercapai" };
  return { true, "sedang mengisi" };
}

// ---------------------------------------------------------------------------
void IrrigationController::apply(uint32_t now) {
  const SensorSnapshot& s = sensors.snapshot();

  // Safety cutoff yang berlaku di kedua mode.
  if (s.airTemp.valid && s.airTemp.value >= TEMP_HARD_CUTOFF_C) {
    if (actuators.isOn(ActuatorId::IrrigationPump)) {
      logError("SUHU KRITIS %.1f C — pompa dimatikan paksa", s.airTemp.value);
      actuators.request(ActuatorId::IrrigationPump, false, "safety:high-temp");
    }
    blocked_ = true;
    lastReason_ = "suhu kritis";
    autoOwned_ = false;
    offlineSince_ = now;
    return;
  }
  if (REQUIRE_VALID_TEMP_FOR_SAFETY && !s.airTemp.valid &&
      s.airTemp.failCount >= SENSOR_MAX_CONSECUTIVE_FAILS) {
    // Tanpa data suhu, kontrol otomatis tidak boleh menebak.
    if (autoOwned_ && actuators.isOn(ActuatorId::IrrigationPump)) {
      logWarn("Suhu invalid berkepanjangan — pompa dipaksa OFF");
      actuators.request(ActuatorId::IrrigationPump, false, "safety:no-temp");
    }
    autoOwned_ = false;
    blocked_ = true;
    lastReason_ = "suhu tidak terbaca";
    if (offlineSince_ == 0) offlineSince_ = now;
    return;
  }
  blocked_ = false;

  const ControlDecision d = evaluate(s, now);
  lastReason_ = d.reason;

  if (d.wantIrrigation) {
    if (requestAt_ == 0) requestAt_ = now;
    // Delay pemicu guna mencegah osilasi saat nilai tepat di ambang.
    if ((now - requestAt_) < IRRIGATION_START_DELAY_MS) return;
    if (actuators.request(ActuatorId::IrrigationPump, true, "auto:soil")) {
      if (!autoOwned_) {
        autoOwned_ = true;
        lastIrrigationAt_ = now;
        logInfo("Irigasi otomatis ON (soil=%.1f%%)", s.soilMoisture.value);
      }
    }
    return;
  }

  requestAt_ = 0;
  // Matikan HANYA pompa yang dinyalakan oleh otomasi (jangan mematikan manual operator).
  if (autoOwned_ && actuators.isOn(ActuatorId::IrrigationPump)) {
    actuators.request(ActuatorId::IrrigationPump, false, "auto:hysteresis");
    lastIrrigationAt_ = now;
    autoOwned_ = false;
  }
}

// ---------------------------------------------------------------------------
void IrrigationController::emergencyStop(const char* reason) {
  logError("EMERGENCY STOP: %s", reason);
  actuators.allOff(reason);
  mode_ = OperationMode::Manual;
  automaticRequest_ = false;
  autoOwned_ = false;
  lastReason_ = reason;
  blocked_ = true;
  offlineSince_ = millis();
}

// ---------------------------------------------------------------------------
bool IrrigationController::manualRun(const char* source) {
  const SensorSnapshot& s = sensors.snapshot();
  if (s.airTemp.valid && s.airTemp.value >= TEMP_HARD_CUTOFF_C) {
    logWarn("Manual run ditolak: suhu kritis %.1f C", s.airTemp.value);
    return false;
  }
  if (s.soilMoisture.valid && s.soilMoisture.value > 90.0f) {
    logWarn("Manual run ditolak: tanah sudah jenuh %.1f%%", s.soilMoisture.value);
    return false;
  }
  autoOwned_ = false;  // pompa milik operator, bukan otomasi
  const bool ok = actuators.request(ActuatorId::IrrigationPump, true, source);
  if (ok) logInfo("Manual irigasi ON — batas %lu detik",
                  (unsigned long)(configStore.get().irrigationMaxMs / 1000));
  return ok;
}

bool IrrigationController::manualStop() {
  automaticRequest_ = false;
  autoOwned_ = false;
  return actuators.request(ActuatorId::IrrigationPump, false, "manual:stop");
}

void IrrigationController::notifyClosed(const char* reason) {
  if (autoOwned_) logInfo("Pompa irigasi OFF (%s)", reason);
  autoOwned_ = false;
  requestAt_ = 0;
}