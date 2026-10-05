#!/usr/bin/env python3
"""
Focused Fund Transfer Management Testing Script
"""

import requests
import json
import sys

# Configuration
BASE_URL = "https://kioskflow.preview.emergentagent.com/api"
TEST_CREDENTIALS = {
    "email": "pranav@kaizeninfotech.com",
    "password": "Kaizentest1234"
}
FUND_TRANSFER_TEST_CAMPAIGN_ID = "4d559227-f5b3-430e-b459-79bf69ec4b40"

class FundTransferTester:
    def __init__(self):
        self.session = requests.Session()
        self.access_token = None
        
    def login(self):
        """Login and get access token"""
        response = self.session.post(f"{BASE_URL}/auth/login", json=TEST_CREDENTIALS)
        if response.status_code == 200:
            data = response.json()
            self.access_token = data["access_token"]
            print(f"✅ Logged in as: {data['user']['name']} ({data['user']['role']})")
            print(f"   Can approve transfers: {data['user'].get('can_approve_transfers', False)}")
            return True
        else:
            print(f"❌ Login failed: {response.status_code}")
            return False
    
    def make_request(self, method, endpoint, data=None):
        """Make authenticated request"""
        url = f"{BASE_URL}{endpoint}"
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        if method.upper() == "GET":
            response = self.session.get(url, headers=headers)
        elif method.upper() == "POST":
            response = self.session.post(url, json=data, headers=headers)
        elif method.upper() == "PUT":
            response = self.session.put(url, json=data, headers=headers)
        else:
            return None, f"Unsupported method: {method}", 0
        
        try:
            response_data = response.json()
        except:
            response_data = response.text
        
        return response.status_code < 400, response_data, response.status_code
    
    def test_all_fund_transfer_apis(self):
        """Test all fund transfer APIs"""
        print("\n=== FUND TRANSFER MANAGEMENT API TESTING ===")
        
        # Test 1: Fund Transfer Stats
        print("\n1. Testing Fund Transfer Stats API")
        success, data, status = self.make_request("GET", "/fund-transfers/stats")
        print(f"   GET /fund-transfers/stats: {status}")
        if success:
            print(f"   ✅ Stats: Collected: ₹{data.get('total_collected', 0)}, Pending: ₹{data.get('total_pending', 0)}")
        else:
            print(f"   ❌ Error: {data}")
        
        # Test 2: Campaign Fund Summary
        print("\n2. Testing Campaign Fund Summary API")
        success, data, status = self.make_request("GET", f"/fund-transfers/campaign/{FUND_TRANSFER_TEST_CAMPAIGN_ID}/summary")
        print(f"   GET /fund-transfers/campaign/{FUND_TRANSFER_TEST_CAMPAIGN_ID}/summary: {status}")
        if success:
            print(f"   ✅ Campaign: {data.get('campaign_name')}")
            print(f"   Fund Mode: {data.get('fund_collection_mode')}")
            if data.get('fund_collection_mode') == 'kaizen_managed':
                print(f"   Collected: ₹{data.get('collected', 0)}, Transferred: ₹{data.get('transferred', 0)}, Pending: ₹{data.get('pending', 0)}")
                print(f"   Has Bank Account: {data.get('has_bank_account', False)}")
        else:
            print(f"   ❌ Error: {data}")
        
        # Test 3: Bank Account Creation
        print("\n3. Testing Bank Account Creation")
        bank_payload = {
            "campaign_id": FUND_TRANSFER_TEST_CAMPAIGN_ID,
            "account_name": "Test Bank Account",
            "account_number": "1234567890123456",
            "ifsc_code": "HDFC0001234",
            "bank_name": "HDFC Bank",
            "notification_email": "test@example.com"
        }
        success, data, status = self.make_request("POST", f"/fund-transfers/campaign/{FUND_TRANSFER_TEST_CAMPAIGN_ID}/bank-account", bank_payload)
        print(f"   POST /fund-transfers/campaign/{FUND_TRANSFER_TEST_CAMPAIGN_ID}/bank-account: {status}")
        if success:
            print(f"   ✅ Bank account request created: {data.get('request_id')}")
            request_id = data.get('request_id')
        elif status == 400 and "already exists" in str(data):
            print(f"   ✅ Bank account already exists (expected)")
            request_id = None
        else:
            print(f"   ❌ Error: {data}")
            request_id = None
        
        # Test 4: Get Bank Account
        print("\n4. Testing Get Bank Account")
        success, data, status = self.make_request("GET", f"/fund-transfers/campaign/{FUND_TRANSFER_TEST_CAMPAIGN_ID}/bank-account")
        print(f"   GET /fund-transfers/campaign/{FUND_TRANSFER_TEST_CAMPAIGN_ID}/bank-account: {status}")
        if success:
            if data is None:
                print(f"   ✅ No bank account configured")
            else:
                print(f"   ✅ Bank Account: {data.get('account_name')} - {data.get('account_number_masked')}")
        else:
            print(f"   ❌ Error: {data}")
        
        # Test 5: List Fund Transfers
        print("\n5. Testing List Fund Transfers")
        success, data, status = self.make_request("GET", "/fund-transfers")
        print(f"   GET /fund-transfers: {status}")
        if success:
            print(f"   ✅ Found {len(data)} fund transfers")
        else:
            print(f"   ❌ Error: {data}")
        
        # Test 6: Pending Approvals
        print("\n6. Testing Pending Approvals")
        success, data, status = self.make_request("GET", "/fund-transfers/pending-approvals")
        print(f"   GET /fund-transfers/pending-approvals: {status}")
        if success:
            transfers = len(data.get('transfers', []))
            changes = len(data.get('change_requests', []))
            print(f"   ✅ Pending: {transfers} transfers, {changes} change requests")
        elif status == 403:
            print(f"   ⚠ Access denied - user needs can_approve_transfers permission")
        else:
            print(f"   ❌ Error: {data}")
        
        # Test 7: Create Fund Transfer
        print("\n7. Testing Create Fund Transfer")
        transfer_payload = {
            "campaign_id": FUND_TRANSFER_TEST_CAMPAIGN_ID,
            "amount": 50.0,
            "notes": "Test transfer"
        }
        success, data, status = self.make_request("POST", "/fund-transfers", transfer_payload)
        print(f"   POST /fund-transfers: {status}")
        if success:
            print(f"   ✅ Transfer created: {data.get('transfer_id')}")
        elif status == 400:
            error = data.get('detail', str(data))
            if "Bank account not configured" in error:
                print(f"   ⚠ Bank account not configured (expected)")
            elif "exceeds available balance" in error:
                print(f"   ⚠ Exceeds available balance (expected for test campaign)")
            else:
                print(f"   ❌ Error: {error}")
        else:
            print(f"   ❌ Error: {data}")
        
        # Test 8: Campaigns with Pending Transfers
        print("\n8. Testing Campaigns with Pending Transfers")
        success, data, status = self.make_request("GET", "/fund-transfers/campaigns-pending")
        print(f"   GET /fund-transfers/campaigns-pending: {status}")
        if success:
            print(f"   ✅ Found {len(data)} campaigns with pending transfers")
        else:
            print(f"   ❌ Error: {data}")
        
        print("\n=== FUND TRANSFER TESTING COMPLETE ===")

if __name__ == "__main__":
    tester = FundTransferTester()
    if tester.login():
        tester.test_all_fund_transfer_apis()
    else:
        sys.exit(1)