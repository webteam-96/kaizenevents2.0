#!/usr/bin/env python3
"""
Focused test for Campaign Archive/Unarchive functionality
"""

import requests
import json
import sys
import time
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://kioskflow.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "email": "pranav@kaizeninfotech.com",
    "password": "Kaizentest1234"
}
TEST_CAMPAIGN_ID = "4f2c49e0-65a2-46d5-8986-59cc8678cbed"  # Test campaign, currently draft
ARCHIVED_CAMPAIGN_ID = "4d559227-f5b3-430e-b459-79bf69ec4b40"  # Annual Rotary Conference, archived

class ArchiveUnarchiveTester:
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
        print("=== AUTHENTICATION ===")
        success, response_data, status_code = self.make_request(
            "POST", 
            "/auth/login", 
            TEST_CREDENTIALS,
            headers={}  # No auth needed for login
        )
        
        if success and isinstance(response_data, dict) and "access_token" in response_data:
            self.access_token = response_data["access_token"]
            user_data = response_data.get("user", {})
            self.log_test(
                "POST /api/auth/login", 
                True, 
                f"Login successful. User: {user_data.get('name', 'Unknown')} ({user_data.get('email', 'Unknown')})"
            )
            return True
        else:
            self.log_test(
                "POST /api/auth/login", 
                False, 
                f"Login failed. Status: {status_code}",
                response_data
            )
            return False
    
    def test_archive_unarchive_apis(self):
        """Test Campaign Archive/Unarchive API endpoints"""
        print("=== TESTING CAMPAIGN ARCHIVE/UNARCHIVE APIS ===")
        
        # Test 1: Get current status of test campaign
        success, response_data, status_code = self.make_request("GET", f"/campaigns/{TEST_CAMPAIGN_ID}")
        
        if success and isinstance(response_data, dict):
            current_status = response_data.get("status", "unknown")
            campaign_name = response_data.get("name", "Unknown")
            archived_at = response_data.get("archived_at")
            
            self.log_test(
                f"GET /api/campaigns/{TEST_CAMPAIGN_ID} (status check)", 
                True, 
                f"Campaign '{campaign_name}' current status: {current_status}, archived_at: {archived_at}"
            )
            
            # Test 2: Archive the campaign if it's not already archived
            if current_status != "archived":
                print("   → Testing archive functionality...")
                time.sleep(2)  # Rate limiting protection
                
                success, response_data, status_code = self.make_request(
                    "POST", 
                    f"/campaigns/{TEST_CAMPAIGN_ID}/archive"
                )
                
                if success and isinstance(response_data, dict):
                    message = response_data.get("message", "No message")
                    self.log_test(
                        f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/archive", 
                        True, 
                        f"Campaign archived successfully: {message}"
                    )
                    
                    # Verify the campaign status changed to archived
                    time.sleep(2)  # Rate limiting protection
                    success, verify_data, verify_status = self.make_request("GET", f"/campaigns/{TEST_CAMPAIGN_ID}")
                    if success and isinstance(verify_data, dict):
                        new_status = verify_data.get("status", "unknown")
                        new_archived_at = verify_data.get("archived_at")
                        
                        if new_status == "archived" and new_archived_at is not None:
                            print(f"   ✓ Status verification: Campaign status changed to 'archived', archived_at: {new_archived_at}")
                        else:
                            print(f"   ⚠ Status verification failed: Status: {new_status}, archived_at: {new_archived_at}")
                    
                    # Test 3: Unarchive the campaign
                    print("   → Testing unarchive functionality...")
                    time.sleep(2)  # Rate limiting protection
                    
                    success, response_data, status_code = self.make_request(
                        "POST", 
                        f"/campaigns/{TEST_CAMPAIGN_ID}/unarchive"
                    )
                    
                    if success and isinstance(response_data, dict):
                        message = response_data.get("message", "No message")
                        self.log_test(
                            f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/unarchive", 
                            True, 
                            f"Campaign unarchived successfully: {message}"
                        )
                        
                        # Verify the campaign status changed back to draft
                        time.sleep(2)  # Rate limiting protection
                        success, verify_data, verify_status = self.make_request("GET", f"/campaigns/{TEST_CAMPAIGN_ID}")
                        if success and isinstance(verify_data, dict):
                            new_status = verify_data.get("status", "unknown")
                            new_archived_at = verify_data.get("archived_at")
                            
                            if new_status == "draft" and new_archived_at is None:
                                print(f"   ✓ Status verification: Campaign status changed to 'draft', archived_at cleared")
                            else:
                                print(f"   ⚠ Status verification failed: Status: {new_status}, archived_at: {new_archived_at}")
                        
                    else:
                        self.log_test(
                            f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/unarchive", 
                            False, 
                            f"Failed to unarchive campaign. Status: {status_code}",
                            response_data
                        )
                    
                    # Test 4: Try to unarchive non-archived campaign (should fail)
                    print("   → Testing unarchive on non-archived campaign...")
                    time.sleep(2)  # Rate limiting protection
                    
                    success, response_data, status_code = self.make_request(
                        "POST", 
                        f"/campaigns/{TEST_CAMPAIGN_ID}/unarchive"
                    )
                    
                    if not success and status_code == 400:
                        error_message = response_data.get("detail", "") if isinstance(response_data, dict) else str(response_data)
                        if "not archived" in error_message:
                            self.log_test(
                                f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/unarchive (not archived)", 
                                True, 
                                f"Correctly prevented unarchiving non-archived campaign: {error_message}"
                            )
                        else:
                            self.log_test(
                                f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/unarchive (not archived)", 
                                False, 
                                f"Wrong error message for non-archived campaign: {error_message}",
                                response_data
                            )
                    else:
                        self.log_test(
                            f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/unarchive (not archived)", 
                            False, 
                            f"Should have prevented unarchiving non-archived campaign. Status: {status_code}",
                            response_data
                        )
                        
                else:
                    self.log_test(
                        f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/archive", 
                        False, 
                        f"Failed to archive campaign. Status: {status_code}",
                        response_data
                    )
                    return  # Can't continue testing unarchive if archive failed
                    
            else:
                print(f"   ℹ Campaign {TEST_CAMPAIGN_ID} is already archived, testing unarchive...")
                
                # Test unarchive on already archived campaign
                time.sleep(2)  # Rate limiting protection
                success, response_data, status_code = self.make_request(
                    "POST", 
                    f"/campaigns/{TEST_CAMPAIGN_ID}/unarchive"
                )
                
                if success and isinstance(response_data, dict):
                    message = response_data.get("message", "No message")
                    self.log_test(
                        f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/unarchive", 
                        True, 
                        f"Campaign unarchived successfully: {message}"
                    )
                else:
                    self.log_test(
                        f"POST /api/campaigns/{TEST_CAMPAIGN_ID}/unarchive", 
                        False, 
                        f"Failed to unarchive campaign. Status: {status_code}",
                        response_data
                    )
        else:
            self.log_test(
                f"GET /api/campaigns/{TEST_CAMPAIGN_ID} (status check)", 
                False, 
                f"Failed to get campaign details. Status: {status_code}",
                response_data
            )
        
        # Test 5: Test with non-existent campaign ID
        print("   → Testing with non-existent campaign...")
        fake_campaign_id = "00000000-0000-0000-0000-000000000000"
        
        time.sleep(2)  # Rate limiting protection
        success, response_data, status_code = self.make_request(
            "POST", 
            f"/campaigns/{fake_campaign_id}/archive"
        )
        
        if not success and status_code == 404:
            self.log_test(
                f"POST /api/campaigns/{fake_campaign_id}/archive (non-existent)", 
                True, 
                "Correctly returned 404 for non-existent campaign"
            )
        else:
            self.log_test(
                f"POST /api/campaigns/{fake_campaign_id}/archive (non-existent)", 
                False, 
                f"Should have returned 404 for non-existent campaign. Status: {status_code}",
                response_data
            )
        
        time.sleep(2)  # Rate limiting protection
        success, response_data, status_code = self.make_request(
            "POST", 
            f"/campaigns/{fake_campaign_id}/unarchive"
        )
        
        if not success and status_code == 404:
            self.log_test(
                f"POST /api/campaigns/{fake_campaign_id}/unarchive (non-existent)", 
                True, 
                "Correctly returned 404 for non-existent campaign"
            )
        else:
            self.log_test(
                f"POST /api/campaigns/{fake_campaign_id}/unarchive (non-existent)", 
                False, 
                f"Should have returned 404 for non-existent campaign. Status: {status_code}",
                response_data
            )
    
    def test_public_page_behavior(self):
        """Test public page behavior for archived campaigns"""
        print("=== TESTING PUBLIC PAGE BEHAVIOR ===")
        
        # Test archived campaign public URL (should return HTTP 410)
        time.sleep(2)  # Rate limiting protection
        success, response_data, status_code = self.make_request(
            "GET", 
            "/public/campaigns/annual-rotary-conference-2025",
            headers={}  # Public endpoint, no auth needed
        )
        
        if status_code == 410:
            error_message = response_data.get("detail", "") if isinstance(response_data, dict) else str(response_data)
            if "This event has ended" in error_message:
                self.log_test(
                    "GET /api/public/campaigns/annual-rotary-conference-2025 (archived)", 
                    True, 
                    f"Correctly returned HTTP 410 for archived campaign: {error_message}"
                )
            else:
                self.log_test(
                    "GET /api/public/campaigns/annual-rotary-conference-2025 (archived)", 
                    False, 
                    f"HTTP 410 returned but wrong message: {error_message}",
                    response_data
                )
        else:
            self.log_test(
                "GET /api/public/campaigns/annual-rotary-conference-2025 (archived)", 
                False, 
                f"Expected HTTP 410 for archived campaign, got {status_code}",
                response_data
            )
        
        # Test draft campaign public URL (should return HTTP 404)
        time.sleep(2)  # Rate limiting protection
        success, response_data, status_code = self.make_request(
            "GET", 
            "/public/campaigns/test",
            headers={}  # Public endpoint, no auth needed
        )
        
        if status_code == 404:
            error_message = response_data.get("detail", "") if isinstance(response_data, dict) else str(response_data)
            if "Campaign not found or not active" in error_message:
                self.log_test(
                    "GET /api/public/campaigns/test (draft)", 
                    True, 
                    f"Correctly returned HTTP 404 for draft campaign: {error_message}"
                )
            else:
                self.log_test(
                    "GET /api/public/campaigns/test (draft)", 
                    False, 
                    f"HTTP 404 returned but wrong message: {error_message}",
                    response_data
                )
        else:
            self.log_test(
                "GET /api/public/campaigns/test (draft)", 
                False, 
                f"Expected HTTP 404 for draft campaign, got {status_code}",
                response_data
            )
    
    def run_tests(self):
        """Run all archive/unarchive tests"""
        print("🚀 STARTING CAMPAIGN ARCHIVE/UNARCHIVE API TESTING")
        print("=" * 80)
        print(f"Base URL: {BASE_URL}")
        print(f"Test Campaign ID: {TEST_CAMPAIGN_ID}")
        print(f"Archived Campaign ID: {ARCHIVED_CAMPAIGN_ID}")
        print("=" * 80)
        
        if not self.login():
            print("❌ Authentication failed, cannot continue testing")
            return
        
        self.test_archive_unarchive_apis()
        self.test_public_page_behavior()
        
        # Print summary
        print("=" * 80)
        print("🏁 ARCHIVE/UNARCHIVE TEST SUMMARY")
        print("=" * 80)
        
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
        
        print("\n🎯 Archive/Unarchive API testing completed!")

if __name__ == "__main__":
    tester = ArchiveUnarchiveTester()
    tester.run_tests()