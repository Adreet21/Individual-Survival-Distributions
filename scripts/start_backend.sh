#!/bin/bash

# This script automates the process of starting the backend development environment.
# This script also assumes your virtual environment is under the directory "venv"

# Exit the script immediately if any command fails
set -e

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies from requirements.txt..."
pip install -r requirements.txt

echo "Changing directory to 'isd'..."
cd isd

echo "Starting the Django development server on 0.0.0.0:8000..."
python3 manage.py runserver 0.0.0.0:8000
