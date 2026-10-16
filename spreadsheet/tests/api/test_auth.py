import pytest

from django.test import Client
from django.urls import reverse


@pytest.fixture
def csrf_client():
    client = Client(enforce_csrf_checks=True)
    client.get(reverse('index'))
    return client


def post(client, name, data=None):
    token = client.cookies['csrftoken'].value
    return client.post(reverse(name), data or {}, HTTP_X_CSRFTOKEN=token)


@pytest.mark.django_db
def test_login_and_logout(csrf_client, django_user_model):
    django_user_model.objects.create_user('ada', password='pw', first_name='Ada', last_name='Lovelace')
    response = post(csrf_client, 'spreadsheet-login', {'username': 'ada', 'password': 'pw'})
    assert response.status_code == 200
    assert response.json()['user'] == {
        'authenticated': True, 'name': 'Ada Lovelace', 'username': 'ada', 'initial': 'A',
    }
    assert csrf_client.get(reverse('spreadsheet-user')).json()['user']['authenticated']
    response = post(csrf_client, 'spreadsheet-logout')
    assert response.status_code == 200
    assert response.json()['user']['authenticated'] is False


@pytest.mark.django_db
def test_login_rotates_csrf_token(csrf_client, admin_user):
    old_token = csrf_client.cookies['csrftoken'].value
    response = post(csrf_client, 'spreadsheet-login', {'username': admin_user.username, 'password': 'password'})
    new_token = response.json()['csrfToken']
    assert new_token != old_token
    create = lambda token: csrf_client.post('/rest/api/Variety/', {'name': 'Mint'}, HTTP_X_CSRFTOKEN=token)
    assert create(old_token).status_code == 403
    assert create(new_token).status_code == 201


@pytest.mark.django_db
def test_login_wrong_password(csrf_client, django_user_model):
    django_user_model.objects.create_user('ada', password='pw')
    response = post(csrf_client, 'spreadsheet-login', {'username': 'ada', 'password': 'nope'})
    assert response.status_code == 400
    assert 'non_field_errors' in response.json()
    assert not csrf_client.get(reverse('spreadsheet-user')).json()['user']['authenticated']


@pytest.mark.django_db
def test_login_requires_csrf_token(django_user_model):
    django_user_model.objects.create_user('ada', password='pw')
    client = Client(enforce_csrf_checks=True)
    response = client.post(reverse('spreadsheet-login'), {'username': 'ada', 'password': 'pw'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_name_falls_back_to_username(csrf_client, django_user_model):
    django_user_model.objects.create_user('jdoe', password='pw')
    user = post(csrf_client, 'spreadsheet-login', {'username': 'jdoe', 'password': 'pw'}).json()['user']
    assert user['name'] == 'jdoe'
    assert user['initial'] == 'J'
