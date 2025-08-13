import logging
import inspect


logger = logging.getLogger(__name__)


def model_is_abstract(cls):
    dir_cls = dir(cls)
    Meta = None
    is_abstract = False
    if 'Meta' in dir_cls:
        Meta = inspect.getattr_static(cls, 'Meta')
    if hasattr(cls, '_meta') and cls._meta and cls._meta.abstract:
        is_abstract = True
    return is_abstract
