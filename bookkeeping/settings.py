"""
Settings for the bookkeeping example project: the testproject settings
(including its permissions: public read, admins edit) with the bookkeeping
app and a database of its own.

    python bookkeeping/manage.py runserver 8001
"""

import os

from testproject.settings import *  # noqa: F401,F403
from testproject.settings import BASE_DIR, INSTALLED_APPS

INSTALLED_APPS = [app for app in INSTALLED_APPS if app != 'testproject'] + ['bookkeeping']

ROOT_URLCONF = 'bookkeeping.urls'

WSGI_APPLICATION = 'bookkeeping.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.path.join(BASE_DIR, 'bookkeeping.sqlite3'),
    }
}
