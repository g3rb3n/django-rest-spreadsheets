import pytest

from django.urls import reverse
from rest_framework.test import APIClient

from testproject.factories import PlantFactory, VarietyFactory


@pytest.mark.django_db
def test_schema_view(client):
    url = reverse("schema")
    response = client.get(url)
    assert response.status_code == 200
    schema = response.json()
    assert 'Plant' in schema


@pytest.mark.django_db
def test_drf_view(client):
    url = '/rest/api/'
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert 'Plant' in data


@pytest.mark.django_db
def test_drf_object_view(client):
    PlantFactory()
    client = APIClient()
    url = '/rest/api/Plant/'
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    data = data[0]
    assert data['place'] == 'Garden'


@pytest.mark.django_db
def test_drf_object_create(client):
    VarietyFactory()
    client = APIClient()
    url = '/rest/api/Plant/'
    data = {
        'variety': '/rest/api/Variety/1/',
        'date_planted': '2025-03-01',
        'place': 'Garden',
    }
    response = client.post(url, data)
    print(response.json())
    assert response.status_code == 201
    data = response.json()
    assert data['place'] == 'Garden'

