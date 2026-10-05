#!/usr/bin/env python3
"""
Simple test for the key endpoints that were failing
"""

import requests
import json
import time

# Configuration
BASE_URL = "https://kioskflow.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "email": "pranav@kaizeninfotech.com",
    "password": "Kaizentest1234"
}
TEST_CAMPAIGN_ID = "4f2c49e0-65a2-46d5-8986-59cc8678cbed"

def make_request(method: str, endpoint: str, data=None, headers=None):
    """Make HTTP request with rate limiting protection"""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers)
        
        try:
            response_data = response.json()
        except:
            response_data = response.text
        
        return response.status_code, response_data
        
    except Exception as e:
        return 0, f"Request failed: {str(e)}"

def main():
    print("🚀 SIMPLE KIOSK & WHATSAPP TEST")
    print("=" * 50)
    
    # Login
    status_code, response_data = make_request("POST", "/auth/login", TEST_CREDENTIALS)
    if status_code != 200 or "access_token" not in response_data:
        print(f"❌ Login failed: {response_data}")
        return
    
    access_token = response_data["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}
    print("✅ Login successful")
    
    # Wait to avoid rate limits
    time.sleep(2)
    
    # Test WhatsApp Template Guide (no auth needed)
    print("\n--- Testing WhatsApp Template Guide ---")
    status_code, response_data = make_request("GET", "/whatsapp/template-guide")
    if status_code == 200:
        variables = response_data.get("variables", [])
        print(f"✅ WhatsApp template guide: {len(variables)} variables documented")
        
        # Check all 5 variables
        expected_vars = ["{{1}}", "{{2}}", "{{3}}", "{{4}}", "{{5}}"]
        documented_vars = [var.get("placeholder") for var in variables]
        
        if all(var in documented_vars for var in expected_vars):
            print("   ✓ All 5 template variables present")
        else:
            missing = [var for var in expected_vars if var not in documented_vars]
            print(f"   ⚠ Missing variables: {missing}")
    else:
        print(f"❌ WhatsApp template guide failed: {status_code} - {response_data}")
    
    time.sleep(2)
    
    # Test Kiosk Search
    print("\n--- Testing Kiosk Search ---")
    search_data = {"query": "Jane", "campaign_id": TEST_CAMPAIGN_ID}
    status_code, response_data = make_request("POST", "/kiosk/search", search_data, headers)
    if status_code == 200:
        results = len(response_data) if isinstance(response_data, list) else 0
        print(f"✅ Kiosk search: {results} results found")
        if results > 0:
            sample = response_data[0]
            print(f"   ✓ Sample result: {sample.get('name')} ({sample.get('status')})")
    else:
        print(f"❌ Kiosk search failed: {status_code} - {response_data}")
    
    time.sleep(2)
    
    # Test Campaign Update (payment collection method)
    print("\n--- Testing Campaign Payment Collection Method ---")
    update_data = {"payment_collection_method": "offline"}
    status_code, response_data = make_request("PUT", f"/campaigns/{TEST_CAMPAIGN_ID}", update_data, headers)
    if status_code == 200:
        payment_method = response_data.get("payment_collection_method")
        print(f"✅ Campaign updated: payment_collection_method = {payment_method}")
    else:
        print(f"❌ Campaign update failed: {status_code} - {response_data}")
    
    print("\n🏁 Simple test completed!")

if __name__ == "__main__":
    main()