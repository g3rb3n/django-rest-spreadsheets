import pytest

from spreadsheet.schema import generate

import testproject.models


@pytest.mark.django_db
def test_generate_schema():
    schema = generate(testproject.models)
    assert 'Plant' in schema
    plant = schema['Plant']
    assert plant['title'] == 'Plant'
    assert plant['description'] == 'Plant'
    assert plant['type'] == 'object'
    assert plant['fields'] == ["id",
            "variety",
            "date_planted",
            "place",
            "companions",
    ]
    assert plant['properties']['variety']['type'] == 'object'
    assert plant['properties']['variety']['multiple'] == False
    assert plant['properties']['variety']['required'] == True
    companions = plant['properties']['companions']
    assert companions['type'] == 'many'
    assert companions['$ref'] == 'Variety'
    assert companions['multiple'] == True
    assert companions['required'] == False
    assert 'readOnly' not in companions
