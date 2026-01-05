#!/bin/bash

# SSL Setup Script using Let's Encrypt (Certbot)
# This script sets up HTTPS for isd.srv.ualberta.ca

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

DOMAIN="isd.srv.ualberta.ca"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}SSL Certificate Setup for $DOMAIN${NC}"
echo -e "${CYAN}========================================${NC}\n"

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Certbot not found. Installing...${NC}"
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
fi

# Obtain SSL certificate
echo -e "${GREEN}Obtaining SSL certificate from Let's Encrypt...${NC}"
echo -e "${YELLOW}This will require domain validation.${NC}"
echo -e "${YELLOW}Make sure DNS is properly configured!${NC}\n"

sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || {
    echo -e "${RED}Failed to obtain certificate${NC}"
    echo -e "${YELLOW}Common issues:${NC}"
    echo -e "  1. DNS not configured correctly"
    echo -e "  2. Firewall blocking port 80/443"
    echo -e "  3. Domain not pointing to this server"
    exit 1
}

# Update Django settings to enable SSL
echo -e "\n${GREEN}Updating Django settings for SSL...${NC}"
cd /home/ubuntu/f25project-DeptofComputingScience/isd

# Remove DISABLE_SSL_REDIRECT from .env
if grep -q "DISABLE_SSL_REDIRECT=True" .env; then
    sed -i '/DISABLE_SSL_REDIRECT=True/d' .env
    echo -e "${GREEN}✓ SSL redirect enabled${NC}"
fi

# Update CORS and CSRF to use HTTPS
sed -i "s|http://isd.srv.ualberta.ca|https://isd.srv.ualberta.ca|g" .env
sed -i "s|VITE_API_BASE_URL=http://localhost:8000|VITE_API_BASE_URL=https://isd.srv.ualberta.ca|g" .env

# Restart services
echo -e "\n${GREEN}Restarting services...${NC}"
sudo systemctl restart isd-django.service
sudo systemctl reload nginx

echo -e "\n${CYAN}========================================${NC}"
echo -e "${GREEN}SSL Setup Complete!${NC}"
echo -e "${CYAN}========================================${NC}\n"

echo -e "${GREEN}Your site is now available at:${NC}"
echo -e "${CYAN}https://$DOMAIN${NC}\n"

echo -e "${YELLOW}Note: Let's Encrypt certificates auto-renew via certbot.timer${NC}"
echo -e "${YELLOW}Check renewal status: sudo certbot renew --dry-run${NC}\n"
