import sys

from spreadsheet.views import generate

from . import serializers

base_url = 'http://localhost:8001/rest/api/'

generated = generate(
    sys.modules['bookkeeping.models'],
    sys.modules['bookkeeping.serializers'],
    sys.modules['bookkeeping.views'],
    base_url
)
