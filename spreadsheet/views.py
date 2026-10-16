import copy
import sys, inspect
import logging

from django.contrib.auth import login as auth_login, logout as auth_logout
from django.contrib.auth.forms import AuthenticationForm
from django.db import models as djmodels
from django.db import models
from django.db.models import ProtectedError, RestrictedError
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_GET, require_POST
from django_filters.rest_framework import DjangoFilterBackend, FilterSet

from rest_framework import exceptions
from rest_framework import status
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework import permissions as permissions
from rest_framework import serializers as rfs

from .schema import generate as generate_schema
from . import util

logger = logging.getLogger(__name__)


def props(cls):
    return {el:cls.__dict__[el] for el in cls.__dict__}


# (name reported in the schema, ViewSet action, HTTP method)
ACTIONS = (
    ('read', 'list', 'GET'),
    ('create', 'create', 'POST'),
    ('update', 'partial_update', 'PATCH'),
    ('delete', 'destroy', 'DELETE'),
)


def allowed_actions(viewset_class, request):
    """
    Which CRUD actions the ViewSet's own permission classes (the project's
    DEFAULT_PERMISSION_CLASSES unless it overrides them) allow the user of
    this request. Checked at model level with has_permission; object level
    permissions are still enforced by the API on each request.
    """
    view = viewset_class()
    view.args, view.kwargs, view.format_kwarg = (), {}, None
    allowed = {}
    for name, action, method in ACTIONS:
        # A copy of the request with another method and the user already
        # authenticated (re-authenticating as POST would trip the CSRF check).
        probe = copy.copy(request._request)
        probe.method = method
        probe_request = Request(probe, authenticators=())
        probe_request.user = request.user
        probe_request.auth = request.auth
        view.request = probe_request
        view.action = action
        try:
            allowed[name] = all(
                permission.has_permission(probe_request, view)
                for permission in view.get_permissions()
            )
        except exceptions.APIException:
            allowed[name] = False
    return allowed


def generate_schema_view(models, views=None):
    """
    With views (the module holding the generated ViewSets) the schema only
    lists the models the user may read, each with the actions it allows.
    """
    # The models are filtered per user below, so the endpoint itself is open.
    @api_view(['GET'])
    @permission_classes([permissions.AllowAny])
    def schema_view(request):
        data = generate_schema(sys.modules[models])
        if views:
            viewsets = sys.modules[views].generated
            for name in list(data):
                if name not in viewsets:
                    continue
                actions = allowed_actions(viewsets[name], request)
                if actions['read']:
                    data[name]['actions'] = actions
                else:
                    del data[name]
        return Response(data)
    return schema_view


def v(model, serializer, order_key=None, base_url=''):
    class ViewSet(viewsets.ModelViewSet):
        if (order_key):
            queryset = model.objects.all().order_by(order_key)
        else:
            queryset = model.objects.all()
        serializer_class = serializer
        filter_backends = [DjangoFilterBackend]
        filterset_fields = filterable_fields(model)

        def _set_field(self, response, field):
            if isinstance(field, rfs.DecimalField):
                response['max_digits'] = field.max_digits
                response['decimal_places'] = field.decimal_places
                response['step'] = round(.1 ** field.decimal_places, field.decimal_places )
            if isinstance(field, djmodels.DecimalField):
                response['max_digits'] = field.max_digits
                response['decimal_places'] = field.decimal_places
                response['step'] = round(.1 ** field.decimal_places, field.decimal_places )
            if isinstance(field, djmodels.ForeignKey):
                response['type'] = 'reference'
                response['model'] = field.related_model.__name__
                response['relation'] = field_to_relation_string(field)
                response['url'] = base_url + field.related_model.__name__ + '/'

        def _set_fields(self, response):
            serializer = self.serializer_class

            for key, value in props(serializer).items():
                logger.debug('ViewSet._set_fields %s' % key)
                if isinstance(value, rfs.Field):
                    logger.debug('ViewSet._set_fields %s' % key)
            for key in serializer._declared_fields:
                field = serializer._declared_fields[key]
                self._set_field(response[key], field)
            model = serializer.__dict__['Meta'].model
            for field in model._meta.fields:
                key = field.name
                if not key in response:
                    continue
                self._set_field(response[key], field)

        def options(self, request, format=None, pk=None):
            logger.debug('ViewSet.options')
            response = super().options(request, format, pk=pk).data
            #logger.debug(dir(response))
            # 'actions' is only present when the user may write.
            actions = response.get('actions', {})
            if 'POST' in actions:
                self._set_fields(actions['POST'])
            if 'PUT' in actions:
                self._set_fields(actions['PUT'])
            return Response(response)

        def destroy(self, request, *args, **kwargs):
            try:
                return super().destroy(request, *args, **kwargs)
            except (ProtectedError, RestrictedError) as error:
                # on_delete=PROTECT/RESTRICT blocks the cascade.
                return Response({'detail': error.args[0]}, status=status.HTTP_409_CONFLICT)
    return ViewSet


def filterable_fields(model):
    """
    The model's own columns that django-filter can match exactly. Only
    these are accepted as query parameters (?place=bed, ?variety=3), so
    no lookups (__startswith) or joins through relations.
    """
    names = []
    for field in model._meta.concrete_fields:
        filter_class, _ = FilterSet.filter_for_lookup(field, 'exact')
        if filter_class is not None:
            names.append(field.name)
    return names


def field_to_relation_string(field):
    if field.one_to_one:
        return 'one_to_one'
    if field.one_to_many:
        return 'one_to_many'
    if field.many_to_many:
        return 'many_to_many'
    if field.many_to_one:
        return 'many_to_one'
    return 'none'


def generate(models_module, serializers_module, views_module, base_url):
    generated = {}
    model_classes = inspect.getmembers(models_module, inspect.isclass)
    #serializers_classes = inspect.getmembers(serializers_module, inspect.isclass)
    #view_classes = inspect.getmembers(views_module, inspect.isclass)
    for name, cls in model_classes:
        logger.debug(name)
        is_model = issubclass(cls, models.Model)
        logger.debug('model %s is model %s' % (name, is_model))
        if not is_model:
            continue
        is_abstract = util.model_is_abstract(cls)
        logger.debug('model %s is abstract %s' % (name, is_abstract))
        if is_abstract:
            continue
        logger.info('generated %s' % name)
        generated[name] = v(cls, serializers_module.generated[name], None, base_url)
    return generated

def user_info(user):
    """
    What the user menu shows. Works with custom user models: the name falls
    back from the full name to the USERNAME_FIELD value.
    """
    if not user.is_authenticated:
        return {'authenticated': False, 'name': '', 'username': '', 'initial': ''}
    name = getattr(user, 'get_full_name', lambda: '')() or ''
    name = name.strip() or user.get_username()
    return {
        'authenticated': True,
        'name': name,
        'username': user.get_username(),
        'initial': name[:1].upper(),
    }


def auth_response(request, status=200):
    # Login rotates the CSRF token; the page needs the new one to keep writing.
    return JsonResponse({'user': user_info(request.user), 'csrfToken': get_token(request)}, status=status)


@require_GET
def user_view(request):
    return auth_response(request)


@sensitive_post_parameters('password')
@require_POST
def login_view(request):
    """
    Log in through the project's own authentication backends and user model,
    with Django's validation and messages (inactive users, wrong password).
    """
    form = AuthenticationForm(request, data=request.POST)
    if not form.is_valid():
        errors = {
            'non_field_errors' if key == '__all__' else key: [error['message'] for error in field_errors]
            for key, field_errors in form.errors.get_json_data().items()
        }
        return JsonResponse(errors, status=400)
    auth_login(request, form.get_user())
    return auth_response(request)


@require_POST
def logout_view(request):
    auth_logout(request)
    return auth_response(request)


@ensure_csrf_cookie
def index(request):
    auth = {
        'user': user_info(request.user),
        # The label of the project's USERNAME_FIELD, e.g. "Email address".
        'usernameLabel': str(AuthenticationForm().fields['username'].label),
    }
    return render(request, "index.html", {'spreadsheet_auth': auth})
