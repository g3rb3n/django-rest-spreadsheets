import logging

from django.urls import path

from . import views


logger = logging.getLogger(__name__)


def register(router, views):
    for key in views.generated:
        logger.info('Urls: add %s' % key)
        router.register(key, views.generated[key], basename=key.lower())


# Login/logout for the user menu: path('<prefix>/', include(auth_urlpatterns))
auth_urlpatterns = [
    path('user/', views.user_view, name='spreadsheet-user'),
    path('login/', views.login_view, name='spreadsheet-login'),
    path('logout/', views.logout_view, name='spreadsheet-logout'),
]
