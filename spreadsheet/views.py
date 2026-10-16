import sys, inspect
import logging

from django.db import models as djmodels
from django.db import models
from django.db.models import ProtectedError, RestrictedError
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django_filters.rest_framework import DjangoFilterBackend, FilterSet

from rest_framework import status
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework import permissions as permissions
from rest_framework import serializers as rfs

from .schema import generate as generate_schema
from . import util

logger = logging.getLogger(__name__)


def props(cls):
    return {el:cls.__dict__[el] for el in cls.__dict__}


def schema_view(request):
    data = generate_schema()
    return JsonResponse(data)


def generate_schema_view(models):
    def schema_view(request):
        data = generate_schema(sys.modules[models])
        return JsonResponse(data)
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
            if 'POST' in response['actions']:
                self._set_fields(response['actions']['POST'])
            if 'PUT' in response['actions']:
                self._set_fields(response['actions']['PUT'])
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

@ensure_csrf_cookie 
def index(request):
    host = request.get_host()
    return render(request, "index.html", {"host": host})
