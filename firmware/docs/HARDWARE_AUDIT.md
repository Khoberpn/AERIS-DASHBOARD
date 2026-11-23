# AERIS Firmware — Audit Hardware & Arsitektur

Dokumen ini adalah hasil audit tahap 1–2 sebelum implementasi firmware.
**Firmware belum diuji pada perangkat fisik.** Semua klaim di bawah adalah
analisis datasheet/karakteristik board, bukan hasil pengukuran lapangan.

---

## 1. Board & Lingkungan

| Item | Nilai | Catatan |
|---|---|---|
| Board | ESP32 DevKit V1 (ESP32-WROOM-32, 30 pin) | Verifikasi silkscreen; ada varian 38 pin |
| Core | `esp32:esp32` **3.3.7** | API `ledcAttach(pin,freq,res)` khusus core 3.x |
| Framework | Arduino (Arduino IDE 2.x / arduino-cli 1.5.2) | FQBN `esp32:esp32:esp32` |
| Logika I/O | 3,3 V | Tidak ada pin 5 V-tolerant |
| VCC relay | **5 V** (VIN/USB) | Koin relay harus dari 5 V, bukan 3V3 |

### Pin khusus ESP32 DevKit V1

| GPIO | Fungsi | Aman untuk | Catatan |
|---|---|---|---|
| 21, 22 | I2C | I/O | Default Wire |
| 4 | DHT11 DATA | I/O + pull-up 10k | OK |
| 34, 35 | ADC1 | **input saja** | Tidak ada pull-up internal; tidak boleh output |
| 26 | TRIG | output | OK |
| 27 | ECHO | input | **Wajib divider bila ECHO 5 V** |
| 25, 32, 33 | Relay/PWM | output | OK, tidak strapping |

GPIO 6–11 dipakai flash internal SPI — jangan disentuh.
GPIO 34–39 input-only (tidak ada pull-up/pull-down internal).

---

## 2. Audit Sensor per Komponen

### 2.1 BH1750 (I2C, 0x23)

- VCC 3,3 V — **jangan 5 V**.
- ADDR ke GND → 0x23; ke VCC → 0x5C. Firmware memakai 0x23.
- Rentang 1–65.535 lx. Nilai di atas 65k akan clamp di library; bukan
  masalah untuk greenhouse.
- **Catatan penting**: BH1750 mengukur iluminansi (lux, respons fotopik),
  bukan irradiance spektral. Jangan dipakai sebagai klaim PAR/PV.

### 2.2 DHT11

- 3,3 V, pull-up 10kΩ ke DATA (beberapa modul sudah punya — cek PCB).
- Akurasi ±2 °C, ±5 %RH, resolusi 1 °C / 1 %RH, **min 1 detik antar-baca**
  (library butuh ≥ 2 s untuk konversi stabil).
- Tidak tahan kondensasi. Letakkan jauh dari semprotan misting.
- Firmware: `DHT_MIN_INTERVAL_MS = 2200`.

### 2.3 Soil moisture kapasitif (AO)

- VCC 3,3 V. Output 0–3 V, **aman** untuk GPIO34.
- Tegangan naik saat kering (probe kapasitif). Kalibrasi dua titik:
  `SOIL_DRY_MV = 2600` (udara), `SOIL_WET_MV = 1100` (air).
- **Divider tidak diperlukan**; tetapi **jangan** sambungkan ke 5 V.
- Probe kapasitif bisa berkarat pada DC bias terus-menerus; matikan daya
  sensor saat tidak membaca bila umur pakai kritis (opsional, tunda).

### 2.4 Sensor pH analog

- Output modul pH (op-amp) bisa 0–5 V jika VCC 5 V. Jika VCC = 5 V,
  **wajib divider** agar ≤ 3,3 V (mis. 10k/20k). Jika modul mendukung
  3,3 V, gunakan 3,3 V.
- Impedansi elektroda kaca tinggi — butuh buffer op-amp. Modul murah
  (PH-4502C) sudah punya buffer, tetapi kalibrasi 2 titik sangat dianjurkan.
- Kalibrasi default (di `config.h`) adalah **angka asumsi**, bukan hasil
  pengukuran. Harus dikalibrasi dengan larutan buffer 4.00 dan 7.00.

### 2.5 AJ-SR04M

- Mode trigger default mengeluarkan **pulsa ECHO 3,3 V** pada beberapa
  modul, tetapi modul di pasaran sering ikut HC-SR04 (5 V).
  **Gunakan divider 1k/2k (2/3 × 5 V = 3,33 V) ke GPIO27.**
  Tanpa divider, GPIO27 berisiko rusak.
- Jangan gunakan GPIO34/35 untuk ECHO, karena input-only tanpa pull.
- Jangkauan praktis 20–400 cm. Arahkan ke permukaan cairan, bukan tabung.
- Firmware memakai `pulseIn()` dengan timeout 60 ms (setara ~10 m
  round-trip). Blocking ± maksimal 60 ms; ini tidak dijalankan pada
  periode kritis.

---

## 3. Audit Aktuator & Relay — Temuan Kritis

### 3.1 Kebutuhan vs kapasitas

| Aktuator | Arus tipikal | Catatan |
|---|---|---|
| Pompa irigasi DC | 0,5–2 A | tergantung model; bisa > 5 A saat start |
| Solenoid valve | 0,3–0,8 A (24 V AC/DC atau 12 V) | perlu adaptor terpisah |
| Penyemprot pupuk (pompa diafragma) | 1–3 A | head pressure menentukan |

**Kesimpulan:** dua channel relay **tidak cukup** untuk tiga aktuator
independen. Menghubungkan dua beban ke satu channel akan menarik arus
gabungan (bisa > relay rating 10 A, tetapi lebih penting: tidak bisa
dikontrol terpisah).

### 3.2 Solusi aman yang dipilih firmware

Firmware **membatasi** perilaku agar aman dengan hardware saat ini:

```
GPIO25 → CH1 relay → Pompa irigasi      (dedicated)
GPIO32 → CH2 relay → Solenoid valve     (beban A)
                   └→ Penyemprot pupuk  (beban B, TIDAK bersamaan)
GPIO33 → gate MOSFET → Pompa misting    (opsional, belum dipasang)
```

Aturan `ActuatorManager`:
1. Solenoid dan penyemprot berbagi CH2. Permintaan kedua saat satu aktif
   **ditolak** dan dicatat di log.
2. Perpindahan state wajib jeda ≥ 150 ms.
3. Solenoid didesain **pulse** (± 1 s) — jangan di-hold lama (panas).
4. Semua relay OFF saat boot dan saat reset (fail-safe).

### 3.3 Pilihan hardware jangka panjang (rekomendasi)

Untuk tiga aktuator independen, gunakan salah satu:

- **Opsi A — Modul relay 4 channel opto-isolated (5 V)** dengan VCC dari
  5 V dan GPIO sebagai IN. Sederhana, tetapi tetap butuh transistor buffer
  (modul opto sudah punya).
- **Opsi B — 3× MOSFET low-side logic-level (IRLZ44N / IRL540)** untuk
  pompa DC, dengan **flyback diode (1N5822)** dan **gate resistor 220 Ω** +
  **pull-down 10 kΩ**. Untuk solenoid AC 24 V, gunakan relay/SSR AC
  terpisah — **jangan** MOSFET DC untuk AC.
- **Opsi C — Driver motor IC** (L298N/BTS7960) untuk pompa besar.

**Yang JANGAN dilakukan:**
- Menghubungkan IN relay langsung ke GPIO tanpa buffer jika modul
  menarik > 3 mA (pastikan modul punya transistor).
- Memberi beban induktif tanpa diode flyback.
- Menyalakan tiga beban dari satu 5 V USB laptop.

### 3.4 Sumber daya

- Gunakan PSU 12 V (atau 24 V sesuai solenoid) ≥ 3 A, dengan DC-DC
  5 V/2 A untuk board + relay, dan DC-DC 3,3 V/1 A untuk sensor jika
  modul menuntut.
- **Common ground** antara ESP32, relay, sensor analog, dan PSU aktuator
  — wajib untuk ADC.
- Tambahkan kapasitor 470 µF di dekat relay dan 100 nF di dekat pin
  sensor analog.

---

## 4. Pembacaan ADC — Batasan Nyata ESP32

Meskipun spesifikasi menyebut "12-bit", pembacaan langsung **tidak
linear** dan bervariasi antar unit. Firmware:

- Menggunakan `analogSetPinAttenuation(ADC_11db)` (rentang ~0–3,1 V efektif).
- Rata-rata 32 sampel untuk meredam noise.
- Memvalidasi nilai mentah (bukan hanya hasil konversi) — nilai mentah
  mendekati 0 mV atau 3.300 mV dianggap open/short.
- Kalibrasi 2 titik disimpan di NVS dan dipakai saat runtime.

Jika akurasi penting, gunakan **ADS1115** eksternal (16-bit, I2C) —
firmware belum memakainya, tetapi modul `sensors.cpp` mudah diperluas.

---

## 5. Keputusan Arsitektur Firmware

```
AERIS_Firmware.ino
  ├─ config.h          → pin, ambang, kalibrasi default, Wi-Fi placeholder
  ├─ logger.{h,cpp}    → Serial log ber-timestamp
  ├─ config_store.{h,cpp} → NVS (Preferences) kalibrasi + mode
  ├─ sensors.{h,cpp}   → DHT11, BH1750, ADC (soil/pH), AJ-SR04M
  ├─ actuators.{h,cpp} → fail-safe relay, batas durasi, arbitrase CH2
  ├─ control.{h,cpp}   → hysteresis, cooldown, mode, safety cutoff
  ├─ wifi_manager.{h,cpp} → STA non-blocking + exponential backoff
  └─ telemetry.{h,cpp} → JSON schema + adapter REST (belum aktif)
```

**Prinsip:**
1. Loop non-blocking; hanya `pulseIn` dan `DHT.read` yang blocking kecil.
2. Aktuator dikendalikan di **satu** tempat (`ActuatorManager`) sehingga
   fail-safe mudah diaudit.
3. Setiap nilai sensor membawa `valid` dan `updatedAt` — kontrol otomatis
   tidak pernah memakai data invalid/stale.
4. Mode AUTO hanya aktif bila `calibrated = true` di NVS.
5. Wi-Fi dan API **tidak pernah** memblokir control loop lokal.

---

## 6. Asumsi yang Digunakan

1. DHT11 beroperasi di 3,3 V dengan pull-up 10 kΩ (bukan modul 5 V).
2. Soil probe = tipe kapasitif (bukan resistif).
3. Modul pH memakai 3,3 V atau sudah di-divider.
4. AJ-SR04M dipasang dengan divider 1k/2k pada ECHO.
5. Relay aktif-LOW (umum pada modul 2CH opto). Jika aktif-HIGH, ubah
   `RELAY_ACTIVE_LOW` di `config.h`.
6. Beban aktuator dipasok PSU terpisah — bukan dari pin 3V3/5V board.
7. Tidak ada RTC eksternal; waktu mengandalkan NTP (belum diimplementasi
   pada versi ini — lihat TODO di `telemetry`).

Jika salah satu asumsi tidak sesuai, **ubah sebelum menyalakan beban.**