#!/usr/bin/env python3
"""
Focused Kiosk Mode Testing Script for Review Request
Tests the specific Kiosk Mode functionality for the "Test" campaign
"""

import requests
import json
import sys
from typing import Dict, Any, Optional
import time

# Configuration
BASE_URL = "https://kioskflow.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "email": "pranav@kaizeninfotech.com",
    "password": "Kaizentest1234"
}
KIOSK_CAMPAIGN_ID = "4f2c49e0-65a2-46d5-8986-59cc8678cbed"

class KioskTester:
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
    
    def test_kiosk_mode_review_scenarios(self):
        """Test Kiosk Mode functionality for the 'Test' campaign as per review request"""
        print("=== TESTING KIOSK MODE REVIEW SCENARIOS ===")
        
        created_registration_id = None
        
        # Test 1: Get Kiosk Campaign Info
        print("Test 1: Get Kiosk Campaign Info")
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/info"
        )
        
        if success and isinstance(response_data, dict):
            required_fields = ["id", "name", "organization_name", "campaign_type", "payment_collection_method", "base_price", "form_fields"]
            missing_fields = [field for field in required_fields if field not in response_data]
            
            if not missing_fields:
                campaign_name = response_data.get("name", "Unknown")
                payment_method = response_data.get("payment_collection_method", "offline")
                base_price = response_data.get("base_price", 0)
                form_fields_count = len(response_data.get("form_fields", []))
                
                self.log_test(
                    f"GET /api/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/info", 
                    True, 
                    f"Campaign info retrieved: {campaign_name}, Payment: {payment_method}, Base Price: ₹{base_price}, Form Fields: {form_fields_count}"
                )
            else:
                self.log_test(
                    f"GET /api/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/info", 
                    False, 
                    f"Missing required fields: {missing_fields}",
                    response_data
                )
        else:
            self.log_test(
                f"GET /api/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/info", 
                False, 
                f"Failed to get kiosk campaign info. Status: {status_code}",
                response_data
            )
        
        # Small delay to avoid rate limiting
        time.sleep(1)
        
        # Test 2: Get Initial Kiosk Stats
        print("Test 2: Get Initial Kiosk Stats")
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/stats"
        )
        
        initial_paid_count = 0
        initial_pending_count = 0
        initial_revenue = 0
        
        if success and isinstance(response_data, dict):
            stats = response_data.get("stats", {})
            initial_paid_count = stats.get("completed_payments", 0)
            initial_pending_count = stats.get("pending_payment", 0)
            initial_revenue = stats.get("total_revenue", 0)
            
            self.log_test(
                f"GET /api/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/stats (initial)", 
                True, 
                f"Initial stats - Paid: {initial_paid_count}, Pending: {initial_pending_count}, Revenue: ₹{initial_revenue}"
            )
        else:
            self.log_test(
                f"GET /api/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/stats (initial)", 
                False, 
                f"Failed to get initial kiosk stats. Status: {status_code}",
                response_data
            )
        
        time.sleep(1)
        
        # Test 3: Search Registrants
        print("Test 3: Search Registrants")
        search_payload = {
            "query": "jane",
            "campaign_id": KIOSK_CAMPAIGN_ID
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/kiosk/search", 
            search_payload
        )
        
        if success and isinstance(response_data, list):
            results_count = len(response_data)
            self.log_test(
                "POST /api/kiosk/search", 
                True, 
                f"Search completed: {results_count} results found for 'jane'"
            )
            
            # Check result structure if results exist
            if results_count > 0:
                sample_result = response_data[0]
                result_fields = ["name", "email", "phone", "status", "amount_due"]
                result_missing = [field for field in result_fields if field not in sample_result]
                
                if not result_missing:
                    print(f"   ✓ Search result structure correct: {sample_result.get('name')} ({sample_result.get('status')})")
                else:
                    print(f"   ⚠ Search result missing fields: {result_missing}")
        else:
            self.log_test(
                "POST /api/kiosk/search", 
                False, 
                f"Failed to search registrants. Status: {status_code}",
                response_data
            )
        
        time.sleep(1)
        
        # Test 4: Create Walk-in Registration
        print("Test 4: Create Walk-in Registration")
        registration_payload = {
            "campaign_id": KIOSK_CAMPAIGN_ID,
            "form_data": {
                "name": "Kiosk Test Backend",
                "email": "kiosktest@example.com"
            },
            "total_amount": 100
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/kiosk/register", 
            registration_payload
        )
        
        if success and isinstance(response_data, dict):
            required_fields = ["registration_id", "invoice_number", "registrant_name", "amount_due"]
            missing_fields = [field for field in required_fields if field not in response_data]
            
            if not missing_fields:
                created_registration_id = response_data.get("registration_id")
                invoice_number = response_data.get("invoice_number")
                registrant_name = response_data.get("registrant_name")
                amount_due = response_data.get("amount_due")
                
                self.log_test(
                    "POST /api/kiosk/register", 
                    True, 
                    f"Walk-in registration created: {registrant_name}, Invoice: {invoice_number}, Amount: ₹{amount_due}, ID: {created_registration_id}"
                )
            else:
                self.log_test(
                    "POST /api/kiosk/register", 
                    False, 
                    f"Missing required fields: {missing_fields}",
                    response_data
                )
        else:
            self.log_test(
                "POST /api/kiosk/register", 
                False, 
                f"Failed to create walk-in registration. Status: {status_code}",
                response_data
            )
        
        time.sleep(1)
        
        # Test 5: Confirm Payment (Check-in) - only if registration was created
        if created_registration_id:
            print("Test 5: Confirm Payment (Check-in)")
            payment_payload = {
                "registration_id": created_registration_id,
                "amount_received": 100,
                "payment_method": "cash"
            }
            
            success, response_data, status_code = self.make_request(
                "POST", 
                "/kiosk/confirm-payment", 
                payment_payload
            )
            
            if success and isinstance(response_data, dict):
                required_fields = ["registration_id", "receipt_number", "registrant_name", "amount_received"]
                missing_fields = [field for field in required_fields if field not in response_data]
                
                if not missing_fields:
                    receipt_number = response_data.get("receipt_number")
                    registrant_name = response_data.get("registrant_name")
                    amount_received = response_data.get("amount_received")
                    payment_method = response_data.get("payment_method")
                    
                    self.log_test(
                        "POST /api/kiosk/confirm-payment", 
                        True, 
                        f"Payment confirmed: {registrant_name}, Receipt: {receipt_number}, Amount: ₹{amount_received} ({payment_method})"
                    )
                else:
                    self.log_test(
                        "POST /api/kiosk/confirm-payment", 
                        False, 
                        f"Missing required fields: {missing_fields}",
                        response_data
                    )
            else:
                self.log_test(
                    "POST /api/kiosk/confirm-payment", 
                    False, 
                    f"Failed to confirm payment. Status: {status_code}",
                    response_data
                )
        
        time.sleep(1)
        
        # Test 6: Verify Stats Updated
        print("Test 6: Verify Stats Updated")
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/stats"
        )
        
        if success and isinstance(response_data, dict):
            stats = response_data.get("stats", {})
            final_paid_count = stats.get("completed_payments", 0)
            final_pending_count = stats.get("pending_payment", 0)
            final_revenue = stats.get("total_revenue", 0)
            
            # Check if stats increased
            paid_increased = final_paid_count > initial_paid_count
            revenue_increased = final_revenue > initial_revenue
            
            self.log_test(
                f"GET /api/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/stats (final)", 
                True, 
                f"Final stats - Paid: {final_paid_count} (↑{final_paid_count - initial_paid_count}), Pending: {final_pending_count}, Revenue: ₹{final_revenue} (↑₹{final_revenue - initial_revenue})"
            )
            
            if created_registration_id and paid_increased and revenue_increased:
                print("   ✓ Stats correctly updated after payment confirmation")
            elif created_registration_id:
                print("   ⚠ Stats may not have updated correctly after payment confirmation")
                
        else:
            self.log_test(
                f"GET /api/kiosk/campaigns/{KIOSK_CAMPAIGN_ID}/stats (final)", 
                False, 
                f"Failed to get final kiosk stats. Status: {status_code}",
                response_data
            )
    
    def run_tests(self):
        """Run the focused kiosk mode tests"""
        print("🚀 STARTING FOCUSED KIOSK MODE TESTING")
        print("=" * 60)
        print(f"Base URL: {BASE_URL}")
        print(f"Campaign ID: {KIOSK_CAMPAIGN_ID}")
        print("=" * 60)
        
        # Login first
        if not self.login():
            print("❌ Authentication failed - stopping tests")
            return False
        
        # Run kiosk mode tests
        self.test_kiosk_mode_review_scenarios()
        
        # Print summary
        print("=" * 60)
        print("🏁 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {total - passed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        # Show failed tests
        failed_tests = [result for result in self.test_results if not result["success"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['details']}")
        
        return passed == total

if __name__ == "__main__":
    tester = KioskTester()
    success = tester.run_tests()
    sys.exit(0 if success else 1)