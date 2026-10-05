import os
from typing import Dict, Any, Optional
import razorpay
from datetime import datetime, timezone
import secrets

class PaymentService:
    def __init__(self):
        self.razorpay_key = os.getenv('RAZORPAY_KEY_ID', 'test_key')
        self.razorpay_secret = os.getenv('RAZORPAY_KEY_SECRET', 'test_secret')
        
        # Initialize Razorpay client (will use test credentials if not provided)
        try:
            self.razorpay_client = razorpay.Client(auth=(self.razorpay_key, self.razorpay_secret))
        except Exception:
            self.razorpay_client = None
    
    async def create_razorpay_order(self, amount: float, currency: str = "INR", receipt: str = None) -> Dict[str, Any]:
        """Create Razorpay order"""
        if not self.razorpay_client:
            # Mock response for testing
            return {
                "id": f"order_mock_{secrets.token_hex(8)}",
                "amount": int(amount * 100),
                "currency": currency,
                "receipt": receipt or f"receipt_{datetime.now().timestamp()}",
                "status": "created"
            }
        
        try:
            order_data = {
                "amount": int(amount * 100),  # Amount in paise
                "currency": currency,
                "receipt": receipt or f"receipt_{datetime.now().timestamp()}",
            }
            order = self.razorpay_client.order.create(data=order_data)
            return order
        except Exception as e:
            raise Exception(f"Failed to create Razorpay order: {str(e)}")
    
    async def verify_razorpay_signature(self, order_id: str, payment_id: str, signature: str) -> bool:
        """Verify Razorpay payment signature"""
        if not self.razorpay_client:
            # Mock verification for testing
            return True
        
        try:
            params_dict = {
                'razorpay_order_id': order_id,
                'razorpay_payment_id': payment_id,
                'razorpay_signature': signature
            }
            self.razorpay_client.utility.verify_payment_signature(params_dict)
            return True
        except Exception:
            return False
    
    async def create_refund(self, payment_id: str, amount: float) -> Dict[str, Any]:
        """Create refund"""
        if not self.razorpay_client:
            # Mock response
            return {
                "id": f"rfnd_mock_{secrets.token_hex(8)}",
                "payment_id": payment_id,
                "amount": int(amount * 100),
                "status": "processed"
            }
        
        try:
            refund = self.razorpay_client.payment.refund(payment_id, int(amount * 100))
            return refund
        except Exception as e:
            raise Exception(f"Failed to create refund: {str(e)}")
    
    async def create_instamojo_payment(self, amount: float, purpose: str, buyer_name: str, email: str) -> Dict[str, Any]:
        """Create Instamojo payment request (Mocked)"""
        # Instamojo integration would go here
        return {
            "id": f"inst_mock_{secrets.token_hex(8)}",
            "amount": amount,
            "purpose": purpose,
            "status": "created",
            "longurl": "https://test.instamojo.com/mock_payment_url"
        }

# Singleton instance
payment_service = PaymentService()
