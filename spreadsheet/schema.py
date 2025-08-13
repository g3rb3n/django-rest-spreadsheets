import django
import inspect
import logging
import sys

from collections import OrderedDict
from rest_framework import serializers
from rest_framework import fields as rffields

from . import util


logger = logging.getLogger(__name__)


def generate_field_schema(field):
    data_type = get_type(field)
    schema = {
        'name': field.name,
        'type': data_type
    }
    if field.name == 'id':
        schema['isKey'] = True
    if isinstance(field, django.db.models.fields.Field):
        schema['title'] = field.verbose_name
    if isinstance(field, django.db.models.fields.related.ForeignKey):
        schema['$ref'] = field.related_model.__name__
        schema['count'] = field.related_model.objects.count()
        schema['multiple'] = False
    if isinstance(field, django.db.models.fields.related.ManyToManyField):
        schema['$ref'] = field.related_model.__name__
        schema['multiple'] = True
    if isinstance(field, django.db.models.fields.reverse_related.ForeignObjectRel):
        if (field.remote_field.name[-4:] == '_ptr'):
            return None
        schema['$ref'] = field.related_model.__name__
        schema['multiple'] = field.multiple
        schema['title'] = field.related_model._meta.verbose_name_plural
        schema['lookup'] = field.remote_field.name
    if hasattr(field, 'blank'):
        schema['required'] = not field.blank
    if hasattr(field, 'choices') and field.choices:
        sorted_choices = sorted(field.get_choices(), key=lambda tup: tup[1])
        schema['type'] = 'oneOf'
        schema['oneOf'] = OrderedDict(sorted_choices)
    if data_type == 'string':
        schema['length'] = field.max_length
    return schema


def generate_model_schema(model_class):
    name = model_class.__name__
    model_schema = {
        '$schema': 'http://json-schema.org/draft-06/schema#',
        'title': name,
        'description': name,
        'type': 'object',
        'properties': {}
    }
    fields = model_class._meta.get_fields()
    required = []
    order = []
    for field in fields:
        if field.name[-4:] == '_ptr':
            continue
        field_schema = generate_field_schema(field)
        if not field_schema:
            continue
        order.append(field.name)
        model_schema['properties'][field.name] = field_schema
    model_schema['fields'] = order
    return model_schema


def get_type(field):
    t = field.get_internal_type()
    if t == 'CharField': return 'string'
    if t == 'BooleanField': return 'boolean'
    if t == 'IntegerField': return 'integer'
    if t == 'DecimalField': return 'number'
    if t == 'DateTimeField': return 'datetime'
    if t == 'DateField': return 'date'
    if t == 'TimeField': return 'time'
    if t == 'AutoField': return 'integer'
    if t == 'ForeignKey': return 'object'
    if t == 'OneToOneField': return 'object'
    if t == 'ManyToManyField': return 'many'
    if t == 'OneToOneRel': return 'object'
    if t == 'OneToManyRel': return 'object'
    if t == 'ManyToOneRel': return 'object'
    if t == 'ManyToManyRel': return 'object'
    logger.error('Unsupported field in get_type %s for %s', t, field)
    return t


def get_django_models(module):
    classes = inspect.getmembers(module, inspect.isclass)
    models = {}
    for name, cls in classes:
        mro = inspect.getmro(cls)
        if django.db.models.base.Model in mro:
            models[name] = cls
    return models


def generate(models_module):
    schema = {}
    schema['$schema'] = 'http://json-schema.org/draft-06/schema#'
    title = ''
    model_classes = get_django_models(models_module)
    for name, model_class in model_classes.items():
        if util.model_is_abstract(model_class):
            continue
        logger.info('Schema: generate %s' % name)
        schema[name] = generate_model_schema(model_class)
    return schema
