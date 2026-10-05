"""
Settlement Service - Fetches settlement data from payment gateways
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import httpx
import razorpay
import logging

logger = logging.getLogger(__name__)


class SettlementService:
    """Service to fetch and track payment gateway settlements"""
    
    @staticmethod
    async def get_instamojo_payment_details(
        api_key: str,
        auth_token: str,
        payment_id: str,
        mode: str = "sandbox"
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch payment details from Instamojo including fees
        
        Returns:
            {
                'payment_id': str,
                'amount': float,  # Total amount paid by user
                'fees': float,  # Gateway fees deducted
                'settlement_amount': float,  # Amount to be settled
                'status': str,  # Payment status
                'settled': bool,  # Whether payment is settled
            }
        """
        api_url = "https://api.instamojo.com" if mode == "production" else "https://test.instamojo.com"
        
        headers = {
            "X-Api-Key": api_key,
            "X-Auth-Token": auth_token
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{api_url}/api/1.1/payments/{payment_id}/",
                    headers=headers
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        payment = data.get("payment", {})
                        amount = float(payment.get("amount", 0))
                        fees = float(payment.get("fees", 0))
                        
                        return {
                            "payment_id": payment_id,
                            "amount": amount,
                            "fees": fees,
                            "settlement_amount": amount - fees,
                            "status": payment.get("status", ""),
                            "settled": payment.get("status") == "Credit",
                            "instrument_type": payment.get("instrument_type", ""),
                            "billing_instrument": payment.get("billing_instrument", ""),
                            "raw_data": payment
                        }
                
                logger.warning(f"Instamojo payment details fetch failed: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching Instamojo payment details: {str(e)}")
            return None
    
    @staticmethod
    async def get_instamojo_payment_request_details(
        api_key: str,
        auth_token: str,
        payment_request_id: str,
        mode: str = "sandbox"
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch payment request details from Instamojo including all payments
        """
        api_url = "https://api.instamojo.com" if mode == "production" else "https://test.instamojo.com"
        
        headers = {
            "X-Api-Key": api_key,
            "X-Auth-Token": auth_token
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{api_url}/api/1.1/payment-requests/{payment_request_id}/",
                    headers=headers
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        return data.get("payment_request", {})
                
                return None
                
        except Exception as e:
            logger.error(f"Error fetching Instamojo payment request: {str(e)}")
            return None
    
    @staticmethod
    def get_razorpay_payment_details(
        key_id: str,
        key_secret: str,
        payment_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch payment details from Razorpay including fees
        
        Returns:
            {
                'payment_id': str,
                'amount': float,  # Total amount paid by user
                'fees': float,  # Gateway fees deducted
                'tax': float,  # GST on fees
                'settlement_amount': float,  # Amount to be settled
                'status': str,  # Payment status
                'settled': bool,  # Whether payment is settled
            }
        """
        try:
            client = razorpay.Client(auth=(key_id, key_secret))
            payment = client.payment.fetch(payment_id)
            
            # Amount is in paise, convert to rupees
            amount = payment.get("amount", 0) / 100
            fee = payment.get("fee", 0) / 100  # Fee in paise
            tax = payment.get("tax", 0) / 100  # Tax on fee
            
            # Check settlement status
            # Razorpay payments are settled when status is 'captured' and settled = true
            status = payment.get("status", "")
            
            return {
                "payment_id": payment_id,
                "amount": amount,
                "fees": fee,
                "tax": tax,
                "settlement_amount": amount - fee - tax,
                "status": status,
                "settled": status == "captured",  # For now, treat captured as settled
                "method": payment.get("method", ""),
                "bank": payment.get("bank", ""),
                "wallet": payment.get("wallet", ""),
                "vpa": payment.get("vpa", ""),
                "raw_data": payment
            }
            
        except Exception as e:
            logger.error(f"Error fetching Razorpay payment details: {str(e)}")
            return None
    
    @staticmethod
    def get_razorpay_settlements(
        key_id: str,
        key_secret: str,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        count: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Fetch settlements from Razorpay
        
        Returns list of settlements with their details
        """
        try:
            client = razorpay.Client(auth=(key_id, key_secret))
            
            params = {"count": count}
            if from_date:
                params["from"] = int(from_date.timestamp())
            if to_date:
                params["to"] = int(to_date.timestamp())
            
            settlements = client.settlement.all(params)
            
            result = []
            for settlement in settlements.get("items", []):
                result.append({
                    "settlement_id": settlement.get("id"),
                    "amount": settlement.get("amount", 0) / 100,  # Convert paise to rupees
                    "status": settlement.get("status"),
                    "fees": settlement.get("fees", 0) / 100,
                    "tax": settlement.get("tax", 0) / 100,
                    "utr": settlement.get("utr"),  # Bank reference
                    "created_at": datetime.fromtimestamp(settlement.get("created_at", 0), tz=timezone.utc)
                })
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching Razorpay settlements: {str(e)}")
            return []


async def sync_payment_settlement_data(db, payment_id: str) -> Optional[Dict[str, Any]]:
    """
    Sync settlement data for a specific payment from the gateway
    
    Updates the payment record with:
    - gateway_fee: Actual fee charged by gateway
    - gateway_tax: Tax on gateway fee (if applicable)
    - settlement_amount: Amount to be settled
    - settlement_status: pending/settled
    - settlement_synced_at: When we last synced
    """
    # Get payment record
    payment = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment:
        logger.warning(f"Payment not found: {payment_id}")
        return None
    
    # Get payment account
    payment_account = await db.payment_accounts.find_one(
        {"id": payment.get("payment_account_id")},
        {"_id": 0}
    )
    if not payment_account:
        logger.warning(f"Payment account not found for payment: {payment_id}")
        return None
    
    gateway = payment.get("gateway")
    gateway_payment_id = payment.get("gateway_payment_id")
    
    if not gateway_payment_id:
        logger.warning(f"No gateway payment ID for payment: {payment_id}")
        return None
    
    settlement_data = None
    
    if gateway == "instamojo":
        settlement_data = await SettlementService.get_instamojo_payment_details(
            api_key=payment_account.get("instamojo_api_key"),
            auth_token=payment_account.get("instamojo_auth_token"),
            payment_id=gateway_payment_id,
            mode=payment_account.get("instamojo_mode", "sandbox")
        )
    elif gateway == "razorpay":
        settlement_data = SettlementService.get_razorpay_payment_details(
            key_id=payment_account.get("razorpay_key_id"),
            key_secret=payment_account.get("razorpay_key_secret"),
            payment_id=gateway_payment_id
        )
    
    if settlement_data:
        # Update payment record with settlement data
        update_data = {
            "gateway_fee": settlement_data.get("fees", 0),
            "gateway_tax": settlement_data.get("tax", 0),
            "settlement_amount": settlement_data.get("settlement_amount", payment.get("amount", 0)),
            "settlement_status": "settled" if settlement_data.get("settled") else "pending",
            "settlement_synced_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.payments.update_one(
            {"id": payment_id},
            {"$set": update_data}
        )
        
        logger.info(f"Updated settlement data for payment {payment_id}: fee={update_data['gateway_fee']}, status={update_data['settlement_status']}")
        return update_data
    
    return None


async def sync_campaign_settlements(db, campaign_id: str) -> Dict[str, Any]:
    """
    Sync settlement data for all payments of a campaign
    
    Returns summary:
    {
        'total_payments': int,
        'synced': int,
        'failed': int,
        'total_collected': float,
        'total_gateway_fees': float,
        'total_settled': float,
        'total_pending': float
    }
    """
    # Get all completed payments for the campaign
    payments = await db.payments.find(
        {
            "campaign_id": campaign_id,
            "status": "completed"
        },
        {"_id": 0}
    ).to_list(10000)
    
    summary = {
        "total_payments": len(payments),
        "synced": 0,
        "failed": 0,
        "total_collected": 0,
        "total_gateway_fees": 0,
        "total_settled": 0,
        "total_pending": 0
    }
    
    for payment in payments:
        summary["total_collected"] += payment.get("amount", 0)
        
        # Check if we need to sync
        if not payment.get("settlement_synced_at"):
            result = await sync_payment_settlement_data(db, payment["id"])
            if result:
                summary["synced"] += 1
                summary["total_gateway_fees"] += result.get("gateway_fee", 0)
                if result.get("settlement_status") == "settled":
                    summary["total_settled"] += result.get("settlement_amount", 0)
                else:
                    summary["total_pending"] += result.get("settlement_amount", 0)
            else:
                summary["failed"] += 1
                # Use existing data or estimate
                gateway_fee = payment.get("gateway_fee", payment.get("amount", 0) * 0.02)
                summary["total_gateway_fees"] += gateway_fee
                summary["total_pending"] += payment.get("amount", 0) - gateway_fee
        else:
            # Use existing synced data
            summary["total_gateway_fees"] += payment.get("gateway_fee", 0)
            if payment.get("settlement_status") == "settled":
                summary["total_settled"] += payment.get("settlement_amount", payment.get("amount", 0) - payment.get("gateway_fee", 0))
            else:
                summary["total_pending"] += payment.get("settlement_amount", payment.get("amount", 0) - payment.get("gateway_fee", 0))
    
    return summary


async def get_campaign_settlement_summary(db, campaign_id: str) -> Dict[str, Any]:
    """
    Get settlement summary for a campaign from stored data
    
    Returns:
    {
        'total_collected': float,  # Gross amount users paid
        'gateway_fees': float,  # Total gateway fees
        'gateway_settled': float,  # Amount settled by gateway
        'gateway_pending': float,  # Amount pending settlement
    }
    """
    # Get all completed payments for the campaign
    payments = await db.payments.find(
        {
            "campaign_id": campaign_id,
            "status": "completed"
        },
        {"_id": 0, "amount": 1, "gateway_fee": 1, "settlement_amount": 1, "settlement_status": 1}
    ).to_list(10000)
    
    summary = {
        "total_collected": 0,
        "gateway_fees": 0,
        "gateway_settled": 0,
        "gateway_pending": 0
    }
    
    for payment in payments:
        amount = payment.get("amount", 0)
        gateway_fee = payment.get("gateway_fee")
        settlement_amount = payment.get("settlement_amount")
        settlement_status = payment.get("settlement_status", "pending")
        
        summary["total_collected"] += amount
        
        # If we have synced data, use it
        if gateway_fee is not None:
            summary["gateway_fees"] += gateway_fee
            net_amount = settlement_amount if settlement_amount is not None else (amount - gateway_fee)
        else:
            # Estimate gateway fee at 2% if not synced
            estimated_fee = amount * 0.02
            summary["gateway_fees"] += estimated_fee
            net_amount = amount - estimated_fee
        
        if settlement_status == "settled":
            summary["gateway_settled"] += net_amount
        else:
            summary["gateway_pending"] += net_amount
    
    return summary
