#!/usr/bin/env python3
"""
Focused test for Offline Payments Feature
Tests the complete offline payments flow as per review request
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
TEST_CAMPAIGN_ID = "4f2c49e0-65a2-46d5-8986-59cc8678cbed"

class OfflinePaymentsTester:
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
    
    def test_authentication(self):
        """Test login and get access token"""
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
    
    def test_offline_payments_complete_flow(self):
        """Test complete offline payments flow"""
        print("=== OFFLINE PAYMENTS FEATURE TESTING ===")
        
        # Test 1: Enable Offline Payments on Campaign
        print("1. Enabling offline payments on campaign...")
        payment_config_payload = {
            "payment_config": {
                "allow_offline_payments": True,
                "offline_payment_deadline_date": "2026-03-01T23:59:59Z"
            }
        }
        
        success, response_data, status_code = self.make_request(
            "PUT", 
            f"/campaigns/{TEST_CAMPAIGN_ID}", 
            payment_config_payload
        )
        
        if success and isinstance(response_data, dict):
            payment_config = response_data.get("payment_config", {})
            allow_offline = payment_config.get("allow_offline_payments", False)
            deadline = payment_config.get("offline_payment_deadline_date")
            
            self.log_test(
                f"PUT /api/campaigns/{TEST_CAMPAIGN_ID} (enable offline payments)", 
                True, 
                f"Offline payments enabled: {allow_offline}, Deadline: {deadline}"
            )
        else:
            self.log_test(
                f"PUT /api/campaigns/{TEST_CAMPAIGN_ID} (enable offline payments)", 
                False, 
                f"Failed to enable offline payments. Status: {status_code}",
                response_data
            )
            return False
        
        # Test 2: Submit Offline Registration (PUBLIC endpoint)
        print("2. Submitting offline registration...")
        offline_registration_payload = {
            "campaign_id": TEST_CAMPAIGN_ID,
            "form_data": {
                "name": "Test Offline User",
                "email": "testoffline@example.com",
                "phone": "9876543210"
            },
            "total_amount": 100.00
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/registrations/offline/submit", 
            offline_registration_payload,
            headers={}  # Public endpoint, no auth needed
        )
        
        registration_id = None
        otp = None
        
        if success and isinstance(response_data, dict):
            registration_id = response_data.get("registration_id")
            otp = response_data.get("otp")
            otp_expires_at = response_data.get("otp_expires_at")
            email_sent = response_data.get("email_sent", False)
            amount_due = response_data.get("amount_due", 0)
            
            if registration_id and otp:
                self.log_test(
                    "POST /api/registrations/offline/submit", 
                    True, 
                    f"Offline registration created. ID: {registration_id[:8]}, OTP: {otp}, Amount: ₹{amount_due}, Email sent: {email_sent}"
                )
            else:
                self.log_test(
                    "POST /api/registrations/offline/submit", 
                    False, 
                    "Missing registration_id or otp in response",
                    response_data
                )
                return False
        else:
            self.log_test(
                "POST /api/registrations/offline/submit", 
                False, 
                f"Failed to submit offline registration. Status: {status_code}",
                response_data
            )
            return False
        
        # Test 3: Verify OTP (requires auth)
        print("3. Verifying OTP...")
        otp_verify_payload = {
            "otp": otp,
            "campaign_id": TEST_CAMPAIGN_ID
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/registrations/offline/verify-otp", 
            otp_verify_payload
        )
        
        if success and isinstance(response_data, dict):
            registrant_name = response_data.get("registrant_name")
            registrant_email = response_data.get("registrant_email")
            amount_due = response_data.get("amount_due", 0)
            otp_verified = response_data.get("otp_verified", False)
            
            if otp_verified:
                self.log_test(
                    "POST /api/registrations/offline/verify-otp", 
                    True, 
                    f"OTP verified successfully. Registrant: {registrant_name} ({registrant_email}), Amount due: ₹{amount_due}"
                )
            else:
                self.log_test(
                    "POST /api/registrations/offline/verify-otp", 
                    False, 
                    "OTP verification failed - otp_verified is False",
                    response_data
                )
        else:
            self.log_test(
                "POST /api/registrations/offline/verify-otp", 
                False, 
                f"Failed to verify OTP. Status: {status_code}",
                response_data
            )
        
        # Test 4: Confirm Payment (requires auth)
        print("4. Confirming payment...")
        confirm_payment_payload = {
            "registration_id": registration_id,
            "amount_received": 100.00,
            "notes": "Cash received at desk"
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/registrations/offline/confirm-payment", 
            confirm_payment_payload
        )
        
        if success and isinstance(response_data, dict):
            receipt_number = response_data.get("receipt_number")
            payment_confirmed_at = response_data.get("payment_confirmed_at")
            message = response_data.get("message", "")
            
            self.log_test(
                "POST /api/registrations/offline/confirm-payment", 
                True, 
                f"Payment confirmed. Receipt: {receipt_number}, Confirmed at: {payment_confirmed_at}"
            )
        else:
            self.log_test(
                "POST /api/registrations/offline/confirm-payment", 
                False, 
                f"Failed to confirm payment. Status: {status_code}",
                response_data
            )
        
        # Test 5: Get Pending Offline Payments (requires auth)
        print("5. Checking pending offline payments...")
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/campaigns/{TEST_CAMPAIGN_ID}/offline-payments/pending"
        )
        
        if success and isinstance(response_data, list):
            pending_count = len(response_data)
            self.log_test(
                f"GET /api/campaigns/{TEST_CAMPAIGN_ID}/offline-payments/pending", 
                True, 
                f"Retrieved {pending_count} pending offline payments"
            )
            
            # Should be empty after confirmation
            if pending_count == 0:
                print("   ✓ No pending payments found (expected after confirmation)")
            else:
                print(f"   ⚠ {pending_count} pending payments still found")
        else:
            self.log_test(
                f"GET /api/campaigns/{TEST_CAMPAIGN_ID}/offline-payments/pending", 
                False, 
                f"Failed to get pending payments. Status: {status_code}",
                response_data
            )
        
        # Test 6: Test Invalid OTP (requires auth)
        print("6. Testing invalid OTP...")
        invalid_otp_payload = {
            "otp": "000000",
            "campaign_id": TEST_CAMPAIGN_ID
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/registrations/offline/verify-otp", 
            invalid_otp_payload
        )
        
        if not success and status_code == 404:
            self.log_test(
                "POST /api/registrations/offline/verify-otp (invalid OTP)", 
                True, 
                "Correctly rejected invalid OTP with 404"
            )
        else:
            self.log_test(
                "POST /api/registrations/offline/verify-otp (invalid OTP)", 
                False, 
                f"Should have rejected invalid OTP with 404. Status: {status_code}",
                response_data
            )
        
        # Test 7: Submit another offline registration for no-show test
        print("7. Creating registration for no-show test...")
        no_show_registration_payload = {
            "campaign_id": TEST_CAMPAIGN_ID,
            "form_data": {
                "name": "No Show User",
                "email": "noshow@example.com",
                "phone": "9876543211"
            },
            "total_amount": 100.00
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/registrations/offline/submit", 
            no_show_registration_payload,
            headers={}  # Public endpoint
        )
        
        no_show_registration_id = None
        if success and isinstance(response_data, dict):
            no_show_registration_id = response_data.get("registration_id")
            self.log_test(
                "POST /api/registrations/offline/submit (for no-show test)", 
                True, 
                f"Second offline registration created for no-show test: {no_show_registration_id[:8] if no_show_registration_id else 'N/A'}"
            )
            
            # Test mark as no-show
            if no_show_registration_id:
                print("8. Marking registration as no-show...")
                success, response_data, status_code = self.make_request(
                    "POST", 
                    f"/registrations/{no_show_registration_id}/mark-no-show"
                )
                
                if success:
                    message = response_data.get("message", "") if isinstance(response_data, dict) else "Marked as no-show"
                    self.log_test(
                        f"POST /api/registrations/{no_show_registration_id}/mark-no-show", 
                        True, 
                        f"Successfully marked as no-show: {message}"
                    )
                else:
                    self.log_test(
                        f"POST /api/registrations/{no_show_registration_id}/mark-no-show", 
                        False, 
                        f"Failed to mark as no-show. Status: {status_code}",
                        response_data
                    )
        else:
            self.log_test(
                "POST /api/registrations/offline/submit (for no-show test)", 
                False, 
                f"Failed to create second registration. Status: {status_code}",
                response_data
            )
        
        # Test 8: Verify Public Campaign Endpoint includes payment_config
        print("9. Verifying public campaign endpoint includes payment_config...")
        success, response_data, status_code = self.make_request(
            "GET", 
            "/public/campaigns/test",
            headers={}  # Public endpoint, no auth needed
        )
        
        if success and isinstance(response_data, dict):
            payment_config = response_data.get("payment_config")
            if payment_config and payment_config.get("allow_offline_payments"):
                deadline = payment_config.get("offline_payment_deadline_date")
                self.log_test(
                    "GET /api/public/campaigns/test (payment_config check)", 
                    True, 
                    f"Public campaign includes payment_config with offline payments enabled, deadline: {deadline}"
                )
            else:
                self.log_test(
                    "GET /api/public/campaigns/test (payment_config check)", 
                    False, 
                    "payment_config missing or offline payments not enabled",
                    response_data
                )
        else:
            self.log_test(
                "GET /api/public/campaigns/test (payment_config check)", 
                False, 
                f"Failed to get public campaign. Status: {status_code}",
                response_data
            )
        
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("=" * 80)
        print("🏁 OFFLINE PAYMENTS TEST SUMMARY")
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
        
        print("\n" + "=" * 80)
    
    def run_tests(self):
        """Run all offline payments tests"""
        print("🚀 OFFLINE PAYMENTS FEATURE TESTING")
        print("=" * 80)
        print(f"Base URL: {BASE_URL}")
        print(f"Test Campaign ID: {TEST_CAMPAIGN_ID}")
        print("=" * 80)
        
        # Authenticate first
        if not self.test_authentication():
            print("❌ Authentication failed - stopping tests")
            return False
        
        # Run offline payments tests
        self.test_offline_payments_complete_flow()
        
        # Print summary
        self.print_summary()
        
        return True

if __name__ == "__main__":
    tester = OfflinePaymentsTester()
    success = tester.run_tests()
    sys.exit(0 if success else 1)