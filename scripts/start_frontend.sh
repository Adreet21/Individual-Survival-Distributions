#!/bin/bash

# This script automates the process of starting the frontend development environment.
# It navigates into the 'frontend' directory, installs the necessary
# node packages, and then starts the development server.

# Exit the script immediately if any command fails
set -e

echo "Changing directory to 'frontend'..."
cd frontend

echo "Installing dependencies with npm..."
npm install

echo "Starting the development server with 'npm run dev'..."
npm run dev