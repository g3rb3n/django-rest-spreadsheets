from django.db import models
from django.utils.translation import gettext_lazy as _


NAME_LENGTH = 50


class Variety(models.Model):
    name = models.CharField(max_length=NAME_LENGTH, verbose_name=_('Name'))

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name}'


class Plant(models.Model):
    variety = models.ForeignKey(Variety, related_name='plants', on_delete=models.CASCADE)
    date_planted = models.DateField(verbose_name=_('Date planted'))
    place = models.CharField(max_length=NAME_LENGTH, verbose_name=_('Place'))

    class Meta:
        ordering = ['-date_planted']

    def __str__(self):
        return f'{self.variety} {self.place} {self.date_planted}'

