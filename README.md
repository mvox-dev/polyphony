# Polyphony

**A platform for choral music sharing.**

Polyphony empowers choirs to manage their sheet music privately while connecting with other choirs through a trusted network. No paywalls, no central control—your music library belongs to you.

---

## Production Status

**Vault:** [![Vault Deployment](https://img.shields.io/badge/vault-live-brightgreen?logo=cloudflare&logoColor=white&style=flat-square)](https://crede.polyphony.uk) `crede.polyphony.uk`  
**Registry:** [![Registry Deployment](https://img.shields.io/badge/registry-live-brightgreen?logo=cloudflare&logoColor=white&style=flat-square)](https://polyphony.uk) `polyphony.uk`

_First production deployment: Kammerkoor Crede (Feb 2026)_  

---

## The Problem

Choirs today face a difficult choice:

- **Paid platforms** (IMSLP Pro, ChoralWiki premium) charge subscriptions and control your library
- **Informal sharing** (email, Dropbox) lacks organization and raises legal concerns
- **No good solution** for sharing rehearsal materials between choirs you trust

## The Solution

Polyphony is a **two-tier system**:

### 🏠 The Vault

A single deployment hosting all choir organizations.

- Upload and organize PDF scores
- Invite choir members with role-based access
- Your organization's data stays organized and secure
- Support for umbrella organizations (e.g., Estonian Choral Association)

### 🌐 The Registry

A zero-storage auth gateway and discovery service.

- Register your organization at `polyphony.uk/register`
- Discover other choirs and browse Public Domain scores
- Single sign-on across all organizations (SSO cookie)
- No storage of user or score data—queries Vault APIs at runtime

---

## How It Works

```text
┌──────────────────────────────────────────────────┐
│          REGISTRY (polyphony.uk)                 │
│   • Auth (OAuth, SSO)  • Directory  • PD Catalog │
│   • Zero storage - queries Vault APIs            │
└──────────────────────────────────────────────────┘
                        │
              Queries public APIs
                        ▼
┌──────────────────────────────────────────────────┐
│          VAULT (*.polyphony.uk)                  │
│   • Single deployment, all organizations         │
│   • Scores, members, events, participation       │
└──────────────────────────────────────────────────┘
                        │
              Subdomain routing
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   crede.           kamari.         eca.
   polyphony.uk     polyphony.uk    polyphony.uk
   (collective)     (collective)    (umbrella)
```

1. **Register your organization** via the Registry (`polyphony.uk/register`)
2. **Upload scores** to your organization's library
3. **Invite members** by email—they log in via Registry SSO
4. **Access multiple orgs** with one account (SSO across subdomains)

---

## Features

### For Choir Directors

| Feature               | Description                                          |
| --------------------- | ---------------------------------------------------- |
| **Private Library**   | Upload PDFs, organize by composer/season/voice part  |
| **Member Management** | Invite singers, assign roles (admin, librarian, etc) |
| **Roster & Events**   | Track attendance, manage rehearsals and concerts     |
| **Legal Safety**      | Built-in takedown process, Private Circle compliance |

### For Singers

| Feature         | Description                                            |
| --------------- | ------------------------------------------------------ |
| **Easy Access** | Log in once, access all your organizations             |
| **View Scores** | Browser-based PDF viewer—no app required               |
| **Multi-Choir** | Sing in multiple choirs? One login works everywhere    |

### For the Community

| Feature         | Description                                 |
| --------------- | ------------------------------------------- |
| **PD Catalog**  | Searchable index of Public Domain works     |
| **Open Source** | Inspect, modify, contribute to the codebase |
| **No Lock-in**  | Export your data anytime                    |

---

## Getting Started

### For Choir Directors

1. Visit [polyphony.uk/register](https://polyphony.uk/register)
2. Create your organization (choose subdomain)
3. Invite your members
4. Start uploading scores!

### For Singers

1. Receive an invite from your choir director
2. Click the link to visit your organization's subdomain
3. Log in with Google (SSO across all organizations)
4. Access your sheet music

### For Developers

See [Development](#development) section below.

---

## Legal Design

Polyphony is built with legal safety in mind:

- **Organization Responsibility**: Each choir controls and is responsible for their content
- **Registry Neutrality**: The Registry stores no files—queries Vault APIs for directory and PD catalog
- **Takedown Support**: Built-in copyright complaint mechanism
- **Private Circle** _(future)_: Planned sharing between trusted organizations follows EU "private use" guidelines

For full details, see [docs/LEGAL-FRAMEWORK.md](docs/LEGAL-FRAMEWORK.md).

> ⚠️ **Disclaimer**: This is not legal advice. Consult a lawyer for your jurisdiction.

---

## Technology

Built on a modern, proven stack:

| Component | Technology                 |
| --------- | -------------------------- |
| Framework | SvelteKit 2 + Svelte 5     |
| Platform  | Cloudflare Pages + Workers |
| Database  | Cloudflare D1 (SQLite)     |
| Storage   | D1 Chunked BLOBs (≤9.5MB)  |
| Styling   | Tailwind CSS v4            |
| Language  | TypeScript (strict)        |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical details.

---

## Roadmap

### ✅ Phase 0: Foundation _(Complete)_

- [x] Registry OAuth + JWKS authentication
- [x] EdDSA JWT token signing/verification
- [x] Vault registration and callback flow

### ✅ Phase 0.5: Schema V2 _(Complete)_

- [x] Multi-organization support (umbrellas + collectives)
- [x] Affiliation tracking between organizations
- [x] Multi-role member system (owner, admin, librarian, conductor, section_leader)
- [x] Voices & sections with primary assignments
- [x] Score library (works → editions → files)
- [x] Physical copy inventory tracking
- [x] Event scheduling with participation/RSVP
- [x] Season and event repertoire management

### 🚧 Phase 1: Core Features _(In Progress)_

- [x] Member invitations with name-based matching
- [x] Score upload and management (D1 chunked storage)
- [x] Takedown mechanism
- [x] SSO cookie across subdomains
- [ ] Roster view with attendance tracking
- [ ] Season repertoire UI
- [ ] PD Catalog (Registry queries Vault public API)

### Phase 2: Federation _(Deferred)_

- [ ] Handshake protocol between organizations
- [ ] Private Circle score sharing

### Phase 3: Enhanced Experience

- [ ] Public umbrella affiliates page
- [ ] Mobile-optimized UI
- [ ] Offline score access

---

## Development

### Prerequisites

- Node.js 20+
- pnpm 8+
- Cloudflare account (free tier works)

### Setup

```bash
# Clone the repository
git clone https://github.com/mitselek/polyphony.git
cd polyphony

# Install dependencies
pnpm install

# Start development server (Vault)
pnpm dev:vault

# Start development server (Registry)
pnpm dev:registry
```

### Project Structure

```
polyphony/
├── apps/
│   ├── registry/       # Registry application
│   └── vault/          # Vault application
├── packages/
│   └── shared/         # Shared types and utilities
└── docs/               # Documentation
```

### Running Tests

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e
```

---

## Documentation

| Document                                      | Description                    |
| --------------------------------------------- | ------------------------------ |
| [GLOSSARY.md](docs/GLOSSARY.md)               | Terminology definitions        |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)       | Technical architecture         |
| [schema/README.md](docs/schema/README.md) | D1 schema reference (Schema V2, split into modules)|
| [LEGAL-FRAMEWORK.md](docs/LEGAL-FRAMEWORK.md) | Legal design and compliance    |
| [CONCERNS.md](docs/CONCERNS.md)               | Open questions and decisions   |

---

## Contributing

We welcome contributions! Please read our contributing guidelines _(coming soon)_.

### Ways to Help

- Report bugs
- Suggest features
- Improve documentation
- Help curate the PD Catalog
- Submit pull requests

---

## License

[MIT](LICENSE)

Copyright (c) 2026 Institute of Beautiful Scores

---

## Acknowledgments

- Operated by [Institute of Beautiful Scores](https://scoreinstitute.eu)
- Inspired by the needs of Estonian choral communities
- Built with [SvelteKit](https://kit.svelte.dev/) and [Cloudflare](https://cloudflare.com/)
- Name "Polyphony" reflects multiple independent voices harmonizing together

---

_Polyphony: Many voices, one harmony._

<!-- Deployment refresh: 2026-02-13 -->
# test
