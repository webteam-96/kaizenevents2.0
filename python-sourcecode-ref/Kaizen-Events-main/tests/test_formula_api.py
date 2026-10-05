"""
Backend API Tests for Formula Builder and Field Rules
Tests formula validation endpoint and field rules evaluation
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kioskflow.preview.emergentagent.com')

class TestFormulaValidation:
    """Tests for /api/formula/validate endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "pranav@kaizeninfotech.com",
                "password": "Kaizentest1234"
            }
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["access_token"]
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_sum_function(self):
        """Test sum(10, 20, 30) should return 60"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "sum(10, 20, 30)", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 60.0
    
    def test_avg_function(self):
        """Test avg(10, 20, 30) should return 20"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "avg(10, 20, 30)", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 20.0
    
    def test_min_function(self):
        """Test min(10, 20, 30) should return 10"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "min(10, 20, 30)", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 10.0
    
    def test_max_function(self):
        """Test max(10, 20, 30) should return 30"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "max(10, 20, 30)", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 30.0
    
    def test_round_function(self):
        """Test round(123.456) should return 123"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "round(123.456)", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 123.0
    
    def test_if_function_true_condition(self):
        """Test if(10 > 5, 100, 50) should return 100"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "if(10 > 5, 100, 50)", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 100.0
    
    def test_if_function_false_condition(self):
        """Test if(5 > 10, 100, 50) should return 50"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "if(5 > 10, 100, 50)", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 50.0
    
    def test_basic_arithmetic_with_base_price(self):
        """Test ${base_price} + 100 should return 101 (base_price defaults to 1)"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "${base_price} + 100", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 101.0
    
    def test_complex_formula(self):
        """Test complex formula with multiple operations"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "sum(10, 20) * 2 + 100", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == True
        assert data["result"] == 160.0  # (10+20)*2 + 100 = 160
    
    def test_invalid_formula(self):
        """Test invalid formula returns error"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            headers=self.headers,
            json={"formula": "invalid_function(10)", "field_ids": []}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] == False
        assert data["error"] is not None


class TestFieldRulesEvaluation:
    """Tests for /api/evaluate-field-rules endpoint"""
    
    def test_show_action(self):
        """Test show action - field should be visible when condition is met"""
        response = requests.post(
            f"{BASE_URL}/api/evaluate-field-rules",
            json={
                "field_values": {"trigger_field": "yes"},
                "field_rules": [{
                    "id": "rule_1",
                    "conditions": [{"field_id": "trigger_field", "operator": "equals", "value": "yes"}],
                    "match_type": "all",
                    "actions": [{"action": "show", "target_field_id": "target_field"}]
                }]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["field_visibility"]["target_field"] == True
    
    def test_hide_action(self):
        """Test hide action - field should be hidden when condition is met"""
        response = requests.post(
            f"{BASE_URL}/api/evaluate-field-rules",
            json={
                "field_values": {"trigger_field": "yes"},
                "field_rules": [{
                    "id": "rule_1",
                    "conditions": [{"field_id": "trigger_field", "operator": "equals", "value": "yes"}],
                    "match_type": "all",
                    "actions": [{"action": "hide", "target_field_id": "target_field"}]
                }]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["field_visibility"]["target_field"] == False
    
    def test_require_action(self):
        """Test require action - field should be required when condition is met"""
        response = requests.post(
            f"{BASE_URL}/api/evaluate-field-rules",
            json={
                "field_values": {"trigger_field": "yes"},
                "field_rules": [{
                    "id": "rule_1",
                    "conditions": [{"field_id": "trigger_field", "operator": "equals", "value": "yes"}],
                    "match_type": "all",
                    "actions": [{"action": "require", "target_field_id": "target_field"}]
                }]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["field_required"]["target_field"] == True
    
    def test_set_value_action(self):
        """Test set_value action - field value should be set when condition is met"""
        response = requests.post(
            f"{BASE_URL}/api/evaluate-field-rules",
            json={
                "field_values": {"trigger_field": "yes"},
                "field_rules": [{
                    "id": "rule_1",
                    "conditions": [{"field_id": "trigger_field", "operator": "equals", "value": "yes"}],
                    "match_type": "all",
                    "actions": [{"action": "set_value", "target_field_id": "target_field", "value": "auto_value"}]
                }]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["field_values"]["target_field"] == "auto_value"
    
    def test_condition_not_met(self):
        """Test that actions are not applied when condition is not met"""
        response = requests.post(
            f"{BASE_URL}/api/evaluate-field-rules",
            json={
                "field_values": {"trigger_field": "no"},
                "field_rules": [{
                    "id": "rule_1",
                    "conditions": [{"field_id": "trigger_field", "operator": "equals", "value": "yes"}],
                    "match_type": "all",
                    "actions": [{"action": "show", "target_field_id": "target_field"}]
                }]
            }
        )
        assert response.status_code == 200
        data = response.json()
        # When condition is not met, field_visibility should not have the target_field set to True
        assert data["field_visibility"].get("target_field") != True
    
    def test_is_not_empty_operator(self):
        """Test is_not_empty operator"""
        response = requests.post(
            f"{BASE_URL}/api/evaluate-field-rules",
            json={
                "field_values": {"trigger_field": "some_value"},
                "field_rules": [{
                    "id": "rule_1",
                    "conditions": [{"field_id": "trigger_field", "operator": "is_not_empty", "value": ""}],
                    "match_type": "all",
                    "actions": [{"action": "show", "target_field_id": "target_field"}]
                }]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["field_visibility"]["target_field"] == True
    
    def test_greater_than_operator(self):
        """Test greater_than operator"""
        response = requests.post(
            f"{BASE_URL}/api/evaluate-field-rules",
            json={
                "field_values": {"quantity": "15"},
                "field_rules": [{
                    "id": "rule_1",
                    "conditions": [{"field_id": "quantity", "operator": "greater_than", "value": "10"}],
                    "match_type": "all",
                    "actions": [{"action": "show", "target_field_id": "discount_field"}]
                }]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["field_visibility"]["discount_field"] == True


class TestAuthRequired:
    """Test that formula validation requires authentication"""
    
    def test_formula_validate_requires_auth(self):
        """Test that /api/formula/validate requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/formula/validate",
            json={"formula": "sum(10, 20)", "field_ids": []}
        )
        assert response.status_code == 403 or response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
