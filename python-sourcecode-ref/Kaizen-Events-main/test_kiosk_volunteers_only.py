#!/usr/bin/env python3
"""
Kiosk Volunteer Management Test Script
Tests the Kiosk Volunteer Management feature specifically
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://kioskflow.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "email": "pranav@kaizeninfotech.com",
    "password": "Kaizentest1234"
}
TEST_CAMPAIGN_ID = "4f2c49e0-65a2-46d5-8986-59cc8678cbed"

class KioskVolunteerTester:
    def __init__(self):
        self.session = requests.Session()
        self.access_token = None
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def make_request(self, method: str, endpoint: str, data: Dict = None, headers: Dict = None) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{BASE_URL}{endpoint}"
        
        # Add auth header if token available
        if self.access_token and headers is None:
            headers = {"Authorization": f"Bearer {self.access_token}"}
        elif self.access_token and headers:
            headers["Authorization"] = f"Bearer {self.access_token}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, headers=headers)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, headers=headers)
            else:
                return False, f"Unsupported method: {method}", 0
            
            # Try to parse JSON response
            try:
                response_data = response.json()
            except:
                response_data = response.text
            
            return response.status_code < 400, response_data, response.status_code
            
        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}", 0
    
    def login(self):
        """Login and get access token"""
        success, response_data, status_code = self.make_request(
            "POST", 
            "/auth/login", 
            TEST_CREDENTIALS,
            headers={}  # No auth needed for login
        )
        
        if success and isinstance(response_data, dict) and "access_token" in response_data:
            self.access_token = response_data["access_token"]
            user_data = response_data.get("user", {})
            print(f"✅ Login successful: {user_data.get('name', 'Unknown')} ({user_data.get('email', 'Unknown')})")
            return True
        else:
            print(f"❌ Login failed. Status: {status_code}")
            print(f"   Response: {response_data}")
            return False

    def test_kiosk_volunteer_management(self):
        """Test Kiosk Volunteer Management feature"""
        print("=== TESTING KIOSK VOLUNTEER MANAGEMENT ===")
        
        created_volunteer_id = None
        temp_password = None
        volunteer_token = None
        
        # Test 1: Create Kiosk Volunteer
        create_payload = {
            "name": "Test Volunteer 2",
            "email": "volunteer2@test.com",
            "phone": "9876543211",
            "campaign_ids": [TEST_CAMPAIGN_ID]
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/kiosk-volunteers", 
            create_payload
        )
        
        if success and isinstance(response_data, dict) and "id" in response_data:
            created_volunteer_id = response_data["id"]
            temp_password = response_data.get("temporary_password")
            volunteer_name = response_data.get("name")
            volunteer_email = response_data.get("email")
            campaign_names = response_data.get("campaign_names", [])
            
            self.log_test(
                "POST /api/kiosk-volunteers", 
                True, 
                f"Volunteer created: {volunteer_name} ({volunteer_email}), Campaigns: {campaign_names}, Temp Password: {temp_password}"
            )
            
            # Verify required fields
            required_fields = ["id", "name", "email", "temporary_password", "campaign_names"]
            missing_fields = [field for field in required_fields if field not in response_data]
            
            if not missing_fields:
                print("   ✓ All required fields present in response")
            else:
                print(f"   ⚠ Missing required fields: {missing_fields}")
                
        else:
            self.log_test(
                "POST /api/kiosk-volunteers", 
                False, 
                f"Failed to create volunteer. Status: {status_code}",
                response_data
            )
            return  # Can't continue without created volunteer
        
        # Test 2: List Kiosk Volunteers
        success, response_data, status_code = self.make_request(
            "GET", 
            "/kiosk-volunteers"
        )
        
        if success and isinstance(response_data, list):
            volunteer_count = len(response_data)
            self.log_test(
                "GET /api/kiosk-volunteers", 
                True, 
                f"Retrieved {volunteer_count} volunteers"
            )
            
            # Check if our created volunteer is in the list
            created_volunteer_found = any(v.get("id") == created_volunteer_id for v in response_data)
            if created_volunteer_found:
                print(f"   ✓ Created volunteer {created_volunteer_id} found in list")
                
                # Verify volunteer structure
                volunteer = next(v for v in response_data if v.get("id") == created_volunteer_id)
                required_fields = ["id", "name", "email", "campaign_ids", "campaign_names", "is_active"]
                missing_fields = [field for field in required_fields if field not in volunteer]
                
                if not missing_fields:
                    print("   ✓ Volunteer structure contains all required fields")
                else:
                    print(f"   ⚠ Volunteer missing fields: {missing_fields}")
                    
            else:
                print(f"   ⚠ Created volunteer {created_volunteer_id} not found in list")
                
        else:
            self.log_test(
                "GET /api/kiosk-volunteers", 
                False, 
                f"Failed to list volunteers. Status: {status_code}",
                response_data
            )
        
        # Test 3: Volunteer Login
        if temp_password:
            login_payload = {
                "email": "volunteer2@test.com",
                "password": temp_password
            }
            
            success, response_data, status_code = self.make_request(
                "POST", 
                "/auth/login", 
                login_payload,
                headers={}  # No auth needed for login
            )
            
            if success and isinstance(response_data, dict) and "access_token" in response_data:
                volunteer_token = response_data["access_token"]
                user_data = response_data.get("user", {})
                user_role = user_data.get("role")
                
                self.log_test(
                    "POST /api/auth/login (volunteer)", 
                    True, 
                    f"Volunteer login successful. Role: {user_role}"
                )
                
                # Verify role is kiosk_volunteer
                if user_role == "kiosk_volunteer":
                    print("   ✓ User role correctly set to kiosk_volunteer")
                else:
                    print(f"   ⚠ Expected role 'kiosk_volunteer', got '{user_role}'")
                    
            else:
                self.log_test(
                    "POST /api/auth/login (volunteer)", 
                    False, 
                    f"Volunteer login failed. Status: {status_code}",
                    response_data
                )
        
        # Test 4: Volunteer Access Test - Assigned Campaign (Should Succeed)
        if volunteer_token:
            success, response_data, status_code = self.make_request(
                "GET", 
                f"/kiosk/campaigns/{TEST_CAMPAIGN_ID}/info",
                headers={"Authorization": f"Bearer {volunteer_token}"}
            )
            
            if success and isinstance(response_data, dict):
                campaign_name = response_data.get("name")
                self.log_test(
                    f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/info (volunteer access)", 
                    True, 
                    f"Volunteer successfully accessed assigned campaign: {campaign_name}"
                )
            else:
                self.log_test(
                    f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/info (volunteer access)", 
                    False, 
                    f"Volunteer failed to access assigned campaign. Status: {status_code}",
                    response_data
                )
        
        # Test 5: Volunteer Access Test - Unassigned Campaign (Should Fail)
        if volunteer_token:
            unassigned_campaign_id = "4d559227-f5b3-430e-b459-79bf69ec4b40"
            success, response_data, status_code = self.make_request(
                "GET", 
                f"/kiosk/campaigns/{unassigned_campaign_id}/info",
                headers={"Authorization": f"Bearer {volunteer_token}"}
            )
            
            if not success and status_code == 403:
                self.log_test(
                    f"GET /api/kiosk/campaigns/{unassigned_campaign_id}/info (volunteer denied)", 
                    True, 
                    "Volunteer correctly denied access to unassigned campaign with 403"
                )
            else:
                self.log_test(
                    f"GET /api/kiosk/campaigns/{unassigned_campaign_id}/info (volunteer denied)", 
                    False, 
                    f"Should have denied access with 403. Status: {status_code}",
                    response_data
                )
        
        # Test 6: Update Volunteer
        if created_volunteer_id:
            update_payload = {
                "name": "Updated Volunteer Name",
                "is_active": False
            }
            
            success, response_data, status_code = self.make_request(
                "PUT", 
                f"/kiosk-volunteers/{created_volunteer_id}", 
                update_payload
            )
            
            if success and isinstance(response_data, dict):
                updated_name = response_data.get("name")
                is_active = response_data.get("is_active")
                self.log_test(
                    f"PUT /api/kiosk-volunteers/{created_volunteer_id}", 
                    True, 
                    f"Volunteer updated: {updated_name}, Active: {is_active}"
                )
                
                # Verify updates were applied
                if updated_name == "Updated Volunteer Name" and is_active == False:
                    print("   ✓ Updates applied correctly")
                else:
                    print("   ⚠ Updates may not have been applied correctly")
                    
            else:
                self.log_test(
                    f"PUT /api/kiosk-volunteers/{created_volunteer_id}", 
                    False, 
                    f"Failed to update volunteer. Status: {status_code}",
                    response_data
                )
        
        # Test 7: Reset Volunteer Password
        if created_volunteer_id:
            success, response_data, status_code = self.make_request(
                "POST", 
                f"/kiosk-volunteers/{created_volunteer_id}/reset-password"
            )
            
            if success and isinstance(response_data, dict):
                new_temp_password = response_data.get("temporary_password")
                volunteer_email = response_data.get("volunteer_email")
                message = response_data.get("message")
                
                self.log_test(
                    f"POST /api/kiosk-volunteers/{created_volunteer_id}/reset-password", 
                    True, 
                    f"Password reset for {volunteer_email}: {message}, New temp password: {new_temp_password}"
                )
                
                # Verify new password is different from original
                if new_temp_password and new_temp_password != temp_password:
                    print("   ✓ New temporary password generated")
                else:
                    print("   ⚠ New password may not have been generated correctly")
                    
            else:
                self.log_test(
                    f"POST /api/kiosk-volunteers/{created_volunteer_id}/reset-password", 
                    False, 
                    f"Failed to reset password. Status: {status_code}",
                    response_data
                )
        
        # Test 8: Get Campaign Volunteers
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/kiosk-volunteers/campaigns/{TEST_CAMPAIGN_ID}/volunteers"
        )
        
        if success and isinstance(response_data, list):
            campaign_volunteers_count = len(response_data)
            self.log_test(
                f"GET /api/kiosk-volunteers/campaigns/{TEST_CAMPAIGN_ID}/volunteers", 
                True, 
                f"Retrieved {campaign_volunteers_count} volunteers assigned to campaign"
            )
            
            # Check if our volunteer is in the campaign volunteers list
            if created_volunteer_id:
                volunteer_in_campaign = any(v.get("id") == created_volunteer_id for v in response_data)
                if volunteer_in_campaign:
                    print(f"   ✓ Created volunteer found in campaign volunteers list")
                else:
                    print(f"   ⚠ Created volunteer not found in campaign volunteers list")
                    
        else:
            self.log_test(
                f"GET /api/kiosk-volunteers/campaigns/{TEST_CAMPAIGN_ID}/volunteers", 
                False, 
                f"Failed to get campaign volunteers. Status: {status_code}",
                response_data
            )
        
        # Test 9: Delete Volunteer (Cleanup)
        if created_volunteer_id:
            success, response_data, status_code = self.make_request(
                "DELETE", 
                f"/kiosk-volunteers/{created_volunteer_id}"
            )
            
            if success:
                message = response_data.get("message", "Deleted") if isinstance(response_data, dict) else "Deleted"
                self.log_test(
                    f"DELETE /api/kiosk-volunteers/{created_volunteer_id}", 
                    True, 
                    f"Volunteer deleted: {message}"
                )
            else:
                self.log_test(
                    f"DELETE /api/kiosk-volunteers/{created_volunteer_id}", 
                    False, 
                    f"Failed to delete volunteer. Status: {status_code}",
                    response_data
                )

    def run_tests(self):
        """Run all kiosk volunteer tests"""
        print("🚀 TESTING KIOSK VOLUNTEER MANAGEMENT FEATURE")
        print("=" * 60)
        print(f"Base URL: {BASE_URL}")
        print(f"Test Campaign ID: {TEST_CAMPAIGN_ID}")
        print("=" * 60)
        
        if not self.login():
            return False
        
        self.test_kiosk_volunteer_management()
        
        # Print summary
        print("=" * 60)
        print("🏁 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   - {result['test']}: {result['details']}")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = KioskVolunteerTester()
    success = tester.run_tests()
    sys.exit(0 if success else 1)