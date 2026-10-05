#!/usr/bin/env python3
"""
Simple test for Campaign Archive/Unarchive functionality with longer delays
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

def test_archive_unarchive():
    """Test archive/unarchive with minimal requests"""
    print("🚀 Testing Campaign Archive/Unarchive APIs")
    print("=" * 50)
    
    # Login
    token = login()
    if not token:
        print("❌ Authentication failed")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test campaign ID from review request
    test_campaign_id = "4f2c49e0-65a2-46d5-8986-59cc8678cbed"
    
    print("1. Getting campaign status...")
    time.sleep(5)  # Long delay to avoid rate limiting
    
    response = requests.get(f"{BASE_URL}/campaigns/{test_campaign_id}", headers=headers)
    if response.status_code == 200:
        campaign = response.json()
        current_status = campaign.get("status", "unknown")
        campaign_name = campaign.get("name", "Unknown")
        print(f"   ✅ Campaign '{campaign_name}' status: {current_status}")
        
        if current_status != "archived":
            print("2. Testing archive functionality...")
            time.sleep(10)  # Even longer delay
            
            archive_response = requests.post(f"{BASE_URL}/campaigns/{test_campaign_id}/archive", headers=headers)
            if archive_response.status_code == 200:
                print(f"   ✅ Archive successful: {archive_response.json().get('message', 'No message')}")
                
                # Verify status change
                time.sleep(5)
                verify_response = requests.get(f"{BASE_URL}/campaigns/{test_campaign_id}", headers=headers)
                if verify_response.status_code == 200:
                    new_campaign = verify_response.json()
                    new_status = new_campaign.get("status", "unknown")
                    archived_at = new_campaign.get("archived_at")
                    print(f"   ✅ Status verification: {new_status}, archived_at: {archived_at}")
                    
                    if new_status == "archived":
                        print("3. Testing unarchive functionality...")
                        time.sleep(10)  # Long delay
                        
                        unarchive_response = requests.post(f"{BASE_URL}/campaigns/{test_campaign_id}/unarchive", headers=headers)
                        if unarchive_response.status_code == 200:
                            print(f"   ✅ Unarchive successful: {unarchive_response.json().get('message', 'No message')}")
                            
                            # Verify status change back
                            time.sleep(5)
                            final_verify_response = requests.get(f"{BASE_URL}/campaigns/{test_campaign_id}", headers=headers)
                            if final_verify_response.status_code == 200:
                                final_campaign = final_verify_response.json()
                                final_status = final_campaign.get("status", "unknown")
                                final_archived_at = final_campaign.get("archived_at")
                                print(f"   ✅ Final status verification: {final_status}, archived_at: {final_archived_at}")
                            else:
                                print(f"   ❌ Final verification failed: {final_verify_response.status_code}")
                        else:
                            print(f"   ❌ Unarchive failed: {unarchive_response.status_code} - {unarchive_response.text}")
                    else:
                        print(f"   ❌ Archive verification failed - status is still: {new_status}")
                else:
                    print(f"   ❌ Archive verification failed: {verify_response.status_code}")
            else:
                print(f"   ❌ Archive failed: {archive_response.status_code} - {archive_response.text}")
        else:
            print("   ℹ Campaign is already archived, testing unarchive only...")
            print("2. Testing unarchive functionality...")
            time.sleep(10)
            
            unarchive_response = requests.post(f"{BASE_URL}/campaigns/{test_campaign_id}/unarchive", headers=headers)
            if unarchive_response.status_code == 200:
                print(f"   ✅ Unarchive successful: {unarchive_response.json().get('message', 'No message')}")
            else:
                print(f"   ❌ Unarchive failed: {unarchive_response.status_code} - {unarchive_response.text}")
    else:
        print(f"   ❌ Failed to get campaign: {response.status_code} - {response.text}")
    
    print("\n4. Testing public page behavior...")
    time.sleep(5)
    
    # Test archived campaign public page
    archived_response = requests.get(f"{BASE_URL}/public/campaigns/annual-rotary-conference-2025")
    if archived_response.status_code == 410:
        print("   ✅ Archived campaign correctly returns HTTP 410")
    else:
        print(f"   ❌ Archived campaign returned: {archived_response.status_code}")
    
    # Test draft campaign public page
    time.sleep(5)
    draft_response = requests.get(f"{BASE_URL}/public/campaigns/test")
    if draft_response.status_code == 404:
        print("   ✅ Draft campaign correctly returns HTTP 404")
    else:
        print(f"   ❌ Draft campaign returned: {draft_response.status_code}")
    
    print("\n🎯 Archive/Unarchive testing completed!")

if __name__ == "__main__":
    test_archive_unarchive()