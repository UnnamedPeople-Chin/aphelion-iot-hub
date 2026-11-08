# APHELION · IoT Landslide Early Warning System Hub

> **Proyek Akhir Praktikum Internet of Things (Mr. Liliek Triyono)**  
> Program Studi D3 Teknik Informatika — Jurusan Teknik Elektro — Politeknik Negeri Semarang (POLINES)

---

## 🪐 Ringkasan Proyek
Platform monitoring dan peringatan dini bencana tanah longsor berbasis mikrokontroler ESP32, multi-sensor geoteknik (kemiringan lereng & kelembapan tanah), Google Firebase Realtime Database, dan Dashboard Mobile Flutter.

* **Jurnal Rujukan:** *Geoscience Frontiers* (Elsevier 2026, Vol. 17, Article 102242) — Scopus Q1
* **Live Dashboard:** [https://unnamedpeople-chin.github.io/aphelion-iot-hub/](https://unnamedpeople-chin.github.io/aphelion-iot-hub/)

---

## 👥 Tim Kelompok Aphelion (IK-2B)
1. **Jizdan Yuflikh Rachmat** (3.34.25.1.12) — *Ketua / Firmware ESP32 & Cloud Backend*
2. **Haqqi Raya Syachputra** (3.34.25.1.11) — *Hardware Specialist & Alumni Liaison*
3. **Kafka Nafisa** (3.34.25.1.13) — *Flutter Mobile App Engineer*
4. **Anisa Aulia** (3.34.25.1.04) — *Geotechnical Logic & QA Testing*
5. **Nazriel Farras K.P.S** (3.34.25.1.20) — *Slope Enclosure Mechanic & Media*
6. **Raffael Deannova I.F** (3.34.25.1.22) — *QoS Testing & Scientific Report*

---

## 🛠️ Tech Stack & Hardware
* **Microcontroller:** ESP32 DevKit V1 (30 Pin)
* **Incline & Vibration:** MPU-6050 (6-DOF Gyroscope + Accelerometer via I2C 0x68)
* **Soil Saturation:** Capacitive Soil Moisture Sensor v1.2 (Anti-Karat via ADC1 GPIO 34)
* **Ambient Weather:** DHT22 Temperature & Humidity (GPIO 4)
* **Local Alert:** Active Buzzer 5V (GPIO 18) & Tri-State LED (GPIO 19, 23, 5)
* **Cloud & App:** Google Firebase Realtime Database (Free Tier) + Flutter Mobile SDK
