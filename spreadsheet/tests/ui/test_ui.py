import pytest
from playwright.sync_api import expect, sync_playwright


def open_model(page, model):
    page.click(f'.sheet-tabs [data-class={model}]')
    expect(page.locator(f'.sheet-tabs [data-class={model}]')).to_have_class('active')
    return page.locator(f'table[data-class={model}]')


def row_action(row, action):
    """Pick an action from the row's right-click menu, as in Google Sheets."""
    row.locator('td').nth(1).click(button='right')
    row.page.click(f'.context-menu [data-action={action}]')


def log_in(page, username, password):
    page.click('.avatar-button')
    page.click('.user-menu-panel .menu-action')
    page.fill('dialog [name=username]', username)
    page.fill('dialog [name=password]', password)
    page.click('dialog button.primary')
    expect(page.locator('dialog.auth-dialog')).to_have_count(0)


@pytest.mark.django_db
def test_create(live_server, admin_user):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(live_server.url)

        # Anonymous users may look, not create.
        table = open_model(page, 'Variety')
        expect(table.locator('tr[data-action=create]')).to_have_count(0)

        log_in(page, admin_user.username, 'password')
        expect(page.locator('.avatar-button .avatar')).to_have_text(admin_user.username[0].upper())

        # Logging in reloads the schema and reopens the open table, now with
        # the create row; wait for that instead of racing it.
        new_item = table.locator('tr[data-action=create]')
        expect(new_item).to_have_count(1)
        rows = table.locator('tr.row')
        expect(rows).to_have_count(0)
        new_item.locator('[name=name]').fill('Japanese Wineberry')
        row_action(new_item, 'create')
        expect(rows).to_have_count(1)
        expect(rows.locator('[name=name]')).to_have_value('Japanese Wineberry')

        table = open_model(page, 'Plant')
        rows = table.locator('tr.row')
        expect(rows).to_have_count(0)
        new_item = table.locator('tr[data-action=create]')
        new_item.locator('[name=date_planted]').fill('2025-03-21')
        page.keyboard.press('Escape')  # close the date picker
        new_item.locator('[name=place]').fill('Garden')
        new_item.locator('[name=variety]').select_option(label='Japanese Wineberry')
        # Enter in the new-item row adds it too.
        new_item.locator('[name=place]').press('Enter')
        expect(rows).to_have_count(1)
        expect(rows.locator('[name=place]')).to_have_value('Garden')
        expect(rows.locator('[name=variety] option:checked')).to_have_text('Japanese Wineberry')
        expect(page.locator('.messages .message')).to_have_count(0)

        browser.close()


@pytest.mark.django_db
def test_sort(live_server):
    from testproject.models import Plant, Variety
    raspberry = Variety.objects.create(name='Raspberry')
    blackberry = Variety.objects.create(name='Blackberry')
    # The server orders on -date_planted: A, c, b.
    Plant.objects.create(variety=raspberry, place='b', date_planted='2025-01-01')
    Plant.objects.create(variety=blackberry, place='A', date_planted='2025-03-01')
    Plant.objects.create(variety=raspberry, place='c', date_planted='2025-02-01')

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(live_server.url)

        table = open_model(page, 'Plant')
        places = table.locator('tr.row [name=place]')
        expect(places).to_have_count(3)
        assert [el.input_value() for el in places.all()] == ['A', 'c', 'b']

        place = table.locator('th[data-name=place]')
        place.click()
        expect(place).to_have_attribute('aria-sort', 'ascending')
        assert [el.input_value() for el in places.all()] == ['A', 'b', 'c']
        place.click()
        expect(place).to_have_attribute('aria-sort', 'descending')
        assert [el.input_value() for el in places.all()] == ['c', 'b', 'A']
        place.click()
        expect(place).not_to_have_attribute('aria-sort', 'descending')
        assert [el.input_value() for el in places.all()] == ['A', 'c', 'b']

        # A relation sorts on its label, not its URL.
        table.locator('th[data-name=variety]').click()
        assert [el.input_value() for el in places.all()][0] == 'A'
        assert table.locator('tr.row [name=variety] option:checked').all_text_contents() == \
            ['Blackberry', 'Raspberry', 'Raspberry']

        browser.close()


def saving(page, method):
    """Wait for the page to save, around the action that triggers it."""
    return page.expect_response(lambda response: response.request.method == method)


@pytest.mark.django_db
def test_multi_select(live_server, admin_user):
    from testproject.models import Plant, Variety
    raspberry = Variety.objects.create(name='Raspberry')
    Variety.objects.create(name='Blackberry')
    plant = Plant.objects.create(variety=raspberry, place='Bed', date_planted='2025-01-01')

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(live_server.url)
        log_in(page, admin_user.username, 'password')

        table = open_model(page, 'Plant')
        cell = table.locator('tr.row button.multi-select')
        expect(cell).to_have_count(1)
        expect(cell.locator('.chip')).to_have_count(0)

        # Pick two; they save when the checklist closes.
        cell.click()
        menu = page.locator('.multi-select-menu')
        menu.get_by_text('Raspberry').click()
        menu.get_by_text('Blackberry').click()
        expect(cell.locator('.chip')).to_have_text(['Blackberry', 'Raspberry'])
        with saving(page, 'PATCH') as response:
            page.keyboard.press('Enter')
        expect(menu).to_have_count(0)
        assert len(response.value.json()['companions']) == 2

        # Escape puts the selection back without saving.
        cell.click()
        menu.get_by_text('Raspberry').click()
        expect(cell.locator('.chip')).to_have_text(['Blackberry'])
        page.keyboard.press('Escape')
        expect(cell.locator('.chip')).to_have_text(['Blackberry', 'Raspberry'])

        # Unchecking all of them, then clicking elsewhere, saves none.
        cell.click()
        menu.get_by_text('Raspberry').click()
        menu.get_by_text('Blackberry').click()
        with saving(page, 'PATCH') as response:
            page.locator('header').click()
        expect(menu).to_have_count(0)
        expect(cell.locator('.chip')).to_have_count(0)
        assert response.value.json()['companions'] == []

        # The new-item row takes them too.
        new_item = table.locator('tr[data-action=create]')
        new_item.locator('[name=date_planted]').fill('2025-03-21')
        page.keyboard.press('Escape')  # close the date picker
        new_item.locator('[name=place]').fill('Garden')
        new_item.locator('[name=variety]').select_option(label='Raspberry')
        new_item.locator('button.multi-select').click()
        menu.get_by_text('Blackberry').click()
        page.keyboard.press('Enter')
        new_item.locator('[name=place]').press('Enter')
        expect(table.locator('tr.row')).to_have_count(2)
        expect(table.locator('tr.row', has=page.locator('[name=place][value=Garden]'))
               .locator('.chip')).to_have_text(['Blackberry'])
        expect(page.locator('.messages .message')).to_have_count(0)

        browser.close()

    assert not plant.companions.exists()
    garden = Plant.objects.get(place='Garden')
    assert list(garden.companions.values_list('name', flat=True)) == ['Blackberry']
