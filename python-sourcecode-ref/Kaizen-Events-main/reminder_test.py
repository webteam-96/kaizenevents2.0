#!/usr/bin/env python3
"""
Focused test for Closed Group Campaign Reminder Functionality
"""

import requests
import json
import time
from typing import Dict, Any

# Configuration
BASE_URL = "https://kioskflow.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "email": "pranav@kaizeninfotech.com",
    "password": "Kaizentest1234"
}
REMINDER_CAMPAIGN_ID = "5d5a3b98-fa37-4fe7-90b1-46197ff23dee"

class ReminderTester:
    def __init__(self):
        self.session = requests.Session()
        self.access_token = None
        
    def login(self):
        """Login and get access token"""
        url = f"{BASE_URL}/auth/login"
        response = self.session.post(url, json=TEST_CREDENTIALS)
        
        if response.status_code == 200:
            data = response.json()
            self.access_token = data["access_token"]
            print(f"✅ Login successful: {data['user']['name']} ({data['user']['email']})")
            return True
        else:
            print(f"❌ Login failed: {response.status_code} - {response.text}")
            return False
    
    def make_request(self, method: str, endpoint: str, data: Dict = None) -> tuple:
        """Make authenticated request"""
        url = f"{BASE_URL}{endpoint}"
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers)
            else:
                return False, f"Unsupported method: {method}", 0
            
            try:
                response_data = response.json()
            except:
                response_data = response.text
            
            return response.status_code < 400, response_data, response.status_code
            
        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}", 0
    
    def test_reminder_functionality(self):
        """Test all reminder scenarios from review request"""
        print("🧪 TESTING CLOSED GROUP REMINDER FUNCTIONALITY")
        print("=" * 60)
        
        # Test 1: Get unregistered members
        print("\n1. Getting unregistered members...")
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/campaigns/{REMINDER_CAMPAIGN_ID}/members?status=unregistered"
        )
        
        unregistered_member_ids = []
        if success and isinstance(response_data, dict) and "members" in response_data:
            unregistered_members = response_data["members"]
            unregistered_member_ids = [member["id"] for member in unregistered_members]
            print(f"✅ Found {len(unregistered_members)} unregistered members")
            for member in unregistered_members[:3]:  # Show first 3
                print(f"   - {member['name']} ({member['id']})")
        else:
            print(f"❌ Failed to get unregistered members: {status_code}")
            return
        
        time.sleep(2)  # Rate limiting prevention
        
        # Test 2: Bulk Reminder API (all unregistered)
        print("\n2. Testing bulk reminder (all unregistered)...")
        bulk_payload = {"channels": ["email"]}
        
        success, response_data, status_code = self.make_request(
            "POST", 
            f"/campaigns/{REMINDER_CAMPAIGN_ID}/members/reminders", 
            bulk_payload
        )
        
        if success and isinstance(response_data, dict):
            print(f"✅ Bulk reminder API response:")
            print(f"   Total: {response_data.get('total', 0)}")
            print(f"   Email sent: {response_data.get('email_sent', 0)}")
            print(f"   Email failed: {response_data.get('email_failed', 0)}")
            print(f"   WhatsApp sent: {response_data.get('whatsapp_sent', 0)}")
            print(f"   WhatsApp failed: {response_data.get('whatsapp_failed', 0)}")
            print(f"   Errors: {len(response_data.get('errors', []))}")
            
            # Show first few errors if any
            errors = response_data.get('errors', [])
            if errors:
                print("   Error details:")
                for error in errors[:2]:
                    print(f"     - {error}")
        else:
            print(f"❌ Bulk reminder failed: {status_code} - {response_data}")
        
        time.sleep(3)  # Rate limiting prevention
        
        # Test 3: Bulk Reminder API (specific members)
        if unregistered_member_ids:
            print("\n3. Testing bulk reminder (specific members)...")
            specific_payload = {
                "member_ids": unregistered_member_ids[:2],
                "channels": ["email", "whatsapp"]
            }
            
            success, response_data, status_code = self.make_request(
                "POST", 
                f"/campaigns/{REMINDER_CAMPAIGN_ID}/members/reminders", 
                specific_payload
            )
            
            if success and isinstance(response_data, dict):
                print(f"✅ Specific reminder API response:")
                print(f"   Total: {response_data.get('total', 0)}")
                print(f"   Email: {response_data.get('email_sent', 0)}/{response_data.get('email_failed', 0)} (sent/failed)")
                print(f"   WhatsApp: {response_data.get('whatsapp_sent', 0)}/{response_data.get('whatsapp_failed', 0)} (sent/failed)")
            else:
                print(f"❌ Specific reminder failed: {status_code} - {response_data}")
        
        time.sleep(3)  # Rate limiting prevention
        
        # Test 4: Individual Reminder API
        if unregistered_member_ids:
            print("\n4. Testing individual reminder...")
            test_member_id = unregistered_member_ids[0]
            individual_payload = {"channels": ["email"]}
            
            success, response_data, status_code = self.make_request(
                "POST", 
                f"/campaigns/{REMINDER_CAMPAIGN_ID}/members/{test_member_id}/reminder", 
                individual_payload
            )
            
            if success and isinstance(response_data, dict):
                print(f"✅ Individual reminder API response:")
                print(f"   Member ID: {response_data.get('member_id')}")
                print(f"   Email sent: {response_data.get('email_sent', False)}")
                print(f"   WhatsApp sent: {response_data.get('whatsapp_sent', False)}")
                print(f"   Errors: {len(response_data.get('errors', []))}")
                
                errors = response_data.get('errors', [])
                if errors:
                    print("   Error details:")
                    for error in errors:
                        print(f"     - {error}")
            else:
                print(f"❌ Individual reminder failed: {status_code} - {response_data}")
        
        time.sleep(3)  # Rate limiting prevention
        
        # Test 5: Edge Case - Already Registered Member
        print("\n5. Testing edge case (already registered member)...")
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/campaigns/{REMINDER_CAMPAIGN_ID}/members?status=registered"
        )
        
        if success and isinstance(response_data, dict) and "members" in response_data:
            registered_members = response_data["members"]
            if registered_members:
                # Find Test Member 1 or use first registered member
                test_member_1 = next((m for m in registered_members if "Test Member 1" in m.get("name", "")), None)
                registered_member_id = test_member_1["id"] if test_member_1 else registered_members[0]["id"]
                registered_member_name = test_member_1["name"] if test_member_1 else registered_members[0]["name"]
                
                print(f"   Found registered member: {registered_member_name} ({registered_member_id})")
                
                time.sleep(2)
                
                edge_case_payload = {"channels": ["email"]}
                success, response_data, status_code = self.make_request(
                    "POST", 
                    f"/campaigns/{REMINDER_CAMPAIGN_ID}/members/{registered_member_id}/reminder", 
                    edge_case_payload
                )
                
                if not success and status_code == 400:
                    error_message = response_data.get("detail", "") if isinstance(response_data, dict) else str(response_data)
                    if "already registered" in error_message.lower():
                        print(f"✅ Correctly rejected reminder for registered member: {error_message}")
                    else:
                        print(f"⚠️ Wrong error message: {error_message}")
                else:
                    print(f"❌ Should have returned 400 for registered member: {status_code} - {response_data}")
            else:
                print("   No registered members found")
        else:
            print(f"❌ Failed to get registered members: {status_code}")
        
        print("\n" + "=" * 60)
        print("🎯 REMINDER FUNCTIONALITY TESTING COMPLETED")

if __name__ == "__main__":
    tester = ReminderTester()
    if tester.login():
        tester.test_reminder_functionality()
    else:
        print("❌ Cannot proceed without authentication")