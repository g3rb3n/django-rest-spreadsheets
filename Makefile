include config.mk

test: test-py test-cafe

test-ui:
	pipenv run python -m pytest spreadsheet/tests/ui/ --cov=spreadsheet --cov-report=html

test-backend:
	pipenv run python -m pytest spreadsheet/tests/api/ --cov=spreadsheet --cov-report=html

test-py:
	pipenv run python -m pytest spreadsheet/tests/ --cov=spreadsheet --cov-report=html

test-cafe:
	npx testcafe "chrome" spreadsheet/testcafe/test_create.js

run:
	pipenv run python ./manage.py runserver

run-background:
	pipenv run python ./manage.py runserver &

setup:
	pipenv --python 3.9
	pipenv install
	pipenv run python ./manage.py makemigrations testproject
	pipenv run python ./manage.py migrate
	DJANGO_SUPERUSER_USERNAME=$(DJANGO_SUPERUSER_USERNAME) \
	DJANGO_SUPERUSER_EMAIL=$(DJANGO_SUPERUSER_EMAIL) \
	DJANGO_SUPERUSER_PASSWORD=$(DJANGO_SUPERUSER_PASSWORD) \
	pipenv run python ./manage.py createsuperuser --noinput

setup-dev:
	pipenv install -d
	pipenv run playwright install
	npm install --save-dev testcafe

open-ui:
	xdg-open http://localhost:8000

open-coverage:
	chromium $(CURDIR)/htmlcov/index.html

build-dist:
	pipenv run python -m build --sdist

upload-dist:
	pipenv run python -m twine upload dist/*

upload-dist-test:
	pipenv run python -m twine upload --repository testpypi dist/*

cleanup:
	rm -rf build
	rm -rf dist
	rm -rf django_rest_spreadsheets.egg-info
