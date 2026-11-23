#include "logger.h"

#include <stdarg.h>

#include "config.h"

static void logAt(const char* level, const char* fmt, va_list args) {
  char msg[220];
  vsnprintf(msg, sizeof(msg), fmt, args);
  Serial.printf("%s [%8lu ms] [%-5s] %s\n", LOG_TAG, (unsigned long)millis(), level, msg);
}

void logBegin(uint32_t baud) {
  Serial.begin(baud);
  delay(50);
  logInfo("AERIS firmware v%s — device %s", AERIS_FW_VERSION, AERIS_DEVICE_ID);
}
void logInfo(const char* fmt, ...) { va_list a; va_start(a, fmt); logAt("INFO", fmt, a); va_end(a); }
void logWarn(const char* fmt, ...) { va_list a; va_start(a, fmt); logAt("WARN", fmt, a); va_end(a); }
void logError(const char* fmt, ...) { va_list a; va_start(a, fmt); logAt("ERROR", fmt, a); va_end(a); }
void logDebug(const char* fmt, ...) {
#ifdef AERIS_DEBUG
  va_list a; va_start(a, fmt); logAt("DEBUG", fmt, a); va_end(a);
#else
  (void)fmt;
#endif
}