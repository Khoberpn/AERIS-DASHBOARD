#include "wifi_manager.h"

#include <WiFi.h>

#include "config.h"
#include "logger.h"

WifiManager wifi;

void WifiManager::begin() {
  if (!hasCredentials()) {
    WiFi.mode(WIFI_OFF);
    logWarn("Wi-Fi: SSID masih placeholder — mode konektivitas MATI (offline lokal)");
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);  // reconnect ditangani sendiri agar bisa di-backoff
  WiFi.setSleep(false);         // latensi stabil untuk request HTTP berikutnya
  retryDelay_ = WIFI_RETRY_BASE_MS;
  startAttempt(millis());
}

bool WifiManager::hasCredentials() const {
  return strcmp(WIFI_SSID, "GANTI_SSID_ANDA") != 0 && strlen(WIFI_SSID) > 0;
}

void WifiManager::startAttempt(uint32_t now) {
  logInfo("Wi-Fi: menyambung ke \"%s\" (percobaan %u)", WIFI_SSID, (unsigned)(retries_ + 1));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  connecting_ = true;
  connectStartAt_ = now;
  attemptAt_ = now;
}

void WifiManager::update(uint32_t now) {
  if (!hasCredentials()) return;

  const wl_status_t st = WiFi.status();

  // Transisi ke terhubung
  if (st == WL_CONNECTED) {
    if (connecting_ || !everConnected_) {
      logInfo("Wi-Fi terhubung: %s RSSI %d dBm", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    }
    connecting_ = false;
    everConnected_ = true;
    downSince_ = 0;
    retries_ = 0;
    retryDelay_ = WIFI_RETRY_BASE_MS;
    return;
  }

  // Belum terhubung
  if (downSince_ == 0) downSince_ = now;

  if (connecting_) {
    // Timeout percobaan
    if ((now - connectStartAt_) > WIFI_CONNECT_TIMEOUT_MS) {
      logWarn("Wi-Fi: timeout percobaan koneksi (%lu ms)", (unsigned long)WIFI_CONNECT_TIMEOUT_MS);
      WiFi.disconnect(true, false);
      connecting_ = false;
      attemptAt_ = now;
      retries_++;
      retryDelay_ = min<uint32_t>(retryDelay_ * 2, WIFI_RETRY_MAX_MS);
    }
    return;
  }

  // Jeda backoff sebelum percobaan berikutnya
  if ((now - attemptAt_) >= retryDelay_) {
    retries_++;
    startAttempt(now);
  }
}

bool WifiManager::connected() const { return WiFi.status() == WL_CONNECTED; }
int32_t WifiManager::rssi() const { return connected() ? WiFi.RSSI() : 0; }
IPAddress WifiManager::localIp() const { return connected() ? WiFi.localIP() : IPAddress(0, 0, 0, 0); }

const char* WifiManager::statusText() const {
  if (!hasCredentials()) return "unconfigured";
  switch (WiFi.status()) {
    case WL_CONNECTED: return "connected";
    case WL_NO_SSID_AVAIL: return "no_ssid";
    case WL_CONNECT_FAILED: return "connect_failed";
    case WL_IDLE_STATUS: return "idle";
    case WL_DISCONNECTED: return connecting_ ? "connecting" : "disconnected";
    default: return "disconnected";
  }
}