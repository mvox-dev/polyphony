# i18n Message Files

Translation files for the Vault application, using [Inlang](https://inlang.com) message format with [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs).

## Supported locales

| File      | Language       |
| --------- | -------------- |
| `en.json` | English (base) |
| `et.json` | Estonian       |
| `lv.json` | Latvian        |
| `uk.json` | Ukrainian      |

## Key naming conventions

### Prefix rules (plural vs singular)

| Prefix form                                                             | When to use                                                   | Examples                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| **Plural** (`members_`, `events_`, `editions_`, `seasons_`, `invites_`) | List/management pages, filters, empty states, toasts, errors  | `members_manage_title`, `events_filter_all`  |
| **Singular** (`member_`, `event_`, `edition_`, `season_`, `invite_`)    | Detail/create/edit pages, forms, individual entity properties | `member_profile_title`, `event_create_title` |

Special prefixes:

- `add_roster_` — Add roster member form
- `invite_link_` — Invite link display component
- `settings_` — All settings (not a plural/singular case). Sub-prefixes: `settings_voices_*`, `settings_sections_*`, `settings_entity_*`, `settings_lang_*`, `settings_locale_*`, `settings_tz_*`

### Standard suffixes

| Suffix                                   | Meaning                       | Example                     |
| ---------------------------------------- | ----------------------------- | --------------------------- |
| `_title`                                 | Page or modal heading         | `members_manage_title`      |
| `_description`                           | Explanatory subheading        | `roster_description`        |
| `_label`                                 | Form field label              | `edition_name_label`        |
| `_placeholder`                           | Input placeholder             | `works_search_placeholder`  |
| `_help`                                  | Guidance text below a field   | `add_roster_voices_help`    |
| `_tooltip`                               | Hover tooltip                 | `add_roster_voices_tooltip` |
| `_btn`                                   | Context-specific button       | `members_add_roster_btn`    |
| `_link`                                  | Navigation link text          | `member_back_link`          |
| `_section`                               | Section heading within a page | `event_datetime_section`    |
| `_badge`                                 | Badge/tag label               | `invites_expired_badge`     |
| `_error_*`                               | Error message                 | `members_error_update_role` |
| `_toast_*`                               | Toast notification (success)  | `members_toast_role_added`  |
| `_confirm`                               | Confirmation prompt           | `members_confirm_remove`    |
| `_empty`                                 | Empty state (no items exist)  | `events_empty`              |
| `_no_match`                              | Search returned nothing       | `works_no_match`            |
| `_no_*`                                  | Specific absence              | `member_no_roles`           |
| `_modal_title_add` / `_modal_title_edit` | Add/edit modal headings       | `works_modal_title_add`     |
| `_filter_*`                              | Filter options                | `editions_type_filter_all`  |
| `_stats_*`                               | Statistics labels             | `roster_stats_events`       |

### Key structure

```text
{prefix}_{noun}_{suffix}
```

Examples: `member_nickname_label`, `edition_name_placeholder`, `events_filter_all`

For toast/error messages: `{prefix}_toast_{what}` or `{prefix}_error_{what}`

## Groups and ordering

Keys are organized into groups by semantic feature area. Each group contains one or more related prefixes.

| Group         | Prefixes                                                                       | Description                                                      |
| ------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Actions       | `actions_*`                                                                    | Shared action/button labels                                      |
| Auth          | `auth_*`                                                                       | Authentication messages                                          |
| Common        | `common_*`                                                                     | Generic UI text                                                  |
| Copyright     | `copyright_*`                                                                  | Takedown request page                                            |
| Events        | `event_*`, `events_*`                                                          | Event creation and listing                                       |
| Guides        | `guides_*`                                                                     | User guides                                                      |
| Invitations   | `invite_*`, `invite_link_*`, `invites_*`                                       | Invitation flow, link component, pending list                    |
| Landing       | `landing_*`                                                                    | Public landing page                                              |
| Library       | `collection_*`, `edition_*`, `editions_*`, `library_*`, `missing_*`, `works_*` | Works, editions, inventory, collection reminders, missing copies |
| Login         | `login_*`                                                                      | Login/magic link flow                                            |
| Members       | `add_roster_*`, `member_*`, `members_*`                                        | Member list, detail, add roster                                  |
| Navigation    | `nav_*`                                                                        | Sidebar/header nav                                               |
| Registration  | `register_*`                                                                   | Choir registration                                               |
| Roles         | `roles_*`                                                                      | Role name labels                                                 |
| Roster        | `roster_*`                                                                     | Participation/attendance                                         |
| Seasons       | `season_*`, `seasons_*`                                                        | Season management                                                |
| Settings      | `settings_*`                                                                   | Org/member settings                                              |
| Welcome       | `welcome_*`                                                                    | Post-registration welcome                                        |
| Miscellaneous | `no_*`, any ungrouped                                                          | Catch-all                                                        |

### Ordering rules

1. `$schema` stays as the very first entry
2. Groups sorted **alphabetically** by group name (Actions first, Miscellaneous always last)
3. Within each group, keys sorted **alphabetically** by full key name
4. Blank line between groups for visual separation
5. All 4 language files maintain **identical key ordering**

## Adding new keys

1. Choose a prefix following the plural/singular convention
2. Choose a suffix from the standard suffixes table
3. Add the key with its translation in all 4 language files
4. Run `node sort-messages.mjs` to auto-sort all files

## Maintenance

Run the sort script to enforce ordering after adding or renaming keys:

```bash
node apps/vault/messages/sort-messages.mjs
```

The script groups and alphabetically sorts all keys, writes back with blank-line separators, and reports key counts per group.
