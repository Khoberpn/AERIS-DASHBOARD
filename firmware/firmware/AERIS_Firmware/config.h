#pragma once
/**
 * config.h — konfigurasi terpusat firmware AERIS.
 *
 * Semua pin, kredensial, kalibrasi default, dan ambang keselamatan ada di sini.
 * Nilai yang boleh diubah operator saat alat berjalan disimpan di NVS
 * (Preferences) dan hanya *default*-nya ada di file ini.
 *
 * PENTING: kredensial Wi-Fi hanya placeholder. Isi lewat layar konfigurasi
 * (belum ada) atau ubah file ini sebelum unggah. Jangan commit kredensial asli.
 */

#include <Arduino.h>

// ============================== IDENTITAS ==============================
#define AERIS_FW_VERSION "1.0.0"
// Harus sama dengan device_id yang terdaftar di tabel `devices` backend AERIS.
#define AERIS_DEVICE_ID "esp32-main"

// ============================== PINOUT ==============================
// Dipetakan dari spesifikasi lapangan. Verifikasi dengan board fisik
// sebelum menyalakan beban (lihat docs/HARDWARE_AUDIT.md).
#define PIN_I2C_SDA 21   // BH1750 SDA
#define PIN_I2C_SCL 22   // BH1750 SCL
#define PIN_DHT_DATA 4   // DHT11 DATA
#define PIN_SOIL_ADC 34  // Soil moisture AO  (ADC1, input-only)
#define PIN_PH_ADC 35    // pH AO             (ADC1, input-only)
#define PIN_US_TRIG 26   // AJ-SR04M TRIG
#define PIN_US_ECHO 27   // AJ-SR04M ECHO     (WAJIB voltage divider, lihat audit)
#define PIN_RELAY_1 25   // Relay CH1
#define PIN_RELAY_2 32   // Relay CH2
#define PIN_ACT3_PWM 33  // Driver aktuator ketiga (MOSFET, hanya PWM 3V3 -> gate)

// ============================== RELAY & LOGIKA ==============================
// Modul relay murah biasanya ACTIVE-LOW. Verifikasi dengan multimeter:
// saat IN=LOW, COM-NO harus kontinu (beep). Jika modul Anda active-high,
// set ke false — tetapi tetap gunakan transistor buffer, jangan sambung
// IN relay langsung ke GPIO tanpa penguat.
#define RELAY_ACTIVE_LOW true
// Jeda antar switching relay. Mengurangi lonjakan beban & memperpanjang umur kontak.
#define RELAY_SWITCH_GAP_MS 150

// ============================== ADC ==============================
#define ADC_BITS 12
#define ADC_MAX 4095
// Tegangan referensi efektif ADC ESP32 pada 11 dB attenuation.
// Bergantung unit — butuh kalibrasi; lihat docs/HARDWARE_AUDIT.md.
#define ADC_VREF_MV 3200.0f
// Rata-rata sampel untuk meredam noise. 32 sampel ± 3 ms.
#define ADC_SAMPLES 32
// Interval baca ADC (non-blocking)
#define ADC_SAMPLE_INTERVAL_MS 50

// Soil probe kapasitif (VCC 3.3 V): makin kering makin tinggi tegangan.
// Kalibrasi: celup di air = basah (100%), biarkan di udara kering = kering (0%).
#define SOIL_DRY_MV 2600.0f
#define SOIL_WET_MV 1100.0f

// pH probe (modul analog dengan op-amp). Titik kalibrasi 2 titik.
#define PH_CAL_MV_4 2450.0f  // tegangan sesuai larutan pH 4
#define PH_CAL_MV_7 1650.0f  // tegangan sesuai larutan pH 7
#define PH_CAL_PH_4 4.0f
#define PH_CAL_PH_7 7.0f
// Validasi: di luar rentang ini nilai ditandai invalid, bukan dikirim sebagai data sah.
#define PH_VALID_MIN 0.0f
#define PH_VALID_MAX 14.0f

// AJ-SR04M mode UART default mengeluarkan pulsa ECHO 3.3 V, tetapi sebagian
// modul (dan HC-SR04) output 5 V. Gunakan divider 1k/2k (2/3 tegangan) —
// jika divider terpasang, aktifkan kompensasi pengukuran di bawah.
#define US_ECHO_DIVIDER_RATIO 1.5f  // 3.3V -> 2.2V ; ukuran waktu di-kali 1.5
#define US_TIMEOUT_US 60000UL       // ~10 m round trip; di atas ini = gagal
#define US_INTERVAL_MS 2000
#define US_MIN_CM 2.0f
#define US_MAX_CM 400.0f
// Hanya kirim jarak bila permukaan berada dalam rentang ini (jarak normal
// dari sensor ke permukaan air/tanah di tangki AERIS). Di luar = invalid.
#define US_VALID_MIN_CM 5.0f
#define US_VALID_MAX_CM 200.0f

// ============================== SENSOR & STALENESS ==============================
#define SENSOR_READ_INTERVAL_MS 5000   // baca semua sensor setiap 5 detik
#define DHT_MIN_INTERVAL_MS 2200       // batas minimum library DHT
#define BH1750_MIN_INTERVAL_MS 200
#define SENSOR_STALE_MS 5UL * 60UL * 1000UL  // >5 menit = stale
#define SENSOR_MAX_CONSECUTIVE_FAILS 3
// Di perlindungan ini, nilai dibuang dan fail-safe dipertimbangkan.

// ============================== KONTROL IRIGASI LOKAL ==============================
// Hysteresis: pompa ON di bawah SOIL_ON, OFF setelah SOIL_OFF.
#define IRRIGATION_SOIL_ON_PCT 38.0f
#define IRRIGATION_SOIL_OFF_PCT 55.0f
// Cooldown irigasi otomatis agar tidak menyiksa tanaman / pompa.
#define IRRIGATION_COOLDOWN_MS 10UL * 60UL * 1000UL
// Keterlambatan pemicu setelah filter stabil.
#define IRRIGATION_START_DELAY_MS 5000UL

// ============================== BATAS KESELAMATAN AKTUATOR ==============================
#define TEMP_COOLING_THRESHOLD_C 32.0f
#define TEMP_SAFE_THRESHOLD_C 28.0f
#define IRRIGATION_MAX_MS 15UL * 60UL * 1000UL     // 15 menit
#define MISTING_MAX_MS 5UL * 60UL * 1000UL         // 5 menit
#define MISTING_MIN_GAP_MS 60UL * 60UL * 1000UL    // 1 jam antar siklus
#define MISTING_BURST_ON_MS 30UL * 1000UL
#define MISTING_BURST_OFF_MS 30UL * 1000UL
#define SOLENOID_PULSE_MS 1000UL                   // solenoid pintas (don't hold)
#define FAN_MAX_MS 4UL * 60UL * 60UL * 1000UL      // 4 jam
// Batas suhu kritis: bila suhu >= ini, pompa & misting dipaksa mati
// (kecuali misting, yang merupakan bantuan pendinginan; lihat safety engine).
#define TEMP_HARD_CUTOFF_C 45.0f

// ============================== FAIL-SAFE ==============================
// Semua relay OFF saat boot. Waktu tunggu agar relay/aktuator sebelum
// firmware mengambil keputusan — menghindari transisi tak terkendali.
#define BOOT_SETTLE_MS 750UL
// Saat sensor kritis (suhu/tanah) invalid, irigasi otomatis DIBLOKIR total.
#define REQUIRE_VALID_SOIL_FOR_AUTO true
#define REQUIRE_VALID_TEMP_FOR_SAFETY true

// ============================== WAKTU & JADWAL ==============================
#define SCHEDULER_TICK_MS 1000UL
#ifndef AERIS_NTP_SERVER
#define AERIS_NTP_SERVER "id.pool.ntp.org"
#endif
#define NTP_RETRY_MS 10UL * 60UL * 1000UL

// ============================== WIFI ==============================
// Catatan: file ini sengaja tidak menyimpan SSID/password asli.
// Ubah dua makro di bawah pada salinan lokal, atau buat wifi_secrets.private.h
// berisi:
//   #define WIFI_SSID     "SSID_ANDA"
//   #define WIFI_PASSWORD "PASSWORD_ANDA"
// lalu aktifkan baris include di bawah. File private itu di-gitignore.
// #include "wifi_secrets.private.h"

#ifndef WIFI_SSID
#define WIFI_SSID "GANTI_SSID_ANDA"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "GANTI_PASSWORD"
#endif

#define WIFI_CONNECT_TIMEOUT_MS 20000UL
#define WIFI_RETRY_BASE_MS 3000UL
#define WIFI_RETRY_MAX_MS 60000UL
#define WIFI_DATA_TIMEOUT_MS 120000UL

// ============================== INTEGRASI API (BELUM AKTIF) ==============================
// Backend AERIS saat ini menyediakan POST /api/greenhouse/readings yang
// memerlukan header x-ingest-token. Modul telemetri firmware ini BELUM
// mengirim ke server: kontrak endpoint ESP32 belum ditetapkan.
// Skema hanya disiapkan untuk disambungkan nanti.
// JANGAN set ke 1 sebelum menyimpan token di NVS (bukan hardcode).
#define API_ADAPTER_ENABLED 0
#define API_BASE_URL ""  // isi setelah backend siap, e.g. "https://aeris.example.id"

// ============================== DIAGNOSTIK ==============================
#define SERIAL_BAUD 115200
#define LOG_INTERVAL_MS 5000UL
#define LOG_TAG "[AERIS]"