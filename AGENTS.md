# Pulse Development - Instructions for AI Agents

**FOR: Codex, Claude Code, and all AI coding assistants**

---

## ⚠️ CRITICAL: Multi-AI Shared Environment

This is a **shared development environment** where multiple AI assistants work **sequentially** on the same codebase via tmux/ttyd.

**Before making ANY changes:**

```bash
# 1. Check service health
systemctl status pulse-backend

# 2. Check API health
curl -s http://localhost:7655/api/health

# 3. Check watchdog status
cat /opt/pulse/.ai-coordination/health.status
# Expected: HEALTHY_<timestamp>
# Warning states: SERVICE_FAILED, API_FAILED, GIT_CORRUPTED

# 4. Check for git issues
ls /opt/pulse/.ai-coordination/git.status 2>/dev/null
```

---

## 🔄 Self-Healing System (DO NOT OVERRIDE)

A **watchdog runs every 2 minutes** to automatically fix common issues:

- ✅ Auto-restart service if crashed (systemd)
- ✅ Auto-restart if API unresponsive
- ✅ Auto-fix git corruption (fetch from remote)
- ✅ Log all events: `/var/log/pulse-watchdog.log`

**Expected behavior:**
- **Pulse is ALWAYS running** on port 7655
- Service auto-restarts within 2 minutes if crashed
- Git corruption auto-recovers from remote

**If you find issues:**
1. Check if watchdog already handled it: `tail /var/log/pulse-watchdog.log`
2. Wait 2 minutes for auto-recovery
3. Manual restart: `systemctl restart pulse-backend`

---

## 📋 Project Structure

- **Language**: Go (backend) + SolidJS (frontend)
- **Main binary**: `/opt/pulse/pulse`
- **Frontend**: `/opt/pulse/frontend-modern/` (build → `dist/`)
- **Service**: `pulse-backend.service` (systemd, port 7655)
- **Development**: Use `./scripts/hot-dev.sh` (ports 7655 frontend, 7656 backend)

---

## 🛠️ Common Tasks

### Build and Deploy
```bash
# Build backend
go build -v ./cmd/pulse

# Build frontend
cd frontend-modern && npm run build

# Restart service
sudo systemctl restart pulse-backend
```

### Mock Mode - THE CORRECT WAY ⚠️

**IMPORTANT: ALWAYS use the toggle script - it handles EVERYTHING automatically:**

```bash
# Switch to mock data (seamless, auto-restarts backend)
npm run mock:on

# Switch to production data (seamless, auto-restarts backend)
npm run mock:off

# Check current mode
npm run mock:status
```

**Or use the script directly:**
```bash
./scripts/toggle-mock.sh on     # Mock mode
./scripts/toggle-mock.sh off    # Production mode
./scripts/toggle-mock.sh status # Check status
```

**What the toggle script does automatically:**
1. ✅ Updates `PULSE_MOCK_MODE` in `/opt/pulse/mock.env`
2. ✅ Exports all environment variables properly
3. ✅ Kills existing backend process gracefully
4. ✅ Rebuilds backend if needed
5. ✅ Restarts backend with correct environment
6. ✅ Frontend stays running and auto-reconnects

**Verify which mode is active:**
```bash
# Check configuration
npm run mock:status

# Verify what the API is actually returning
curl -s http://localhost:7655/api/state | jq '.nodes[] | {id: .id, node: .node}'

# Mock mode shows: "mock-cluster-pve1", "mock-cluster-pve2", etc.
# Production shows: "delly.lan-delly", "delly.lan-minipc", "pi-pi", etc.
```

**❌ NEVER do these things:**
- ❌ Manually edit `mock.env` without using the toggle script
- ❌ Just restart the service without updating environment variables
- ❌ Kill processes with `kill -9` (breaks cleanup)
- ❌ Restart hot-dev script to switch modes (unnecessary)

**Mock mode configuration** (`/opt/pulse/mock.env`):
- `PULSE_MOCK_MODE=true/false` - Enable/disable
- `PULSE_MOCK_NODES=7` - Number of mock nodes
- `PULSE_MOCK_VMS_PER_NODE=5` - Average VMs per node
- `PULSE_MOCK_LXCS_PER_NODE=8` - Average containers per node
- `PULSE_MOCK_RANDOM_METRICS=true` - Enable metric fluctuations
- `PULSE_MOCK_STOPPED_PERCENT=20` - Percentage of stopped guests

**Use the toggle script to change any of these settings** - it ensures proper backend restart.

### Testing
```bash
# Check health
curl http://localhost:7655/api/health

# View logs
journalctl -u pulse-backend -f
tail -f /var/log/pulse-watchdog.log
```

### Issue / PR Comments

- Keep comments short and factual; no exclamation marks.
- Avoid first-person plural pronouns ("we", "us").
- Focus on the user-facing outcome or fix reference only when necessary.

---

## 📐 Code Standards

### Backend (Go)
- **Two monitoring paths**: cluster (`monitor.go`) + standalone (`monitor_optimized.go`)
- **When adding VM/container data**: Update BOTH paths
- **Data flow**: Backend models → Frontend models → Converters → API
- See: `/opt/pulse/.claude/CLAUDE.md` for architecture details

### Frontend (SolidJS)
- **Router-based**: Using `@solidjs/router`
- **WebSocket**: Global store pattern
- **Dark mode**: Persisted in localStorage
- See: `/opt/pulse/docs/frontend-style-guide.md`

---

## 🚨 Important Notes

1. **Don't assume clean state** - other AIs have worked on this code
2. **Check health status first** - environment may have self-healed issues
3. **Production runs on port 7655** (NOT 7656 - that's hot-dev backend only)
4. **Git operations** - May encounter corruption; watchdog auto-fixes it
5. **Changes persist** - Your work affects future AI sessions

---

## 📖 Full Documentation

- **Comprehensive guide**: `/opt/pulse/.claude/CLAUDE.md`
- **Development docs**: `/opt/pulse/docs/development/`
- **API documentation**: `/opt/pulse/docs/API.md`
- **Mock mode guide**: `/opt/pulse/docs/development/MOCK_MODE.md`

---

## 🏗️ Environment Details

- **Host**: LXC container `debian-go` on Proxmox `delly`
- **User**: `pulse`
- **Access**: ttyd/tmux on 192.168.0.123
- **Service**: `pulse-backend.service` (enabled, always-on)
- **Watchdog**: `/opt/pulse/scripts/pulse-watchdog.sh` (cron every 2 min)

---

## 📝 2025-10-10 Home Assistant Battery Incident Summary

- **Context**: This Home Assistant automation work is a side project on the Proxmox host and does **not** touch the Pulse codebase. Treat it separately from any Pulse development tasks.
- **Scope**: Investigated battery under-charge; confirmed five Home Assistant restarts (00:23–00:33 BST) caused by malformed `automations.yaml`. Restored automation backups and replaced every `pyscript.solis_set_charge_current` call with `number.set_value` targeting `number.solis_rhi_time_charging_charge_current`. Invalid YAML attributes (`source:` under `number.set_value`) were removed.
- **Validation**: Triggered key automations via API (`automation.free_electricity_session_maximum_charging`, `automation.intelligent_dispatch_solis_battery_charging`, `automation.emergency_low_soc_protection`, EV guard hold/refresh/release). Observed correct current adjustments (100 A for car slots/free session, 25 A emergency, 5 A guard) and system log entries confirming execution.
- **Slots**: Automations call `pyscript.solis_set_time_slots` before altering current; default overnight window restored to `23:30–05:30`. Check `sensor.solis_charge_summary` for latest `set_time_slots` events if you need proof of slot updates.
- **Backups**: Pre-cleanup copy at `var/lib/docker/volumes/hass_config/_data/automations.yaml.codex_source_cleanup_20251010_090205`. Do **not** delete.
- **Access**: Home Assistant runs inside LXC VMID 101 on `delly`. Use `ssh delly` then e.g. `pct exec 101 -- bash -lc '...'`. API token for automation reload/tests lives at `/tmp/ha_token.txt` inside the LXC (chmod 600). When calling the API: `TOKEN=$(cat /tmp/ha_token.txt); curl -H "Authorization: Bearer $TOKEN" ...`.
- **State Reset**: After tests, charge current returned to 25 A and EV guard sensor is `off`. Monitor next Octopus dispatch/off-peak window to confirm real-world behaviour matches tests.
