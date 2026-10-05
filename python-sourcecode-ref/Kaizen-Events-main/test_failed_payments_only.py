#!/usr/bin/env python3
"""
Test only the Failed Payment Tracking feature
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

class FailedPaymentTester:
    def __init__(self):
        self.session = requests.Session()
        self.access_token = None
        
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
    
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
    
    def test_failed_payment_tracking(self):
        """Test Failed Payment Tracking feature"""
        print("=== TESTING FAILED PAYMENT TRACKING FEATURE ===")
        
        # Test 1: Get initial analytics to check structure
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/campaigns/{TEST_CAMPAIGN_ID}/analytics"
        )
        
        if success and isinstance(response_data, dict):
            # Check for required fields including new failed payment fields
            required_fields = [
                "total_registrations", "paid_registrations", "pending_registrations", 
                "failed_registrations", "total_revenue", "average_registration_value",
                "registration_by_date", "failed_payments"
            ]
            missing_fields = [field for field in required_fields if field not in response_data]
            
            if not missing_fields:
                initial_failed_count = response_data.get("failed_registrations", 0)
                initial_failed_payments = response_data.get("failed_payments", [])
                
                self.log_test(
                    f"GET /api/campaigns/{TEST_CAMPAIGN_ID}/analytics (initial)", 
                    True, 
                    f"Analytics endpoint includes failed payment tracking. Initial failed registrations: {initial_failed_count}, failed payments list: {len(initial_failed_payments)} items"
                )
                
                # Verify failed_payments structure if any exist
                if initial_failed_payments:
                    sample_payment = initial_failed_payments[0]
                    expected_fields = ["id", "name", "email", "phone", "amount", "created_at", "gateway"]
                    payment_missing = [field for field in expected_fields if field not in sample_payment]
                    
                    if not payment_missing:
                        print("   ✓ Failed payment info structure is correct")
                    else:
                        print(f"   ⚠ Failed payment info missing fields: {payment_missing}")
                        
            else:
                self.log_test(
                    f"GET /api/campaigns/{TEST_CAMPAIGN_ID}/analytics (initial)", 
                    False, 
                    f"Missing required fields: {missing_fields}",
                    response_data
                )
                return
        else:
            self.log_test(
                f"GET /api/campaigns/{TEST_CAMPAIGN_ID}/analytics (initial)", 
                False, 
                f"Failed to get analytics. Status: {status_code}",
                response_data
            )
            return
        
        # Test 2: Create a registration to test failed payment flow
        registration_payload = {
            "campaign_id": TEST_CAMPAIGN_ID,
            "form_data": {
                "name": "John Doe",
                "email": "john.doe@example.com",
                "phone": "+1234567890",
                "organization": "Test Company"
            },
            "total_amount": 150.0,
            "coupon_code": None
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/registrations/submit", 
            registration_payload,
            headers={}  # Public endpoint, no auth needed
        )
        
        registration_id = None
        if success and isinstance(response_data, dict) and "id" in response_data:
            registration_id = response_data["id"]
            payment_status = response_data.get("payment_status", "unknown")
            total_amount = response_data.get("total_amount", 0)
            
            self.log_test(
                "POST /api/registrations/submit", 
                True, 
                f"Registration created: {registration_id}, Status: {payment_status}, Amount: ${total_amount}"
            )
        else:
            self.log_test(
                "POST /api/registrations/submit", 
                False, 
                f"Failed to create registration. Status: {status_code}",
                response_data
            )
            return
        
        # Test 3: Simulate failed payment via callback
        if registration_id:
            callback_payload = {
                "registration_id": registration_id,
                "payment_id": f"pay_failed_{registration_id[:8]}",
                "payment_gateway": "instamojo",
                "status": "failed",
                "amount": 150.0
            }
            
            success, response_data, status_code = self.make_request(
                "POST", 
                "/registrations/payment/callback", 
                callback_payload,
                headers={}  # Public endpoint, no auth needed
            )
            
            if success and isinstance(response_data, dict):
                message = response_data.get("message", "Processed")
                self.log_test(
                    "POST /api/registrations/payment/callback (failed)", 
                    True, 
                    f"Failed payment callback processed: {message}"
                )
            else:
                self.log_test(
                    "POST /api/registrations/payment/callback (failed)", 
                    False, 
                    f"Failed to process payment callback. Status: {status_code}",
                    response_data
                )
                return
        
        # Test 4: Verify analytics now shows the failed payment
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/campaigns/{TEST_CAMPAIGN_ID}/analytics"
        )
        
        if success and isinstance(response_data, dict):
            new_failed_count = response_data.get("failed_registrations", 0)
            new_failed_payments = response_data.get("failed_payments", [])
            
            # Check if failed count increased
            if new_failed_count > initial_failed_count:
                self.log_test(
                    f"GET /api/campaigns/{TEST_CAMPAIGN_ID}/analytics (after failed payment)", 
                    True, 
                    f"Failed registrations count increased from {initial_failed_count} to {new_failed_count}"
                )
                
                # Find our failed payment in the list
                our_failed_payment = None
                for payment in new_failed_payments:
                    if payment.get("id") == registration_id:
                        our_failed_payment = payment
                        break
                
                if our_failed_payment:
                    # Verify the failed payment info structure
                    expected_info = {
                        "name": "John Doe",
                        "email": "john.doe@example.com", 
                        "phone": "+1234567890",
                        "amount": 150.0
                    }
                    
                    info_correct = (
                        our_failed_payment.get("name") == expected_info["name"] and
                        our_failed_payment.get("email") == expected_info["email"] and
                        our_failed_payment.get("phone") == expected_info["phone"] and
                        our_failed_payment.get("amount") == expected_info["amount"]
                    )
                    
                    if info_correct:
                        self.log_test(
                            "Failed Payment Info Verification", 
                            True, 
                            f"Failed payment contains correct user details: {our_failed_payment['name']}, {our_failed_payment['email']}, ${our_failed_payment['amount']}"
                        )
                    else:
                        self.log_test(
                            "Failed Payment Info Verification", 
                            False, 
                            f"Failed payment info incorrect. Expected: {expected_info}, Got: {our_failed_payment}",
                            our_failed_payment
                        )
                else:
                    self.log_test(
                        "Failed Payment in List", 
                        False, 
                        f"Created failed payment {registration_id} not found in failed_payments list",
                        new_failed_payments
                    )
                    
            else:
                self.log_test(
                    f"GET /api/campaigns/{TEST_CAMPAIGN_ID}/analytics (after failed payment)", 
                    False, 
                    f"Failed registrations count did not increase. Expected > {initial_failed_count}, got {new_failed_count}",
                    response_data
                )
        else:
            self.log_test(
                f"GET /api/campaigns/{TEST_CAMPAIGN_ID}/analytics (after failed payment)", 
                False, 
                f"Failed to get updated analytics. Status: {status_code}",
                response_data
            )
        
        # Test 5: Test successful payment to ensure it doesn't appear in failed payments
        # Create another registration
        success_registration_payload = {
            "campaign_id": TEST_CAMPAIGN_ID,
            "form_data": {
                "name": "Jane Smith",
                "email": "jane.smith@example.com",
                "phone": "+1987654321",
                "organization": "Success Company"
            },
            "total_amount": 200.0,
            "coupon_code": None
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/registrations/submit", 
            success_registration_payload,
            headers={}  # Public endpoint, no auth needed
        )
        
        success_registration_id = None
        if success and isinstance(response_data, dict) and "id" in response_data:
            success_registration_id = response_data["id"]
            
            # Simulate successful payment
            success_callback_payload = {
                "registration_id": success_registration_id,
                "payment_id": f"pay_success_{success_registration_id[:8]}",
                "payment_gateway": "instamojo",
                "status": "success",
                "amount": 200.0
            }
            
            success, response_data, status_code = self.make_request(
                "POST", 
                "/registrations/payment/callback", 
                success_callback_payload,
                headers={}  # Public endpoint, no auth needed
            )
            
            if success:
                # Check analytics to ensure successful payment is NOT in failed_payments
                success, response_data, status_code = self.make_request(
                    "GET", 
                    f"/campaigns/{TEST_CAMPAIGN_ID}/analytics"
                )
                
                if success and isinstance(response_data, dict):
                    failed_payments = response_data.get("failed_payments", [])
                    success_in_failed = any(p.get("id") == success_registration_id for p in failed_payments)
                    
                    if not success_in_failed:
                        self.log_test(
                            "Successful Payment Not in Failed List", 
                            True, 
                            "Successful payment correctly excluded from failed_payments list"
                        )
                    else:
                        self.log_test(
                            "Successful Payment Not in Failed List", 
                            False, 
                            "Successful payment incorrectly included in failed_payments list",
                            failed_payments
                        )

if __name__ == "__main__":
    tester = FailedPaymentTester()
    if tester.login():
        tester.test_failed_payment_tracking()
    else:
        print("❌ Login failed, cannot run tests")