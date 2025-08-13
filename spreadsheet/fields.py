import logging

from django.utils.translation import gettext_lazy as _
from django.urls import NoReverseMatch, Resolver404, get_script_prefix, resolve
from django.utils.encoding import uri_to_iri
from rest_framework import relations
from rest_framework.reverse import reverse
from urllib.parse import urlparse


logger = logging.getLogger(__name__)


class Ref(str):
    """
    A string like object that additionally has an associated name.
    We use this for hyperlinked URLs that may render as a named link
    in some contexts, or render as a plain URL in others.
    """
    def __new__(self, url, obj):
        ret = super().__new__(self, url)
        ret.obj = obj
        return ret

    def __getnewargs__(self):
        return(str(self), self.name,)

    @property
    def name(self):
        # This ensures that we only called `__str__` lazily,
        # as in some cases calling __str__ on a model instances *might*
        # involve a database lookup.
        return str(self.obj)

    is_hyperlink = True


class RefRelatedField(relations.RelatedField):
    lookup_field = 'pk'
    view_name = None

    default_error_messages = {
        'required': _('This field is required.'),
        'no_match': _('Invalid hyperlink - No URL match.'),
        'incorrect_match': _('Invalid hyperlink - Incorrect URL match.'),
        'does_not_exist': _('Invalid hyperlink - Object does not exist.'),
        'incorrect_type': _('Incorrect type. Expected URL string, received {data_type}.'),
    }

    def __init__(self, view_name=None, **kwargs):
        assert view_name is not None, 'The `view_name` argument is required.'
        self.view_name = view_name
        self.lookup_field = kwargs.pop('lookup_field', self.lookup_field)
        self.lookup_url_kwarg = kwargs.pop('lookup_url_kwarg', self.lookup_field)
        self.format = kwargs.pop('format', None)

        # We include this simply for dependency injection in tests.
        # We can't add it as a class attributes or it would expect an
        # implicit `self` argument to be passed.
        self.reverse = reverse

        super(RefRelatedField, self).__init__(**kwargs)

    def use_pk_only_optimization(self):
        return False
        #return self.lookup_field == 'pk'

    def get_object(self, view_name, view_args, view_kwargs):
        """
        Return the object corresponding to a matched URL.

        Takes the matched URL conf arguments, and should return an
        object instance, or raise an `ObjectDoesNotExist` exception.
        """
        lookup_value = view_kwargs[self.lookup_url_kwarg]
        lookup_kwargs = {self.lookup_field: lookup_value}
        return self.get_queryset().get(**lookup_kwargs)

    def get_url(self, obj, view_name, request, format):
        """
        Given an object, return the URL that hyperlinks to the object.

        May raise a `NoReverseMatch` if the `view_name` and `lookup_field`
        attributes are not configured to correctly match the URL conf.
        """
        # Unsaved objects will not yet have a valid URL.
        if hasattr(obj, 'pk') and obj.pk in (None, ''):
            return None

        lookup_value = getattr(obj, self.lookup_field)
        kwargs = {self.lookup_url_kwarg: lookup_value}
        return self.reverse(view_name, kwargs=kwargs, request=request, format=format)

    def to_internal_value(self, data):
        request = self.context.get('request', None)
        try:
            http_prefix = data.startswith(('http:', 'https:'))
        except AttributeError:
            self.fail('incorrect_type', data_type=type(data).__name__)

        if http_prefix:
            # If needed convert absolute URLs to relative path
            data = urlparse(data).path
            prefix = get_script_prefix()
            if data.startswith(prefix):
                data = '/' + data[len(prefix):]

        data = uri_to_iri(data)

        try:
            match = resolve(data)
        except Resolver404:
            self.fail('no_match')

        try:
            expected_viewname = request.versioning_scheme.get_versioned_viewname(
                self.view_name, request
            )
        except AttributeError:
            expected_viewname = self.view_name

        if match.view_name != expected_viewname:
            self.fail('incorrect_match')

        try:
            return self.get_object(match.view_name, match.args, match.kwargs)
        except (ObjectDoesNotExist, TypeError, ValueError):
            self.fail('does_not_exist')

    def to_representation(self, value):
        assert 'request' in self.context, (
            "`%s` requires the request in the serializer"
            " context. Add `context={'request': request}` when instantiating "
            "the serializer." % self.__class__.__name__
        )

        request = self.context['request']
        format = self.context.get('format', None)

        # By default use whatever format is given for the current context
        # unless the target is a different type to the source.
        #
        # Eg. Consider a HyperlinkedIdentityField pointing from a json
        # representation to an html property of that representation...
        #
        # '/snippets/1/' should link to '/snippets/1/highlight/'
        # ...but...
        # '/snippets/1/.json' should link to '/snippets/1/highlight/.html'
        if format and self.format and self.format != format:
            format = self.format

        # Return the hyperlink, or error if incorrectly configured.
        try:
            url = self.get_url(value, self.view_name, request, format)
            logger.debug(url)
            logger.debug(value)
        except NoReverseMatch:
            msg = (
                'Could not resolve URL for hyperlinked relationship using '
                'view name "%s". You may have failed to include the related '
                'model in your API, or incorrectly configured the '
                '`lookup_field` attribute on this field.'
            )
            if value in ('', None):
                value_string = {'': 'the empty string', None: 'None'}[value]
                msg += (
                    " WARNING: The value of the field on the model instance "
                    "was %s, which may be why it didn't match any "
                    "entries in your URL conf." % value_string
                )
            raise ImproperlyConfigured(msg % self.view_name)

        if url is None:
            return None

        return Ref(url, value)


class RefIdentityField(RefRelatedField):
    """
    A read-only field that represents the identity URL for an object, itself.

    This is in contrast to `HyperlinkedRelatedField` which represents the
    URL of relationships to other objects.
    """

    def __init__(self, view_name=None, **kwargs):
        assert view_name is not None, 'The `view_name` argument is required.'
        kwargs['read_only'] = True
        kwargs['source'] = '*'
        super().__init__(view_name, **kwargs)

    def use_pk_only_optimization(self):
        # We have the complete object instance already. We don't need
        # to run the 'only get the pk for this relationship' code.
        return False
