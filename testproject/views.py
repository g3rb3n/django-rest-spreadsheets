import sys

from spreadsheet.views import generate

from . import serializers

base_url = 'http://localhost:8000/nl/testproject/rest/api/'


#m_models = sys.modules['testproject.models']
#m_views = sys.modules['testproject.views']
#m_serializers = sys.modules['testproject.serializers']

generated = generate(
    sys.modules['testproject.models'], 
    sys.modules['testproject.serializers'], 
    sys.modules['testproject.views'], 
    base_url
)
