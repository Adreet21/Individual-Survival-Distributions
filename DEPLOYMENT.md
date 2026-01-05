# Production Deployment Guide

## Overview

This application will be deployed at **https://isd.srv.ualberta.ca/** and is currently deployed at **http://[2605:fd00:4:1001:f816:3eff:fec6:3fd9]** with the following architecture:

- **Backend**: Django + Gunicorn + Nginx (API and admin)
- **Frontend**: React/Vite (static build served by Nginx)
- **ML API**: Python Flask service
- **Database**: Supabase PostgreSQL
- **Server**: Ubuntu VM at `[2605:fd00:4:1001:f816:3eff:fec6:3fd9]`

### Quick Deployment

For a complete production deployment, run:

```bash
cd /home/ubuntu/f25project-DeptofComputingScience
./deploy_production.sh
```

This script will:
1. Install Python dependencies
2. Run database migrations
3. Collect Django static files
4. Deploy and restart Django (Gunicorn) service
5. Set up and start ML API service
6. Build and deploy the React frontend
7. Restart Nginx

### Setting Up SSL/HTTPS

**After DNS is configured and working**, enable HTTPS:

```bash
cd /home/ubuntu/f25project-DeptofComputingScience
./setup_ssl.sh
```

This will:
1. Install Certbot (if not already installed)
2. Obtain SSL certificate from Let's Encrypt
3. Configure Nginx for HTTPS
4. Enable SSL redirect in Django
5. Auto-configure certificate renewal

## Service Management

### Systemd Services

Three systemd services manage the application:

#### 1. Django Backend (`isd-django.service`)

```bash
# Start/Stop/Restart
sudo systemctl start isd-django.service
sudo systemctl stop isd-django.service
sudo systemctl restart isd-django.service

# Check status
sudo systemctl status isd-django.service

# View logs
tail -f ~/.logs/gunicorn-error.log
tail -f ~/.logs/gunicorn-access.log
```

#### 2. ML API (`isd-ml-api.service`)

```bash
# Start/Stop/Restart
sudo systemctl start isd-ml-api.service
sudo systemctl stop isd-ml-api.service
sudo systemctl restart isd-ml-api.service

# Check status
sudo systemctl status isd-ml-api.service

# View logs
sudo journalctl -u isd-ml-api.service -f
```

#### 3. Nginx (`nginx.service`)

```bash
# Start/Stop/Restart
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx  # Reload config without downtime

# Check status
sudo systemctl status nginx

# Test configuration
sudo nginx -t

# View logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Service Auto-Start

All services are configured to start automatically on system boot:

```bash
# Verify auto-start is enabled
sudo systemctl is-enabled isd-django.service
sudo systemctl is-enabled isd-ml-api.service
sudo systemctl is-enabled nginx

# Enable if needed
sudo systemctl enable isd-django.service
sudo systemctl enable isd-ml-api.service
sudo systemctl enable nginx
```

## Development vs Production

### Local Development (start_all.sh)

For local development, use the existing script:

```bash
./start_all.sh
```

This runs:
- Django development server on port 8000
- Vite dev server with hot reload on port 5173
- ML API in development mode

**Use this for**: Development, testing, debugging

### Production Deployment (deploy_production.sh)

For production deployment:

```bash
./deploy_production.sh
```

This runs:
- Django via Gunicorn (WSGI) with multiple workers
- React frontend as static build served by Nginx
- ML API as systemd service
- All services behind Nginx reverse proxy

**Use this for**: Production deployment, staging, public access

## Configuration Files

### Environment Variables

**File**: `/home/ubuntu/f25project-DeptofComputingScience/isd/.env`

Key settings:
- `DEBUG=False` - Production mode
- `ALLOWED_HOSTS` - Domain and IP addresses
- `SECRET_KEY` - Django secret (never commit!)
- `DB_*` - Database credentials
- `CORS_ALLOWED_ORIGINS` - Frontend domains
- `DISABLE_SSL_REDIRECT` - Set to `False` after SSL setup

### Nginx Configuration

**File**: `/etc/nginx/sites-available/isd`

Contains:
- Domain configuration
- SSL/TLS settings (when enabled)
- Static file serving
- Proxy to Django/Gunicorn
- Security headers

After editing, test and reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Systemd Service Files

- **Django**: `/etc/systemd/system/isd-django.service`
- **ML API**: `/etc/systemd/system/isd-ml-api.service`

After editing service files:
```bash
sudo systemctl daemon-reload
sudo systemctl restart <service-name>
```

## Updating the Application

### After Code Changes

1. Pull latest code:
```bash
cd /home/ubuntu/f25project-DeptofComputingScience
git pull
```

2. Redeploy:
```bash
./deploy_production.sh
```

### After Django Model Changes

If database models changed:
```bash
cd /home/ubuntu/f25project-DeptofComputingScience/isd
source ../venv/bin/activate
python manage.py makemigrations
python manage.py migrate
sudo systemctl restart isd-django.service
```

### After Frontend Changes

Rebuild and deploy frontend:
```bash
cd /home/ubuntu/f25project-DeptofComputingScience/frontend
npm run build
sudo rm -rf /var/www/isd-frontend/*
sudo cp -r dist/* /var/www/isd-frontend/
sudo systemctl reload nginx
```

## Troubleshooting

### Django Not Working

```bash
# Check service status
sudo systemctl status isd-django.service

# Check logs
tail -f ~/.logs/gunicorn-error.log

# Check socket file exists
ls -la /home/ubuntu/f25project-DeptofComputingScience/isd/isd.sock

# Restart service
sudo systemctl restart isd-django.service
```

### Nginx 502 Bad Gateway

This usually means Nginx can't connect to Django:

```bash
# Check Nginx error log
sudo tail -f /var/log/nginx/error.log

# Verify Django service is running
sudo systemctl status isd-django.service

# Check socket permissions
ls -la /home/ubuntu/f25project-DeptofComputingScience/isd/isd.sock

# Restart both services
sudo systemctl restart isd-django.service
sudo systemctl restart nginx
```

### Frontend Not Loading

```bash
# Check if files exist
ls -la /var/www/isd-frontend/

# Rebuild frontend
cd /home/ubuntu/f25project-DeptofComputingScience/frontend
npm run build
sudo cp -r dist/* /var/www/isd-frontend/

# Check Nginx config
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Check auto-renewal
sudo systemctl status certbot.timer
```

## Monitoring

### Health Checks

```bash
# Check if website is accessible
curl -I http://localhost/admin/
curl -I http://199.116.235.132/admin/
curl -I http://isd.srv.ualberta.ca/admin/

# Check all services
sudo systemctl status isd-django.service nginx isd-ml-api.service
```

### Log Locations

- **Django/Gunicorn**: `~/.logs/gunicorn-*.log`
- **Nginx Access**: `/var/log/nginx/access.log`
- **Nginx Error**: `/var/log/nginx/error.log`
- **ML API**: `sudo journalctl -u isd-ml-api.service`
- **System**: `sudo journalctl -xe`

### Disk Space

```bash
# Check disk usage
df -h

# Check log sizes
du -sh ~/.logs/*
du -sh /var/log/nginx/*

# Clean old logs if needed
sudo find /var/log/nginx -name "*.gz" -mtime +30 -delete
```

## Support

For issues:
1. Check logs (see Troubleshooting section)
2. Verify all services are running
3. Check DNS and firewall configuration
4. Review this documentation

## Quick Reference

```bash
# Deploy everything
./deploy_production.sh

# Enable SSL (after DNS configured)
./setup_ssl.sh

# Restart Django
sudo systemctl restart isd-django.service

# Reload Nginx config
sudo nginx -t && sudo systemctl reload nginx

# View Django logs
tail -f ~/.logs/gunicorn-error.log

# View all service status
sudo systemctl status isd-django.service nginx isd-ml-api.service
```
