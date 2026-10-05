"""Integration Service - Centralized management of all third-party integrations"""
import os
import httpx
import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ==================== INTERAKT (WHATSAPP) - ENABLED FOR CLOSED GROUPS ====================
# WhatsApp integration enabled only for closed group campaigns

class InteraktService:
    """Service for sending WhatsApp messages via Interakt API - Enabled for closed groups"""
    
    def __init__(self):
        # WhatsApp integration enabled for closed group campaigns
        self.api_key = os.environ.get('INTERAKT_SECRET_KEY', '')
        self.base_url = "https://api.interakt.ai/v1/public"
    
    def is_configured(self) -> bool:
        """Check if Interakt is properly configured"""
        return bool(self.api_key)
    
    async def send_template_message(
        self,
        phone_number: str,
        country_code: str = "91",
        template_name: str = "event_registration_confirmation",
        body_values: List[str] = None,
        header_values: List[str] = None,
        button_values: List[str] = None
    ) -> Dict[str, Any]:
        """
        Send a WhatsApp template message via Interakt
        
        Args:
            phone_number: Recipient phone number (without country code)
            country_code: Country code (default: 91 for India)
            template_name: Name of the approved WhatsApp template
            body_values: List of values to replace {{1}}, {{2}}, etc. in body
            header_values: List of values for header placeholders
            button_values: List of values for button placeholders
        """
        if not self.is_configured():
            return {"success": False, "error": "Interakt API key not configured"}
        
        # Clean phone number - remove spaces, dashes, leading zeros
        clean_phone = phone_number.lstrip('0').replace(' ', '').replace('-', '').replace('+', '')
        # Remove country code if included in phone number
        if clean_phone.startswith(country_code):
            clean_phone = clean_phone[len(country_code):]
        
        clean_country = country_code.replace('+', '')
        
        # Build payload
        payload = {
            "countryCode": f"+{clean_country}",
            "phoneNumber": clean_phone,
            "type": "Template",
            "template": {
                "name": template_name,
                "languageCode": "en"
            }
        }
        
        # Add body values if provided
        if body_values:
            payload["template"]["bodyValues"] = body_values
        
        # Add header values if provided
        if header_values:
            payload["template"]["headerValues"] = header_values
        
        # Add button values if provided
        if button_values:
            payload["template"]["buttonValues"] = {
                "0": button_values
            }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/message/",
                    json=payload,
                    headers={
                        "Authorization": f"Basic {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )
                
                response_data = response.json() if response.text else {}
                
                if response.status_code == 200:
                    logger.info(f"WhatsApp sent successfully to +{clean_country}{clean_phone}")
                    return {
                        "success": True,
                        "response": response_data,
                        "message": f"WhatsApp sent to +{clean_country}{clean_phone}",
                        "recipient": f"+{clean_country}{clean_phone}"
                    }
                else:
                    error_msg = response_data.get('message', response.text)
                    logger.error(f"WhatsApp send failed: {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg,
                        "status_code": response.status_code
                    }
                    
        except httpx.TimeoutException:
            logger.error("WhatsApp send timeout")
            return {"success": False, "error": "Request timeout"}
        except Exception as e:
            logger.error(f"WhatsApp send error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def send_registration_confirmation(
        self,
        phone_number: str,
        name: str,
        event_name: str,
        amount: float,
        registration_id: str,
        country_code: str = "91"
    ) -> Dict[str, Any]:
        """
        Send registration confirmation WhatsApp message
        
        This uses a template that should be pre-approved in your Interakt dashboard.
        Template name: event_registration_confirmation
        Expected variables: {{1}} = name, {{2}} = event_name, {{3}} = amount, {{4}} = registration_id
        """
        return await self.send_template_message(
            phone_number=phone_number,
            country_code=country_code,
            template_name="event_registration_confirmation",
            body_values=[
                name,
                event_name,
                f"₹{amount:,.0f}",
                registration_id[:8].upper()
            ]
        )
    
    async def send_payment_reminder(
        self,
        phone_number: str,
        name: str,
        event_name: str,
        amount: float,
        payment_link: str = "",
        country_code: str = "91"
    ) -> Dict[str, Any]:
        """
        Send payment reminder WhatsApp message
        
        Template name: payment_reminder
        Expected variables: {{1}} = name, {{2}} = event_name, {{3}} = amount
        """
        return await self.send_template_message(
            phone_number=phone_number,
            country_code=country_code,
            template_name="payment_reminder",
            body_values=[
                name,
                event_name,
                f"₹{amount:,.0f}"
            ]
        )
    
    async def get_templates(self) -> Dict[str, Any]:
        """Get list of approved WhatsApp templates from Interakt"""
        if not self.is_configured():
            return {"success": False, "error": "Interakt API key not configured"}
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/track/users/",
                    headers={
                        "Authorization": f"Basic {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    return {"success": True, "data": response.json()}
                else:
                    return {"success": False, "error": response.text}
                    
        except Exception as e:
            return {"success": False, "error": str(e)}


# ==================== BREVO/SENDINBLUE (EMAIL) ====================

class BrevoService:
    """Service for sending emails via Brevo (formerly Sendinblue) API"""
    
    def __init__(self):
        self.api_key = os.environ.get('BREVO_API_KEY', '')
        self.base_url = "https://api.brevo.com/v3"
    
    def is_configured(self) -> bool:
        """Check if Brevo is properly configured"""
        return bool(self.api_key)
    
    async def send_email(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        sender_email: str = None,
        sender_name: str = None,
        cc: List[str] = None,
        bcc: List[str] = None,
        reply_to: str = None
    ) -> Dict[str, Any]:
        """
        Send an email via Brevo API
        
        Args:
            to_email: Recipient email address
            to_name: Recipient name
            subject: Email subject
            html_content: HTML content of the email
            sender_email: Sender email (must be verified in Brevo)
            sender_name: Sender name
            cc: List of CC email addresses
            bcc: List of BCC email addresses
            reply_to: Reply-to email address
        """
        if not self.is_configured():
            return {"success": False, "error": "Brevo API key not configured"}
        
        payload = {
            "sender": {
                "name": sender_name or "Kaizen Events",
                "email": sender_email or "noreply@kaizenevents.com"
            },
            "to": [{"email": to_email, "name": to_name}],
            "subject": subject,
            "htmlContent": html_content
        }
        
        if cc:
            payload["cc"] = [{"email": email} for email in cc]
        
        if bcc:
            payload["bcc"] = [{"email": email} for email in bcc]
        
        if reply_to:
            payload["replyTo"] = {"email": reply_to}
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/smtp/email",
                    json=payload,
                    headers={
                        "api-key": self.api_key,
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )
                
                response_data = response.json() if response.text else {}
                
                if response.status_code in [200, 201]:
                    logger.info(f"Email sent successfully to {to_email}")
                    return {
                        "success": True,
                        "message_id": response_data.get("messageId"),
                        "message": f"Email sent to {to_email}"
                    }
                else:
                    error_msg = response_data.get('message', response.text)
                    logger.error(f"Email send failed: {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg,
                        "status_code": response.status_code
                    }
                    
        except httpx.TimeoutException:
            logger.error("Email send timeout")
            return {"success": False, "error": "Request timeout"}
        except Exception as e:
            logger.error(f"Email send error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def send_registration_confirmation(
        self,
        to_email: str,
        to_name: str,
        event_name: str,
        registration_id: str,
        amount: float,
        payment_status: str,
        organization_name: str,
        sender_email: str = None,
        sender_name: str = None,
        cc: List[str] = None,
        bcc: List[str] = None
    ) -> Dict[str, Any]:
        """Send registration confirmation email"""
        
        html_content = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
    <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
            <td style="padding:40px 0;">
                <table role="presentation" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#7c3aed,#14b8a6);padding:32px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:24px;">Registration Confirmed!</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding:32px;">
                            <p style="margin:0 0 16px;font-size:16px;color:#333;">Dear <strong>{to_name}</strong>,</p>
                            
                            <p style="margin:0 0 24px;font-size:16px;color:#555;line-height:1.6;">
                                Thank you for registering for <strong>{event_name}</strong>! Your registration has been confirmed.
                            </p>
                            
                            <!-- Registration Details -->
                            <table style="width:100%;background-color:#f8f9fa;border-radius:8px;margin:24px 0;">
                                <tr>
                                    <td style="padding:20px;">
                                        <h3 style="margin:0 0 16px;color:#7c3aed;font-size:16px;">Registration Details</h3>
                                        <p style="margin:4px 0;color:#555;"><strong>Event:</strong> {event_name}</p>
                                        <p style="margin:4px 0;color:#555;"><strong>Registration ID:</strong> {registration_id[:8].upper()}</p>
                                        <p style="margin:4px 0;color:#555;"><strong>Amount:</strong> ₹{amount:,.0f}</p>
                                        <p style="margin:4px 0;color:#555;"><strong>Status:</strong> <span style="color:#22c55e;font-weight:bold;">{payment_status.title()}</span></p>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin:24px 0 0;font-size:14px;color:#888;">
                                If you have any questions, please contact our support team.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color:#f8f9fa;padding:24px;text-align:center;border-top:1px solid #eee;">
                            <p style="margin:0;font-size:12px;color:#888;">© {datetime.now().year} {organization_name}. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>'''
        
        return await self.send_email(
            to_email=to_email,
            to_name=to_name,
            subject=f"Registration Confirmed - {event_name}",
            html_content=html_content,
            sender_email=sender_email,
            sender_name=sender_name or organization_name,
            cc=cc,
            bcc=bcc
        )


# ==================== GOOGLE SHEETS (SERVICE ACCOUNT) ====================

class GoogleSheetsService:
    """Service for syncing data to Google Sheets using Service Account"""
    
    def __init__(self):
        self.credentials_json = os.environ.get('GOOGLE_SHEETS_CREDENTIALS', '')
        self.sheets_service = None
        self.drive_service = None
    
    def is_configured(self) -> bool:
        """Check if Google Sheets is properly configured"""
        return bool(self.credentials_json)
    
    async def _get_credentials(self, delegate_email: str = None):
        """Get credentials object with optional domain-wide delegation"""
        if not self.is_configured():
            raise Exception("Google Sheets credentials not configured")
        
        import json
        from google.oauth2 import service_account
        
        creds_dict = json.loads(self.credentials_json)
        
        credentials = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=[
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
        )
        
        # If delegate_email provided, use domain-wide delegation to impersonate user
        if delegate_email:
            credentials = credentials.with_subject(delegate_email)
        
        return credentials
    
    async def _get_service(self, delegate_email: str = None):
        """Get or create the Google Sheets service"""
        # Don't cache if using delegation (different users)
        if delegate_email or not self.sheets_service:
            try:
                from googleapiclient.discovery import build
                
                credentials = await self._get_credentials(delegate_email)
                
                service = await asyncio.to_thread(
                    build, 'sheets', 'v4', credentials=credentials
                )
                
                if not delegate_email:
                    self.sheets_service = service
                return service
                
            except Exception as e:
                logger.error(f"Failed to initialize Google Sheets service: {e}")
                raise
        
        return self.sheets_service
    
    async def _get_drive_service(self, delegate_email: str = None):
        """Get or create the Google Drive service for sharing"""
        # Don't cache if using delegation
        if delegate_email or not self.drive_service:
            try:
                from googleapiclient.discovery import build
                
                credentials = await self._get_credentials(delegate_email)
                
                service = await asyncio.to_thread(
                    build, 'drive', 'v3', credentials=credentials
                )
                
                if not delegate_email:
                    self.drive_service = service
                return service
                
            except Exception as e:
                logger.error(f"Failed to initialize Google Drive service: {e}")
                raise
        
        return self.drive_service
    
    async def create_spreadsheet(
        self,
        title: str,
        sheet_name: str = "Registrations",
        delegate_email: str = None
    ) -> Dict[str, Any]:
        """Create a new Google Spreadsheet using domain-wide delegation"""
        if not self.is_configured():
            return {"success": False, "error": "Google Sheets not configured"}
        
        try:
            # Use delegation to create spreadsheet in user's Drive
            service = await self._get_service(delegate_email)
            
            spreadsheet_body = {
                'properties': {'title': title},
                'sheets': [{
                    'properties': {
                        'title': sheet_name,
                        'gridProperties': {'frozenRowCount': 1}
                    }
                }]
            }
            
            result = await asyncio.to_thread(
                lambda: service.spreadsheets().create(body=spreadsheet_body).execute()
            )
            
            spreadsheet_id = result.get('spreadsheetId')
            spreadsheet_url = result.get('spreadsheetUrl')
            
            logger.info(f"Created spreadsheet: {title} ({spreadsheet_id}) for {delegate_email or 'service account'}")
            
            return {
                "success": True,
                "spreadsheet_id": spreadsheet_id,
                "spreadsheet_url": spreadsheet_url,
                "title": title
            }
            
        except Exception as e:
            logger.error(f"Failed to create spreadsheet: {e}")
            return {"success": False, "error": str(e)}
    
    async def share_spreadsheet(
        self,
        spreadsheet_id: str,
        email: str,
        role: str = "writer"
    ) -> Dict[str, Any]:
        """Share a spreadsheet with a user"""
        if not self.is_configured():
            return {"success": False, "error": "Google Sheets not configured"}
        
        try:
            drive_service = await self._get_drive_service()
            
            permission = {
                'type': 'user',
                'role': role,
                'emailAddress': email
            }
            
            await asyncio.to_thread(
                lambda: drive_service.permissions().create(
                    fileId=spreadsheet_id,
                    body=permission,
                    sendNotificationEmail=True,
                    emailMessage="A Google Sheet has been shared with you for Kaizen Events registration sync."
                ).execute()
            )
            
            logger.info(f"Shared spreadsheet {spreadsheet_id} with {email}")
            
            return {
                "success": True,
                "message": f"Spreadsheet shared with {email}"
            }
            
        except Exception as e:
            logger.error(f"Failed to share spreadsheet: {e}")
            return {"success": False, "error": str(e)}
    
    async def setup_campaign_sheet(
        self,
        sheet_name: str,
        owner_email: str,
        campaign_name: str
    ) -> Dict[str, Any]:
        """
        Create a new spreadsheet for a campaign using domain-wide delegation.
        The spreadsheet is created in the owner's Drive directly.
        """
        # Create the spreadsheet in the owner's Drive using delegation
        create_result = await self.create_spreadsheet(
            title=sheet_name,
            sheet_name="Registrations",
            delegate_email=owner_email  # Create in owner's Drive
        )
        
        if not create_result["success"]:
            return create_result
        
        spreadsheet_id = create_result["spreadsheet_id"]
        
        # Add headers (using delegation to the same user)
        headers_result = await self.create_sheet_with_headers(
            spreadsheet_id,
            "Registrations",
            delegate_email=owner_email
        )
        
        if not headers_result["success"]:
            logger.warning(f"Failed to add headers: {headers_result.get('error')}")
        
        # No need to share since it's already in owner's Drive!
        
        return {
            "success": True,
            "spreadsheet_id": spreadsheet_id,
            "spreadsheet_url": create_result["spreadsheet_url"],
            "title": sheet_name,
            "shared_with": owner_email
        }
    
    async def append_row(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        values: List[Any],
        delegate_email: str = None
    ) -> Dict[str, Any]:
        """Append a single row to a Google Sheet"""
        if not self.is_configured():
            return {"success": False, "error": "Google Sheets not configured"}
        
        try:
            service = await self._get_service(delegate_email)
            
            body = {"values": [values]}
            
            result = await asyncio.to_thread(
                lambda: service.spreadsheets().values().append(
                    spreadsheetId=spreadsheet_id,
                    range=f"{sheet_name}!A:Z",
                    valueInputOption="RAW",
                    insertDataOption="INSERT_ROWS",
                    body=body
                ).execute()
            )
            
            return {
                "success": True,
                "updates": result.get('updates', {}),
                "message": "Row appended successfully"
            }
            
        except Exception as e:
            logger.error(f"Failed to append to sheet: {e}")
            return {"success": False, "error": str(e)}
    
    async def sync_registration(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        registration: Dict,
        campaign: Dict,
        delegate_email: str = None
    ) -> Dict[str, Any]:
        """Sync a registration to Google Sheet"""
        
        form_data = registration.get('form_data', {})
        
        # Build row with standard fields
        row = [
            registration.get('id', '')[:8].upper(),
            datetime.fromisoformat(registration.get('created_at', datetime.now(timezone.utc).isoformat())).strftime('%Y-%m-%d %H:%M'),
            form_data.get('name', form_data.get('full_name', '')),
            form_data.get('email', ''),
            form_data.get('phone', form_data.get('mobile', '')),
            registration.get('payment_status', 'pending'),
            str(registration.get('total_amount', 0)),
            registration.get('payment_id', ''),
            campaign.get('name', '')
        ]
        
        return await self.append_row(spreadsheet_id, sheet_name, row, delegate_email)
    
    async def create_sheet_with_headers(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        delegate_email: str = None
    ) -> Dict[str, Any]:
        """Create headers in a sheet"""
        headers = [
            "Registration ID",
            "Date",
            "Name",
            "Email",
            "Phone",
            "Payment Status",
            "Amount",
            "Payment ID",
            "Campaign"
        ]
        
        return await self.append_row(spreadsheet_id, sheet_name, headers, delegate_email)


# ==================== SINGLETON INSTANCES ====================

interakt_service = InteraktService()
brevo_service = BrevoService()
google_sheets_service = GoogleSheetsService()
