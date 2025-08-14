# Pulse API Documentation

## Overview

Pulse provides a REST API for monitoring and managing Proxmox VE and PBS instances. All API endpoints are prefixed with `/api`.

## Authentication

Pulse supports multiple authentication methods that can be used independently or together:

### Password Authentication
Set a username and password for web UI access. Passwords are hashed with bcrypt (cost 12) for security.

```bash
# Systemd
sudo systemctl edit pulse-backend
# Add:
[Service]
Environment="PULSE_AUTH_USER=admin"
Environment="PULSE_AUTH_PASS=your-secure-password"

# Docker
docker run -e PULSE_AUTH_USER=admin -e PULSE_AUTH_PASS=your-password rcourtman/pulse:latest
```

Once set, users must login via the web UI. The password can be changed from Settings → Security.

### API Token Authentication
For programmatic API access and automation. Tokens can be generated and managed via the web UI (Settings → Security → API Token).

```bash
# Systemd
sudo systemctl edit pulse-backend
# Add:
[Service]
Environment="API_TOKEN=your-secure-token-here"

# Docker
docker run -e API_TOKEN=your-secure-token rcourtman/pulse:latest
```

### Using Authentication

```bash
# With API Token (header)
curl -H "X-API-Token: your-secure-token" http://localhost:7655/api/health

# With API Token (query parameter, for export/import)
curl "http://localhost:7655/api/export?token=your-secure-token"

# With session cookie (after login)
curl -b cookies.txt http://localhost:7655/api/health
```

### Security Features

When authentication is enabled, Pulse provides enterprise-grade security:

- **CSRF Protection**: All state-changing requests require a CSRF token
- **Rate Limiting**: 500 req/min general, 10 attempts/min for authentication
- **Account Lockout**: Locks after 5 failed attempts (15 minute cooldown)
- **Secure Sessions**: HttpOnly cookies, 24-hour expiry
- **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options, etc.
- **Audit Logging**: All security events are logged

### CSRF Token Usage

When using session authentication, include the CSRF token for state-changing requests:

```javascript
// Get CSRF token from cookie
const csrfToken = getCookie('pulse_csrf');

// Include in request header
fetch('/api/nodes', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});
```

## Core Endpoints

### Health Check
Check if Pulse is running and healthy.

```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": 1754995749,
  "uptime": 166.187561244
}
```

### Version Information
Get current Pulse version and build info.

```bash
GET /api/version
```

Response:
```json
{
  "version": "v4.2.1",
  "build": "release",
  "runtime": "go",
  "channel": "stable",
  "isDocker": false,
  "isDevelopment": false
}
```

### System State
Get complete system state including all nodes and their metrics.

```bash
GET /api/state
```

Response includes all monitored nodes, VMs, containers, storage, and backups.

## Monitoring Data

### Charts Data
Get time-series data for charts (CPU, memory, storage).

```bash
GET /api/charts
GET /api/charts?range=1h  # Last hour (default)
GET /api/charts?range=24h # Last 24 hours
GET /api/charts?range=7d  # Last 7 days
```

### Storage Information
Get detailed storage information for all nodes.

```bash
GET /api/storage/
GET /api/storage/<node-id>
```

### Storage Charts
Get storage usage trends over time.

```bash
GET /api/storage-charts
```

### Backup Information
Get backup information across all nodes.

```bash
GET /api/backups          # All backups
GET /api/backups/unified  # Unified view
GET /api/backups/pve      # PVE backups only
GET /api/backups/pbs      # PBS backups only
```

### Snapshots
Get snapshot information for VMs and containers.

```bash
GET /api/snapshots
```

## Configuration

### Node Management
Manage Proxmox VE and PBS nodes.

```bash
GET /api/config/nodes                    # List all nodes
POST /api/config/nodes                   # Add new node
PUT /api/config/nodes/<node-id>         # Update node
DELETE /api/config/nodes/<node-id>      # Remove node
POST /api/config/nodes/test-connection  # Test node connection
```

#### Add Node Example
```bash
curl -X POST http://localhost:7655/api/config/nodes \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{
    "type": "pve",
    "name": "My PVE Node",
    "host": "https://192.168.1.100:8006",
    "user": "monitor@pve",
    "password": "password",
    "verifySSL": false
  }'
```

### System Configuration
Get and update system configuration.

```bash
GET /api/config/system   # Get system config
POST /api/config/system  # Update system config
```

### API Token Management
Manage API tokens for programmatic access.

```bash
GET /api/system/api-token           # Get token status
GET /api/system/api-token?reveal=true  # Get actual token (auth required)
POST /api/system/api-token/generate # Generate new token
DELETE /api/system/api-token/delete # Remove token
```

### Export/Import Configuration
Backup and restore Pulse configuration with encryption.

```bash
POST /api/config/export  # Export encrypted config
POST /api/config/import  # Import encrypted config
```

**Authentication**: Requires one of:
- Active session (when logged in with password)
- API token via X-API-Token header
- ALLOW_UNPROTECTED_EXPORT=true (for unprotected instances)

**Export includes**: All nodes, credentials (encrypted), alerts, webhooks, email config, system settings, and guest metadata (custom console URLs)

## Notifications

### Email Configuration
Manage email notification settings.

```bash
GET /api/notifications/email          # Get email config
POST /api/notifications/email         # Update email config
POST /api/notifications/email/test    # Send test email
GET /api/notifications/email-providers # List email providers
```

### Webhook Configuration
Manage webhook notification endpoints.

```bash
GET /api/notifications/webhooks                    # List all webhooks
POST /api/notifications/webhooks                   # Create new webhook
PUT /api/notifications/webhooks/<id>               # Update webhook
DELETE /api/notifications/webhooks/<id>            # Delete webhook
POST /api/notifications/webhooks/test              # Test webhook
GET /api/notifications/webhook-templates           # Get service templates
```

#### Create Webhook Example
```bash
curl -X POST http://localhost:7655/api/notifications/webhooks \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{
    "name": "Discord Alert",
    "url": "https://discord.com/api/webhooks/xxx/yyy",
    "method": "POST",
    "service": "discord",
    "enabled": true
  }'
```

#### Custom Payload Template Example
```bash
curl -X POST http://localhost:7655/api/notifications/webhooks \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{
    "name": "Custom Webhook",
    "url": "https://my-service.com/webhook",
    "method": "POST",
    "service": "generic",
    "enabled": true,
    "template": "{\"alert\": \"{{.Level}}: {{.Message}}\", \"value\": {{.Value}}}"
  }'
```

#### Test Webhook
```bash
curl -X POST http://localhost:7655/api/notifications/webhooks/test \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{
    "name": "Test",
    "url": "https://example.com/webhook",
    "service": "generic"
  }'
```

### Alert Thresholds
Manage alert thresholds and overrides.

```bash
GET /api/notifications/thresholds            # Get thresholds
POST /api/notifications/thresholds           # Update thresholds
GET /api/notifications/thresholds/overrides  # Get overrides
POST /api/notifications/thresholds/overrides # Set overrides
```

### Alert History
View alert history and manage alerts.

```bash
GET /api/notifications/alerts         # Get recent alerts
POST /api/notifications/alerts/clear  # Clear alert history
```

## Auto-Registration

### Setup Script
Generate setup script for automatic node configuration.

```bash
POST /api/setup-script
```

Request:
```json
{
  "type": "pve",
  "host": "https://192.168.1.100:8006"
}
```

### Auto-Register Node
Register a node automatically (used by setup scripts).

```bash
POST /api/auto-register
```

```bash
curl -X POST http://localhost:7655/api/auto-register \
  -H "Content-Type: application/json" \
  -d '{
    "type": "pve",
    "host": "https://node.local:8006",
    "name": "Node Name",
    "username": "monitor@pam",
    "tokenId": "token-id",
    "tokenValue": "token-secret"
  }'
```


## Updates

### Check for Updates
Check if a new version is available.

```bash
GET /api/updates/check
```

### Apply Update
Download and apply an available update.

```bash
POST /api/updates/apply
```

### Update Status
Get current update operation status.

```bash
GET /api/updates/status
```

## WebSocket

Real-time updates are available via WebSocket connection.

```javascript
const ws = new WebSocket('ws://localhost:7655/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update received:', data);
};
```

The WebSocket broadcasts state updates every few seconds with the complete system state.

## Rate Limiting

Some endpoints have rate limiting:
- Export/Import: 5 requests per minute
- Test email: 10 requests per minute
- Update check: 10 requests per hour

## Error Responses

All endpoints return standard HTTP status codes:
- `200 OK` - Success
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid API token
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limited
- `500 Internal Server Error` - Server error

Error response format:
```json
{
  "error": "Error message description"
}
```

## Examples

### Full Example: Monitor a New Node

```bash
# 1. Test connection to node
curl -X POST http://localhost:7655/api/config/nodes/test-connection \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{
    "type": "pve",
    "host": "https://192.168.1.100:8006",
    "user": "root@pam",
    "password": "password"
  }'

# 2. Add the node if test succeeds
curl -X POST http://localhost:7655/api/config/nodes \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your-token" \
  -d '{
    "type": "pve",
    "name": "pve-node-1",
    "host": "https://192.168.1.100:8006",
    "user": "root@pam",
    "password": "password",
    "verifySSL": false
  }'

# 3. Get monitoring data
curl -H "X-API-Token: your-token" http://localhost:7655/api/state

# 4. Get chart data
curl -H "X-API-Token: your-token" http://localhost:7655/api/charts?range=1h
```

### PowerShell Example

```powershell
# Set variables
$apiUrl = "http://localhost:7655/api"
$apiToken = "your-secure-token"
$headers = @{ "X-API-Token" = $apiToken }

# Check health
$health = Invoke-RestMethod -Uri "$apiUrl/health" -Headers $headers
Write-Host "Status: $($health.status)"

# Get all nodes
$nodes = Invoke-RestMethod -Uri "$apiUrl/config/nodes" -Headers $headers
$nodes | ForEach-Object { Write-Host "Node: $($_.name) - $($_.status)" }
```

### Python Example

```python
import requests

API_URL = "http://localhost:7655/api"
API_TOKEN = "your-secure-token"
headers = {"X-API-Token": API_TOKEN}

# Check health
response = requests.get(f"{API_URL}/health", headers=headers)
health = response.json()
print(f"Status: {health['status']}")

# Get monitoring data
response = requests.get(f"{API_URL}/state", headers=headers)
state = response.json()
for node in state.get("nodes", []):
    print(f"Node: {node['name']} - {node['status']}")
```