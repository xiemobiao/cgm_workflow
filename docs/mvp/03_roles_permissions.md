# Roles and Permissions (MVP)

## Roles
- Admin
- PM
- Dev
- QA
- Release
- Support
- Viewer

## Permission Matrix
| Permission | Admin | PM | Dev | QA | Release | Support | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manage projects | Yes | No | No | No | No | No | No |
| Manage templates | Yes | No | No | No | No | No | No |
| Sync requirements | Yes | Yes | No | No | No | No | No |
| Edit workflow | Yes | Yes | Yes | Yes | No | No | No |
| Approve gates | Yes | No | No | Yes | Yes | No | No |
| Upload logs | Yes | No | Yes | Yes | No | Yes | No |
| View logs | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Manage incidents | Yes | No | No | No | No | Yes | No |
| Configure integrations | Yes | No | No | No | No | No | No |

## Audit Rules
- Gate approvals and overrides must be recorded
- Integration changes must be recorded
