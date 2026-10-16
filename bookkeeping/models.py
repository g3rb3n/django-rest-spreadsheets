from decimal import Decimal

from django.db import models
from django.utils.translation import gettext_lazy as _


NAME_LENGTH = 100
MONEY = {'max_digits': 10, 'decimal_places': 2}


class Customer(models.Model):
    name = models.CharField(max_length=NAME_LENGTH, verbose_name=_('Name'))
    email = models.EmailField(blank=True, verbose_name=_('Email'))
    phone = models.CharField(max_length=30, blank=True, verbose_name=_('Phone'))
    address = models.TextField(blank=True, verbose_name=_('Address'))
    vat_number = models.CharField(max_length=20, blank=True, verbose_name=_('VAT number'))
    hourly_rate = models.DecimalField(default=Decimal('0.00'), verbose_name=_('Hourly rate'), **MONEY)
    active = models.BooleanField(default=True, verbose_name=_('Active'))

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Invoice(models.Model):
    DRAFT = 'draft'
    SENT = 'sent'
    PAID = 'paid'
    STATUS_CHOICES = [
        (DRAFT, _('Draft')),
        (SENT, _('Sent')),
        (PAID, _('Paid')),
    ]

    number = models.CharField(max_length=20, unique=True, verbose_name=_('Number'))
    # Invoices are part of the books: a customer with invoices can't be deleted.
    customer = models.ForeignKey(Customer, related_name='invoices', on_delete=models.PROTECT, verbose_name=_('Customer'))
    date = models.DateField(verbose_name=_('Date'))
    due_date = models.DateField(verbose_name=_('Due date'))
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=DRAFT, verbose_name=_('Status'))
    notes = models.TextField(blank=True, verbose_name=_('Notes'))

    class Meta:
        ordering = ['-date', '-number']

    def __str__(self):
        return self.number

    @property
    def total(self):
        return sum((item.total for item in self.items.all()), Decimal('0.00'))


class InvoiceItem(models.Model):
    VAT_RATES = [
        (0, '0%'),
        (9, '9%'),
        (21, '21%'),
    ]

    invoice = models.ForeignKey(Invoice, related_name='items', on_delete=models.CASCADE, verbose_name=_('Invoice'))
    description = models.CharField(max_length=NAME_LENGTH, verbose_name=_('Description'))
    quantity = models.DecimalField(default=Decimal('1.00'), verbose_name=_('Quantity'), **MONEY)
    unit_price = models.DecimalField(verbose_name=_('Unit price'), **MONEY)
    vat_rate = models.IntegerField(choices=VAT_RATES, default=21, verbose_name=_('VAT rate'))

    class Meta:
        ordering = ['invoice', 'id']
        verbose_name = _('invoice item')

    def __str__(self):
        return f'{self.invoice} {self.description}'

    @property
    def total(self):
        """Including VAT."""
        net = self.quantity * self.unit_price
        return (net * (100 + self.vat_rate) / 100).quantize(Decimal('0.01'))


class Timesheet(models.Model):
    customer = models.ForeignKey(Customer, related_name='timesheets', on_delete=models.PROTECT, verbose_name=_('Customer'))
    date = models.DateField(verbose_name=_('Date'))
    start_time = models.TimeField(verbose_name=_('Start'))
    end_time = models.TimeField(verbose_name=_('End'))
    description = models.CharField(max_length=NAME_LENGTH, verbose_name=_('Description'))
    billable = models.BooleanField(default=True, verbose_name=_('Billable'))
    # Deleting an invoice keeps the hours, they just become unbilled again.
    invoice = models.ForeignKey(
        Invoice, related_name='timesheets', on_delete=models.SET_NULL, null=True, blank=True, verbose_name=_('Invoice'))

    class Meta:
        ordering = ['-date', '-start_time']

    def __str__(self):
        return f'{self.date} {self.customer}'

    @property
    def hours(self):
        start = self.start_time.hour * 60 + self.start_time.minute
        end = self.end_time.hour * 60 + self.end_time.minute
        return Decimal(end - start) / 60
