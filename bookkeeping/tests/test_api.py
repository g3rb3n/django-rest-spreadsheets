"""
Run with the bookkeeping settings: make test-bookkeeping
"""
from decimal import Decimal

import pytest

from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APIClient

from bookkeeping.factories import CustomerFactory, InvoiceFactory, InvoiceItemFactory, TimesheetFactory
from bookkeeping.models import Customer, Invoice, InvoiceItem, Timesheet


@pytest.fixture
def admin_client_api(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    return client


@pytest.mark.django_db
def test_schema_lists_the_bookkeeping_models(client):
    schema = client.get(reverse('schema')).json()
    assert {'Customer', 'Invoice', 'InvoiceItem', 'Timesheet'} <= set(schema)
    invoice = schema['Invoice']['properties']
    assert invoice['customer']['$ref'] == 'Customer'
    assert invoice['status']['type'] == 'oneOf'
    assert [choice['const'] for choice in invoice['status']['oneOf']] == ['draft', 'sent', 'paid']
    assert invoice['notes']['type'] == 'text'
    item = schema['InvoiceItem']['properties']
    assert item['unit_price']['type'] == 'number'
    assert item['unit_price']['step'] == '0.01'
    assert [choice['const'] for choice in item['vat_rate']['oneOf']] == [0, 9, 21]
    timesheet = schema['Timesheet']['properties']
    assert timesheet['start_time']['type'] == 'time'
    assert timesheet['billable']['type'] == 'boolean'
    assert timesheet['invoice']['required'] is False


@pytest.mark.django_db
def test_anonymous_can_read_but_not_write(client):
    InvoiceFactory()
    assert client.get('/rest/api/Invoice/').status_code == 200
    assert client.post('/rest/api/Customer/', {'name': 'Nope'}).status_code == 403


@pytest.mark.django_db
def test_create_an_invoice_with_items(admin_client_api):
    customer = admin_client_api.post('/rest/api/Customer/', {
        'name': 'Acme Gardens', 'email': 'billing@acme.example', 'hourly_rate': '85.00',
    }).json()
    invoice = admin_client_api.post('/rest/api/Invoice/', {
        'number': '2025-0042', 'customer': customer['_'], 'date': '2025-03-01',
        'due_date': '2025-03-31', 'status': 'draft',
    })
    assert invoice.status_code == 201, invoice.json()
    item = admin_client_api.post('/rest/api/InvoiceItem/', {
        'invoice': invoice.json()['_'], 'description': 'Consultancy',
        'quantity': '7.50', 'unit_price': '85.00', 'vat_rate': '21',
    })
    assert item.status_code == 201, item.json()
    assert item.json()['quantity'] == '7.50'
    assert Invoice.objects.get(number='2025-0042').total == Decimal('771.38')


@pytest.mark.django_db
def test_invoice_number_is_unique(admin_client_api):
    existing = InvoiceFactory(number='2025-0001')
    response = admin_client_api.post('/rest/api/Invoice/', {
        'number': '2025-0001', 'customer': f'/rest/api/Customer/{existing.customer.pk}/',
        'date': '2025-03-01', 'due_date': '2025-03-31', 'status': 'draft',
    })
    assert response.status_code == 400
    assert 'number' in response.json()


@pytest.mark.django_db
def test_customer_with_invoices_is_protected(admin_client_api):
    invoice = InvoiceFactory()
    response = admin_client_api.delete(f'/rest/api/Customer/{invoice.customer.pk}/')
    assert response.status_code == 409
    assert 'protected' in response.json()['detail']
    assert Customer.objects.filter(pk=invoice.customer.pk).exists()


@pytest.mark.django_db
def test_deleting_an_invoice_removes_items_and_unbills_hours(admin_client_api):
    item = InvoiceItemFactory()
    timesheet = TimesheetFactory(customer=item.invoice.customer, invoice=item.invoice)
    response = admin_client_api.delete(f'/rest/api/Invoice/{item.invoice.pk}/')
    assert response.status_code == 204
    assert not InvoiceItem.objects.filter(pk=item.pk).exists()
    timesheet.refresh_from_db()
    assert timesheet.invoice is None


@pytest.mark.django_db
def test_filter_timesheets_by_customer(admin_client_api):
    mine = TimesheetFactory()
    TimesheetFactory()
    response = admin_client_api.get(f'/rest/api/Timesheet/?customer={mine.customer.pk}')
    assert [row['id'] for row in response.json()] == [mine.pk]


@pytest.mark.django_db
def test_demo_data_loads():
    call_command('loaddata', 'demo', verbosity=0)
    assert Customer.objects.count() == 3
    assert Invoice.objects.get(number='2025-0001').total == Decimal('1657.70')
    assert Timesheet.objects.filter(invoice__isnull=True).count() == 2
