"""
Bookkeeping example project: the spreadsheet for customers, invoices,
invoice items and timesheets.
"""
from django.contrib import admin
from django.urls import path, include

from rest_framework import routers

from spreadsheet import urls
from spreadsheet.views import generate_schema_view, index

from bookkeeping import views

router = routers.DefaultRouter()
urls.register(router, views)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('rest/api/', include(router.urls)),
    path('rest/auth/', include(urls.auth_urlpatterns)),
    path('rest/schema/', generate_schema_view('bookkeeping.models', 'bookkeeping.views'), name='schema'),
    path('', index, name='index'),
]
