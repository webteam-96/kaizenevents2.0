"""
Instamojo OAuth 2.0 Service
Uses client_id and client_secret for secure authentication
"""
import os
import httpx
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


class InstamojoOAuthService:
    """
    Instamojo integration using OAuth 2.0 (client credentials flow)
    More secure than API key/auth token approach
    """
    
    def __init__(self):
        self.client_id = os.environ.get('INSTAMOJO_CLIENT_ID', '')
        self.client_secret = os.environ.get('INSTAMOJO_CLIENT_SECRET', '')
        self.mode = os.environ.get('INSTAMOJO_MODE', 'sandbox')  # 'sandbox' or 'production'
        
        # Token caching
        self._access_token: Optional[str] = None
        self._refresh_token: Optional[str] = None
        self._token_expires_at: Optional[datetime] = None
        
        # API URLs
        if self.mode == 'production':
            self.auth_url = "https://api.instamojo.com/oauth2/token/"
            self.api_url = "https://api.instamojo.com/v2"
        else:
            self.auth_url = "https://test.instamojo.com/oauth2/token/"
            self.api_url = "https://test.instamojo.com/v2"
    
    def is_configured(self) -> bool:
        """Check if Instamojo OAuth is properly configured"""
        return bool(self.client_id and self.client_secret)
    
    async def _get_access_token(self) -> Optional[str]:
        """
        Get access token using client credentials flow.
        Caches token and refreshes when expired.
        """
        if not self.is_configured():
            logger.warning("Instamojo OAuth not configured")
            return None
        
        # Check if we have a valid cached token
        if self._access_token and self._token_expires_at:
            if datetime.now(timezone.utc) < self._token_expires_at - timedelta(minutes=5):
                return self._access_token
        
        # Try refresh token first if available
        if self._refresh_token:
            token = await self._refresh_access_token()
            if token:
                return token
        
        # Get new token using client credentials
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.auth_url,
                    data={
                        'grant_type': 'client_credentials',
                        'client_id': self.client_id,
                        'client_secret': self.client_secret
                    },
                    headers={
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    self._access_token = data.get('access_token')
                    self._refresh_token = data.get('refresh_token')
                    
                    # Calculate expiry (default 1 hour if not specified)
                    expires_in = data.get('expires_in', 3600)
                    self._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                    
                    logger.info(f"Instamojo OAuth token obtained, expires in {expires_in}s")
                    return self._access_token
                else:
                    error_data = response.json() if response.text else {}
                    logger.error(f"Instamojo OAuth failed: {response.status_code} - {error_data}")
                    return None
                    
        except Exception as e:
            logger.error(f"Instamojo OAuth error: {str(e)}")
            return None
    
    async def _refresh_access_token(self) -> Optional[str]:
        """Refresh access token using refresh token"""
        if not self._refresh_token:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.auth_url,
                    data={
                        'grant_type': 'refresh_token',
                        'refresh_token': self._refresh_token,
                        'client_id': self.client_id,
                        'client_secret': self.client_secret
                    },
                    headers={
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    self._access_token = data.get('access_token')
                    self._refresh_token = data.get('refresh_token', self._refresh_token)
                    
                    expires_in = data.get('expires_in', 3600)
                    self._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                    
                    logger.info("Instamojo OAuth token refreshed")
                    return self._access_token
                else:
                    logger.warning("Token refresh failed, will get new token")
                    self._refresh_token = None
                    return None
                    
        except Exception as e:
            logger.error(f"Token refresh error: {str(e)}")
            self._refresh_token = None
            return None
    
    async def create_payment_request(
        self,
        amount: float,
        purpose: str,
        buyer_name: str,
        email: str,
        phone: str,
        redirect_url: str = None,
        webhook_url: str = None,
        send_email: bool = True,
        send_sms: bool = True,
        allow_repeated_payments: bool = False
    ) -> Dict[str, Any]:
        """
        Create a payment request using Instamojo OAuth API
        
        Args:
            amount: Payment amount (minimum ₹9)
            purpose: Payment purpose/description
            buyer_name: Name of the buyer
            email: Buyer's email address
            phone: Buyer's phone number (10 digits)
            redirect_url: URL to redirect after payment
            webhook_url: URL for payment webhook
            send_email: Send payment link via email
            send_sms: Send payment link via SMS
            allow_repeated_payments: Allow multiple payments on same link
            
        Returns:
            Dict with success status and payment request details
        """
        if not self.is_configured():
            return {"success": False, "error": "Instamojo OAuth not configured"}
        
        access_token = await self._get_access_token()
        if not access_token:
            return {"success": False, "error": "Failed to obtain access token"}
        
        # Clean phone number
        clean_phone = phone.replace(' ', '').replace('-', '').replace('+91', '').lstrip('0')
        if len(clean_phone) > 10:
            clean_phone = clean_phone[-10:]  # Take last 10 digits
        
        payload = {
            "amount": str(amount),
            "purpose": purpose,
            "buyer_name": buyer_name,
            "email": email,
            "phone": clean_phone,
            "send_email": send_email,
            "send_sms": send_sms,
            "allow_repeated_payments": allow_repeated_payments
        }
        
        if redirect_url:
            payload["redirect_url"] = redirect_url
        
        if webhook_url:
            payload["webhook"] = webhook_url
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.api_url}/payment_requests/",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    }
                )
                
                data = response.json() if response.text else {}
                
                if response.status_code in [200, 201]:
                    logger.info(f"Instamojo payment request created: {data.get('id', 'N/A')}")
                    return {
                        "success": True,
                        "payment_request_id": data.get("id"),
                        "longurl": data.get("longurl"),
                        "shorturl": data.get("shorturl"),
                        "status": data.get("status"),
                        "amount": data.get("amount"),
                        "purpose": data.get("purpose")
                    }
                else:
                    error_msg = data.get('message', str(data))
                    logger.error(f"Instamojo payment request failed: {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg,
                        "status_code": response.status_code
                    }
                    
        except httpx.TimeoutException:
            logger.error("Instamojo request timeout")
            return {"success": False, "error": "Request timeout"}
        except Exception as e:
            logger.error(f"Instamojo request error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def get_payment_request_status(self, payment_request_id: str) -> Dict[str, Any]:
        """Get status of a payment request"""
        if not self.is_configured():
            return {"success": False, "error": "Instamojo OAuth not configured"}
        
        access_token = await self._get_access_token()
        if not access_token:
            return {"success": False, "error": "Failed to obtain access token"}
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.api_url}/payment_requests/{payment_request_id}/",
                    headers={
                        "Authorization": f"Bearer {access_token}"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "success": True,
                        "data": data
                    }
                else:
                    return {
                        "success": False,
                        "error": response.text,
                        "status_code": response.status_code
                    }
                    
        except Exception as e:
            logger.error(f"Error fetching payment status: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def get_payment_details(self, payment_id: str) -> Dict[str, Any]:
        """Get details of a specific payment"""
        if not self.is_configured():
            return {"success": False, "error": "Instamojo OAuth not configured"}
        
        access_token = await self._get_access_token()
        if not access_token:
            return {"success": False, "error": "Failed to obtain access token"}
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.api_url}/payments/{payment_id}/",
                    headers={
                        "Authorization": f"Bearer {access_token}"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "success": True,
                        "data": data,
                        "amount": data.get("amount"),
                        "fees": data.get("fees"),
                        "status": data.get("status")
                    }
                else:
                    return {
                        "success": False,
                        "error": response.text,
                        "status_code": response.status_code
                    }
                    
        except Exception as e:
            logger.error(f"Error fetching payment details: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def create_refund(
        self,
        payment_id: str,
        refund_type: str = "TNR",  # TNR (Transaction Not Required), QFL (Quality Issue), etc.
        body: str = "Customer requested refund"
    ) -> Dict[str, Any]:
        """
        Create a refund for a payment
        
        Args:
            payment_id: The Instamojo payment ID
            refund_type: Type of refund (TNR, QFL, QNR, EWN, TAN, PTH)
            body: Reason for refund
        """
        if not self.is_configured():
            return {"success": False, "error": "Instamojo OAuth not configured"}
        
        access_token = await self._get_access_token()
        if not access_token:
            return {"success": False, "error": "Failed to obtain access token"}
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.api_url}/payments/{payment_id}/refund/",
                    json={
                        "type": refund_type,
                        "body": body
                    },
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    }
                )
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    return {
                        "success": True,
                        "refund_id": data.get("id"),
                        "status": data.get("status")
                    }
                else:
                    return {
                        "success": False,
                        "error": response.text,
                        "status_code": response.status_code
                    }
                    
        except Exception as e:
            logger.error(f"Error creating refund: {str(e)}")
            return {"success": False, "error": str(e)}


# Singleton instance
instamojo_oauth_service = InstamojoOAuthService()
