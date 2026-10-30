# SOET Connect — Web Application

This directory contains the primary Next.js web application for **SOET Connect**, an alumni engagement portal for students, alumni, and administrators.

For the complete project overview, architecture, backend setup, environment variables, and database configuration, see the [repository README](../../README.md).

## Run the frontend locally

1. Install Node.js and npm.
2. From this directory, install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env.local` file in this directory and set the backend origin:

   ```env
   BACKEND_URL=http://127.0.0.1:8000
   ```

4. Start the Next.js development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

The FastAPI backend must be running separately. The Next.js configuration forwards `/api/*` requests to the backend configured in `BACKEND_URL`.

## Available scripts

- `npm run dev` — start the development server.
- `npm run build` — create a production build.
- `npm start` — start the production server after building.
- `npm run lint` — run ESLint.
