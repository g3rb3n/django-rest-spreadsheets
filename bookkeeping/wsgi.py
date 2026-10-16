"""
WSGI config for the bookkeeping example project.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bookkeeping.settings')

application = get_wsgi_application()
