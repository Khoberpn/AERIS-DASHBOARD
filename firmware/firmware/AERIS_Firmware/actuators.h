#pragma once
/**
 * actuators.h — driver aktuator dengan fail-safe dan pembatas waktu.
 *
 * AUDIT RELAY (lihat docs/HARDWARE_AUDIT.md):
 * Hanya 2 channel relay tersedia, tetapi ada 3 aktuator yang diminta
 * (pompa irigasi, solenoid, penyemprot pupuk). Firmware ini TIDAK
 * mengklaim ketiganya bisa jalan bersamaan.
 *
 * Solusi yang diimplementasikan:
 *   CH1 (GPIO25) -> Pompa irigasi        (dedicated)
 *   CH2 (GPIO32) -> Bus selektor:
 *       - default: Solenoid valve
 *       - saat perintah "nutrient": penyemprot pupuk (lewat tukar bus?)
 *
 * Karena hardware final belum ditetapkan, firmware membatasi CH2 dengan
 * aturan safety: hanya satu beban CH2 yang boleh aktif pada satu waktu.
 * Jika operator meminta keduanya, permintaan kedua DITOLAK dan dilaporkan.
 *
 * GPIO33 disiapkan sebagai driver MOSFET (PWM) untuk aktuator ketiga,
 * tetapi firmware tidak mengaktifkannya sampai hardware dipasang.
 */

#include <Arduino.h>

enum class ActuatorId : uint8_t {
  IrrigationPump = 0,  // CH1 GPIO25
  SolenoidValve = 1,   // CH2 GPIO32
  NutrientSprayer = 2, // CH2 share (lihat catatan)
  MistingPump = 3,     // opsional via GPIO33 MOSFET
  Count
};

const char* actuatorName(ActuatorId id);
const char* actuatorType(ActuatorId id);  // string sesuai backend (irrigation_pump, etc.)

struct ActuatorLimits {
  uint32_t maxOnMs;
  uint32_t minGapMs;
};

class ConfigStore;  // forward decl — implementasi di config_store.h

class ActuatorManager {
 public:
  void begin();

  /** Mengembalikan true bila permintaan diterima. */
  bool request(ActuatorId id, bool on, const char* source);
  /** Set semua OFF (fail-safe). */
  void allOff(const char* reason);
  /** Panggil tiap loop. Menegakkan batas durasi dan gap. */
  void update(uint32_t now);

  bool isOn(ActuatorId id) const;
  uint32_t onSince(ActuatorId id) const;
  uint32_t lastOffAt(ActuatorId id) const;
  const char* lastSource(ActuatorId id) const;

  /** Ada beban CH2 (solenoid/nutrient) yang aktif? */
  bool sharedBusActive() const;
  bool anyOn() const;

 private:
  struct State {
    bool on = false;
    uint32_t onSince = 0;
    uint32_t lastOffAt = 0;
    const char* source = "boot";
  } state_[static_cast<uint8_t>(ActuatorId::Count)];

  void applyPin(ActuatorId id, bool on);
  bool sameRelay(ActuatorId a, ActuatorId b) const;
};

extern ActuatorManager actuators;