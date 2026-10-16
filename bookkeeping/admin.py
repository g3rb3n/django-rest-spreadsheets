from django.contrib import admin

from .models import Customer, Invoice, InvoiceItem, Timesheet


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'hourly_rate', 'active']
    search_fields = ['name', 'email']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['number', 'customer', 'date', 'due_date', 'status', 'total']
    list_filter = ['status']
    inlines = [InvoiceItemInline]


@admin.register(InvoiceItem)
class InvoiceItemAdmin(admin.ModelAdmin):
    list_display = ['invoice', 'description', 'quantity', 'unit_price', 'vat_rate', 'total']


@admin.register(Timesheet)
class TimesheetAdmin(admin.ModelAdmin):
    list_display = ['date', 'customer', 'start_time', 'end_time', 'hours', 'billable', 'invoice']
    list_filter = ['billable', 'customer']
