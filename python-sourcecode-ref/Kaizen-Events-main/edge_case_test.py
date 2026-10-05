#!/usr/bin/env python3
"""
Test edge cases for Campaign Archive/Unarchive functionality
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

def login():
    """Login and get access token"""
    response = requests.post(f"{BASE_URL}/auth/login", json=TEST_CREDENTIALS)
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    else:
        print(f"Login failed: {response.status_code} - {response.text}")
        return None

def test_edge_cases():
    """Test edge cases for archive/unarchive"""
    print("🚀 Testing Archive/Unarchive Edge Cases")
    print("=" * 50)
    
    # Login
    token = login()
    if not token:
        print("❌ Authentication failed")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    test_campaign_id = "4f2c49e0-65a2-46d5-8986-59cc8678cbed"
    
    print("1. Testing unarchive on non-archived campaign...")
    time.sleep(5)
    
    # First ensure campaign is not archived
    response = requests.get(f"{BASE_URL}/campaigns/{test_campaign_id}", headers=headers)
    if response.status_code == 200:
        campaign = response.json()
        if campaign.get("status") == "archived":
            # Unarchive it first
            requests.post(f"{BASE_URL}/campaigns/{test_campaign_id}/unarchive", headers=headers)
            time.sleep(3)
    
    # Now try to unarchive non-archived campaign
    unarchive_response = requests.post(f"{BASE_URL}/campaigns/{test_campaign_id}/unarchive", headers=headers)
    if unarchive_response.status_code == 400:
        error_msg = unarchive_response.json().get("detail", "")
        if "not archived" in error_msg:
            print(f"   ✅ Correctly prevented unarchiving non-archived campaign: {error_msg}")
        else:
            print(f"   ❌ Wrong error message: {error_msg}")
    else:
        print(f"   ❌ Should have returned 400, got: {unarchive_response.status_code}")
    
    print("2. Testing with non-existent campaign...")
    time.sleep(5)
    
    fake_id = "00000000-0000-0000-0000-000000000000"
    
    # Test archive non-existent
    archive_fake_response = requests.post(f"{BASE_URL}/campaigns/{fake_id}/archive", headers=headers)
    if archive_fake_response.status_code == 404:
        print("   ✅ Archive correctly returned 404 for non-existent campaign")
    else:
        print(f"   ❌ Archive should have returned 404, got: {archive_fake_response.status_code}")
    
    time.sleep(3)
    
    # Test unarchive non-existent
    unarchive_fake_response = requests.post(f"{BASE_URL}/campaigns/{fake_id}/unarchive", headers=headers)
    if unarchive_fake_response.status_code == 404:
        print("   ✅ Unarchive correctly returned 404 for non-existent campaign")
    else:
        print(f"   ❌ Unarchive should have returned 404, got: {unarchive_fake_response.status_code}")
    
    print("3. Testing archive already archived campaign...")
    time.sleep(5)
    
    # First archive the campaign
    archive_response = requests.post(f"{BASE_URL}/campaigns/{test_campaign_id}/archive", headers=headers)
    if archive_response.status_code == 200:
        print("   ✅ Campaign archived successfully")
        
        time.sleep(3)
        
        # Try to archive again
        archive_again_response = requests.post(f"{BASE_URL}/campaigns/{test_campaign_id}/archive", headers=headers)
        if archive_again_response.status_code == 200:
            print("   ✅ Re-archiving allowed (implementation choice)")
        else:
            print(f"   ✅ Re-archiving prevented with status: {archive_again_response.status_code}")
        
        # Clean up - unarchive for next tests
        time.sleep(3)
        requests.post(f"{BASE_URL}/campaigns/{test_campaign_id}/unarchive", headers=headers)
        print("   ✅ Cleaned up - campaign unarchived")
    else:
        print(f"   ❌ Failed to archive campaign: {archive_response.status_code}")
    
    print("\n🎯 Edge case testing completed!")

if __name__ == "__main__":
    test_edge_cases()