#!/usr/bin/env python3
"""
Focused test for Archived Campaign Public Page feature (410 Gone Status)
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://kioskflow.preview.emergentagent.com/api"

class ArchivedCampaignTester:
    def __init__(self):
        self.session = requests.Session()
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
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, headers=headers)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, headers=headers)
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
    
    def test_archived_campaign_public_page(self):
        """Test Archived Campaign Public Page feature (410 Gone Status)"""
        print("=== TESTING ARCHIVED CAMPAIGN PUBLIC PAGE (410 GONE STATUS) ===")
        
        # Test 1: Access archived campaign - expect HTTP 410
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
        
        # Test 2: Access draft campaign - expect HTTP 404
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
        
        # Test 3: Access non-existent campaign - expect HTTP 404
        success, response_data, status_code = self.make_request(
            "GET", 
            "/public/campaigns/non-existent-campaign",
            headers={}  # Public endpoint, no auth needed
        )
        
        if status_code == 404:
            error_message = response_data.get("detail", "") if isinstance(response_data, dict) else str(response_data)
            if "Campaign not found" in error_message:
                self.log_test(
                    "GET /api/public/campaigns/non-existent-campaign (non-existent)", 
                    True, 
                    f"Correctly returned HTTP 404 for non-existent campaign: {error_message}"
                )
            else:
                self.log_test(
                    "GET /api/public/campaigns/non-existent-campaign (non-existent)", 
                    False, 
                    f"HTTP 404 returned but wrong message: {error_message}",
                    response_data
                )
        else:
            self.log_test(
                "GET /api/public/campaigns/non-existent-campaign (non-existent)", 
                False, 
                f"Expected HTTP 404 for non-existent campaign, got {status_code}",
                response_data
            )
        
        # Test 4: Test landing-page endpoint with archived campaign - expect HTTP 410
        success, response_data, status_code = self.make_request(
            "GET", 
            "/public/campaigns/annual-rotary-conference-2025/landing-page",
            headers={}  # Public endpoint, no auth needed
        )
        
        if status_code == 410:
            error_message = response_data.get("detail", "") if isinstance(response_data, dict) else str(response_data)
            if "This event has ended" in error_message:
                self.log_test(
                    "GET /api/public/campaigns/annual-rotary-conference-2025/landing-page (archived)", 
                    True, 
                    f"Correctly returned HTTP 410 for archived campaign landing page: {error_message}"
                )
            else:
                self.log_test(
                    "GET /api/public/campaigns/annual-rotary-conference-2025/landing-page (archived)", 
                    False, 
                    f"HTTP 410 returned but wrong message: {error_message}",
                    response_data
                )
        else:
            self.log_test(
                "GET /api/public/campaigns/annual-rotary-conference-2025/landing-page (archived)", 
                False, 
                f"Expected HTTP 410 for archived campaign landing page, got {status_code}",
                response_data
            )
        
        # Test 5: Test landing-page endpoint with draft campaign - expect HTTP 404
        success, response_data, status_code = self.make_request(
            "GET", 
            "/public/campaigns/test/landing-page",
            headers={}  # Public endpoint, no auth needed
        )
        
        if status_code == 404:
            error_message = response_data.get("detail", "") if isinstance(response_data, dict) else str(response_data)
            if "Campaign not found or not active" in error_message:
                self.log_test(
                    "GET /api/public/campaigns/test/landing-page (draft)", 
                    True, 
                    f"Correctly returned HTTP 404 for draft campaign landing page: {error_message}"
                )
            else:
                self.log_test(
                    "GET /api/public/campaigns/test/landing-page (draft)", 
                    False, 
                    f"HTTP 404 returned but wrong message: {error_message}",
                    response_data
                )
        else:
            self.log_test(
                "GET /api/public/campaigns/test/landing-page (draft)", 
                False, 
                f"Expected HTTP 404 for draft campaign landing page, got {status_code}",
                response_data
            )
        
        # Test 6: Test landing-page endpoint with non-existent campaign - expect HTTP 404
        success, response_data, status_code = self.make_request(
            "GET", 
            "/public/campaigns/non-existent-campaign/landing-page",
            headers={}  # Public endpoint, no auth needed
        )
        
        if status_code == 404:
            error_message = response_data.get("detail", "") if isinstance(response_data, dict) else str(response_data)
            if "Campaign not found" in error_message:
                self.log_test(
                    "GET /api/public/campaigns/non-existent-campaign/landing-page (non-existent)", 
                    True, 
                    f"Correctly returned HTTP 404 for non-existent campaign landing page: {error_message}"
                )
            else:
                self.log_test(
                    "GET /api/public/campaigns/non-existent-campaign/landing-page (non-existent)", 
                    False, 
                    f"HTTP 404 returned but wrong message: {error_message}",
                    response_data
                )
        else:
            self.log_test(
                "GET /api/public/campaigns/non-existent-campaign/landing-page (non-existent)", 
                False, 
                f"Expected HTTP 404 for non-existent campaign landing page, got {status_code}",
                response_data
            )
    
    def print_summary(self):
        """Print test summary"""
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print("=" * 80)
        print("🏁 ARCHIVED CAMPAIGN TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   - {result['test']}: {result['details']}")
        
        print("\n🎯 Archived Campaign Public Page testing completed!")

if __name__ == "__main__":
    tester = ArchivedCampaignTester()
    tester.test_archived_campaign_public_page()
    tester.print_summary()