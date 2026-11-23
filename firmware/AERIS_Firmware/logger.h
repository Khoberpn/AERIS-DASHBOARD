#pragma once
/**
 * logger.h — logging diagnostik ber-timestamp ke Serial.
 * Format: [AERIS] [  12345 ms] [WARN] pesan
 * (Tidak menyamarkan error; hanya meringkas supaya mudah dibaca.)
 */

#include <Arduino.h>

void logBegin(uint32_t baud);
void logInfo(const char* fmt, ...);
void logWarn(const char* fmt, ...);
void logError(const char* fmt, ...);
void logDebug(const char* fmt, ...);