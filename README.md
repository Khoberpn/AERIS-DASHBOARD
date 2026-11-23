MARKDOWN

# AERIS Greenhouse Controller

AERIS is a field-instrument dashboard designed for greenhouse environmental monitoring, actuator control, irrigation management, rule-based automation, alerting, and device auditing.

---

## Implementation Status

### Technology Stack
- **Frontend:** React 19, TypeScript, Vite
- **Backend:** Node.js (ESM), Express 5, Zod validation
- **Database:** PostgreSQL, Drizzle ORM
- **Firmware:** Arduino ESP32 (hardware audit documentation available at `firmware/docs/`)

### Implemented Features
- **Overview Dashboard:** Real-time monitoring of overall greenhouse operational status.
- **Environmental Monitoring:** Telemetry tracking for temperature, humidity, light intensity, pH, soil moisture, and water levels.
- **Historical Data Visualization:** Interactive sensor charts with configurable time ranges.
- **Manual Actuator Control:** Direct interface for operating greenhouse hardware actuators.
- **Rule-Based Automation:** Automated triggers configured around user-defined sensor thresholds.
- **Irrigation Management:** Automated scheduling and manual override controls for irrigation systems.
- **Alert Management:** Categorized system notifications based on severity levels.
- **Activity Logs & Audit Trail:** Comprehensive logging of user actions, system events, and state changes.
- **Device Registry:** Hardware tracking with active heartbeat status monitoring.
- **State Resilience:** Stale data detection and cached state handling for intermittent connectivity.

### Design & Visual Identity
- **Color Palette:** Botanical green (`#2f6b4f`) paired with an ivory surface (`#fffdf7`).
- **System Indicators:** Persistent, transparent `DEMO/SIMULATED` status banners across all views.
- **Typography:** IBM Plex Sans and IBM Plex Mono.
- **Responsiveness:** Adaptive layout optimized for desktop, tablet, and mobile viewports.

### Current Limitations
- **No Multi-User Authentication:** User registration, login sessions, and role-based access control are not yet implemented.
- **Unimplemented Device Pairing:** Greenhouse pairing codes, account ownership, and multi-tenant data isolation require additional database migrations.
- **Unverified ESP32 Telemetry:** While firmware code is present, end-to-end telemetry ingestion has not been validated against physical hardware.
- **Simulation Mode Only:** All displayed telemetry is generated from local seed data. Actuator toggles issue simulated commands without physical hardware confirmation.

---

## Local Setup

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- Git

### Installation Steps

1. **Clone the repository and navigate to the project directory:**
   ```bash
   git clone <repository-url>
   cd aeris-greenhouse-controller

Install dependencies:
npm run install

Configure PostgreSQL:
Ensure the PostgreSQL service is running, then create the database and user:
Bash

# Using createdb CLI
createdb aeris

# Or via psql shell
psql -U postgres
CREATE DATABASE aeris;
CREATE USER aeris WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE aeris TO aeris;

Set up environment variables:
Copy the example environment file and update it with your local credentials:
Bash

cp .env.example .env

Example .env configuration (replace sensitive credentials prior to use):
Code snippet

DATABASE_URL=postgresql://aeris:local-password@127.0.0.1:5432/aeris
PORT=4100
NODE_ENV=development
WEB_ORIGIN=[http://127.0.0.1:5173](http://127.0.0.1:5173)
INGEST_TOKEN=replace-with-at-least-32-random-characters

Run database migrations and seed demo data:Bashnpm run db:migrate
npm run db:seed
Start the development servers:Bashnpm run dev
Access the web interface at http://127.0.0.1:5173. To run the client or API server independently, use npm run dev:web or npm run dev:server.Available ScriptsCommandDescriptionnpm run typecheckRun TypeScript static type checkingnpm run lintRun ESLint across the codebasenpm testExecute the Vitest test suitenpm run buildCompile the backend and build the client for productionnpm startStart the compiled production server (dist-server)npm run db:migrateApply pending Drizzle database migrationsnpm run db:seedPopulate the database with simulated seed data (idempotent)npm run db:reset-demoReset specific demo datasets to their initial stateDemo Notice & Production ReadinessThis application currently operates strictly in Demo/Simulated Mode, indicated by a persistent banner throughout the interface. Historical sensor readings are synthetically generated, and device statuses, alerts, automation triggers, and control outputs reflect local database states only. Toggling controls in the UI does not confirm physical actuation.Security Warning: Do not expose this demo server to public networks or connect it to live agricultural hardware in its current state.Roadmap to ProductionTo transition AERIS into a production-ready environment, the following measures must be completed:Implement user authentication and enforce resource ownership checks across all API endpoints.Provision isolated, revocable authentication credentials per hardware device.Enforce HTTPS encryption and configure API rate limiting.Conduct end-to-end integration testing between the ESP32 firmware and the telemetry ingestion pipeline using physical hardware.For technical details regarding hardware integration, refer to firmware/docs/HARDWARE_AUDIT.md.Build & Verification NotesVerification: npm run typecheck, npm test (5 passing tests), and npm run build execute without errors.Bundle Size: Vite currently reports a JavaScript bundle size warning (~625 kB, exceeding the 500 kB threshold). Code splitting and lazy loading have not yet been configured.