import sys, inspect
import logging

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework import fields as rffields
from rest_framework.reverse import reverse
from rest_framework.utils.field_mapping import (
    get_nested_relation_kwargs,
    get_relation_kwargs, get_url_kwargs
)

from .fields import *


logger = logging.getLogger(__name__)


class RefModelSerializer(serializers.ModelSerializer):
    """
    A type of `ModelSerializer` that uses hyperlinked relationships instead
    of primary key relationships. Specifically:

    * A 'url' field is included instead of the 'id' field.
    * Relationships to other instances are hyperlinks, instead of primary keys.
    """
    #setattr(serializers.ModelSerializer, 'serializer_url_field', RefRelatedField)
    serializer_related_field = RefRelatedField
    meta_serializer_field = RefRelatedField
    meta_serializer_identity_field = RefIdentityField
    meta_field_name = '_'

    def build_meta_field(self, field_name, model_class):
        """
        Create a field representing the object's own URL.
        """
        #field_class = self.serializer_url_field
        field_class = self.meta_serializer_identity_field
        field_kwargs = get_url_kwargs(model_class)

        return field_class, field_kwargs

    def build_relational_field(self, field_name, relation_info):
        """
        Create fields for forward and reverse relationships.
        """
        field_class = self.serializer_related_field
        field_kwargs = get_relation_kwargs(field_name, relation_info)

        to_field = field_kwargs.pop('to_field', None)
        if to_field and not relation_info.reverse and not relation_info.related_model._meta.get_field(to_field).primary_key:
            field_kwargs['slug_field'] = to_field
            field_class = self.serializer_related_to_field

        # `view_name` is only valid for hyperlinked relationships.
        if not issubclass(field_class, RefRelatedField):
            field_kwargs.pop('view_name', None)

        return field_class, field_kwargs

    def to_representation(self, instance):
        representation = super().to_representation(instance);
        representation['_str'] = str(instance)
        #representation['_'] = {
        #    'url': '',
        #    'id': instance.pk,
        #    'string': str(instance)
        #}
        #RefRelatedField().to_representation(instance)
        return representation

    def build_field(self, field_name, info, model_class, nested_depth):
        """
        Return a two tuple of (cls, kwargs) to build a serializer field with.
        """
        if field_name == '_':
            return self.build_meta_field(field_name, model_class)
        if field_name == '_str':
            return rffields.CharField, {'read_only': True}
        return super().build_field(field_name, info, model_class, nested_depth)

    def get_fields(self):
        fields = super().get_fields()
        logger.debug('get_fields')
        logger.debug(fields)
        return fields

    def get_default_field_names(self, declared_fields, model_info):
        """
        Return the default list of field names that will be used if the
        `Meta.fields` option is not specified.
        """
        logger.debug('get_default_field_names')
        logger.debug(model_info)
        return (
            ['_'] +
            ['_str'] +
            list(declared_fields) +
            list(model_info.fields) +
            list(model_info.forward_relations) +
            list(model_info.reverse_relations)
        )

    def build_nested_field(self, field_name, relation_info, nested_depth):
        """
        Create nested fields for forward and reverse relationships.
        """
        class NestedSerializer(RefModelSerializer):
            class Meta:
                model = relation_info.related_model
                depth = nested_depth - 1
                fields = '__all__'

        field_class = NestedSerializer
        field_kwargs = get_nested_relation_kwargs(relation_info)

        return field_class, field_kwargs


def s(m):
    class Serializer(RefModelSerializer):
        class Meta:
            model = m
            exclude = ()

    return Serializer


def generate(models_module, serializers_module):
    generated = {}
    model_classes = inspect.getmembers(models_module, inspect.isclass)
    #serializer_module = sys.modules[__name__]
    serializer_classes = dir(serializers_module)
    for name, cls in model_classes:
        logger.debug('Serializers: generate %s' % name)
        if name + 'Serializer' in serializer_classes:
            logger.info('already defined %s' % name)
            generated[name] = getattr(serializers_module, name + 'Serializer')
        else:
            logger.info('generate %s' % name)
            generated[name] = s(cls)
    return generated
