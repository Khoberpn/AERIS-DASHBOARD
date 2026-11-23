#include "actuators.h"

#include "config.h"
#include "config_store.h"
#include "logger.h"

ActuatorManager actuators;

const char* actuatorName(ActuatorId id) {
  switch (id) {
    case ActuatorId::IrrigationPump: return "Pompa Irigasi";
    case ActuatorId::SolenoidValve: return "Solenoid Valve";
    case ActuatorId::NutrientSprayer: return "Penyemprot Pupuk";
    case ActuatorId::MistingPump: return "Pompa Misting";
    default: return "?";
  }
}

const char* actuatorType(ActuatorId id) {
  switch (id) {
    case ActuatorId::IrrigationPump: return "irrigation_pump";
    case ActuatorId::SolenoidValve: return "valve";
    case ActuatorId::NutrientSprayer: return "nutrient_pump";
    case ActuatorId::MistingPump: return "misting";
    default: return "unknown";
  }
}

static uint32_t limitFor(ActuatorId id) {
  switch (id) {
    case ActuatorId::IrrigationPump: return configStore.get().irrigationMaxMs;
    case ActuatorId::NutrientSprayer: return MISTING_MAX_MS;
    case ActuatorId::SolenoidValve: return SOLENOID_PULSE_MS;
    case ActuatorId::MistingPump: return MISTING_MAX_MS;
    default: return 60000UL;
  }
}

// ---------------------------------------------------------------------------
void ActuatorManager::begin() {
  pinMode(PIN_RELAY_1, OUTPUT);
  pinMode(PIN_RELAY_2, OUTPUT);
  // Semua OFF TERLEBIH DAHULU sebelum apa pun. Jangan menyalakan relay saat boot.
  digitalWrite(PIN_RELAY_1, RELAY_ACTIVE_LOW ? HIGH : LOW);
  digitalWrite(PIN_RELAY_2, RELAY_ACTIVE_LOW ? HIGH : LOW);
  pinMode(PIN_ACT3_PWM, OUTPUT);
  digitalWrite(PIN_ACT3_PWM, LOW);
  logInfo("Aktuator init: relay OFF (active-%s)", RELAY_ACTIVE_LOW ? "low" : "high");
}

// ---------------------------------------------------------------------------
bool ActuatorManager::request(ActuatorId id, bool on, const char* source) {
  const uint32_t now = millis();
  State& s = state_[static_cast<uint8_t>(id)];
  if (s.on == on) return true;  // idempoten

  // CH2 dipakai bersama. Tolak permintaan kedua saat bus sedang dipakai.
  if (on && sameRelay(id, ActuatorId::SolenoidValve)) {
    for (uint8_t i = 0; i < static_cast<uint8_t>(ActuatorId::Count); i++) {
      if (i == static_cast<uint8_t>(id)) continue;
      if (sameRelay((ActuatorId)i, ActuatorId::SolenoidValve) && state_[i].on) {
        logWarn("PERMINTAAN DITOLAK: %s tidak bisa ON karena %s sedang ON di relay CH2 (satu beban per CH2)",
                actuatorName(id), actuatorName((ActuatorId)i));
        return false;
      }
    }
  }

  if (on) {
    // Gap minimal untuk mencegah relay beradu dan arus lonjak
    if (s.lastOffAt != 0 && (now - s.lastOffAt) < RELAY_SWITCH_GAP_MS) {
      logWarn("PERMINTAAN DITOLAK: %s terlalu cepat setelah OFF (%lu ms < %lu ms)",
              actuatorName(id), (unsigned long)(now - s.lastOffAt), (unsigned long)RELAY_SWITCH_GAP_MS);
      return false;
    }
    // Untuk valve: cegah hold-on lama
    if (id == ActuatorId::SolenoidValve) {
      logInfo("Solenoid: pulse %lu ms, setelahnya OFF otomatis", (unsigned long)SOLENOID_PULSE_MS);
    }
  }

  applyPin(id, on);
  s.on = on;
  s.source = source;
  if (on) s.onSince = now;
  else s.lastOffAt = now;
  logInfo("AKTUATOR %s -> %s (sumber: %s)", actuatorName(id), on ? "ON" : "OFF", source);
  return true;
}

// ---------------------------------------------------------------------------
void ActuatorManager::applyPin(ActuatorId id, bool on) {
  const uint8_t active = RELAY_ACTIVE_LOW ? LOW : HIGH;
  const uint8_t inactive = RELAY_ACTIVE_LOW ? HIGH : LOW;
  switch (id) {
    case ActuatorId::IrrigationPump:
    case ActuatorId::SolenoidValve:
    case ActuatorId::NutrientSprayer:
      // Solenoid & nutrient berbagi CH2; pemanggilan sudah difilter.
      digitalWrite(id == ActuatorId::IrrigationPump ? PIN_RELAY_1 : PIN_RELAY_2, on ? active : inactive);
      break;
    case ActuatorId::MistingPump:
      // PWM hanya jika MOSFET terpasang; untuk sekarang level pin LOW/HIGH.
      digitalWrite(PIN_ACT3_PWM, on ? HIGH : LOW);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
bool ActuatorManager::sameRelay(ActuatorId a, ActuatorId b) const {
  auto group = [](ActuatorId id) {
    switch (id) {
      case ActuatorId::SolenoidValve:
      case ActuatorId::NutrientSprayer:
        return 2;
      case ActuatorId::IrrigationPump:
        return 1;
      case ActuatorId::MistingPump:
        return 3;
      default:
        return 0;
    }
  };
  return group(a) == group(b);
}

// ---------------------------------------------------------------------------
void ActuatorManager::update(uint32_t now) {
  for (uint8_t i = 0; i < static_cast<uint8_t>(ActuatorId::Count); i++) {
    State& s = state_[i];
    if (!s.on) continue;
    const uint32_t limit = limitFor((ActuatorId)i);
    if (now - s.onSince >= limit) {
      logWarn("BATAS WAKTU: %s sudah ON %lu ms, OFF otomatis",
              actuatorName((ActuatorId)i), (unsigned long)(now - s.onSince));
      request((ActuatorId)i, false, "timeout");
    }
  }
}

// ---------------------------------------------------------------------------
void ActuatorManager::allOff(const char* reason) {
  for (uint8_t i = 0; i < static_cast<uint8_t>(ActuatorId::Count); i++) {
    if (state_[i].on) request((ActuatorId)i, false, reason);
  }
}

bool ActuatorManager::isOn(ActuatorId id) const { return state_[static_cast<uint8_t>(id)].on; }
uint32_t ActuatorManager::onSince(ActuatorId id) const { return state_[static_cast<uint8_t>(id)].onSince; }
uint32_t ActuatorManager::lastOffAt(ActuatorId id) const { return state_[static_cast<uint8_t>(id)].lastOffAt; }
const char* ActuatorManager::lastSource(ActuatorId id) const { return state_[static_cast<uint8_t>(id)].source; }
bool ActuatorManager::sharedBusActive() const {
  return isOn(ActuatorId::SolenoidValve) || isOn(ActuatorId::NutrientSprayer);
}
bool ActuatorManager::anyOn() const {
  for (uint8_t i = 0; i < static_cast<uint8_t>(ActuatorId::Count); i++) if (state_[i].on) return true;
  return false;
}