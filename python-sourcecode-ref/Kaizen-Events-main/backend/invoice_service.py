from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from datetime import datetime
import io
from typing import Dict, Any

class InvoiceService:
    def generate_invoice_pdf(self, registration_data: Dict[str, Any], campaign_data: Dict[str, Any]) -> bytes:
        """Generate invoice PDF"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#7c3aed'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        elements.append(Paragraph("TAX INVOICE", title_style))
        elements.append(Spacer(1, 0.3*inch))
        
        # Invoice details
        invoice_number = registration_data.get('invoice_number', 'INV-000000')
        invoice_date = datetime.now().strftime('%d %B %Y')
        
        details_data = [
            ['Invoice Number:', invoice_number],
            ['Invoice Date:', invoice_date],
            ['Campaign:', campaign_data.get('name', 'N/A')],
        ]
        
        details_table = Table(details_data, colWidths=[2*inch, 4*inch])
        details_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ]))
        elements.append(details_table)
        elements.append(Spacer(1, 0.4*inch))
        
        # Billing details
        billing_title = Paragraph("<b>Billing Details</b>", styles['Heading2'])
        elements.append(billing_title)
        elements.append(Spacer(1, 0.2*inch))
        
        # Items table
        items_data = [['Description', 'Amount']]
        items_data.append(['Registration Fee', f"₹{registration_data.get('total_amount', 0):.2f}"])
        
        items_table = Table(items_data, colWidths=[4*inch, 2*inch])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7c3aed')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Total
        total_style = ParagraphStyle(
            'Total',
            parent=styles['Normal'],
            fontSize=14,
            textColor=colors.HexColor('#7c3aed'),
            alignment=TA_RIGHT,
            fontName='Helvetica-Bold'
        )
        elements.append(Paragraph(f"<b>Total Amount: ₹{registration_data.get('total_amount', 0):.2f}</b>", total_style))
        elements.append(Spacer(1, 0.5*inch))
        
        # Footer
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.grey,
            alignment=TA_CENTER
        )
        elements.append(Paragraph("Thank you for your registration!", footer_style))
        elements.append(Paragraph(f"Kaizen Events - {campaign_data.get('organization_name', '')}", footer_style))
        
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

# Singleton instance
invoice_service = InvoiceService()
