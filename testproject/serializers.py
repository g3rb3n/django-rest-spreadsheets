import sys
import logging

from spreadsheet.serializers import generate


logger = logging.getLogger(__name__)
logger.info('Load serializers')

generated = generate(sys.modules['testproject.models'], sys.modules['testproject.serializers'])
