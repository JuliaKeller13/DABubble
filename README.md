<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/img/logo/logo_with_text_white.svg">
  <source media="(prefers-color-scheme: light)" srcset="public/img/logo/logo_with_text.svg">
  <img src="public/img/logo/logo_with_text.svg" alt="DABubble logo" width="260">
</picture>

# DABubble

**Real-time team communication built with Angular, TypeScript and Supabase.**

*A collaborative frontend project developed by a two-person team during the Developer Akademie training program.*

![Angular](https://img.shields.io/badge/Angular-21-DD0031?logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![SCSS](https://img.shields.io/badge/SCSS-CC6699?logo=sass&logoColor=white)

[**Live Demo**](https://dabubble.juliakeller-dev.de/) · [**My GitHub Fork**](https://github.com/JuliaKeller13/DABubble) · [**Team Repository**](https://github.com/JensBaumannDev/DABubble)

</div>

---

## Table of Contents

- [About the Project](#about-the-project)
- [Key Features](#key-features)
- [My Contributions](#my-contributions)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Team & Credits](#team--credits)

---

## About the Project

**DABubble** is a Slack-inspired web application for team communication. It provides real-time conversations in channels and direct messages, including threads and message reactions. Angular powers the frontend, while Supabase provides authentication, PostgreSQL storage and real-time updates.

DABubble was **developed collaboratively**, not as an individual project. This repository is my fork of the shared codebase. The sections below distinguish the application's overall functionality from the parts I personally implemented or improved.

## Key Features

The **team-built application** includes:

- **Real-time messaging:** channel conversations, direct messages and threaded replies.
- **Channels and members:** organized conversations with channel membership management.
- **User authentication:** registration, sign-in, guest access and password recovery.
- **Profiles:** avatar selection, profile editing and account management.
- **Message interactions:** emoji reactions, emoji picker, mentions and message editing.
- **Search and presence:** tools for finding conversations and displaying user status.
- **Responsive interface:** layouts and interactions designed for different screen sizes.

## My Contributions

My work focused primarily on **authentication, account management and interactive messaging features**. The following contributions are supported by commits in the shared project history:

| Area | My work |
| --- | --- |
| Authentication | Built and improved login and sign-up flows, guest-login behavior, session handling and route protection. |
| Password recovery | Implemented forgot-password and password-reset pages, forms, routing and associated authentication integration. |
| Profiles & account management | Worked on avatar selection, profile editing and the account-deletion flow, including Supabase Edge Function logic for user-data cleanup. |
| Messaging interactions | Implemented and refined emoji picker integration, recent emoji handling, message reactions and reaction tooltips. |
| UI quality | Improved responsive layouts, dialog interactions, loading feedback, animations and related usability details. |

**Selected implementation commits:**

- [Forgot-password flow](https://github.com/JuliaKeller13/DABubble/commit/edf55c7b86) and [password-reset implementation](https://github.com/JuliaKeller13/DABubble/commit/1541b9fe79)
- [Profile editing](https://github.com/JuliaKeller13/DABubble/commit/3c9ab17d60) and [account-deletion functionality](https://github.com/JuliaKeller13/DABubble/commit/07a80688f3)
- [Emoji picker integration](https://github.com/JuliaKeller13/DABubble/commit/4cdb085823) and [route guard](https://github.com/JuliaKeller13/DABubble/commit/11feb66c29)

These examples describe **my contribution to the team project**, not exclusive authorship of the entire application.

## Tech Stack

| Category | Technologies |
| --- | --- |
| Frontend | Angular 21, TypeScript, Angular Signals |
| UI & styling | HTML, SCSS, Angular Material, Angular CDK |
| Backend services | Supabase Authentication, PostgreSQL, Supabase Realtime |
| Serverless functionality | Supabase Edge Functions (Deno / TypeScript) |
| Messaging UI | `@ctrl/ngx-emoji-mart` |
| Development & tests | npm, Git, Vitest, jsdom, Prettier |

## Getting Started

### Prerequisites

- Node.js and npm versions compatible with Angular 21.
- Access to a configured Supabase project with the database tables and policies required by DABubble.

### 1. Clone this fork

```bash
git clone https://github.com/JuliaKeller13/DABubble.git
cd DABubble
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Supabase

Configure your own Supabase project credentials in `src/environments/environment.ts` using the configuration keys expected by the application:

```typescript
export const environment = {
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseKey: 'YOUR_SUPABASE_ANON_KEY',
};
```

Use a **public anon/publishable key** for frontend access, never a Supabase `service_role` key. Setting the credentials alone does not create the required database schema or access policies.

### 4. Run locally

```bash
npm start
```

Open `http://localhost:4200/`.

### 5. Run tests

```bash
npm test
```

### Optional: generate code documentation

```bash
npm run compodoc
```

## Project Structure

```text
DABubble/
├── public/                  # Images, icons and branding
├── src/
│   ├── app/
│   │   ├── components/      # Chat, messages, profile dialogs and shared UI
│   │   ├── guards/          # Protected-route access
│   │   ├── interfaces/      # Application data models
│   │   ├── pages/           # Authentication and application pages
│   │   └── services/        # Authentication, messaging and Supabase integration
│   ├── environments/       # Frontend environment configuration
│   └── styles/             # Shared SCSS styles
├── supabase/
│   └── functions/
│       └── delete-account/ # Account deletion Edge Function
├── package.json
└── README.md
```

## Team & Credits

DABubble was built as a **team project** during the [Developer Akademie](https://developerakademie.com/) training program.

| Contributor | GitHub | LinkedIn |
| --- | --- | --- |
| **Jens Baumann** | [@JensBaumannDev](https://github.com/JensBaumannDev) | [Jens Baumann](https://www.linkedin.com/in/jens-baumann-7a6866315/) |
| **Julia Keller** | [@JuliaKeller13](https://github.com/JuliaKeller13) | [Julia Keller](https://www.linkedin.com/in/julia-keller-970409389/) |

**Shared team repository:** [JensBaumannDev/DABubble](https://github.com/JensBaumannDev/DABubble)  
**My fork:** [JuliaKeller13/DABubble](https://github.com/JuliaKeller13/DABubble)

The project was created as part of Developer Akademie's training program. Project assets and materials may be subject to the program's applicable terms and licenses.
