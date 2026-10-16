import django
import inspect
import logging
import sys

from django.db.models.fields import AutoFieldMixin
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
    if getattr(field, 'primary_key', False):
        schema['isKey'] = True
        # The database or a default fills it in; otherwise it is entered
        # on create (a natural key).
        schema['generated'] = isinstance(field, AutoFieldMixin) or field.has_default()
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
        # flatchoices: no blank entry, option groups flattened, in the order
        # the model defines (e.g. Draft, Sent, Paid). A list of {const, title}
        # keeps the value types and that order in JSON.
        schema['type'] = 'oneOf'
        schema['oneOf'] = [{'const': value, 'title': title} for value, title in field.flatchoices]
    if data_type == 'string':
        schema['length'] = field.max_length
    if data_type == 'number' and field.get_internal_type() == 'FloatField':
        schema['step'] = 'any'
    if data_type == 'number' and field.get_internal_type() == 'DecimalField':
        # One unit in the last decimal place, e.g. 0.01 for money.
        schema['step'] = f'{10 ** -field.decimal_places:.{field.decimal_places}f}'
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


FIELD_TYPES = {
    'CharField': 'string',
    'SlugField': 'string',
    'UUIDField': 'string',
    'GenericIPAddressField': 'string',
    'FilePathField': 'string',
    'DurationField': 'string',
    'TextField': 'text',
    'BooleanField': 'boolean',
    'IntegerField': 'integer',
    'SmallIntegerField': 'integer',
    'BigIntegerField': 'integer',
    'PositiveIntegerField': 'integer',
    'PositiveSmallIntegerField': 'integer',
    'PositiveBigIntegerField': 'integer',
    'AutoField': 'integer',
    'SmallAutoField': 'integer',
    'BigAutoField': 'integer',
    'DecimalField': 'number',
    'FloatField': 'number',
    'DateTimeField': 'datetime',
    'DateField': 'date',
    'TimeField': 'time',
    'ForeignKey': 'object',
    'OneToOneField': 'object',
    'ManyToManyField': 'many',
    'OneToOneRel': 'object',
    'OneToManyRel': 'object',
    'ManyToOneRel': 'object',
    'ManyToManyRel': 'object',
}


def get_type(field):
    t = field.get_internal_type()
    if t in FIELD_TYPES:
        return FIELD_TYPES[t]
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
