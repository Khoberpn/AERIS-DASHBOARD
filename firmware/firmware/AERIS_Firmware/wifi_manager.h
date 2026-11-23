#pragma once
/**
 * wifi_manager.h — Wi-Fi non-blocking dengan exponential backoff.
 *
 * Tidak pernah memanggil WiFi.begin() berulang-ulang di dalam loop tanpa
 * jeda; setiap percobaan punya timeout dan jeda yang tumbuh hingga batas.
 * Jika Wi-Fi turun, aktuator tetap berjalan lokal (fail-safe lokal).
 */

#include <Arduino.h>

class WifiManager {
 public:
  void begin();
  void update(uint32_t now);

  bool connected() const;
  uint32_t downSince() const { return downSince_; }
  uint16_t retryCount() const { return retries_; }
  int32_t rssi() const;
  IPAddress localIp() const;
  const char* statusText() const;
  bool hasCredentials() const;

 private:
  bool connecting_ = false;
  bool everConnected_ = false;
  uint32_t attemptAt_ = 0;
  uint32_t connectStartAt_ = 0;
  uint32_t downSince_ = 0;
  uint32_t retryDelay_ = 0;
  uint16_t retries_ = 0;

  void startAttempt(uint32_t now);
};

extern WifiManager wifi;