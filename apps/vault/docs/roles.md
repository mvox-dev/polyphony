# Vault Roles

Polyphony vaults use role-based access control (RBAC). **Members can have multiple roles.** Roles are **non-hierarchical** — each role grants specific permissions without inheriting from others.

A member's effective permissions are the **union** of all their roles' permissions.

**Note:** Being an authenticated member implicitly grants "singer" permissions (view/download scores). The explicit roles below grant _additional_ capabilities.

## Assignable Roles

### Owner

The vault owner manages governance and membership, but **not operational tasks** (scores, events). Owners can assign themselves operational roles as needed.

**Responsibilities:**

- Vault deployment and infrastructure decisions
- Inter-vault trust relationships (federation)
- Appointing admins, librarians, conductors and other roles
- Member management and role assignments

**Permissions:**

- `members:invite` - Send membership invitations
- `members:manage` - Change member roles, remove members
- `vault:delete` - Delete the entire vault
- `federation:manage` - Manage inter-vault relationships

**Constraints:**

- ⚠️ **Protected role**: At least one active owner must exist at all times
- Cannot remove your own owner role if you're the last owner
- Ownership transfer requires explicit handover

**To manage scores**: Assign yourself the `librarian` role  
**To manage events**: Assign yourself the `conductor` role

**Typical holder:** Choir board president, IT committee chair, or designated technical liaison

---

### Admin

Administrators manage membership and vault operations. **Does not manage scores** — that's the librarian's domain.

**Responsibilities:**

- Member management (invitations, role assignments)
- Handling copyright takedown requests
- Vault operational oversight

**Permissions:**

- `members:invite` - Send membership invitations
- `members:manage` - Change member roles, remove members (cannot assign/remove owner role)
- `takedowns:process` - Handle copyright claims

**Typical holder:** Choir conductor, board member, section leader

---

### Librarian

Librarians maintain the score collection. **Does not manage members** — that's the admin's domain.

**Responsibilities:**

- Uploading and organizing scores
- Maintaining score metadata (composer, arranger, license, etc.)
- Removing outdated or duplicate scores
- Curating the library

**Permissions:**

- `scores:upload` - Add new scores
- `scores:edit` - Modify score metadata
- `scores:delete` - Remove scores

**Typical holder:** Designated librarian, assistant conductor, active member with organizational skills

---

## Access Levels

### Member (authenticated)

Any authenticated vault member. **Not an assignable role** — implicit for all members.

**Permissions:**

- `scores:view` - See score listings
- `scores:download` - Download score files

**Typical holder:** All choir members

---

### Guest (unauthenticated)

Public access without authentication. Limited to openly licensed content.

**Permissions:**

- `scores:view` - See Public Domain score listings only
- `scores:download` - Download Public Domain scores only

**Use case:** Public-facing library for community sharing, discovery before joining

---

## Permission Matrix

| Permission        | Owner | Admin | Librarian | Conductor | Section Leader | Member | Guest |
| ----------------- | :---: | :---: | :-------: | :-------: | :------------: | :----: | :---: |
| scores:view       |  ✅   |  ✅   |    ✅     |    ✅     |       ✅       |   ✅   |  PD   |
| scores:download   |  ✅   |  ✅   |    ✅     |    ✅     |       ✅       |   ✅   |  PD   |
| scores:upload     |  ❌   |  ❌   |    ✅     |    ❌     |       ❌       |   ❌   |  ❌   |
| scores:delete     |  ❌   |  ❌   |    ✅     |    ❌     |       ❌       |   ❌   |  ❌   |
| members:invite    |  ✅   |  ✅   |    ❌     |    ❌     |       ❌       |   ❌   |  ❌   |
| members:manage    |  ✅   |  ✅   |    ❌     |    ❌     |       ❌       |   ❌   |  ❌   |
| vault:delete      |  ✅   |  ❌   |    ❌     |    ❌     |       ❌       |   ❌   |  ❌   |
| federation:manage |  ✅   |  ❌   |    ❌     |    ❌     |       ❌       |   ❌   |  ❌   |
| events:create     |  ❌   |  ❌   |    ❌     |    ✅     |       ❌       |   ❌   |  ❌   |
| events:manage     |  ❌   |  ❌   |    ❌     |    ✅     |       ❌       |   ❌   |  ❌   |
| events:delete     |  ❌   |  ❌   |    ❌     |    ✅     |       ❌       |   ❌   |  ❌   |
| attendance:record |  ❌   |  ❌   |    ❌     |    ✅     |       ✅       |   ❌   |  ❌   |

_PD = Public Domain scores only_

## Member Schema

Members have the following properties:

| Property     | Type     | Description                           |
| ------------ | -------- | ------------------------------------- |
| `id`         | TEXT     | Unique identifier                     |
| `email`      | TEXT     | Email address (unique, from Registry) |
| `name`       | TEXT     | Display name                          |
| `invited_by` | TEXT     | Reference to inviting member          |
| `joined_at`  | DATETIME | When member joined                    |

Roles are stored in a separate `member_roles` junction table, allowing multiple roles per member.

Voices and sections are stored in separate `member_voices` and `member_sections` junction tables (migration 0003).

## Role Assignment

### Initial Setup

When a vault is created, the first member automatically becomes **owner**.

### Invitations

- Owner can assign any roles: owner, admin, librarian, conductor, section_leader
- Admin can assign any roles except owner: admin, librarian, conductor, section_leader

### Role Changes

- Owners can add/remove any role from any member
- Admins can add/remove any role except owner from any member
- Cannot remove your own owner role if you're the last owner

### Common Role Combinations

| Combination           | Use Case                                                     |
| --------------------- | ------------------------------------------------------------ |
| owner                 | Board member focused on governance only                      |
| owner + admin         | Board chair who also manages daily operations                |
| owner + librarian     | Owner who also curates the score library                     |
| admin + librarian     | Choir manager handling both members and scores               |
| conductor + librarian | Conductor who also maintains the music library               |
| admin + conductor     | Choir director handling both membership and rehearsal events |

## Future Considerations

- **Event manager**: Future role for concert/rehearsal scheduling
- **Role expiry**: Time-limited elevated roles (e.g., guest librarian for a project)
- **Audit log**: Track role changes for accountability
- **Custom roles**: Allow vaults to define their own roles with custom permission sets
