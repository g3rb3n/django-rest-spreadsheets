import factory
from testproject.models import Plant, Variety

class VarietyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Variety

    name = "Japanese wineberry"


class PlantFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Plant

    variety = factory.SubFactory(VarietyFactory)
    date_planted = '2025-03-21'
    place = "Garden"
