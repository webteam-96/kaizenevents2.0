#!/usr/bin/env python3
"""
Documentation Update Script for Kaizen Events

This script helps maintain documentation consistency across the project.
Run it whenever you make significant changes to:
- API endpoints
- Database models
- New features
- Configuration changes

Usage:
    python scripts/update_docs.py

The script will:
1. Scan backend files for API endpoints
2. Update timestamp in documentation
3. Generate a change summary
"""

import os
import re
import json
from datetime import datetime
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).parent.parent

# Files to scan
BACKEND_DIR = PROJECT_ROOT / "backend"
DOCS_DIR = PROJECT_ROOT / "docs"
README_FILE = PROJECT_ROOT / "README.md"


def find_api_endpoints():
    """Scan backend files for API route definitions"""
    endpoints = []
    route_pattern = re.compile(r'@router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']')
    
    for py_file in BACKEND_DIR.glob("*.py"):
        with open(py_file, 'r') as f:
            content = f.read()
            matches = route_pattern.findall(content)
            for method, path in matches:
                endpoints.append({
                    'method': method.upper(),
                    'path': path,
                    'file': py_file.name
                })
    
    return endpoints


def find_mongodb_collections():
    """Scan for MongoDB collection usage"""
    collections = set()
    collection_pattern = re.compile(r'db\.(\w+)\.')
    
    for py_file in BACKEND_DIR.glob("*.py"):
        with open(py_file, 'r') as f:
            content = f.read()
            matches = collection_pattern.findall(content)
            collections.update(matches)
    
    return sorted(collections)


def update_timestamp(file_path):
    """Update the 'Last Updated' timestamp in a markdown file"""
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Pattern to match "Last Updated: Month Year"
    pattern = r'\*Last Updated: [A-Za-z]+ \d{4}\*'
    new_date = f"*Last Updated: {datetime.now().strftime('%B %Y')}*"
    
    updated_content = re.sub(pattern, new_date, content)
    
    with open(file_path, 'w') as f:
        f.write(updated_content)
    
    return file_path.name


def generate_summary():
    """Generate a summary of the current codebase"""
    summary = {
        'timestamp': datetime.now().isoformat(),
        'endpoints_count': 0,
        'collections': [],
        'files': {
            'backend': [],
            'frontend_pages': [],
            'docs': []
        }
    }
    
    # Count endpoints
    endpoints = find_api_endpoints()
    summary['endpoints_count'] = len(endpoints)
    
    # List collections
    summary['collections'] = find_mongodb_collections()
    
    # List backend files
    summary['files']['backend'] = [f.name for f in BACKEND_DIR.glob("*.py")]
    
    # List frontend pages
    pages_dir = PROJECT_ROOT / "frontend" / "src" / "pages"
    if pages_dir.exists():
        summary['files']['frontend_pages'] = [f.name for f in pages_dir.glob("*.js")]
    
    # List docs
    summary['files']['docs'] = [f.name for f in DOCS_DIR.glob("*.md")]
    
    return summary


def main():
    print("=" * 60)
    print("Kaizen Events - Documentation Update Script")
    print("=" * 60)
    print()
    
    # Update timestamps in all docs
    print("Updating timestamps in documentation...")
    docs_updated = []
    for doc_file in DOCS_DIR.glob("*.md"):
        docs_updated.append(update_timestamp(doc_file))
    
    # Update README timestamp
    if README_FILE.exists():
        update_timestamp(README_FILE)
        docs_updated.append("README.md")
    
    print(f"  Updated: {', '.join(docs_updated)}")
    print()
    
    # Generate summary
    print("Scanning codebase...")
    summary = generate_summary()
    
    print(f"  API Endpoints: {summary['endpoints_count']}")
    print(f"  MongoDB Collections: {', '.join(summary['collections'])}")
    print(f"  Backend Files: {len(summary['files']['backend'])}")
    print(f"  Frontend Pages: {len(summary['files']['frontend_pages'])}")
    print(f"  Documentation Files: {len(summary['files']['docs'])}")
    print()
    
    # Save summary
    summary_file = DOCS_DIR / "_summary.json"
    with open(summary_file, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"Summary saved to: {summary_file}")
    print()
    
    # List all endpoints
    print("API Endpoints Found:")
    print("-" * 40)
    endpoints = find_api_endpoints()
    for ep in sorted(endpoints, key=lambda x: (x['file'], x['path'])):
        print(f"  {ep['method']:6} {ep['path']:40} ({ep['file']})")
    
    print()
    print("=" * 60)
    print("Documentation update complete!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Review the changes")
    print("2. Update CHANGELOG.md if needed")
    print("3. Commit and push to Git")
    print()


if __name__ == "__main__":
    main()
