import setuptools

with open("README.md", "r") as fh:
    long_description = fh.read()

setuptools.setup(
    name="django-rest-spreadsheets",
    version="1.0.0",
    author="gerben van Eerten",
    author_email="info@gerbenvaneerten.nl",
    description="Spreadsheets based on django rest framework",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/g3rb3n/django-rest-spreadsheets/",
    packages=setuptools.find_packages(exclude=['testproject*']),
    package_data={'django-rest-spreadsheets': ['spreadsheet/static', 'spreadsheet/templates', 'spreadsheet/migrations']},
    include_package_data=True,

    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)