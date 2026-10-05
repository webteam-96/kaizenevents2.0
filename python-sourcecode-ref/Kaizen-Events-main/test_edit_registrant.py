#!/usr/bin/env python3
"""
Focused test for Edit Registrant feature with payment adjustment logic
"""

import requests
import json
import time
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://kioskflow.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "email": "pranav@kaizeninfotech.com",
    "password": "Kaizentest1234"
}
TEST_CAMPAIGN_ID = "4f2c49e0-65a2-46d5-8986-59cc8678cbed"

class EditRegistrantTester:
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
    
    def authenticate(self):
        """Login and get access token"""
        print("=== AUTHENTICATING ===")
        
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
                "Authentication", 
                True, 
                f"Login successful. User: {user_data.get('name', 'Unknown')} ({user_data.get('email', 'Unknown')})"
            )
            return True
        else:
            self.log_test(
                "Authentication", 
                False, 
                f"Login failed. Status: {status_code}",
                response_data
            )
            return False
    
    def find_test_registration(self):
        """Find a suitable registration for testing"""
        print("=== FINDING TEST REGISTRATION ===")
        
        success, response_data, status_code = self.make_request(
            "GET", 
            f"/campaigns/{TEST_CAMPAIGN_ID}/registrations"
        )
        
        if success and isinstance(response_data, list):
            print(f"Found {len(response_data)} registrations")
            
            # Look for a registration with completed payment
            completed_registrations = [r for r in response_data if r.get("payment_status") == "completed"]
            
            if completed_registrations:
                test_reg = completed_registrations[0]
                reg_id = test_reg.get("id")
                amount = test_reg.get("total_amount", 0)
                name = test_reg.get("form_data", {}).get("name", "Unknown")
                
                self.log_test(
                    "Find test registration", 
                    True, 
                    f"Found completed registration: {reg_id}, Amount: ₹{amount}, Name: {name}"
                )
                return reg_id, test_reg
            else:
                # If no completed registrations, use any registration
                if response_data:
                    test_reg = response_data[0]
                    reg_id = test_reg.get("id")
                    amount = test_reg.get("total_amount", 0)
                    payment_status = test_reg.get("payment_status", "unknown")
                    name = test_reg.get("form_data", {}).get("name", "Unknown")
                    
                    self.log_test(
                        "Find test registration", 
                        True, 
                        f"Using registration: {reg_id}, Amount: ₹{amount}, Status: {payment_status}, Name: {name}"
                    )
                    return reg_id, test_reg
                else:
                    self.log_test(
                        "Find test registration", 
                        False, 
                        "No registrations found in campaign"
                    )
                    return None, None
        else:
            self.log_test(
                "Find test registration", 
                False, 
                f"Failed to get registrations. Status: {status_code}",
                response_data
            )
            return None, None
    
    def test_edit_registrant_scenarios(self, registration_id: str, original_registration: dict):
        """Test all edit registrant scenarios"""
        print("=== TESTING EDIT REGISTRANT SCENARIOS ===")
        
        original_amount = original_registration.get("total_amount", 1000)
        original_form_data = original_registration.get("form_data", {})
        
        # Test 1: Amount Increase - Should generate payment link
        print("\n--- Test 1: Amount Increase ---")
        increased_amount = original_amount + 500
        update_payload_increase = {
            "form_data": {
                **original_form_data,
                "name": "Edit Test User Updated",
                "organization": "Updated Organization"
            },
            "total_amount": increased_amount
        }
        
        success, response_data, status_code = self.make_request(
            "PUT", 
            f"/registrations/{registration_id}", 
            update_payload_increase
        )
        
        if success and isinstance(response_data, dict):
            payment_link = response_data.get("payment_link")
            refund_required = response_data.get("refund_required", False)
            previous_amount = response_data.get("previous_amount", 0)
            new_amount = response_data.get("new_amount", 0)
            
            # For amount increase, should have payment_link and refund_required should be False
            if payment_link and not refund_required and new_amount > previous_amount:
                self.log_test(
                    "Amount Increase Test", 
                    True, 
                    f"Amount increased from ₹{previous_amount} to ₹{new_amount}. Payment link: {payment_link[:50]}..."
                )
                
                # Verify payment link format (should be mock)
                if "mock" in payment_link.lower() or "test" in payment_link.lower():
                    print("   ✓ Payment link is in MOCK mode as expected")
                else:
                    print("   ⚠ Payment link may not be in mock mode")
                    
            else:
                self.log_test(
                    "Amount Increase Test", 
                    False, 
                    f"Expected payment_link and refund_required=False. Got payment_link: {bool(payment_link)}, refund_required: {refund_required}",
                    response_data
                )
        else:
            self.log_test(
                "Amount Increase Test", 
                False, 
                f"Failed to update registration. Status: {status_code}",
                response_data
            )
        
        # Test 2: Amount Decrease - Should trigger refund notification
        print("\n--- Test 2: Amount Decrease ---")
        decreased_amount = max(original_amount - 200, 100)  # Ensure positive amount
        update_payload_decrease = {
            "form_data": {
                **original_form_data,
                "name": "Edit Test User Refund",
                "organization": "Refund Test Organization"
            },
            "total_amount": decreased_amount
        }
        
        success, response_data, status_code = self.make_request(
            "PUT", 
            f"/registrations/{registration_id}", 
            update_payload_decrease
        )
        
        if success and isinstance(response_data, dict):
            payment_link = response_data.get("payment_link")
            refund_required = response_data.get("refund_required", False)
            refund_amount = response_data.get("refund_amount")
            previous_amount = response_data.get("previous_amount", 0)
            new_amount = response_data.get("new_amount", 0)
            
            # For amount decrease, should have refund_required=True and payment_link should be null
            if refund_required and refund_amount and payment_link is None and new_amount < previous_amount:
                self.log_test(
                    "Amount Decrease Test", 
                    True, 
                    f"Amount decreased from ₹{previous_amount} to ₹{new_amount}. Refund required: ₹{refund_amount}"
                )
                
                # Test 3: Confirm Refund endpoint
                print("\n--- Test 3: Confirm Refund ---")
                success_refund, response_refund, status_refund = self.make_request(
                    "POST", 
                    f"/registrations/{registration_id}/confirm-refund"
                )
                
                if success_refund and isinstance(response_refund, dict):
                    message = response_refund.get("message", "")
                    if "confirmed successfully" in message.lower():
                        self.log_test(
                            "Confirm Refund Test", 
                            True, 
                            f"Refund confirmed: {message}"
                        )
                    else:
                        self.log_test(
                            "Confirm Refund Test", 
                            False, 
                            f"Unexpected refund confirmation message: {message}",
                            response_refund
                        )
                else:
                    self.log_test(
                        "Confirm Refund Test", 
                        False, 
                        f"Failed to confirm refund. Status: {status_refund}",
                        response_refund
                    )
                    
            else:
                self.log_test(
                    "Amount Decrease Test", 
                    False, 
                    f"Expected refund_required=True and payment_link=null. Got refund_required: {refund_required}, payment_link: {payment_link}",
                    response_data
                )
        else:
            self.log_test(
                "Amount Decrease Test", 
                False, 
                f"Failed to update registration. Status: {status_code}",
                response_data
            )
        
        # Test 4: No Amount Change - Should update form data only
        print("\n--- Test 4: No Amount Change ---")
        update_payload_no_change = {
            "form_data": {
                **original_form_data,
                "name": "Edit Test User Final",
                "organization": "Final Organization",
                "additional_notes": "No amount change test"
            },
            "total_amount": original_amount  # Same as original
        }
        
        success, response_data, status_code = self.make_request(
            "PUT", 
            f"/registrations/{registration_id}", 
            update_payload_no_change
        )
        
        if success and isinstance(response_data, dict):
            payment_link = response_data.get("payment_link")
            refund_required = response_data.get("refund_required", False)
            message = response_data.get("message", "")
            previous_amount = response_data.get("previous_amount", 0)
            new_amount = response_data.get("new_amount", 0)
            
            # For no amount change, should have no payment_link, no refund_required
            if payment_link is None and not refund_required and previous_amount == new_amount:
                self.log_test(
                    "No Amount Change Test", 
                    True, 
                    f"Form data updated without amount change. Message: {message}"
                )
            else:
                self.log_test(
                    "No Amount Change Test", 
                    False, 
                    f"Expected no payment adjustments. Got payment_link: {payment_link}, refund_required: {refund_required}",
                    response_data
                )
        else:
            self.log_test(
                "No Amount Change Test", 
                False, 
                f"Failed to update registration. Status: {status_code}",
                response_data
            )
        
        # Test 5: Access Control - Test with invalid token
        print("\n--- Test 5: Access Control ---")
        old_token = self.access_token
        self.access_token = "invalid_token"
        
        success, response_data, status_code = self.make_request(
            "PUT", 
            f"/registrations/{registration_id}", 
            update_payload_no_change
        )
        
        if not success and status_code == 401:
            self.log_test(
                "Access Control Test", 
                True, 
                "Correctly rejected invalid token with 401"
            )
        else:
            self.log_test(
                "Access Control Test", 
                False, 
                f"Should have rejected invalid token. Status: {status_code}",
                response_data
            )
        
        # Restore valid token
        self.access_token = old_token
        
        # Test 6: Test with non-existent registration
        print("\n--- Test 6: Non-existent Registration ---")
        fake_registration_id = "00000000-0000-0000-0000-000000000000"
        success, response_data, status_code = self.make_request(
            "PUT", 
            f"/registrations/{fake_registration_id}", 
            update_payload_no_change
        )
        
        if not success and status_code == 404:
            self.log_test(
                "Non-existent Registration Test", 
                True, 
                "Correctly returned 404 for non-existent registration"
            )
        else:
            self.log_test(
                "Non-existent Registration Test", 
                False, 
                f"Should have returned 404. Status: {status_code}",
                response_data
            )
    
    def run_tests(self):
        """Run all edit registrant tests"""
        print("🚀 TESTING EDIT REGISTRANT FEATURE WITH PAYMENT ADJUSTMENTS")
        print("=" * 70)
        
        # Authenticate
        if not self.authenticate():
            print("❌ Authentication failed - stopping tests")
            return
        
        # Wait a bit to avoid rate limiting
        time.sleep(2)
        
        # Find test registration
        registration_id, original_registration = self.find_test_registration()
        
        if not registration_id:
            print("❌ No test registration found - stopping tests")
            return
        
        # Wait a bit more
        time.sleep(2)
        
        # Run edit registrant tests
        self.test_edit_registrant_scenarios(registration_id, original_registration)
        
        print("\n" + "=" * 70)
        print("🏁 EDIT REGISTRANT FEATURE TESTING COMPLETE")
        print("=" * 70)

if __name__ == "__main__":
    tester = EditRegistrantTester()
    tester.run_tests()