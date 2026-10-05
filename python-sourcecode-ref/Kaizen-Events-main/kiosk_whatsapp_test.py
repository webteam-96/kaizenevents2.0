#!/usr/bin/env python3
"""
Focused test for Kiosk Mode and WhatsApp Integration endpoints
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

class KioskWhatsAppTester:
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
            print(f"❌ Login failed: {response_data}")
            return False

    def test_kiosk_mode_endpoints(self):
        """Test Kiosk Mode endpoints for on-site registration operations"""
        print("=== TESTING KIOSK MODE ENDPOINTS ===")
        
        # Test 1: Get Kiosk Campaign Info
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/kiosk/campaigns/{TEST_CAMPAIGN_ID}/info"
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
                    f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/info", 
                    True, 
                    f"Campaign info retrieved: {campaign_name}, Payment: {payment_method}, Base Price: ₹{base_price}, Form Fields: {form_fields_count}"
                )
            else:
                self.log_test(
                    f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/info", 
                    False, 
                    f"Missing required fields: {missing_fields}",
                    response_data
                )
        else:
            self.log_test(
                f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/info", 
                False, 
                f"Failed to get kiosk campaign info. Status: {status_code}",
                response_data
            )
        
        # Test 2: Search Registrants
        search_payload = {
            "query": "Jane",
            "campaign_id": TEST_CAMPAIGN_ID
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
                f"Search completed: {results_count} results found for 'Jane'"
            )
            
            # Check result structure if results exist
            if results_count > 0:
                sample_result = response_data[0]
                result_fields = ["name", "email", "phone", "status", "amount_due", "is_new"]
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
        
        # Test 3: Create New Walk-in Registration
        registration_payload = {
            "campaign_id": TEST_CAMPAIGN_ID,
            "form_data": {
                "name": "Walk-in User Test",
                "email": "walkintest@test.com",
                "phone": "9999999998"
            },
            "total_amount": 100.00
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/kiosk/register", 
            registration_payload
        )
        
        created_registration_id = None
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
                    f"Walk-in registration created: {registrant_name}, Invoice: {invoice_number}, Amount: ₹{amount_due}"
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
        
        # Test 4: Confirm Payment at Kiosk (only if registration was created)
        if created_registration_id:
            payment_payload = {
                "registration_id": created_registration_id,
                "amount_received": 100.00,
                "payment_method": "cash",
                "notes": "Collected at kiosk"
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
        
        # Test 5: Get Kiosk Stats
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/kiosk/campaigns/{TEST_CAMPAIGN_ID}/stats"
        )
        
        if success and isinstance(response_data, dict):
            required_fields = ["campaign_id", "campaign_name", "stats"]
            missing_fields = [field for field in required_fields if field not in response_data]
            
            if not missing_fields:
                stats = response_data.get("stats", {})
                stats_fields = ["total_registrations", "checked_in", "pending_payment", "total_revenue", "kiosk_revenue"]
                stats_missing = [field for field in stats_fields if field not in stats]
                
                if not stats_missing:
                    campaign_name = response_data.get("campaign_name")
                    total_reg = stats.get("total_registrations", 0)
                    checked_in = stats.get("checked_in", 0)
                    pending_payment = stats.get("pending_payment", 0)
                    total_revenue = stats.get("total_revenue", 0)
                    kiosk_revenue = stats.get("kiosk_revenue", 0)
                    
                    self.log_test(
                        f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/stats", 
                        True, 
                        f"Kiosk stats for {campaign_name}: {total_reg} registrations, {checked_in} checked in, {pending_payment} pending payment, ₹{total_revenue} total revenue, ₹{kiosk_revenue} kiosk revenue"
                    )
                else:
                    self.log_test(
                        f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/stats", 
                        False, 
                        f"Stats missing required fields: {stats_missing}",
                        response_data
                    )
            else:
                self.log_test(
                    f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/stats", 
                    False, 
                    f"Missing required fields: {missing_fields}",
                    response_data
                )
        else:
            self.log_test(
                f"GET /api/kiosk/campaigns/{TEST_CAMPAIGN_ID}/stats", 
                False, 
                f"Failed to get kiosk stats. Status: {status_code}",
                response_data
            )

    def test_whatsapp_integration_endpoints(self):
        """Test WhatsApp Integration endpoints"""
        print("=== TESTING WHATSAPP INTEGRATION ENDPOINTS ===")
        
        # Test 1: Get Template Guide
        success, response_data, status_code = self.make_request(
            "GET", 
            "/whatsapp/template-guide"
        )
        
        if success and isinstance(response_data, dict):
            required_fields = ["title", "provider", "instructions", "variables", "sample_template", "notes"]
            missing_fields = [field for field in required_fields if field not in response_data]
            
            if not missing_fields:
                title = response_data.get("title")
                provider = response_data.get("provider")
                variables = response_data.get("variables", [])
                instructions_count = len(response_data.get("instructions", []))
                
                self.log_test(
                    "GET /api/whatsapp/template-guide", 
                    True, 
                    f"Template guide retrieved: {title} for {provider}, {len(variables)} variables, {instructions_count} instructions"
                )
                
                # Verify all 5 variables are documented
                expected_variables = ["{{1}}", "{{2}}", "{{3}}", "{{4}}", "{{5}}"]
                documented_variables = [var.get("placeholder") for var in variables]
                
                if all(var in documented_variables for var in expected_variables):
                    print("   ✓ All 5 WhatsApp template variables documented correctly")
                    
                    # Check variable mappings
                    variable_mappings = {var.get("placeholder"): var.get("maps_to") for var in variables}
                    expected_mappings = {
                        "{{1}}": "member_name",
                        "{{2}}": "event_name", 
                        "{{3}}": "registration_link",
                        "{{4}}": "organization_name",
                        "{{5}}": "registration_fee"
                    }
                    
                    mapping_correct = all(
                        variable_mappings.get(placeholder) == expected_mapping 
                        for placeholder, expected_mapping in expected_mappings.items()
                    )
                    
                    if mapping_correct:
                        print("   ✓ Variable mappings are correct")
                    else:
                        print("   ⚠ Some variable mappings may be incorrect")
                        
                else:
                    missing_vars = [var for var in expected_variables if var not in documented_variables]
                    print(f"   ⚠ Missing template variables: {missing_vars}")
                    
            else:
                self.log_test(
                    "GET /api/whatsapp/template-guide", 
                    False, 
                    f"Missing required fields: {missing_fields}",
                    response_data
                )
        else:
            self.log_test(
                "GET /api/whatsapp/template-guide", 
                False, 
                f"Failed to get WhatsApp template guide. Status: {status_code}",
                response_data
            )

    def test_campaign_payment_collection_method(self):
        """Test updating campaign with payment_collection_method"""
        print("=== TESTING CAMPAIGN PAYMENT COLLECTION METHOD ===")
        
        # Test 1: Update Campaign to Offline Mode
        update_payload = {
            "payment_collection_method": "offline"
        }
        
        success, response_data, status_code = self.make_request(
            "PUT", 
            f"/campaigns/{TEST_CAMPAIGN_ID}", 
            update_payload
        )
        
        if success and isinstance(response_data, dict):
            payment_method = response_data.get("payment_collection_method")
            campaign_name = response_data.get("name", "Unknown")
            
            if payment_method == "offline":
                self.log_test(
                    f"PUT /api/campaigns/{TEST_CAMPAIGN_ID} (payment_collection_method)", 
                    True, 
                    f"Campaign '{campaign_name}' updated to offline payment collection method"
                )
            else:
                self.log_test(
                    f"PUT /api/campaigns/{TEST_CAMPAIGN_ID} (payment_collection_method)", 
                    False, 
                    f"Payment collection method not updated correctly. Expected: offline, Got: {payment_method}",
                    response_data
                )
        else:
            self.log_test(
                f"PUT /api/campaigns/{TEST_CAMPAIGN_ID} (payment_collection_method)", 
                False, 
                f"Failed to update campaign payment collection method. Status: {status_code}",
                response_data
            )
        
        # Test 2: Verify the update by getting campaign details
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/campaigns/{TEST_CAMPAIGN_ID}"
        )
        
        if success and isinstance(response_data, dict):
            payment_method = response_data.get("payment_collection_method")
            
            if payment_method == "offline":
                self.log_test(
                    f"GET /api/campaigns/{TEST_CAMPAIGN_ID} (verify payment_collection_method)", 
                    True, 
                    f"Payment collection method verified as offline"
                )
            else:
                self.log_test(
                    f"GET /api/campaigns/{TEST_CAMPAIGN_ID} (verify payment_collection_method)", 
                    False, 
                    f"Payment collection method verification failed. Expected: offline, Got: {payment_method}",
                    response_data
                )
        else:
            self.log_test(
                f"GET /api/campaigns/{TEST_CAMPAIGN_ID} (verify payment_collection_method)", 
                False, 
                f"Failed to verify campaign payment collection method. Status: {status_code}",
                response_data
            )

    def run_tests(self):
        """Run all tests"""
        print("🚀 TESTING KIOSK MODE AND WHATSAPP INTEGRATION")
        print("=" * 60)
        print(f"Base URL: {BASE_URL}")
        print(f"Test Campaign ID: {TEST_CAMPAIGN_ID}")
        print("=" * 60)
        
        if not self.login():
            return False
        
        self.test_kiosk_mode_endpoints()
        self.test_whatsapp_integration_endpoints()
        self.test_campaign_payment_collection_method()
        
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
    tester = KioskWhatsAppTester()
    success = tester.run_tests()
    sys.exit(0 if success else 1)