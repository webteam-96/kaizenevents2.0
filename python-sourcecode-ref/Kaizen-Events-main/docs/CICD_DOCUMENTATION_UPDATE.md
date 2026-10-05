# CI/CD Integration Guide for Documentation Updates

*Last Updated: January 2026*

This guide explains how to integrate the `update_docs.py` script into your CI/CD pipeline for automatic documentation updates.

---

## Overview

The `scripts/update_docs.py` script provides automated documentation maintenance by:

1. **Scanning API Endpoints** - Finds all route definitions in backend files
2. **Listing MongoDB Collections** - Detects all database collections in use
3. **Updating Timestamps** - Refreshes "Last Updated" dates in markdown files
4. **Generating Summary** - Creates a JSON summary of the codebase state

---

## Script Capabilities

### What It Scans:

| Category | Pattern | Output |
|----------|---------|--------|
| API Routes | `@router.(get\|post\|put\|delete\|patch)("/path")` | List of endpoints |
| Collections | `db.collection_name.` | Set of collection names |
| Backend Files | `backend/*.py` | File count |
| Frontend Pages | `frontend/src/pages/*.js` | File count |
| Documentation | `docs/*.md` | File count |

### Output Files:

- **`docs/_summary.json`** - Machine-readable codebase summary
- **Updated timestamps** in all markdown files

---

## CI/CD Integration Examples

### GitHub Actions

Create `.github/workflows/update-docs.yml`:

```yaml
name: Update Documentation

on:
  push:
    branches: [main, develop]
    paths:
      - 'backend/**/*.py'
      - 'frontend/src/pages/**/*.js'
  workflow_dispatch:  # Allow manual trigger

jobs:
  update-docs:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          
      - name: Run documentation update
        run: python scripts/update_docs.py
        
      - name: Check for changes
        id: git-check
        run: |
          git diff --exit-code || echo "changes=true" >> $GITHUB_OUTPUT
          
      - name: Commit and push if changed
        if: steps.git-check.outputs.changes == 'true'
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add docs/
          git commit -m "docs: auto-update documentation [skip ci]"
          git push
```

### GitLab CI

Add to `.gitlab-ci.yml`:

```yaml
update-documentation:
  stage: deploy
  image: python:3.11-slim
  only:
    changes:
      - backend/**/*.py
      - frontend/src/pages/**/*.js
  script:
    - python scripts/update_docs.py
    - |
      if [ -n "$(git status --porcelain docs/)" ]; then
        git config user.email "ci@gitlab.com"
        git config user.name "GitLab CI"
        git add docs/
        git commit -m "docs: auto-update documentation [skip ci]"
        git push "https://gitlab-ci-token:${CI_JOB_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git" HEAD:${CI_COMMIT_REF_NAME}
      fi
  allow_failure: true
```

### Jenkins Pipeline

Add to `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    stages {
        stage('Update Docs') {
            when {
                anyOf {
                    changeset "backend/**/*.py"
                    changeset "frontend/src/pages/**/*.js"
                }
            }
            steps {
                sh 'python3 scripts/update_docs.py'
                
                script {
                    def changes = sh(script: 'git status --porcelain docs/', returnStdout: true).trim()
                    if (changes) {
                        sh '''
                            git config user.email "jenkins@company.com"
                            git config user.name "Jenkins CI"
                            git add docs/
                            git commit -m "docs: auto-update documentation [skip ci]"
                            git push origin ${BRANCH_NAME}
                        '''
                    }
                }
            }
        }
    }
}
```

---

## Local Usage

### Running Manually:

```bash
cd /app
python scripts/update_docs.py
```

### Expected Output:

```
============================================================
Kaizen Events - Documentation Update Script
============================================================

Updating timestamps in documentation...
  Updated: API.md, DEPLOYMENT.md, README.md

Scanning codebase...
  API Endpoints: 87
  MongoDB Collections: campaigns, change_requests, fund_transfers, ...
  Backend Files: 15
  Frontend Pages: 28
  Documentation Files: 8

Summary saved to: /app/docs/_summary.json

API Endpoints Found:
----------------------------------------
  GET    /api/campaigns                    (campaign_routes.py)
  POST   /api/campaigns                    (campaign_routes.py)
  ...

============================================================
Documentation update complete!
============================================================
```

---

## Customization Options

### Adding New Scan Patterns

Edit `scripts/update_docs.py` to add new patterns:

```python
# Example: Add support for scanning middleware
def find_middleware():
    middleware_pattern = re.compile(r'@app\.middleware\(["\']([^"\']+')
    # ... implementation
```

### Custom Summary Fields

Add new fields to the `generate_summary()` function:

```python
def generate_summary():
    summary = {
        'timestamp': datetime.now().isoformat(),
        # Add custom fields here
        'custom_metric': calculate_custom_metric(),
    }
```

---

## Best Practices

### 1. Use `[skip ci]` in Commit Messages
Prevent infinite loops by including `[skip ci]` in auto-generated commits.

### 2. Run on Protected Branches Only
Limit automatic updates to main/develop branches to avoid conflicts.

### 3. Review Generated Changes
Periodically review the auto-generated `_summary.json` for accuracy.

### 4. Set Up Notifications
Configure alerts if the script fails to catch documentation drift early.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Script fails with import error | Ensure Python 3.8+ is installed |
| No endpoints found | Check backend files have proper route decorators |
| Timestamp not updated | Ensure markdown files have `*Last Updated: Month Year*` format |
| Permission denied on push | Check CI/CD has write permissions to repository |

---

## Summary File Structure

The generated `docs/_summary.json` contains:

```json
{
  "timestamp": "2025-01-07T21:30:00.000000",
  "endpoints_count": 87,
  "collections": ["campaigns", "change_requests", "fund_transfers", ...],
  "files": {
    "backend": ["server.py", "campaign_routes.py", ...],
    "frontend_pages": ["Dashboard.js", "Campaigns.js", ...],
    "docs": ["README.md", "API.md", ...]
  }
}
```

This can be consumed by other tools for monitoring or dashboard displays.

---

*For questions or improvements, contact the development team.*
