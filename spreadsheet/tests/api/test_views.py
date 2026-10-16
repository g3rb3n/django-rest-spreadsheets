import pytest

from django.contrib.auth.models import Permission
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
def test_drf_object_create(admin_user):
    VarietyFactory()
    client = APIClient()
    client.force_authenticate(admin_user)
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



@pytest.mark.django_db
def test_anonymous_cannot_write():
    variety = VarietyFactory()
    client = APIClient()
    url = f'/rest/api/Variety/{variety.pk}/'
    assert client.post('/rest/api/Variety/', {'name': 'Mint'}).status_code == 403
    assert client.patch(url, {'name': 'Mint'}).status_code == 403
    assert client.delete(url).status_code == 403


@pytest.mark.django_db
def test_write_follows_model_permissions(django_user_model):
    variety = VarietyFactory()
    user = django_user_model.objects.create_user('editor')
    user.user_permissions.add(Permission.objects.get(codename='change_variety'))
    client = APIClient()
    client.force_authenticate(user)
    url = f'/rest/api/Variety/{variety.pk}/'
    assert client.patch(url, {'name': 'Mint'}).status_code == 200
    assert client.delete(url).status_code == 403
    assert client.post('/rest/api/Variety/', {'name': 'Basil'}).status_code == 403


@pytest.mark.django_db
def test_schema_actions_anonymous(client):
    schema = client.get(reverse("schema")).json()
    assert schema['Plant']['actions'] == {
        'read': True, 'create': False, 'update': False, 'delete': False,
    }


@pytest.mark.django_db
def test_schema_actions_admin(admin_client):
    schema = admin_client.get(reverse("schema")).json()
    assert schema['Variety']['actions'] == {
        'read': True, 'create': True, 'update': True, 'delete': True,
    }


@pytest.mark.django_db
def test_options_without_write_permission():
    response = APIClient().options('/rest/api/Plant/')
    assert response.status_code == 200


@pytest.mark.django_db
def test_primary_key_is_listed_and_read_only(admin_user):
    variety = VarietyFactory()
    client = APIClient()
    client.force_authenticate(admin_user)
    assert client.get('/rest/api/Variety/').json()[0]['id'] == variety.pk
    created = client.post('/rest/api/Variety/', {'name': 'Mint', 'id': 999}).json()
    assert created['id'] != 999
    response = client.patch(f'/rest/api/Variety/{variety.pk}/', {'id': 555})
    assert response.json()['id'] == variety.pk
