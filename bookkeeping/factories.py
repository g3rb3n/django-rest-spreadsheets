from decimal import Decimal

import factory

from bookkeeping.models import Customer, Invoice, InvoiceItem, Timesheet


class CustomerFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Customer

    name = factory.Sequence(lambda n: f'Customer {n}')
    email = factory.LazyAttribute(lambda customer: f'{customer.name.lower().replace(" ", ".")}@example.com')
    hourly_rate = Decimal('85.00')


class InvoiceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Invoice

    number = factory.Sequence(lambda n: f'2025-{n:04d}')
    customer = factory.SubFactory(CustomerFactory)
    date = '2025-03-01'
    due_date = '2025-03-31'


class InvoiceItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = InvoiceItem

    invoice = factory.SubFactory(InvoiceFactory)
    description = 'Consultancy'
    quantity = Decimal('8.00')
    unit_price = Decimal('85.00')


class TimesheetFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Timesheet

    customer = factory.SubFactory(CustomerFactory)
    date = '2025-03-03'
    start_time = '09:00'
    end_time = '17:00'
    description = 'Consultancy'
