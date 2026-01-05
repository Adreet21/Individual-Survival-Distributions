# Fall 2025 EZ Survival Project

DO NOT use this branch. Only meant for merging through PRs.

## Team 

| Name | CCID | Email |
|-|-|-|
| Advi Islam | sahi2 | sahi2@ualberta.ca |
| Alex Ho | amho | amho@ualberta.ca |
| Excel Ojeifo | eojeifo | eojeifo@ualberta.ca | 
| Hoang Nguyen | hhn1 | hhn1@ualberta.ca |
| Selena Chainani | chainani | chainani@ualberta.ca |
| Shahmeer Rahman | syedsha2 | syedsha2@ualberta.ca |
| Yaatheshini Ashok Kumar | yaathesh | yaathesh@ualberta.ca | 

## Clients
Dept. of Computing Science

| Name | Email |
|-|-|
| Russ Greiner | rgreiner@ualberta.ca |
| Nasimeh Asgarian | asgarian@ualberta.ca |

## TA
| Name | Email |
|-|-|
| Amir Salimi | asalimi@ualberta.ca |

## Instructions

### Documentation Edits

1. NEVER TOUCH the gh-deploy branch
2. Edit the md files to edit the documentation, commit changes to git, then run `mkdocs gh-deploy`
3. Check `https://ualberta-cmput401.github.io/f25project-DeptofComputingScience/`

1. **Clone and setup**
   ```bash
   cd isd
   python -m venv .venv
   source .venv/bin/activate  # On macOS/Linux
   pip install -r requirements.txt
   ```

2. **Run the application**
   ```bash
   python manage.py migrate
   python manage.py runserver 8000
   ```

3. **Deploy frontend**
   ```bash
   cd frontend
   ```
   - Create .env.local file containing:
   ```bash
   VITE_API_BASE_URL=http://localhost:8000
   VITE_AUTH_MODE=real
   ```
   ```bash
   npm install
   npm run dev
   ```
   


