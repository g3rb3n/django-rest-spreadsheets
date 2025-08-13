import logging


logger = logging.getLogger(__name__)


def register(router, views):
    for key in views.generated:
        logger.info('Urls: add %s' % key)
        router.register(key, views.generated[key], basename=key.lower())
