# City Parking Server

The **City Parking Server** is a high-performance, real-time backend engine built with **Node.js** and **Express.js**. It serves as the central nervous system for the entire City Parking ecosystem, orchestrating data flow between IoT hardware, mobile applications, desktop administration panels, and web interfaces.

By leveraging **Socket.io** for low-latency communication and **MongoDB** for flexible data storage, the server ensures that parking availability, sensor data, and financial transactions are synchronized instantly across all platforms.

---

## 🚀 Core Technologies

* **Express.js:** Handles the RESTful API architecture for user authentication, parking history, and system configurations.
* **Socket.io:** Enables bi-directional, real-time communication essential for live stall monitoring and instant IoT triggers.
* **MongoDB:** A NoSQL database used to store complex parking logs, user profiles, and device metadata.
* **Firebase Admin SDK:** Facilitates secure server-side authentication and cloud messaging for mobile notifications.
* **SSLCommerz:** Integrated as the primary payment gateway to handle secure financial transactions within the Bangladesh market.
* **CORS:** Configured with dynamic origin validation to support cross-platform requests from web, desktop (Electron), and mobile (Capacitor) environments.
* **Dotenv:** Ensures secure management of environment variables and sensitive API credentials.

---

## 📱 Multi-Platform Integration

This server is specifically architected to handle diverse client requests:

* **IoT Devices (ESP32/ESP8266):** Optimized to receive high-frequency sensor data via WebSockets or HTTP POST requests to monitor real-time occupancy.
* **Android Mobile App:** Supports Capacitor-based requests for user booking, navigation, and digital payments.
* **Desktop Applications:** Provides a stable interface for Electron-based administrative tools using local file-system protocols.
* **Web Dashboards:** Handles standard browser-based management for cloud accessibility.

---

## 🛠️ Key Features

* **Real-time Stall Synchronization:** Updates all connected clients the moment an IoT sensor detects a vehicle.
* **Automated Payment Verification:** Uses SSLCommerz IPN (Instant Payment Notification) to validate user transactions automatically.
* **Secure Admin Authorization:** Implements multi-tier access control for system administrators.
* **IoT Heartbeat Monitoring:** Tracks the connection status of hardware nodes to ensure 24/7 system uptime.
* **Data Aggregation:** Collects and parses sensor data for generating comprehensive CSV and PDF reports.

---

## 🔧 Installation & Setup

Follow these steps to deploy the server in your local or production environment:

**1. Clone the Server Repository:**
```bash
git clone https://github.com/maruf119459/smart-parking-backend.git
cd smart-parking-backend
```

**2. Install Dependencies:**
```bash
npm install
```

**3. Configure Environment Variables:**
Create a `.env` file in the root directory and populate it with your specific credentials:
```text
PORT=5000
MONGODB_URI=your_mongodb_connection_string
FIREBASE_SERVICE_ACCOUNT_KEY=path_to_json_file
SSL_STORE_ID=your_store_id
SSL_STORE_PASSWORD=your_store_password
```

**4. Start the Server:**
```bash
# For development (with nodemon)
node server.js

```

---

## 🗂️ Other Repositories

**👉 User Frontend Github**
  [Click Here](https://github.com/maruf119459/smart-parking-frontend.git)

**👉 Admin Frontend Github**
  [Click Here](https://github.com/maruf119459/smart-parking-admin-frontend.git)

---

## 🔗 Other Important Links

**👉 User Frontend Live Link**
  [Click Here](https://city-parking.onrender.com)

**👉 User APK**
  [Click Here](https://github.com/maruf119459/smart-parking-frontend/releases/download/v1.0.0/cityParking.apk)

**👉 Admin Frontend Link**
  [Click Here](https://city-parking-admin.onrender.com)

**👉 Admin Desktop Application .exe**
  [Click Here](https://github.com/maruf119459/smart-parking-admin-frontend/releases/download/v1.0.0/City_Parking_Admin_Setup_0.1.0.exe)

---

## 👨‍💻 Developers

Developed with ❤️ by [Md. Mohiuddin Maruf](https://github.com/maruf119459) & [Abrarul Haque](https://github.com/Abrarul-Haque1303)
