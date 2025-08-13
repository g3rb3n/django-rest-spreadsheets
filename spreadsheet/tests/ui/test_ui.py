import pytest
import time
from playwright.sync_api import sync_playwright


@pytest.mark.django_db
def test_create(live_server):
    url = live_server.url
    print(url)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        # Go to the Django login page
        page.goto(url)

        page.hover('.menu-item')
        page.click('.models [data-class=Variety]')
        page.hover('header > img')
        page.fill('[name=name]', 'Japanese Wineberry')
        tr = page.locator('tr')
        count_before = tr.count()
        button = page.locator('button[data-action=create]')
        button.click()
        count_after = tr.count()
        assert count_after - count_before == 1

        page.hover('.menu-item')
        page.click('.models [data-class="Plant"]')
        page.hover('header > img')
        page.fill('[name=date_planted]', '2025-03-21')
        page.fill('[name=place]', 'Garden')
        select = page.locator('[name=variety]')
        select.select_option('/rest/api/variety/1/')
        #page.click('[name=variety]')
        #page.click('[value="/rest/api/variety/1/"]')
        count_before = tr.count()
        page.click('button[data-action=create]')
        count_after = tr.count()

        assert count_after - count_before == 1

        browser.close()