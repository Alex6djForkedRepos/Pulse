# Docker Deployment Guide

## Quick Start

```bash
docker run -d \
  --name pulse \
  -p 7655:7655 \
  -v pulse_data:/data \
  --restart unless-stopped \
  rcourtman/pulse:latest
```

1. Access at `http://your-server:7655`
2. **Complete the mandatory security setup** on first access
3. Save your credentials - they won't be shown again!

## First-Time Setup

When you first access Pulse, you'll see the security setup wizard:

1. **Create Admin Account**
   - Choose a username (default: admin)
   - Set a password or use the generated one
   - An API token is automatically generated

2. **Save Your Credentials**
   - Download or copy them immediately
   - They won't be shown again after setup

3. **Access Dashboard**
   - Click "Continue to Login"
   - Use your new credentials to sign in

## Docker Compose

### Basic Setup (Recommended for First-Time Users)

```yaml
services:
  pulse:
    image: rcourtman/pulse:latest
    container_name: pulse
    ports:
      - "7655:7655"
    volumes:
      - pulse_data:/data
    restart: unless-stopped

volumes:
  pulse_data:
```

Then:
1. Run: `docker compose up -d`
2. Access: `http://your-server:7655`
3. Complete the security setup wizard

### Pre-Configured Authentication (Advanced)

If you want to skip the setup wizard, you can pre-configure authentication:

```yaml
services:
  pulse:
    image: rcourtman/pulse:latest
    container_name: pulse
    ports:
      - "7655:7655"
    volumes:
      - pulse_data:/data
    environment:
      PULSE_AUTH_USER: 'admin'
      # Generate hash: docker run --rm -it rcourtman/pulse:latest pulse hash-password
      PULSE_AUTH_PASS: '$$2a$$12$$...'  # IMPORTANT: Use $$ in docker-compose.yml!
      API_TOKEN: 'your-48-char-hex-token'  # Generate: openssl rand -hex 24
    restart: unless-stopped

volumes:
  pulse_data:
```

⚠️ **Critical for docker-compose.yml**: 
- Bcrypt hashes contain `$` characters
- Docker Compose treats `$` as variable expansion
- **You MUST escape them as `$$`** in docker-compose.yml
- Example: `$2a$12$abc...` becomes `$$2a$$12$$abc...`

### Using External .env File (Cleaner Approach)

Create `.env` file (no escaping needed here):
```env
PULSE_AUTH_USER=admin
PULSE_AUTH_PASS=$2a$12$YourHashHere...
API_TOKEN=your-48-char-hex-token
```

Docker-compose.yml:
```yaml
services:
  pulse:
    image: rcourtman/pulse:latest
    container_name: pulse
    ports:
      - "7655:7655"
    volumes:
      - pulse_data:/data
    env_file: .env
    restart: unless-stopped

volumes:
  pulse_data:
```

## Generating Credentials

### Password Hash
```bash
# Interactive password prompt
docker run --rm -it rcourtman/pulse:latest pulse hash-password

# Or with password as argument
docker run --rm rcourtman/pulse:latest pulse hash-password YourPassword123
```

### API Token
```bash
# Generate 48-character hex token
openssl rand -hex 24
```

## Data Persistence

All configuration and data is stored in `/data`:
- `.env` - Authentication credentials (if using setup wizard)
- `*.enc` - Encrypted node credentials
- `*.json` - Configuration files
- `.encryption.key` - Auto-generated encryption key

### Backup
```bash
docker run --rm -v pulse_data:/data -v $(pwd):/backup alpine tar czf /backup/pulse-backup.tar.gz -C /data .
```

### Restore
```bash
docker run --rm -v pulse_data:/data -v $(pwd):/backup alpine tar xzf /backup/pulse-backup.tar.gz -C /data
```

## Network Discovery

Discovery runs automatically but may detect Docker's internal network.

To configure the correct subnet:
1. Let Pulse start and complete setup
2. Go to Settings → System
3. Set Discovery Subnet (e.g., `192.168.1.0/24`)
4. Save and restart container

Or set via environment:
```yaml
environment:
  DISCOVERY_SUBNET: "192.168.1.0/24"
```

## Common Issues

### Can't Access After Upgrade
If upgrading from pre-v4.5.0:
1. You'll see the security setup wizard
2. Complete the setup - your nodes are preserved
3. Use your new credentials to login

### Lost Credentials
If you've lost your credentials:
```bash
# Stop container
docker stop pulse

# Remove auth configuration
docker exec pulse rm /data/.env

# Restart and go through setup again
docker restart pulse
```

### Setup Wizard Not Showing
This happens if you have auth environment variables set:
1. Remove environment variables from docker-compose.yml
2. Recreate the container
3. Access the UI to see the setup wizard

### Password Hash Issues
Common problems:
- **Hash truncated**: Must be exactly 60 characters
- **Not escaped in docker-compose**: Use `$$` instead of `$`
- **Wrong format**: Must start with `$2a$`, `$2b$`, or `$2y$`

## Security Best Practices

1. **Always use HTTPS in production** - Use a reverse proxy (nginx, Traefik, Caddy)
2. **Strong passwords** - Use the generated password or 16+ characters
3. **Protect API tokens** - Treat them like passwords
4. **Regular backups** - Backup the `/data` volume regularly
5. **Network isolation** - Don't expose port 7655 directly to the internet

## Environment Variables Reference

### Authentication
| Variable | Description | Example |
|----------|-------------|---------|
| `PULSE_AUTH_USER` | Admin username | `admin` |
| `PULSE_AUTH_PASS` | Bcrypt password hash | `$2a$12$...` (60 chars) |
| `API_TOKEN` | API access token | 48 hex characters |

### Network
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Web UI port | `7655` |
| `ALLOWED_ORIGINS` | CORS origins | Same-origin only |
| `DISCOVERY_SUBNET` | Network to scan | Auto-detect |
| `CONNECTION_TIMEOUT` | Connection timeout (seconds) | `10` |
| `LOG_LEVEL` | Logging verbosity | `info` |

### System
| Variable | Description | Default |
|----------|-------------|---------|
| `TZ` | Timezone | `UTC` |

## Advanced Configuration

### Custom Network
```yaml
services:
  pulse:
    image: rcourtman/pulse:latest
    networks:
      - monitoring
    # ... rest of config

networks:
  monitoring:
    driver: bridge
```

### Resource Limits
```yaml
services:
  pulse:
    image: rcourtman/pulse:latest
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    # ... rest of config
```

### Health Check
```yaml
services:
  pulse:
    image: rcourtman/pulse:latest
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:7655/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    # ... rest of config
```