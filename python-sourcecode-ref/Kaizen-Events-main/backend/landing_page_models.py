from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum

class SectionType(str, Enum):
    HERO = "hero"
    ABOUT = "about"
    PRICING = "pricing"
    SPEAKERS = "speakers"
    SCHEDULE = "schedule"
    GALLERY = "gallery"
    FAQ = "faq"
    CONTACT = "contact"

class LandingPageSection(BaseModel):
    id: str
    type: SectionType
    title: Optional[str] = None
    subtitle: Optional[str] = None
    content: Optional[str] = None
    image_url: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    order: int = 0
    visible: bool = True

class LandingPageTheme(BaseModel):
    primary_color: str = "#7c3aed"
    secondary_color: str = "#14b8a6"
    background_color: str = "#ffffff"
    text_color: str = "#1e293b"
    font_family: str = "Plus Jakarta Sans"

class LandingPageConfig(BaseModel):
    sections: List[LandingPageSection]
    theme: LandingPageTheme
    show_registration_button: bool = True
    custom_css: Optional[str] = None

class LandingPageUpdate(BaseModel):
    sections: Optional[List[LandingPageSection]] = None
    theme: Optional[LandingPageTheme] = None
    show_registration_button: Optional[bool] = None
    custom_css: Optional[str] = None
