#!/usr/bin/env python3
"""
Django's command-line utility for the test project, e.g.

    python testproject/manage.py runserver
"""
import os
import sys
from pathlib import Path


def main():
    # Import from the repository root (the spreadsheet library and this
    # project's package), not from this folder.
    sys.path[0] = str(Path(__file__).resolve().parent.parent)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'testproject.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
