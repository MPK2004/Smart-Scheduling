# Smart Scheduling

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

A modern, responsive, and dynamic Event Scheduling application built with React, Vite, TypeScript, and Supabase. The application allows users to manage their events seamlessly, featuring an intuitive calendar interface, categorical filtering, search functionality, and automated Telegram notifications.

## Live Demo

- **Web Application:** [https://smart-scheduling.vercel.app/](https://smart-scheduling.vercel.app/)
- **Telegram Bot:** [@Maantisbot](https://t.me/Maantisbot) (Link: [https://t.me/Maantisbot](https://t.me/Maantisbot))


## Features

- **User Authentication:** Secure signup and login using Supabase Auth.
- **Guest Mode:** Experience the app without creating an account (events are stored in-memory).
- **Interactive Calendar:** Visual event calendar for easy date selection and event viewing.
- **Event Management:** Add, edit, and delete events with details like title, description, category, and date.
- **Telegram Notifications:** Get notified via Telegram bot when an event starts.
- **Advanced Filtering & Search:** Search events by keyword and filter them by custom categories.
- **Responsive Design:** Fully responsive UI built with Tailwind CSS and Shadcn UI components.
- **Real-time Toasts:** Instant feedback on user actions using Sonner.

## Tech Stack

- **Frontend Framework:** React 18, Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Shadcn UI
- **State Management:** React Query (@tanstack/react-query), React Hooks
- **Routing:** React Router DOM
- **Backend & Database:** Supabase (PostgreSQL, Auth, Edge Functions, pg_cron)

## Database Architecture

The application uses PostgreSQL (via Supabase) with the following core schema:

```mermaid
erDiagram
    users ||--o{ profiles : "has one"
    users ||--o{ events : "creates"

    profiles {
        uuid id PK "Matches auth.users.id"
        timestamp created_at
        text username "Unique username"
        bigint telegram_chat_id "Linked Telegram Chat ID"
        text link_code "Unique linking code for Telegram"
        uuid last_event_id FK "Reference to the last interacted event"
    }

    events {
        uuid id PK
        timestamp created_at
        text title "Event title"
        text description "Event description (Nullable)"
        timestamp start_date "Event start date and time"
        timestamp end_date "Event end date and time (Nullable)"
        text category "Event category (Nullable)"
        text recurrence "Recurrence rule (Nullable)"
        boolean notified "Notification status (Default: false)"
        uuid user_id FK "References auth.users.id"
    }
```

*Note: The `users` table is managed internally by Supabase Auth (`auth.users`), and `profiles` and `events` inherit their `id` and `user_id` relations accordingly.*

## Automation and Edge Functions

The application leverages Supabase Edge Functions and `pg_cron` for background tasks:

- **send-notifications:** An Edge Function that scans for upcoming events and sends Telegram messages to users with linked accounts.
- **pg_cron:** Managed via the `process-notifications-every-minute` job, which triggers the notification engine every minute.

## Getting Started

Follow these instructions to set up the project locally.

### Prerequisites

Ensure you have the following installed on your local machine:
- Node.js (v18 or higher)
- npm or yarn or bun
- Supabase CLI (if you intend to modify the database or functions)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Smart-Scheduling
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root of your project and add your Supabase credentials.

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Telegram Bot Setup

To enable notifications, you must configure a Telegram Bot:

1. Create a bot using [@BotFather](https://t.me/botfather) and obtain the `TELEGRAM_BOT_TOKEN`.
2. Set the token in your Supabase project secrets:
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=your_token
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   # or
   bun run dev
   ```

5. **Open your browser:**
   Navigate to `http://localhost:5173` to see the application running.

## Project Structure

```text
Smart-Scheduling/
├── public/                 # Static assets
├── src/                    # Source code
│   ├── components/         # Reusable React components (UI & layout)
│   ├── hooks/              # Custom React hooks
│   ├── integrations/       # External service integrations (Supabase client & types)
│   ├── lib/                # Utility functions
│   ├── pages/              # Main application pages (Index, Login, Signup)
│   ├── types/              # TypeScript definitions
│   ├── App.tsx             # Root application component and routing setup
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global stylesheets (Tailwind)
├── supabase/
│   ├── functions/          # Supabase Edge Functions (Deno)
│   ├── migrations/         # PostgreSQL database migrations
│   └── config.toml         # Supabase CLI configuration
├── package.json            # Project metadata and scripts
├── tailwind.config.ts      # Tailwind CSS configuration
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite configuration
```
